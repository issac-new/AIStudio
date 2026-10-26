# Manus 2.0 与 OpenCode 2.0 调研：IDE 工作台完善方案

日期：2026-09-29。状态：调研完成，分期方案待批。本文所有结论均有来源锚点（URL 或本地 file:path），厂商自报数字已标注。

## 一、结论

两个标杆产品给 IDE 工作台的可用增量集中在三处：**输入投递语义**（OpenCode 2.0 会话契约）、**事件驱动自动化**（Manus Automations）、**按需能力装配**（Cascade 与 Studio 的共同理念）。其余大件属于云端重资产或专业创作域，与 Ycode"编码工具、非聚合器"的定位红线冲突，列入 Non-goals。

分期菜单（每项一句代价，详见第四节）：

| 期 | 项 | 内容 | 代价 |
|---|---|---|---|
| 一 | A1 | 输入投递双模式（打断注入 / 排队）+ 投递状态时间线 | 小，纯 overlay，需查证 zcode 引擎侧队列语义 |
| 一 | A2 | IDE Automations：文件 / 看板 / git / Matrix 事件触发 IDE 任务 | 中，overlay server 新模块 + 侧栏入口 |
| 二 | B1 | 项目能力包：13 个侧栏 tab 按项目声明裁剪 | 小，ide store + 配置持久化 |
| 二 | B2 | 提供方策略层：allow / deny 语句，治理面权威覆盖 | 中，engine-models 扩展 + 策略评估 |
| 三 | C1 | Code Mode：受限解释器做确定性工具编排 | 大，评估直接吸收 @opencode/codemode |
| 三 | C2 | 事件流 fan-out 单编码多队列 + 启动基准门禁 | 中，工程治理项 |

建议先做期一：A1 是会话体验的语义补全，A2 把已有的 loop 事件连接器接到 IDE 任务上，两者都不动 zcode 引擎内核。

## 二、调研发现

### 2.1 Manus 2.0

Manus 2.0 定位为"新架构"而非版本更新（[官方发布文](https://manus.im/blog/introducing-manus-2-0)），由一个底座和四个产品面构成。

**Cascade 是新的代理harness。** 它把一个项目的任务简报、页面、视频、自动化保持在同一个连接的项目里，项目保持轻量，只在需要时拉入专项能力。官方自报一组配置下对比旧系统：token 少 23.2%、任务完成快 28.2%、成本低 32%（[第三方拆解](https://promptblueprints.tech/ai-releases/manus-2-0-brings-a-new-agent-architecture-and-creative-tools/)指出无测试方法披露，属厂商自报）。

**Cloud Computer 是可购买的持久专用环境。** 服务两类需求：多人游戏服务器、需要常开的自动化。用户笔记本合上后环境继续运行。

**Automations 把定时任务升级为事件触发。** 触发源覆盖新邮件、广告表现变化、日历事件、Slack 消息、Notion 更新；用户用一句话描述"看住什么、出现什么就做什么"，系统据此配置并运行。

**Manus Studio 是升级后的桌面端，核心是人机共享工作区。** 按项目选择性装配工具，覆盖文档、表格、PDF、幻灯片、网站、代码、游戏、视频。两个专业环境：视频编辑器提供可编辑时间线（分轨剪辑素材，换音乐、插自有片段，"Alchemy 模式"让 AI 以创意总监身份混合视频与代码生成）；游戏开发提供边跑边改的 Edit 面板（资产与代码分离，可细到改一个村民的发色），一键发布可玩链接，多人联机走 Cloud Computer。

**Cue 是独立的个人代理应用。** 每个代理有自己的邮箱、手机号、钱包和计算机，能在用户设定预算内付款、接电话留摘要；支持多个代理在一个群里分工交接（调研、初筛、做幻灯片），人做终审。

**远程控制。** 手机语音命令操控家里的电脑，实时观看桌面；Computer Use 让 Manus 在可见、授权的工作区里使用批准过的文件、浏览器和应用。

### 2.2 OpenCode 2.0

OpenCode v2 是 anomalyco 仓库 `v2` 分支上的大重构，当前版本 2.0.6，经 `opencode-v2` Homebrew tap 与 `@opencode/cli` 渠道分发，Docker 镜像同步发布；v1.18.x 仍在主线并行发版（[v2 文档站](https://opencode.ai/v2/docs)、[发布页](https://github.com/anomalyco/opencode/releases)）。架构层面三件事：运行时从 Bun 迁到 Node、桌面端改用 Electron（[媒体报道](https://www.kucoin.com/news/flash/opencode-2-0-major-rewrite-api-overhaul-node-migration-and-electron-desktop-shift)）、monorepo 扩到 34 个包（GitHub API 实测目录数），含 desktop、codemode、console、session-ui、plugin-browser、identity、enterprise 等。`specs/v2/` 下六份规格文档与 `V2_HTTP_API_AUDIT.md` 是本次调研的主要一手材料。

**会话契约（[session.md](https://github.com/anomalyco/opencode/blob/v2/specs/v2/session.md)）。** 输入先落库再执行：`prompt` 先发布持久事件 `session.inbox.enqueued`，投递后才以用户或合成消息进入会话历史。投递分两种模式：`steer`（默认）在下一个安全步边界按入队顺序注入，遇到控制项前停下；`queue` 挂起等会话空闲。`resume` 只决定是否唤醒执行。执行是进程本地的，用写前认领（write-ahead claim）做崩溃恢复：认领在忙周期开始时提交，成功、失败、用户打断都释放，关机或异常死亡保留认领，启动时有限次重试恢复。指令是内容寻址的值增量（SHA-256 哈希、canonical JSON 存储），变更文本冻结进持久事件并投影为系统消息。压缩按上下文窗口加输出余量预估，存结构化滚动摘要加有界的近期上下文，全文转录始终持久。

**工具契约（[tools.md](https://github.com/anomalyco/opencode/blob/v2/specs/v2/tools.md)）。** 一次工具调用最多带三个值：`output`（schema 校验的机器值，给 Code Mode 用）、`content`（模型可见、持久存储）、`metadata`（工具 UI 的紧凑 JSON）。注册按名称在作用域内叠层，关闭一个作用域只移除它自己的注册、露出下一层。法则包括单次执行、编解码边界、拒绝单次调用不能连坐其他调用。

**CodeMode（[codemode 包](https://github.com/anomalyco/opencode/tree/v2/packages/codemode)）。** 一个受限的类 JS 解释器：只实现显式支持的语言特性，程序不能直接碰网络、文件系统、进程，一切外部交互走宿主提供的 `tools` 树。配套 `OpenAPI.fromSpec` 把 OpenAPI 3.x 规格逐操作转成工具，鉴权由宿主解析、对模型隐藏。预算三维：`timeoutMs`、`maxToolCalls`、`maxOutputBytes`。定位是让模型跑确定性的工具编排逻辑（查订单、算结果），全程可审计。

**事件流（[event-stream-architecture.md](https://github.com/anomalyco/opencode/blob/v2/specs/v2/event-stream-architecture.md)）。** SSE 公共流单次编码、N 个独立队列扇出：每个连接一个 4096 帧的独立丢弃式队列，某订阅者溢出只注销它自己，发布方永不挂起。基准（8 KiB 事件、9 次取中位）：10 客户端编码开销降 89.3%，50 客户端降 97.8%（553.928ms 到 12.389ms）。

**提供方策略（[provider-policy.md](https://github.com/anomalyco/opencode/blob/v2/specs/v2/provider-policy.md)）。** allow / deny 语句作用于 `provider.use` 与 `permission`，通配匹配，最后一条匹配生效，无匹配默认允许。组织托管语句由 OpenCode Console 经 `GET /api/v2/config` 下发，追加在最后、拥有最终权威；策略 `deny` 能压过用户级的"始终允许"。替代了旧的 `enabled_providers` 列表。

**HTTP API 审计（[V2_HTTP_API_AUDIT.md](https://github.com/anomalyco/opencode/blob/v2/V2_HTTP_API_AUDIT.md)）。** 139 个端点分 10 组全部审完，每端点给出 Keep / Change / Remove / Experimental-only 四态处置。跨切决策：稳定承诺与实验面用 `/api/experimental/` 路径分层；缺资源一律类型化 404；取消与删除幂等化（已不存在返回 204）；健康与服务器信息合并为 `GET /api/info`；时间戳统一为 epoch 毫秒。

**桌面端工程（[desktop 包](https://github.com/anomalyco/opencode/tree/v2/packages/desktop)）。** Electron 壳，预构建 CLI 放在 app.asar 之外的 resources 目录；dev / beta / prod 三渠道各有 CLI 来源规则；自带 `bench:startup` 启动基准：隔离 HOME、剥离 `OPENCODE_*` 环境变量、丢弃一次杀毒预热、用 CDP DOM 轮询加渲染线程空闲判定（首个主线程任务占比低于 10% 的 500ms 窗口）定义"就绪"，支持两构建 A/B 交替对比。

**社区反面借鉴（[HN 讨论](https://news.ycombinator.com/item?id=47460525)）。** 主要批评：TUI 常驻内存 1GB+；默认配置把提示词外发（会话标题生成调用云端小模型，mitmproxy 实测）；provider 网站可提供 auth shell 命令被执行。对 SwarmStudio 的镜鉴：本地优先、遥测零默认外发、provider 鉴权命令不执行远端下发的 shell。

## 三、对照现状的差距清单

现状锚点来自本次本地代码勘察（overlay 与 upstream 实读）。判定分四档：已达 / 半成品 / 缺口 / 不适用。

| # | 能力 | 业界做法 | IDE 工作台现状 | 判定 |
|---|---|---|---|---|
| 1 | 输入投递语义 | steer / queue 双模式、安全步边界注入、enqueued→delivered 持久收件箱 | `overlay/custom/client/ide/components/IdeQueuePanel.vue:4` 排队面板只读灰显；`upstream/hermes-studio/packages/client/src/stores/hermes/chat.ts:1404` 客户端 queued 计数；zcode server 源码 grep 无 steer 词汇 | 半成品：有排队显示，无模式选择、无投递状态 |
| 2 | 事件驱动自动化 | 一句话配置，邮件 / 日历 / Slack / Notion 事件触发 | `overlay/custom/server/autosched/automation-schedule.ts`（2KB）仅定时；`overlay/custom/server/loop/connectors/` 已有 github / local-git / webhook 三连接器，但只服务 loop 工作流，不触发 IDE 会话 | 缺口：事件源与 IDE 任务之间断线 |
| 3 | 按需能力装配 | 项目保持轻量，需要时拉入专项能力 | `overlay/custom/client/ide/store/ide.ts` 的 `IdeSidePaneTab` 13 个 tab 常驻全量 | 缺口：无项目级能力声明 |
| 4 | 提供方策略 | allow / deny 语句、组织策略最终权威、deny 压过"始终允许" | `overlay/custom/server/controllers/ide/engine-models.ts` 只做模型目录存取，无策略层 | 缺口 |
| 5 | 工具机器输出 | output / content / metadata 三元组；Code Mode 确定性编排 | 工具卡片渲染 content（复用上游 MessageList）；无机器值输出通道、无解释器 | 缺口（内核级） |
| 6 | 事件流扇出 | 单编码 N 队列，溢出隔离，50 客户端编码开销降 97.8% | `overlay/custom/server/zcode/projection-socket.ts` 按房间 fan-out，是否单编码未核 | 待查证 |
| 7 | 启动基准门禁 | bench:startup：CDP 轮询 + 渲染空闲判定 + A/B 对比 | 无对应机制（装机走查为人工清单） | 缺口（治理） |
| 8 | 隐私默认 | （反面）OpenCode 默认外发被社区批评 | SwarmStudio 本地优先，暂无外发遥测 | 已达（保持红线） |

## 四、完善方案（分期）

### 期一：会话语义补全 + 自动化接线

**A1 输入投递双模式 + 投递状态时间线。** 聊天输入框提供"注入（打断当前步）/ 排队（等空闲）"显式选择；排队面板从只读灰显升级为投递时间线，每条输入显示 enqueued → delivered 状态与投递边界。落点：`IdeQueuePanel.vue`、上游 ChatInput 的 B 型 patch、`chat.ts` 队列态。前置一步：逐行核 zcode 引擎侧现有输入队列语义，若引擎只支持排队，注入模式在 studio 桥接层用中断加重发实现。代价：纯 overlay 加一或两个 patch，估算 2 至 3 天。验收：运行中注入在步边界生效、排队项空闲后按序投递、刷新后投递状态不丢。

**A2 IDE Automations：事件源触发 IDE 任务。** 复用 `loop/connectors/` 的三连接器，新增文件变更源（workspace 目录 watch）与看板列变更源（kanban 已有 column_transition 事件，patch 399），事件经去抖与过滤后创建 IDE 会话并注入任务简报。配置面做成自然语言起步：在 IDE 新增"自动化"入口，用户写"看住 src/api，出现新文件就让 zcode 补测试"，由代理生成结构化规则后人工确认启用。落点：`overlay/custom/server/` 新 automations 模块（扩展 autosched）、ide 侧栏入口。代价：中，估算 4 至 6 天。验收：四类事件源各实测一条规则端到端触发、规则可停用、触发历史落库可查。

### 期二：结构增强

**B1 项目能力包。** workspace 级声明启用哪些侧栏 tab 与浮层（browser / wiki / whiteboard / kanban / mcp ...），未声明的 tab 不渲染；默认保持现在的全量。项目能力写入 workspace 配置并随会话持久。落点：`ide.ts` store、IdeSidePane 渲染过滤。代价：小，估算 1 至 2 天。验收：声明裁剪后 tab 消失、切换 workspace 恢复、默认行为不变。

**B2 提供方策略层。** `engine-models` 扩展 policy 字段：allow / deny 语句列表（providerId 通配），评估顺序用户全局、项目、治理面（对接 4A 治理层已有 RACI 权威），治理面 deny 最终权威；模型选择器与引擎派发两处都过策略。落点：`engine-models.ts` 控制器、`ide/utils/engine-models.ts`、派发路径。代价：中，估算 3 至 4 天。验收：deny 的 provider 在 UI 与派发两处都不可选、治理面语句压过用户 allow、策略变更热生效。

### 期三：内核级与治理

**C1 Code Mode。** 先做吸收评估：核 @opencode/codemode 许可证与依赖面（Effect 生态深度耦合是已知风险），可行则以独立 MCP 工具面接入 zcode 引擎（`code_mode` 工具：入参程序文本 + 预算，出参结果与调用日志）；不可行则降级为 spec 立项自研受限编排器。代价：评估 1 天；接入估算 5 至 8 天。验收：代理可在预算内完成多工具确定性编排、超限截断有告警、调用日志可审计。

**C2 事件流扇出优化 + 启动基准。** 读码核 `projection-socket.ts` 是否每帧每房间重复编码，是则改单编码多队列；把装机走查中的启动路径脚本化为 bench（CDP + 渲染空闲判定），进 CI 门禁。代价：估算各 2 至 3 天。验收：多房间压测下单帧编码次数为 1；启动基准在干净环境可复跑并出对比数。

## 五、Non-goals（本可做但不做）

- Cloud Computer 的售卖与托管：无云基础设施，且违反本地优先红线。
- Cue 独立应用（代理邮箱 / 手机号 / 钱包 / 接打电话）：非编码域，身份与支付代理风险面大。
- 视频编辑器、Alchemy、游戏开发 Max Ultra：专业创作域，超出 Ycode"以 zcode 源码为基底融合的编码工具"定位（zcode-foundation 设计 §0 红线）。
- 手机语音远程控制桌面：远程访问整体另立项，不混入本方案。
- OpenCode 式云订阅与 Console 托管：商业形态不对应。

## 六、风险与未验证项

- zcode 引擎侧输入队列语义只做了词汇级 grep（`upstream/zcode/packages/server/src` 无 steer 匹配），A1 开工前需逐行核 `sendConversationCommandV4` 的实际投递路径。
- @opencode/codemode 许可证未核（仓库有 LICENSE 文件，未读）；其 Effect 依赖耦合度未评估。
- `projection-socket.ts` 的编码路径未读码，C2 的收益是假设。
- Manus Cascade 的 23.2% / 28.2% / 32% 为厂商自报，无方法披露，仅作方向参考。
- OpenCode v2 当前 2.0.6 经 beta 渠道分发，规格文档标注"已实施"但 API 仍在审计收敛期，吸收其契约设计思想而非照抄端点。

## 附：来源

- Manus 2.0 官方发布文：https://manus.im/blog/introducing-manus-2-0
- Manus 2.0 第三方拆解：https://promptblueprints.tech/ai-releases/manus-2-0-brings-a-new-agent-architecture-and-creative-tools/
- OpenCode v2 分支：https://github.com/anomalyco/opencode/tree/v2
- v2 规格（session / tools / event-stream / provider-policy / catalog）：https://github.com/anomalyco/opencode/tree/v2/specs/v2
- HTTP API 审计：https://github.com/anomalyco/opencode/blob/v2/V2_HTTP_API_AUDIT.md
- v2 文档站：https://opencode.ai/v2/docs ；更新日志：https://opencode.ai/changelog
- 桌面端 2.0 重写报道：https://www.kucoin.com/news/flash/opencode-2-0-major-rewrite-api-overhaul-node-migration-and-electron-desktop-shift
- HN 社区讨论：https://news.ycombinator.com/item?id=47460525
- 本地现状勘察：overlay 与 upstream 实读（第三节表格内 file 锚点）
