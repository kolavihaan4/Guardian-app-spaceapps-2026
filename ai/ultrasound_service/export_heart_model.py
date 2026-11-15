"""One-off: copy the frozen CAMUS heart model into the repository in a form the service can load.

Usage: python export_heart_model.py <run>/final_model

Writes ai/heart_ultrasound/final_model/unet.pt (the segmentation weights, unchanged) and
ef_regressor.json (the fitted imputer, scaler and RBF support-vector regressor as plain numbers),
so the service needs neither scikit-learn nor the exact version the model was pickled with.
Run it with the scikit-learn version that can load ef_regressor.joblib.
"""
import json
import shutil
import sys
from pathlib import Path

import joblib
import numpy as np

src = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / "heart_ultrasound" / "final_model"
out.mkdir(parents=True, exist_ok=True)
reg = joblib.load(src / "ef_regressor.joblib")
imputer, scaler, svr = (step for _, step in reg.steps)
assert type(svr).__name__ == "SVR" and svr.kernel == "rbf", "export only covers the selected RBF support-vector regressor"
frozen = json.loads((src / "frozen_design.json").read_text())
model = dict(
    features=frozen["features"],
    impute=imputer.statistics_.tolist(),
    mean=scaler.mean_.tolist(),
    scale=scaler.scale_.tolist(),
    gamma=float(svr._gamma),
    support_vectors=svr.support_vectors_.tolist(),
    dual_coef=svr.dual_coef_[0].tolist(),
    intercept=float(svr.intercept_[0]),
    source=dict(selected=frozen["selected"], unet_fit=frozen["unet_fit"], frozen_at=frozen["frozen_at"]),
)
# The plain-number form must reproduce the fitted pipeline.
rng = np.random.default_rng(0)
X = scaler.mean_ + rng.normal(size=(200, len(scaler.mean_))) * scaler.scale_
Z = (X - np.array(model["mean"])) / np.array(model["scale"])
d = ((Z[:, None, :] - np.array(model["support_vectors"])[None]) ** 2).sum(-1)
mine = np.exp(-model["gamma"] * d) @ np.array(model["dual_coef"]) + model["intercept"]
# The imputer is skipped here (no missing values in X); it may not run under a newer scikit-learn.
fitted = svr.predict(scaler.transform(X))
assert np.allclose(mine, fitted, atol=1e-6), "exported regressor disagrees with the fitted one"
(out / "ef_regressor.json").write_text(json.dumps(model))
shutil.copyfile(src / "unet.pt", out / "unet.pt")
print("wrote", out, "| max difference from the fitted pipeline:", float(np.abs(mine - fitted).max()))
