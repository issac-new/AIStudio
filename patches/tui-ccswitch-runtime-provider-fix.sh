#!/usr/bin/env bash
# Fix: status bar must read the RUNTIME current provider from the proxy's
# /status endpoint (current_provider_id), not the DB is_current flag which
# lags behind proxy failover/circuit-breaker trips and freezes the display
# on stale model/usage/token data.
set -euo pipefail
F="$HOME/.hermes/hermes-agent/ui-tui/src/components/appLayout.tsx"
[[ -f "$F" ]] || { echo "[ccswitch-fix] $F not found, skip"; exit 0; }

if grep -q 'current_provider_id' "$F"; then
  echo "[ccswitch-fix] already patched, skip"
  exit 0
fi

# useCcSwitchModel: read current_provider_id from /status, query DB by id
python3 - <<'PYEOF'
import re, pathlib
f = pathlib.Path.home() / ".hermes/hermes-agent/ui-tui/src/components/appLayout.tsx"
s = f.read_text()
old1 = "        const j = await res.json() as { current_provider?: string }\n        const provider = j.current_provider || ''\n\n        if (!provider || cancelled) {return}\n        // Query the cc-switch SQLite DB for the actual model on this provider.\n        const { execSync } = await import('child_process')\n        const dbPath = (process.env.HOME || '') + '/.cc-switch/cc-switch.db'\n        const sql = `SELECT json_extract(p.settings_config, '$.env.ANTHROPIC_MODEL') as model FROM providers p WHERE p.app_type='claude' AND p.is_current=1 LIMIT 1;`"
new1 = "        const j = await res.json() as { current_provider?: string; current_provider_id?: string }\n        const provider = j.current_provider || ''\n        const providerId = j.current_provider_id || ''\n\n        if (!provider || cancelled) {return}\n        // Query the cc-switch SQLite DB for the actual model on the RUNTIME\n        // current provider (from /status), NOT the DB is_current flag.\n        const { execSync } = await import('child_process')\n        const dbPath = (process.env.HOME || '') + '/.cc-switch/cc-switch.db'\n        const sqlWhere = providerId && /^[\\w-]+$/.test(providerId) ? `p.id='${providerId}'` : `p.is_current=1`\n        const sql = `SELECT json_extract(p.settings_config, '$.env.ANTHROPIC_MODEL') as model FROM providers p WHERE p.app_type='claude' AND ${sqlWhere} LIMIT 1;`"
if old1 in s:
    s = s.replace(old1, new1)
    print("[ccswitch-fix] useCcSwitchModel patched")
else:
    print("[ccswitch-fix] WARN: useCcSwitchModel block not found")
f.write_text(s)
PYEOF

echo "[ccswitch-fix] done (source only — run npm run build after hermes update)"
