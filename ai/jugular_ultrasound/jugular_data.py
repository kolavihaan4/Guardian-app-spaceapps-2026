"""Jugular plan steps 1-3: download SegThy, audit it, cut transverse slices at a fixed physical scale.

Research use only. SegThy is CC BY 4.0 (Kroenke et al., PLOS ONE 2022, doi:10.1371/journal.pone.0268550).
Data comes from the pinned, checksum-verified MedOtter mirror (third-party redistribution) of the
manual ultrasound annotations. Raw data is kept outside the git repository (see JUGULAR_ROOT).

Labels in the source masks: 0 background, 1 thyroid, 2 left carotid, 3 left jugular, 4 right carotid,
5 right jugular. Here they become 0 background, 1 thyroid, 2 carotid, 3 jugular vein; the neck side is
kept as metadata.
"""
import hashlib
import json
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(os.environ.get("JUGULAR_ROOT") or ("/kaggle/working/jugular_work" if Path("/kaggle/working").exists() else "/content/jugular_work" if Path("/content").exists() else r"C:\Users\nikhi\Downloads\jugular_work"))
RAW = ROOT / "raw"
PROC = ROOT / "processed"
REV = "318d0e04578419d2976a093f9873f14b782f253d"
HF = f"https://huggingface.co/datasets/MedOtter/SegThy/resolve/{REV}/"
SPACING = 0.25          # mm per pixel after resampling
STRIDE = 4              # keep every 4th transverse plane of the 0.12 mm volume (about 0.5 mm apart)
AXIS = 2                # transverse (axial) axis; checked by audit() against the header and the vessel shapes
REMAP = np.array([0, 1, 2, 3, 2, 3], dtype="uint8")
CLASSES = ("background", "thyroid", "carotid", "vein")
THYROID, CAROTID, VEIN = 1, 2, 3


def _get(url, tries=5, stream=False):
    import requests

    for k in range(tries):
        try:
            r = requests.get(url, timeout=180, stream=stream)
            r.raise_for_status()
            return r
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(3 * (k + 1))


def _sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _fetch(rel, sha):
    path = RAW / rel
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        with _get(HF + rel, stream=True) as r, open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
        tmp.replace(path)
    if _sha(path) != sha:
        path.unlink()
        raise ValueError(f"checksum mismatch, file removed: {rel}")
    return path


def download():
    """Fetch the metadata and every manually annotated ultrasound volume, verifying SHA-256."""
    RAW.mkdir(parents=True, exist_ok=True)
    meta_path = RAW / "us_train.jsonl"
    if not meta_path.exists():
        meta_path.write_bytes(_get(HF + "us_train.jsonl").content)
    meta = [json.loads(x) for x in meta_path.read_text().splitlines() if x.strip()]
    jobs = [(r[k], r[k + "_sha256"]) for r in meta for k in ("image", "mask")]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, _ in enumerate(pool.map(lambda j: _fetch(*j), jobs)):
            if i % 8 == 0:
                print("downloaded files:", i + 1, "of", len(jobs), flush=True)
    print("volumes:", len(meta), "subjects:", len({r["subject_id"] for r in meta}))
    return meta


def _elongation(mask2d):
    """Long axis / short axis of a binary region from its second moments (1 = round)."""
    ys, xs = np.nonzero(mask2d)
    if len(ys) < 20:
        return None
    c = np.cov(np.vstack([ys, xs]))
    e = np.sort(np.linalg.eigvalsh(c))
    return float(np.sqrt(e[1] / max(e[0], 1e-9)))


def audit():
    """Check files, labels and alignment, and confirm which axis gives transverse vessel cross-sections.

    A vessel cut across its length is a compact round or oval region; cut along its length it is a long
    strip. For every axis the median elongation of the jugular and carotid regions is measured; the
    transverse axis must be the one with the roundest cross-sections and must match the NIfTI
    orientation codes (the axis labelled S or I, since neck vessels run head to foot).
    """
    import nibabel as nib

    meta = [json.loads(x) for x in (RAW / "us_train.jsonl").read_text().splitlines() if x.strip()]
    problems = defaultdict(list)
    elong = {a: [] for a in range(3)}
    header_axes = []
    volumes = []
    for r in meta:
        ni, nm = nib.load(str(RAW / r["image"])), nib.load(str(RAW / r["mask"]))
        y = np.asarray(nm.dataobj)
        if ni.shape != nm.shape or y.ndim != 3:
            problems["shape_mismatch"].append(r["case_id"]); continue
        if not np.allclose(ni.affine, nm.affine, atol=1e-3):
            problems["affine_mismatch"].append(r["case_id"])
        values = sorted(int(v) for v in np.unique(y))
        if not set(values) <= {0, 1, 2, 3, 4, 5}:
            problems["unexpected_labels"].append(r["case_id"]); continue
        side_ok = set(values) <= ({0, 1, 2, 3} if r["side"] == "left" else {0, 1, 4, 5})
        if not side_ok:
            problems["labels_do_not_match_side"].append(r["case_id"])
        has_vein = bool(np.isin(y, [3, 5]).any())
        if r.get("annotation_gap") or not has_vein:
            problems["vein_not_annotated_excluded"].append(r["case_id"])
        codes = nib.aff2axcodes(ni.affine)
        header_axes.append([i for i, c in enumerate(codes) if c in "SI"][0])
        zooms = [float(z) for z in ni.header.get_zooms()[:3]]
        if has_vein:
            vessel = np.isin(y, [2, 3, 4, 5])
            for a in range(3):
                idx = np.nonzero(vessel.any(axis=tuple(k for k in range(3) if k != a)))[0]
                for z in idx[:: max(len(idx) // 12, 1)]:
                    sl = np.take(y, z, axis=a)
                    for lab in ((2, 4), (3, 5)):
                        e = _elongation(np.isin(sl, lab))
                        if e is not None:
                            elong[a].append(e)
        volumes.append(dict(case=r["case_id"], subject=r["subject_id"], side=r["side"], shape=list(y.shape), spacing_mm=zooms,
                            axcodes="".join(codes), labels=values, usable=bool(has_vein and not r.get("annotation_gap"))))
        print("audited", r["case_id"], y.shape, zooms, "".join(codes), values, flush=True)
    med = {a: float(np.median(v)) for a, v in elong.items() if v}
    roundest = min(med, key=med.get)
    out = dict(
        source=HF, license="CC BY 4.0; cite Kroenke et al., PLOS ONE 2022; MedOtter mirror is a third-party redistribution",
        volumes=len(volumes), usable_volumes=sum(v["usable"] for v in volumes), subjects=len({v["subject"] for v in volumes}),
        usable_subjects=len({v["subject"] for v in volumes if v["usable"]}),
        median_vessel_elongation_by_axis=med, roundest_axis=roundest, header_head_foot_axis=sorted(set(header_axes)),
        transverse_axis_confirmed=bool(roundest == AXIS and set(header_axes) == {AXIS}),
        problems=dict(problems), per_volume=volumes)
    (ROOT / "audit.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: v for k, v in out.items() if k != "per_volume"}, indent=2))
    assert out["transverse_axis_confirmed"], "axis check failed: do not train until this is resolved"
    return out


def resample(a, shape, nearest):
    from PIL import Image

    return np.asarray(Image.fromarray(a).resize((shape[1], shape[0]), Image.Resampling.NEAREST if nearest else Image.Resampling.BILINEAR))


def preprocess():
    """Write one file per volume: every STRIDE-th transverse slice at SPACING mm per pixel.

    Each slice is transposed and flipped so rows run from the skin (top, as on a scanner screen) to
    deep tissue and columns run across the neck. In these volumes the skin is at the high end of
    axis 1 in all 31 scans (checked from brightness and vessel depth), whatever the header code says.
    Images stay uint8; brightness scaling happens at load time. Reference
    areas are counted on the ORIGINAL 0.12 mm mask so resampling error is part of the measured error.
    """
    import nibabel as nib

    audit_ = json.loads((ROOT / "audit.json").read_text())
    assert audit_["transverse_axis_confirmed"]
    PROC.mkdir(exist_ok=True)
    manifest = []
    for v in audit_["per_volume"]:
        if not v["usable"]:
            continue
        ni, nm = nib.load(str(RAW / f"us/train/images/{v['case']}.nii.gz")), nib.load(str(RAW / f"us/train/masks/{v['case']}.nii.gz"))
        x, y = np.asarray(ni.dataobj), REMAP[np.asarray(nm.dataobj)]
        assert x.dtype == np.uint8, x.dtype
        sp = v["spacing_mm"]
        assert abs(sp[0] - sp[1]) < 1e-6
        shape = (int(round(x.shape[1] * sp[1] / SPACING)), int(round(x.shape[0] * sp[0] / SPACING)))
        imgs, masks, zs, ref = [], [], [], []
        for z in range(0, x.shape[AXIS], STRIDE):
            a, b = x[:, :, z].T[::-1], y[:, :, z].T[::-1]
            imgs.append(resample(np.ascontiguousarray(a), shape, False))
            masks.append(resample(np.ascontiguousarray(b), shape, True))
            zs.append(z)
            ref.append([float((b == k).sum() * sp[0] * sp[1]) for k in (1, 2, 3)])
        out = PROC / f"{v['case']}.npz"
        np.savez_compressed(out, image=np.stack(imgs), mask=np.stack(masks), z=np.array(zs), ref_area_mm2=np.array(ref, dtype="float32"))
        m = np.stack(masks)
        manifest.append(dict(case=v["case"], subject=v["subject"], side=v["side"], path=str(out), slices=len(zs), shape=list(shape),
                             spacing_mm=SPACING, source_spacing_mm=sp, slice_gap_mm=sp[2] * STRIDE,
                             vein_slices=int((m == VEIN).any(axis=(1, 2)).sum()), carotid_slices=int((m == CAROTID).any(axis=(1, 2)).sum())))
        print("preprocessed", v["case"], shape, "slices", len(zs), "with vein", manifest[-1]["vein_slices"], flush=True)
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    subjects = sorted({r["subject"] for r in manifest})
    print(json.dumps(dict(volumes=len(manifest), subjects=len(subjects), slices=sum(r["slices"] for r in manifest),
                          vein_slices=sum(r["vein_slices"] for r in manifest))))
    return manifest


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    if "download" in sys.argv:
        download()
    if "audit" in sys.argv:
        audit()
    if "preprocess" in sys.argv:
        preprocess()
