"""Step 6 check: run the Simpson code on EXPERT contours and compare with the reference EF.

Uses development patients only (official train + val). The 50 official test patients are
not read here, so nothing about the measurement code is adjusted on them.
"""
import json

import nibabel as nib
import numpy as np

from camus_data import ROOT
from camus_geometry import patient_features

manifest = json.loads((ROOT / "manifest.json").read_text())
patients = json.loads((ROOT / "patients.json").read_text())
rows = {}
for r in manifest:
    if r["split"] == "test":
        continue
    rows.setdefault(r["patient"], {})[(r["view"], r["phase"])] = r
out = {}
for pid, cases in sorted(rows.items()):
    masks = {k: np.asarray(nib.load(r["mask"]).dataobj).squeeze() for k, r in cases.items()}
    spac = {k: r["spacing_mm"] for k, r in cases.items()}
    f, q = patient_features(masks, spac)
    out[pid] = dict(features=f, quality=q, ef=patients[pid]["ef"])
(ROOT / "reference_geometry_dev.json").write_text(json.dumps(out, indent=1))
ok = [p for p in out if out[p]["quality"]["status"] == "ok"]
err = np.array([out[p]["features"]["geom_ef"] - out[p]["ef"] for p in ok])
edv = np.array([out[p]["features"]["edv_ml"] for p in ok])
esv = np.array([out[p]["features"]["esv_ml"] for p in ok])
flags = {}
for p in out:
    for fl in out[p]["quality"]["flags"]:
        flags[fl.split(":")[1]] = flags.get(fl.split(":")[1], 0) + 1
print("dev patients:", len(out), "valid:", len(ok), "failed:", len(out) - len(ok))
print(f"Simpson-on-expert-contours vs reference EF: MAE {np.abs(err).mean():.2f}, RMSE {np.sqrt((err**2).mean()):.2f}, bias {err.mean():+.2f}, max |err| {np.abs(err).max():.1f}, corr {np.corrcoef([out[p]['features']['geom_ef'] for p in ok],[out[p]['ef'] for p in ok])[0,1]:.3f}")
print(f"EDV mean {edv.mean():.1f} mL (range {edv.min():.0f}-{edv.max():.0f}); ESV mean {esv.mean():.1f} mL (range {esv.min():.0f}-{esv.max():.0f})")
print("flags:", flags)
worst = sorted(ok, key=lambda p: -abs(out[p]["features"]["geom_ef"] - out[p]["ef"]))[:8]
print("worst:", [(p, round(out[p]["features"]["geom_ef"], 1), out[p]["ef"]) for p in worst])
