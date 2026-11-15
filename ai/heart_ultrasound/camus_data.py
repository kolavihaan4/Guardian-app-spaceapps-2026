"""Step 1-3 of the CAMUS plan: download, audit, lock patient groups, preprocess.

Research use only. CAMUS is CC BY-NC-SA 4.0 (Leclerc et al., IEEE TMI 2019).
Raw data is kept outside the git repository (see CAMUS_ROOT).
"""
import hashlib
import json
import os
import re
import sys
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(os.environ.get("CAMUS_ROOT") or ("/content/camus_work" if Path("/content").exists() else r"C:\Users\nikhi\Downloads\camus_work"))
RAW = ROOT / "raw"
PROC = ROOT / "processed"
API = "https://humanheart-project.creatis.insa-lyon.fr/database/api/v1/"
SPLIT_FOLDER = "66e27d12961576b1bad4e4e1"
PATIENT_FOLDER = "63fde55f73e9f004868fb7ac"
SIZE = 192
VIEWS = ("2CH", "4CH")
PHASES = ("ED", "ES")
CASES = tuple(f"{v}_{p}" for v in VIEWS for p in PHASES)

_local = threading.local()


def _get(url, tries=5):
    import requests

    if not hasattr(_local, "s"):
        _local.s = requests.Session()
    for k in range(tries):
        try:
            r = _local.s.get(url, timeout=120)
            r.raise_for_status()
            return r
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(2 * (k + 1))


def _fetch(item_id, path):
    path = Path(path)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(_get(API + "item/" + item_id + "/download").content)
        tmp.replace(path)
    return path


def download():
    """Download ED/ES images, masks and Info cfg files for every patient."""
    RAW.mkdir(parents=True, exist_ok=True)
    split = {}
    for item in _get(API + f"item?folderId={SPLIT_FOLDER}&limit=100").json():
        if item["name"].startswith("subgroup_"):
            key = {"training": "train", "validation": "val", "testing": "test"}[item["name"][9:-4]]
            text = _fetch(item["_id"], RAW / item["name"]).read_text()
            split[key] = sorted(set(re.findall(r"patient\d+", text)))
    folders = _get(API + f"folder?parentType=folder&parentId={PATIENT_FOLDER}&limit=1000").json()

    def one(folder):
        pid = folder["name"]
        items = {x["name"]: x for x in _get(API + "item?folderId=" + folder["_id"] + "&limit=100").json()}
        wanted = [f"{pid}_{c}{s}" for c in CASES for s in (".nii.gz", "_gt.nii.gz")]
        wanted += [f"Info_{v}.cfg" for v in VIEWS]
        missing = [n for n in wanted if n not in items]
        for n in wanted:
            if n in items:
                _fetch(items[n]["_id"], RAW / pid / n)
        return pid, missing

    missing = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for i, (pid, miss) in enumerate(pool.map(one, folders)):
            if miss:
                missing[pid] = miss
            if i % 50 == 0:
                print("downloaded patients:", i + 1, flush=True)
    (ROOT / "official_split.json").write_text(json.dumps(split, indent=2))
    (ROOT / "download_missing.json").write_text(json.dumps(missing, indent=2))
    print("split sizes:", {k: len(v) for k, v in split.items()}, "patients with missing files:", len(missing))
    return split


def read_cfg(path):
    out = {}
    for line in Path(path).read_text().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def audit_and_preprocess():
    """Build manifest, verify files/labels/alignment, hash for duplicates, write 192x192 arrays.

    Per-image 1st/99th percentile normalisation (no statistic is shared across patients),
    bilinear for images, nearest for masks. Original spacing and shape are kept in the
    manifest so that measurements can be mapped back to physical geometry.
    """
    import nibabel as nib
    from PIL import Image

    split = json.loads((ROOT / "official_split.json").read_text())
    groups = {k: set(v) for k, v in split.items()}
    names = list(groups)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            assert not groups[a] & groups[b], f"patient overlap {a}/{b}"
    all_ids = sorted(set.union(*groups.values()))
    on_disk = sorted(p.name for p in RAW.iterdir() if p.is_dir())
    problems = defaultdict(list)
    if set(on_disk) != set(all_ids):
        problems["id_mismatch"] = sorted(set(on_disk) ^ set(all_ids))
    PROC.mkdir(exist_ok=True)
    manifest, patients, hashes = [], {}, defaultdict(list)
    for pid in all_ids:
        sp = next(k for k, v in groups.items() if pid in v)
        info = {}
        for v in VIEWS:
            p = RAW / pid / f"Info_{v}.cfg"
            if p.exists():
                info[v] = read_cfg(p)
            else:
                problems["missing_cfg"].append(f"{pid}_{v}")
        efs = {v: float(info[v]["EF"]) for v in info if "EF" in info[v]}
        if len(set(efs.values())) > 1:
            problems["ef_disagrees_between_views"].append(pid)
        ef = efs.get("2CH", efs.get("4CH"))
        if ef is None or not 0 < ef < 100:
            problems["bad_ef"].append(pid)
        patients[pid] = dict(split=sp, ef=ef, info=info)
        for case in CASES:
            ip, mp = RAW / pid / f"{pid}_{case}.nii.gz", RAW / pid / f"{pid}_{case}_gt.nii.gz"
            if not ip.exists() or not mp.exists():
                problems["missing_file"].append(f"{pid}_{case}")
                continue
            hi, hm = (hashlib.sha256(p.read_bytes()).hexdigest() for p in (ip, mp))
            ni, nm = nib.load(str(ip)), nib.load(str(mp))
            x, y = np.asarray(ni.dataobj).squeeze(), np.asarray(nm.dataobj).squeeze()
            zooms = [float(z) for z in ni.header.get_zooms()[:2]]
            ok = True
            if x.ndim != 2 or x.shape != y.shape:
                problems["shape_mismatch"].append(f"{pid}_{case}"); ok = False
            if not np.allclose(ni.affine, nm.affine):
                problems["affine_mismatch"].append(f"{pid}_{case}")
            if not (np.isfinite(x).all() and set(np.unique(y)).issubset({0, 1, 2, 3})):
                problems["invalid_values"].append(f"{pid}_{case}"); ok = False
            if ok and not all((y == k).any() for k in (1, 2, 3)):
                problems["mask_missing_structure"].append(f"{pid}_{case}")
            if not ok:
                continue
            pix = hashlib.sha256(np.ascontiguousarray(x).tobytes()).hexdigest()
            hashes[pix].append(pid)
            a = x.astype("float32")
            lo, hi_ = np.percentile(a, [1, 99])
            a = np.clip((a - lo) / max(float(hi_ - lo), 1e-6), 0, 1)
            a = np.asarray(Image.fromarray(a).resize((SIZE, SIZE), Image.Resampling.BILINEAR))
            b = np.asarray(Image.fromarray(y.astype("uint8")).resize((SIZE, SIZE), Image.Resampling.NEAREST))
            out = PROC / f"{pid}_{case}.npz"
            np.savez_compressed(out, image=a, mask=b)
            view, phase = case.split("_")
            manifest.append(dict(
                patient=pid, case=f"{pid}_{case}", view=view, phase=phase, split=sp,
                image=str(ip), mask=str(mp), processed=str(out),
                shape=[int(s) for s in x.shape], spacing_mm=zooms,
                image_sha256=hi, mask_sha256=hm, pixel_sha256=pix,
                quality=info.get(view, {}).get("ImageQuality"), ef=ef))
    dup = {h: sorted(set(p)) for h, p in hashes.items() if len(set(p)) > 1}
    if dup:
        problems["identical_images_across_patients"] = list(dup.values())
    per_patient = defaultdict(int)
    for r in manifest:
        per_patient[r["patient"]] += 1
    incomplete = sorted(p for p in all_ids if per_patient[p] != 4)
    if incomplete:
        problems["incomplete_patients"] = incomplete
    release = hashlib.sha256("".join(sorted(r["image_sha256"] + r["mask_sha256"] for r in manifest)).encode()).hexdigest()
    audit = dict(
        source=API, license="CC BY-NC-SA 4.0, non-commercial research; cite Leclerc et al. IEEE TMI 2019",
        split_sizes={k: len(v) for k, v in split.items()}, patients=len(all_ids), images=len(manifest),
        release_fingerprint_sha256=release, cfg_keys=sorted({k for p in patients.values() for i in p["info"].values() for k in i}),
        problems={k: v for k, v in problems.items()})
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    (ROOT / "patients.json").write_text(json.dumps(patients, indent=1))
    (ROOT / "audit.json").write_text(json.dumps(audit, indent=2))
    with (ROOT / "manifest.csv").open("w") as f:
        cols = ["patient", "case", "view", "phase", "split", "image", "mask", "shape", "spacing_mm", "ef", "quality", "image_sha256", "mask_sha256"]
        f.write(",".join(cols) + "\n")
        for r in manifest:
            f.write(",".join(str(r[c]).replace(",", ";") for c in cols) + "\n")
    print(json.dumps({k: (v if not isinstance(v, dict) or k != "problems" else {a: (len(b), b[:5]) for a, b in v.items()}) for k, v in audit.items()}, indent=2, default=str))
    return audit


if __name__ == "__main__":
    if "download" in sys.argv:
        download()
    if "audit" in sys.argv:
        audit_and_preprocess()
