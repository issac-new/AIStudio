# 2026-10-21 zcode-context-trend — zcode 会话内上下文趋势与构成浏览器（dsh-context 吸收·Phase 2）

## 背景

Phase 1（2026-10-21-zcode-usage-ledger.md，main f3b2ee9e）落地了本机 zcode 用量账本（三张用量表只读消费+账单展开+账本分区）并完成浏览器走查（账本分区金路径全绿）。本轮补齐 dsh-context 两个标志性能力在 zcode 域的对应物，并修复走查发现的一个缺陷：

- **走查发现缺陷**：侧栏内嵌 IdeCliSessions 时（IdeTaskSidebar.vue:816 注入 `:sessions="cliFiltered"`），组件 load() 因「外部注入不双拉」早退，跳过用量拉取——主 surface（侧栏）上用量徽与账单按钮全部缺席。落地页（自拉模式）正常。
- **dsh-context 对照**：其「Context Trend（逐请求趋势）」「Context Browser（构成浏览）」「Context Events（压缩事件）」在 zcode 域的数据源已实测确认：model_usage 每行即一次模型请求（prompt=input+cc+cr 为**精确值**，优于 dsh 的密度估算）；message/part 表（30.7 万消息/113 万 part）data JSON 含 role/tokens/text/tool state/file metadata；part type=compaction 共 289 条（trigger/reason/status 齐）。

## 变更

- **S1 缺陷修复**：IdeCliSessions 把用量拉取从 load() 拆出（loadUsage 独立函数），mounted 即拉（注入模式也拉）；「刷新」按钮同时重拉。
- **S2 服务端** `zcode-usage.ts` 新增 `handleUsageContext`（GET /api/ide/zcode-usage/sessions/:id/context）：
  - requests[]：model_usage 按时序（cap 500）：at/promptTokens(精确=input+cc+cr)/outputTokens/model/turnId/ttftMs/status。
  - categories：message×part 折叠出六类 ≈ 估算（用户文本/助手文本/推理/工具调用/文件/其他），estTokens+count。
  - largest[]：top 20 最大消息（role/at/estTokens/preview 截 120 字符）。
  - compactions[]：压缩事件（at/trigger/reason/status）。
  - 解析上限（part cap 8000/会话）防大库拖死；JSON 解析失败跳过计数。
- **S3 路由**：matchZcodeUsageRoute 增 `context` 分支。
- **S4 客户端**：api/zcodeUsage.ts 增 context()；IdeCliSessions 账单展开新增两块：
  - 「上下文趋势」：逐请求双色条带（prompt 灰 + output 主色，CSS 实现，悬停 tooltip：时间/模型/prompt/output/TTFT），压缩事件打 ✂ 标。
  - 「构成（≈估算）」：六类横条+计数+top 消息列表（默认折叠，点开才拉 context 端点）。
- **S5 测试**：服务端夹具增 message/part 表断言（估算器/类别折叠/压缩事件/上限）；客户端增趋势与构成渲染、注入模式徽章回归。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 趋势数据=model_usage 精确值，不做密度估算 | 每行即一次真实请求，prompt 口径精确（Phase1 实锚）；dsh 的估算法在其域因无逐请求表才用，zcode 域有真值不用假值 |
| D2 | 构成浏览=message/part 折叠 ≈ 估算（CJK≈1 token/字 + ASCII/4），不是精确值，UI 明标「≈估算」 | part 无 token 计量；诚实原则——估算必须带 ≈ 标注（Phase1 spec D4 同源） |
| D3 | context 端点按需拉取（账单展开点开「构成」才请求），不随账单默认加载 | 113 万 part 全库折叠成本在会话级，按需+cap 双保险 |
| D4 | 预览内容截 120 字符且仅 top20 | 本机调试工具定位；防大 payload 也防整屏贴原文 |
| D5 | 工具 part 的估算取整个 data JSON 长度（含 input+output） | 工具调用的上下文开销=参数+结果，整 JSON 长度是最贴的近似 |
| D6 | 趋势条带用纯 CSS 不引 ECharts | 账单展开是列表内嵌块，轻量优先；qoder P2 的 studio 域趋势已用 ECharts，两域互不干扰 |
| D7 | 基于 d458d6d8（当前 origin/main，含 FIBO merge） | 落在最新集成线上，与并行会话零冲突（其改动面=UsageView/patch 673/compaction-trace，与本轮文件零交集） |

## 验证

- 单测：zcode-usage.test.ts（服务端，含新 fixture 表）+ zcode-usage-ui.test.ts（客户端，注入模式徽章回归+趋势/构成渲染）。
- live 探针：真库 context 端点（requests 非空/压缩事件可空/categories 六类齐全）。
- 全量：合并前 npm test。
- UI 走查：serve-main 换装后浏览器验证侧栏徽章（S1 修复）+账单趋势/构成两块；走查结论回写本 spec。

## 验证实录（2026-10-21 收口时）

- 服务端单测 15/15（含估算器/foldContext 六类+角色拆分+脏 data skipped/HTTP 精确口径/空会话 note）；客户端 10/10（含 S1 注入模式徽章回归/趋势条带/构成≈标/压缩事件/raw-hex 闸过）。
- live 探针 4/4：真库 context 端点 requests 精确值非空、构成类别齐全、largest 预览 ≤120、压缩事件形状稳定。
- 全量 `npm test`：5638 通过 / 2 失败。**两失败处置**：①raw-hex 幽灵变量=本轮引入（`--out-h` CSS 变量），已根治（改子元素内联高度）后复测绿；②unified-nav-guard v12.4 窗口管理=净树（stash 后）同样失败的既有失败（d458d6d8 带入，非本轮文件），如实声明不越域修。
- 走一遍真实修正：ctx-toggle 初版 v-if 依赖未加载数据=死锁（点不开构成），测试抓出后改为账单展开即显示。
- 浏览器复走查（2026-10-21 16:20，serve-main=025eacf0）：分组模式侧栏徽章 27 条+账单按钮齐（S1 生效；首探无徽=4.8G 库聚合数秒延迟，非缺陷）；账单展开金路径全绿——逐轮表真实 TTFT（2.6s/7.3s/9.5s）+成本 ≈$18.48+工具时间线 100 次；构成展开：趋势 120 柱（总 268 次请求）、构成合计 ≈1.2M（工具调用 402 段 ≈1.0M 占 83%——「上下文被谁吃掉」洞察成立）、top 消息预览 ≤120。视觉核验两瑕疵：①窄侧栏逐轮表 8 列被裁→尾修加 overflow-x 滚动（本提交）；②构成块在折叠下沿属滚动位置非缺陷。项目/时间线组织模式下 CLI 行由侧栏自渲染（ide-task-cli-*），不带徽章/账单——记为后续项（混排行接入需侧栏拉用量，本轮不做）。

## 遗留项收编（2026-10-21 第三批：混排行接入）

Phase 2 复走查记录的遗留项——侧栏「项目/时间线」组织模式的 CLI 混排行（`ide-task-cli-*`，侧栏自渲染）不带徽章/账单——本批收编：

- **useZcodeCliUsage 单例 composable**：模块级缓存 + in-flight 去重，三个 surface（混排行/分组独立段/落地页）共享一次拉取；`__zcodeCliUsageTestHooks.resetUsageForTest` 供测试复位。
- **IdeCliSessionBill 子组件**：账单体（逐轮表/趋势/构成/工具时间线）自 IdeCliSessions 抽出为单一事实源，两宿主复用；挂载自拉 rounds+tools，testid 全部保持不变。
- **混排行接入**：行内用量徽（轮/tok）+「账」按钮 + 列化展开账单体（`ide-taskbar__item--bill-open`）；loadCli 并发触发共享 loadUsage。
- 决策 D8：徽章文案与独立段逐字对齐（`· N 轮 · X tok`），两 surface 视觉一致。

### 验证实录

- 新测试 cli-mixed-usage.test.ts 3 项（徽章/账单展开/单例一次拉取）+ 既有 zcode-usage-ui 10 项（类名迁移 `.ide-cli-bill__*`）+ task-sidebar/devtools-ui 回归全绿（40/40）。
- 全量 `npm test`：5677 通过 / 1 失败（unified-nav-guard=上轮已声明的既有失败，净树同红，非本轮文件）。
- 浏览器验证（2026-10-21 16:50，serve-main=9ab21ce8）：「项目」组织模式 30 条混排行徽章+「账」按钮齐（首行 `· 3 轮 · 122.0M tok`）；账单体在混排行展开金路径绿——本会话自身 3 轮账目（89m 长轮/UNKNOWN_ERROR 出错轮/166 次调用）+成本 ≈$33.95 含订阅说明+工具时间线实时记录中。视觉核验两疑点均为帧效应非缺陷：徽章/账按钮被 scrollIntoView 推出视口（DOM 探测证实在位）；逐轮表在窄侧栏内横向滚动（overflow-x 设计行为）。右栏「工作区不可用」为首轮走查即存在的无关既有态。
