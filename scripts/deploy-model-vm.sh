#!/usr/bin/env bash
# Sets up the triage model server on a Linux machine with an NVIDIA GPU (see docs/DEPLOY_GOOGLE_CLOUD.md,
# "The triage model"). Run it from the repository folder on that machine:
#
#   bash scripts/deploy-model-vm.sh gs://guardian-models-1c55f5a5/triage-ft-v2
#
# The bucket folder holds either astrovitals-triage-ft-v2.tar and its .sha256 (Ollama's own model
# store, exported from the Mac; ai/README.md) or model-q4_k_m.gguf and Modelfile (README-PC.md,
# step 5). The script downloads them, starts Ollama in Docker with the GPU, registers the model and
# warms it up. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

src="${1:-${MODEL_SOURCE:-}}"
[ -n "$src" ] || { echo "usage: bash scripts/deploy-model-vm.sh gs://bucket/folder   (the folder holds model-q4_k_m.gguf and Modelfile)" >&2; exit 1; }
name="${MODEL_NAME:-astrovitals-triage-ft-v2}"
dir="${MODEL_DIR:-$HOME/triage-model}"

nvidia-smi -L >/dev/null 2>&1 || { echo "No NVIDIA driver is loaded. On a Deep Learning VM image, wait for the first boot to finish installing it, then run this again." >&2; exit 1; }

if ! command -v docker >/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
fi
docker="docker"
docker info >/dev/null 2>&1 || docker="sudo docker"

if ! $docker run --rm --gpus all ubuntu:22.04 true >/dev/null 2>&1; then
  echo "Installing the NVIDIA container toolkit so Docker can use the GPU..."
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null
  sudo apt-get update -qq && sudo apt-get install -y -qq nvidia-container-toolkit
  sudo nvidia-ctk runtime configure --runtime=docker
  sudo systemctl restart docker
fi

mkdir -p "$dir"
# Either Ollama's own store as a tar (the int4 build scored 88 of 106), or a GGUF and Modelfile.
tar_name="$name.tar"
if [ -f "$dir/$tar_name" ] || gcloud storage ls "$src/$tar_name" >/dev/null 2>&1; then
  kind=tar
  if [ ! -f "$dir/$tar_name" ]; then
    echo "Downloading $tar_name from $src (about 7 GB)..."
    gcloud storage cp "$src/$tar_name" "$src/$tar_name.sha256" "$dir/"
  fi
  (cd "$dir" && sha256sum -c "$tar_name.sha256")
else
  kind=gguf
  if [ ! -f "$dir/model-q4_k_m.gguf" ] || [ ! -f "$dir/Modelfile" ]; then
    echo "Downloading the model files from $src (about 5 GB)..."
    gcloud storage cp "$src/model-q4_k_m.gguf" "$src/Modelfile" "$dir/"
  fi
fi

# Serve on the machine's internal address only. Google Cloud's metadata server knows it; otherwise take the first local address.
ip="$(curl -fs -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ip' 2>/dev/null || hostname -I | awk '{print $1}')"

cd ai/model_server
BIND_IP="$ip" MODEL_DIR="$dir" $docker compose up -d
for _ in $(seq 1 60); do curl -fs "http://$ip:11434/api/version" >/dev/null && break; sleep 2; done
echo "Registering the model with Ollama..."
if [ "$kind" = tar ]; then
  $docker compose exec -T ollama tar -xf "/models/$tar_name" -C /root/.ollama/models
  $docker compose restart ollama
  for _ in $(seq 1 60); do curl -fs "http://$ip:11434/api/version" >/dev/null && break; sleep 2; done
else
  $docker compose exec -T ollama sh -c "cd /models && ollama create $name -f Modelfile"
fi
echo "Loading it onto the GPU..."
curl -fs "http://$ip:11434/api/generate" -d "{\"model\":\"$name\",\"prompt\":\"ok\",\"stream\":false,\"think\":false,\"keep_alive\":-1}" >/dev/null
$docker compose exec -T ollama ollama ps
echo
echo "Triage model '$name' is serving on http://$ip:11434 (internal network only)."
echo "On the website machine, add these lines to .env and run: bash scripts/deploy-vm.sh"
echo "  TRIAGE_BACKEND=ollama"
echo "  OLLAMA_URL=http://$ip:11434"
echo "  OLLAMA_TRIAGE_MODEL=$name"
