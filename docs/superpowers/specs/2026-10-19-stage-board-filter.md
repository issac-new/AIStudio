# 阶段页看板按阶段过滤（spec）

日期：2026-10-19
分支：`fix/stage-board-filter`
来源：P2-9 续批。上一批只做到「同源说明 + 全量看板回链」，本批先定阶段 → 任务状态映射并落地过滤。

## 映射（单一事实源 `custom/client/ia2/stage-task-filter.ts`）

| 阶段 | 页签 | 可见任务状态 | 含义 |
|---|---|---|---|
| ③ 分析设计 | 任务分解 | `triage` / `todo` / `scheduled` / `ready` | 待分类、待办、已排期、可开工 |
| ④ 开发 | 看板 | `in_progress` / `running` / `blocked` / `review` | 进行中、运行中、阻塞、待验收 |

`done` / `archived` 不进阶段视图（历史结果在⑤验收与⑥治理看）；「常用 · 看板」继续显示全量。

## 变更

- 新增 `stage-task-filter.ts`：映射 + 中英说明文案 + `stageBoardStatuses()`。
- `SwarmKanbanView` 新增视图级 `statuses` 属性：在现有过滤链（工具条状态/指派人/我的待办/租户/归档/搜索）之后取交集，不写 store，不影响常用看板。
- `StageShell` 在 ③④ 阶段页给内嵌看板传本阶段状态，并把横幅改为「本阶段视图：只显示『…』的任务」；「在全量看板打开」回链保留。
- 纯函数 `filterTasksByStatuses` 抽出，测试与视图同源。

## 决策记录

- D-1：映射按 26 步流程的阶段职责划，不按看板列位置猜。③ 是分解/排期，卡应停在 `triage/todo/scheduled/ready`；④ 是编码与修复，卡在 `in_progress/running/blocked/review`。
- D-2：`done/archived` 不进阶段视图。阶段页回答「这个阶段还在办什么」，完成历史由⑤验收总览与⑥治理页承担；混进已完成卡会让在办视图失去重心。
- D-3：过滤放在视图层（props），不写看板 store。store 的 `filterStatus` 是全站共享状态，阶段页写它会污染「常用 · 看板」并造成刷新后残留。
- D-4：与既有过滤链取交集而不是替换。用户在阶段页仍可用工具条进一步收窄（如只看阻塞），语义是「本阶段 ∩ 用户筛选」。
- D-5：映射只覆盖确有看板页签的 ③④；① 搭建、② 需求、⑤ 验收、⑥ 治理没有内嵌看板，函数返回空数组=不过滤，避免为统一而虚构映射。
- D-6：阶段横幅如实写出当前显示的状态集合，用户不会把阶段视图误认为全量看板。

## 验证

- `npx vitest run custom/client/ia2/__tests__/stage-task-filter.test.ts custom/client/ia2/__tests__/stage-shell.test.ts custom/client/kanban`：13 文件 / 72 用例全过。
- `npx vite build --config <worktree 临时配置>`：构建通过。
- 浏览器（合入后随最终 dist 在 SIM `:8802` 复验）：③任务分解与④看板只显示映射内状态，横幅文案与回链在位。
