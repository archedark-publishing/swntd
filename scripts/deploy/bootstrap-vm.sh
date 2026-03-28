#!/usr/bin/env bash

set -euo pipefail

DEPLOY_PATH="${SWNTD_DEPLOY_PATH:-}"
BOOTSTRAP_ADMIN_EMAILS="${SWNTD_BOOTSTRAP_ADMIN_EMAILS:-}"
BOOTSTRAP_OWNER_EMAILS="${SWNTD_BOOTSTRAP_OWNER_EMAILS:-}"
HOUSEHOLD_NAME="${SWNTD_HOUSEHOLD_NAME:-S#!% We Need To Do}"
SERVICE_ACTOR_NAME="${SWNTD_SERVICE_ACTOR_NAME:-Household Assistant}"
SERVICE_ACTOR_KIND="${SWNTD_SERVICE_ACTOR_KIND:-assistant}"
DEFAULT_TIMEZONE="${SWNTD_DEFAULT_TIMEZONE:-America/New_York}"
DONE_ARCHIVE_AFTER_DAYS="${SWNTD_DONE_ARCHIVE_AFTER_DAYS:-30}"
DEFAULT_CALENDAR_EXPORT_KIND="${SWNTD_DEFAULT_CALENDAR_EXPORT_KIND:-google}"
INTERNAL_JOBS_INTERVAL_SECONDS="${SWNTD_INTERNAL_JOBS_INTERVAL_SECONDS:-60}"
RUN_USER="${SWNTD_RUN_USER:-$USER}"

if [[ -z "$DEPLOY_PATH" ]]; then
  echo "SWNTD_DEPLOY_PATH is required." >&2
  exit 1
fi

if [[ -z "$BOOTSTRAP_ADMIN_EMAILS" ]]; then
  echo "SWNTD_BOOTSTRAP_ADMIN_EMAILS is required." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
CADDY_TEMPLATE="$REPO_ROOT/deploy/Caddyfile.template"
SYSTEMD_TEMPLATE="$REPO_ROOT/deploy/swntd-api.service.template"

sudo apt-get update
sudo apt-get install -y ca-certificates curl git gnupg rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v24.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo corepack enable

if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi

mkdir -p "$DEPLOY_PATH/releases" "$DEPLOY_PATH/shared/data" "$DEPLOY_PATH/shared/uploads"
chmod 755 "$DEPLOY_PATH" "$DEPLOY_PATH/releases" "$DEPLOY_PATH/shared" "$DEPLOY_PATH/shared/data" "$DEPLOY_PATH/shared/uploads"

if [[ "$DEPLOY_PATH" == "/home/$RUN_USER/"* ]] || [[ "$DEPLOY_PATH" == "/home/$RUN_USER" ]]; then
  sudo chmod o+rx "/home/$RUN_USER"
fi

if [[ ! -f /etc/swntd/swntd.env ]]; then
  sudo install -d -m 755 /etc/swntd
  sudo tee /etc/swntd/swntd.env >/dev/null <<EOF
SWNTD_AUTH_MODE="trusted_header"
SWNTD_TRUSTED_EMAIL_HEADER="X-ExeDev-Email"
SWNTD_HOUSEHOLD_NAME="$HOUSEHOLD_NAME"
SWNTD_BOOTSTRAP_ADMIN_EMAILS="$BOOTSTRAP_ADMIN_EMAILS"
SWNTD_BOOTSTRAP_OWNER_EMAILS="$BOOTSTRAP_OWNER_EMAILS"
SWNTD_SERVICE_ACTOR_NAME="$SERVICE_ACTOR_NAME"
SWNTD_SERVICE_ACTOR_KIND="$SERVICE_ACTOR_KIND"
SWNTD_DEFAULT_TIMEZONE="$DEFAULT_TIMEZONE"
SWNTD_DONE_ARCHIVE_AFTER_DAYS=$DONE_ARCHIVE_AFTER_DAYS
SWNTD_DEFAULT_CALENDAR_EXPORT_KIND="$DEFAULT_CALENDAR_EXPORT_KIND"
SWNTD_UPLOADS_DIR="$DEPLOY_PATH/shared/uploads"
SWNTD_MAX_UPLOAD_BYTES=20971520
SWNTD_STALE_UPLOAD_GRACE_HOURS=24
SWNTD_DATABASE_URL="file:$DEPLOY_PATH/shared/data/swntd.sqlite"
SWNTD_API_HOST="127.0.0.1"
SWNTD_API_PORT=3001
SWNTD_INTERNAL_JOBS_ENABLED="true"
SWNTD_INTERNAL_JOBS_INTERVAL_SECONDS=$INTERNAL_JOBS_INTERVAL_SECONDS
EOF
  sudo chown root:"$RUN_USER" /etc/swntd/swntd.env
  sudo chmod 640 /etc/swntd/swntd.env
fi

sudo sed \
  -e "s#__DEPLOY_PATH__#$DEPLOY_PATH#g" \
  "$CADDY_TEMPLATE" | sudo tee /etc/caddy/Caddyfile >/dev/null

sudo sed \
  -e "s#__DEPLOY_PATH__#$DEPLOY_PATH#g" \
  -e "s#__RUN_USER__#$RUN_USER#g" \
  "$SYSTEMD_TEMPLATE" | sudo tee /etc/systemd/system/swntd-api.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable caddy
sudo systemctl enable swntd-api
sudo systemctl restart caddy

echo "Bootstrap complete for $DEPLOY_PATH"
echo "Environment file: /etc/swntd/swntd.env"
