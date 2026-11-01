# 2026-11-02 全功能回归轮：两处补丁面缺陷修复

## 变更

本轮为全功能回归测试（四轴：根 vitest 全量 / simharness vitest / 全路由浏览器走查 / 写流＋权限矩阵走查），回归识别出两处补丁面真缺陷，本批修复：

1. **补丁 723 到达即坏（patches/723-agent-dispatcher-refusal-reasons.patch）**
   - 现象：`npm run inject` 全量重放时 723 对 hermes-agent 树应用失败，仅 WARN 跳过（inject.mjs:242-249 对 agent 补丁容错），manifest 却照写全名单——主树实际不含 dispatcher 拒绝原因聚合面，合入时的门禁未拦住。
   - 根因（实验矩阵定谳）：补丁 dispatcher 段唯一的 hunk `@@ -343,3 +343,172 @@` 是**纯插入 hunk 且无尾随上下文**——git apply 将无尾上下文的 hunk 按「改到文件尾（EOF 锚定）」处理，而实树插入点（`return any_spawned`，第 347 行）之后还有 V8.29 派发器健康面约 60 行，锚定失败即 "patch does not apply"。同位置、同上下文、带 3 行尾随上下文的 git 自生成补丁 RC=0（/tmp scratch 复现矩阵：G2 过/G3 悬尾版拒/G5 自生成过/加尾上下文修复版过）。诊断期「上下文多 1 空格」的初判已被字节级比对否定（剥 diff 标记位后逐字符相等），特此更正。
   - 修复：hunk 计数 `-343,3 +343,172` 改 `-343,6 +343,175`，新增行后补 3 行尾随上下文（空/空/`# ── 派发器健康面…` 注释行）；`git apply --check --directory=vendor/hermes-agent` RC=0 验证。
2. **补丁 724 新增：App.vue isFullscreen 定义回补（patches/724-client-app-isfullscreen-define.patch）**
   - 现象：全路由走查 3 页（hermes.settings/desktop.chat/login）console 报 `ReferenceError: isFullscreen is not defined`。
   - 根因：v0.8.0 升级重挂补丁时，070 的使用侧（App.vue:201/213 `!isFullscreen.value`）在位，而 111 侧的定义行 `const isFullscreen = computed(() => route.meta?.fullscreen === true)` 不在 series（111 未登记），定义丢失。ide/matrix-chat/ontology/skillgov/ia2 五域路由均设 `meta.fullscreen: true`，该定义是壳层隐藏侧栏的依赖。
   - 修复：新补丁 724 在 usesCodingAgentConfigSidebar 与 showAppSidebar 之间回补定义行（表达式与 111 原版逐字一致）；series 尾部登记。
3. **走查探针对齐设计语义（scripts/regression/walk-routes.mjs＋route-manifest.ts）**
   - 二轮全量走查（修复后树、fresh 后端）C/D 簇清零，剩余 34 条 DEFECT 全部为设计内状态误报：治理注册表 404×24（注册表 md 未建，daily-setup-signals 成文 fail-soft null）、sim/orgloop 503×8（simcenter 成文 fail-closed 门）、locked-ips 403×2（管理面权限边界）、matrix.client/clientRoom 空白×2（无已连接 Matrix 会话的访客态）。
   - 修复：三类请求状态入探针白名单（WARN 留痕不记缺陷，对齐既有 failSoftReq 模式）；matrix 两页入 allowBlank（合法空态，内容验收须专项轮带真实会话）。产品代码零改动——放宽产品＝削弱 fail-soft/fail-closed/权限边界，不修。

## 决策记录

- **D1（723 修法＝修上下文不重生成）**：只改 3 行损伤上下文，不重生成整个补丁——新增行内容与缩进均正常，重生成有引入新漂移的风险；最小修复面优先。
- **D2（isFullscreen 走新补丁 724 而非改 070）**：App.vue 有 9 个补丁触碰、070 在 v0.8.0 迁移期已粘连 ConnectionsPanel 多补丁内容（另见 .connections-empty CSS 三重复制，本轮记账不顺手扩面），重生成 070 风险大于收益；series 尾追加新补丁为仓内既有模式（722/723 同款）。
- **D3（环境时滞定性）**：走查首轮 A 簇（/api/governance/registry/* 404×24）与 B 簇（/api/hermes/sim/* 503×8）在 8647 后端重启到当前 main 后复测定性——服务端路由在树内存在（governance-controller.ts:580），首查 404 高度疑似陈旧后端（起服于 10-31 23:27，落后 9+ 提交）；不据首轮记录下产品缺陷结论。
- **D4（注册纪律）**：spec 同批登记附录 A.1；决策 D1-D3 落 decisions.jsonl。

## 验证

- 补丁修复后：`git apply --check` 两补丁对净注入态 RC=0、反向 `-R` check RC=0（精确应用）；`npm run clean && npm run inject` 全量重放 RC=0 且日志无 "hermes-agent patch 失败" WARN；dispatcher 文件 refusal 内容 7 处；App.vue:197 含 isFullscreen 定义。
- 走查复验（156 访问态×轮）：二轮（修复树＋fresh 后端）C 簇 ReferenceError 与 D 簇 __vnode 错误**双双清零**（全 run 零 console 错误），423 pass/36 defect 全为设计内状态；三轮中途出现导航超时群——同代码二轮干净、fresh vite 四轮 455 pass/1 defect 复越故障带，定性＝vite 长会话劣化（环境非代码），三轮中止不作数；残余 1 条=ide.shell files/list 403（F 簇设计态）入白名单后 ide 域定向复验 11/0 全绿。
- 全量对账：`npm test`（根 vitest 全量）终跑 **7207 passed / 0 failed**（首轮 7207/0；修复树首跑 7205/2，其中 1 红=本 spec A.1 登记初版漏改标题计数 459→460 已修、1 红=raci-visibility 组件挂载 15s 超时为全量高负载抖动单独复跑 7/7 绿非缺陷；三跑 7206/1 红=并行批 2026-11-02-agent-patch-injection-list 未登记 A.1，本批代登记后 ssot 6/6 绿）；simharness vitest 14 文件 233 例全绿；写流＋权限矩阵 16/16。

## 设计文档影响

DESIGN_SYNC: none——两处均为补丁载体修复（723 修上下文、724 回补既有设计意图的定义行），不改变任何设计文档记载的行为面；fullscreen 壳层语义与 dispatcher 拒绝原因聚合的产品行为与整合正本记载一致，无数字总账触及。
