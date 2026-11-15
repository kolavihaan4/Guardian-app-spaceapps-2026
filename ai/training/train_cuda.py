"""Fine-tunes Qwen3-8B on an NVIDIA GPU. This is the PC route; the Mac route is lora_config.yaml (MLX).

Run from ai/training once the data exists (README-PC.md has the whole sequence):

  .venv\\Scripts\\python train_cuda.py          # Windows
  .venv/bin/python train_cuda.py               # Linux

The recipe is round 2's, so the two can be compared: LoRA rank 16 on every linear layer of the last
16 blocks, the loss counted on the answer only, one pass over data/train.jsonl, Adam at 4e-5 with an
update every 2 examples. Three things differ from the Mac: the base model is the full-precision
Qwen/Qwen3-8B, not a 4-bit copy; the prompt is laid out the way Ollama serves it (see ollama_prompt);
and the adapter is saved in PEFT format.
"""
import argparse
import contextlib
import json
import random
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

HERE = Path(__file__).parent
LINEAR_LAYERS = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


def pick_device(name):
    if name == "cuda" and not torch.cuda.is_available():
        raise SystemExit(
            f"PyTorch {torch.__version__} cannot see an NVIDIA GPU. The usual cause is the CPU build of PyTorch: "
            "reinstall it from https://download.pytorch.org/whl/cu132 (README-PC.md, step 2), update the NVIDIA driver and check nvidia-smi."
        )
    return torch.device(name)


NO_THINKING = "<think>\n\n</think>\n\n"


def ollama_prompt(system, user):
    """The prompt exactly as Ollama's stock qwen3 template writes it when the request says think: false.

    Training on this layout means the model is served the same text it was trained on. Ollama keeps
    the answer's fields in the schema's order only with its stock template, so that is the one to match.
    """
    return f"<|im_start|>system\n\n{system}<|im_end|>\n<|im_start|>user\n{user} /no_think<|im_end|>\n<|im_start|>assistant\n{NO_THINKING}"


def encode(messages, tokenizer):
    """(prompt tokens, answer tokens) for one line of train.jsonl or valid.jsonl."""
    system, user, taught = (m["content"] for m in messages)
    if not taught.startswith(NO_THINKING):
        raise SystemExit("A taught answer does not start with the empty thinking block; regenerate the data with make_dataset.mts.")
    answer = taught[len(NO_THINKING):] + "<|im_end|>"
    ids = lambda text: tokenizer(text, add_special_tokens=False).input_ids
    return ids(ollama_prompt(system, user)), ids(answer)


def load(path, tokenizer, max_tokens, limit):
    rows, too_long = [], 0
    for line in open(path, encoding="utf-8"):
        prompt, answer = encode(json.loads(line)["messages"], tokenizer)
        if len(prompt) + len(answer) > max_tokens:
            too_long += 1
            continue
        rows.append((prompt, answer))
        if limit and len(rows) == limit:
            break
    return rows, too_long


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen3-8B", help="Hugging Face name or a local folder")
    ap.add_argument("--out", default="adapters/pc-v1")
    ap.add_argument("--device", default="cuda", choices=["cuda", "mps", "cpu"])
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--lr", type=float, default=4e-5)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--scale", type=float, default=20.0, help="LoRA multiplier, as in lora_config.yaml")
    ap.add_argument("--layers", type=int, default=16, help="how many of the last blocks get adapters")
    ap.add_argument("--accumulate", type=int, default=2, help="examples per update")
    ap.add_argument("--max-tokens", type=int, default=2048)
    ap.add_argument("--eval-every", type=int, default=200)
    ap.add_argument("--val-cases", type=int, default=20)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--limit", type=int, help="only the first N training examples (smoke test)")
    ap.add_argument("--grad-checkpoint", action="store_true", help="slower, but needs much less GPU memory")
    args = ap.parse_args()

    device = pick_device(args.device)
    cuda = device.type == "cuda"
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if cuda:
        print(f"GPU: {torch.cuda.get_device_name(0)}, {torch.cuda.get_device_properties(0).total_memory / 2**30:.0f} GB")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    train, long_train = load(HERE / "data/train.jsonl", tokenizer, args.max_tokens, args.limit)
    valid, _ = load(HERE / "data/valid.jsonl", tokenizer, args.max_tokens, args.val_cases)
    print(f"train: {len(train)} examples ({long_train} over {args.max_tokens} tokens left out), validation: {len(valid)}")

    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.bfloat16 if cuda else torch.float32, device_map={"": device})
    model.config.use_cache = False
    if args.grad_checkpoint:
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    blocks = model.config.num_hidden_layers
    model = get_peft_model(model, LoraConfig(
        r=args.rank, lora_alpha=args.scale * args.rank, lora_dropout=0.0, target_modules=LINEAR_LAYERS,
        layers_to_transform=list(range(blocks - args.layers, blocks)), task_type="CAUSAL_LM",
    ))
    params = [p for p in model.parameters() if p.requires_grad]
    print(f"adapter: {sum(p.numel() for p in params):,} trainable values on the last {args.layers} of {blocks} blocks")
    optimizer = torch.optim.Adam(params, lr=args.lr)

    lm = model.get_base_model()  # the adapted model without PEFT's wrapper
    decoder, output_layer = lm.base_model, lm.get_output_embeddings()

    def loss_of(prompt, answer):
        """Cross-entropy over the answer's tokens. Only their positions go through the output layer, which saves GPU memory."""
        ids = torch.tensor([prompt + answer], device=device)
        target = torch.tensor(answer, device=device)
        with torch.autocast("cuda", dtype=torch.bfloat16) if cuda else contextlib.nullcontext():
            hidden = decoder(input_ids=ids).last_hidden_state[0, len(prompt) - 1 : -1]  # position i predicts token i + 1
            return torch.nn.functional.cross_entropy(output_layer(hidden).float(), target)

    def validation_loss():
        model.eval()
        with torch.no_grad():
            total = sum(loss_of(p, a).item() * len(a) for p, a in valid)
        model.train()
        return total / sum(len(a) for _, a in valid)

    steps = len(train) * args.epochs
    print(f"step 0/{steps}  validation loss {validation_loss():.3f}")
    model.train()
    start, recent, step = time.time(), [], 0
    for _ in range(args.epochs):
        for prompt, answer in random.sample(train, len(train)):
            step += 1
            loss = loss_of(prompt, answer)
            (loss / args.accumulate).backward()
            if step % args.accumulate == 0 or step == steps:
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
            recent.append(loss.item())
            if step % 20 == 0 or step == steps:
                minutes_left = (time.time() - start) / step * (steps - step) / 60
                print(f"step {step}/{steps}  loss {sum(recent) / len(recent):.3f}  about {minutes_left:.0f} min left", flush=True)
                recent = []
            if step % args.eval_every == 0 or step == steps:
                print(f"step {step}/{steps}  validation loss {validation_loss():.3f}", flush=True)

    model.save_pretrained(HERE / args.out)
    print(f"saved the adapter to {HERE / args.out} after {(time.time() - start) / 60:.1f} min")
    if cuda:
        print(f"peak GPU memory: {torch.cuda.max_memory_allocated() / 2**30:.1f} GB")


if __name__ == "__main__":
    main()
