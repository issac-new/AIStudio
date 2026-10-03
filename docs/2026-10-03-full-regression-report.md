# SwarmStudio 全功能回归测试报告（2026-10-03）

**结论**：驾驶舱（/app/* 全家）、沟通协作三栏工作台、IDE 工作台（/ide）已完成全量回归（42 路由 + 顶栏/注意力条/左栏/右栏/会话窗格全部按钮与弹层逐一点到），发现 8 项缺陷并修复 7 项（含 1 项 P0 整页崩溃+全应用冻结级联），复验 7/7 全绿、全量 vitest 3717 绿（8 个既有 qgate 红已stash 基线实证与本轮无关）。

## 一、测试范围与方法

- **环境**：隔离链实测（独立 worktree + `OVERLAY_UPSTREAM_ROOT` 私有上游副本 + 后端 8687 / 前端 8689），与共享 8647/8649 链互不干扰；关键缺陷均在共享产品链 8649 复核确认。
- **覆盖**：`custom/client/ia2/routes.ts` 路由树全量 42 路由（/app 根/dash/s/chat/board/inbox/gov/accounts/cases/runs/history/agent + 28 个收编页 + 4 条旧深链重定向 + /ide）；驾驶舱壳层（主题/语言/视图切换/搜索/任务 chip/日程/在线/通知/更新日志/用户/注意力条 29 chip/图标栏 8 入口/栏控）；沟通协作（左栏四入口+筛选排序 6 键+新聊天菜单 3 项+管理台 7 分区+会话画布+右栏任务面板全动作）；IDE（侧栏三段视图+会话窗格 10 动作键+输入区/模型切换+文件面板双页签）；工作页（看板 8 页签逐开、收件箱动作、概览三卡）。
- **方法**：Playwright 自动化（scripts/regression/ 系列脚本，DOM 断言 + 截图 + pageerror/失败请求捕获）+ 像素差分（弹层开合）+ 双链对照复核。截图证据在 headless Chrome 下采集（headed 窗口被遮挡时 Chrome 返回陈旧帧，已实证并规避）。

## 二、缺陷清单与处置

| # | 级别 | 缺陷 | 根因（锚点） | 处置 |
|---|---|---|---|---|
| F1 | P0 | `/hermes/connections`（设备互联）整页空白，随后应用内导航全面冻结（每页 `vnode`/`parentNode` 崩溃） | 补丁 524 给 ConnectionsPanel.vue 模板加 `v-if="features.connectionsExtras"` 但从未导入 `features`（原文件 script 无此导入）→ 渲染即抛 undefined | 524 补 `import { features } from '@/custom/features'`；s3 守门测试补「导入必须在场」断言 |
| F2 | P1 | 任何新检出/worktree 的 `npm run inject` 在末步失败（deploy 源缺失 → exit 1） | `runtime-manifest.json` 引用的 `runtime/gateway/platforms/base.py`、`runtime/tests/gateway/test_max_concurrent_sessions.py` 被 `.gitignore:15 runtime/` 挡在库外 | 两文件 `git add -f` 入库（与既有 95 个 runtime 文件同例） |
| F3 | P2 | 日程弹层不响应 Esc（✕ 可关） | 弹层根 `@keydown` 处理器存在但根元素从不获得焦点，按键永不达 | 挂载即 `focus()` 弹层根（方向键/Enter 导航一并生效）；像素差分复验 Esc 生效 |
| F4 | P2 | 更新日志弹层 v0.7.27 条目裸键上屏（`changelog.new_0_7_27_1/2`…） | 473 locale rebaseline 锚 0.7.26 ISO 基线，把 0.7.27 上游词条当旧键删除（含 `usage.costStates/pricing` 两块共 16 键/语） | 新增 patch 550 按纯净上游原文原位回填；新增 `i18n-upstream-keys-gate.test.ts` 守门（系列补丁不得永久丢弃上游词条） |
| F5 | P2 | `/app/history` 页触发 `No match for hermes.historySession`，点历史会话打不开 | 补丁 297 摘除该路由名后，HistoryView 尚存 3 处按名导航（539 修过 4 处但漏此 3 处） | 539 补 openHistorySession 处；新增 patch 551 修 openDefaultHistorySession/buildHistorySessionUrl 两处（改路径式）；测试签名同步并加 551 守门 |
| F6 | P2 | 在线面板「暂无内容」与顶栏「在线 3」自相矛盾 | 计数走 presence/网关兜底而面板树只绑账号花名册（空时即空） | useSitCounts.online 增 identities 同源清单，SitDetailPanel 树在花名册空时按 identities 建行（计数与列表同源同口径） |
| F7 | P3 | 新树/私有树启动时 event-log SQLite 创建失败降级 InMemory | `.loop/` 父目录缺失时 node:sqlite 报 unable to open database file，未 mkdir | 建库前 `mkdirSync(recursive)`；补守门测试 |
| F8 | P2(观察) | /ide 冷加载对陈旧持久化会话 id 打 `workspace-run-changes` 404 | localStorage 会话 id 陈旧（该会话已不存在）；代码已有优雅降级（`!res.ok` 即返回），仅控制台噪声 | 不改代码（改动收益低于风险）；记档观察 |

## 三、判为非缺陷（含误报澄清）

1. **通知铃铛/管理台/新任务按钮等「点不开」类疑点**：逐一 DOM 实证为误报（自定义面板类名未被探针选择器覆盖、`＋新任务` 本就设计为跳看板建卡——见 `WorkbenchView.vue onNewTask`）。
2. **右栏改派/去处理按钮消失**：按钮属「挂接任务」区（`LinkedTaskList.vue`），当前会话无挂接任务即不渲染，数据一致非缺陷。
3. **「管理台自动弹出」截图**：headed Chrome 窗口被遮挡时截图返回陈旧帧所致的测量污染（像素级绿色实验实证截图管线在 headless 下实时）；DOM 连续观测 15s 从未复现自动弹出。
4. **模型切换器禁用**：`IdeChatPane` 模型不可用时的诚实态（黄条+去设置重选），设计内。
5. **看板「全链路追踪/台账与规则/审计与变更/文档评审」页签内容薄**：实测为异步加载中/真实内容页（台账/审计/文档评审内容完整），非空白缺陷。

## 四、验证证据

- 修复复验 `scripts/regression/verify-fixes.mjs`：**7 pass / 0 defect**（connections 渲染+零崩溃+级联消失、Esc 像素差分、changelog 零裸键、history 零 No-match、在线面板非空）。
- 全量 vitest：**3717 passed / 8 failed / 1 skipped**；8 个失败全部位于 `custom/qgate/__tests__/`（stash 至无改动基线同样 8 红，实证为既有失败，与本轮无关）。
- 补丁链全量正反放回归：inject → clean → 树状态零残留（524/539/550/551 全部 round-trip 干净）。
- deploy-agent-runtime 清单 21 件：源缺失 0（F2 修复生效）。

## 五、遗留与建议

1. qgate 族 8 个既有失败（CLI intent/生命周期断言不符）建议另立任务处置。
2. `.cockpit-top__sitpanel { left: 12px }` 硬编码使在线/态势面板恒锚左上（从右上按钮弹出时错位感明显），建议按触发按钮锚定（P3 体验项，未改）。
3. `＋新任务` 仅跳看板不带建卡动作，可考虑带 `?new=1` 直开建卡表单（P3 体验项，未改）。
