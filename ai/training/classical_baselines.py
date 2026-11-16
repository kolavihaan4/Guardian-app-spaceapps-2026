"""Random forest, support vector machine and gradient boosting on the triage cases, with nested
cross-validation and hyperparameter tuning.

Run from ai/training, after make_dataset.mts has written data/:

  .venv/bin/python classical_baselines.py          (Windows: .venv\\Scripts\\python classical_baselines.py)

It gives the fine-tuned language model something to be measured against. Each model reads a request
as one row of a table and predicts the status the rule engine gives it: nominal, caution or alert.
Alert is exactly the cases that escalate, so a right status is a right flag and a right escalation,
which is the "both correct" figure evaluate.py prints for the language model.

How leakage is kept out:
  - check_leakage.py runs first, and nothing is trained if a test case repeats a training case;
  - every step that learns from the data (the columns, the gap filling, the scaling) is inside the
    pipeline, so in each fold it is fitted on that fold's training part only;
  - the settings are tuned by a second cross-validation inside each fold (nested), so the
    cross-validated score is of the whole "tune, then fit" procedure and not of settings that were
    picked by looking at that same score;
  - folds are grouped by readings, so two cases with the same readings never sit on both sides;
  - the model to prefer is picked on the cross-validated score, and only then are valid.jsonl,
    test500.jsonl and heldout.jsonl scored, once each.

Two sets of columns are run. "request" is the request and the differences between a reading and
the crew member's own baseline. "request + computed flags" adds the two yes/no facts the server's
code works out and sends with every request (computed_facts); the language model is given them too.

Prints the report and saves every number, setting and wrong case to runs/classical.json.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import GridSearchCV, StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from check_leakage import audit, load, readings_key

HERE = Path(__file__).parent
OUTER_FOLDS, INNER_FOLDS = 5, 4
TESTS = ["valid", "test500", "heldout"]
NAN = float("nan")
NUMBERS = ["hr_bpm", "preflight_hr_median", "spo2_pct", "preflight_spo2_median", "bp_systolic", "bp_diastolic", "standing_bp_systolic",
           "standing_bp_diastolic", "standing_hr_bpm", "blood_sugar_mg_dl", "temp_c", "preflight_temp_median", "respiratory_rate", "sleep_hours"]
WORDS = ["mood", "ultrasound_finding", "eye_exam_finding"]
FEATURE_SETS = {"request": False, "request + computed flags": True}


def features(request, computed_flags):
    """One row of the table. A reading that was not sent is a gap (NaN), never a normal-looking number.

    Left out: the crew id, the pain notes and regions, and the equipment list, none of which the
    status depends on. The profile and the space weather are kept although the rules ignore them
    too: the language model is shown them and has to learn that for itself.
    """
    vitals = request["vitals"]
    profile = request.get("profile") or {}
    weather = request.get("space_weather") or {}
    pain = [point["severity"] for point in request.get("pain_points") or []]

    def change(a, b):
        # rounded to one decimal, as the server rounds a temperature difference
        return round(vitals[a] - vitals[b], 1) if a in vitals and b in vitals else NAN

    row = {name: vitals.get(name, NAN) for name in NUMBERS}
    row.update({name: vitals.get(name, "absent") for name in WORDS})
    row.update({
        "hr_change": change("hr_bpm", "preflight_hr_median"),
        "spo2_fall": change("preflight_spo2_median", "spo2_pct"),
        "temp_change": change("temp_c", "preflight_temp_median"),
        "standing_systolic_fall": change("bp_systolic", "standing_bp_systolic"),
        "standing_diastolic_fall": change("bp_diastolic", "standing_bp_diastolic"),
        "sensor_verified": float(vitals.get("sensor_verified", False)),
        "worst_pain": max(pain, default=0),
        "pain_points": len(pain),
        "environment": request.get("environment", "absent"),
        "previous_conditions": profile.get("previous_conditions", "absent"),
        "gender": profile.get("gender", "absent"),
        "age": profile.get("age", NAN),
        "height_cm": profile.get("height_cm", NAN),
        "weight_kg": profile.get("weight_kg", NAN),
        "kp_index": weather.get("kp_index", NAN),
        "solar_flare": weather.get("solar_flare", "absent"),
        "sep_event": weather.get("sep_event", "absent"),
    })
    if computed_flags:
        facts = request["computed_facts"]
        row["computed_minimum_status_is_caution"] = float(facts["minimum_status"] == "caution")
        row["computed_standing_drop"] = float(facts["standing_drop_meets_criterion"])
    return row


def candidates(seed):
    """Each model with the settings to try. Scaling is for the support vector machine only: trees do not need it.

    A first run chose the lowest gamma, learning rate and number of rounds on offer, which means the
    best value may have been outside the range, so those ranges were extended downwards. The random
    forest's choices (all columns per split, leaves of one case, no depth limit) are the ends of
    what those settings can be, not the ends of a range.
    """
    def pipeline(model, scale=False):
        steps = [("table", DictVectorizer(sparse=False)), ("gaps", SimpleImputer(strategy="median", add_indicator=True))]
        return Pipeline(steps + ([("scale", StandardScaler())] if scale else []) + [("model", model)])

    return {
        "random forest": (
            pipeline(RandomForestClassifier(n_estimators=400, random_state=seed)),
            {"model__max_features": ["sqrt", 0.5, 1.0], "model__min_samples_leaf": [1, 2, 4], "model__max_depth": [None, 12]},
        ),
        "support vector machine": (
            pipeline(SVC(kernel="rbf"), scale=True),
            {"model__C": [1, 10, 100, 1000], "model__gamma": [0.0001, 0.0003, 0.001, 0.003, 0.01, "scale"]},
        ),
        "gradient boosting": (
            pipeline(HistGradientBoostingClassifier(random_state=seed)),
            {"model__learning_rate": [0.02, 0.05, 0.1], "model__max_leaf_nodes": [4, 8, 15, 31], "model__max_iter": [100, 200, 400]},
        ),
    }


def tally(truth, predicted, ids=None):
    truth, predicted = np.asarray(truth), np.asarray(predicted)
    due = truth == "alert"
    counts = {
        "cases": len(truth),
        "right": int((truth == predicted).sum()),
        "escalations": int(due.sum()),
        "caught": int((predicted[due] == "alert").sum()),
        "calm": int((~due).sum()),
        "wrong_escalations": int((predicted[~due] == "alert").sum()),
    }
    if ids is not None:
        counts["wrong"] = [case_id for case_id, same in zip(ids, truth == predicted) if not same]
    return counts


def pct(n, d):
    return f"{n}/{d} ({100 * n / d:.1f}%)"


def line(counts):
    return f"status right {pct(counts['right'], counts['cases'])}; escalations caught {counts['caught']}/{counts['escalations']}; escalated when it should not {counts['wrong_escalations']}/{counts['calm']}"


def settings(params):
    return {name.removeprefix("model__"): value for name, value in params.items()}


def run(name, computed_flags, data, seed):
    train = data["train"]
    rows = [features(case["request"], computed_flags) for case in train]
    truth = np.array([case["status"] for case in train])
    groups = np.array([readings_key(case) for case in train])
    take = lambda picked: [rows[i] for i in picked]
    folds = lambda count: StratifiedGroupKFold(n_splits=count, shuffle=True, random_state=seed)
    tuned = lambda model, grid: GridSearchCV(model, grid, scoring="accuracy", cv=folds(INNER_FOLDS), n_jobs=-1)

    print(f"== features: {name}")
    print(f"-- nested cross-validation on train.jsonl: {OUTER_FOLDS} folds, settings tuned inside each on {INNER_FOLDS} folds; no other file is read")
    result = {}
    for model_name, (model, grid) in candidates(seed).items():
        guesses = np.empty(len(train), dtype=object)
        per_fold, fold_settings = [], []
        for fit_rows, score_rows in folds(OUTER_FOLDS).split(rows, truth, groups):
            search = tuned(model, grid).fit(take(fit_rows), truth[fit_rows], groups=groups[fit_rows])
            guesses[score_rows] = search.predict(take(score_rows))
            per_fold.append(float((guesses[score_rows] == truth[score_rows]).mean()))
            fold_settings.append(settings(search.best_params_))
        counts = tally(truth, guesses)
        print(f"   {model_name}: {line(counts)}")
        print(f"      per fold {' '.join(f'{100 * score:.1f}' for score in per_fold)}; mean {100 * np.mean(per_fold):.1f}, spread (standard deviation) {100 * np.std(per_fold):.1f}")
        result[model_name] = {"cross_validation": counts, "per_fold": per_fold, "fold_settings": fold_settings}

    pick = max(result, key=lambda model_name: np.mean(result[model_name]["per_fold"]))
    print(f"   picked on the cross-validated score: {pick}")

    print("-- settings tuned on all of train.jsonl, then each test file scored once")
    for model_name, (model, grid) in candidates(seed).items():
        search = tuned(model, grid).fit(rows, truth, groups=groups)
        chosen = settings(search.best_params_)
        # Every setting tried with its score, best first. Many settings close to the best mean the
        # choice between them is a coin toss and more tuning would not move the result.
        scores = search.cv_results_["mean_test_score"]
        tried = sorted(({"settings": settings(params), "score": float(score)} for params, score in zip(search.cv_results_["params"], scores)), key=lambda entry: -entry["score"])
        result[model_name].update({"settings": chosen, "tried": tried, "tests": {}})
        print(f"   {model_name}: {', '.join(f'{key}={value}' for key, value in chosen.items())}")
        print(f"      tuning score {100 * scores.max():.1f}; {int((scores >= scores.max() - 0.005).sum())} of the {len(scores)} settings tried score within half a point of it")
        for test in TESTS:
            cases = data[test]
            counts = tally([case["status"] for case in cases], search.predict([features(case["request"], computed_flags) for case in cases]), [case["id"] for case in cases])
            result[model_name]["tests"][test] = counts
            print(f"      {test}: {line(counts)}")
    print(f"   {pick} wrong on heldout: {', '.join(result[pick]['tests']['heldout']['wrong']) or 'none'}")
    return {"picked": pick, "models": result}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7, help="fixes the folds and the models' own randomness")
    args = ap.parse_args()
    # show each line as it is printed, also when the output goes to a file or to Tee-Object
    sys.stdout.reconfigure(line_buffering=True)

    if audit():
        sys.exit("Nothing was trained: the leakage check above found a leak. Fix the data first.")
    data = {name: load(name) for name in ["train"] + TESTS}
    report = {"seed": args.seed, "scikit_learn": sklearn.__version__, "outer_folds": OUTER_FOLDS, "inner_folds": INNER_FOLDS,
              "feature_sets": {name: run(name, computed_flags, data, args.seed) for name, computed_flags in FEATURE_SETS.items()}}
    (HERE / "runs").mkdir(exist_ok=True)
    (HERE / "runs/classical.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print("== saved to runs/classical.json")


if __name__ == "__main__":
    main()
