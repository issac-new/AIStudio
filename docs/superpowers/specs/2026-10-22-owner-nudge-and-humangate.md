# 催办 owner 动态路由 + HumanGate 前置批准（2026-10-22，run21/22 复盘产品化①②）

## 背景

run21 与 run22 两轮同族立案复现：催办/派单发往固定接收方而球在卡 owner 手里——run21
「缺陷修复期三连误催复测侧（修复者在 hu）」、run22「G5 退回单只达组织者 fanfan，
缺项 owner（qi/hu/xiao）未接活各空转 40-93 分钟」。另 run22 R-5 环形依赖：发布评审
把「导演批准记录落卡」计为缺项而批准只在判词 PASS 后触发——评审等批准/批准等评审，
靠评审员手工发「needs your OK」消息由 harness 审批环代批才破环（9h 拉锯构成因）。

## 落地（本仓 2 件）

1. **`custom/server/kanban/owner-routed-nudge.ts`**：催办路由单一解析点
   `resolveNudgeTarget`（纯函数）+ `POST /api/kanban/nudge/route`（卡源注入式）。
   四态决策：assignee 在位直投 → 空置回落板 team（注记「建卡未认领」派单断环
   可见性）→ 双空显式 unassigned（**绝不改投固定接收方**——两轮错侧催办的防复发
   锚）→ 卡不存在。4/4 测试。
2. **`custom/server/approvals/human-gate.ts`**：HumanGate 发布批准前置请求——
   评审员（或任何持卡角色）可**先于判词**发起人工批准请求（POST
   /api/approvals/human-gate），进入审批收件箱（与命令/评审审批同一聚合管线，
   kind=review/risk=high），人工批准落决策链并可回写 harness 事件账本
   （env HUMAN_GATE_EVENTS，缺省不写）——批准与评判决词解耦，环形依赖产品面
   断根。幂等（runId+cardId 唯一键）。4/4 测试。配套挂载：收件箱聚合子挂载
   （pending-controller 3 行）+ 路由子挂载（免改上游 mount patch）。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 双空态返回显式 unassigned 而非回落任何固定接收方 | 错侧催办比不催更糟（run21 越催越堵实录）；显式无人态让派单断环可见可治。 |
| D2 | 卡源注入式（setNudgeCardProvider）而非直连 DB | 纯函数决策面可测；装配点自由换源（kanban list --json/DB 直读），IO 不进决策。 |
| D3 | HumanGate 走收件箱聚合而非独立页面 | 复用 /app/inbox 既有 UI 与决策链；kind=review 前端已按前缀渲染。 |
| D4 | 子挂载路由（router.use）而非新 mount patch | 免改上游 patch 文件（并行会话在途编辑区），随 approvalsRoutes 一体上线。 |
| D5 | 事件账本回写走 env HUMAN_GATE_EVENTS 可选 | harness 侧按需接线（指向 evidence/approved.events）；缺省零副作用。 |
