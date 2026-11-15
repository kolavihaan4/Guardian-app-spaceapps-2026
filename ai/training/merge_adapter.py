"""Merges a trained adapter into the base model and writes the Modelfile Ollama needs.

Run from ai/training after train_cuda.py (README-PC.md has the whole sequence):

  .venv\\Scripts\\python merge_adapter.py --adapter adapters/pc-v1 --out export/pc-v1

Writes <out>/merged (the whole model as safetensors, about 16 GB for Qwen3-8B) and <out>/Modelfile.
The Modelfile points at <out>/model-q4_k_m.gguf, which llama.cpp makes from the merged folder.

Needs Ollama with qwen3:8b pulled: the Modelfile reuses that model's prompt template word for word.
Ollama keeps the answer's fields in the schema's order with its stock qwen3 template and sorts them
alphabetically with a hand-written one (measured on Ollama 0.40.16), and the checklist has to come first.
"""
import argparse
import json
import shutil
import subprocess
from pathlib import Path

import torch
from huggingface_hub import snapshot_download
from peft import PeftModel
from transformers import AutoModelForCausalLM

HERE = Path(__file__).parent
TOKENIZER_FILES = ["tokenizer.json", "tokenizer_config.json", "vocab.json", "merges.txt"]


def stock_template(model="qwen3:8b"):
    try:
        shown = subprocess.run(["ollama", "show", "--modelfile", model], capture_output=True, text=True, encoding="utf-8")
    except FileNotFoundError:
        raise SystemExit("Ollama is not installed or not on the PATH. Install it, then run: ollama pull qwen3:8b")
    if shown.returncode or 'TEMPLATE """' not in shown.stdout:
        raise SystemExit(f"Could not read the prompt template of {model}. Run: ollama pull {model}\n{shown.stderr.strip()}")
    return shown.stdout.split('TEMPLATE """', 1)[1].split('"""', 1)[0]


def copy_tokenizer(base_name, dest):
    """The tokenizer files exactly as published, so llama.cpp's converter reads what it expects."""
    source = Path(base_name) if Path(base_name).is_dir() else Path(snapshot_download(base_name, allow_patterns=TOKENIZER_FILES))
    for name in TOKENIZER_FILES:
        if (source / name).exists():
            shutil.copy(source / name, dest / name)


def modelfile(gguf_name, template, system):
    if '"""' in system:
        raise SystemExit('system_prompt.txt contains """, which a Modelfile cannot hold.')
    return "\n".join([
        f"FROM ./{gguf_name}",
        f'TEMPLATE """{template}"""',
        f'SYSTEM """{system}"""',
        "PARAMETER stop <|im_start|>",
        "PARAMETER stop <|im_end|>",
        "PARAMETER temperature 0",       # the same request should always get the same checklist
        "PARAMETER repeat_penalty 1",    # the checklist repeats words on purpose
        "PARAMETER num_ctx 4096",
        "",
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adapter", default="adapters/pc-v1")
    ap.add_argument("--out", default="export/pc-v1")
    ap.add_argument("--device", default="cuda", choices=["cuda", "mps", "cpu"])
    ap.add_argument("--gguf-name", default="model-q4_k_m.gguf")
    args = ap.parse_args()

    adapter, out = HERE / args.adapter, HERE / args.out
    template = stock_template()  # first, so a missing Ollama stops the run before the long part
    base_name = json.loads((adapter / "adapter_config.json").read_text(encoding="utf-8"))["base_model_name_or_path"]
    cuda = args.device == "cuda"
    if cuda and not torch.cuda.is_available():
        raise SystemExit("PyTorch cannot see an NVIDIA GPU. Use --device cpu (slow, and needs about 20 GB of free memory for Qwen3-8B).")

    base = AutoModelForCausalLM.from_pretrained(base_name, dtype=torch.bfloat16 if cuda else torch.float32, device_map={"": args.device})
    merged = PeftModel.from_pretrained(base, adapter).merge_and_unload()
    merged.save_pretrained(out / "merged", safe_serialization=True)
    copy_tokenizer(base_name, out / "merged")

    system = (HERE / "system_prompt.txt").read_text(encoding="utf-8").strip()
    (out / "Modelfile").write_text(modelfile(args.gguf_name, template, system), encoding="utf-8", newline="\n")
    print(f"merged model: {out / 'merged'}")
    print(f"Modelfile:    {out / 'Modelfile'} (expects {out / args.gguf_name})")


if __name__ == "__main__":
    main()
