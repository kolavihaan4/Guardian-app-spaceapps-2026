"""Steps 5-6: physical LV measurements and biplane Simpson ejection fraction.

Documented implementation (method of disks):
  * Work on the mask at the ORIGINAL image shape with the original pixel spacing, so the
    square 192x192 network input never distorts lengths, areas or volumes.
  * LV cavity = label 1, largest connected component only.
  * Base line = cavity pixels touching the left atrium (label 3). Its two extreme points
    are the mitral annulus points; the base midpoint is halfway between them.
    Fallback 1: cavity pixels touching anything that is not cavity or myocardium.
    Fallback 2: principal axis of the cavity. Fallbacks are recorded as quality flags.
  * Apex = cavity pixel farthest (in mm) from the base midpoint. L = that distance.
  * 20 disks perpendicular to the long axis. Disk diameter = cavity area inside the slab
    divided by slab height.
  * Biplane volume V = pi/4 * sum(d_2CH[i] * d_4CH[i]) * max(L_2CH, L_4CH) / 20.
  * EF = 100 * (EDV - ESV) / EDV.
Invalid geometry returns ok=False with a reason; it is never turned into a plausible EF.
"""
import numpy as np
from scipy import ndimage

N_DISKS = 20
VIEWS = ("2CH", "4CH")
PHASES = ("ED", "ES")


def measure_lv(mask, spacing):
    """mask: 2D label array at original shape. spacing: (mm along axis 0, mm along axis 1)."""
    out = dict(ok=False, flag="", area_mm2=np.nan, length_mm=np.nan, diameters_mm=None)
    lv = mask == 1
    lab, n = ndimage.label(lv)
    if n == 0:
        out["flag"] = "empty_lv"
        return out
    if n > 1:
        sizes = ndimage.sum(lv, lab, range(1, n + 1))
        lv = lab == (1 + int(np.argmax(sizes)))
        out["flag"] = "multiple_lv_components"
    sp = np.asarray(spacing, dtype=float)
    pix = float(sp[0] * sp[1])
    pts = np.argwhere(lv) * sp
    if len(pts) < 50:
        out["flag"] = "tiny_lv"
        return out
    struct = np.ones((3, 3), bool)
    base = lv & ndimage.binary_dilation(mask == 3, struct, iterations=2)
    if base.sum() < 3:
        base = lv & ndimage.binary_dilation(~lv & (mask != 2), struct, iterations=1)
        out["flag"] = (out["flag"] + "+" if out["flag"] else "") + "base_from_non_myocardium"
    if base.sum() >= 3:
        b = np.argwhere(base) * sp
        c = b - b.mean(0)
        direction = np.linalg.svd(c, full_matrices=False)[2][0]
        t = c @ direction
        base_mid = (b[np.argmin(t)] + b[np.argmax(t)]) / 2
        d = np.linalg.norm(pts - base_mid, axis=1)
        apex = pts[int(np.argmax(d))]
    else:
        c = pts - pts.mean(0)
        direction = np.linalg.svd(c, full_matrices=False)[2][0]
        t = c @ direction
        base_mid, apex = pts[np.argmin(t)], pts[np.argmax(t)]
        out["flag"] = (out["flag"] + "+" if out["flag"] else "") + "axis_from_pca"
    length = float(np.linalg.norm(apex - base_mid))
    if not np.isfinite(length) or length < 10:
        out["flag"] = "invalid_long_axis"
        return out
    u = (apex - base_mid) / length
    proj = np.clip((pts - base_mid) @ u, 0, length * (1 - 1e-9))
    counts = np.bincount((proj / (length / N_DISKS)).astype(int), minlength=N_DISKS)[:N_DISKS]
    out.update(ok=True, area_mm2=float(lv.sum() * pix), length_mm=length,
               diameters_mm=counts * pix / (length / N_DISKS))
    return out


def biplane_volume_ml(m2, m4):
    if not (m2["ok"] and m4["ok"]):
        return np.nan
    step = max(m2["length_mm"], m4["length_mm"]) / N_DISKS
    return float(np.pi / 4 * np.sum(m2["diameters_mm"] * m4["diameters_mm"]) * step / 1000.0)


FEATURES = (
    [f"area_{v}_{p}" for v in VIEWS for p in PHASES]
    + [f"length_{v}_{p}" for v in VIEWS for p in PHASES]
    + [f"area_ratio_{v}" for v in VIEWS] + [f"length_ratio_{v}" for v in VIEWS]
    + ["edv_ml", "esv_ml", "geom_ef"]
)
UNITS = {**{f: "mm2" for f in FEATURES if f.startswith("area_") and "ratio" not in f},
         **{f: "mm" for f in FEATURES if f.startswith("length_") and "ratio" not in f},
         **{f: "ES/ED ratio" for f in FEATURES if "ratio" in f},
         "edv_ml": "mL", "esv_ml": "mL", "geom_ef": "percent"}


def _ratio(a, b):
    return float(a / b) if np.isfinite(a) and np.isfinite(b) and b > 1e-6 else np.nan


def patient_features(masks, spacings):
    """masks/spacings: dicts keyed by (view, phase). Returns (feature dict, quality dict).

    Only PREDICTED (or, for code validation, reference) masks enter here; no EF target.
    """
    m = {k: measure_lv(masks[k], spacings[k]) if k in masks else dict(ok=False, flag="missing_view", area_mm2=np.nan, length_mm=np.nan)
         for k in [(v, p) for v in VIEWS for p in PHASES]}
    f = {}
    for v in VIEWS:
        for p in PHASES:
            f[f"area_{v}_{p}"] = m[(v, p)]["area_mm2"]
            f[f"length_{v}_{p}"] = m[(v, p)]["length_mm"]
        f[f"area_ratio_{v}"] = _ratio(f[f"area_{v}_ES"], f[f"area_{v}_ED"])
        f[f"length_ratio_{v}"] = _ratio(f[f"length_{v}_ES"], f[f"length_{v}_ED"])
    edv = biplane_volume_ml(m[("2CH", "ED")], m[("4CH", "ED")])
    esv = biplane_volume_ml(m[("2CH", "ES")], m[("4CH", "ES")])
    flags = sorted({f"{v}_{p}:{m[(v, p)]['flag']}" for v in VIEWS for p in PHASES if m[(v, p)]["flag"]})
    status = "ok"
    ef = np.nan
    if not (np.isfinite(edv) and np.isfinite(esv)):
        status = "failed:invalid_or_missing_geometry"
    elif edv <= 0 or esv <= 0:
        status = "failed:nonpositive_volume"
    else:
        ef = 100.0 * (edv - esv) / edv
        if esv >= edv:
            status = "failed:esv_not_below_edv"
            ef = np.nan
    f.update(edv_ml=edv, esv_ml=esv, geom_ef=ef)
    return f, dict(status=status, flags=flags)
