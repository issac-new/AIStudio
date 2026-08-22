#!/usr/bin/env python3
"""Launch Hindsight API with env vars from start.sh and .env"""
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent.resolve()
PROFILE = HERE.parent  # ~/.hermes/profiles/orchestrator
DOT_ENV = PROFILE / ".env"
START_SH = HERE / "start.sh"

# Helper: resolve $VAR / ${VAR} from env dict
def _resolve(val: str, env: dict) -> str:
    def _sub(m):
        varname = m.group(1) or m.group(2)
        return env.get(varname, "")
    return re.sub(r'\$\{(\w+)\}|\$(\w+)', _sub, val)

# 1) Load .env
env = dict(os.environ)
if DOT_ENV.exists():
    for line in DOT_ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        env.setdefault(key.strip(), val.strip())

# 2) Parse start.sh - handle both assignments and exports
with open(START_SH) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Parse KEY=VALUE or export KEY=VALUE
        prefix = "export "
        raw_line = line
        if line.startswith(prefix):
            raw_line = line[len(prefix):]
        if "=" not in raw_line:
            continue
        key, _, raw_val = raw_line.partition("=")
        key = key.strip()
        val = raw_val.strip().strip("\"'")
        # Resolve: handle command substitutions like $(grep ...) by checking .env directly
        if val.startswith("$("):
            # Command substitution: $(grep ^KEY ... | cut -d= -f2-)
            # Just look it up from the parsed env dict
            cmds = val.strip("$()")
            m = re.search(r'grep\s+\^?(\w+)', cmds)
            if m:
                search_key = m.group(1)
                val = env.get(search_key, "")
            else:
                val = ""
        else:
            val = _resolve(val, env)
        env[key] = val

# 3) Find the hindsight-api python tool
for candidate in [
    Path.home() / ".local/share/uv/tools/hindsight-api-slim/bin/python",
    Path.home() / ".local/share/uv/tools/hindsight-api-slim/bin/python3",
]:
    if candidate.exists():
        python = str(candidate)
        break
else:
    print("ERROR: hindsight-api-slim tool not found", file=sys.stderr)
    sys.exit(1)

# 4) Ensure PostgreSQL container is running
import subprocess
import time

def _ensure_db():
    """Start hindsight-db-1 Docker container if not running."""
    try:
        r = subprocess.run(
            ["docker", "ps", "--filter", "name=hindsight-db-1", "--format", "{{.Status}}"],
            capture_output=True, text=True, timeout=10
        )
        if "healthy" in r.stdout or "Up" in r.stdout:
            print("  DB:       hindsight-db-1 already running", file=sys.stderr)
            return True
    except Exception:
        pass
    # Try starting it
    compose_dir = None
    for candidate in [
        HERE / "docker-compose.mempalace.yml",
        Path.home() / "hindsight-mempalace/docker-compose.mempalace.yml",
    ]:
        if candidate.exists():
            compose_dir = candidate.parent
            break
    if compose_dir:
        print("  DB:       starting hindsight-db-1...", file=sys.stderr)
        try:
            subprocess.run(
                ["docker", "compose", "-f", "docker-compose.mempalace.yml", "up", "-d", "db"],
                cwd=compose_dir, capture_output=True, text=True, timeout=60
            )
            # Wait for healthy
            for _ in range(30):
                time.sleep(2)
                r = subprocess.run(
                    ["docker", "ps", "--filter", "name=hindsight-db-1", "--format", "{{.Status}}"],
                    capture_output=True, text=True, timeout=5
                )
                if "healthy" in r.stdout:
                    print("  DB:       hindsight-db-1 healthy", file=sys.stderr)
                    return True
            print("  DB:       timeout waiting for healthy", file=sys.stderr)
        except Exception as e:
            print(f"  DB:       start failed: {e}", file=sys.stderr)
    return False

_ensure_db()
sys.stderr.flush()

# 5) Log configured values
print(f"  LLM:      {env.get('HINDSIGHT_API_LLM_PROVIDER', '?')}/{env.get('HINDSIGHT_API_LLM_MODEL', '?')}", file=sys.stderr)
print(f"  DB:       postgresql://hindsight:***@localhost:5432/hindsight", file=sys.stderr)
print(f"  Embed:    {env.get('HINDSIGHT_API_EMBEDDINGS_PROVIDER', '?')}", file=sys.stderr)
print(f"  Reranker: {env.get('HINDSIGHT_API_RERANKER_PROVIDER', '?')}", file=sys.stderr)
sys.stdout.flush()
sys.stderr.flush()

# 5) exec inherit
os.execve(python, [python, "-c", "from hindsight_api.main import main; main()"], env)
