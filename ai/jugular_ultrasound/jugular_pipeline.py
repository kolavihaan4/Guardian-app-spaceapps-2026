"""Jugular plan steps 4-6: subject-grouped cross-validation of a small U-Net, then measurement checks.

Stages (cached on disk, resumable at every epoch):
  cv     : 4 folds by subject. Each fold trains on 12 subjects (2 of them choose the checkpoint)
           and predicts the 4 held-out subjects exactly once.
  report : per-subject Dice, area error against the manual outline, artery/vein confusion, speed,
           and the plan's acceptance targets.

Rules enforced in code:
  * both neck sides of a subject are always in the same fold
  * checkpoint-selection subjects come from inside the training subjects, never the held-out fold
  * held-out predictions use images only; manual masks are read only to score them
Research baseline on 16 healthy volunteers. No astronaut, flow, clot or clinical validation.
"""
import argparse
import hashlib
import json
import math
import os
import platform
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from jugular_data import CAROTID, CLASSES, ROOT, SPACING, THYROID, VEIN
from jugular_geometry import largest_region, measure_frame, quality

F = nn.functional
DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SMOKE = bool(os.environ.get("JUGULAR_SMOKE"))
RUN = ROOT / ("run_smoke" if SMOKE else os.environ.get("JUGULAR_RUN", "run_gpu" if DEV.type == "cuda" else "run_local"))
FITS = RUN / "fits"
SEED = 42
CFG = dict(
    model="unet24-48-96-192-gn", classes=len(CLASSES), crop=224, spacing_mm=SPACING,
    epochs=1 if SMOKE else int(os.environ.get("JUGULAR_EPOCHS", 60)),
    # train_stride 1 uses every preprocessed slice (0.5 mm apart); 2 uses every other one (CPU budget)
    train_stride=int(os.environ.get("JUGULAR_TRAIN_STRIDE", 1)),
    batch=12, lr=3e-4, weight_decay=1e-4, opt="adamw+cosine", loss="ce+softdice", folds=4, stop_subjects=2, empty_cap=0.20,
    aug=dict(flip=0.5, rot_deg=20, scale=(0.7, 1.5), shift=0.08, elastic=0.03, gamma=0.25, contrast=0.25, brightness=0.10,
             speckle=0.15, blur_p=0.25, wedge_p=0.30, wedge_width=0.25),
    seed=SEED)
TARGETS = dict(mean_vein_dice=0.85, min_subject_vein_dice=0.70, median_area_error=0.10, area_bias=0.05, artery_as_vein=0.02, seconds_per_frame=1.0)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def hms(sec):
    sec = int(max(sec, 0))
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


# ----------------------------------------------------------------------------- data
class Data:
    def __init__(self):
        self.manifest = json.loads((ROOT / "manifest.json").read_text())
        self.vols = {}
        for r in self.manifest:
            with np.load(r["path"]) as d:
                img, mask = d["image"], d["mask"]
                lo, hi = np.percentile(img.reshape(len(img), -1), [1, 99], axis=1)
                self.vols[r["case"]] = dict(image=img, mask=mask, ref=d["ref_area_mm2"], z=d["z"], lo=lo.astype("float32"),
                                            hi=hi.astype("float32"), has_vein=(mask == VEIN).any(axis=(1, 2)), subject=r["subject"], side=r["side"])
        self.subjects = sorted({r["subject"] for r in self.manifest})
        self.cases = {s: [r["case"] for r in self.manifest if r["subject"] == s] for s in self.subjects}

    def image(self, case, i):
        v = self.vols[case]
        return np.clip((v["image"][i].astype("float32") - v["lo"][i]) / max(float(v["hi"][i] - v["lo"][i]), 1e-6), 0, 1)

    def samples(self, subjects, stride=1):
        vein, empty = [], []
        for s in subjects:
            for c in self.cases[s]:
                hv = self.vols[c]["has_vein"]
                for i in range(0, len(hv), stride):
                    (vein if hv[i] else empty).append((c, i))
        return vein, empty


def normalise(a):
    lo, hi = np.percentile(a, [1, 99])
    return np.clip((a.astype("float32") - lo) / max(float(hi - lo), 1e-6), 0, 1)


def make_folds(subjects):
    s = list(subjects)
    random.Random(SEED).shuffle(s)
    n = CFG["folds"]
    folds = []
    for k in range(n):
        held = sorted(s[k::n])
        rest = [x for x in s if x not in held]
        stop = sorted(rest[-CFG["stop_subjects"]:]) if k % 2 == 0 else sorted(rest[:CFG["stop_subjects"]])
        train = sorted(x for x in rest if x not in stop)
        assert not set(held) & set(train) and not set(held) & set(stop) and not set(train) & set(stop)
        folds.append(dict(fold=k, train=train, stop=stop, held_out=held))
    assert sorted(x for f in folds for x in f["held_out"]) == sorted(s), "every subject is held out exactly once"
    return folds


# ----------------------------------------------------------------------------- model
def block(a, b):
    return nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.GroupNorm(8, b), nn.ReLU(), nn.Conv2d(b, b, 3, padding=1), nn.GroupNorm(8, b), nn.ReLU())


class UNet(nn.Module):
    """Four resolution levels, 24/48/96/192 channels, about 1.1 million parameters."""

    def __init__(self, n=len(CLASSES)):
        super().__init__()
        self.a = block(1, 24); self.b = block(24, 48); self.c = block(48, 96); self.d = block(96, 192)
        self.e = block(288, 96); self.f = block(144, 48); self.g = block(72, 24); self.head = nn.Conv2d(24, n, 1)

    def forward(self, x):
        a = self.a(x); b = self.b(F.max_pool2d(a, 2)); c = self.c(F.max_pool2d(b, 2)); d = self.d(F.max_pool2d(c, 2))
        up = lambda t, ref: F.interpolate(t, size=ref.shape[-2:], mode="bilinear", align_corners=False)
        e = self.e(torch.cat([up(d, c), c], 1)); f = self.f(torch.cat([up(e, b), b], 1)); g = self.g(torch.cat([up(f, a), a], 1))
        return self.head(g)


def seg_loss(logits, y):
    n = logits.shape[1]
    p = logits.float().softmax(1)
    t = F.one_hot(y, n).permute(0, 3, 1, 2).float()
    dice = (2 * (p * t).sum((0, 2, 3)) + 1e-5) / (p.sum((0, 2, 3)) + t.sum((0, 2, 3)) + 1e-5)
    return F.cross_entropy(logits.float(), y) + 1 - dice[1:].mean()


def augment(x, y, gen):
    """x: B,1,H,W in 0..1; y: B,H,W. Geometry is applied to image and mask together, brightness to the image only."""
    A = CFG["aug"]
    B, _, H, W = x.shape
    r = lambda *shape: torch.rand(*shape, generator=gen, device=x.device)
    ang = (r(B) * 2 - 1) * math.radians(A["rot_deg"])
    lo, hi = A["scale"]
    zoom = torch.exp(math.log(lo) + r(B) * (math.log(hi) - math.log(lo)))
    flip = torch.where(r(B) < A["flip"], -1.0, 1.0)
    cos, sin = torch.cos(ang) / zoom, torch.sin(ang) / zoom
    theta = torch.stack([torch.stack([cos * flip, -sin, (r(B) * 2 - 1) * A["shift"]], 1), torch.stack([sin * flip, cos, (r(B) * 2 - 1) * A["shift"]], 1)], 1)
    grid = F.affine_grid(theta, (B, 1, H, W), align_corners=False)
    disp = (torch.rand(B, 2, 7, 7, generator=gen, device=x.device) * 2 - 1) * A["elastic"]
    grid = grid + F.interpolate(disp, size=(H, W), mode="bicubic", align_corners=False).permute(0, 2, 3, 1)
    x = F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
    y = F.grid_sample(y[:, None].float(), grid, mode="nearest", padding_mode="zeros", align_corners=False)[:, 0].long()
    v = lambda: r(B)[:, None, None, None]
    x = x.clamp(0, 1) ** torch.exp((v() * 2 - 1) * A["gamma"])
    x = (x - 0.5) * (1 + (v() * 2 - 1) * A["contrast"]) + 0.5 + (v() * 2 - 1) * A["brightness"]
    speckle = 1 + A["speckle"] * torch.randn(x.shape, generator=gen, device=x.device)
    x = torch.where(v() < 0.5, x * speckle, x)
    x = torch.where(v() < A["blur_p"], F.avg_pool2d(x, 3, stride=1, padding=1), x)
    # dark wedge: a band of columns loses brightness below a random depth (acoustic shadow / lost skin contact)
    cols = torch.arange(W, device=x.device)[None, None, None, :] / W
    rows = torch.arange(H, device=x.device)[None, None, :, None] / H
    c0, width, depth = v(), v() * A["wedge_width"], v() * 0.6
    shadow = (cols >= c0) & (cols < c0 + width) & (rows >= depth) & (v() < A["wedge_p"])
    x = torch.where(shadow, x * (0.1 + 0.4 * v()), x)
    return x.clamp(0, 1), y


def crop_batch(D, items, rng, size):
    """Random crop or zero-pad every slice to size x size."""
    X = np.zeros((len(items), 1, size, size), "float32"); Y = np.zeros((len(items), size, size), "int64")
    for k, (c, i) in enumerate(items):
        a, b = D.image(c, i), D.vols[c]["mask"][i]
        h, w = a.shape
        sy, sx = (int(rng.integers(0, h - size + 1)) if h > size else 0), (int(rng.integers(0, w - size + 1)) if w > size else 0)
        dy, dx = (int(rng.integers(0, size - h + 1)) if h < size else 0), (int(rng.integers(0, size - w + 1)) if w < size else 0)
        ch, cw = min(h, size), min(w, size)
        X[k, 0, dy:dy + ch, dx:dx + cw] = a[sy:sy + ch, sx:sx + cw]
        Y[k, dy:dy + ch, dx:dx + cw] = b[sy:sy + ch, sx:sx + cw]
    return torch.from_numpy(X), torch.from_numpy(Y)


@torch.no_grad()
def predict_probs(models, a, tta=True):
    """a: 2D float image in 0..1 at SPACING mm per pixel. Returns (probabilities, probabilities from the mirrored frame)."""
    h, w = a.shape
    H, W = math.ceil(h / 8) * 8, math.ceil(w / 8) * 8
    x = torch.zeros(1, 1, H, W, device=DEV)
    x[0, 0, :h, :w] = torch.from_numpy(np.ascontiguousarray(a)).to(DEV)
    plain = sum(m(x).float().softmax(1) for m in models) / len(models)
    mirror = None
    if tta:
        mirror = sum(m(x.flip(-1)).float().softmax(1) for m in models).flip(-1) / len(models)
    cut = lambda p: p[0, :, :h, :w].cpu().numpy()
    return cut(plain), (cut(mirror) if tta else None)


def counts(pred, ref):
    return np.array([[((pred == k) & (ref == k)).sum(), (pred == k).sum(), (ref == k).sum()] for k in (THYROID, CAROTID, VEIN)], dtype=np.int64)


def dice_of(c):
    return [float(2 * i / (p + t)) if p + t else None for i, p, t in c]


@torch.no_grad()
def stop_score(model, D, subjects):
    """Mean over the checkpoint-selection subjects of pooled vein Dice (every other slice, no mirroring)."""
    model.eval()
    scores = []
    for s in subjects:
        tot = np.zeros((3, 3), np.int64)
        for c in D.cases[s]:
            for i in range(0, len(D.vols[c]["mask"]), 2):
                p, _ = predict_probs([model], D.image(c, i), tta=False)
                tot += counts(p.argmax(0), D.vols[c]["mask"][i])
        scores.append(dice_of(tot)[2] or 0.0)
    return float(np.mean(scores))


def fit_fold(D, f):
    key = hashlib.sha256(json.dumps([CFG, f], sort_keys=True).encode()).hexdigest()[:12]
    final, last = FITS / f"fold{f['fold']}_{key}.pt", FITS / f"fold{f['fold']}_{key}.last.pt"
    if final.exists():
        log(f"fold {f['fold']}: already trained")
        return final
    FITS.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(SEED + f["fold"])
    rng = np.random.default_rng(SEED + f["fold"])
    gen = torch.Generator(device=DEV).manual_seed(SEED + f["fold"])
    model = UNet().to(DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=CFG["lr"], weight_decay=CFG["weight_decay"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, CFG["epochs"])
    scaler = torch.amp.GradScaler(enabled=DEV.type == "cuda")
    vein, empty = D.samples(f["train"], CFG["train_stride"])
    n_empty = min(len(empty), int(len(vein) * CFG["empty_cap"] / (1 - CFG["empty_cap"])))
    start, best, hist = 0, -1.0, []
    if last.exists():
        ck = torch.load(last, map_location=DEV, weights_only=False)
        model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"]); sched.load_state_dict(ck["sched"])
        start, best, hist = ck["epoch"], ck["best"], ck["hist"]
        rng = np.random.default_rng(SEED + f["fold"] + 1000 * start)
        log(f"fold {f['fold']}: resuming after epoch {start}")
    log(f"fold {f['fold']}: train {f['train']} stop {f['stop']} held out {f['held_out']} | {len(vein)} vein slices + {n_empty} empty per epoch on {DEV}")
    t0 = time.time()
    for epoch in range(start, CFG["epochs"]):
        model.train()
        items = vein + [empty[j] for j in rng.choice(len(empty), n_empty, replace=False)]
        order = rng.permutation(len(items))
        if SMOKE:
            order = order[:48]
        total = 0.0
        for b in range(0, len(order), CFG["batch"]):
            x, y = crop_batch(D, [items[j] for j in order[b:b + CFG["batch"]]], rng, CFG["crop"])
            x, y = augment(x.to(DEV), y.to(DEV), gen)
            opt.zero_grad()
            with torch.autocast(DEV.type, enabled=DEV.type == "cuda"):
                loss = seg_loss(model(x), y)
            scaler.scale(loss).backward(); scaler.step(opt); scaler.update()
            total += float(loss) * len(x)
        sched.step()
        score = stop_score(model, D, f["stop"])
        hist.append(dict(epoch=epoch + 1, loss=total / len(order), stop_vein_dice=score))
        if score > best:
            best = score
            torch.save(dict(model=model.state_dict(), cfg=CFG, fold=f, epoch=epoch + 1, stop_vein_dice=score), final.with_suffix(".best.pt"))
        torch.save(dict(model=model.state_dict(), opt=opt.state_dict(), sched=sched.state_dict(), epoch=epoch + 1, best=best, hist=hist), last)
        done = epoch + 1 - start
        log(f"fold {f['fold']} epoch {epoch + 1}/{CFG['epochs']} loss {total / len(order):.4f} stop vein Dice {score:.4f} (best {best:.4f}) | "
            f"about {hms((time.time() - t0) / done * (CFG['epochs'] - epoch - 1))} left in this fold")
    final.with_suffix(".best.pt").replace(final)
    (FITS / f"fold{f['fold']}_{key}.history.json").write_text(json.dumps(hist, indent=1))
    last.unlink(missing_ok=True)
    return final


def load_model(path):
    m = UNet().to(DEV)
    m.load_state_dict(torch.load(path, map_location=DEV, weights_only=False)["model"])
    return m.eval()


def score_fold(D, f, path):
    """Predict the held-out subjects once; keep pooled Dice counts per subject and per-slice areas."""
    out = RUN / f"oof_fold{f['fold']}.json"
    if out.exists():
        return json.loads(out.read_text())
    model = load_model(path)
    subjects, slices = {}, []
    px = SPACING ** 2
    for s in f["held_out"]:
        tot = np.zeros((3, 3), np.int64)
        for c in D.cases[s]:
            v = D.vols[c]
            for i in range(len(v["mask"])):
                p, pm = predict_probs([model], D.image(c, i))
                pred, ref = ((p + pm) / 2).argmax(0), v["mask"][i]
                tot += counts(pred, ref)
                m, mm = measure_frame(pred, SPACING), measure_frame(pm.argmax(0), SPACING)
                slices.append(dict(subject=s, case=c, z=int(v["z"][i]), ref_vein_mm2=float(v["ref"][i][2]), ref_carotid_mm2=float(v["ref"][i][1]),
                                   pred_vein_mm2=m["area_mm2"] or 0.0, pred_vein_raw_mm2=float((pred == VEIN).sum() * px),
                                   vein_on_ref_carotid_px=int(((pred == VEIN) & (ref == CAROTID)).sum()), pred_vein_px=int((pred == VEIN).sum()),
                                   flattening=m["flattening"], accept=quality(m, mm)["accept"]))
        d = dice_of(tot)
        subjects[s] = dict(thyroid_dice=d[0], carotid_dice=d[1], vein_dice=d[2], fold=f["fold"])
        log(f"held-out subject {s}: vein Dice {d[2]:.4f} carotid {d[1]:.4f} thyroid {d[0]:.4f}")
    res = dict(fold=f, model=path.name, subjects=subjects, slices=slices)
    out.write_text(json.dumps(res))
    return res


def stage_cv(only=None):
    D = Data()
    folds = make_folds(D.subjects)
    RUN.mkdir(parents=True, exist_ok=True)
    (RUN / "folds.json").write_text(json.dumps(folds, indent=1))
    (RUN / "run_info.json").write_text(json.dumps(dict(cfg=CFG, device=str(DEV), torch=torch.__version__, platform=platform.platform(),
                                                        volumes=len(D.manifest), subjects=D.subjects), indent=1))
    for f in folds:
        if only is None or f["fold"] in only:
            score_fold(D, f, fit_fold(D, f))


def stage_report():
    folds = json.loads((RUN / "folds.json").read_text())
    done = [json.loads(p.read_text()) for p in sorted(RUN.glob("oof_fold*.json"))]
    subjects = {s: v for r in done for s, v in r["subjects"].items()}
    rows = [x for r in done for x in r["slices"]]
    per = {}
    for s in sorted(subjects):
        mine = [x for x in rows if x["subject"] == s]
        big = [x for x in mine if x["ref_vein_mm2"] > 20]
        err = [abs(x["pred_vein_mm2"] - x["ref_vein_mm2"]) / x["ref_vein_mm2"] for x in big]
        present = [x for x in mine if x["ref_vein_mm2"] >= 3]
        absent = [x for x in mine if x["ref_vein_mm2"] == 0]
        per[s] = dict(**subjects[s], slices=len(mine),
                      median_area_error=float(np.median(err)) if err else None,
                      area_bias=float((sum(x["pred_vein_mm2"] for x in big) - sum(x["ref_vein_mm2"] for x in big)) / sum(x["ref_vein_mm2"] for x in big)) if big else None,
                      artery_as_vein=float(sum(x["vein_on_ref_carotid_px"] for x in mine) / max(sum(x["pred_vein_px"] for x in mine), 1)),
                      vein_found_when_present=float(np.mean([x["pred_vein_mm2"] > 0 for x in present])) if present else None,
                      vein_reported_when_absent=float(np.mean([x["pred_vein_mm2"] > 0 for x in absent])) if absent else None,
                      mean_ref_vein_mm2=float(np.mean([x["ref_vein_mm2"] for x in big])) if big else None)
    vd = [v["vein_dice"] for v in per.values() if v["vein_dice"] is not None]
    med = lambda k: float(np.median([v[k] for v in per.values() if v[k] is not None]))
    summary = dict(
        subjects_scored=len(per), subjects_total=sum(len(f["held_out"]) for f in folds), folds_done=sorted(r["fold"]["fold"] for r in done),
        mean_vein_dice=float(np.mean(vd)), min_subject_vein_dice=float(np.min(vd)),
        mean_carotid_dice=float(np.mean([v["carotid_dice"] for v in per.values()])), mean_thyroid_dice=float(np.mean([v["thyroid_dice"] for v in per.values()])),
        median_area_error=med("median_area_error"), area_bias=float(np.mean([v["area_bias"] for v in per.values() if v["area_bias"] is not None])),
        artery_as_vein=float(np.mean([v["artery_as_vein"] for v in per.values()])),
        vein_found_when_present=med("vein_found_when_present"), vein_reported_when_absent=med("vein_reported_when_absent"))
    paths = sorted(p for p in FITS.glob("fold*.pt") if p.name.count(".") == 1)
    if paths:
        models = [load_model(p) for p in paths]
        a = np.random.default_rng(0).random((240, 224)).astype("float32")
        predict_probs(models, a)
        t = time.time()
        for _ in range(5):
            predict_probs(models, a)
        summary.update(seconds_per_frame=(time.time() - t) / 5, speed_device=str(DEV), speed_models=len(models))
    T = TARGETS
    checks = dict(
        mean_vein_dice=summary["mean_vein_dice"] >= T["mean_vein_dice"], min_subject_vein_dice=summary["min_subject_vein_dice"] >= T["min_subject_vein_dice"],
        median_area_error=summary["median_area_error"] <= T["median_area_error"], area_bias=abs(summary["area_bias"]) <= T["area_bias"],
        artery_as_vein=summary["artery_as_vein"] <= T["artery_as_vein"])
    if "seconds_per_frame" in summary:
        checks["seconds_per_frame"] = summary["seconds_per_frame"] <= T["seconds_per_frame"]
    report = dict(summary=summary, targets=T, targets_met=checks, per_subject=per, cfg=CFG, device=str(DEV),
                  limitation="16 healthy volunteers on Earth, reconstructed 3D slices; no astronaut, flow, clot or clinical validation. "
                             "Targets are the plan's own research bars, not clinical standards. Real-probe (NNUS/Mus-V) check not included here.")
    (RUN / "report.json").write_text(json.dumps(report, indent=1))
    pct = lambda v: "n/a" if v is None else f"{100 * v:.1f}%"
    lines = ["| Subject | Fold | Vein Dice | Carotid Dice | Thyroid Dice | Median area error | Area bias | Artery as vein |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for s, v in per.items():
        lines.append(f"| {s} | {v['fold']} | {v['vein_dice']:.3f} | {v['carotid_dice']:.3f} | {v['thyroid_dice']:.3f} | {pct(v['median_area_error'])} | {pct(v['area_bias'])} | {pct(v['artery_as_vein'])} |")
    (RUN / "report.md").write_text("\n".join(lines) + "\n\n" + json.dumps(dict(summary=summary, targets_met=checks), indent=1) + "\n")
    print("\n".join(lines)); print(json.dumps(dict(summary=summary, targets_met=checks), indent=1))
    return report


# ----------------------------------------------------------------------------- use on a new frame
_MODELS = None


def ensemble():
    global _MODELS
    if _MODELS is None:
        paths = sorted(p for p in FITS.glob("fold*.pt") if p.name.count(".") == 1)
        assert paths, f"no trained fold models in {FITS}"
        _MODELS = [load_model(p) for p in paths]
    return _MODELS


def predict_frame(image, spacing_mm=None):
    """image: 2D grayscale array, skin at the top. spacing_mm: mm per pixel, or None if unknown.

    With spacing the frame is resampled to the training scale and area is reported in mm2. Without it the
    frame is used as given and only scale-free outputs are returned.
    """
    from jugular_data import resample

    a = np.asarray(image, dtype="float32")
    assert a.ndim == 2 and np.isfinite(a).all()
    if spacing_mm is not None:
        a = resample(a, (max(int(round(a.shape[0] * spacing_mm / SPACING)), 8), max(int(round(a.shape[1] * spacing_mm / SPACING)), 8)), False)
    p, pm = predict_probs(ensemble(), normalise(a))
    mask = ((p + pm) / 2).argmax(0).astype("uint8")
    sp = SPACING if spacing_mm is not None else None
    m, mm = measure_frame(mask, sp), measure_frame(pm.argmax(0), sp)
    return dict(mask=mask, mask_spacing_mm=sp, measurements=m, quality=quality(m, mm))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("stages", nargs="+", choices=["cv", "report"])
    ap.add_argument("--folds", default=None, help="comma-separated fold numbers; default all")
    args = ap.parse_args()
    torch.set_num_threads(os.cpu_count() or 4)
    if "cv" in args.stages:
        stage_cv(None if args.folds is None else {int(x) for x in args.folds.split(",")})
    if "report" in args.stages:
        stage_report()
