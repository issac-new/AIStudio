---
name: codex-acp-troubleshooting
description: "Fix codex-acp ACP failures: stdio crash, catalog enums."
version: 1.0.0
metadata:
  hermes:
    tags: [acp, codex, cc-switch, troubleshooting, orchestrator]
    related_skills: [orchestrator-worker-failure-triage, ccswitch-native-responses-schema, acp-provider-selection]
---

# codex-acp 调用故障排查（Broken pipe / 握手崩 / catalog 枚举）

触发词：acp_send codex 失败、Broken pipe、Errno 32、codex-acp 起不来、claude 通而 codex 不通。
claude provider 正常而 codex provider 秒断 = codex 侧自身故障，先查子进程为什么退出，勿反复重试 acp_send。

## 诊断序列

1. **手动 spawn 看真实死因**——acp_send 只回给你 Broken pipe，真实错误在子进程启动输出里：
   ```bash
   echo '{}' | npx @zed-industries/codex-acp 2>&1 | head -20
   ```
   config 加载错误在任何握手前打出，带文件名+非法枚举值——把「神秘断管」变成可修的具体报错。
2. **按报错分型**：
   - `unknown variant \`max\`, expected ... xhigh` 类 = catalog 枚举崩（下节）
   - provider 403 / invalid_request_error = 上游配额/路由问题，握手其实已通——终验改约到配额窗重置后（cronjob），勿在窗内反复重试
   - `switch failed: Invalid params — Unrecognized key: "runtimeModel"` = codex-acp 旧版用已废弃的 `runtimeModel` 参数做 session/setModel，新版 CLI 不认。升级 codex-acp 到适配版本；模型钉定改走 env 透传路径（进程级 env），不依赖 session 级 runtimeModel 参数。
   - 二进制/网络缺失 = 环境问题，修环境勿改代码

## 根因漂移：先重测当前配置，再信旧记录

卡面/评论里的旧根因是排障起点不是终点——阻塞 24h 后中间层（cc-switch current provider、catalog、模型缓存、CLI 版本）可能已全部变化，旧根因描述与新故障可能只是症状相似。复排时对每一层**重测当下实际值**：

- **上游 wire 端点匹配**：codex 说 OpenAI Responses wire，current provider 的 `base_url` 必须有 `/responses` 端点（Anthropic 兼容端点打过去必 404）。实测：`curl -s -o /dev/null -w '%{http_code}' $BASE_URL/responses`——405=端点存在，404=该上游根本不支持 Responses。逐个候选上游实测后再切换，勿凭名称猜测。
- **旧缓存毒化**：provider 切对了还崩，查 `models_cache.json` 一类派生缓存——里面可能残留已废弃的旧枚举值，备份后删除重建。
- **CLI 版本回退**：桌面端自动更新会改 CLI 行为；先 `codex --version` 再对照记录。上游选择实证：`wire_api="chat"` 已被新版彻底移除（报错 no longer supported），无原生 /responses 的上游（实测 SRK 返 405）不可用——切换前逐个候选实测。

## catalog 枚举崩溃（最常见根因）

根因模型：cc-switch 按 provider 的 `modelCatalog.reasoningLevels` 生成 `~/.codex/config.toml` 与
`~/.codex/cc-switch-model-catalog.json`；词表按 codex CLI 的容忍度生成，而 codex-acp 的 serde enum
更严——CLI 能加载、codex-acp 加载即崩、stdio 子进程退出、调用侧只见断管。

- 合法 reasoning 枚举：`none/minimal/low/medium/high/xhigh`。provider 声明 `max` 等超集值即触发。
- **止血**：编辑 `~/.codex/cc-switch-model-catalog.json`（config.toml 若同样命中一并改），非法值改最近合法值（`max`→`xhigh`）。
- ⚠️ **止血会被回写**：cc-switch 切 provider/重新生成时按 provider 原始声明重写该文件。根治必须在
  cc-switch 源码的 catalog 生成处（`codex_config.rs` 一带的常量词表）按消费方拆词表过滤——单开卡片派工，
  勿只做止血就宣布解决。

## 修复后验收

```
acp_send(provider="codex", prompt="Reply with exactly one word: pong") → end_turn + "pong"
```
claude provider 同法跑一遍作对照组。catalog 修复后若恰逢上游配额窗，握手已通但模型调用报 403——
这算「通道已修复、终验待窗」，勿回滚修复，也勿据此重开排查。

## 红线

- Broken pipe 是症状不是根因：不手动 spawn 子进程拿到真实报错前，禁止重试/换参重发。
- catalog 手改 json 是止血不是解决：cc-switch 源码未落过滤前，切 provider 必复发。

## Related skills

- `orchestrator-worker-failure-triage` — worker spawn 秒死的 provider 层分型（熔断 vs 配额窗）
- `ccswitch-native-responses-schema` — codex 经 cc-switch 的另一类兼容崩（Responses schema 400）
- `acp-provider-selection` — claude/codex 任务级选型
