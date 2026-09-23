# Phase 0 Spike 实证（2026-09-23）

验收基线：设计 §6 P0（v0.1 §56 五项），全部 PASS。

## 五项验收

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 插件可安装 | PASS | `zcode plugin list`：`qgate@inline [enabled] ... hooks: 3`（inline 注册 = config.json plugins.dirs 指向本仓 plugin/） |
| 2 | Hook 出现在 ZCode | PASS | hooks.json 三事件被插件发现层解析（SessionStart/PostToolUse(matcher Write|Edit)/Stop） |
| 3 | 新 Session 触发 | PASS | hooks.log 第 1 行 `SessionStart source=startup sessionId=sess_44c18507…` |
| 4 | Stop 向 Agent 注入反馈 | PASS | hooks.log：`Stop outcome=block` → agent 续跑补标记 → `Stop outcome=approve stopHookActive=true`；result.response = `hello\n\nQGATE-SPIKE-OK`；usage.modelRequestCount=2（阻断-续跑闭环铁证） |
| 5 | 日志可定位 | PASS | `.qgate/hooks.log`（项目级）+ headless-stream.jsonl 内 hook 生命周期事件带 descriptor |

## 本地预检（模拟 stdin，先于 E2E）

stop.mjs 五分支：无标记→block（带 reason+systemMessage）/含标记→approve/stop_hook_active→approve 降级/无 .qgate →exit0 静默/hooks.log 落盘。全绿。

## 环境与命令

- CLI：upstream/zcode @872ad96 构建产物 `apps/zcode-cli/packages/cli/dist/zcode.cjs`（v0.16.9）
- 探针项目：`/tmp/qgate-p0-probe`（含 `.qgate/` opt-in 标记）
- 事件流：`headless-stream.jsonl`（193 行：turn.started ×1 / model.streaming ×157 / session.updated ×32 / turn.completed ×1 / result ×1）
- 消耗：79,885 tokens（2 次模型请求，缓存命中 39,936）

## 关键机制确认（设计 §3 修正案的实证）

- Stop 阻断反馈确实经 `decision:block` + reason/systemMessage 注入 additionalContext（agent 行为改变可观察）
- `stop_hook_active` 在续跑后的第二次 Stop 为 true（降级阶梯的判定输入可用）
- 项目级 opt-in（cwd 无 `.qgate/` 即静默）有效，注册全局插件不干扰其他会话
