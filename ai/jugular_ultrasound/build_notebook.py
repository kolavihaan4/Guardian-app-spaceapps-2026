"""Rebuild Jugular_Pipeline_Colab.ipynb from the three modules in this folder.

Run after editing jugular_data.py, jugular_geometry.py or jugular_pipeline.py so the notebook
carries the same code:  python build_notebook.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent


def md(text):
    return dict(cell_type="markdown", metadata={}, source=text.strip("\n").splitlines(keepends=True))


def code(text):
    return dict(cell_type="code", metadata={}, execution_count=None, outputs=[], source=text.strip("\n").splitlines(keepends=True))


def module(name):
    return code(f"%%writefile {name}\n" + (HERE / name).read_text(encoding="utf-8"))


cells = [
    md("""
# Jugular vein ultrasound: subject-grouped segmentation and area measurement (GPU)

Implements the *Jugular Vein Model Plan*: SegThy audit with a slice-axis check, transverse slices at a fixed 0.25 mm per pixel, a four-level U-Net (background, thyroid, carotid, jugular vein), 4-fold cross-validation by subject, and rule-based area measurements.

**Data:** SegThy manual ultrasound annotations, 31 usable volumes from 16 healthy volunteers, through a pinned, checksum-verified MedOtter mirror (third-party redistribution). CC BY 4.0; cite Kroenke et al., PLOS ONE 2022, doi:10.1371/journal.pone.0268550.

**Scope:** outlines and image-plane areas only. No blood flow, clots, venous pressure or diagnosis. SegThy slices are cut from reconstructed 3D volumes and are not ordinary probe frames. Not validated for astronauts or clinical use.

**Before running:** attach a GPU. On Kaggle: Settings > Accelerator > GPU, and turn Internet on (the dataset is downloaded). On Colab: Runtime > Change runtime type > GPU. The settings cell stops if no GPU is attached.
"""),
    code("""
EPOCHS = 60          # plan's starting value; the best epoch per fold is kept using 2 training-side subjects
USE_DRIVE = False    # Colab only: True keeps data, checkpoints and results on Google Drive

import os, torch
assert torch.cuda.is_available(), "No GPU attached. Turn on a GPU accelerator for this notebook, then run again."
print("GPU:", torch.cuda.get_device_name(0))
ON_KAGGLE = os.path.exists("/kaggle/working")
root = "/kaggle/working/jugular_work" if ON_KAGGLE else "/content/jugular_work"
if USE_DRIVE and not ON_KAGGLE:
    from google.colab import drive
    drive.mount("/content/drive")
    root = "/content/drive/MyDrive/jugular_work"
os.environ.update(JUGULAR_ROOT=root, JUGULAR_EPOCHS=str(EPOCHS), JUGULAR_TRAIN_STRIDE="1", JUGULAR_RUN="run_gpu")
os.makedirs(root, exist_ok=True)
print("Working folder:", root)
get_ipython().run_line_magic("pip", "-q install nibabel")
"""),
    md("## Source files\nThe next three cells write the pipeline modules to disk. Nothing is trained here."),
    module("jugular_data.py"), module("jugular_geometry.py"), module("jugular_pipeline.py"),
    md("""
## 1. Download, audit and slice the dataset
Verifies every file's checksum, checks labels and alignment, and confirms the transverse axis two ways (header orientation and vessel roundness). It stops if the axis check fails. The scan with the undrawn vein (028_P3_1_left) is excluded.
"""),
    code("!python jugular_data.py download audit preprocess"),
    md("""
## 2. Cross-validation by subject
Four folds. Each trains on 12 subjects and predicts the 4 held-out subjects once. Training resumes from the last finished epoch when the cells are run again, as long as the working folder survived (Kaggle: turn on file persistence in the session options; Colab: `USE_DRIVE = True`).
"""),
    code("!python -W ignore jugular_pipeline.py cv"),
    md("""
## 3. Results
Per-subject overlap (Dice), area error against the manual outline, artery/vein confusion and speed, with the plan's acceptance targets. The targets are research bars chosen in the plan, not clinical standards.
"""),
    code("!python -W ignore jugular_pipeline.py report"),
    code("""
import json, os
import numpy as np, matplotlib.pyplot as plt
import jugular_pipeline as jp
D = jp.Data()
folds = json.loads((jp.RUN / "folds.json").read_text())
fig, axes = plt.subplots(4, 3, figsize=(11, 14))
for f, row in zip(folds, axes):
    path = sorted(p for p in jp.FITS.glob(f"fold{f['fold']}_*.pt") if p.name.count(".") == 1)[0]
    model = jp.load_model(path)
    case = D.cases[f["held_out"][0]][0]
    v = D.vols[case]; idx = np.nonzero(v["has_vein"])[0]; i = int(idx[len(idx) // 2])
    p, pm = jp.predict_probs([model], D.image(case, i))
    row[0].imshow(D.image(case, i), cmap="gray"); row[0].set_title(f"{case} (held out)")
    row[1].imshow(v["mask"][i], cmap="tab10", vmin=0, vmax=9); row[1].set_title("Manual outline")
    row[2].imshow(((p + pm) / 2).argmax(0), cmap="tab10", vmin=0, vmax=9); row[2].set_title("Prediction")
    for ax in row:
        ax.axis("off")
plt.tight_layout(); plt.show()
"""),
    md("""
## 4. Download the trained models and audit files
Four fold models (the shipped model is their average), fold assignments, per-subject table, per-slice predictions and the audit. Raw data stays under its original licence and is not included.
"""),
    code("""
import zipfile, os
from pathlib import Path
import jugular_pipeline as jp
ON_KAGGLE = os.path.exists("/kaggle/working")
archive = Path("/kaggle/working/jugular_results.zip" if ON_KAGGLE else "/content/jugular_results.zip")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(jp.RUN.rglob("*")):
        if p.is_file() and ".last." not in p.name:
            z.write(p, p.relative_to(jp.RUN.parent))
    for name in ["audit.json", "manifest.json"]:
        z.write(jp.ROOT / name, name)
if ON_KAGGLE:
    print("Saved", archive, "- download it from the Output panel on the right")
else:
    from google.colab import files
    files.download(str(archive))
"""),
]
nb = dict(cells=cells, metadata=dict(accelerator="GPU", colab=dict(provenance=[]), kernelspec=dict(display_name="Python 3", name="python3"),
                                     language_info=dict(name="python")), nbformat=4, nbformat_minor=0)
(HERE / "Jugular_Pipeline_Colab.ipynb").write_text(json.dumps(nb, indent=1), encoding="utf-8")
print("wrote", HERE / "Jugular_Pipeline_Colab.ipynb")
