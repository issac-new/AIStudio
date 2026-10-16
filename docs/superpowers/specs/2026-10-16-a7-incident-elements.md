# Spec：A7 事故报告 17 要素聚合窗口跨天修复（run20 复盘剩件 2/2 可修部分）

- 分支：`fix/a7-incident-window`
- 日期：2026-10-16
- 上游：用户指令「还有两件没修的，也修了」（B5 已修，本件为 A7）
- 复盘正本：overlay/docs/2026-10-16-run20-retrospective.md（A7 条）

## 问题
run20 事故报告 17 要素 12 项未采集（"共 0 条消息"读 webui 主库——agent 实际走
Matrix+profile state.db）。四层根因，前三层可修、第四层为 hermes 侧数据面边界。

## 修复（前三层）
1. 窗口跨天：runWindowFromSessionId 优先读锚定轮 state.env 的 run_started_at
   →now+2h 缓冲（RUN_ID 日期单日窗切掉跨天轮首尾——run20 42.5h 全窗塌）；
   无 state 回落 48h 保守窗。
2. 聚合回退判据：主库 readSessionMessages 查无此 session 返回 total=0 空对象
   （非 null）——旧判据 !messages 恒 false，profile 聚合分支永不进；改
   total=0 也回退。
3. content NULL 兜底：工具消息 content 列为 NULL，slice 崩（readProfileDb/
   readSessionMessages 两处）。
4. 接线：控制器 query 加 state_env（显式>env HERMES_INCIDENT_STATE_ENV）；
   驱动导出带 ?state_env=<锚定轮路径>。

## 边界（未修，如实挂账）
- trace span 落盘：SIM 树无 traces/ 目录（hermes 侧 telemetry 未供给）——
  effective_tool_use/os_interactions/design_topology 等 8 项依赖它；
- 推演身份册：15 个 AI 员工身份未在 SIM 侧注册（宿主身份册仅 2 个宿主身份）——
  agent_identity/trust_boundaries/delegation_chain 等依赖它。
两者属 hermes 侧数据面，需 hermes 侧 telemetry 供给（独立项）。

## 验收
run20 实测：17 要素 collected 2→3（message_history/effective_autonomy 转 collected），
absent 15→14；守门 incident-window.test.ts 2 例（state 真窗/回落 48h）+incident
套件 21 例全绿。

## 决策记录

| # | 决策 | 理由 | 替代（否） | 可逆 |
|---|---|---|---|---|
| D1 | 窗口真值=锚定轮 state.env | RUN_ID 日期只是命名日，跨天轮首尾在外（run20 实证） | 猜 48h（粗） | 可逆 |
| D2 | 无 state 回落 48h 保守窗 | 宁可多采（噪音）不可少采（漏证）；多采面由报告端过滤 | 单日窗（漏证） | 可逆 |
| D3 | total=0 走聚合回退 | 空对象≠无数据（主库本就不存 agent 会话） | 只判 null（恒不回退） | 可逆 |
| D4 | hermes 侧两项挂账不越界修 | 推演程序只改 harness/产品层；hermes telemetry 供给是独立供给侧 | 手改 upstream（红线） | 可逆 |
