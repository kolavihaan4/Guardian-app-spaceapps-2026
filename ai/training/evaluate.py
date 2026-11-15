"""Scores a model on the held-out test set and on the validation set.

Run from ai/training:

  .venv/bin/python evaluate.py mlx --adapter adapters/v2 --name tuned     # the fine-tuned model
  .venv/bin/python evaluate.py mlx --name base-mlx                        # the same base model, untuned
  .venv/bin/python evaluate.py ollama --model astrovitals-triage --name base-ollama   # as served today

Held-out set (data/heldout.jsonl): hand-written boundary cases with expectations written from the
cited thresholds. Validation set (data/valid.jsonl): random cases labelled by the rule engine, not
trained on. Neither is used for training.

With --test-file the run scores that one file and nothing else. It is for data/test500.jsonl: 500
more random cases labelled by the rule engine, none sharing its readings with a training,
validation or held-out case (make_dataset.mts writes it and prints its make-up):

  .venv/bin/python evaluate.py mlx --adapter adapters/v2 --name tuned-test500 --test-file data/test500.jsonl

Every answer is saved to runs/<name>.jsonl, so the numbers can be re-counted without re-running.
"""
import argparse
import json
import re
import statistics
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
KEYS = ["overall_status", "data_quality_check", "baseline_comparison", "environment_insight", "common_causes", "confirmation_prompt",
        "available_tool_action_plan", "workout_modification", "simple_instructions", "contact_ground_support", "ground_support_reason"]
LISTS = {"common_causes", "available_tool_action_plan", "simple_instructions"}
# The same words the server uses to spot a step that names equipment (apps/server/src/routes/ai.ts, TOOL_KEYWORDS).
TOOL_KEYWORDS = ["oximeter", "blood pressure cuff", "glucometer", "thermometer", "ultrasound", "eye exam", "fundoscope", "ecg", "ared", "ergometer", "sleep mask", "light mask", "co2"]


def parse(text):
    """The answer as a dict, or None when it is not one JSON object."""
    text = text.split("</think>")[-1].strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def schema_ok(a):
    if a is None or any(k not in a for k in KEYS):
        return False
    if a["overall_status"] not in ("nominal", "caution", "alert") or not isinstance(a["contact_ground_support"], bool):
        return False
    if not all(isinstance(a[k], list) and all(isinstance(x, str) for x in a[k]) for k in LISTS):
        return False
    if not (a["ground_support_reason"] is None or isinstance(a["ground_support_reason"], str)):
        return False
    return all(isinstance(a[k], str) for k in KEYS if k not in LISTS and k not in ("contact_ground_support", "ground_support_reason"))


def names_missing_tool(a, tools):
    have = [t.lower() for t in tools]
    steps = [str(s).lower() for k in ("available_tool_action_plan", "simple_instructions") for s in (a.get(k) or [])]
    return any(word in step and not any(word in t for t in have) for step in steps for word in TOOL_KEYWORDS)


def load_labelled(path):
    """Cases in the valid.jsonl format: the taught answer is the rule engine's."""
    cases = []
    for line in open(path, encoding="utf-8"):
        messages = json.loads(line)["messages"]
        taught = parse(messages[2]["content"])
        cases.append({"user": messages[1]["content"], "payload": json.loads(messages[1]["content"]), "taught": taught})
    return cases


def load_cases():
    held = [json.loads(line) for line in open(HERE / "data/heldout.jsonl", encoding="utf-8")]
    return held, load_labelled(HERE / "data/valid.jsonl")


def load_test(name):
    """The cases of a --test-file, each with an id of the file's name and its line number."""
    path = Path(name)
    if not path.is_absolute() and not path.exists():
        path = HERE / name
    cases = load_labelled(path)
    for number, case in enumerate(cases, 1):
        case["id"] = f"{path.stem}-{number}"
    return cases


def reasons(taught):
    """The escalation rules that fired, from the last entry of the taught checklist: 'escalate: yes (a; b)'."""
    found = re.search(r"escalate: yes \((.*)\)$", taught["baseline_comparison"])
    return found.group(1).split("; ") if found else []


def mlx_answerer(adapter):
    from mlx_lm import generate, load
    from mlx_lm.sample_utils import make_sampler

    model, tokenizer = load(str(HERE / "base/Qwen3-8B-4bit"), adapter_path=str(HERE / adapter) if adapter else None)
    system = (HERE / "system_prompt.txt").read_text(encoding="utf-8").strip()
    sampler = make_sampler(temp=0.0)

    def answer(user):
        prompt = tokenizer.apply_chat_template([{"role": "system", "content": system}, {"role": "user", "content": user}], add_generation_prompt=True, enable_thinking=False)
        return generate(model, tokenizer, prompt=prompt, max_tokens=1100, sampler=sampler, verbose=False)

    return answer


def ollama_answerer(model, url):
    schema = json.loads((HERE / "data/response_schema.json").read_text(encoding="utf-8"))

    def answer(user):
        # the same request the server sends (apps/server/src/routes/ai.ts)
        body = {"model": model, "stream": False, "think": False, "format": schema, "messages": [{"role": "user", "content": user}]}
        req = urllib.request.Request(f"{url}/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as res:
            return json.loads(res.read())["message"]["content"]

    return answer


def pct(n, d):
    return f"{n}/{d} ({100 * n / d:.1f}%)" if d else "n/a"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("backend", choices=["mlx", "ollama"])
    ap.add_argument("--adapter")
    ap.add_argument("--model", default="astrovitals-triage")
    ap.add_argument("--url", default="http://localhost:11434")
    ap.add_argument("--name", required=True)
    ap.add_argument("--limit", type=int, help="only the first N cases of each set (smoke test)")
    ap.add_argument("--skip-valid", action="store_true")
    ap.add_argument("--valid-limit", type=int, help="only the first N validation cases")
    ap.add_argument("--test-file", help="score only this file of rule-labelled cases (the valid.jsonl format), e.g. data/test500.jsonl")
    args = ap.parse_args()

    if args.test_file:
        test = load_test(args.test_file)
        sets = (("test", test[: args.limit] if args.limit else test),)
    else:
        held, valid = load_cases()
        if args.limit:
            held, valid = held[: args.limit], valid[: args.limit]
        if args.skip_valid:
            valid = []
        if args.valid_limit:
            valid = valid[: args.valid_limit]
        sets = (("heldout", held), ("valid", valid))
    answer = mlx_answerer(args.adapter) if args.backend == "mlx" else ollama_answerer(args.model, args.url)

    (HERE / "runs").mkdir(exist_ok=True)
    log = open(HERE / f"runs/{args.name}.jsonl", "w", encoding="utf-8")
    rows = []
    began = time.time()
    for kind, cases in sets:
        for case in cases:
            start = time.time()
            try:
                raw = answer(case["user"])
            except Exception as exc:  # a timeout or refused connection counts as no answer
                raw = f"ERROR {exc!r}"
            sec = round(time.time() - start, 2)
            row = {"set": kind, "id": case.get("id"), "sec": sec, "raw": raw, "tools": case["payload"]["available_tools"]}
            if kind == "heldout":
                row["expect"] = case["expect"]
            else:
                row["taught"] = case["taught"]
            rows.append(row)
            log.write(json.dumps(row) + "\n")
            log.flush()
            # a long test file runs for over an hour: say how far it has got, away from the report
            if kind == "test" and len(rows) % 25 == 0:
                print(f"{len(rows)}/{len(cases)} answered, {(time.time() - began) / 60:.0f} min", file=sys.stderr, flush=True)
    report(rows, args.name)


def report(rows, name):
    print(f"== {name}")
    for kind in ("heldout", "valid", "test"):
        part = [r for r in rows if r["set"] == kind]
        if not part:
            continue
        answers = [(r, parse(r["raw"])) for r in part]
        good = [(r, a) for r, a in answers if schema_ok(a)]
        n = len(part)
        print(f"-- {kind}: {n} cases")
        print("   valid answer with all 11 fields:", pct(len(good), n))
        if kind == "heldout":
            flag = sum((a["overall_status"] != "nominal") == r["expect"]["flag"] for r, a in good)
            esc = sum(a["contact_ground_support"] == r["expect"]["escalate"] for r, a in good)
            both = [(r, a) for r, a in good if (a["overall_status"] != "nominal") == r["expect"]["flag"] and a["contact_ground_support"] == r["expect"]["escalate"]]
            print("   flagged-or-not correct:", pct(flag, n))
            print("   escalation correct:", pct(esc, n))
            print("   both correct:", pct(len(both), n))
            missed = sum(1 for r, a in good if r["expect"]["escalate"] and not a["contact_ground_support"])
            extra = sum(1 for r, a in good if not r["expect"]["escalate"] and a["contact_ground_support"])
            print(f"   escalations missed: {missed} of {sum(r['expect']['escalate'] for r in part)}; escalated when it should not: {extra} of {sum(not r['expect']['escalate'] for r in part)}")
            wrong = [r["id"] for r, a in answers if (r, a) not in both]
            print("   wrong or invalid:", ", ".join(wrong) if wrong else "none")
        else:
            status = sum(a["overall_status"] == r["taught"]["overall_status"] for r, a in good)
            esc = sum(a["contact_ground_support"] == r["taught"]["contact_ground_support"] for r, a in good)
            same = sum(a == r["taught"] for r, a in good)
            print("   status matches the rule engine:", pct(status, n))
            print("   escalation matches the rule engine:", pct(esc, n))
            print("   whole answer identical to the taught answer:", pct(same, n))
            # The rule engine's own wording can name equipment that is not listed (a pain self-check that
            # mentions the ARED, for instance), so its figure is the reference for the line below.
            print("   for reference, the taught answers name equipment that is not on board:", pct(sum(names_missing_tool(r["taught"], r["tools"]) for r in part), n))
            if kind == "test":
                report_escalations(answers)
        print("   status and escalation agree with each other (alert exactly when escalating):", pct(sum((a["overall_status"] == "alert") == a["contact_ground_support"] for _, a in good), len(good)))
        print("   names equipment that is not on board:", pct(sum(names_missing_tool(a, r["tools"]) for r, a in good), len(good)))
        secs = sorted(r["sec"] for r in part)
        print(f"   seconds per answer: median {statistics.median(secs):.1f}, 95th percentile {secs[max(0, int(0.95 * len(secs)) - 1)]:.1f}, slowest {secs[-1]:.1f}; over 12 s: {sum(s > 12 for s in secs)}")


def report_escalations(answers):
    """Which escalation rules the model caught. An answer that is not well formed counts as not escalating."""
    escalated = lambda a: schema_ok(a) and a["contact_ground_support"]
    due = [(r, a) for r, a in answers if r["taught"]["contact_ground_support"]]
    rest = [(r, a) for r, a in answers if not r["taught"]["contact_ground_support"]]
    print(f"   escalations caught: {pct(sum(escalated(a) for _, a in due), len(due))}")
    print("   by reason, caught / cases (a case with two reasons counts under both; alone = it is the only reason):")
    names = {name for r, _ in due for name in reasons(r["taught"])}
    count = lambda name, alone: [escalated(a) for r, a in due if name in reasons(r["taught"]) and (not alone or len(reasons(r["taught"])) == 1)]
    for name in sorted(names, key=lambda name: (-len(count(name, False)), name)):
        every, alone = count(name, False), count(name, True)
        print(f"      {name}: {sum(every)}/{len(every)}, alone {sum(alone)}/{len(alone)}")
    extra = [(r, a) for r, a in rest if escalated(a)]
    held = [(r, a) for r, a in rest if r["taught"]["baseline_comparison"].endswith("escalate: no (sensor not verified)")]
    print(f"   escalated when the rule engine did not: {len(extra)} of {len(rest)}")
    print(f"      of those, where the rules hold an escalation back because the sensor is not verified: {sum(escalated(a) for _, a in held)} of {len(held)}")
    print("   missed escalations:", ", ".join(r["id"] for r, a in due if not escalated(a)) or "none")
    print("   escalated when it should not:", ", ".join(r["id"] for r, _ in extra) or "none")


if __name__ == "__main__":
    main()
