# Fine-tuning on the RTX 5090 PC

This trains the triage model on the PC's RTX 5090, turns the result into an Ollama model and scores it on the same 106 held-out cases as the Mac runs. Follow the steps in order; commands are for Windows PowerShell.

| Scored on the 106 held-out cases | Flag and escalation both right |
|---|---|
| The model the app uses today (`astrovitals-triage`) | 76 (71.7%) |
| Round 2, trained on the Mac | 97 (91.5%) |
| The rule engine | 106 (100%) |

The PC run uses round 2's recipe, so the target is about 97. It differs from the Mac in three ways: it trains on the full-precision Qwen3-8B, not a 4-bit copy; it trains on the exact prompt layout Ollama serves; and it ends as an Ollama model, which round 2 never did.

**You need:** Windows 11, a current NVIDIA driver, about 75 GB of free disk and about 25 GB of downloads.

## How far this has been tested

- **Tested on the Mac, with the small Qwen3-0.6B model:** `train_cuda.py` (loss falls, adapter saved, low-memory option included), `merge_adapter.py`, the Modelfile it writes, and `evaluate.py` through Ollama 0.40.16.
- **Also tested on the Mac with the small model:** `cross_validate.py` (step 9) end to end on two folds, resuming after a stop, and its scoring: a stand-in model that writes the known answers scores 2,000 of 2,000, and altering 10 answers gives exactly 10 wrong.
- **Not tested:** anything on the 5090 itself, and the llama.cpp conversion in step 5. Those commands are written from llama.cpp's own documentation and release files (build `b12415`).

If something fails, it is most likely the GPU setup in step 4 or the conversion in step 5. The table at the end covers the failures I could foresee.

## 1. Install the tools (once)

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install astral-sh.uv
winget install Ollama.Ollama
```

Close PowerShell, open a new window, then:

```powershell
nvidia-smi              # must list the RTX 5090
ollama pull qwen3:8b    # 5.2 GB; step 5 copies its prompt template
```

## 2. Get the code

```powershell
git clone https://github.com/kolavihaan4/astrovitals-spaceapps-2026.git
cd astrovitals-spaceapps-2026
git checkout model-training
npm install
```

If the repository is already on the PC, run `git fetch` and `git checkout model-training` in it instead of cloning.

`npm install` may warn that some packages' install scripts were not run. The steps in this guide do not need them.

## 3. Build the training data

```powershell
npx tsx ai/training/make_dataset.mts
cd ai\training
(Get-FileHash data\train.jsonl).Hash.Substring(0,16)
```

Check two things before going on:

- The generator's last line reads `held-out: 106 cases, rule engine agrees on 106`.
- The hash is `E06EC31B023E03A9`. That is the data the Mac trained on (as of 15 November 2026; it changes whenever the rules in `apps/server/src/routes/ai.ts` change). A different hash means the PC would train on different data, so stop and find out why.

Every later command runs from `ai\training`.

## 4. Set up Python and train

```powershell
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe torch==2.15.0 --index-url https://download.pytorch.org/whl/cu132
uv pip install --python .venv\Scripts\python.exe -r requirements-pc.txt
.venv\Scripts\python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

The last command must print `2.15.0+cu132 True` and the card's name. If it prints `False`, see the table at the end before training.

Check the data for leakage before training on it:

```powershell
.venv\Scripts\python check_leakage.py
```

It must end with `== no leak found`. It compares the four data files and exits with an error if a test case repeats a training case, or if a prompt carries its own answer.

Close games and other programs that use the GPU, then train:

```powershell
mkdir -Force runs
.venv\Scripts\python train_cuda.py | Tee-Object runs\pc-v1.train.log
```

The first run downloads Qwen3-8B (16 GB). What to expect on screen:

- `adapter: 19,398,656 trainable values on the last 16 of 36 blocks`. That number is round 2's adapter exactly.
- `train: 1999 examples` or `2000`, and a progress line every 20 steps.
- A validation loss that starts between 2 and 3 and ends below 0.02. The Mac's ended at 0.005.

The adapter is saved to `adapters\pc-v1`. I expect the run to take minutes, not hours, but it has not been timed on a 5090.

## 5. Build the Ollama model

Merge the adapter into the base model. This also writes the Modelfile:

```powershell
.venv\Scripts\python merge_adapter.py
```

Convert the merged model to Ollama's file format with llama.cpp. Its converter gets its own Python environment, because its requirements install the CPU build of PyTorch and would replace the GPU build from step 4:

```powershell
git clone --depth 1 --branch b12415 https://github.com/ggml-org/llama.cpp tools\llama.cpp
uv venv --seed --python 3.12 tools\gguf-venv
tools\gguf-venv\Scripts\python -m pip install -r tools\llama.cpp\requirements\requirements-convert_hf_to_gguf.txt
tools\gguf-venv\Scripts\python tools\llama.cpp\convert_hf_to_gguf.py export\pc-v1\merged --outfile export\pc-v1\model-f16.gguf --outtype f16
```

Shrink it to 4-bit, the same size class as the model the app uses today:

```powershell
curl.exe -L -o tools\llama-bin.zip https://github.com/ggml-org/llama.cpp/releases/download/b12415/llama-b12415-bin-win-cpu-x64.zip
Expand-Archive tools\llama-bin.zip tools\llama-bin
tools\llama-bin\llama-quantize.exe export\pc-v1\model-f16.gguf export\pc-v1\model-q4_k_m.gguf Q4_K_M
```

Register it with Ollama, from the folder that holds the Modelfile:

```powershell
cd export\pc-v1
ollama create astrovitals-triage-ft -f Modelfile
cd ..\..
```

## 6. Score it

```powershell
.venv\Scripts\python evaluate.py ollama --model astrovitals-triage-ft --name pc-v1 --valid-limit 60 | Tee-Object runs\pc-v1.report.txt
```

It answers 166 cases and prints nothing until the end. The lines that matter:

| Line in the report | What to compare it with |
|---|---|
| `both correct` under `heldout` | 97 of 106 for round 2, 76 for today's model |
| `escalations missed` and `escalated when it should not` | 1 of 16 and 3 of 90 for round 2 |
| `status matches the rule engine` under `valid` | 60 of 60 for round 2 |
| `over 12 s` | Should be 0. The app gives up on the model after 12 seconds |

## 7. Send the results back

- Paste `runs\pc-v1.report.txt` into the chat. `runs\` is not committed, so it does not travel through git.
- Keep `export\pc-v1\model-q4_k_m.gguf` and `export\pc-v1\Modelfile`. Those two files are the whole model: copying them to another machine and running the `ollama create` line from step 5 installs it there.
- `export\pc-v1\merged` and `export\pc-v1\model-f16.gguf` (33 GB together) can be deleted once the score is in.

This guide stops at the score. Pointing the app at the new model is a separate decision.

## 8. Optional: the classical models

Random forest, support vector machine and gradient boosting on the same cases, with nested cross-validation and tuned settings. It needs no GPU:

```powershell
uv pip install --python .venv\Scripts\python.exe -r requirements-classical.txt
.venv\Scripts\python classical_baselines.py | Tee-Object runs\classical.report.txt
```

It runs the leakage check first, then prints one model at a time; about 4 minutes on the Mac. The Mac's numbers are in `ai\README.md`. This step has not been run on Windows.

## 9. Optional: cross-validate the fine-tune

This trains the fine-tune five times, each time on four fifths of `data\train.jsonl`, and scores each model on the fifth it did not see. The result is a cross-validated accuracy for the training recipe, the same figure step 8 prints for the classical models. Close games and other GPU programs first, as for step 4:

```powershell
.venv\Scripts\python cross_validate.py | Tee-Object runs\cv.report.txt
```

- **How long:** five trainings of 1,600 cases plus 2,000 short answers. It has not been timed on a 5090; after the first fold it prints an estimate for the rest.
- **If it stops:** run the same command again. Finished folds are read from `runs\cv\` and it carries on from the next one.
- **If scoring runs out of GPU memory:** add `--score-batch 2`. If training does, add `--grad-checkpoint`, as in step 4.
- **A shorter run:** `--folds 3` trains three times on two thirds of the cases.

The lines to send back are the ones under `== result`. The two that matter have this layout:

```
   all folds: status right ____/2000 (__._%); escalations caught ___/552; escalated when it should not ___/1448; no status written ___
   per fold __._ __._ __._ __._ __._; mean __._, spread (standard deviation) _._
```

This step measures the full-precision model writing its checklist and status; it does not measure the 4-bit Ollama model from step 5, which step 6 scores.

## If something goes wrong

| What you see | What to do |
|---|---|
| `npm` or `npx` says running scripts is disabled on this system | Type `npm.cmd` and `npx.cmd` instead |
| Step 4's check prints `False`, or `train_cuda.py` says it cannot see an NVIDIA GPU | Update the NVIDIA driver, then rerun the `torch==2.15.0` install line. The CPU build of PyTorch gives the same message |
| Training stops with `CUDA out of memory` | Run `ollama ps`; if it lists a model, run `ollama stop` with that model's name. Then rerun training with `--grad-checkpoint` added (slower, much less memory) |
| The hash in step 3 is different | Do not train. The rules or the generator on the PC differ from the Mac's |
| `merge_adapter.py` cannot read the prompt template | Start Ollama and run `ollama pull qwen3:8b` |
| The `b12415` download or branch is gone | Pick the newest build on the [llama.cpp releases page](https://github.com/ggml-org/llama.cpp/releases) that lists a `bin-win-cpu-x64.zip`, and use that build number in both the `git clone` and the `curl.exe` lines |
| `convert_hf_to_gguf.py` or `llama-quantize.exe` fails | This step is untested. Send the error text back; the adapter in `adapters\pc-v1` is safe and nothing needs retraining |
| The score is far below 97 | Send the report anyway. Shrinking to 4-bit after training may cost accuracy, and that is not measured yet |

On Linux the steps are the same with `.venv/bin/python` in place of `.venv\Scripts\python` and forward slashes in paths.
