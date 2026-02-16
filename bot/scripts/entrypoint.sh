#!/bin/sh
# Heimdall entrypoint — optionally starts an nginx single-port proxy
# before launching the bot. Activated by SINGLE_PORT_PROXY=true.
#
# When enabled, nginx binds to $PORT (default 8080) and routes:
#   /ws       → localhost:3002  (WebSocket)
#   /bot-api/ → localhost:3001  (REST API, prefix stripped)
#   /         → localhost:3000  (Next.js dashboard)
#
# When disabled (default), the bot starts directly with no overhead.

set -e

normalize_env_value() {
  echo "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

is_truthy() {
  case "$(normalize_env_value "$1" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

if is_truthy "${SINGLE_PORT_PROXY:-}"; then
  PORT="$(normalize_env_value "${PORT:-8080}")"
  export PORT

  # Prepare writable directories for non-root nginx
  mkdir -p /tmp/nginx

  # Substitute $PORT into the nginx config template
  envsubst '${PORT}' < /app/nginx/single-port.conf.template > /tmp/nginx/nginx.conf

  echo "[entrypoint] Starting single-port proxy on :${PORT} (dashboard:3000, api:3001, ws:3002)"
  nginx -e /dev/stderr -c /tmp/nginx/nginx.conf &
fi

# Start the bot (PID 1 for proper signal handling)
exec bun run src/index.ts
