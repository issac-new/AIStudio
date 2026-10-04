# 九源调研：Agent Harness 工程、Claude Code Mods、RSI 与 Agentic 治理——Swarm Studio 能力对照与完善

日期：2026-10-04 ｜ 分支：`feat/nine-sources-harness-round-20261004` ｜ 源文档：`docs/2026-10-04-nine-sources-sources/`（8 篇微信全文提取件 + DeepSeek Harness 仓库 5 件官方文档）

**主旨三句话**：九个源合并成一个问题——Swarm Studio 的 harness 边界（工具执行、评估、治理、扩展）与业界最新实践差在哪。对照盘点结论：强在流程门禁/审批分级/观测治理面，弱在工具执行瀑布、工具按需加载、UI 扩展插槽、评估量化指标层。本轮已落地两项（影响面预览 + 四层评估读模型，均测试绿），其余 12 项编号提案待裁决。

---

## 一、九源速览

| # | 源 | 一句话结论 | 对本仓最有用的点 |
|---|---|---|---|
| 1 | Harness、Loop Engineering、Graph Engineering：如何选择，如何评估（智趣AI 笔记 08-27） | 三者是嵌套不是竞争：Harness=可信运行边界，Loop=阶段内闭环，Graph=阶段间拓扑 | 四层评估框架 + 五个治理量化指标口径（本轮落地②） |
| 2 | Agent Harness 工程：从 Agent Loop 到完整运行时（码农变现 08-13） | "模型提出行动，Harness 决定这次行动能不能发生"；七条底线 | 工具执行瀑布（pre/权限/审批/post 分层）；"把事实搬出对话" |
| 3 | Pi 1.0 解析（赛博贪吃蛇随想录 10-02） | 极简 harness 开始管理复杂性：工具按需发现、模型动态路由、持久执行 | 工具说明也是上下文（延迟加载五档）；Virtual Models 每请求路由 |
| 4 | Claude Code Mods：界面与行为，由你定义（深夜开发者LND 10-02） | Mods=给编码工具加面板/按钮/检查点的小程序 | Blast Radius（本轮落地①）；Token Weather（本仓已有等价物） |
| 5 | LLM 自进化的系统性困境：字节三论文（模智空间 09-09） | Aspire/S³Gym/HarnessDev 实证：闭环跑通≠能力提升 | held-out 留出评测；增益不稳定需回滚；自我评判不可靠 |
| 6 | EqualAI Agentic AI 治理实战（架构师之道 10-04） | 治理差距是优先级问题；六个障碍六条路径 | 讨好者问题（不报局限）；agent 身份/委托链/可撤销凭证 |
| 7 | 清华 RSI 全景综述 404 篇（MindChain.AI 10-03） | 任务增益/能力保留/改进器增益是三类不同证据 | 密封测试不得反哺更新；改进器同起点对照实验 |
| 8 | Self-Improvement、Self-Evolving、RSI 讲清楚（上下文编织局 09-16） | Agent System = Model+Harness+Data+Trainer+Improvement Mechanism 五元组；L1-L5 分级 | RSI 分级标注（本仓 maturity 面可扩展） |
| 9 | DeepSeek Harness v0.2.1-alpha.1（GitHub deepseek-ai/deepseek-harness，10-03 发布） | "Everything is a Plugin"（Cordis 框架，243k star）；v0.2.1-alpha.1 新增实验性 Claude Code Mods 兼容层 | Mods 兼容层设计（事件链/$ 命名空间/横幅面/测试工具包）；"让 Agent 创建插件" |

源文关键引句（逐字取自提取件，见 `sources/` 对应文件）：

- 源1：「Harness 解决可信运行边界，Loop Engineering 解决阶段内闭环，Graph Engineering 解决阶段间拓扑。」（art1.md 总结节）
- 源1：「不能用单一完成率代替四层证据」（art1.md §评估表图注）
- 源2：「模型提出行动，Harness 决定这次行动能不能发生，以及发生之后留下什么事实。」（art2.md §真正的问题）
- 源2：「`messages` 适合承载思考过程，不适合充当整个系统的数据库。」（art2.md §最重要的变化）
- 源3：「工具说明本身也是上下文，应像其他运行资源一样按需分配。」（art3.md PART 03）
- 源4：「官方的 Blast Radius，会在识别到某些删除、重置操作时先停下来，把可能受到影响的文件展示出来，再由你决定继续还是取消。」（art4.md §删文件之前）
- 源5：「能跑完训练循环 ≠ 真正获得对齐目标的能力提升」（art5.md Aspire 节）；「Harness是智能的另一个载体，和模型权重同等重要」（art5.md HarnessDev 节）
- 源6：「智能体治理的核心是身份、权限、工具、记忆、审计。」（art6.md §4.2）
- 源7：「密封测试的分数不能反过来指导更新、停止或挑选检查点」（art7.md §3.1）
- 源8：「真正的递归发生在“改进机制”也成为改进对象之后。」（art8.md §1）
- 源9：「新增实验性 Claude Code Mods 兼容层。目前阶段的主要目的是验证 Claude Code Mods API 功能大致为 DeepSeek Harness 插件的一个子集，而非为用户提供实际的完整兼容性。」（dsh-release-v0.2.1-alpha.1.md ✨新增功能）

## 二、现状对照（三路盘点结论，锚点为实读）

### 2.1 运行时面（对照源2/3/9）

已有：工具注册表与 authorizer 审批门（`upstream/hermes-studio/packages/ekko-agent/src/tools/registry.ts:77-103`）；host 侧上下文压缩与水位 UI（`custom/server/compactthreshold/`、`custom/client/ide/composables/useSessionMetrics.ts`）；MCP stdio+streamable_http（`ekko-agent/src/tools/mcp.ts:1-2`）；memory SQLite+FTS+distill 全家桶；skills 名单进 prompt 正文懒加载；loop 引擎任务图/消息总线/worktree/BudgetGuard；cron 双调度面；六 provider 模型接入。

缺：
1. **工具执行瀑布**——pre/post-execute 钩子与中间件链不存在，唯一扩展点是单一 authorizer 回调（`tools/types.ts:39-43`）。源2 的"schema 校验→权限→审批→Hook→能力路由"分层、dsh 的 `tools/pre-execute → tools/execute → tools/post-execute` 瀑布均无对应物。
2. **工具按需加载/说明预算**——MCP 工具注册即全量可见，无 tool search/延迟加载（Pi 五档 exposure：direct/model-only/codemode/deferred/hidden）。
3. **动态模型路由**——`custom/server/modelroute/model-routing.ts:24-31` autoRoute 纯函数已写好，grep 全仓无接线消费方（Pi Virtual Models 的对照缺口）。
4. **进程沙箱**——无（隔离靠 worktree+浏览器准入+路径清单）。
5. **ekko 主会话 append-only 事件日志**——SQLite 快照式；append-only 仅 loop 事件日志/gateway 房间/run-trace 三处子系统。

### 2.2 扩展面与治理面（对照源4/9）

已有：审批三档风险分级+抽检回看（`custom/server/approvals/risk-tier.ts`、`autopass.ts`）；逐文件 diff 查看+undo（`ToolChangeCard`、`IdeRunResultCard`）；OutboundNoticeGuard 出站限流（Tahiti 问题的本仓解）；run-trace JSONL+Run Observatory；治理三账+change-gov+QGate；settings-layers 四层偏好+状态栏槽位+键位映射。

缺：
6. **TS/UI 侧运行时插件系统**——全部经 patch+inject 静态注入（dsh "Everything is a Plugin" 的对照极差）；Python agent 侧有 plugin.yaml 钩子系统（run-trace 等 2 个在用）。
7. **composer 上方通用插槽**——聊天输入区上方的横幅均为 bespoke 硬编码（IDE 面堆了 recap/注入/审批记忆/运行行/轮结果/todo 六条固定件），无注册式"模组横幅带"（dsh band：每会话一条、按加载顺序绘制、按钮回调留宿主）。
8. **副作用影响面预览**——审批卡只有命令文本，无"将影响哪些文件"清单（源4 Blast Radius）→ **本轮已落地①**。
9. **逐 hunk 时间轴回放**——有逐文件 patch 查看，无轮级编辑时间轴（源4 Replay Theater）。

### 2.3 自进化与推演评估面（对照源1/5/7/8）

已有：RSI 单机内核活着（ladder 决策表+看门狗 cron+SOUL 接线，`~/.hermes/profiles/_shared/01-scheduling-bus/capability-ladder.md`）；三套记忆回流（hindsight 家族库/policy-handbook/知识池）；六闸+R1-R17 审计+UAT 判词器（simharness）；变更三分法+人审采纳纪律。

缺：
10. **四层评估划分与五个治理量化指标**——全缺（重复副作用率/恢复成功率/人工接管率/路由违约率/预算停止准确率）→ **本轮已落地②（口径立账+既有仪表归位）**，采集落地见提案 P10。
11. **held-out 留出评测**——全库检索零命中（源5「交互产生大量轨迹≠自动学会变强」的实证防线、源7 密封测试协议）。
12. **改进器对照实验**——"双跑对比"口径已立从未执行（V3/V5 plan 记档）。
13. **prompt/skill/memory 配置层 canary/自动回滚**——现纪律是 git+备份+人审（源5「后续更新经常会摧毁之前微弱进步，需要回滚、版本管理机制」的对照缺口）。

## 三、本轮已落地（两项，全测试绿）

### 落地①：副作用影响面预览（Blast Radius）——源4 + 源9 tool.call 持有模式

- 域（纯函数无 IO）：`custom/server/approvals/impact-preview.ts`——`analyzeCommandImpact(command)` 解析 rm/rmdir、git clean -f/-d、git reset --hard、git checkout|restore --、find -delete、`>` 覆盖重定向、truncate；引号感知分段（&&/||/;/|）；组合命令取最保守段（unbounded 优先）；变量/根路径/宽域通配如实标 `unbounded` 不猜数。
- 接线：`pending-controller.ts` 两源（fleetfile 队列+fleet 快照）聚合时内嵌 `impact`；新端点 `POST /api/approvals/impact-preview`（聊天侧审批卡等按需取）。
- UI：`ApprovalPanel.vue` 待审命令行内可展开块（危险类型徽章+目标数+unbounded 警示+目标清单截 50 条），词条走 `i18n-approvals.ts` 本地字典（不动注入词表 473）。
- 测试：`impact-preview.test.ts` 25 用例（25 passed）；`approval-panel.test.ts`+`approvals-dedupe.test.ts` 回归 10 passed。
- 边界如实声明：纯模式解析不做文件系统枚举（路径以 agent 会话工作区为准，服务端无法可靠还原）；非破坏性命令返回 null=不渲染，**不假装零影响**；官方 Mods 原文的局限同样适用——「这个例子只识别特定命令，藏在脚本里的操作可能漏掉」（art4.md §删文件之前），故 risk-tier 分档与审批门保持原位，预览只是加一道看清。

### 落地②：四层评估读模型 + 五治理口径立账——源1 四层评估框架

- 域：`custom/server/harness/eval-layers.ts`——`buildEvalLayers`（纯组装）+ `collectEvalLayersInputs`（fail-soft 采集：派发台账/成本账/审计源）。四层各有指标：结果（送达率/失败率 instrumented，逃逸缺陷率 gap）、执行（路由违约率/预算停止准确率 gap）、资源（token/等待 p95/返工时 instrumented）、治理（人工干预计数 instrumented，重复副作用率/恢复成功率/人工接管率 gap）。
- 五治理指标口径**逐字转写自源1 表格**（`GOVERNANCE_METRIC_DEFINITIONS` 单一事实源），gap 指标 value=null 不造数（与 maturity.ts 同纪律）。
- 接线：`/api/harness/eval-layers`（harness-controller 第 5 端点，挂载 patch 543 已在位零新增 patch）；`EvalLayersSection.vue` 四宫格 + gap 黄底徽章；GovHarnessView 接线；i18n 双语 10 键。
- 测试：`eval-layers.test.ts` 6 用例（6 passed）；governance/harness 全套 10 文件 54 用例 passed。

## 四、编号提案（P1-P12，按建议优先级排序；裁决后另行开工）

| # | 提案 | 源 | 一句代价 |
|---|---|---|---|
| P1 | 工具执行瀑布：ekko registry.execute 加 pre/post-execute 钩子链（patch upstream 核心） | 源2/源9 | 中高——动 upstream ekko-agent 核心，回归面大，需守门测试护全路径 |
| P2 | MCP 工具延迟加载与说明预算（tool search 式按需声明） | 源3 | 中——runtime 工具目录组装层 patch + 30+ 工具现状重排 |
| P3 | modelroute 接线：autoRoute 挂路由 + run 创建侧消费策略裁决 | 源3 | 低中——纯函数已备，消费点语义需裁决（自动路由 vs 建议式） |
| P4 | 模组横幅带（Mods band）：composer 上方注册式插槽，现有六条固定件迁移 | 源4/源9 | 中——IDE 聊天面重构 + 注册协议设计 |
| P5 | Replay Theater：轮级文件编辑时间轴回放（已有逐文件 patch 查看，补时间轴） | 源4 | 中——trace/工件双数据源对齐 |
| P6 | 五治理指标采集落地（simharness mx-report-audit + loop 事件日志聚合，口径已立账） | 源1 | 中——simharness 仓独立轮，数据 schema 已有六闸工件可挂 |
| P7 | held-out 留出评测：记忆 distill 验证与推演评分双落点（评测集对被评对象保密） | 源5/源7 | 中——需防泄露纪律（控制器持集、只回聚合分） |
| P8 | 改进器对照/双跑执行化（新旧改进器同起点同预算，口径已立从未执行） | 源7 | 中高——双跑编排+统计口径 |
| P9 | RSI 分级自检入 maturity 面（五元组对照+L1-L5 标注，纯读模型扩展） | 源8 | 低——eval-layers 同款做法 |
| P10 | agent 身份与委托链（唯一身份/工具白名单/可撤销凭证/全链路审计） | 源6 | 中——治理本体设计先行，落地分两期 |
| P11 | "让 Agent 创建插件/技能"入口（skill_manage 已有底，补 creator 动线） | 源9 | 低中——IDE 聊天面入口+草稿保留 |
| P12 | 讨好者防线：截断/不确定披露（system prompt 段+审计断言"是否报局限"） | 源6 | 低——prompt 策略域+守门测试 |

明确**不做**（本轮裁决）：ekko 主会话 append-only 化（P4 级存储迁移风险大于收益，loop 侧已有事件日志满足推演审计）；进程沙箱（独立基建轮）；完整 Mods 兼容层（dsh 尚在 alpha 且其目的为 API 子集验证，非实用兼容——见源9 发布说明原话）。

## 五、已具备清单（九源建议中本仓已有等价物，防重复建设）

- Token Weather（源4）≈ 上下文水位/TPS/缓存命中/四段构成分解（`useSessionMetrics.ts`、`contextBreakdown.ts`、`IdeMetricsPopover`）
- 出站限流/背压（源6 Tahiti 问题）≈ OutboundNoticeGuard 534 + 容量风暴根治 533
- 审批分级（源6 人机协同边界）≈ 三档风险+抽检+veto 回灌
- Harness 作为可进化对象（源5 HarnessDev）≈ RSI 单机内核四条硬边界（自愈≤2轮/预算前置/递归深度=1/效果判定在机器）
- 评估防作弊（源7 独立评测）≈ R1 stub 诱饵免疫/R8 数字实算/R17 按轮真值
- 经验沉淀三通道（源1 数据回流）≈ hindsight 家族库/policy-handbook/知识池

## 六、验证记录

- `npx vitest run custom/server/approvals/__tests__/impact-preview.test.ts` → 25 passed
- `npx vitest run custom/client/cockpit/__tests__/approval-panel.test.ts custom/client/cockpit/__tests__/approvals-dedupe.test.ts` → 10 passed
- `npx vitest run custom/client/governance/__tests__/ custom/server/harness/__tests__/` → 54 passed（10 文件）
- 全量回归与热更新走查见 §七补记

## 七、补记（全量验证与合并状态）

**全量测试**：`npx vitest run`（全仓）→ **3735 passed | 1 skipped（3736）**，零新缺陷。

**热更新走查（8649 + 重启后的 8647，2026-10-04 晚）**：
- `GET /api/harness/eval-layers?days=7`（带 studio JWT）：四层全回，窗口内 476 次派发真实数据；与 `/api/harness/maturity` 派发口径一致（dispatch-failure-rate 同值 1——本机台账 reason 分布所致的既有读模型行为，非本轮引入）。
- `POST /api/approvals/impact-preview`（`git clean -fdx && rm -rf dist`）→ `{danger:'delete', unbounded:true, note:'bare-glob'}`，组合命令取最保守段，符合设计。
- 浏览器走查 `#/app/board?tab=gov-harness`：四层评估板块完整渲染（四宫格/双态徽章/五口径/底部 instrumented 6 · gap 6 计数）。
- 浏览器走查 `#/app/inbox`：收件箱正常渲染（1 条评审卡待审+抽检区+决策历史）；当前待审为 review 卡（非破坏性命令），影响面块按设计不出现——不注入假审批数据污染共享队列（`~/.hermes/approvals/queue.jsonl` 有真实 worker 在轮询），影响面渲染路径由 jsdom 挂载测试覆盖。

**走查顺带的数据质量发现（记档，不属本轮范围）**：等待时延账 `waitP95Seconds=664448s`（≈7.7 天）——看板 done 任务 created→completed 时间戳存在脏数据，P6 采集五治理指标时须先做数据清洗与口径对齐。

**合并状态**：feature 分支 `feat/nine-sources-harness-round-20261004` → main（见 git log）。
