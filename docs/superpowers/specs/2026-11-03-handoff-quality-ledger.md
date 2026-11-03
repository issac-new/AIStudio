# 交接质量账本：把「派活—收活」变成可观测读数

日期：2026-11-03
状态：implemented
触发：用户两篇调研——《Recursive Self-Improvement through Multi-Agent Self-Supervision》（MASS, arXiv 2610.12176）与 DeerFlow 2.0（字节开源 Super Agent Harness）。两者共同骨架是「Lead/统筹拆活 → 子代理接活」；MASS 进一步证明**交接质量本身是可学习的信号**（子代理调用 1/110→87/110、代码交接 1/110→83/110）。仓内 `stage-keys` 只覆盖**声明式**阶段契约，缺**运行态**「接手方到底交出东西没有」。调研见 `docs/reports/2026-11-03-mass-deerflow-handoff.md`。

## 变更

- 新增 `custom/server/handoff/handoff-quality.ts`（纯函数）：从看板事件推「认领回合」（claimed 起，completed/gave_up/crashed/reclaimed/archived 止），产出交付率、掉落率、认领→完成中位时长、停滞数、抖动（同任务 ≥3 次认领）、依赖等待/解除数。
- 新增 `custom/server/handoff/handoff-controller.ts`：`GET /api/harness/handoff/quality?windowHours=&stallHours=`，逐板 fail-soft（坏板进 `boardErrors`，不拖垮聚合）；参数越界 400。
- `custom/server/harness/harness-controller.ts`：挂载 `/handoff` 子路由。
- 设计同步：正本 §5.8 增「交接运行态读数」一句；总账增「交接回合口径」一行；附录 A.1 登记本 spec 与报告。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 按「认领回合」而非「人对人交接」统计 | `claimed` payload 只有锁与 run_id，历史接手人不可得；按回合至少能判「接住没接住」 | 用 assignee 快照硬凑（否决：回溯不到历史，会造假） | 是 |
| D2 | `reclaimed` 只关上一回合、不开新回合 | 一次锁过期回收若同时算「上一任掉落 + 新一任认领」，会把一次事故记成两次 | 把 reclaimed 当认领事件（否决：实测 dropped 虚高 33%） | 是 |
| D3 | running 不进交付率分母 | 还没到判的时候，算进去会随观察时刻漂移 | 全部回合进分母（否决：读数随看板活跃度抖动） | 是 |
| D4 | 空输入比率为 null 不写 0% | 0% 会被读成「全都交接失败」 | 空即 0（否决：假信号） | 是 |
| D5 | 只出读数、不接晋级门禁 | MASS 把它当信号而不是判据；先积累再谈阈值 | 直接设门（否决：没有基线就设阈值是拍脑袋） | 是 |

## 验证

- `custom/server/handoff/__tests__/handoff-quality.test.ts`：完成/掉落/回收/停滞/窗口外/抖动/依赖/空输入八态（8 例）。
- `custom/server/handoff/__tests__/handoff-controller.test.ts`：真实读数（完成 1、停滞 1、坏板入 boardErrors）＋参数越界 400（2 例）。
- 全量 `npm test` 与 `npm run typecheck:harness`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 增交接运行态读数。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增交接回合口径一行。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec。
