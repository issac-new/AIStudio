# 裁定落地批（D26）：并入/挂回/恢复三裁定全量实施

- 日期：2026-10-24
- 状态：已落地
- 载体：`feat/func-restore-reunion`（worktree `func-restore`，验证前端 8651）
- 用户裁定原文：「1、并入；2、挂回；3、恢复」（对应 D25 报告的三个待裁定项）

## 裁定①：SkillgovSection 并入 /app/skillgov

`SkillgovView` 新增第三签 `governance`（「生成与教训」），整段嵌入
SkillgovSection（技能生成器/角色映射/教训库三段内部页签，零 props 自取
`/api/skillgov/*`）。孤儿归位为技能治理页的正式组成部分。
活体：`/app/skillgov?tab=governance` 第三签与生成器内容渲染实证。

## 裁定②：挂回两件

1. **ManagementAccountsPanel（项目健康三账）**→ `/app/board` 交付效能签
   顶部（DeliveryEffectivenessView 之上）。同吃看板域聚合数据；三个
   emits 全接线：open-task→看板签 openTaskId 机制、filter-assignee→路由
   query、go-inbox→审批收件箱（不做死按钮）。
   活体：`?tab=effectiveness` 渲染 ma-panel（标题「项目健康」）实证。
2. **SpecEditorView 可视化编排器（vue-flow 画布=改图改方案）**→
   `/app/sim/orchestration` 加「打开画布编辑器」按钮，query `view=editor`
   切换编辑模式（existingSpecs 喂当前规格清单，back/saved 回只读并刷新）。
   LoopCreateWizard（场景化创建向导）→ 工作台左栏「＋新建循环（场景向导）」
   入口；向导 emit 补带 loopId（原签名无参），created 深链进新循环。
   活体：orc-editor 按钮实证。

## 裁定③：呈现面恢复（方案完备性欠账回补）

1. **六闸仪/26 步总览默认展开**：`DirectorPanel.showTechnical` 默认
   false→true。方案 F4/F7/F27（运行总览是推演首签与冒烟必检项）。
   新增源码守门测试（字面量断言，同 attention-strip 先例）防回退。
   活体说明：该区在「无可读 harness 运行」时按既有设计渲染空态，
   默认展开在有 run 时生效——源码级+守门测试锁定，活体待有活跃
   harness run 的环境复核。
2. **AC 判定链/交付链并置⑤验收**：DailyTracePanel/DailyDeliveryPanel 尾部
   加「推演参照」details，内嵌 TracePanel/DeliveryPanel。**懒渲染**
   （@toggle 才挂载）——收起时不发请求且日常面板语义不被推演空态污染
   （daily-acceptance 守门测试约束该语义，保持绿）。
   活体：两个 details testid 实证。
3. **推演 HTML 报告产品内查看**（方案 F32）：服务端新增
   `GET /api/hermes/sim/report/:runId`（simcenter-controller，复用同族
   isValidRun+safeRunDir 防越界；报告缺席 404 如实——未跑完的 run 不编造）；
   EvidencePanel 头部新增报告链接（有 run 上下文时显示，新窗打开）。
   活体说明：链接 v-if=run 上下文，当前环境无活跃 run 未渲染，源码
   守门测试锁定入口存在；端点待 8647 重启换装后生效。

## 验证

- vitest custom/client 全量 386 文件 / 2733 测试绿（含 2 条新守门、
  daily-acceptance 语义保持）；simcenter 域测试绿
- 活体实证四项（skillgov 签/三账面板/验收双参照/编排器按钮），
  两项源码+守门锁定（六闸默认展开/报告入口——均受「无活跃 run」
  环境限制，如实在案）

## 决策记录

1. **挂回必接线**：ManagementAccountsPanel 的三个 emits 全部落到宿主既有
   动作，不产生新的死按钮（本轮排查的立批原则延伸）。
2. **并置用懒渲染**：details 收起不挂载——「恢复可见」与「不污染日常
   面板」两个约束同时满足；daily-acceptance 守门（不出现推演空态文案）
   是该设计的验收线。
3. **两处环境受限的验证如实标注**：六闸默认展开与报告入口的活体验证
   需要「有活跃 harness run / run 上下文」的环境，本轮以源码守门测试
   锁定行为，活体留待下一次 run 期间复核——不宣称「活体全验」。
4. **向导 emit 补参向后兼容**：created 原 Zero consumer，补 loopId 参数
   无破坏面。

## 关联

- D25：2026-10-24-func-audit-consolidation.md（裁定项出处与排查全貌）
