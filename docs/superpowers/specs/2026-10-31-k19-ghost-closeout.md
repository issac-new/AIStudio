# 未做项终清批：K19 棘轮双红转正（lib/http 收口）＋看板幽灵卡挂账销案

日期：2026-10-31 ｜ 轮次：日常工作台回归·未做项终清 ｜ 类型：refactor（服务端 3 文件 7 处）＋docs（挂账销案修订＋decisions）

触发：用户 2026-10-31 指令「完成所有未做」。终报两项遗留：①全量 2 红=K19 棘轮超限（ctx.body 1197>1193、ok:false 877>874），归因并行批 9447f97f6（+5 ctx.body/+4 ok:false 净新增）与 d16b4b433（+1）新增代码未走 lib/http；②看板幽灵卡挂账。

## 1. 变更

### 一、K19 棘轮转正：并行批新增手写响应体转 lib/http 统一出口

三文件七处（只转新增块，存量分支按域灰度不强制改写）：

1. **custom/server/approval-inbox/pending-controller.ts** hgate: decide 分支（9447f97f6 新增）——400/404/catch 三处失败体→`fail()`、成功体→`ok()`、尾部 400（该行原为存量修改行，随批一并）；**detail 键经 `extra:{detail}` 保留**（本文件存量 detail 消费方与 G5 驱动读数零变化，响应体新增 error 键为 fail() 语义自带）。
2. **custom/server/harness/workbench/controller.ts** `/proposals/:id/constraints` 成功体（d16b4b433 新增）→`httpOk()`（文件既有 `fail as httpFail` 同源通道补 ok 别名）。
3. **custom/server/eval/controller.ts** backfill 校验行（9447f97f6 修改行）→`fail(ctx,400,…,{problems})`，problems 数组原样。

转后棘轮：ctx.body 1197→1191（≤1193）、ok:false 877→872（≤874），`architecture-ratchet.test.ts` 7/7 绿；approval-inbox＋workbench＋eval 目标域 581/581 绿（含 9447f97f6 自带的 hgate decide 断言——detail 保键兑现）。

### 二、看板幽灵卡挂账销案（撤销收尾批 spec §挂账登记）

复查定谳：t_ea687287 非「数据层已删的滞留渲染」，而是**活跃推演 run 的 sim 源卡**——`/api/hermes/sim/observer/overview` 实测 `available:true, runId:live-verify-20261031, posture:standard`，148 任务含该卡；DOM 推演徽章（kanban-card-sim-badge）在位、点击正确跳 `#/app/sim?run=live-verify-20261031`（openInSim 设计语义）。日常 CLI 九板扫描无此卡=SIM 任务住 SIM_ROOT 板，与「数据层已删」判断相反；收尾批当时的「幽灵」判定源于把 sim 卡当 daily 卡点击期望抽屉。**非产品缺陷，挂账撤销**；探针 E2 的 DOM∩overview 交取卡终案正确（overview 只含宿主板，天然滤 sim 卡）保留不动。

## 2. 决策记录

1. **K19 转换保 detail 键而非改消费方**（Mechanical）：hgate decide 的 detail 消费方含收件箱 UI 与 G5 驱动（simharness），改键面大于本批职责；`extra:{detail}` 双键过渡与 lib/http 设计一致（extra 即为兼容保留键），后续按域灰度收敛。
2. **幽灵卡销案而非深修**（Mechanical）：三源证据（observer available:true＋徽章在位＋点击跳转正确）证明设计内行为；错误在收尾批的判定而非产品。
3. **只转新增块**（Mechanical）：棘轮语义=「新增请用 lib/http」；存量 1191 处按域灰度（lib/http 头注既策），不顺手扩大改写面。

### 台账补全注记（2026-10-31 台账批）

本 spec 首合（1ca45f3 经 7b544c8）时收据在合并荡失（收据对账 0 条实录）——本批以 SPEC_REBIND 修订重绑收据；同批补 decisions 追补 6 条（批①②③ 决策机读化）＋挂账登记 2 条（eval TS2339 存量松型／K19 计数并行抬高监视）＋链修复锚（verify-chain 第 5 行为 2026-10-15 历史旧伤，append-only 下不可改写，已按工具教义续写修复决策；自 seq57 起经官方写入器重锚）。

## 3. 验证

- `npx vitest run custom/__tests__/architecture-ratchet.test.ts` 7/7（1191/872 双达标）；`custom/server/approval-inbox custom/server/harness/workbench custom/server/eval` 581/581。
- tsc（pending/workbench 两文件，harness 同参）零错；eval 文件既有 TS2339×4 为存量松型（本批 diff 仅 1 hunk 不触及，且该文件不在 typecheck:harness 点名清单）。
- 活体：decide 端点走收件箱人工路径抽查（hgate 400/404 分支 detail/error 双键在位）。
- 合并前全量 `npm test`。

## 4. 设计文档影响

DESIGN_SYNC: none。理由：lib/http 语义无变化（消费既有 extra 通道）；幽灵卡为销案记录非新契约。附录 A.1 随批登记本 spec；收尾批 spec §挂账段随批销案修订（SPEC_REBIND 授权）。
