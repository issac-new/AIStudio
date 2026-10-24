# ZCode ACP Provider — Integration Reference

## ⚠️ Version-coupling alert (2026-09-18 实证)

`zcode-acp-server` 与 ZCode 桌面端后端**强耦合**：桌面端自动更新（如 3.11.2→3.12.3）后，旧版 adapter 的协议调用会被后端拒绝（`Method not found: workspace/updateProviderRegistry` → `turn.failed provider_not_configured`）。**桌面端每次更新后，必须 `npm install -g zcode-acp-server@latest` + 全链路复测**（handshake → pong → ps env → 后端日志 → 真任务），并重读本文件的故障分类学。

## ⚠️ 模型钉定现状（2026-09-18 后）

- **唯一活着的钉定层 = L1 进程 env**（`providers.zcode.env.ZCODE_MODEL` → Popen 透传 → server 进程 env）。验证方式：进程存活期内 `ps -wwE -p <pid> -o command=`（⚠️ `Popen` 对象没有 `.env` 属性，不能从 Python 侧读）；最终确认看 ZCode 后端日志 `~/.zcode/v2/logs/<date>.log` 搜 `runtime headers 已应用 {"modelId":...`。
- **L2 会话级 pin 已废**：`session/set_config_option(model)` 被 0.42.1+/3.12.3 后端拒绝（`unsupported config option or switch failed: model`）。插件副本（39 份，md5 f0c7440f…）已在 handle_acp_send 里对 zcode 跳过该调用；旧 fail-closed 设计若保留会让每个新 zcode 会话必炸。
- 不钉定的后果：server 默认取 enabled provider 的 `models[0]`（=GLM-5.3 付费档），夜间免费窗静默烧额度。

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
npm install -g zcode-acp-server   # bins: zcode-acp-server, zcode-acp
node --version                    # needs >= 22.5 (node:sqlite experimental)
```

`~/.hermes/profiles/orchestrator/plugins/acp-client/config.yaml`:

```yaml
providers:
  zcode:
    binary: /opt/homebrew/bin/zcode-acp-server
    default_cwd: /Users/YOURNAME/hermes-docker-sandbox/workspace
    env:
      ZCODE_MODEL: GLM-5.3-Flash   # L1 pin — the ONLY working pin layer now
    model: GLM-5.3-Flash           # legacy L2 pin; kept for config compat,
                                   # plugin skips session-level set_config_option for zcode
```

Optional env overrides via `providers.zcode.env`: `ZCODE_BIN` (custom ZCode CLI
path — not needed on standard installs), `ZCODE_MODEL`, `ZCODE_BASE_URL`,
`ZCODE_ACP_AUTO_COMPACT_THRESHOLD`.

## Code patch (required — config alone is not enough)

`_resolve_provider()` hardcodes provider branches. The `zcode` branch (between
`claude` and the final `else`) resolves `binary` from PATH or absolute path,
extends with `args`, applies `env` overrides, returns display name `ZCode`.
Without it: `ValueError: Unknown ACP provider: 'zcode'`.

**Per-profile drift**: every profile keeps its own
`plugins/acp-client/__init__.py`. 2026-09-18 fleet sync: all 39 copies unified
to md5 f0c7440f… (zcode branch + env passthrough + L2-pin skip). Deployment
后必哈希核验落盘产物：

```bash
find ~/.hermes/profiles -path "*acp-client/__init__.py" -exec md5 -r {} \; | awk '{print $1}' | sort -u
```

应只出一行。

## Verified capabilities（历史基线，0.21.0 时代）

| Tool | Result |
|---|---|
| `acp_agents(provider="zcode")` | 5 modes: plan / build / edit / yolo / auto (default **yolo**) |
| `acp_send(provider="zcode", prompt=...)` | end_turn, usage ~29k / 1M context |
| Multi-turn | pass returned `session_id` back into `acp_send` |

## Radar pipeline night-free routing (2026-09-07)

The nightly radar pipeline's LLM calls (domain reports, [已移除], main-report
brief — all via `life-workbench/scripts/radar_llm.py` `ask_llm_json`, the
single choke point) route through zcode during the free window:
window check (`zcode_free_window.py`, process-cached) → direct plugin import
→ `handle_acp_send(provider="zcode")`; zcode failure → process-level disable
→ remaining attempts fall back to `hermes -z` (billed, no free carry-over).
Note: `life-workbench/` is gitignored — keep runbook-level pointers here.

## Handshake smoke test (no Hermes involved)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' \
  | timeout 15 zcode-acp-server | head -2
```

## Channel breakage taxonomy & recovery rules (updated 2026-09-18)

The zcode channel is a 4-layer chain; a break at any layer looks identical
from the caller side. Diagnose layer by layer, re-testing CURRENT values —
do not trust previously recorded root causes:

1. **Plugin branch** — `grep -c 'name == "zcode"' plugins/acp-client/__init__.py`
   per profile copy. Fleet md5 对账（见上）。Copies drift independently; 0 = old
   no-branch build. Restore from a known-good backup and md5-verify.
2. **Model pin (L1 env only now)** — 验证阶梯：`ps -wwE -p <server-pid> -o command=` 查 `ZCODE_MODEL=`；后端日志搜 `runtime headers 已应用`。L2 session 级 pin 已废（见顶部警示），勿再走 `session/set_config_option` 或重新引入已废弃的 runtimeModel 参数。
3. **Server/CLI protocol drift** — 桌面端自动更新会换掉后端协议（3.12.3 改了 provider registry 推送与会话持久化，症状：`sessionNotFound`、`provider_not_configured`、`set_config_option` 拒绝）。**桌面端更新后立即升级 adapter**：`npm install -g zcode-acp-server@latest`（上游跟进很快，3.12.3 发布次日 0.43.x 即适配）。
4. **Credentials** — `~/.zcode/v2/config.json` (providers/keys), NOT
   `~/.zcode/cli/config.json`. Missing/rotated key = server spawns then dies at
   first prompt.
5. **Stale session mappings (2026-09-18 新增)** — `~/.zcode/v2/acp-lazy-sessions.json` 里 `zcodeSid` 指向后端已不存在（桌面更新清持久层）的会话时，调用侧若带旧 session_id 复用会得到 `fault.subscribe.sessionNotFound`。处置：备份后删除对应条目，新会话即恢复。

Recovery verification ladder (all before claiming the channel healed):
handshake smoke test → `handle_acp_send(provider="zcode")` pong (end_turn) →
ps env shows pinned `ZCODE_MODEL` → backend log shows `modelId: GLM-5.3-Flash`
→ one real task. "Server spawns" alone is not healed.

## Notes

- `~/.zcode/cli/config.json` (hooks, plugins, skills toggles) is the ZCode
  CLI-side config — distinct from `~/.zcode/v2/config.json` (providers/keys).
  The ACP server reads only the latter.
- stderr noise `ExperimentalWarning: SQLite` and
  `unhandled server→client request: interaction/requestOfficialMcpAuthHeaders`
  is benign.
- `acp-lazy-sessions.json` 的 160+ 条目是 adapter 侧映射，不是 ZCode 后端真会话——后端持久层独立，桌面更新清后者不清前者。
- GLM Coding Plan 免费窗 09-20 结束后：`zcode_free_window.py` 自动归零，SOUL 规则自动降级回 claude/codex，无需人工干预。
- 模型权限面：BigModel Coding Plan（`builtin:bigmodel-coding-plan`，enabled）models 表只有 GLM-5.3 / GLM-5.3-Flash / offpeak-idle-plan/GLM-5.3；**GLM-5.3-FlashX 未开放**（上游 1311: 当前订阅套餐暂未开放权限）。
- Related: cc-switch `MGLM` (claude channel, currently `is_current=1`) uses
  the identical key/endpoint — see `ccswitch-failover-queue-management`.
