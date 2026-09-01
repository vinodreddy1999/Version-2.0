#!/usr/bin/env bash
# Repeatable deploy/update for the METAM application. Run this on the app
# server after ./deploy/aws/setup.sh has run once. Safe to re-run on every
# release: pulls the latest commit, rebuilds the app image, applies any new
# Alembic migration, and restarts only the services that changed.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  echo "No .env found — run ./deploy/aws/setup.sh first." >&2
  exit 1
fi

echo "==> Pulling latest changes"
git pull --ff-only

echo "==> Building and starting containers"
docker compose up -d --build postgres redis fullstack-app worker

echo "==> Waiting for the app to report healthy"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:18080/health >/dev/null; then
    echo "    Healthy."
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "App did not become healthy in time. Check: docker compose logs fullstack-app" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Applying database migrations"
docker compose exec -T fullstack-app python -m alembic upgrade head

echo "==> Done. Deployed $(git rev-parse --short HEAD)."
