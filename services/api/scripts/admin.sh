#!/usr/bin/env bash
# One-command admin for the autoposter worker.
#   ./scripts/admin.sh deploy    deploy the worker (soaktherockies-api)
#   ./scripts/admin.sh run       run the autoposter now (real posts), wait for results
#   ./scripts/admin.sh check     show which Asana projects are connected
#   ./scripts/admin.sh status    show blog queue + last cron run
#   ./scripts/admin.sh new-key   make a fresh admin key and store it on the worker
# The admin key lives in services/api/.admin-secret (gitignored). It is created
# and stored on the worker automatically the first time you run anything.
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")/.."
URL="https://soaktherockies-api.buzzuw2.workers.dev"
KEYFILE=".admin-secret"

set_key() {
  openssl rand -hex 24 | tr -d '\n' > "$KEYFILE"
  chmod 600 "$KEYFILE"
  printf '%s' "$(cat "$KEYFILE")" | npx wrangler secret put ADMIN_SECRET --env=""
  echo "New admin key stored on the worker. Waiting 20s for it to take effect..."
  sleep 20
}

cmd="${1:-help}"
case "$cmd" in
  deploy)  npx wrangler deploy --env=""; exit ;;
  new-key) set_key; exit ;;
  run|check|status) [ -s "$KEYFILE" ] || set_key ;;
  *) sed -n '2,9p' "$SELF" | sed 's/^# \{0,1\}//'; exit ;;
esac
KEY="$(cat "$KEYFILE")"

call() { # method path
  out="$(curl -sS -X "$1" -H "ADMIN_SECRET: $KEY" --max-time 1200 "$URL$2")"
  if [ "$out" = "Unauthorized" ]; then
    echo "Key rejected. Run: ./scripts/admin.sh new-key   then try again."; exit 1
  fi
  if command -v jq >/dev/null; then echo "$out" | jq .; else echo "$out"; fi
}

case "$cmd" in
  run)    echo "Running autoposter. This takes several minutes..."; call POST /api/admin/trigger-scheduler ;;
  check)  call GET /api/admin/asana-check ;;
  status) call GET /api/admin/blog-queue-status ;;
esac
