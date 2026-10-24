#!/bin/bash
# Hermes Docker Sandbox Entrypoint
# Features: auto-init config, background dashboard + foreground gateway
set -e

HERMES_HOME="${HERMES_HOME:-/opt/hermes-data}"

# Seed minimal config on first start
if [ ! -f "${HERMES_HOME}/config.yaml" ]; then
    mkdir -p "${HERMES_HOME}"
    cat > "${HERMES_HOME}/config.yaml" << 'YAMLEOF'
model:
  default: openrouter/anthropic/claude-sonnet-4
  provider: openrouter
agent:
  max_turns: 50
terminal:
  backend: local
  timeout: 180
compression:
  enabled: true
  threshold: 0.50
  target_ratio: 0.20
YAMLEOF
    touch "${HERMES_HOME}/.env"
    chmod 600 "${HERMES_HOME}/.env"
fi

# If gateway mode with dashboard enabled: start dashboard backgrounded
if [ "${HERMES_DASHBOARD:-0}" = "1" ] && [ "$1" = "hermes" ] && [ "$2" = "gateway" ] && [ "$3" = "run" ]; then
    echo "🔧 Starting dashboard in background (port 9119)..."
    # nohup + disown prevents SIGHUP killing dashboard when shell execs gateway
    nohup hermes dashboard --host 0.0.0.0 --insecure --skip-build \
        > /tmp/dashboard.log 2>&1 &
    disown
    sleep 2
    echo "🔧 Starting gateway..."
    exec hermes gateway run
fi

exec "$@"
