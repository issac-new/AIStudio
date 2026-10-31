# 挂账清零批：F4/F5 定谳为采集登录竞态（r18 根治）＋F6 看门狗自动补刀＋UI 真人裁决全链终证

日期：2026-10-31 ｜ 类型：fix（harness 采集配方＋客户端韧性）＋docs（挂账收案）

触发：用户令「完成所有挂账和未做」——上批挂账 F4/F5/F6 与「UI 点击裁决未稳定捕获」四项全清。并行会话三项不修项（任务抽屉偶发/getTask 冷启/侧栏可达性/IDE 深链延迟）属其活跃 worktree（daily-closing/three-zone-r2/ide-selfcheck-fix 在途），不代领、留其会话收口。

## 1. 变更

### 一、F4/F5 定谳＋根治：采集登录竞态（非产品缺陷）

- **五轮复现探针定谳**：凭证注入后**首次导航**间歇整页空壳（第 1 轮 294 字符仅侧栏，2-5 轮全 10545 全渲染；403 与成败无关；F5 stage 页签同现象）——`goto('/login')` 后才注入 localStorage 凭证＝凭证晚于应用引导，首导航命中未认证引导态。真实用户流（登录表单提交/会话恢复）不触发——**产品无缺陷**。
- **根治**（`simharness/mux/r18-frames.mjs`）：凭证注入后 `page.reload()` 一次再导航——应用带凭证重新引导，后续导航必为认证态。**这是采集链「壳页复读」的族源根治**（run19 壳页复读、run23 采集链登录态漂移同族：凡「注入晚于引导」的自动化登录都中招）。
- 活体复验：修正配方后首导航收件箱即全渲染（len 10796，FINAL-PROOF 单可见）。

### 二、F6 根治：deep-link 看门狗超时先自动补一刀（WorkbenchView）

15s 看门狗超时不再直接判「会话不可达」——先自动执行一次手动重试同语义动作（幂等 joinRoom＋refreshRoomList，matrix 在册但首同步慢的房由此自愈），二次超时仍缺才判不可达（手动重试按钮保留）。自愈限一次（防循环），房到位即复位可再用于下一深链。活体实录背景：v4 实拍 matrix 在册房因首同步慢于 15s 被误报不可达、手点重试即好。
配套测试：`workbench-flow.test.ts` 看门狗用例改双段断言（首轮超时自动 join 不误报→二轮超时判不可达+手动重试钮仍补 join），30/30 绿。

### 三、UI 真人裁决全链终证（上批唯一缺口的补锤）

`final-proof2` 实拍链全绿：收件箱呈现 FINAL-PROOF-2 单→点「批准」→**确认对话框**（防误触裁决 C，上批自动化漏点此步致「点击无请求」假象）→点「确定」→`POST /api/approvals/hgate:…/decide` **200**→审批历史含 `t_livefinal2`。截图三帧＋录屏落 `SIM_ROOT/evidence/live-verify-20261031/`（final2-inbox/confirm-dialog/after-decide）。

## 2. 决策记录

- **D1 F4/F5 定性改判**：上批按「产品观察项」挂账，本轮带错误捕获的五轮对照探针把变量剥离（403 恒在/成败仅随首导航变化）——定性从「收件箱面板间歇（产品）」改为「采集登录竞态（harness）」，修在 r18-frames 单点。观察项 F4/F5 撤案。
- **D2 自动补刀只做一次且复用既有函数**：retryDeepLinkRoom 本身就是手动通道的实现（幂等 join+刷新+重挂看门狗）——超时回调调用它而非复制逻辑，单一事实源不破。
- **D3 UI 终证的完成口径**：上批已按「HTTP 级测试+截图双证」收案；本轮补齐浏览器点击一环后，三层证据（单测/HTTP/浏览器全链）齐——不再留「自动化未稳定捕获」边界条目。

## 3. 验证

- `npx vitest run custom/client/ia2/__tests__/workbench-flow.test.ts` → 30/30（含改写看门狗双段断言）。
- `node --check simharness/mux/r18-frames.mjs` 过；run-gates sh 段零 FAIL。
- 活体终证：FINAL2 行 `clicked=true confirmShownAndOk=true decidePOST=200 histHas=true`＋三帧截图＋录屏（final2-results.txt）。
- 客户端已重建部署 SIM（含 F6 修；备份 client.bak-live710 仍在）。
- （合并前回填）

## 4. 设计文档影响

DESIGN_SYNC: none——F4/F5 撤案、F6 为客户端韧性修补、r18 为采集配方修正；无契约/阈值/口径变更。
