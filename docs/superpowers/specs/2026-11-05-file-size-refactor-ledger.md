# 单文件体量治理台账（top 10）

> 日期: 2026-11-05
> 状态: 首批执行中
> 关联: `docs/superpowers/specs/2026-11-05-governance-truth-restoration.md`（P2-2）

## 变更

本台账登记 `custom/` 下 500 行以上源文件的拆分顺序与验收判据。2026-11-05 基线共 94 个 >500 行文件，top 10 如下：

| # | 文件 | 行数 | 现有测试 | 拆分目标 | 批次 | 状态 |
|---|---|---:|---|---|---|---|
| 1 | `custom/client/kanban/components/KanbanTaskDrawer.vue` | 2127 | 12 个直接用例，17 处整组件 mock | 抽屉分区块（头部/表单/房间动作/审批区） | 第三批 | 待办 |
| 2 | `custom/client/ide/views/IdeChatPane.vue` | 1889 | 2 个直接挂载 + 布局测试 | 会话启动/输入区/浮窗宿主拆 composable + 子组件 | 第二批 | 待办 |
| 3 | `custom/server/harness/workbench/service.ts` | 1856 → 1054 | 2 个直接 import + 18 个域内测试（workbench 全域 201/201 通过） | service-shared / auto-probe / experience 三模块 + 剩余 service.ts | 第二批 | 已完成 |
| 4 | `custom/client/shared/store/cockpit.ts` | 1669 | 48 个直接用例 + 20+ mock | 按域拆 store 切片 | 第四批（爆炸半径大） | 待办 |
| 5 | `custom/server/harness/workbench/loop.ts` | 1515 → 7（wrapper） | 55 个直接用例（workbench 全域 201/201 通过） | loop-core / loop-config / loop-pareto / loop-report / loop-advice 五模块 + loop.ts 兼容出口 | 第三/四批 | 已完成 |
| 6 | `custom/server/eval/controller.ts` | 1494 → 99 | 4 个 HTTP 测试 + 42 个域内测试（eval 全域 41 文件/397 用例通过） | 3 个 handler 模块（sets/runs/analysis），路由表留 controller | 第一批 | 已完成 |

> 首批结果（2026-11-05）：`controller.ts` 99 行（路由表）＋`routes/sets.ts` 430＋`routes/runs.ts` 595＋`routes/analysis.ts` 475＋`routes/shared.ts` 75；最大文件从 1494 降到 595。
>
> 第二批结果（2026-11-05）：`routes/runs.ts` 595→232（runs）/389（flywheel）/98（verdicts）；`service.ts` 1856→1054＋`service-shared.ts` 327＋`service-auto-probe.ts` 485＋`service-experience.ts` 124；eval 397/397、workbench 201/201。
>
> 第五批结果（2026-11-05）：`simcenter-controller.ts` 1349→587＋`observer-routes.ts` 243＋`uat-release-routes.ts` 336＋`evidence-issues-routes.ts` 166＋`settings-quality-routes.ts` 210＋`frames-routes.ts` 150＋`shared.ts` 17；simcenter 65/65 全过。
>
> 第三/四批结果（2026-11-05）：`loop.ts` 1515→7（兼容出口）＋`loop-core.ts` 484＋`loop-config.ts` 86＋`loop-pareto.ts` 107＋`loop-report.ts` 406＋`loop-advice.ts` 524；loop 55 用例、workbench 201/201 全过。`loop-advice.ts` 524 仍 >500，下一批可切进化报告。
| 7 | `custom/client/matrix-chat/stores/matrix-room.ts` | 1372 | 28 个测试提及，仅 1 个真实 import | 事件/成员/时间线三切片 | 第三批 | 待办 |
| 8 | `custom/server/simcenter/simcenter-controller.ts` | 1349 → 587 | 36 个直接用例 + 4 个域内测试（simcenter 全域 65/65 通过） | observer / uat-release / evidence-issues / settings-quality / frames 五路由模块 + shared + controller | 第五批 | 已完成 |
| 9 | `custom/client/ide/views/IdeTaskSidebar.vue` | 1321 | 17 个直接用例 | 任务列表/详情/操作三条 | 第三批 | 待办 |
| 10 | `custom/client/ia2/views/gov/HarnessImprovePanel.vue` | 1300 | 21 个单文件用例 | 面板/提案/证据三块 | 第三批 | 待办 |
| 11 | `custom/server/eval/routes/runs.ts`（首批产物） | 595 → 232 | eval 全域 41 文件/397 用例 | 232（runs）/389（flywheel）/98（verdicts） | 第二批 | 已完成 |

拆分纪律：

1. 只做「移动 + 重导出」，不在同一提交里改行为；行为变更另开提交。
2. 每次拆分后先跑该域全量测试，再跑 `npm run typecheck:harness`；失败即回滚该提交。
3. 保留原导出面（controller/barrel）为零改动兼容层，避免调用方同步改动。
4. 目标不是「行数达标」，是「单文件可在一个上下文内被完整理解」；行数只作代理指标。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 |
|---|---|---|---|---|
| 第二批拆分粒度 | 按职责切片、保留导出面（runs 3 组 / service 4 模块） | 一次全拆 | 测试覆盖足够、无行为变更；先拆有行为兜底的域，Vue 大文件仍留第三批 | Mechanical |
| 首批拆哪个 | `custom/server/eval/controller.ts` | `KanbanTaskDrawer.vue` | 路由按节注释已分组、导出面单一、42 个域内测试 + 4 个 HTTP 测试兜底；Vue 大文件测试多为整组件 mock，拆内部区块没有行为兜底 | Mechanical |
| 是否批量改名/搬目录 | 否，保留原路径与原导出 | 大规模重构 | 1044 个测试文件的引用面太大；先拆内部结构，不动公共路径 | Mechanical |
| 行数目标 | 首批降 30% | 一次降到 500 行以下 | 一次降太多会把「移动」变成「重写」，回归面不可控 | Mechanical |

## 验证

- 拆分后：`npx vitest run custom/server/eval/__tests__`（42 文件）
- 4 个 HTTP 测试：`eval-closure` / `flywheel-http` / `eval-baidu-http` / `trace-reflow-http`
- `npm run typecheck:harness`
- 行数复核：`wc -l custom/server/eval/controller.ts custom/server/eval/routes/*.ts`

## 设计文档影响

- DESIGN_SYNC: none
  - 理由：纯代码结构拆分，不改变能力边界、契约或数字口径；设计正本无需同步。
