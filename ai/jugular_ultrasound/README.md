# Jugular vein ultrasound: segmentation and area measurement

Research baseline that outlines the internal jugular vein in a transverse neck ultrasound and
measures its cross-sectional area. It reports geometry only. It does not show blood flow, clots,
venous pressure or anything diagnostic, and it is not validated on astronauts or for clinical use.

## Files

- `jugular_data.py` downloads the SegThy manual annotations (pinned, checksum-verified mirror),
  audits them, confirms the transverse axis, and cuts slices at 0.25 mm per pixel with the skin at
  the top.
- `jugular_pipeline.py` trains a four-level U-Net (background, thyroid, carotid, vein) with 4-fold
  cross-validation by subject and writes the per-subject report. `predict_frame()` runs the
  averaged fold models on a new frame.
- `jugular_geometry.py` turns a mask into area, axes, flattening index, vein-to-artery ratio, a
  quality flag, a cine area trace, and a comparison with a person's own baseline.
- `build_notebook.py` regenerates `Jugular_Pipeline_Colab.ipynb` from the three modules.

## Run

GPU (the plan as written, 60 epochs per fold): open `Jugular_Pipeline_Colab.ipynb` in Colab with a
GPU runtime and run all cells.

Local CPU (reduced budget):

```bash
python jugular_data.py download audit preprocess
JUGULAR_EPOCHS=20 JUGULAR_TRAIN_STRIDE=2 python -W ignore jugular_pipeline.py cv report
```

Data, checkpoints and results are written outside the repository, to `JUGULAR_ROOT`
(default `C:\Users\nikhi\Downloads\jugular_work`, or `/content/jugular_work` on Colab).

## Data

SegThy, Technical University of Munich: 31 usable ultrasound volumes from 16 healthy volunteers
(scan `028_P3_1_left` is excluded because its vein was not drawn). CC BY 4.0; cite Kroenke et al.,
PLOS ONE 2022, doi:10.1371/journal.pone.0268550. The slices are cut from reconstructed 3D volumes
and are not ordinary probe frames.
