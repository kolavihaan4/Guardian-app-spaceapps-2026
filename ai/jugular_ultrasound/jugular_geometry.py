"""Rule-based measurements from a jugular segmentation mask, plus baseline tracking.

Nothing here is learned. Every reported number can be traced to the outline it came from.
These are geometric measurements only: they say nothing about blood flow, clots, venous pressure
or pressure inside the skull. Not validated on astronauts or for clinical use.
"""
import numpy as np
from scipy import ndimage

from jugular_data import CAROTID, VEIN

MIN_VEIN_MM2 = 3.0        # smaller vein regions are reported as "vein not found" (starting value)
MIN_VEIN_PX = 40          # same idea when no pixel spacing is available
FLAT_LIMIT = 0.25         # short/long axis below this suggests probe pressure (starting value)
UNSTABLE_LIMIT = 0.15     # relative area difference between the frame and its mirror image (starting value)
FLAG_SPREADS = 2.0        # a change is flagged beyond this many baseline spreads...
FLAG_SESSIONS = 2         # ...on this many sessions in a row
NO_FLOW_NOTE = "This measurement does not show blood flow or clots."


def largest_region(binary):
    """Largest connected region with holes filled; None if empty."""
    lab, n = ndimage.label(binary)
    if n == 0:
        return None
    sizes = ndimage.sum(binary, lab, index=np.arange(1, n + 1))
    return ndimage.binary_fill_holes(lab == 1 + int(np.argmax(sizes)))


def ellipse_axes(region):
    """Full long and short axis (pixels) of the ellipse with the same second moments as the region."""
    ys, xs = np.nonzero(region)
    if len(ys) < 3:
        return 0.0, 0.0
    e = np.sort(np.linalg.eigvalsh(np.cov(np.vstack([ys, xs])) + np.eye(2) / 12.0))
    return float(4 * np.sqrt(e[1])), float(4 * np.sqrt(e[0]))


def measure_frame(mask, spacing_mm=None):
    """Measurements for one predicted mask. spacing_mm=None gives only the scale-free outputs."""
    vein, artery = largest_region(mask == VEIN), largest_region(mask == CAROTID)
    px = 0 if vein is None else int(vein.sum())
    sq = None if spacing_mm is None else float(spacing_mm) ** 2
    found = px >= MIN_VEIN_PX if sq is None else px * sq >= MIN_VEIN_MM2
    out = dict(vein_found=bool(found), area_mm2=None, long_axis_mm=None, short_axis_mm=None, flattening=None,
               vein_to_artery=None, artery_area_mm2=None, vein_pixels=px)
    if not found:
        return out
    long_px, short_px = ellipse_axes(vein)
    out["flattening"] = short_px / long_px if long_px else None
    apx = 0 if artery is None else int(artery.sum())
    if apx >= MIN_VEIN_PX:
        out["vein_to_artery"] = px / apx
    if sq is not None:
        out.update(area_mm2=px * sq, long_axis_mm=long_px * spacing_mm, short_axis_mm=short_px * spacing_mm,
                   artery_area_mm2=apx * sq if apx else None)
    return out


def quality(m, m_mirror=None):
    """Accept or rescan, with reasons. m_mirror is the measurement from the mirrored frame's prediction."""
    reasons = []
    if not m["vein_found"]:
        reasons.append("vein not found")
    else:
        if m["flattening"] is not None and m["flattening"] < FLAT_LIMIT:
            reasons.append("vein looks flattened: ease probe pressure")
        if m_mirror is not None:
            a, b = m["vein_pixels"], m_mirror["vein_pixels"]
            if abs(a - b) / max((a + b) / 2, 1) > UNSTABLE_LIMIT:
                reasons.append("prediction unstable")
    return dict(accept=not reasons, reasons=reasons)


def measure_clip(masks, spacing_mm):
    """Area trace over a cine clip with a 3-frame median filter, and (max - min) / mean. Experimental."""
    areas = np.array([(measure_frame(m, spacing_mm)["area_mm2"] or np.nan) for m in masks], dtype=float)
    if np.isnan(areas).mean() > 0.2 or len(areas) < 3:
        return dict(trace_mm2=areas.tolist(), pulsatility=None, mean_area_mm2=None, note="vein not found in enough frames")
    filled = np.where(np.isnan(areas), np.nanmedian(areas), areas)
    trace = ndimage.median_filter(filled, size=3, mode="nearest")
    return dict(trace_mm2=trace.tolist(), mean_area_mm2=float(trace.mean()), max_area_mm2=float(trace.max()), min_area_mm2=float(trace.min()),
                pulsatility=float((trace.max() - trace.min()) / trace.mean()), note="experimental: frame-by-frame by-product, not validated")


def make_baseline(areas_mm2):
    """Baseline from at least three preflight scans of one side in one posture (supine recommended)."""
    a = np.asarray(areas_mm2, dtype=float)
    if len(a) < 3:
        raise ValueError("a baseline needs at least three scans")
    return dict(median_mm2=float(np.median(a)), spread_mm2=float(np.std(a, ddof=1)), scans=int(len(a)))


def compare(area_mm2, baseline, earlier_outside=0):
    """Change from the person's own baseline. earlier_outside = consecutive earlier sessions already outside range."""
    diff = area_mm2 - baseline["median_mm2"]
    outside = abs(diff) > FLAG_SPREADS * baseline["spread_mm2"]
    run = earlier_outside + 1 if outside else 0
    return dict(percent_change=100.0 * diff / baseline["median_mm2"], outside_own_range=bool(outside),
                sessions_outside_in_a_row=run, flagged=bool(run >= FLAG_SESSIONS))


def report_line(side, m, q, change=None):
    """The single line shown to the crew member."""
    if not q["accept"]:
        return f"{side.capitalize()} jugular: rescan needed ({'; '.join(q['reasons'])})."
    if m["area_mm2"] is None:
        ratio = "not available" if m["vein_to_artery"] is None else f"{m['vein_to_artery']:.2f}"
        return f"{side.capitalize()} jugular: no pixel spacing, so no area. Vein-to-artery ratio {ratio}. {NO_FLOW_NOTE}"
    text = f"{side.capitalize()} jugular area {m['area_mm2']:.0f} mm2"
    if change is not None:
        word = "above" if change["percent_change"] >= 0 else "below"
        text += f", {abs(change['percent_change']):.0f}% {word} your supine baseline"
        text += ", outside your normal range" if change["outside_own_range"] else ", within your normal range"
    text += f". {NO_FLOW_NOTE}"
    if change is not None and change["flagged"]:
        text += " Consider running the full Doppler exam and informing the flight surgeon."
    return text
