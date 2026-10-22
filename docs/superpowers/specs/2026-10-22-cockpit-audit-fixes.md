# 驾驶舱全量走查修复批（Playwright 实测驱动）

> 2026-10-22 用户指令：Playwright 全面逐一走查驾驶舱所有功能，落实虚假功能、
> 修复 bug、识别操作动线与功能不合理并优化。本 spec 收走查实证发现的缺陷修复，
> 后续批次滚动追加。

## 批 1（本提交）

- **D1｜④开发阶段五页签同内容假死**：根因=交通灯轮（30aa4577 前身 6bec237b）
  给 `StageState` 增 `'blocked'` 态时，`StageShell.vue` 的 `STATE_LABEL` 映射未
  跟进（StageShell.vue:50-54），④是唯一可取 blocked 的阶段 →
  `STATE_LABEL[stageState].zh` 抛 `reading 'zh' of undefined`，渲染崩。
  修复=补 `blocked: { zh: '有阻塞', en: 'Blocked' }`；守门=
  stage-shell-state-label.test.ts（四态全覆盖源码锚定）。
- **D2｜安全审计整族 API 上线即死（404）**：`secaudit/controller.ts` 子路由带
  绝对前缀 `/api/governance/secaudit`，被 `governance-controller` 以
  `router.use('/secaudit', ...)` 嵌套挂载——@koa/router 嵌套组合前缀，绝对前缀
  子路由无论 use 带不带路径均拼错（最小复现实证：双前缀 404 / 相对子路由 200），
  该域 2026-10-21 上线起整族 404，前端「安全审计」页签数据面死。
  修复=子路由去前缀＋按 '/secaudit' 路径挂载（sim-launch 同款实证可用形态）。
  守门=secaudit-http.test.ts 改生产同款嵌套拓扑（杀直挂盲区）＋
  secaudit-nested-mount.test.ts（嵌套运行时探活＋双前缀回归源码锚定）。
- 实证：secaudit 全套＋shell 守门 44/44 绿。

## 批 2（本提交）：假按钮接线＋静默失败呈现＋确认缺失＋两簇死路由

- **D3｜审批收件箱介入卡假按钮**：`GatekeeperSection.vue` 批准/打回原绑 `() => {}`
  （用户可点、零效果零提示）。修复=按 sourceKey 派发到 14 个介入点的真实裁决面
  （G1/G2/G5/UAT/清算/编制/看板/审计/监督…）；裁决真相留在源系统，驾驶舱只导流不复制。
  守门=gatekeeper-intervene-wiring.test.ts（空函数回归＋派发表 14 键全覆盖）。
- **D4｜pipeline / human-gate 两簇嵌套死路由**（端点对账审计发现，与 D2 同根因）：
  `pipeline-controller` 绝对前缀＋巡检官父路由无路径挂载=4 端点 404；`human-gate`
  绝对前缀＋approvals 父路由无路径挂载=3 端点 404（HumanGate 前置批准服务端上线即死）。
  修复=子路由去前缀＋父路由按路径挂载（'/pipeline'、'/human-gate'）。
  守门=nested-mount-guard.test.ts（生产形态运行时探活＋源码锚定）。
- **D5｜三处静默失败呈现**：团队注册建房失败（TeamsManagePanel lastError 无渲染）、
  工作台建房失败×2（onCreateRoom/onCreateGroupSubmit catch 静默）——全部就地报错。
- **D6｜群聊删除无确认**：行 hover ✕ 一步不可逆删房——补 confirm＋失败报错。
- **D7｜P2 打磨件**（并行子代理落地，36 测绿）：本体页 7 处异步无 catch→补齐＋
  opError 呈现；评测集导出成功零反馈→「已复制」；离职向导 homeserverUrl 未就绪
  可提交→前置禁用＋原因；向导失败态标题「③ 执行结果」。
- 附带发现挂账（未修，见重构设计文档）：kanban nudge 路由从未挂载（催办 owner
  路由带病上线）；human-gate 服务端修活后前端仍零调用（UI 未接线）。

## 批 3（本提交）：P0 接线落地（用户三项裁定）

- **D8｜HumanGate 前置批准接入审批收件箱**：GatekeeperSection 新增「前置批准」
  队列（pending 批准单＋批准/驳回直调 POST /api/approvals/human-gate/:id/decide，
  裁决落库留痕）；api 层 fetchHumanGateRequests/decideHumanGate。run22 复盘②自此
  端到端通。
- **D9｜催办 owner 动态路由挂载＋接消费方**：patch 676（bootstrap 根挂载
  registerKanbanRoutes ＋卡源=command-post 看板聚合异步 provider，未就绪显式
  503 不猜）；owner-routed-nudge 卡源签名放宽支持 Promise；看板批量条新增「催办」
  按钮（选中卡逐张解析 assignee→板 team→无人态，结果 toast 呈现）。run21/22
  复盘①产品化收尾。series 登记 676 号。
- **D10｜信息降噪先行件**：GatekeeperSection 清算目标 PR-N→人话（主文案人话、
  代号进 title）；其余降噪件（ClearancePanel/DirectorPanel/SearchView）并行批
  另册提交。
- 守门=humangate-nudge-wiring.test.ts（双功能全链源码锚定）。

## 决策记录（批 3 追加）

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 8 | HumanGate 裁决直调服务端（区别于介入卡导流） | HumanGate 的裁决真身本就在 approvals 域（服务端 store+persist），收件箱是它的属地面——不是复制真相而是消费正身 | 仿介入卡导流到别处（否决：该域无独立裁决面） | 是 |
| 9 | nudge 卡源=command-post 看板聚合异步 provider | 单一事实源复用既有聚合（sqlite 快道+缓存）；未就绪 503 显式不猜（原设计语义保留） | 直读 sqlite/CLI 新开第二读路径（否决：双源漂移） | 是 |
| 10 | 催办按钮放批量操作条 | 选中即催、逐卡路由结果 toast——动线最短且不触碰 511 行拖拽敏感的任务卡组件 | 任务卡右键/悬浮菜单（否决：改动面大风险高） | 是 |

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | D1 只补文案映射不改判定 | 判定正身（dailyStageState）行为正确，回归仅在呈现层缺态 | 回滚 blocked 态（否决：交通灯语义已上线且有价值） | 是 |
| 2 | D2 采用无前缀子路由+路径挂载 | koa-router 嵌套下唯一实证可用形态（sim-launch 生产同款）；测试改生产拓扑根治盲区 | 绝对前缀+直接 use（实测仍 404）；app 根挂载（绕开 governance 前缀语义，改动面大） | 是 |
| 3 | 测试面统一生产嵌套拓扑 | 直挂测试是本次上线即死逃过测试的根因；拓扑即契约 | 保留直挂另加嵌套用例（否决：主路径必须是被测生产形态） | 是 |
| 4 | 介入卡按钮=派发导流，不在驾驶舱落决策 | 单一事实源：裁决真身在各源系统；本地落账=第二真相库 | 新建 decide 端点落本地台账（否决：复制真相） | 是 |
| 5 | D4 沿用批 1 的相对挂载形态 | 与 secaudit 修复同款实证可用形态；守门同构 | 绝对前缀直挂（实测仍 404） | 是 |
| 6 | 删房确认用原生 confirm | 一次性修复交互等价；引入 UI 库 dialog 成本不成比例 | 引 dialog 组件（否决：本批最小化） | 是 |
| 7 | nudge 未挂载与 human-gate UI 未接线挂账不修 | 挂载/接线属产品决策（消费方与交互未定），盲接=再造死端点风险；重构设计文档列专节 | 顺手挂载（否决：无消费方验证） | 是 |

## 批 3B（本提交）：信息降噪并行件（子代理落地）

- ClearancePanel：PR-N/类型码→人话映射（TARGET_LABEL/KIND_LABEL 导出，未知码如实原样）；
- DirectorPanel：场景列表不可用→「内置默认场景」显式标注（fail-soft 不冒充真列表）；
- SearchView→AccountAdminView：人员结果点击带 ?user= 预选定位（高亮+滚动，找不到静默忽略）。
- 实证：定向 48/48 绿；workbench-flow 预存失败与本批无关（主工作区同样红）。

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 11 | 未知 PR-N 显示「补偿记录 PR-N」而非隐藏 | 如实呈现不猜（D2 纪律），代号可反查 | 未知码隐藏（否决：丢可排查性） | 是 |
| 12 | 人员预选找不到静默忽略 | 检索结果与台账可能滞后，弹错反而打断动线 | 报错提示（否决：噪声） | 是 |


## 批 3C（本提交）：workbench-flow 断言校准

- D6 确认弹窗上线后旧断言未跟进（预存红）：校准为「确认取消→零调用；确认放行→deleteRoom('gr-1')」双路径，顺带补齐取消路径覆盖（原先只有放行路径）。ia2 全目录 716/716 绿——走查轮至此零遗留失败。

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 13 | 校准断言而非回退确认弹窗 | D6 不可逆删房确认是走查批已 spec 行为；测试应跟行为 | 回退 confirm（否决：重开 D6 缺陷） | 是 |
