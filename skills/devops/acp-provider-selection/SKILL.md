---
name: acp-provider-selection
description: "Choose claude vs codex ACP provider per task."
version: 1.0.0
author: Hermes Agent (orchestrator)
platforms: [macos, linux]
metadata:
  hermes:
    tags: [acp, claude-code, codex, provider-selection, delegation]
    related_skills: [acp-bulk-deployment, codex, claude-code, hermes-acp-claude-code]
---

# ACP Provider Selection — Claude Code vs Codex

The Hermes `acp-client` plugin supports **three coding-agent providers** via the same `acp_send()` interface: `claude`, `codex`, and `zcode` (added 2026-09-04). This skill guides the per-task choice and covers readiness verification.

## The three providers

| Provider | CLI binary spawned | Adapter package | Credential source |
|----------|-------------------|-----------------|-------------------|
| `claude` (default) | `claude-agent-acp` or `@zed-industries/claude-code-acp` | `@agentclientprotocol/claude-agent-acp` | Per-profile `.env` or cc-switch proxy |
| `codex` | `npx @zed-industries/codex-acp` | `@zed-industries/codex-acp` | Global `~/.codex/config.toml` |
| `zcode` | `zcode-acp-server` (npm `zcode-acp-server`) → drives ZCode CLI | `zcode-acp-server` | `~/.zcode/v2/config.json` (ZCode desktop's GLM Coding Plan key) — added 2026-09-04, see `references/zcode-acp.md` |

Both use the same ACP protocol handshake. The `provider=` argument in `acp_send()` is the only API difference:

```python
acp_send(provider="claude", agent="bypassPermissions", prompt="...", cwd="...")
acp_send(provider="codex", prompt="...", cwd="...")
acp_send(provider="zcode", prompt="...", cwd="...")
```

The `_resolve_provider()` function in `plugins/acp-client/__init__.py` maps provider names to launch commands. **Provider names are hardcoded branches** — adding a new one requires a code patch (Pitfall 6), not just a config entry.

## Decision matrix — when to pick which

| Scenario | Pick | Why |
|----------|------|-----|
| Complex multi-file feature dev | `claude` | Hooks / MCP / sub-agents / CLAUDE.md ecosystem |
| Untrusted code (PoC, exploits, malware) | `codex` | Rust bubblewrap/seatbelt sandbox is harder than permission dialogs |
| PR review | either | Codex has `codex review`; Claude has `/review` + `--from-pr` |
| Batch parallel issue fixing (worktrees) | `codex` | `codex exec` + worktrees, no dialog handling |
| USD budget control needed | `claude` | `--max-budget-usd` hard cap |
| Database/API integration | `claude` | Rich MCP ecosystem |
| System-level languages (Rust/Go/C++/Verilog/VHDL) | `codex` | Stronger training coverage |
| Diff output for human audit | `codex` | `codex apply` applies agent diffs via `git apply` |
| Non-code docs (xlsx/pptx/pdf) | `codex` | Multi-runtime plugins |
| Use GLM Coding Plan quota + ZCode agent toolchain (plan/build/edit modes, ZCode plugins/skills) | `zcode` | Officially authorized plan access; modes via `acp_agents(provider="zcode")` (plan/build/edit/yolo/auto, default yolo) |

### Per-team default recommendations (40-profile deployment)

| Team / Profile | Default provider | Rationale |
|----------------|-----------------|-----------|
| worker-coder | claude (switch to codex for sandbox) | Complex features need Claude ecosystem |
| worker-tester | claude | TDD loop + `--allowedTools` |
| hack-exploit | **codex** | Hard sandbox for PoC/payload code |
| hack-forensics | claude | Multi-tool MCP integration |
| hack-auditor | codex review + claude /security-review | Complementary |
| ops-devops | claude | Terraform/K8s multi-file |
| ops-sre, ops-eval | **codex** | Short independent scripts |
| [已移除], [已移除] | claude | Complex numerical algorithms |
| [已移除] | **codex** | Verilog/VHDL coverage |
| [已移除] | claude | Compiler dev, Hooks advantage |

## Codex readiness verification

Before the first `acp_send(provider="codex")` call, verify all four layers:

```bash
# 1. Codex CLI installed
codex --version              # expect: codex-cli 0.146.0+

# 2. ACP adapter resolvable via npx
npx @zed-industries/codex-acp --help   # expect: Usage: codex-acp [OPTIONS]

# 3. Auth + model configured (~/.codex/config.toml)
grep -E "model|base_url|experimental_bearer_token|api_key" ~/.codex/config.toml
# In a cc-switch deployment:
#   model = "glm-5.2"
#   base_url = "http://127.0.0.1:15721/v1"
#   experimental_bearer_token = "PROXY_MANAGED"
# OPENAI_API_KEY must also be set (Codex requires it even with custom provider)

# 4. ACP smoke test
acp_agents(provider="codex")
acp_send(provider="codex", prompt="Create /tmp/codex_acp_test.py with: print('codex acp works')", cwd="/tmp")
cat /tmp/codex_acp_test.py && python3 /tmp/codex_acp_test.py
```

## Provider config (plugins/acp-client/config.yaml)

Ships by default with both providers configured:

```yaml
default_provider: claude

providers:
  claude:
    binary: ~/.hermes/node/bin/claude-agent-acp
    args: ["--dangerously-skip-permissions"]
  codex:
    npx: npx
    package: "@zed-industries/codex-acp"
```

### zcode provider config (added 2026-09-04)

```bash
npm install -g zcode-acp-server   # bins: zcode-acp-server + zcode-acp; v0.21.0 verified; Node >= 22.5
```

```yaml
providers:
  zcode:
    binary: /opt/homebrew/bin/zcode-acp-server
    default_cwd: /Users/YOURNAME/hermes-docker-sandbox/workspace
```

Full integration detail: `references/zcode-acp.md`.

### Install codex-acp globally (eliminate npx cold-start)

```bash
npm install -g @zed-industries/codex-acp
```

Then switch from npx to binary mode for faster startup:

```yaml
providers:
  codex:
    binary: /opt/homebrew/bin/codex-acp   # or wherever npm -g installs it
    args: []
```

## Unique strengths reference

### Claude Code only
- Hooks system (8 types: PreToolUse/PostToolUse/Stop/SessionStart/...)
- MCP integration (`claude mcp add`)
- Custom sub-agents (`.claude/agents/*.md`)
- CLAUDE.md project memory + auto-memory
- Slash commands (`/review`, `/security-review`, `/compact`, `/plan`)
- Worktree integration (`-w feature-x --tmux`)
- `--from-pr <N>` for PR context
- `--max-budget-usd` hard cost cap

### Codex CLI only
- Rust-native sandbox (bubblewrap/seatbelt) — harder isolation than dialogs
- `codex review` dedicated PR review subcommand
- `codex apply` — apply agent diffs via `git apply` (audit-friendly)
- MCP Server mode (`codex mcp-server`)
- Multi-runtime plugins (browser-use, documents, spreadsheets, presentations, pdf)
- Responses API (reasoning token storage/resumption)

## Pitfalls

1. **Stale SOUL.md "固定 claude" lock-in** — Worker SOUL.md files deployed before Codex verification may contain `provider 固定 "claude"` (e.g. `worker-coder/SOUL.md` line 77). Find via `grep -rn '固定.*claude' ~/.hermes/profiles/*/SOUL.md` and replace with the provider-selection guide above.

2. **Codex npx cold-start** — First `acp_send(provider="codex")` may take 10-30s as npx downloads the adapter. Install globally and use `binary:` config mode to eliminate.

3. **Codex auth is global** — Unlike Claude (per-profile `.env` with `ANTHROPIC_AUTH_TOKEN`), Codex reads `~/.codex/config.toml` globally. All profiles share Codex auth. Fine for single-user; matters for multi-tenant.

4. **Codex needs a git repo for full features** — `codex exec` and `codex review` work best inside a git repository. For scratch tasks: `cd $(mktemp -d) && git init && codex exec "..."`.

5. **Sandbox failure in gateway context** — Codex `workspace-write` sandboxing may fail when invoked from a Hermes gateway/service context (bubblewrap user-namespace errors). Use `--sandbox danger-full-access` in that context, with process boundaries as the safety layer.

6. **New ACP providers need a code patch, not just config** — `_resolve_provider()` in `plugins/acp-client/__init__.py` hardcodes provider branches; unknown names raise `ValueError`. Adding one = new `elif` branch (binary-or-PATH resolution + `args`/`env` from provider_cfg) + error-message update. **Per-profile copies drift**: each profile keeps its own `plugins/acp-client/__init__.py`; re-run the sync after any future branch edit. New `acp_*` tool branches also need a session/gateway reload to be visible to the live tools; test via `python3` + direct `handle_acp_send` import meanwhile.

7. **Deploy-log ≠ deployed-artifact (2026-09-07 实证)** — 09-06「全舰队 zcode 部署」记录为成功，但 39 份插件**从未含 zcode 分支**（全为旧 hash `1e28066c…`，此前记录的 `93385533132d` 系虚构/另一时间线），全舰队夜间 `provider="zcode"` 实际全部 Unknown-provider 秒失败并静默回退计费通道。教训：**部署后必须哈希核验落盘产物本身**（`md5` 全量 `sort -u | wc -l` 应为 1），不信任部署脚本的 success 输出。修复记录见 references/zcode-acp.md「Fleet sync」。

## Fleet-wide zcode night-free deployment (2026-09-06, all 39 plugin copies)

The GLM Coding Plan 夜间畅用 event (2026-09-03 ~ 09-20, daily 23:00–09:00 Beijing) makes **GLM-5.3-Flash via the ZCode channel 0-credit**. Deployment now covers the whole fleet — the per-profile drift warning above is resolved:

- ⚠️ **Fleet plugin-code reality (corrected 2026-09-07 ~23:40 by nightly-radar worker)**: only **2/39** `plugins/acp-client/__init__.py` copies (orchestrator + ops-devops) carry the zcode branch + env passthrough + `set_config_option` (patched md5 bba081fd...); the other 37 (+default) share the OLD no-branch hash 1e28066c. The 09-07 19:55 "fleet re-sync" deployed a STALE source and silently reverted the earlier env-plumbing patch — deploy-script exit code is NOT evidence; re-grep `grep -l 'name == "zcode"'` after every fleet sync. Nightly radar + ops-devops jobs are unaffected (their two copies are fixed); other profiles calling `acp_send provider="zcode"` at night will hit `Unknown ACP provider` and fall back per their SOUL rules (billed) until the fleet re-patch lands — see follow-up kanban card.
- Env pin plumbing (2026-09-07, restored tonight in the 2 fixed copies): `ACPClient(env=)` + `start()` Popen merge + `_get_client` passes `providers.<name>.env`; plus session-level pin `set_config_option(configId=model)` executed in `handle_acp_send` on new sessions (fail-closed — pin failure aborts instead of silently billing GLM-5.3). Pin value lives in config as BOTH `providers.zcode.env.ZCODE_MODEL` (L1 process-level) and `providers.zcode.model` (L2 session-level); do not remove either layer.
- Every profile config pins the model via `providers.zcode.env.ZCODE_MODEL: "GLM-5.3-Flash"`. **This pin is mandatory**: `zcode-acp-server/dist/backend/credentials.js` defaults `ZCODE_MODEL` to `Object.keys(models)[0]` of the enabled provider (= GLM-5.3, which still burns credits at night). Explicit non-empty env overrides config (`mergeEnvWithCreds`).
- 33 SOULs referencing acp_send carry a 「夜间 ZCode ACP 免费通道」 rule block: night window → `provider="zcode"`; **free boundary (corrected 2026-09-06 evening): free = ZCode channel ONLY.** GLM-5.3-Flash via cc-switch (MGLM/MBGM upstream, incl. every profile's main-model `custom:cc-switch` routing and `acp_send provider="claude"/"codex"` backed by cc-switch) bills normally at night — the event does NOT make cc-switch GLM calls free; 429/timeout → fall back to `provider="claude"` (normal billing, free does not carry over); ≤2 retries, no spinning.
- Mechanical window check: `python3 ~/.hermes/bin/zcode_free_window.py` → prints `USE_ZCODE=1|0` (exit code matches); `--export` for shell eval, `--json` for scripts. Event-bounded: after 09-20 it returns 0 automatically — SOUL rules degrade gracefully to the daytime default (claude/codex).
- Verification level: Exercised — E2E `acp_send(provider="zcode")` wrote+ran a file (00:50, inside window), and the spawned server process env showed `ZCODE_MODEL=GLM-5.3-Flash` (`ps -wwE -o command=`).
- Ops notes: `_get_client()` reloads config per call (`_load_config(reload=True)`) but **reuses a live server subprocess** — after changing an `env:` pin, kill the old `zcode-acp-server` process or it keeps the old env. Kanban workers are fresh `hermes chat -q` processes: they pick up plugin/config changes on next dispatch, no gateway restart needed.
- Pre-change backups: `~/.hermes/backups/zcode-fleet-20260906/`. Deployment + verify scripts (reusable): `~/hermes-docker-sandbox/workspace/deploy_zcode_fleet.py` / `verify_zcode_fleet.py`.

## Related skills

- **acp-bulk-deployment** — Full 5-step deployment across all profiles (owned by `default` profile; this skill is the orchestrator-side complement for provider-choice guidance)
- **codex** — Codex CLI direct terminal usage (bundled skill, read-only reference)
- **claude-code** — Claude Code CLI direct terminal usage (bundled skill, read-only reference)
- **hermes-acp-claude-code** — Single-profile Claude ACP setup (owned by `default` profile)
