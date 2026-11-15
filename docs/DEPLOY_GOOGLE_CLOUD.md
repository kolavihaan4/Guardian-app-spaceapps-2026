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

## Known gaps

- The SQLite file is not backed up. For anything beyond a demo, snapshot the VM disk.
