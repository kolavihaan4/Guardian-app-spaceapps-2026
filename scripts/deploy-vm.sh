#!/usr/bin/env bash
# Sets up and starts Guardian on a fresh Linux virtual machine (see docs/DEPLOY_GOOGLE_CLOUD.md).
# Run it from the repository folder on the VM:
#
#   bash scripts/deploy-vm.sh guardian.example.com
#   bash scripts/deploy-vm.sh            # no domain: uses <the VM's public address>.sslip.io
#
# Safe to run again: it keeps an existing .env (and so the keys in it) and rebuilds the containers.
set -euo pipefail
cd "$(dirname "$0")/.."

domain="${1:-}"
# Run again without a host name: keep the one already recorded.
if [ -z "$domain" ] && [ -f .env ]; then domain="$(sed -n 's/^SITE_DOMAIN=//p' .env | tail -1)"; fi
if [ -z "$domain" ]; then
  # Google Cloud's metadata server knows the VM's public address; fall back to asking the internet.
  ip="$(curl -fs -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip' 2>/dev/null || curl -fs https://api.ipify.org)"
  [ -n "$ip" ] || { echo "Could not find this machine's public address. Pass the site's host name as the first argument." >&2; exit 1; }
  domain="${ip//./-}.sslip.io"
fi

if ! command -v docker >/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
fi
docker="docker"
docker info >/dev/null 2>&1 || docker="sudo docker"

if [ ! -f .env ]; then
  echo "Creating .env with new secret keys..."
  cp .env.example .env
  sed -i "s|^TOKEN_ENCRYPTION_KEY=.*|TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
  sed -i "s|^DEVICE_TOKEN_PEPPER=.*|DEVICE_TOKEN_PEPPER=$(openssl rand -base64 32)|" .env
fi
# docker compose reads SITE_DOMAIN from .env.
if grep -q '^SITE_DOMAIN=' .env; then sed -i "s|^SITE_DOMAIN=.*|SITE_DOMAIN=$domain|" .env; else printf '\nSITE_DOMAIN=%s\n' "$domain" >> .env; fi

echo "Building and starting (the first build downloads PyTorch and takes several minutes)..."
$docker compose up -d --build
$docker compose ps
echo
echo "Guardian is starting at https://$domain"
echo "The first visit can take a few seconds while the HTTPS certificate is issued."
echo "Logs: $docker compose logs -f app    |    $docker compose logs -f scans"
