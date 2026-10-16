# Spec：hermes 侧两数据面供给（A7 挂账边界清账）

- 分支：`fix/hermes-data-surface`
- 日期：2026-10-17
- 上游：用户指令「hermes 侧那两个数据面……要的」（轨迹落盘 + 员工身份证）
- 前序：A7 复盘（overlay cb6c3fc0）把两项划为 hermes 侧边界挂账，本批清账

## 问题定义（探针实证）
1. **轨迹零 span**：run-trace 插件装在宿主与 SIM 树，631 份轨迹全空壳
   （header+trailer 零 span）。根因=插件 7 个回调签名 (ctx, payload) 与核心
   调用约定（invoke_hook **kwargs 展开，plugins_dispatch._hook_callback_kwargs
   按形参名切片）不符 → 切片恒空 dict → callback() TypeError → fail-open 静默
   吞。探针插件实证：kwargs 版被调、(ctx,payload) 版零调用。
2. **身份册零匹配**：事故报告身份面判据读宿主 ~/.hermes-web-ui/agent-identity
   （仅 2 宿主身份），推演 15 员工从未在 SIM 侧注册；且身份名（aipaydev-<u>）
   与 profile 裸名（<u>）严格等名匹配恒 0；incident-sources 的相对 require 在
   vitest/vite 转换态失解析（Cannot find module 被 catch 静默吞）。

## 修复
1. run-trace 插件 7 回调改 kwargs 形参+重组 payload（函数体零改动）；mx-enable-run-trace.sh
   部署脚本（43 home+幂等 enable 判定含 already-enabled）；mx-up/plist 注入
   HERMES_RUN_TRACE_DIR→SIM 树；mx-lib studio 注入 AGENT_IDENTITY_STORE→SIM 隔离
   store。
2. 驱动 people 段注册 15 员工身份（幂等：同名跳过；失败记单降级不造假）；
   readIdentitySnapshot 匹配口径双向去前缀；相对 require 改静态 import。
3. readTraceSummary 窗口聚合（hermes 会话文件名=时间戳，RUN_ID 查文件名永远
   miss；按 header.started_at 落窗聚合）。

## 验收
- run20 证据+SIM trace/身份实测：17 要素 collected 2→7（message_history/
  effective_autonomy/effective_tool_use/agent_identity/trust_boundaries/
  theoretical_autonomy 转正；absent 15→10）。
- SIM 树一次性会话 trace 落盘实证：header+llm_span×13。
- 身份 REST 注册实测 15/15 成功；守门 trace-window 4 例+incident 套件 25 例。

## 边界（仍挂账，hermes 运行时更深层）
- os_interactions：需工具名族 terminal_exec/code_exec/write_file 的真实调用
  （当前轨迹聚合的是 agent 会话工具，fixture 名不匹配=判据面窄，非管道断）。
- delegation_chain/auth_credentials：需身份册的委托链与凭证登记动作
  （registerIdentity 已支持，驱动未采集委托事实）。
- design_topology/runtime_topology：需 workflow_runs 表数据（hermes 侧未落）。
- orchestration_protocol/communication_logs：需群聊编排面按 session 绑定
  （当前 gc_* 表未与 run 会话键关联）。
以上五项依赖 hermes 侧对应 telemetry 落库，逐项可在后续轮次按需接线。

## 决策记录

| # | 决策 | 理由 | 替代（否） | 可逆 |
|---|---|---|---|---|
| D1 | 改插件签名而非改核心调用 | 核心约定是官方契约（VALID_HOOKS+kwargs 切片）；插件的 (ctx,payload) 是过时约定 | 改核心（碰 upstream=红线） | 可逆 |
| D2 | 身份名带项目前缀+匹配双向去前缀 | 多项目同册时裸名撞车；前缀隔离+匹配兼容 | 裸名注册（撞车） | 可逆 |
| D3 | 静态 import 替相对 require | vite 转换态相对 require 失解析且 catch 静默吞=恒 absent | 保持 require+放大 catch 日志（仍断） | 可逆 |
| D4 | trace 窗口聚合按 header.started_at | 文件名时间戳与 RUN_ID 永不相等是 hermes 形态 | 改 hermes 文件名为 RUN_ID（碰上游） | 可逆 |
| D5 | enable 判定含 already-enabled | CLI 幂等语义返回非零退出码 | 只看退出码（43 home 全判假失败） | 可逆 |
