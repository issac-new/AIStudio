# ZCode ACP Provider — Integration Reference

Added 2026-09-04 to the orchestrator profile's `acp-client` plugin. ZCode is
Zhipu Z.AI's coding agent desktop app; `zcode-acp-server` (community ACP
adapter, github.com/william0wang/zcode-acp, Apache-2.0) drives the ZCode CLI
over the Agent Client Protocol so any ACP client — including Hermes — can use
the **officially authorized** GLM Coding Plan subscription behind it.

## Credential flow (why this is the legitimate path)

```
Hermes (acp-client, provider="zcode")
  └─ stdio NDJSON (ACP JSON-RPC 2.0)
      zcode-acp-server (npm zcode-acp-server)
        └─ spawns ZCode CLI (auto-discovered)
            /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs
            └─ reads ~/.zcode/v2/config.json
                provider "builtin:bigmodel-coding-plan"
                → apiKey + baseURL https://open.bigmodel.cn/api/anthropic
                    └─ GLM cloud (plan-metered)
```

No client fingerprint spoofing anywhere: the key and endpoint are the
subscription's own officially exposed Anthropic-compatible access. The same
key/URL pair also sits in cc-switch's `MGLM` provider entry — the two routes
consume the same plan quota.

**Free-window boundary (corrected 2026-09-06):** the GLM Coding Plan 夜间畅用
event (daily 23:00–09:00 Beijing, 2026-09-03 ~ 09-20) makes GLM-5.3-Flash
free **only when called through the ZCode channel** (ZCode CLI / zcode-acp-server).
The same model requested through cc-switch (`MGLM`/`MBGM` upstream) — including
every profile's main-model `custom:cc-switch` routing and
`acp_send provider="claude"/"codex"` backed by cc-switch — **bills normally at
night**. The event does not make cc-switch GLM calls free; it only steers night
ACP delegation toward `provider="zcode"`.

## Install + config (orchestrator profile, done 2026-09-04)

```bash
npm install -g zcode-acp-server   # bins: zcode-acp-server, zcode-acp; v0.21.0 verified
node --version                    # needs >= 22.5 (node:sqlite experimental)
```

`~/.hermes/profiles/orchestrator/plugins/acp-client/config.yaml`:

```yaml
providers:
  zcode:
    binary: /opt/homebrew/bin/zcode-acp-server
    default_cwd: /Users/YOURNAME/hermes-docker-sandbox/workspace
```

Optional env overrides via `providers.zcode.env` (applied by the plugin's
`_resolve_provider` zcode branch): `ZCODE_BIN` (custom ZCode CLI path — not
needed on standard installs, the server auto-discovers the app bundle),
`ZCODE_MODEL`, `ZCODE_BASE_URL`, `ZCODE_ACP_AUTO_COMPACT_THRESHOLD`.

## Code patch (required — config alone is not enough)

`_resolve_provider()` hardcodes provider branches. The `zcode` branch (between
`claude` and the final `else`) resolves `binary` from PATH or absolute path,
extends with `args`, applies `env` overrides, returns display name `ZCode`.
Without it: `ValueError: Unknown ACP provider: 'zcode'`.

**Per-profile drift**: every profile keeps its own
`plugins/acp-client/__init__.py`. The patch currently exists only in the
orchestrator profile — sync before using `provider="zcode"` elsewhere.

## Verified capabilities (2026-09-04, end-to-end)

| Tool | Result |
|---|---|
| `acp_agents(provider="zcode")` | 5 modes: plan / build / edit / yolo / auto (default **yolo**) |
| `acp_send(provider="zcode", prompt="Reply exactly: ZCODE-ACP-WORKS")` | returned `ZCODE-ACP-WORKS`, `stop_reason=end_turn`, usage `{used: 28688, size: 1000000}` (1M context) |
| Multi-turn | pass returned `session_id` back into `acp_send` |

Server `initialize` handshake reply (useful for debugging):

```json
{"protocolVersion":1,"agentInfo":{"name":"zcode-acp-server","title":"ZCode","version":"0.21.0"},
 "authMethods":[{"id":"zcode-credentials","description":"Reads the GLM API key from ~/.zcode/v2/config.json managed by the ZCode desktop app. No editor-side credentials required."}]}
```

## Radar pipeline night-free routing (2026-09-07)

The nightly radar pipeline's LLM calls (domain reports, [已移除], main-report
brief — all via `life-workbench/scripts/radar_llm.py` `ask_llm_json`, the
single choke point) now route through zcode during the free window:
window check (`zcode_free_window.py`, process-cached) → direct plugin import
→ `handle_acp_send(provider="zcode")`; zcode failure → process-level disable
→ remaining attempts fall back to `hermes -z` (billed, no free carry-over).
Exercised E2E in-window: pay/[已移除] reports + brief all logged
`ok via=zcode attempt=1`; real hermes fallback drill passed; PDFs generated.
Note: `life-workbench/` is gitignored — keep runbook-level pointers here.

## Handshake smoke test (no Hermes involved)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' \
  | timeout 15 zcode-acp-server | head -2
```

Expect the `initialize` result line above. A raw `session/new` +
`session/prompt` via a small Python NDJSON driver was used for the first
end-to-end proof; afterwards the plugin's own `handle_acp_send` was exercised
(dropped to `python3` + `sys.path.insert(0, plugins/acp-client)` + direct
`handle_acp_agents`/`handle_acp_send` calls — the `acp_*` Hermes tools require
a session/gateway reload to see the new provider branch).

## Notes

- `~/.zcode/cli/config.json` (hooks, plugins, skills toggles) is the ZCode
  CLI-side config — distinct from `~/.zcode/v2/config.json` (providers/keys).
  The ACP server reads only the latter.
- stderr noise `ExperimentalWarning: SQLite` and
  `unhandled server→client request: interaction/requestOfficialMcpAuthHeaders`
  is benign.
- Related: cc-switch `MGLM` (claude channel, currently `is_current=1`) uses
  the identical key/endpoint — see `ccswitch-failover-queue-management`.
