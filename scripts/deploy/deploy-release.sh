#!/usr/bin/env bash

set -euo pipefail

RELEASE_ARCHIVE="${1:-}"
DEPLOY_PATH="${DEPLOY_PATH:-${SWNTD_DEPLOY_PATH:-}}"
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}"

if [[ -z "$RELEASE_ARCHIVE" ]]; then
  echo "Usage: deploy-release.sh <release-archive>" >&2
  exit 1
fi

if [[ -z "$DEPLOY_PATH" ]]; then
  echo "DEPLOY_PATH or SWNTD_DEPLOY_PATH is required." >&2
  exit 1
fi

if [[ ! -f "$RELEASE_ARCHIVE" ]]; then
  echo "Release archive not found: $RELEASE_ARCHIVE" >&2
  exit 1
fi

if [[ ! -f /etc/swntd/swntd.env ]]; then
  echo "Missing /etc/swntd/swntd.env. Run scripts/deploy/bootstrap-vm.sh first." >&2
  exit 1
fi

RELEASES_DIR="$DEPLOY_PATH/releases"
SHARED_DIR="$DEPLOY_PATH/shared"
CURRENT_LINK="$DEPLOY_PATH/current"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"

mkdir -p "$RELEASES_DIR" "$SHARED_DIR"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$RELEASE_ARCHIVE" -C "$RELEASE_DIR"
chmod -R a+rX "$RELEASE_DIR"

cd "$RELEASE_DIR"

export CI=1
corepack pnpm install --frozen-lockfile
corepack pnpm -r build

set -a
source <(sudo cat /etc/swntd/swntd.env)
set +a

corepack pnpm --filter @swntd/api db:migrate
corepack pnpm --filter @swntd/api db:bootstrap

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

sudo systemctl restart swntd-api
sudo systemctl restart caddy

echo "Deployed release $RELEASE_ID to $DEPLOY_PATH"

for attempt in $(seq 1 12); do
  if curl --fail --silent --show-error http://127.0.0.1:8000/healthz >/dev/null; then
    exit 0
  fi

  sleep 5
done

echo "Local health check failed after restart." >&2
exit 1
