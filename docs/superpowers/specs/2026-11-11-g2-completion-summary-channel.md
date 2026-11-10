# 2026-11-11 G2 判定第三通道：卡完成摘要（v0.23.1 agent 交付面漂移根治）

> 来源：run29 开跑前烧机（burn-20261111-004618）G2 硬闸两轮 600s 超时判 fail。烧机实证，非推断。

## 变更

1. **`simharness/mux/mx-scenario-lib.sh` `mx_gate_card_text()` 增第三读取面——卡完成摘要**：现读 title+body+result 三字段；v0.23.1 agent 换血后评审交付面漂移（烧机实录：secops 卡 t_0031da27 01:44 完成、attached 评审稿 11KB、completed 事件 summary 含「结论 SECURITY-GATE-PASS」，但 result=None、无房间回执、无卡评论——旧两通道全盲，判读超时 fail）。新增 `mx_card_completion_summaries()`：对 `account_boards` 各板直读 `task_events` 表 `kind='completed'` 的 `payload.summary`，与 jq 卡面文本拼接后送治理判定（窗口锚与现卡面同规：completed_at ≥ since-60s）。
2. **信任面论证**：completed summary 由产品 kanban worker 在卡终态时写入（tasks.completed_at 同刻落库），与 result 字段同级信任——都是产品记录的 agent 最终输出，非导演代笔；判词语义解析仍走 `gov_lc_verdict` 单一事实源，本批只扩采集面不新增判读逻辑。
3. **产品侧缺陷挂账**：v0.23.1 agent 评审不写 result/不回房（run28 v0.23.0 同流程有评论+房间回执）——agent worker 完成契约漂移属产品缺陷，本批以通道兼容先根治工装失明，agent 面修复挂 run29 复盘台账（N29-14）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 修工装通道而非回滚 agent 基线 | 回滚 v0.23.1 违背换血批意图；通道扩面对历史形态（result/房间行）零影响（只增不改），G5 复评卡同型交付面同样受益 |
| D2 | 直读板库 task_events 而非产品端点 | kanban CLI/API 均不暴露 events（实测字段面 26 键无 summary/events）；板库在 SIM_ROOT 隔离域内、harness 已有直读先例（监督器扫 boards/<板>/kanban.db 代记）；端点化留产品缺陷挂账一并做 |
| D3 | 拼接进 ct（卡面文本）而非独立第四参 | 治理判定服务签名不变（rt/ct 两文本入），relay 对照行/判词回执链路零改动 |
| D4 | 窗锚沿用 -60s 放宽同规 | 卡建/完成与锚落键天然竞态秒差，与现卡面通道同判据（run24 先例） |

## 验证

- 活体回放：修复后对 burn 卡 t_0031da27（结论在 summary、result 空）跑 `mx_gate_card_text`，能取到含 SECURITY-GATE-PASS 文本；对 run28 旧卡（t_5cdf22e7 结论在 body/评论）行为不变。
- `bash simharness/tests/run-gates.sh` 全绿；`bash -n simharness/mux/mx-scenario-lib.sh` 过。
- 烧机重烧取当轮收据（机制文件变更后旧收据不认账——烧机纪律）。

## 设计文档影响

DESIGN_SYNC: none——simharness 推演工装采集面修正，不触及 DESIGN_DOCS 四正本；方案 §5.12 判读通道语义未变（扩采集面），随批在 run29 prelude spec 增补一条变更记录。
