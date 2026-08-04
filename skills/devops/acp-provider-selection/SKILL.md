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

The Hermes `acp-client` plugin natively supports **two coding-agent providers** via the same `acp_send()` interface. This skill guides the per-task choice and covers Codex readiness verification.

## The two providers

| Provider | CLI binary spawned | Adapter package | Language |
|----------|-------------------|-----------------|----------|
| `claude` (default) | `claude-agent-acp` or `@zed-industries/claude-code-acp` | `@agentclientprotocol/claude-agent-acp` | Node.js |
| `codex` | `npx @zed-industries/codex-acp` | `@zed-industries/codex-acp` | Rust |

Both use the same ACP protocol handshake. The `provider=` argument in `acp_send()` is the only API difference:

```python
acp_send(provider="claude", agent="bypassPermissions", prompt="...", cwd="...")
acp_send(provider="codex", prompt="...", cwd="...")
```

The `_resolve_provider()` function in `plugins/acp-client/__init__.py` (lines ~73-149) maps provider names to launch commands.

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

## Related skills

- **acp-bulk-deployment** — Full 5-step deployment across all profiles (owned by `default` profile; this skill is the orchestrator-side complement for provider-choice guidance)
- **codex** — Codex CLI direct terminal usage (bundled skill, read-only reference)
- **claude-code** — Claude Code CLI direct terminal usage (bundled skill, read-only reference)
- **hermes-acp-claude-code** — Single-profile Claude ACP setup (owned by `default` profile)
