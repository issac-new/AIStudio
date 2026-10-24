# mx-interventions：推演 run 介入归因账本（2026-10-23，天猫吸收轮联动批）

## 背景

天猫数字员工两文吸收轮（overlay spec `2026-10-23-tmall-digital-worker-absorption.md` D1-D3/D17-D19）
给 SwarmStudio 落了介入归因账本/协作成熟度/判例库三个观测面（8647 端点族）。
推演程序侧缺一个**自包含解析工具**：run 复盘（G6）与报告生成需要同一口径的机械读数，
且 simharness 纪律禁止 import overlay——同口径在两侧各自实现，对账以 spec D1-D3 为准。

## 交付

`mux/mx-interventions.py`：解析单 run 的 `evidence/compensation-ledger.tsv` +
`release-gate.jsonl` + `uat-verdicts.jsonl`，输出介入账本读数。

- 口径（与 overlay delivery 域 D1-D3 同源）：
  - dispatch-preset 带 `from=<人>` 首条=提出需求（raise）、后续=补充上下文（context）；
    无 from（backfill）=context/actor=system；层=collab（排活时）
  - nudge=催进度（delivery 层）；card-backfill/card-walk-done=解决卡点（delivery）
  - release-gate decision approve/release=拍板确认、reject=纠错返工（delivery）
  - uat-verdicts pass/conditional=拍板确认、reject=纠错返工（delivery）
  - auto-approve **不计介入**（meta 单列）；submit 不计
- 输出：`--json`（机器消费：entries/stats/riskSignals/maturity 读数）与默认 markdown 表
  （复盘贴档）；`--run <id>` 必填，缺席 run 目录如实退出非零。
- 风险信号阈值同 overlay D7：补充上下文占比≥40% 且总量≥5=上下文缺失；纠错返工≥3=理解偏差。

## 消费位

- G6 复盘（步 24/26）三段式复盘的「现象」段机械读数来源之一；
- V8.48（方案正本 §2.6.9）：复盘消费介入账本的推演侧实现。

## 决策记录

- 2026-10-23 立项（用户指令「更新全流程推演方案和推演程序」）：独立小工具而非改
  mx-report-gen.py 叙事步——生成器 5242 行按 run 重放历史叙事，机械读数属数据面
  不属叙事面；下次 run（≥run23）G6 复盘由驱动/人工消费本工具产物贴档。
- 不复用 overlay 端点（fetch 8647）：推演复盘须离线可重放（run 归档后端点不保证在），
  工具直读 SIM_ROOT 文件是唯一可重放路径。
- 台账 detail 只取第 5 列止（D13 列吸坑，两侧同修）。
