"""Checks the data files for leakage, before anything is trained or scored on them.

Run from ai/training, after make_dataset.mts has written data/:

  python check_leakage.py

A leak is anything that lets a model score well on a test without having learned the rules. Three
checks, and each must find nothing:

  1. the same request in two files, or twice in one file;
  2. the same readings in the training file and a test file, in two test files, or twice in the
     training file (cross-validation splits that file, so a repeat would sit on both sides).
     "Readings" are the nine numbers make_dataset.mts compares, so two cases that differ only in the
     crew member, the equipment list or the space weather count as the same case;
  3. the answer inside the prompt.

Exits with status 1 when a check finds something. Standard library only, so it runs before any
Python package is installed. classical_baselines.py runs it first and imports its loader.
"""
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
# What each file is used for. Only the first is ever trained on.
FILES = {
    "train": "trained on",
    "valid": "picks between models and settings",
    "test500": "final test, random cases",
    "heldout": "final test, hand-written boundary cases",
}
READINGS = ["hr_bpm", "preflight_hr_median", "spo2_pct", "bp_systolic", "bp_diastolic", "blood_sugar_mg_dl", "temp_c", "respiratory_rate", "sleep_hours"]
STATUSES = ["nominal", "caution", "alert"]
# Words that only an answer contains. The prompt is the request plus the computed facts.
ANSWER_WORDS = ["overall_status", "contact_ground_support", "ground_support_reason", "baseline_comparison", "escalate:"]


def load(name):
    """The cases of data/<name>.jsonl: the prompt, the request it carries, and the status to predict.

    The status is the rule engine's for train, valid and test500. For heldout it is the hand-written
    expectation. Alert is exactly the cases that escalate (make_dataset.mts refuses to write a case
    where the two disagree), so one status carries both the flag and the escalation.
    """
    cases = []
    for number, line in enumerate(open(HERE / f"data/{name}.jsonl", encoding="utf-8"), 1):
        row = json.loads(line)
        if "messages" in row:
            user = row["messages"][1]["content"]
            status = json.loads(row["messages"][2]["content"].split("</think>")[-1])["overall_status"]
            case_id = f"{name}-{number}"
        else:
            user = row["user"]
            status = "alert" if row["expect"]["escalate"] else "caution" if row["expect"]["flag"] else "nominal"
            case_id = row["id"]
        cases.append({"id": case_id, "user": user, "request": json.loads(user), "status": status})
    return cases


def readings_key(case):
    vitals = case["request"]["vitals"]
    return json.dumps([vitals.get(name) for name in READINGS])


def audit(out=print):
    """Runs the three checks and returns the number of leaks found."""
    data = {name: load(name) for name in FILES}
    leaks = 0

    def found(count, what, examples):
        nonlocal leaks
        leaks += count
        shown = f": {', '.join(examples[:5])}" if count else ""
        out(f"   {'LEAK' if count else 'ok  '} {what}: {count}{shown}")

    out("== leakage check")
    for name, cases in data.items():
        share = Counter(case["status"] for case in cases)
        out(f"   {name}.jsonl ({FILES[name]}): {len(cases)} cases, " + ", ".join(f"{s} {share[s]}" for s in STATUSES))

    out("-- 1. the same request twice")
    names = list(data)
    for name in names:
        seen, repeats = set(), []
        for case in data[name]:
            if case["user"] in seen:
                repeats.append(case["id"])
            seen.add(case["user"])
        found(len(repeats), f"inside {name}", repeats)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            prompts = {case["user"] for case in data[a]}
            shared = [case["id"] for case in data[b] if case["user"] in prompts]
            found(len(shared), f"{a} and {b}", shared)

    out("-- 2. the same readings in two files, or twice in the training file (cross-validation splits that file)")
    seen, repeats = set(), []
    for case in data["train"]:
        if readings_key(case) in seen:
            repeats.append(case["id"])
        seen.add(readings_key(case))
    found(len(repeats), "inside train", repeats)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            keys = {readings_key(case) for case in data[a]}
            shared = [case["id"] for case in data[b] if readings_key(case) in keys]
            found(len(shared), f"{a} and {b}", shared)

    out("-- 3. the answer inside the prompt")
    for name, cases in data.items():
        carrying = [case["id"] for case in cases if any(word in case["user"] for word in ANSWER_WORDS)]
        found(len(carrying), name, carrying)

    # Not a leak, but the reason a model can score well without reading a single number: the prompt
    # carries computed_facts.minimum_status, worked out by the server's code and sent with every real
    # request. This is what copying it would score.
    out("-- for reference: a model that only copies computed_facts.minimum_status")
    for name, cases in data.items():
        right = sum(case["request"]["computed_facts"]["minimum_status"] == case["status"] for case in cases)
        out(f"   {name}: {right}/{len(cases)} ({100 * right / len(cases):.1f}%) statuses right, and it never escalates")

    out(f"== {'no leak found' if leaks == 0 else f'{leaks} leak(s) found'}")
    return leaks


if __name__ == "__main__":
    sys.exit(1 if audit() else 0)
