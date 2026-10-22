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
