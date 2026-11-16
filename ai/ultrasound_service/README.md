# Ultrasound model service

Runs the two ultrasound models for the website: the jugular vein model (`../jugular_ultrasound`)
and the heart model (`../heart_ultrasound`). The Node server is its only caller; the browser never
reaches it. Uploaded frames are analysed in memory and are never stored or logged.

Both models are research baselines trained on public datasets. They report geometry only and are
not validated on astronauts or for clinical use.

## Run

```bash
python -m venv .venv
.venv/bin/pip install -r ai/ultrasound_service/requirements.txt    # Windows: .venv\Scripts\pip
```

`npm run dev` then starts the service with the site. It looks for Python in this order:
`ULTRASOUND_PYTHON` from `.env`, a `.venv` folder in the repository root, then `python3` / `python`.
To run it alone: `python ai/ultrasound_service/server.py` (listens on `127.0.0.1:8790`).

Without Python the rest of the site works; the ultrasound cards say the analysis service is not
running.

## What it does

| Request | Input | Output |
| --- | --- | --- |
| `GET /health` | | whether the models loaded |
| `POST /jugular` | one cross-section neck frame (base64 PNG or JPEG), image depth in cm | vein area, axes, flattening, vein-to-artery ratio, quality check, outline |
| `POST /heart` | four frames (`2CH_ED`, `2CH_ES`, `4CH_ED`, `4CH_ES`), image depth in cm | ejection fraction, volumes, quality check, outlines |

The image depth is taken as the full height of the picture, so a frame should show only the scan,
top to bottom. A frame is prepared the way its training pipeline prepared frames, and the
measurements come from the repository's own `jugular_geometry.py` and `camus_geometry.py`.

## Model files

- Jugular: the four fold models in `../jugular_ultrasound/results/fits/`, averaged.
- Heart: `../heart_ultrasound/final_model/unet.pt` and `ef_regressor.json`, the frozen final model
  of the Kaggle run. `export_heart_model.py` wrote them from that run's `final_model` folder; the
  regressor is stored as plain numbers so the service does not need scikit-learn. On the first 12
  of the 50 CAMUS test patients the service's ejection fraction matches the pipeline's recorded
  one to within 0.001 points.

## Data and licences

- SegThy (jugular): CC BY 4.0. Kroenke et al., PLOS ONE 2022, doi:10.1371/journal.pone.0268550.
- CAMUS (heart): CC BY-NC-SA 4.0. Leclerc et al., IEEE TMI 2019, doi:10.1109/TMI.2019.2900516.
