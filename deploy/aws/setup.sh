#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04 EC2 instance that will run the
# METAM application (see docs/security-posture-review-2026-08-19.md for the
# security context, and the AWS runbook for the full walkthrough this script
# automates). Safe to re-run: every step is idempotent.
#
# Usage:
#   APP_DOMAIN=app.metamservices.com ./deploy/aws/setup.sh
set -euo pipefail

APP_DOMAIN="${APP_DOMAIN:-app.metamservices.com}"
UPSTREAM_PORT="${UPSTREAM_PORT:-18080}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "==> Installing Docker"
if ! command -v docker >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io docker-compose-plugin git curl
  sudo usermod -aG docker "$USER"
  echo "    Docker installed. Log out and back in (or run 'newgrp docker') before deploying."
else
  echo "    Docker already installed, skipping."
fi

echo "==> Installing Caddy"
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
    sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy
else
  echo "    Caddy already installed, skipping."
fi

CADDYFILE=/etc/caddy/Caddyfile
if ! sudo grep -q "^${APP_DOMAIN} " "$CADDYFILE" 2>/dev/null; then
  echo "==> Adding ${APP_DOMAIN} to ${CADDYFILE}"
  {
    echo ""
    echo "${APP_DOMAIN} {"
    echo "    reverse_proxy localhost:${UPSTREAM_PORT}"
    echo "}"
  } | sudo tee -a "$CADDYFILE" >/dev/null
  sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy
else
  echo "==> ${APP_DOMAIN} already present in ${CADDYFILE}, skipping."
fi

ENV_FILE="${REPO_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Generating ${ENV_FILE} with fresh secrets"
  gen() { python3 -c "import secrets; print(secrets.token_urlsafe(32))"; }
  cp "${REPO_DIR}/.env.example" "$ENV_FILE"
  sed -i \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(gen)|" \
    -e "s|^LEGACY_JWT_SECRET=.*|LEGACY_JWT_SECRET=$(gen)|" \
    -e "s|^PORTAL_JWT_SECRET=.*|PORTAL_JWT_SECRET=$(gen)|" \
    -e "s|^MOBILE_JWT_SECRET=.*|MOBILE_JWT_SECRET=$(gen)|" \
    -e "s|^SUPPLIER_PORTAL_JWT_SECRET=.*|SUPPLIER_PORTAL_JWT_SECRET=$(gen)|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen)|" \
    -e "s|^ENABLE_API_DOCS=.*|ENABLE_API_DOCS=false|" \
    -e "s|^ENABLE_PUBLIC_DEMO=.*|ENABLE_PUBLIC_DEMO=false|" \
    "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "    Wrote ${ENV_FILE} with freshly generated secrets (mode 600). Nothing was printed to the terminal."
else
  echo "==> ${ENV_FILE} already exists, leaving it untouched."
fi

cat <<EOF

==> Setup complete.
    Domain:   ${APP_DOMAIN} -> localhost:${UPSTREAM_PORT}
    Next:     point ${APP_DOMAIN}'s DNS A record at this server's IP, then run
              ./deploy/aws/deploy.sh
EOF
