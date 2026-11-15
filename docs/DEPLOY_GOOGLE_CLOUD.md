# Running Guardian on Google Cloud

One Compute Engine virtual machine runs everything with Docker Compose:

| Container | What it is | Reachable from |
| --- | --- | --- |
| `caddy` | Web front door; gets and renews the HTTPS certificate | the internet (ports 80, 443) |
| `app` | The Node server and the built website | `caddy` only |
| `scans` | The Python service that runs the ultrasound models | `app` only |

Accounts and health data live in a SQLite file on a Docker volume on the VM's disk, so they
survive restarts and rebuilds.

The production build of the site has been checked locally (served by the Node server, with the
ultrasound service beside it). The Docker files have not been built yet: they were written on a
machine without Docker, so expect to fix small things the first time.

## Before you start

- A Google Cloud project with billing turned on.
- A host name for the site. Sign-in needs HTTPS, and a certificate needs a name. Either
  - a domain you own (for example from GoDaddy), or
  - a free name from [sslip.io](https://sslip.io): for the address `34.12.34.56` the name is
    `34-12-34-56.sslip.io`, with nothing to register.

## 1. Create the VM

In the Cloud Console: **Compute Engine → VM instances → Create instance**.

- Machine type: `e2-medium` (2 vCPU, 4 GB). The models need about 2 GB with the site beside them.
- Boot disk: Debian 12 or Ubuntu 24.04, 20 GB.
- Firewall: tick **Allow HTTP traffic** and **Allow HTTPS traffic**.

Then **VPC network → IP addresses → Reserve external static address** and attach it to the VM, so
the address does not change when the VM restarts.

If you use your own domain, add an `A` record pointing the host name at that address.

## 2. Get the code and start it

Open **SSH** from the VM's row in the console, then:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/kolavihaan4/astrovitals-spaceapps-2026.git guardian
cd guardian
bash scripts/deploy-vm.sh guardian.example.com     # your host name
# or, with no domain:  bash scripts/deploy-vm.sh    (uses <the VM's address>.sslip.io)
```

The script installs Docker if it is missing, creates `.env` with new secret keys, records the
host name, then builds and starts the three containers. The first build takes several minutes (it
downloads PyTorch). It prints the site's address at the end; Caddy fetches the HTTPS certificate
on the first visit, which can take a few seconds.

Keep `.env` private: the two keys in it protect stored tokens. If they change, existing device
tokens and connected accounts stop working. Put a NASA API key in `NASA_API_KEY` if you have one,
then run the script again.

`docker-compose.yml` sets the production values itself (`NODE_ENV`, `APP_ORIGIN`,
`DATABASE_PATH`, `ULTRASOUND_URL`), so the matching lines in `.env` are ignored on the VM.

<details>
<summary>The same steps by hand</summary>

```bash
curl -fsSL https://get.docker.com | sudo sh
cp .env.example .env
sed -i "s|^TOKEN_ENCRYPTION_KEY=.*|TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
sed -i "s|^DEVICE_TOKEN_PEPPER=.*|DEVICE_TOKEN_PEPPER=$(openssl rand -base64 32)|" .env
echo "SITE_DOMAIN=guardian.example.com" >> .env
sudo docker compose up -d --build
```

</details>

## Checking and updating

```bash
docker compose ps                 # all three should be "running"
docker compose logs -f app        # the site's log
docker compose logs -f scans      # should say "ultrasound service ready"
git pull && bash scripts/deploy-vm.sh        # update to the latest code (keeps .env and the data)
```

Prefix the `docker` commands with `sudo` if they report a permission error.

## Cost

The VM is billed for every hour it exists, used or not. Stop it from the console when you do not
need it; the disk and the reserved address still cost a little while it is stopped. Check current
prices in the Google Cloud pricing calculator before you start.

## The triage model (optional, needs a GPU)

On its own the site answers triage from its rule engine. To add the fine-tuned Qwen3-8B
explanations, the model runs on a second machine with an NVIDIA GPU, and the website machine sends
it requests over the project's internal network. An 8B model does not fit in the website VM's
4 GB, and on a CPU one answer takes minutes against the route's 20-second cut-off.

**Cost:** a `g2-standard-4` VM with one NVIDIA L4 is about $0.70 an hour (check the pricing
calculator). Stop it whenever it is not needed; the website keeps working and answers from the
rule engine. A T4 (`n1-standard-4` with `nvidia-tesla-t4`, about $0.55 an hour) is cheaper but
slower, so some answers would miss the cut-off: set `TRIAGE_MODEL_TIMEOUT_MS=40000` on the website
machine if you use one.

### 1. GPU quota

New projects have a GPU quota of 0. In the console, **IAM & Admin → Quotas**, find **GPUs (all
regions)** (`GPUS_ALL_REGIONS`) and request 1. Free-trial accounts cannot request GPU quota:
upgrade the billing account first (the trial credit stays). Approval is usually quick, sometimes a
day or two.

### 2. Upload the model files

The scored model (int4, 88 of 106 held-out cases) is on the Mac as an Ollama model. Ollama stores
it as 405 files, not one GGUF, so it is exported as a tar of Ollama's own store with its hash
(`ai/README.md` has how it was made and checked). From the Mac:

```bash
gcloud storage cp ~/guardian-model-export/astrovitals-triage-ft-v2.tar ~/guardian-model-export/astrovitals-triage-ft-v2.tar.sha256 gs://guardian-models-1c55f5a5/triage-ft-v2/
```

The script also still accepts `model-q4_k_m.gguf` and `Modelfile` from step 5 of
`ai/training/README-PC.md` instead, if the tar is not in the folder. That GGUF has not been scored.

### 3. Create the GPU VM

```bash
family=$(gcloud compute images list --project deeplearning-platform-release --filter="family~^common-cu.*ubuntu" --format="value(family)" | sort -u | tail -1)
gcloud compute instances create guardian-model --zone us-central1-a --machine-type g2-standard-4 \
  --accelerator type=nvidia-l4,count=1 --maintenance-policy TERMINATE \
  --image-family "$family" --image-project deeplearning-platform-release \
  --metadata install-nvidia-driver=True --boot-disk-size 60GB
```

The first boot installs the NVIDIA driver, which takes a few minutes. The VM has no web ports
open: only machines inside the project reach it.

### 4. Start the model

On the model VM (**SSH** from the console):

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/kolavihaan4/Guardian-app-spaceapps-2026.git guardian && cd guardian
bash scripts/deploy-model-vm.sh gs://guardian-models-1c55f5a5/triage-ft-v2
```

It installs Docker and the NVIDIA container toolkit if they are missing, downloads the model,
starts Ollama (`ai/model_server/docker-compose.yml`), registers the model and loads it onto the
GPU. It ends by printing three lines for the website's `.env`.

### 5. Point the website at it

On the website VM, add the three printed lines to `.env`:

```
TRIAGE_BACKEND=ollama
OLLAMA_URL=http://<model VM's internal address>:11434
OLLAMA_TRIAGE_MODEL=astrovitals-triage-ft-v2
TRIAGE_MODEL_TIMEOUT_MS=30000
```

The last line gives the model 30 s instead of 20: on an L4 it writes about 37 tokens a second, so the
longest answers take 20 s or more. The first load of the 7 GB model from the VM's disk takes three to
four minutes; the `keepwarm` container in `ai/model_server/docker-compose.yml` does that load as soon
as Ollama is up, also after a restart of the machine, and keeps the model loaded. If a zone has no L4
capacity, VM creation fails with a resource error: try `us-central1-b` or `us-central1-c`.

then run `bash scripts/deploy-vm.sh`. The Triage page's "Answered by" badge then reads
"Qwen3-8B explanation, decisions by onboard rules".

### Stopping and starting

```bash
gcloud compute instances stop guardian-model --zone us-central1-a
gcloud compute instances start guardian-model --zone us-central1-a   # Ollama comes back by itself; allow a minute
```

While the model VM is stopped, each triage request waits about 10 seconds for it before the rule
engine answers. If it will stay off for long, remove the three lines from the website's `.env`
and run `bash scripts/deploy-vm.sh` again.

## Known gaps

- The SQLite file is not backed up. For anything beyond a demo, snapshot the VM disk.
