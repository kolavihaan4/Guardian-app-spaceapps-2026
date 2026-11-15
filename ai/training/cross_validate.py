"""Cross-validates the fine-tune: trains it once per fold on the other folds of data/train.jsonl and
scores it on the fold it did not see.

Run from ai/training on the PC, once train_cuda.py works there (README-PC.md, step 9):

  .venv\\Scripts\\python cross_validate.py | Tee-Object runs\\cv.report.txt     # Windows
  .venv/bin/python cross_validate.py | tee runs/cv.report.txt                  # Linux

What it measures is the recipe (train_cuda.py with its settings), not one trained model: every
training case is scored exactly once, by a model that never saw it. The figure is "status right",
the same one classical_baselines.py prints, so the two can sit in one table. Alert is exactly the
cases that escalate, so a right status is a right flag and a right escalation.

How a case is scored: the model writes its answer from the prompt alone, and the script reads the
answer up to the status and stops there. The status comes straight after the rule checklist, and
nothing written after it can change it, so the rest of the answer is not generated.

What it does not measure: the 4-bit model Ollama serves (this runs the full-precision model, without
Ollama's answer format), the wording of the rest of the answer, or how long a whole answer takes.
evaluate.py through Ollama measures those.

Each fold's result is saved to runs/cv/ as soon as it is done. If the run stops, start it again
with the same settings and it carries on from the next fold. No adapter is saved.
"""
import argparse
import contextlib
import gc
import hashlib
import json
import random
import re
import statistics
import sys
import time
from pathlib import Path

import torch
from transformers import AutoTokenizer

from check_leakage import audit
from train_cuda import NO_THINKING, adapted_model, encode, fit, ollama_prompt, pick_device, seed_everything, training_arguments

HERE = Path(__file__).parent
STATUS = re.compile(r'"overall_status"\s*:\s*"(nominal|caution|alert)"')
# what makes two runs the same run: a saved fold is reused only when all of these match
SETTINGS = ["model", "epochs", "lr", "rank", "scale", "layers", "accumulate", "max_tokens", "seed", "limit", "folds"]


def stratified_folds(statuses, count, seed):
    """A fold number for every case. Each status is shuffled and dealt out in turn, so every fold has the same mix."""
    fold, dealt, rng = [0] * len(statuses), 0, random.Random(seed)
    for status in sorted(set(statuses)):
        members = [i for i, s in enumerate(statuses) if s == status]
        rng.shuffle(members)
        for i in members:
            fold[i] = dealt % count
            dealt += 1
    return fold


def write_statuses(model, tokenizer, prompts, budget, batch, device):
    """The start of the model's answer to each prompt: `budget` tokens, enough to reach the status."""
    tokenizer.padding_side = "left"  # the answers must start where the prompts end
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    answers = [None] * len(prompts)
    by_length = sorted(range(len(prompts)), key=lambda i: len(prompts[i]))
    model.eval()
    for start in range(0, len(by_length), batch):
        picked = by_length[start : start + batch]
        inputs = tokenizer([prompts[i] for i in picked], return_tensors="pt", padding=True, add_special_tokens=False).to(device)
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16) if device.type == "cuda" else contextlib.nullcontext():
            # do_sample=False takes the likeliest token every time, so the same model always writes the same answer
            written = model.generate(**inputs, max_new_tokens=budget, do_sample=False, temperature=None, top_p=None, top_k=None, use_cache=True, pad_token_id=tokenizer.pad_token_id)
        for i, text in zip(picked, tokenizer.batch_decode(written[:, inputs.input_ids.shape[1] :], skip_special_tokens=True)):
            answers[i] = text
    return answers


def tally(cases):
    due = [c for c in cases if c["status"] == "alert"]
    calm = [c for c in cases if c["status"] != "alert"]
    return {
        "cases": len(cases),
        "right": sum(c["predicted"] == c["status"] for c in cases),
        "escalations": len(due),
        "caught": sum(c["predicted"] == "alert" for c in due),
        "calm": len(calm),
        "wrong_escalations": sum(c["predicted"] == "alert" for c in calm),
        "no_status": sum(c["predicted"] is None for c in cases),
    }


def line(n):
    return (f"status right {n['right']}/{n['cases']} ({100 * n['right'] / n['cases']:.1f}%); escalations caught {n['caught']}/{n['escalations']}; "
            f"escalated when it should not {n['wrong_escalations']}/{n['calm']}; no status written {n['no_status']}")


def main():
    ap = training_arguments(argparse.ArgumentParser())
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--score-batch", type=int, default=8, help="answers written at once when scoring; lower it if scoring runs out of GPU memory")
    args = ap.parse_args()
    # show each line as it is printed, also when the output goes to a file or to Tee-Object
    sys.stdout.reconfigure(line_buffering=True)

    if audit():
        sys.exit("Nothing was trained: the leakage check above found a leak. Fix the data first.")
    device = pick_device(args.device)
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}, {torch.cuda.get_device_properties(0).total_memory / 2**30:.0f} GB")

    text = (HERE / "data/train.jsonl").read_text(encoding="utf-8")
    rows = [json.loads(row)["messages"] for row in text.splitlines()][: args.limit]
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    encoded = [encode(messages, tokenizer) for messages in rows]
    prompts = [ollama_prompt(messages[0]["content"], messages[1]["content"]) for messages in rows]
    taught = [messages[2]["content"][len(NO_THINKING) :] for messages in rows]
    statuses = [STATUS.search(answer).group(1) for answer in taught]
    # the longest taught answer, counted up to its status, with room to spare
    budget = 16 + max(len(tokenizer(answer[: STATUS.search(answer).end()], add_special_tokens=False).input_ids) for answer in taught)
    fold = stratified_folds(statuses, args.folds, args.seed)
    settings = {name: getattr(args, name) for name in SETTINGS} | {"train_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16].upper()}

    print(f"== cross-validation of the fine-tune: {args.folds} folds of data/train.jsonl ({len(rows)} cases), {budget} tokens written per answer")
    saved = HERE / "runs/cv"
    saved.mkdir(parents=True, exist_ok=True)
    results = []
    for k in range(args.folds):
        path = saved / f"fold{k + 1}.json"
        if path.exists() and json.loads(path.read_text(encoding="utf-8"))["settings"] == settings:
            results.append(json.loads(path.read_text(encoding="utf-8")))
            print(f"-- fold {k + 1} of {args.folds}: already done in an earlier run, read from {path.name}")
            continue
        held = [i for i in range(len(rows)) if fold[i] == k]
        train = [encoded[i] for i in range(len(rows)) if fold[i] != k and sum(map(len, encoded[i])) <= args.max_tokens]
        print(f"-- fold {k + 1} of {args.folds}: training on {len(train)} cases, then scoring the {len(held)} it did not see")
        seed_everything(args.seed)
        model = adapted_model(args, device)
        train_minutes = fit(model, train, [encoded[i] for i in held[: args.val_cases]], args, device)
        began = time.time()
        answers = write_statuses(model, tokenizer, [prompts[i] for i in held], budget, args.score_batch, device)
        cases = []
        for i, answer in zip(held, answers):
            found = STATUS.search(answer)
            cases.append({"id": f"train-{i + 1}", "status": statuses[i], "predicted": found.group(1) if found else None, "answer": answer})
        result = {"settings": settings, "fold": k + 1, "train_minutes": round(train_minutes, 1), "score_minutes": round((time.time() - began) / 60, 1), "cases": cases}
        path.write_text(json.dumps(result, indent=1), encoding="utf-8")
        results.append(result)
        print(f"   trained in {result['train_minutes']} min, scored in {result['score_minutes']} min; about {(args.folds - k - 1) * (result['train_minutes'] + result['score_minutes']):.0f} min left")
        del model
        gc.collect()
        if device.type == "cuda":
            torch.cuda.empty_cache()

    print(f"== result: {args.folds}-fold cross-validation of the fine-tune")
    for result in results:
        print(f"   fold {result['fold']}: {line(tally(result['cases']))}")
    shares = [100 * tally(result["cases"])["right"] / len(result["cases"]) for result in results]
    print(f"   all folds: {line(tally([case for result in results for case in result['cases']]))}")
    print(f"   per fold {' '.join(f'{share:.1f}' for share in shares)}; mean {statistics.mean(shares):.1f}, spread (standard deviation) {statistics.pstdev(shares):.1f}")
    wrong = [f"{case['id']} ({case['status']} -> {case['predicted'] or 'none'})" for result in results for case in result["cases"] if case["predicted"] != case["status"]]
    print(f"   wrong: {', '.join(wrong) or 'none'}")
    print(f"== every answer is in {saved}")


if __name__ == "__main__":
    main()
