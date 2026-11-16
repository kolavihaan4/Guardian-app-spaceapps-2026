"""CAMUS training pipeline (plan steps 2-8): patient-grouped, leakage-checked.

Stages (each is cached on disk and resumable):
  cv    : outer patient folds. Everything (U-Net, out-of-fold measurement features, inner
          selection among Simpson-only / linear calibration / ridge / RF / gradient boosting /
          SVR, EFNet, training-median) is fitted on the outer-training patients only and
          scored on the untouched outer fold.
  final : select on all development patients, refit, freeze, then evaluate the official 50
          test patients ONCE.

Rules enforced in code:
  * every fit receives patient IDs only; overlap with scoring/test patients is asserted
  * stopping-validation patients always come from inside the current training subset
  * prediction reads images only; reference masks are loaded only by evaluation code
  * test patients can never be passed to a fit function
  * fits are reused only when training IDs, settings and seed are identical (hash key)
Research use only; no clinical or astronaut validation.
"""
import argparse
import hashlib
import json
import math
import os
import platform
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from camus_data import CASES, ROOT, SIZE
from camus_geometry import FEATURES, UNITS, patient_features

F = nn.functional
DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")
RUN = Path(os.environ["CAMUS_RUN_DIR"]) if os.environ.get("CAMUS_RUN_DIR") else ROOT / os.environ.get("CAMUS_RUN", "run_local")
FITS = RUN / "fits"
SEED = 42
PROFILES = {
    # local: CPU-only budget (the plan allows fewer folds). One 3-way patient partition serves as
    #   outer folds AND as cross-fitting groups, so the whole CV needs 6 U-Net fits (+1 final).
    #   Inner selection inside an outer fold reuses that fold's out-of-fold table ("shared_oof").
    # gpu: the plan as written - 5 outer folds, 4 cross-fitting groups, strict inner rebuilds.
    "local": dict(scheme="shared", groups=3, inner="shared_oof"),
    "gpu": dict(scheme="nested", outer=5, groups=4, inner="strict"),
}
if os.environ.get("CAMUS_SMOKE"):
    RUN = ROOT / "run_smoke"; FITS = RUN / "fits"
UCFG = dict(model="unet16-32-64-gn", size=SIZE, epochs=2 if os.environ.get("CAMUS_SMOKE") else int(os.environ.get("CAMUS_UNET_EPOCHS", 25)), batch=12, lr=3e-4, opt="adam",
            loss="ce+softdice", stop_frac=0.10, aug=dict(rot_deg=10, scale=0.10, shift=0.05), seed=SEED)
if int(os.environ.get("CAMUS_UNET_MIN_STEPS", 0)) and not os.environ.get("CAMUS_SMOKE"):
    # Every fit gets at least this many optimizer updates, so U-Nets fitted on smaller patient subsets
    # (feature cross-fitting, inner folds) are trained as thoroughly as the full-size fit.
    UCFG["min_steps"] = int(os.environ["CAMUS_UNET_MIN_STEPS"])
ECFG = dict(model="efnet", epochs=2 if os.environ.get("CAMUS_SMOKE") else 40, batch=16, lr=3e-4, opt="adamw", loss="mse(ef/100)", stop_frac=0.10, seed=SEED)
TIE_TOLERANCE = 0.10  # EF points: a more complex candidate must beat a simpler one by more than this


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ----------------------------------------------------------------------------- live time tracking
PROG = dict(t0=time.time(), total=0, cached=0, done=0)


def hms(sec):
    sec = int(max(sec, 0))
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def plan_fits(splits, profile, stages):
    """Count the U-Net fits this run needs (the slow part) so progress and time left can be shown."""
    keys = set()

    def add(S, groups, inner):
        S = set(S)
        keys.add(key_of(S, UCFG))
        for i, H in enumerate(groups):
            keys.add(key_of(S - set(H), UCFG))
            if inner == "strict":
                for G in groups[i + 1:]:
                    keys.add(key_of(S - set(H) - set(G), UCFG))

    cfg = PROFILES[profile]
    if "cv" in stages:
        for f in splits["outer"]:
            add(f["train"], f["groups"], cfg["inner"])
    if "final" in stages and not (RUN / "metrics_test_benchmark.json").exists():
        add(D.dev, splits["final_groups"], "strict" if cfg["scheme"] == "shared" else cfg["inner"])
    cached = sum((FITS / f"unet_{k}.pt").exists() for k in keys)
    PROG.update(t0=time.time(), total=len(keys), cached=cached, done=0)
    log(f"[time] plan: {len(keys)} U-Net fits in total, {cached} already finished, {len(keys) - cached} to run")


def time_status(frac=0.0, fit_sec=0.0):
    """One status line: elapsed, fits finished, estimated time left. frac = progress of the current fit."""
    elapsed = time.time() - PROG["t0"]
    finished = PROG["cached"] + PROG["done"]
    left = PROG["total"] - finished - frac
    if PROG["done"]:
        per_fit = (elapsed - fit_sec) / PROG["done"]  # wall time per finished fit, measuring steps included
    elif frac > 0:
        per_fit = fit_sec / frac
    else:
        per_fit = None
    remaining = None if per_fit is None else max(left, 0) * per_fit
    text = f"[time] elapsed {hms(elapsed)} | U-Net fits {finished}/{PROG['total']}"
    if frac:
        text += f" (+{frac:.0%} of the next)"
    text += " | time left: " + ("estimating..." if remaining is None else f"about {hms(remaining)}")
    try:
        RUN.mkdir(parents=True, exist_ok=True)
        (RUN / "progress.json").write_text(json.dumps(dict(
            updated=time.strftime("%Y-%m-%d %H:%M:%S"), elapsed_seconds=round(elapsed), fits_finished=finished, fits_total=PROG["total"],
            current_fit_fraction=round(frac, 3), estimated_seconds_left=None if remaining is None else round(remaining))))
    except OSError:
        pass
    return text


# ----------------------------------------------------------------------------- data access
class Data:
    def __init__(self):
        self.manifest = json.loads((ROOT / "manifest.json").read_text())
        self.patients = json.loads((ROOT / "patients.json").read_text())
        self.rows = {}
        for r in self.manifest:
            self.rows.setdefault(r["patient"], {})[f"{r['view']}_{r['phase']}"] = r
        bad = [p for p, c in self.rows.items() if set(c) != set(CASES)]
        assert not bad, f"incomplete patients: {bad[:5]}"
        self.dev = sorted(p for p, v in self.patients.items() if v["split"] in ("train", "val"))
        self.test = sorted(p for p, v in self.patients.items() if v["split"] == "test")
        assert not set(self.dev) & set(self.test)
        self.ef = {p: float(v["ef"]) for p, v in self.patients.items()}
        self._img, self._msk = {}, {}
        # Patients linked by identical image content (found by the audit) always travel together.
        audit = json.loads((ROOT / "audit.json").read_text())
        self.group = {p: p for p in self.patients}
        self.links = []
        for linked in audit["problems"].get("identical_images_across_patients", []):
            root = min(self.group[p] for p in linked)
            for p in linked:
                self.group[p] = root
            self.links += [[linked[0], p] for p in linked[1:]]
        if os.environ.get("CAMUS_SMOKE"):
            keep = set(self.dev[:36] + self.test[:6])
            self.dev, self.test = self.dev[:36], self.test[:6]
            self.links = [l for l in self.links if set(l) <= keep]

    def images(self, pid):
        """Network input only: 4 x 192 x 192 float32 in CASES order. No labels."""
        if pid not in self._img:
            self._img[pid] = np.stack([np.load(self.rows[pid][c]["processed"])["image"] for c in CASES]).astype("float32")
        return self._img[pid]

    def train_masks(self, pid):
        """192 x 192 reference masks: supervision and segmentation scoring only."""
        if pid not in self._msk:
            self._msk[pid] = np.stack([np.load(self.rows[pid][c]["processed"])["mask"] for c in CASES]).astype("int64")
        return self._msk[pid]

    def reference_masks_original(self, pid):
        """Evaluation only."""
        import nibabel as nib
        return {c: np.asarray(nib.load(self.rows[pid][c]["mask"]).dataobj).squeeze() for c in CASES}

    def geometry_meta(self, pid):
        return {c: (tuple(self.rows[pid][c]["shape"]), tuple(self.rows[pid][c]["spacing_mm"])) for c in CASES}


D = None


def disjoint(**sets):
    names = list(sets)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            both = set(sets[a]) & set(sets[b])
            assert not both, f"LEAK: {a} and {b} share {len(both)} patients, e.g. {sorted(both)[:3]}"


def key_of(ids, cfg):
    return hashlib.sha256(json.dumps([sorted(ids), cfg], sort_keys=True).encode()).hexdigest()[:16]


def stop_split(ids, key, frac):
    ids = sorted(ids)
    rng = np.random.default_rng(int(key, 16) % (2 ** 32))
    perm = rng.permutation(len(ids))
    n = max(4, int(round(frac * len(ids))))
    stop = {ids[i] for i in perm[:n]}
    for a, b in D.links:  # a duplicate scan must not sit on both sides of the stopping split
        if (a in stop) != (b in stop):
            stop -= {a, b}
    stop = sorted(stop)
    train = sorted(set(ids) - set(stop))
    disjoint(train=train, stop=stop)
    return train, stop


# ----------------------------------------------------------------------------- models
def block(a, b):
    return nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.GroupNorm(4, b), nn.ReLU(), nn.Conv2d(b, b, 3, padding=1), nn.GroupNorm(4, b), nn.ReLU())


class UNet(nn.Module):
    """Same compact U-Net as the reported baseline notebook."""

    def __init__(self, n=4):
        super().__init__()
        self.a = block(1, 16); self.b = block(16, 32); self.c = block(32, 64)
        self.d = block(96, 32); self.e = block(48, 16); self.head = nn.Conv2d(16, n, 1)

    def forward(self, x):
        a = self.a(x); b = self.b(F.max_pool2d(a, 2)); c = self.c(F.max_pool2d(b, 2))
        d = self.d(torch.cat([F.interpolate(c, size=b.shape[-2:], mode="bilinear", align_corners=False), b], 1))
        return self.head(self.e(torch.cat([F.interpolate(d, size=a.shape[-2:], mode="bilinear", align_corners=False), a], 1)))


class EFNet(nn.Module):
    """Same direct EF regressor as the reported baseline notebook."""

    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(nn.Conv2d(4, 16, 5, stride=2, padding=2), nn.ReLU(), nn.Conv2d(16, 32, 3, stride=2, padding=1), nn.ReLU(),
                                 nn.Conv2d(32, 64, 3, stride=2, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d((4, 4)), nn.Flatten(),
                                 nn.Linear(1024, 64), nn.ReLU(), nn.Linear(64, 1), nn.Sigmoid())

    def forward(self, x):
        return self.net(x).squeeze(1)


def seg_loss(logits, y, n=4):
    p = logits.softmax(1); t = F.one_hot(y, n).permute(0, 3, 1, 2).float()
    dice = (2 * (p * t).sum((0, 2, 3)) + 1e-5) / (p.sum((0, 2, 3)) + t.sum((0, 2, 3)) + 1e-5)
    return F.cross_entropy(logits, y) + 1 - dice[1:].mean()


def augment(x, y, cfg, gen):
    """Paired modest geometric augmentation, training batches only."""
    b = x.shape[0]
    ang = (torch.rand(b, generator=gen) * 2 - 1) * math.radians(cfg["rot_deg"])
    sc = 1 + (torch.rand(b, generator=gen) * 2 - 1) * cfg["scale"]
    sh = (torch.rand(b, 2, generator=gen) * 2 - 1) * cfg["shift"] * 2
    theta = torch.zeros(b, 2, 3)
    theta[:, 0, 0] = torch.cos(ang) / sc; theta[:, 0, 1] = -torch.sin(ang) / sc; theta[:, 0, 2] = sh[:, 0]
    theta[:, 1, 0] = torch.sin(ang) / sc; theta[:, 1, 1] = torch.cos(ang) / sc; theta[:, 1, 2] = sh[:, 1]
    grid = F.affine_grid(theta.to(x.device), list(x.shape), align_corners=False)
    x = F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
    y = F.grid_sample(y[:, None].float(), grid, mode="nearest", padding_mode="zeros", align_corners=False)[:, 0].long()
    return x, y


def dice_counts(pred, ref):
    """pred/ref: [4,H,W] int arrays for one patient -> per-label Dice accumulated over the 4 images."""
    out = []
    for k in (1, 2, 3):
        a, b = pred == k, ref == k
        den = a.sum() + b.sum()
        out.append(float(2 * (a & b).sum() / den) if den else float("nan"))
    return out


@torch.no_grad()
def predict192(model, pids):
    model.eval()
    out = {}
    for i in range(0, len(pids), 6):
        chunk = pids[i:i + 6]
        x = torch.from_numpy(np.concatenate([D.images(p) for p in chunk]))[:, None].to(DEV).contiguous(memory_format=torch.channels_last)
        pred = model(x).argmax(1).cpu().numpy()
        for j, p in enumerate(chunk):
            out[p] = pred[4 * j:4 * j + 4]
    return out


def fit_unet(ids, forbidden=()):
    """Fit the U-Net on `ids` only. Cached by (training IDs, settings, seed)."""
    ids = sorted(ids)
    disjoint(fit=ids, test=D.test)
    disjoint(fit=ids, scoring=forbidden)
    key = key_of(ids, UCFG)
    path = FITS / f"unet_{key}.pt"
    if path.exists():
        return key
    train, stop = stop_split(ids, key, UCFG["stop_frac"])
    disjoint(train=train, stop=stop, scoring=forbidden)
    disjoint(train=train, stop=stop, test=D.test)
    seed = int(key[:8], 16)
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    X = torch.from_numpy(np.concatenate([D.images(p) for p in train]))[:, None].to(DEV)
    Y = torch.from_numpy(np.concatenate([D.train_masks(p) for p in train])).to(DEV)
    model = UNet(4).to(DEV).to(memory_format=torch.channels_last)
    opt = torch.optim.Adam(model.parameters(), lr=UCFG["lr"])
    best, best_state, hist, t0 = -1, None, [], time.time()
    log(f"U-Net {key} [{DEV}]: fit on {len(train)} patients, stopping-validation {len(stop)} (inside training set)")
    epochs = max(UCFG["epochs"], math.ceil(UCFG.get("min_steps", 0) / math.ceil(len(X) / UCFG["batch"])))
    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(X), generator=gen)
        total = 0.0
        for i in range(0, len(perm), UCFG["batch"]):
            idx = perm[i:i + UCFG["batch"]].to(DEV)
            x, y = augment(X[idx], Y[idx], UCFG["aug"], gen)
            x = x.contiguous(memory_format=torch.channels_last)
            opt.zero_grad(set_to_none=True)
            loss = seg_loss(model(x), y)
            loss.backward(); opt.step()
            total += loss.item() * len(idx)
        pred = predict192(model, stop)
        score = float(np.nanmean([dice_counts(pred[p], D.train_masks(p)) for p in stop]))
        hist.append(dict(epoch=epoch + 1, train_loss=total / len(X), stop_dice=score))
        if score > best:
            best, best_state = score, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        if epoch == 0 or (epoch + 1) % 5 == 0 or epoch + 1 == epochs:
            fit_sec = time.time() - t0
            log(f"  U-Net {key} epoch {epoch + 1}/{epochs} loss {total / len(X):.4f} stop-Dice {score:.4f} | this fit {hms(fit_sec)}, "
                f"about {hms(fit_sec / (epoch + 1) * (epochs - epoch - 1))} to go")
            if epoch + 1 < epochs:
                log(time_status((epoch + 1) / epochs, fit_sec))
    FITS.mkdir(parents=True, exist_ok=True)
    torch.save(dict(state_dict=best_state, cfg=UCFG, key=key), path)
    (FITS / f"unet_{key}.json").write_text(json.dumps(dict(
        key=key, cfg=UCFG, epochs_run=epochs, train_patients=train, stop_patients=stop, best_epoch=int(np.argmax([h["stop_dice"] for h in hist]) + 1),
        best_stop_dice=best, history=hist, minutes=(time.time() - t0) / 60), indent=1))
    PROG["done"] += 1
    log(f"U-Net {key} finished in {hms(time.time() - t0)}, best stop-Dice {best:.4f}")
    log(time_status())
    return key


_models = {}


def load_unet(key):
    if key not in _models:
        m = UNet(4)
        m.load_state_dict(torch.load(FITS / f"unet_{key}.pt", map_location="cpu", weights_only=True)["state_dict"])
        _models.clear()
        _models[key] = m.to(DEV).to(memory_format=torch.channels_last).eval()
    return _models[key]


def unet_provenance(key):
    return json.loads((FITS / f"unet_{key}.json").read_text())


def surface_distance_mm(pred, ref, spacing):
    from scipy import ndimage
    if not pred.any() or not ref.any():
        return float("nan")
    ep, er = pred ^ ndimage.binary_erosion(pred), ref ^ ndimage.binary_erosion(ref)
    dp = ndimage.distance_transform_edt(~ep, sampling=spacing)
    dr = ndimage.distance_transform_edt(~er, sampling=spacing)
    return float((dr[ep].mean() + dp[er].mean()) / 2)


@torch.no_grad()
def predict_patients(key, pids, evaluate=False):
    """PREDICT: images -> masks -> physical features. Labels are read only if evaluate=True.

    Cached per (fit, patient). A fit may never predict a patient it was trained or stopped on.
    """
    prov = unet_provenance(key)
    disjoint(predict=pids, fitted_on=prov["train_patients"] + prov["stop_patients"])
    cache_path = FITS / f"pred_{key}{'_eval' if evaluate else ''}.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    todo = [p for p in pids if p not in cache]
    if todo:
        model = load_unet(key)
        t_all = time.time()
        for p in todo:
            t0 = time.time()
            logits = model(torch.from_numpy(D.images(p))[:, None].to(DEV).contiguous(memory_format=torch.channels_last))
            meta = D.geometry_meta(p)
            masks, spac = {}, {}
            for j, c in enumerate(CASES):
                shape, sp = meta[c]
                up = F.interpolate(logits[j:j + 1], size=shape, mode="bilinear", align_corners=False)
                masks[tuple(c.split("_"))] = up.argmax(1)[0].cpu().numpy()
                spac[tuple(c.split("_"))] = sp
            feats, quality = patient_features(masks, spac)
            row = dict(features=feats, quality=quality, seconds=time.time() - t0)
            if evaluate:
                ref = D.reference_masks_original(p)
                rf, rq = patient_features({tuple(c.split("_")): ref[c] for c in CASES}, spac)
                row["dice"] = dice_counts(logits.argmax(1).cpu().numpy(), D.train_masks(p))
                row["lv_surface_mm"] = float(np.nanmean([surface_distance_mm(masks[tuple(c.split("_"))] == 1, ref[c] == 1, meta[c][1]) for c in CASES]))
                row["reference"] = dict(edv_ml=rf["edv_ml"], esv_ml=rf["esv_ml"], simpson_ef=rf["geom_ef"], status=rq["status"])
            cache[p] = row
        cache_path.write_text(json.dumps(cache))
        if len(todo) >= 20:
            log(f"  measured {len(todo)} patients with U-Net {key} in {hms(time.time() - t_all)} | run elapsed {hms(time.time() - PROG['t0'])}")
    return {p: cache[p] for p in pids}


def fit_efnet(ids, forbidden=()):
    ids = sorted(ids)
    disjoint(fit=ids, test=D.test)
    disjoint(fit=ids, scoring=forbidden)
    key = key_of(ids, ECFG)
    path = FITS / f"efnet_{key}.pt"
    if path.exists():
        return key
    train, stop = stop_split(ids, key, ECFG["stop_frac"])
    seed = int(key[:8], 16)
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    X = torch.from_numpy(np.stack([D.images(p) for p in train])).to(DEV); Y = torch.tensor([D.ef[p] / 100 for p in train], dtype=torch.float32).to(DEV)
    Xs = torch.from_numpy(np.stack([D.images(p) for p in stop])).to(DEV); Ys = np.array([D.ef[p] for p in stop])
    model = EFNet().to(DEV); opt = torch.optim.AdamW(model.parameters(), lr=ECFG["lr"])
    best, state, hist = float("inf"), None, []
    for epoch in range(ECFG["epochs"]):
        model.train()
        perm = torch.randperm(len(X), generator=gen)
        for i in range(0, len(perm), ECFG["batch"]):
            idx = perm[i:i + ECFG["batch"]].to(DEV)
            opt.zero_grad(); F.mse_loss(model(X[idx]), Y[idx]).backward(); opt.step()
        model.eval()
        with torch.no_grad():
            mae = float(np.abs(model(Xs).cpu().numpy() * 100 - Ys).mean())
        hist.append(mae)
        if mae < best:
            best, state = mae, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    FITS.mkdir(parents=True, exist_ok=True)
    torch.save(dict(state_dict=state, cfg=ECFG, key=key, input_order=list(CASES)), path)
    (FITS / f"efnet_{key}.json").write_text(json.dumps(dict(key=key, cfg=ECFG, train_patients=train, stop_patients=stop,
                                                            best_epoch=int(np.argmin(hist)) + 1, best_stop_mae=best, history=hist), indent=1))
    log(f"EFNet {key}: {len(train)} patients, best stop MAE {best:.2f} at epoch {int(np.argmin(hist)) + 1}")
    return key


@torch.no_grad()
def predict_efnet(key, pids):
    prov = json.loads((FITS / f"efnet_{key}.json").read_text())
    disjoint(predict=pids, fitted_on=prov["train_patients"] + prov["stop_patients"])
    m = EFNet(); m.load_state_dict(torch.load(FITS / f"efnet_{key}.pt", map_location="cpu", weights_only=True)["state_dict"]); m.to(DEV).eval()
    y = m(torch.from_numpy(np.stack([D.images(p) for p in pids])).to(DEV)).cpu().numpy() * 100
    return {p: float(v) for p, v in zip(pids, y)}


# ----------------------------------------------------------------------------- folds
def group_kfold(pids, n, seed):
    """Patient-level GroupKFold. Linked patients (duplicate scans) share one group label."""
    from sklearn.model_selection import GroupKFold
    pids = np.array(sorted(pids))
    labels = np.array([D.group[p] for p in pids])
    return [sorted(pids[te].tolist()) for _, te in GroupKFold(n_splits=n, shuffle=True, random_state=seed).split(pids, groups=labels)]


def make_folds(profile):
    """Lock patient folds on disk before any model is fitted."""
    path = RUN / "patient_splits.json"
    if path.exists():
        return json.loads(path.read_text())
    cfg = PROFILES[profile]
    dev = set(D.dev)
    if cfg["scheme"] == "shared":
        # One partition P_1..P_G of the development patients. Outer fold k scores P_k; the stack for
        # that fold is built from the other groups, which are also its feature cross-fitting groups.
        parts = group_kfold(D.dev, cfg["groups"], SEED)
        outer = [dict(train=sorted(dev - set(P)), score=P, groups=[Q for Q in parts if Q is not P]) for P in parts]
        final_groups = parts
    else:
        outer = []
        for B in group_kfold(D.dev, cfg["outer"], SEED):
            A = sorted(dev - set(B))
            outer.append(dict(train=A, score=B, groups=group_kfold(A, cfg["groups"], SEED + 1)))
        final_groups = group_kfold(D.dev, cfg["groups"], SEED + 2)
    splits = dict(profile=profile, seed=SEED, development=D.dev, test_locked=D.test, outer=outer, final_groups=final_groups,
                  linked_patients=D.links,
                  note="Official CAMUS train+val (450) are development patients. The official 50 test patients were already "
                       "reported on by the earlier notebook, so they are a previously exposed benchmark, not a fresh test.")
    scored = [p for f in outer for p in f["score"]]
    assert sorted(scored) == D.dev and len(set(scored)) == len(scored)
    for f in outer:
        disjoint(train=f["train"], score=f["score"], test=D.test)
        assert sorted(p for g in f["groups"] for p in g) == f["train"]
        for g in f["groups"] + [f["score"]]:
            for a, b in D.links:
                assert (a in g) == (b in g), "linked patients were separated"
    path.write_text(json.dumps(splits, indent=1))
    return splits


# ----------------------------------------------------------------------------- metrics
def boot_ci(values, fn=np.mean, n=2000):
    v = np.asarray(values, dtype=float)
    rng = np.random.default_rng(SEED)
    return [float(x) for x in np.percentile([fn(rng.choice(v, len(v), replace=True)) for _ in range(n)], [2.5, 97.5])]


def ef_summary(rows, col):
    ok = [r for r in rows if r.get(col) is not None and np.isfinite(r[col])]
    e = np.array([r[col] - r["ef_ref"] for r in ok])
    if not len(e):
        return dict(n=0, rejected=len(rows))
    return dict(n=len(e), rejected=len(rows) - len(e), mae=float(np.abs(e).mean()), mae_ci95=boot_ci(np.abs(e)),
                rmse=float(np.sqrt((e ** 2).mean())), mean_signed_error=float(e.mean()))


def report(rows, methods, title):
    out = dict(title=title, patients=len(rows), ef={m: ef_summary(rows, m) for m in methods})
    common = [r for r in rows if all(r.get(m) is not None and np.isfinite(r[m]) for m in methods)]
    out["ef_same_patients"] = dict(n=len(common), mae={m: float(np.mean([abs(r[m] - r["ef_ref"]) for r in common])) for m in methods})
    if "geometry_ef" in methods:
        out["paired_mae_difference_vs_geometry"] = {}
        for m in methods:
            if m != "geometry_ef":
                d = [abs(r[m] - r["ef_ref"]) - abs(r["geometry_ef"] - r["ef_ref"]) for r in common]
                out["paired_mae_difference_vs_geometry"][m] = dict(mean=float(np.mean(d)), ci95=boot_ci(d))
    if rows and "dice" in rows[0]:
        dice = np.array([r["dice"] for r in rows], dtype=float)
        pm = np.nanmean(dice, axis=1)
        out["segmentation"] = dict(
            patient_mean_dice=float(pm.mean()), patient_mean_dice_ci95=boot_ci(pm),
            record_mean_dice_as_in_earlier_notebook=float(np.nanmean(dice)),
            dice_lv_cavity=float(np.nanmean(dice[:, 0])), dice_myocardium=float(np.nanmean(dice[:, 1])), dice_left_atrium=float(np.nanmean(dice[:, 2])),
            lv_boundary_error_mm=float(np.nanmean([r["lv_surface_mm"] for r in rows])))
        v = [r for r in rows if np.isfinite(r["edv_ml"]) and np.isfinite(r["ref_edv_ml"]) and np.isfinite(r["esv_ml"]) and np.isfinite(r["ref_esv_ml"])]
        out["volumes_vs_simpson_on_expert_contours"] = dict(
            n=len(v), edv_mae_ml=float(np.mean([abs(r["edv_ml"] - r["ref_edv_ml"]) for r in v])), esv_mae_ml=float(np.mean([abs(r["esv_ml"] - r["ref_esv_ml"]) for r in v])),
            edv_bias_ml=float(np.mean([r["edv_ml"] - r["ref_edv_ml"] for r in v])), esv_bias_ml=float(np.mean([r["esv_ml"] - r["ref_esv_ml"] for r in v])),
            note="This CAMUS release ships reference EF only, so volume error is measured against the same Simpson code run on expert contours.")
        out["latency_seconds_per_patient"] = float(np.median([r["seconds"] for r in rows]))
        out["failures"] = dict(rejected=sum(r["status"] != "ok" for r in rows), flagged=sum(bool(r["flags"]) for r in rows))
        sub = {}
        for q in sorted({r["quality_label"] for r in rows}):
            s = [r for r in rows if r["quality_label"] == q]
            sub[q] = dict(n=len(s), **{m: ef_summary(s, m).get("mae") for m in methods}, dice=float(np.nanmean([np.nanmean(r["dice"]) for r in s])))
        out["image_quality_subgroups_reporting_only"] = sub
    if rows and "fold" in rows[0]:
        out["fold_variability_mae"] = {m: [ef_summary([r for r in rows if r["fold"] == k], m).get("mae") for k in sorted({r["fold"] for r in rows})] for m in methods}
    return out


def patient_row(p, pred, extra):
    q2 = D.rows[p]["2CH_ED"]["quality"]; q4 = D.rows[p]["4CH_ED"]["quality"]
    order = ["Good", "Medium", "Poor"]
    worst = max([q for q in (q2, q4) if q in order], key=order.index, default="Unknown")
    f = pred["features"]
    row = dict(patient=p, ef_ref=D.ef[p], geometry_ef=f["geom_ef"] if pred["quality"]["status"] == "ok" else None,
               status=pred["quality"]["status"], flags=pred["quality"]["flags"], edv_ml=f["edv_ml"], esv_ml=f["esv_ml"],
               seconds=pred["seconds"], quality_label=worst)
    if "dice" in pred:
        row.update(dice=pred["dice"], lv_surface_mm=pred["lv_surface_mm"], ref_edv_ml=pred["reference"]["edv_ml"], ref_esv_ml=pred["reference"]["esv_ml"])
    row.update(extra)
    return row


# ----------------------------------------------------------------------------- measurement regressors
GEOM_COL = FEATURES.index("geom_ef")
SIMPLICITY = ["geometry_only", "median", "linear_calibration", "ridge", "random_forest", "gradient_boosting", "svr_rbf"]


def only_geometry_ef(X):
    return X[:, [GEOM_COL]]


def candidates():
    """Fixed, predeclared candidate list, ordered simplest first. At most 8 settings per learned family."""
    from sklearn.model_selection import ParameterSampler
    grids = dict(
        ridge=dict(alpha=[0.1, 1.0, 10.0, 100.0]),
        random_forest=dict(n_estimators=[200, 500], max_depth=[3, 6, None], min_samples_leaf=[3, 5, 10], max_features=[0.5, 1.0]),
        gradient_boosting=dict(n_estimators=[100, 200], learning_rate=[0.03, 0.1], max_depth=[1, 2, 3], min_samples_leaf=[5, 10]),
        svr_rbf=dict(C=[0.1, 1, 10, 100], epsilon=[0.5, 1, 2], gamma=["scale", 0.01, 0.1]))
    out = [dict(family="geometry_only", params={}), dict(family="median", params={}), dict(family="linear_calibration", params={})]
    for fam in SIMPLICITY[3:]:
        grid = grids[fam]
        n = int(np.prod([len(v) for v in grid.values()]))
        for p in ParameterSampler(grid, n_iter=min(8, n), random_state=SEED):
            out.append(dict(family=fam, params=dict(p)))
    return out


def build(c):
    """Every transform lives inside the Pipeline, so it is fitted on the current training rows only."""
    from sklearn.dummy import DummyRegressor
    from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LinearRegression, Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import FunctionTransformer, StandardScaler
    from sklearn.svm import SVR
    imp = SimpleImputer(strategy="median", keep_empty_features=True)
    fam, p = c["family"], c["params"]
    if fam == "median":
        return make_pipeline(imp, DummyRegressor(strategy="median"))
    if fam == "linear_calibration":
        return make_pipeline(FunctionTransformer(only_geometry_ef), imp, LinearRegression())
    if fam == "ridge":
        return make_pipeline(imp, StandardScaler(), Ridge(**p))
    if fam == "svr_rbf":
        return make_pipeline(imp, StandardScaler(), SVR(kernel="rbf", **p))
    if fam == "random_forest":
        return make_pipeline(imp, RandomForestRegressor(random_state=SEED, n_jobs=-1, **p))
    if fam == "gradient_boosting":
        return make_pipeline(imp, GradientBoostingRegressor(random_state=SEED, **p))
    raise ValueError(fam)


def table(pred, pids):
    X = np.array([[np.nan if pred[p]["features"][f] is None else pred[p]["features"][f] for f in FEATURES] for p in pids], dtype=float)
    ok = np.array([pred[p]["quality"]["status"] == "ok" for p in pids])
    return X, ok


def fit_predict(c, Xtr, ytr, Xte, ok_te):
    """Predictions for the scoring rows. Rejected geometry stays NaN, never a made-up EF."""
    if c["family"] == "geometry_only":
        y = Xte[:, GEOM_COL].copy()
    else:
        y = build(c).fit(Xtr, ytr).predict(Xte)
    y = np.asarray(y, dtype=float)
    y[~ok_te] = np.nan
    return y


def oof_table(S, groups):
    """FIT_STACK feature cross-fitting: every patient in S is predicted by a U-Net fitted without them."""
    pred = {}
    for H in groups:
        R = sorted(set(S) - set(H))
        disjoint(fit=R, predicted=H, test=D.test)
        pred.update(predict_patients(fit_unet(R, forbidden=H), H))
    assert sorted(pred) == sorted(S)
    return pred


def choose(cands, scores):
    best = min(scores)
    order = sorted(range(len(cands)), key=lambda i: (SIMPLICITY.index(cands[i]["family"]), i))
    return next((i for i in order if scores[i] <= best + TIE_TOLERANCE), order[0])  # simplest within tolerance


def select_and_fit(S, groups, cands, tag, inner):
    """Choose a candidate using patients in S only, then return cross-fitted training features for S.

    inner="strict" (the plan's rule): inner fold g scores group P_g with a stack built only from
      S - P_g. Training features come from U-Nets fitted on S - P_g - P_h; P_g's features come from
      the U-Net fitted on S - P_g. No feature table is shared between inner folds.
    inner="shared_oof" (CPU compromise): inner folds reuse the one out-of-fold feature table of S.
      Inner-training features were then produced by a U-Net that saw the inner-scoring patients'
      images and masks (never their EF). This can only affect WHICH candidate is chosen; the outer
      score stays clean because outer scoring patients are outside S entirely.
    """
    Z = oof_table(S, groups)
    y = {p: D.ef[p] for p in S}
    inner_pred = {i: [] for i in range(len(cands))}
    truth = []
    for g, J in enumerate(groups):
        I = sorted(set(S) - set(J))
        disjoint(inner_train=I, inner_score=J, test=D.test)
        if inner == "strict":
            rest = [h for k, h in enumerate(groups) if k != g]
            Xtr, _ = table(oof_table(I, rest), I)
            Xte, ok = table(predict_patients(fit_unet(I, forbidden=J), J), J)
        else:
            Xtr, _ = table(Z, I)
            Xte, ok = table(Z, J)
        ytr = np.array([y[p] for p in I])
        truth += [y[p] for p in J]
        for i, c in enumerate(cands):
            inner_pred[i] += list(fit_predict(c, Xtr, ytr, Xte, ok))
    truth = np.array(truth)
    scores = []
    for i in range(len(cands)):
        v = np.array(inner_pred[i]); m = np.isfinite(v)
        scores.append(float(np.abs(v[m] - truth[m]).mean()) if m.any() else float("inf"))
    chosen = choose(cands, scores)
    Xtr, _ = table(Z, sorted(S))
    log(f"  [{tag}] inner selection ({inner}): chose {cands[chosen]} with inner MAE {scores[chosen]:.2f}; best overall {min(scores):.2f}")
    return chosen, scores, Xtr, np.array([y[p] for p in sorted(S)])


def family_best(cands, scores):
    return {fam: min((i for i, c in enumerate(cands) if c["family"] == fam), key=lambda i: scores[i]) for fam in SIMPLICITY}


METHODS = ["selected_ef", "geometry_ef", "linear_calibration_ef", "ridge_ef", "random_forest_ef", "gradient_boosting_ef", "svr_rbf_ef", "efnet_ef", "median_ef"]


def score_set(S, groups, target, cands, tag, inner, extra):
    """Fit everything on S, predict `target` patients (never in S), return per-patient rows."""
    disjoint(fit=S, target=target)
    chosen, scores, Xtr, ytr = select_and_fit(S, groups, cands, tag, inner)
    u = fit_unet(S, forbidden=target)
    pred = predict_patients(u, target, evaluate=True)
    Xte, ok = table(pred, target)
    ysel = fit_predict(cands[chosen], Xtr, ytr, Xte, ok)
    fb = family_best(cands, scores)
    fam_pred = {fam: fit_predict(cands[i], Xtr, ytr, Xte, ok) for fam, i in fb.items()}
    e = fit_efnet(S, forbidden=target)
    direct = predict_efnet(e, target)
    num = lambda v: None if not np.isfinite(v) else float(v)
    rows = []
    for j, p in enumerate(target):
        cols = dict(selected_ef=num(ysel[j]), efnet_ef=direct[p], unet_fit=u, efnet_fit=e, **extra)
        for fam in SIMPLICITY:
            if fam != "geometry_only":
                cols[f"{fam}_ef"] = num(fam_pred[fam][j])
        rows.append(patient_row(p, pred[p], cols))
    sel = dict(chosen=cands[chosen], chosen_inner_mae=scores[chosen], best_setting_per_family={f: dict(candidate=cands[i], inner_mae=scores[i]) for f, i in fb.items()},
               inner_mae_all=[dict(candidate=c, inner_mae=s) for c, s in zip(cands, scores)], inner_mode=inner, **extra)
    return rows, sel, (chosen, Xtr, ytr, u, e)


# ----------------------------------------------------------------------------- stages
def stage_cv(splits, profile):
    cands = candidates()
    (RUN / "candidates.json").write_text(json.dumps(cands, indent=1))
    inner = PROFILES[profile]["inner"]
    rows, sels = [], []
    for k, fold in enumerate(splits["outer"]):
        A, B = fold["train"], fold["score"]
        disjoint(train=A, score=B, test=D.test)
        log(f"=== outer fold {k + 1}/{len(splits['outer'])}: fit on {len(A)} patients, score {len(B)} untouched patients")
        r, sel, _ = score_set(A, fold["groups"], B, cands, f"outer {k + 1}", inner, dict(fold=k + 1))
        rows += r; sels.append(sel)
        (RUN / "outer_predictions.json").write_text(json.dumps(rows, indent=1))
        (RUN / "selection_log.json").write_text(json.dumps(sels, indent=1))
        log("fold MAE: " + json.dumps({m: None if ef_summary(r, m).get("mae") is None else round(ef_summary(r, m)["mae"], 2) for m in METHODS}))
    rep = report(rows, METHODS, f"Outer {len(splits['outer'])}-fold patient CV on {len(D.dev)} development patients; outer folds never used for selection")
    rep["selected_per_fold"] = [s["chosen"] for s in sels]
    rep["inner_selection_mode"] = inner
    (RUN / "metrics_cv.json").write_text(json.dumps(rep, indent=2))
    log(json.dumps(rep, indent=2))
    return rep


def stage_final(splits, profile):
    """Select on all development patients, refit, freeze, then evaluate the 50 official test patients once."""
    out = RUN / "metrics_test_benchmark.json"
    if out.exists():
        log("Test benchmark already evaluated once; not repeating.")
        return json.loads(out.read_text())
    import joblib
    cands = candidates()
    groups = splits["final_groups"]
    inner = "strict" if PROFILES[profile]["scheme"] == "shared" else PROFILES[profile]["inner"]  # shared scheme: strict costs no extra fits
    chosen, scores, Xtr, ytr = select_and_fit(D.dev, groups, cands, "final", inner)
    u = fit_unet(D.dev, forbidden=D.test)
    e = fit_efnet(D.dev, forbidden=D.test)
    final = RUN / "final_model"; final.mkdir(exist_ok=True)
    reg = None if cands[chosen]["family"] == "geometry_only" else build(cands[chosen]).fit(Xtr, ytr)
    joblib.dump(reg, final / "ef_regressor.joblib")
    torch.save(torch.load(FITS / f"unet_{u}.pt", map_location="cpu", weights_only=True), final / "unet.pt")
    torch.save(torch.load(FITS / f"efnet_{e}.pt", map_location="cpu", weights_only=True), final / "efnet.pt")
    frozen = dict(selected=cands[chosen], selected_inner_mae=scores[chosen], inner_mode=inner, unet_fit=u, efnet_fit=e, features=FEATURES, units=UNITS,
                  preprocessing="grayscale, per-image 1st/99th percentile clip to [0,1], bilinear resize to 192x192; masks mapped back to original spacing before measuring",
                  required_input="four frames: 2CH_ED, 2CH_ES, 4CH_ED, 4CH_ES with pixel spacing; no automatic view/phase selection",
                  output_rule="EF from regressor on predicted-mask measurements; rejected with a recorded status when geometry is invalid",
                  frozen_at=time.strftime("%Y-%m-%d %H:%M:%S"))
    (final / "frozen_design.json").write_text(json.dumps(frozen, indent=2))
    log("design frozen; evaluating the 50 official test patients once")
    rows, sel, _ = score_set(D.dev, groups, D.test, cands, "test", inner, {})
    (RUN / "test_predictions.json").write_text(json.dumps(rows, indent=1))
    rep = report(rows, METHODS, "Official 50 CAMUS test patients: previously exposed benchmark, evaluated once by this pipeline after freezing")
    rep["selected"] = sel["chosen"]
    rep["earlier_notebook_on_same_patients"] = dict(dice=0.8658, efnet_mae=8.05, train_mean_baseline_mae=9.36, note="copied from the earlier notebook output, not rerun")
    out.write_text(json.dumps(rep, indent=2))
    log(json.dumps(rep, indent=2))
    return rep


def write_run_files(profile):
    import sklearn
    RUN.mkdir(parents=True, exist_ok=True)
    (RUN / "config.json").write_text(json.dumps(dict(profile=profile, folds=PROFILES[profile], unet=UCFG, efnet=ECFG, seed=SEED, tie_tolerance=TIE_TOLERANCE,
                                                     simplicity_order=SIMPLICITY, selection_score="patient EF mean absolute error (percentage points)"), indent=2))
    (RUN / "environment.json").write_text(json.dumps(dict(python=sys.version, platform=platform.platform(), torch=torch.__version__, numpy=np.__version__,
                                                          sklearn=sklearn.__version__, threads=torch.get_num_threads(), device=str(DEV),
                                                          gpu=torch.cuda.get_device_name(0) if DEV.type == "cuda" else None), indent=2))
    (RUN / "feature_schema.json").write_text(json.dumps(dict(features=FEATURES, units=UNITS, source="predicted masks only; reference masks and EF are never inputs"), indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("stages", nargs="+", choices=["cv", "final"])
    ap.add_argument("--profile", default="local", choices=list(PROFILES))
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args()
    if args.threads:
        torch.set_num_threads(args.threads)
    D = Data()
    write_run_files(args.profile)
    splits = make_folds(args.profile)
    assert splits["profile"] == args.profile, "run folder was created with a different profile"
    plan_fits(splits, args.profile, ["cv", "final"])  # time left always covers both steps
    for s in args.stages:
        t_stage = time.time()
        dict(cv=stage_cv, final=stage_final)[s](splits, args.profile)
        log(f"[time] stage '{s}' finished in {hms(time.time() - t_stage)} | run elapsed {hms(time.time() - PROG['t0'])}")
