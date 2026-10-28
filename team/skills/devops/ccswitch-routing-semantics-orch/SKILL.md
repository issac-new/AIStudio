---
name: ccswitch-routing-semantics-orch
description: Use when cc-switch routing or model-name mismatch diagnosis.
tags: [cc-switch, routing, load-balance, model-mappings]
---

# cc-switch 路由语义（orchestrator 补充件）

> **权威源声明**：default profile 的 `cc-switch-monitoring`（§2b Multi-group routing）为准；本件只补「模型名归属 + 模型盲选点」语义，归并回原件后本件退役。读操作走 `skill_view('cc-switch-monitoring')`。

## 总是被需要的规则

1. **模型名归客户端所有**：请求里的 model 名由客户端（Hermes 会话）决定；provider 的 `settings_config.models` 只是展示清单，不约束请求名，也不参与选点过滤。「cc-switch 里配的是 X」推不出「会话请求的是 X」——用 `proxy_request_logs` 的 `request_model`（客户端发的）vs `model`（映射后转发上游的）实测。
2. **改名机制按组而异**：claude 组用 provider env `ANTHROPIC_MODEL` 强改一切请求名；hermes/codex 组原样透传，除非该 provider 配了 `meta.model_mappings`。cc-switch.log 的 `[Claude]`/`[Codex]` 标签是 wire-format 分支不是分组——hermes 组（codex_responses）也打 `[Codex]`，分组归属以 `proxy_request_logs.provider_id JOIN providers.app_type` 为准。
3. **选点是模型盲的**：LB/failover/会话粘性选 provider 时不检查它是否服务请求的模型——异源模型请求（如 GLM 组里的 DeepSeek 系模型）在粘到非原生 provider 时必 400。这是路由错配，不是 provider 故障；看 `status_code` 分布与当前粘性 provider 即可定位。
4. **`meta.model_mappings` 是改名不是路由**：把异源模型映射成对方原生名来「消灭 400」= 静默换错模型，比可见的 400 更糟。根治在客户端侧：把错配请求源隔离出共享组（独立 provider 条目 / 显式钉 aux 任务 / 关停扇出源）。
5. **用户质疑配置值时，重读 `proxy_config` 全部行并看 `updated_at`**：每分组（claude/codex/hermes/...）各一行、各自带 `load_balance_mode`（`off`=单点+failover 队列；`session`=会话粘性），用户可能刚在 UI 翻了任意一行；UI 改动热生效，无需重启代理。
6. **时间戳比较**：`proxy_request_logs.created_at` 是 unixepoch UTC，与 `strftime('%s','now','-N minutes')` 比较；把本地墙钟字符串做 `'localtime'` 换算方向会反、静默零行。
7. **「每回合 400+Fallback 配对」= 会话 primary 模型漂移，不是 cc-switch 故障**：签名 = agent.log 里 `turn_context: model=X` 紧跟 `Fallback activated: X → Y`。注意 state.db `sessions.model` 只记最后成功调用的模型（即回退后的 Y），**不是 primary**；config.yaml/.env/进程 env 也都可能干净——坏值在 TUI 进程内存的会话模型覆盖里（`_restore_session_model` 恢复/维持的就是它）。典型起源：会话启动时某 provider 是 cc-switch current、其原生模型可正常服务；current 被切走（换组/开 LB）后，该 primary 在新组里必 400，每回合先烧一次 400 再回退 `fallback_providers`。修复 = 在该会话 TUI 里 `/model aim`（0917 舰队裁决的标准占位符：cc-switch 侧解析成 current/粘性 provider 的原生模型，对换组/开 LB 免疫；claude 分支 22.6 万次 200、codex 分支 1155 次 200 实测）——agent 侧改 DB/config.yaml 无效（管不到内存态）。组内实名模型（如 glm-5.3）是 aim 异常时的备选。注意新组（如 10-23 建的 hermes 组）× aim 组合可能无历史记录，归位后首个回合用 agent.log turn_context 复测。**aim 声明恢复配方（舰队级）**：`HERMES_HOME=<profile目录> hermes config set custom_providers.<N>.models.aim.context_length 1048576`（N=该 profile custom_providers 里 name=cc-switch-route 的下标，多数 profile 是 0）；批量前先 cp 全量备份，批量后对照备份验证仅新增 aim、model.default/fallback/条目数不变。**坑：TUI 运行中会话的内存回写会洗掉 CLI 对 config 的新增声明**（2026-10-24 orchestrator 实证被洗一次）——归位动作（/model aim）要尽快做，归位后内存态即 aim、回写自洽；再被洗就重跑单行命令。副伤害：模型乒乓触发 `Dropping reasoning item … sealed to its issuer and model` 警告。诊断快捷路径：`grep turn_context <profile>/logs/agent.log | tail -1` 看 effective primary → `grep -c "Fallback activated"` 数中招回合 → cc-switch.log 看 400 落在哪个 provider。

## 归并清单（default 会话执行后本件退役）

把以下各项并入 default `cc-switch-monitoring`：模型名归属 + 按组改名机制（规则 1/2 → §2b）；模型盲选点 + mappings≠路由禁静默替换（规则 3/4 → §2b 或 Pitfalls）；created_at UTC 陷阱（规则 6 → Pitfalls）。归并后删除本件，防双事实源漂移。
