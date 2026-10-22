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

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | D1 只补文案映射不改判定 | 判定正身（dailyStageState）行为正确，回归仅在呈现层缺态 | 回滚 blocked 态（否决：交通灯语义已上线且有价值） | 是 |
| 2 | D2 采用无前缀子路由+路径挂载 | koa-router 嵌套下唯一实证可用形态（sim-launch 生产同款）；测试改生产拓扑根治盲区 | 绝对前缀+直接 use（实测仍 404）；app 根挂载（绕开 governance 前缀语义，改动面大） | 是 |
| 3 | 测试面统一生产嵌套拓扑 | 直挂测试是本次上线即死逃过测试的根因；拓扑即契约 | 保留直挂另加嵌套用例（否决：主路径必须是被测生产形态） | 是 |
