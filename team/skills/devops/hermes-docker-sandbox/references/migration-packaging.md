# Hermes Agent Migration Packaging

Package `~/.hermes/` for cross-machine migration (e.g. macOS → Windows).
Upload via git LFS to a modelscope (or any git) repository.

## What to INCLUDE (irreplaceable config + state)

| Path | Why | Size (typical) |
|------|-----|----------------|
| `profiles/*/config.yaml` | Engine config per profile | ~14 KB each |
| `profiles/*/SOUL.md` | Core behavior rules | ~2 KB each |
| `profiles/*/*_rules.md` | Detailed behavior rules | ~5-20 KB each |
| `profiles/*/skills/` | Skill library (SKILL.md + references) | 20-53 MB per profile |
| `profiles/*/plugins/` | Plugin configs (acp-client, matrix-chat-info) | <1 MB per profile |
| `profiles/*/cron/` | Scheduled job definitions (jobs.json) | <8 KB |
| `profiles/*/memories/` | Built-in memory store | <8 KB |
| `profiles/*/hindsight/` | Hindsight long-term memory config | <50 KB |
| `profiles/*/.env` | Profile-level credentials (sensitive!) | ~1 KB each |
| `profiles/*/auth.json` | Profile-level auth tokens (sensitive!) | ~1-3 KB each |
| `config.yaml` | Global engine config | ~17 KB |
| `SOUL.md` | Global core directives | ~0.5 KB |
| `global_kanban_rules.md` | Shared kanban rules | ~1 KB |
| `.env` | API keys (sensitive!) | ~1 KB |
| `auth.json` | Auth tokens (sensitive!) | ~5 KB |
| `skills/` | Global skills (shared across profiles) | ~16 MB |
| `plugins/` | Global plugins | varies |
| `hindsight/config.json` | Hindsight service config | <0.5 KB |
| `memories/MEMORY.md` | Global built-in memory | <1 KB |

### For clean-target migration (no historical data)

If the target is a **brand-new machine** and you don't need historical
task/session data, ALSO EXCLUDE the following (see EXCLUDE table below
for the full list):

- `kanban.db` — let target run `hermes kanban --board kanban001 init`
- `kanban/` — workspaces, attachments, board state (all historical)
- `cron/jobs.json` — old scheduled jobs (keep empty template)
- `cron/output/` — cron run history
- `channel_directory.json` — messaging routing state
- `gateway_state.json`, `gateway.lock` — runtime state
- `sessions.db`, `state.db*`, `response_store.db*` — all runtime DBs

This reduces the package from ~325 MB to ~79 MB for 9 profiles.

## What to EXCLUDE (rebuildable or transient)

| Path | Why exclude | Size |
|------|-------------|------|
| `hermes-agent/` | Source code — reinstall via pip/uv | 3 GB |
| `node/` | Node.js runtime — reinstalled by `hermes setup` | 2 GB |
| `bin/` | Binary tools (uv, tirith) — reinstalled | 56 MB |
| `hermes-office/` | Frontend app — separate install | 860 MB |
| `memos-plugin/` (profile-level) | MemOS runtime — reinstall via plugin | 441 MB |
| `plugins/memos-local-plugin/` | Global MemOS plugin runtime (424 MB) — reinstall via npm | 424 MB |
| `logs/` | Runtime logs — not needed on target | 28-85 MB |
| `state-snapshots/` | Pre-update backups — machine-specific | 15-77 MB |
| `sessions/` | Session history DB — machine-specific | 2-9 MB |
| `cache/` | Transient cache — rebuilt on use | <1 MB |
| `bootstrap-cache/` | Install cache — rebuilt | <1 MB |
| `state.db*` | Runtime state DB — rebuilt on first run | 14 MB |
| `response_store.db*` | Response cache — transient | <1 MB |
| `models_dev_cache.json` | Model list cache — rebuilt | 2 MB |
| `.skills_prompt_snapshot.json` | Prompt cache — rebuilt | 67 KB |
| `kanban.db*` | Kanban DB — for clean migration, init fresh | 170 KB |
| `kanban/` | Kanban workspaces/attachments/boards — historical | 5 MB |
| `cron/output/` | Cron run output history | varies |
| `cron/ticker_*`, `cron/.tick.lock`, `cron/.jobs.lock` | Cron runtime state | <1 KB |
| `gateway_state.json`, `gateway.lock` | Gateway runtime state | <1 KB |
| `channel_directory.json` | Messaging routing state — rebuilt | <1 KB |
| `traces/` | Execution traces — transient | 0 |
| `desktop/`, `desktop.json` | Desktop app state | <1 KB |
| `platforms/`, `sandboxes/`, `pairing/`, `pets/` | Empty/machine-specific dirs | 0 |
| `webui/`, `whatsapp/`, `migration/` | Machine-specific runtime/history | varies |
| `sessions.db` | Session DB (top-level) — rebuilt | 0 |
| `hermes-setup` | Installer binary — re-download | 11 MB |
| `tasks.json` | Runtime task list | <1 KB |
| `ollama_cloud_models_cache.json` | Model cache — rebuilt | <1 KB |
| `claw3d-*` | OpenClaw gateway runtime state | <1 KB |
| `profiles/*/bin/` | Profile-local binaries | 10-56 MB |
| `profiles/*/lsp/` | LSP servers — reinstalled | 23-26 MB |
| `profiles/*/home/` | Profile home dir — machine-specific | up to 135 MB |
| `profiles/*/spawn-trees/` | Transient delegation state | <12 KB |
| `profiles/*/pastes/` | Transient paste storage | <16 KB |
| `profiles/*/state-snapshots/` | Profile-level snapshots | 15-77 MB |
| `profiles/*/state.db*` | Profile-level runtime DB | 14-82 MB |
| `profiles/*/response_store.db*` | Profile-level response cache | <1 MB |
| `profiles/*/models_dev_cache.json` | Profile model cache — rebuilt | 2-3 MB |
| `profiles/*/verification_evidence.db*` | Profile verification DB — rebuilt | <1 MB |
| `profiles/*/gateway_state.json`, `gateway.lock`, `gateway.pid` | Profile gateway runtime | <1 KB |
| `profiles/*/cron/output/` | Profile cron output history | varies |
| `profiles/*/cron/ticker_*`, `.tick.lock`, `.jobs.lock` | Profile cron runtime state | <1 KB |
| `profiles/*/.hermes_history` | Profile CLI history | <32 KB |
| `profiles/*/processes.json` | Runtime process list | <1 KB |
| `profiles/*/.update_check`, `.update_exit_code` | Update check state | <1 KB |
| `profiles/*/desktop*` | Profile desktop state | <16 KB |
| `profiles/*/matrix_threads.json` | Matrix routing state — rebuilt | <2 KB |
| `profiles/*/provider_models_cache.json` | Provider cache — rebuilt | <2 KB |
| `profiles/*/config.yaml.bak*` | Config backups — not needed | ~15 KB each |
| `profiles/*/auth.json.bak*` | Auth backups — not needed | ~3 KB each |
| `profiles/*/.DS_Store`, `.hermes/.DS_Store` | macOS metadata | 8 KB |
| `*.pyc`, `*__pycache__*` | Python bytecode | varies |
| `*.log`, `*.tmp` | Log/temp files | varies |

## Packaging Command

### Standard package (includes kanban history, ~325 MB)

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT="hermes-agents-migration-${TIMESTAMP}.zip"

cd ~  # zip from home so paths are relative (.hermes/...)

zip -r "/path/to/target/${OUTPUT}" .hermes \
  -x ".hermes/hermes-agent/*" \
  -x ".hermes/node/*" \
  -x ".hermes/bin/*" \
  -x ".hermes/hermes-office/*" \
  -x ".hermes/memos-plugin/*" \
  -x ".hermes/logs/*" \
  -x ".hermes/state-snapshots/*" \
  -x ".hermes/sessions/*" \
  -x ".hermes/cache/*" \
  -x ".hermes/bootstrap-cache/*" \
  -x ".hermes/state.db*" \
  -x ".hermes/response_store.db*" \
  -x ".hermes/models_dev_cache.json" \
  -x ".hermes/.skills_prompt_snapshot.json" \
  -x ".hermes/profiles/*/bin/*" \
  -x ".hermes/profiles/*/lsp/*" \
  -x ".hermes/profiles/*/memos-plugin/*" \
  -x ".hermes/profiles/*/logs/*" \
  -x ".hermes/profiles/*/state-snapshots/*" \
  -x ".hermes/profiles/*/sessions/*" \
  -x ".hermes/profiles/*/cache/*" \
  -x ".hermes/profiles/*/home/*" \
  -x ".hermes/profiles/*/spawn-trees/*" \
  -x ".hermes/profiles/*/pastes/*" \
  -x ".hermes/profiles/*/.DS_Store" \
  -x ".hermes/.DS_Store" \
  -x "*.pyc" \
  -x ".hermes/traces/*"
```

Typical result: ~325 MB for 9 profiles with skills + kanban history.

### Clean-target package (no historical data, ~79 MB)

For deploying to a **brand-new machine** where you don't need historical
tasks, sessions, or runtime state, use the extended exclude list:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT="hermes-agents-migration-${TIMESTAMP}.zip"

cd ~

zip -r "/path/to/target/${OUTPUT}" .hermes \
  -x ".hermes/hermes-agent/*" \
  -x ".hermes/hermes-setup" \
  -x ".hermes/node/*" \
  -x ".hermes/bin/*" \
  -x ".hermes/hermes-office/*" \
  -x ".hermes/memos-plugin/*" \
  -x ".hermes/plugins/memos-local-plugin/*" \
  -x ".hermes/logs/*" \
  -x ".hermes/state-snapshots/*" \
  -x ".hermes/sessions/*" \
  -x ".hermes/sessions.db" \
  -x ".hermes/cache/*" \
  -x ".hermes/bootstrap-cache/*" \
  -x ".hermes/state.db*" \
  -x ".hermes/response_store.db*" \
  -x ".hermes/models_dev_cache.json" \
  -x ".hermes/.skills_prompt_snapshot.json" \
  -x ".hermes/kanban.db*" \
  -x ".hermes/kanban/*" \
  -x ".hermes/cron/output/*" \
  -x ".hermes/cron/.tick.lock" \
  -x ".hermes/cron/.jobs.lock" \
  -x ".hermes/cron/ticker_heartbeat" \
  -x ".hermes/cron/ticker_last_success" \
  -x ".hermes/gateway_state.json" \
  -x ".hermes/gateway.lock" \
  -x ".hermes/traces/*" \
  -x ".hermes/desktop/*" \
  -x ".hermes/desktop.json" \
  -x ".hermes/platforms/*" \
  -x ".hermes/sandboxes/*" \
  -x ".hermes/pairing/*" \
  -x ".hermes/pets/*" \
  -x ".hermes/webui/*" \
  -x ".hermes/whatsapp/*" \
  -x ".hermes/migration/*" \
  -x ".hermes/.hermes_history" \
  -x ".hermes/claw3d-*" \
  -x ".hermes/channel_directory.json" \
  -x ".hermes/ollama_cloud_models_cache.json" \
  -x ".hermes/tasks.json" \
  -x ".hermes/config.yaml.bak*" \
  -x ".hermes/profiles/*/bin/*" \
  -x ".hermes/profiles/*/lsp/*" \
  -x ".hermes/profiles/*/memos-plugin/*" \
  -x ".hermes/profiles/*/plugins/memos-local-plugin/*" \
  -x ".hermes/profiles/*/logs/*" \
  -x ".hermes/profiles/*/state-snapshots/*" \
  -x ".hermes/profiles/*/sessions/*" \
  -x ".hermes/profiles/*/sessions.db" \
  -x ".hermes/profiles/*/cache/*" \
  -x ".hermes/profiles/*/home/*" \
  -x ".hermes/profiles/*/spawn-trees/*" \
  -x ".hermes/profiles/*/pastes/*" \
  -x ".hermes/profiles/*/cron/output/*" \
  -x ".hermes/profiles/*/cron/ticker_heartbeat" \
  -x ".hermes/profiles/*/cron/ticker_last_success" \
  -x ".hermes/profiles/*/cron/.tick.lock" \
  -x ".hermes/profiles/*/cron/.jobs.lock" \
  -x ".hermes/profiles/*/state.db*" \
  -x ".hermes/profiles/*/response_store.db*" \
  -x ".hermes/profiles/*/models_dev_cache.json" \
  -x ".hermes/profiles/*/.models_dev_cache*.tmp" \
  -x ".hermes/profiles/*/verification_evidence.db*" \
  -x ".hermes/profiles/*/gateway_state.json" \
  -x ".hermes/profiles/*/gateway.lock" \
  -x ".hermes/profiles/*/gateway.pid" \
  -x ".hermes/profiles/*/.hermes_history" \
  -x ".hermes/profiles/*/processes.json" \
  -x ".hermes/profiles/*/.update_check" \
  -x ".hermes/profiles/*/.update_exit_code" \
  -x ".hermes/profiles/*/desktop*" \
  -x ".hermes/profiles/*/matrix_threads.json" \
  -x ".hermes/profiles/*/provider_models_cache.json" \
  -x ".hermes/profiles/*/ollama_cloud_models_cache.json" \
  -x ".hermes/profiles/*/channel_directory.json" \
  -x ".hermes/profiles/*/config.yaml.bak*" \
  -x ".hermes/profiles/*/auth.json.bak*" \
  -x ".hermes/profiles/*/webui_state" \
  -x ".hermes/profiles/*/mem0.json" \
  -x ".hermes/profiles/*/.claude" \
  -x ".hermes/profiles/*/.DS_Store" \
  -x ".hermes/.DS_Store" \
  -x ".hermes/profiles/.DS_Store" \
  -x "*.pyc" \
  -x "*__pycache__*" \
  -x "*.log" \
  -x "*.tmp"
```

Typical result: ~79 MB for 9 profiles (config + skills + plugins only).

## Upload to ModelScope via Git LFS

ModelScope repos use git LFS for large files. The `.gitattributes` should
already include `*.zip filter=lfs` (or add it if missing).

```bash
cd /path/to/modelscope/repo

# Ensure LFS is initialized
git lfs install

# Add and track the zip
git add hermes-agents-migration-*.zip
git lfs ls-files  # confirm LFS tracking

# Commit and push
git commit -m "feat: add hermes agents migration package"
git push origin master
```

### .gitattributes entry (add if missing)

```
*.zip filter=lfs diff=lfs merge=lfs -text
```

If the repo already has other large files tracked via LFS, the pattern
is already in place — just `git add` and the LFS filter applies
automatically.

## Restore on Target Machine (Windows)

### Prerequisites

Install on the target machine before restoring:

```powershell
# 1. Python 3.12 + Node.js 20+ + Git + Git LFS
winget install Python.Python.3.12 OpenJS.NodeJS.LTS Git.Git GitHub.GitLFS -e

# 2. uv (Python package manager)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# 3. Hermes Agent
uv tool install hermes-agent

# 4. Hindsight (long-term memory service)
uv tool install hindsight-api-slim
```

### Restore steps

1. Clone the modelscope repo and extract the zip:
   ```powershell
   cd $env:USERPROFILE\Downloads
   git lfs install
   git clone https://www.modelscope.cn/tupang/ollama.git
   cd $env:USERPROFILE
   Expand-Archive -Path "$env:USERPROFILE\Downloads\ollama\hermes-agents-migration-*.zip" -DestinationPath . -Force
   ```

2. Run `hermes setup` to rebuild excluded dependencies (binaries, LSP, etc.)

3. Start Hindsight service — for offline deployment with pre-packaged Docker
   image + model weights, see `references/hindsight-offline-deployment.md`
   in the `hermes-memory-providers` skill. Quick start (online):
   ```powershell
   Start-Process hindsight-api -ArgumentList "--port 8888" -WindowStyle Hidden
   curl http://localhost:8888/health  # verify
   ```

   For offline deployment, extract the `hindsight-offline-*.zip` package
   to `~/.hermes/hindsight-offline/`, then:
   ```powershell
   docker load -i .hermes\hindsight-offline\pgvector-pg16.tar
   cd .hermes\hindsight-offline; docker compose up -d
   .\.hermes\hindsight-offline\scripts\start-hindsight.ps1
   curl http://localhost:8888/health
   ```

4. **For clean-target migration only**: Initialize a fresh kanban board:
   ```powershell
   hermes kanban --board kanban001 init
   ```

5. Fix machine-specific paths (macOS → Windows):
   ```powershell
   $winPath = "C:/Users/$env:USERNAME"
   foreach ($f in (Get-ChildItem "$env:USERPROFILE\.hermes\profiles\*\config.yaml")) {
       (Get-Content $f.FullName) -replace '~', $winPath | Set-Content $f.FullName
   }
   (Get-Content "$env:USERPROFILE\.hermes\config.yaml") -replace '~', $winPath | Set-Content "$env:USERPROFILE\.hermes\config.yaml"
   ```

6. Start gateway: `hermes -p orchestrator gateway run`

### Path adjustments needed on Windows

- `agent.environment_hint` — absolute path to rules file (e.g.
  `~/.hermes/...` → `C:\Users\<user>\.hermes\...`)
- `terminal.cwd` / `default_cwd` — workspace path
- ACP plugin `default_cwd` — workspace path
- Any cron job scripts with hardcoded paths
- Check `.env` for macOS-absolute paths
- ACP proxy address: macOS uses `host.docker.internal:15721`, on Windows
  verify the proxy is reachable or switch to direct connection

## Pitfalls

- **`.env` and `auth.json` contain secrets** — the zip includes them.
  Use a private repository and delete the zip from the repo after
  migration if security is a concern.
- **Profile `home/` directories can be large** (worker-coder: 135 MB)
  and contain machine-specific caches — always exclude.
- **`memos-plugin/` at profile level** (441 MB for orchestrator) and
  `plugins/memos-local-plugin/` at global level (424 MB) are MemOS
  runtime, NOT config — exclude both. The global `~/.hermes/plugins/`
  directory (which contains other plugin source) IS included.
- **`state.db` is machine-specific** — including it can cause conflicts
  on the target machine. Let it rebuild on first run.
- **Hindsight data is NOT in `~/.hermes/`** — the Hindsight API server
  stores its data in `~/.cache/hindsight-cross-encoder/` and its own
  database directory. The `hindsight/config.json` (client config) IS
  included, but the actual memory database is not. Hindsight banks are
  auto-recreated on first use on the target machine:
  - `hermes-orchestrator`
  - `hermes-worker-coder`
  - `hermes-worker-researcher`
  - (other profiles auto-create on first use)
- **macOS paths in config files** — `.env`, `config.yaml`, and profile
  `config.yaml` files contain `~/...` absolute paths that
  MUST be replaced with Windows paths before starting the gateway.
- **ACP proxy address** — macOS config uses `host.docker.internal:15721`
  for Claude Code proxy routing. On Windows, verify the proxy is
  reachable or change to `127.0.0.1:15721` (direct) or the actual host.
- **Cron `jobs.json`** — for clean migration, the orchestrator's
  `jobs.json` may still contain old job definitions (e.g.
  `triage-noise-filter`). These are disabled/paused but exist in the
  file. If you want a completely clean slate, replace with
  `{"jobs": [], "updated_at": null}`.
