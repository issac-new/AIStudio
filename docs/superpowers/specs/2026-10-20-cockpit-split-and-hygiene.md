# 驾驶舱全面整治：matrix 链接修复 + 推演/日常拆分 + 噪声清理 + 布局修复

> 状态：实施完成并通过收口验证（2026-10-20；全量测试仅余 10 个环境性失败）。实施分支 `fix/cockpit-information-architecture`；本文是本轮变更正本，第二节仍是原始走查发现，第八节记录最终落地口径。

## 一、用户诉求（2026-10-20 原文要点）

1. 全面走查驾驶舱各层级模块与链接功能：导航不连贯、历史冗余（过期推演信息）、内容不准确不完善、机读噪声与假功能，不具备给人类员工使用的前提。
2. matrix 报错链接不对。
3. 拆分全流程推演与日常功能：可共享技术组件，不得彼此侵入。推演=典型场景串联全部功能（从接收需求起，导演模拟全体人类员工协作走完全流程）；日常=会话串起的 kanban 任务、工作区、IDE 工作台，按阶段分类管理；两者互相检验工作是否有效。
4. 解决页面布局与按钮的遮罩、溢出。

## 二、走查发现摘要

**导航与冗余**：阶段页签实为 33 个（①6/②4/③4/④5/⑤6/⑥8），文档仍写 29；teams/agents/accounts/cases 存在独立整页与阶段页签双入口双 URL；约 3000 行零引用死视图（旧 OrchestrateView/SpecList/SpecDetail、RunCenterView+RunDetailView 全家、RunCanvas、GovCluster/GovSessionHealth 等）；sim-tabs 残留已不渲染的死词条；「运行中心」「旅程首页」等过时称呼仍在按钮文案。

**机读噪声与假功能**：SimAnchorDrawer 把原始 JSON 直接倾倒给用户；strict/pass/important/P1-P6 等英文枚举与原始时间戳/键名直出；建号表单默认值写死 `127.0.0.1:8008`；监督签提示手打过期 run 号示例；语音/视频按钮点击仅弹「即将推出」；看板「？」按钮空对象；IDE 任务简报「看板卡↗」的 `boardHref` 未定义（死链）；收件箱 GatekeeperSection 批准/打回绑空函数；②启动准备「文档已入库」检查实为假检查（只判 state 可读）。

**matrix 链接 bug**：分享弹窗生成 `matrix.to` 外链——私有 homeserver 上无法解析；二维码把房间 ID 发给第三方 qrserver.com；房间摘要卡把 `matrix://` URI 裸挂 `<a target=_blank>`。产品内链规范=`#/app/s/room/<roomId>[?event=]`（useEventTileData.ts 已立法）。

**推演/日常互相侵入**：日常六阶段进度完全由推演 run-state 派生（无运行=全部未开始）；②⑤⑥阶段页头挂 RunSelector；⑤验收 trace/delivery/uat 三签整嵌推演面板且 uat/g5 可直接写推演台账；推演「运行编排」签读全部日常看板；工作台左栏常驻已退役的「循环」分组；收件箱渲染推演干预卡；useRunContext 全局记忆两侧互串。

**布局遮罩/溢出**：全产品无 z-index 分层账本（四个互斥全屏层同挤 z60、页头面板 999 反超弹窗 1000）；注意力条抽屉定位依赖已删的全局类且硬编码 left；看板抽屉评论输入条 fixed 定位随抽屉宽度错位；推演总览/工作台两旗舰页零响应式断点；TracePanel/DeliveryPanel 表格无横向滚动兜底；清算灯/Cockpit 徽标整句 nowrap 必溢出。

## 三、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | ⑤验收 trace/delivery/uat/g5 重做成日常数据源（用户裁定） | 看板任务/审批/registry 文档为源；旧推演面板撤回推演区 evidence 签；日常面板顶部留「推演参照」链接行=互验通道 |
| D2 | 假功能保留占位但统一真实反馈（用户裁定） | 不留无反应控件；语音/视频/看板「？」点击有统一轻提示；死链错链必修 |
| D3 | 死代码直接删（用户裁定） | git 历史即存档；孤儿路由留 redirect 兜底旧深链；teams/agents/accounts/cases 独立页 redirect 至阶段签 |
| D4 | matrix 链接一律产品内链；QR 本地生成无依赖则移除 | matrix.to 在私有 homeserver 不可解析；房间 ID 禁外发第三方 |
| D5 | `/app/sim*` 导航域独立（整轮域），不挂任何阶段归属 | stage-attribution/nav-centers/areaForPath 三表同步；进推演区不高亮阶段 |
| D6 | 日常进度源=看板任务按阶段聚合（useDailyStageProgress） | 左栏阶段点与旅程五步卡不再依赖推演 run-state；无 run 时日常功能完整可用 |
| D7 | 阶段页去 RunSelector；运行上下文 chip 仅推演区显示；useRunContext 分区 | 日常页不再要求先选推演运行 |
| D8 | 写推演台账（uat-verdict/release-gate）的动作收口回推演区 | 日常判定写看板卡/审批系统；跨区只读+链接 |
| D9 | 推演「运行编排」签改只读 graph specs+run steps | 看板链交互视图只留 /app/board |
| D10 | domain-split 结构测试守门 import 方向 | 禁 views/stage→views/sim 与 api/sim-*、禁 views/sim→workspace store，白名单仅 crossref 链接模块 |
| D11 | 新 z-layers.ts 分层账本（drawer/modal/header-panel/toast） | 替换冲突字面量，弹层叠序可预期 |
| D12 | 并行会话在途改动不主动收编提交 | 重叠文件随批提交时在 commit message 如实记录归属（2026-10-20 10:34-10:36 主树在途 UX 修改） |

## 四、批次

- **B1 matrix 链接修复**：ShareDialog 内链+别名解析+QR 处置；SummaryCard matrix:// 处理；历史加载错误条改「人话+可展开原始」。
- **B2 假功能统一占位与死链**：占位提示统一；boardHref 修复；假检查诚实化；黑话出 UI 清理；术语过期修复；data-testid 反引号修复。
- **B3 机读噪声人话化**：新 `ia2/format.ts`（枚举中文映射+时间戳格式化）；SimAnchorDrawer 结构化+折叠原始 JSON；按清单逐处应用；删 8 个死 TAB_INTROS 词条。
- **B4 推演/日常拆分**：D5-D10 全量落地；⑤验收新四面板（DailyTrace/DailyDelivery/DailyUat/DailyG5Panel）。
- **B5 死代码删除**：D3 清单全量；旅程五步卡目标改阶段签。
- **B6 布局修复**：z-layers 账本；AttentionStrip 定位；看板抽屉输入条 sticky；旗舰页断点；表格滚动兜底；nowrap 策略；ide-taskbar archived 上限；页签条溢出提示。
- **B7 验证收口**：定向+全量 client 测试；浏览器 8649 走查关键页；验证账回填；合 main；serve-main 同步热更。

## 五、明确不做（挂账）

- ⑥治理八签全面双语化（本轮只删死词条+修混排）。
- GovOverlay 管理台与治理签的信息聚合重复（登记，重构另立轮）。
- QR 本地生成不新增依赖：无现成依赖则移除 QR 功能。

## 六、分工与交接（2026-10-20 11:00 用户裁定）

本任务发现两个会话并行实施同一方案（主树文件级冲突实锤）。用户裁定：**拆分实施（B4）由另一会话在主树继续**，本会话停手退场。本 spec 与下列已提交件留在分支 `feat/cockpit-split-hygiene`（即当前主树检出分支）上，供继续方直接消费：

- `f0db3ac` spec 本体（决策记录 D1-D12）
- `5d815c0` B1 matrix 链接修复（ShareDialog 内链+QR 本地生成+SummaryCard+错误折叠+守门测试）
- `e02c03a` B2 部分术语清理（DeliveryPanel/StageG5Panel/SpotlightPanel；IaShellHeader 的同类一行因与在途改动混布由继续方携带）

继续方可直接按附录 A-D 的 file:line 清单施工，不必重做走查。已提交的收编件：`chore(ux)` 提交未产生（首次尝试被 spec-first 拦截，在途改动仍留在工作树由继续方处置）。

## 七、最终落地对账（2026-10-20 实施轮）

1. **Matrix 链接**：分享弹窗/永久链接均产出 `#/app/s/room/:roomId` 产品内链；二维码本地生成，不再把房间 ID 发 qrserver；房间摘要卡不再把 `matrix://` 伪装成外链。登录/完整客户端入口走本部署 server-info（补丁 672 让服务端单源优先于 localStorage 旧地址）；存量凭据启动前与 server-info 对账，homeserver 真迁移时给「重新登录」横幅，不再继续打旧地址刷连接错误。
2. **假功能与死链**：看板「？」改为可打开的帮助说明；IDE 简报「看板卡」落到 `#/app/board?task=<id>`；语音/视频占位改为轻 toast；内部调研署名、密钥台账黑话、模型路由“兜底/回落链”均改人话；`hi-actions-*` 绑定修正。
3. **机读噪声**：新增 `custom/client/ia2/format.ts` 统一枚举/时间/路径/字段格式化；锚点抽屉首屏给字段表，原文与复制动作折叠；监督面板删除手打 run 输入与过期示例；推演/治理/交付面的枚举、时间戳和路径按同一规则降噪。
4. **日常/推演拆分**：`useDailyStageProgress` 只读跨板任务；`useRunContext` 拆 sim/daily 记忆，`query.run` 只作为显式跨域链接；`/app/sim*` 不再高亮日常阶段；⑤验收四个页签改为 DailyTrace/DailyDelivery/DailyUat/DailyG5，判定写回任务卡或审批，不写推演台账；推演运行编排只读 graph specs/runs，不再读取日常 workspace store。
5. **互验通道**：日常验收四签底部保留「推演参照」只读链接；推演证据签折叠展示交付健康/需求追溯两张旧证据表。两侧共享格式化、看板 API、审批组件等技术件，但导航与写入口不互串。
6. **冗余清理**：旧 Orchestrate/Spec/EngScene/RunCenter/RunDetail/RunCanvas/GovCluster/GovSessionHealth 等死件删除；teams/agents/accounts/cases/hermes journey 独立入口保留名称并 redirect 到阶段签；sim/gov 死词条删除。
7. **布局遮罩与溢出**：新增 `z-layers.ts` + CSS 变量账本；注意力条抽屉自持右对齐；看板评论输入 sticky；推演总览与工作台补 1100px 断点；追溯/交付表格横向滚动；阶段页签渐隐提示；归档任务列表内滚；GovOverlay 900px 单列；长链接/长路径增加断行与省略。

## 八、验证账（收口）

- 机械守门：新增 `domain-split.test.ts`、`cockpit-hygiene.test.ts`、`daily-acceptance.test.ts`、`cockpit-layout-guards.test.ts`、`z-layers.test.ts`。
- 构建：`npm run build` 最终复跑 rc=0；8791 modules transformed，`verify-dist` 通过（出厂默认口令扫描零命中）。
- 浏览器：8649 热更新走查 `/app`、`/app/sim`、`/app/stage/accept?tab=trace|delivery|g5`、`/app/teams`；`/app/teams` 实际落到 `/app/stage/setup?tab=teams`，无重复面包屑；新开干净 tab 控制台 error=0。
- 设计机械检查：Impeccable detector 对本轮新增/重写核心目标（StagePreflight、Daily 四面板、DailySimReference、SimOrchestrationView、format/useDaily/useRunContext）返回 `[]`。
- 全量测试：`npm test` 最终复跑 **5502 通过 / 10 失败 / 8 跳过（776 文件）**。10 个失败均为本轮改动外环境项：
  `diagram-export`×3（系统 Chrome 启动 TargetClosed，下载 Playwright Chromium 超时）；`specialist-presets`×1（`upstream/routa/.../backlog-refiner.yaml` 缺席）；`tool-waterfall-gate`×1（注入态 patch 顺序基线）；`cua-node-backend-platforms`×5（`upstream/zcode` 未构建 node-backend.js）。
- 矩阵定向：`share-link` 5 例、permalink 6 例、`server-url` 4 例、`server-moved-banner` 2 例全部通过；补丁 672 在当前注入树上 `git apply --reverse --check` 通过（正向 apply 因已注入而拒绝，属预期）。
- 未验证：有真实 Matrix 凭据的房间分享活体点击（本环境不可登录外部 Matrix 账号）。

## 九、接管验收轮（2026-10-20 22:30，独立会话）

实施会话收口后（fdca2a24+e8f9ed17+3b0fa5da 合 main 并推 origin），独立会话对四点任务做验收走查与残留收尾。

**独立验证结果**（证据 `.claude/walkthrough-takeover/report.json`+shots/，采集器 crawl.mjs 62 页 + 内链回访 24 + 1024 窄屏 5 页）：

1. matrix 外链清零：全站 0 个 `matrix.to`/`qrserver`/裸 `matrix://` 链接（P2 PASS）。
2. 域拆分：`/app/sim*` 六页全部呈现推演侧栏（back-daily 钩子），全部日常阶段页无推演侧栏（P3 PASS）；W3 修复生效——本轮 sim run-state/journal 404 归零（M3 基线各 4 页）。
3. 旧独立页 redirect 四条全中：teams/agents/accounts → setup 签、cases → accept 签；/app/eng→sim/orchestration、/app/runs→/app/sim 兜底正常。
4. 布局：1024 窄屏五旗舰页零横向溢出；`pageerror` 全站 0。裁切启发式命中的 `.ia-attn__text`/名称类单元格经截图复核均为设计内省略号（M3 同判）。
5. 全量测试独立复跑：5511 通过/1 失败/8 跳过——唯一失败 `tool-waterfall-gate`（注入态 patch 顺序基线，与第八节记名一致），其余 9 个环境性失败本轮转绿。零新增失败。
6. 三条「内链可疑」为采集器时序误报（hash 导航 1.8s 等待过短）：`/studio/agents`、`/hermes/usage`、`/hermes/api-relay` 直访均完整渲染（Agent 管理/用量统计/API 中转页）；其链接源是不可见的上游 studio-navigation-rail DOM 残留，非用户可见导航。

**发现并修复的残留**（分支 fix/daily-assignee-display）：

- 四个⑤验收日常面板「负责人/参与人」直出看板账号 localpart（如 `sim_pm_product_manager_a_aipay`）——用户第 1 点「机读信息」残留。修：新增 `views/stage/assignee-display.ts`（team registry 称谓映射+localpart 归一+无映射诚实回落），四面板接线；守门测试 2 例入 daily-acceptance.test.ts（映射/回落/空称谓不误称/localpart 归一）。
- `utils/director-run.ts` 改道文案「导演运行——26 步视图不适用」→「这是导演台发起的运行，不适用按 26 步流程组织的视图；运行详情请到「导演台」查看」（guard 测试断言关键词「导演台」不受影响）。

**挂账（如实登记，不阻塞收口）**：

- /app/ide 对 `~/.hermes-web-ui/coding-agent/workspace/default/global` 的 files/list 400：活跃会话工作区指向的历史 home 与当前 dev 服务 hermes 基目录不同源，UI 诚实红字+重试（files.ts 沙箱拒绝），环境态非代码缺陷；生产部署两侧同源不触发。
- orgloop/ledger 503：本环境未配置台账端点，W4 闩已把轮询降为每会话一次，UI 如实空态。

## 附录 A：B2 假功能/死链/黑话待修清单（file:line 为 2026-10-20 走查时点）

1. `kanban/components/KanbanToolbar.vue:250`「？」按钮 `@click="() => {}"` 空对象 → 统一占位提示（D2）。
2. `ide/components/TaskBriefingPanel.vue:104` `boardHref` 未定义（死链）→ `#/app/board?task=<id>`。
3. `ia2/views/gov/HarnessImprovePanel.vue:590` `data-testid="`hi-actions-…`"` 字面反引号 → `:data-testid` 绑定。
4. `ia2/views/gov/KeyLedgerSection.vue:58` `**不含密钥本体**` 星号直出 +「服务端字段守卫禁入」「Q3 裁定」黑话 → 人话。
5. `ide/components/IdeEngineModelsDialog.vue:157-169`「自动兜底」「回落链」→ 人话（如「未指定时自动选择」）。
6. `ia2/views/gov/ReviewGovPanel.vue:292`「口径见 Anthropic 工程博客（2026-10-15）」内部调研署名出员工界面 → 移入 title 或删除。
7. `ia2/views/stage/StagePreflight.vue:53-55,71` 副题/注脚「自动检查尚未接入…harness 侧确认」与同页三条已渲染 ✓/○ 并存 → 口径对齐（docs 检查已在 e02c03a 前序提交诚实化，按钮文案已改「打开全流程推演」）。
8. `ia2/api/ops.ts:31-32`「请联系管理员」指引悬空 → 给出设置页路径或删除后半句。
9. matrix 语音/视频「即将推出」按钮（MatrixRoomHeader）保留（D2 用户裁定），现有 alert 反馈已达标，可升级为轻 toast。

## 附录 B：B3 机读噪声人话化清单

统一映射表（建议落 `ia2/format.ts`）：POSTURE strict/standard/demo→严格/标准/演示；VERDICT pass/conditional/reject→通过/有条件通过/不通过；SEVERITY important/nit/preexisting→重要/建议/历史存量；TIER lite/standard/compliance；锚类型 event/commit→事件/提交；P1-P6→阶段名；时间戳→YYYY-MM-DD HH:mm。

- `ia2/components/sim/SimAnchorDrawer.vue:46` 原始 JSON `<pre>` → 结构化字段表+折叠「复制原始 JSON」；喂入方 `SupervisionPanel.vue:28`、`OverviewPanel.vue:124-131`、`EvidencePanel.vue:125`。
- `SupervisionPanel.vue:59,84` 手打 run 目录名输入+过期示例「20261015-v8-run20」→ 删输入（页头已有选择器）；`:118-119,131` 窗 ID/原始时间戳/机器字段。
- `api/ops.ts:83` 兜底行 `{ 输出: JSON.stringify }`；`:64-70` 原始键值平铺。
- `CockpitPanel.vue:24,33,67`、`SimSettingsView.vue:93,101`、`OverviewPanel.vue:190,289` 枚举与原始时间戳。
- ⑥治理：`ClearancePanel.vue:114,116`、`GateRepairsPanel.vue:108,110`、`GovIssuesPanel.vue:55`、`ReviewGovPanel.vue:500,525,540-543`、`HarnessImprovePanel.vue:583,586,628,642`、`governance/components/{KnowledgeGraphSection:216,MaturitySection:108,CapabilityCatalogSection:118,AgentIdentitySection:174,IncidentReportSection:93,105}`。
- ①搭建：`AccountAdminView.vue:14,16` 与 `components/gov/OrgEditor.vue:47` 默认 `http://127.0.0.1:8008` → 留空+placeholder。
- ⑤验收：`matrix-teams/views/DeliveryCasesView.vue:115,124-128,157-158,195,198-199` 枚举/原始 ID/原始证据串。
- `sim/TracePanel.vue:41,110,129` 原始 API 路径/内部文件路径/字面 null。
- `views/stage/StageG5Panel.vue:81-82` 内部文件与闸键名暴露。
- `ia2/i18n-tab-intros.ts:52,57,62,67,72,77,87,92` 8 个永不显示的 gov 死词条 → 挂载或删除；`HarnessImprovePanel.vue:551` 双语表漏「删除」硬编码。

## 附录 C：B5 死代码清单（直接删，路由留 redirect）

- `ia2/views/OrchestrateView.vue`（旧 /app/eng 件）+ `components/SpecList.vue`/`SpecDetail.vue` + `adapters/orchestrate.ts`
- `ia2/views/scenes/EngScene.vue`
- `loop/runcenter/views/RunCenterView.vue`、`RunDetailView.vue` 及其独占子件（InboxPanel/GoalLoopStandingPanel/RunListTable/TaskRunsPanel/RunTimeline/NodeInspector）、`ia2/components/flow/RunCanvas.vue`、`adapters/inbox-center.ts`
- `ia2/views/gov/GovClusterSection.vue`、`GovSessionHealthSection.vue`
- `sim/sim-tabs.ts` 死词条（tabDelivery/tabTrace/pending）；`i18n-gov-tabs.ts` tabGovCluster/tabGovSessionHealth 死键；`stage-attribution.ts` 已 redirect 的 ia2.gov* 归属行
- 双入口收敛：ia2.teams/agents/accounts/cases 独立页 redirect 至对应阶段签；旅程五步卡目标（stage-meta.ts:129,137,145,161）改阶段签；上游 `/hermes/journey` 旧旅程页 redirect
- 面包屑缺口（Workbench 家族/TasksView/SearchView/cases 无面包屑）与 `IaBreadcrumb.vue:54-55` 已 redirect 签级标签清理

## 附录 D：B6 布局遮罩/溢出清单

- z-index 账本（建议 `ia2/z-layers.ts`）：`ia2.scss:108-114`(z40)/`cockpit.scss:138-141`/`SimAnchorDrawer`(z60)/`GovOverlay`(z60)/`EvidencePanel:347`(z60)/`OntologyView:628`(z60)/`CockpitRunTraceModal`(z100)/`IaShellHeader:366-385`(998/999)/`RunCenterView:535`(z1000)/`matrix-chat`(z1000)/`ide/toast:28`(z2000)——同层互挤与 999>1000 倒挂需重排。
- `AttentionStrip.vue:157-163` 抽屉依赖已删全局 `.ia-attn` 定位+硬编码 left:96px → scoped 自持定位。
- `kanban/components/KanbanTaskDrawer.vue:1902-1910` 评论输入条 fixed width:720px → sticky。
- `sim/OverviewPanel.vue:389,409,435,445` 零断点 → 1100px 折行/sticky 退场；`WorkbenchView.vue:717-728` 三栏永不塌缩+分割条 z100 压内容。
- `sim/TracePanel.vue:124-147,186` 三按钮 nowrap 塞 5 列表、`DeliveryPanel.vue:109-110` mono 长串 → 表 min-width+overflow-x:auto。
- `OverviewPanel.vue:192-199` 清算灯整句 nowrap、`CockpitPanel.vue:49-85` 徽标串 → 换行/隐藏策略。
- `stage/StageShell.vue:277-285` 页签横滚隐藏无可发现性 → 渐隐遮罩。
- `ide/views/IdeTaskSidebar.vue:1179` archived 组无滚动上限（cli-body 先例旁）。
- `ia2/components/gov/GovOverlay.vue:117-119` <900px 中列被 overflow:hidden 裁切。
- 断点覆盖面：126 个 ia2 .vue 仅 8 个含 @media（sim 四签/TasksView/InboxView/SearchView/AgentsView/AccountAdminView/GovOverlay/WorkbenchView 无兜底）。
