# Google Antigravity 功能面调研：官方文档全量对照 SwarmStudio /ide

2026-09-21 调研。方法：沿 antigravity.google 导航穷举官网/产品页/文档站/blog/changelog，辅以 blog.google 发布文、Google 官方 codelab、维基与三家媒体发布日报道（均标注第三方）。实抓有效页面 36 个：官方 32（antigravity.google 30 + blog.google 1 + codelabs 1）+ 第三方 4。抓取失败如实注明。产品迭代快，本文一切以 2026-09-21 抓到的页面为准；标注「未能获取」处不做记忆补写。

## 一、产品定位与信息架构

一句话：**agent-first 的代理化开发平台**——官方自称 "an agentic development platform, allowing anyone to build in the agent-first era"，核心抽象是「任务级（task-level）而非工具调用级」的人机协作，代理跨 editor/terminal/browser 三面自主工作并产出可验证工件（https://antigravity.google/ ；https://antigravity.google/docs/ide/overview/ ）。

产品家族（https://antigravity.google/product ）：

| 产品 | 形态 | 定位 |
|---|---|---|
| Antigravity 2.0 | 桌面 App（当前 v2.5.0，https://antigravity.google/docs/getting-started/ ） | 多本地代理并行管理的「command center」，独立于 IDE（https://antigravity.google/product/antigravity-2 ） |
| Antigravity IDE | 独立 agentic IDE（VS Code fork 起家，第三方：https://en.wikipedia.org/wiki/Google_Antigravity ） | agent manager + artifacts + 深度代码理解（https://antigravity.google/product/antigravity-ide ） |
| IDE Extensions | VS Code / Visual Studio 2026 / JetBrains / Zed / Xcode 扩展 | 把代理嵌入既有编辑器（https://antigravity.google/docs/ide/extensions/ ） |
| Antigravity CLI | 终端 TUI `agy` + headless/daemon | 轻量终端面（https://antigravity.google/product/antigravity-cli ） |
| Antigravity SDK | Python | 自定义代理原型/评测（https://antigravity.google/product/antigravity-sdk ） |
| Remote Control | Web 仪表盘 | 浏览器远程驱动/监控多机桌面会话（https://antigravity.google/docs/remote-control/ ） |

时间线：2025-11-18 随 Gemini 3 发布（官方发布文 https://antigravity.google/blog/introducing-google-antigravity ；blog.google Gemini 3 文 https://blog.google/products-and-platforms/products/gemini/gemini-3/ ）；2026 年演化为 2.0 重写 + 扩展/CLI/SDK 多面。注意：**v1 的「Antigravity IDE（Manager+Editor 双视图）」与 2.x 现行形态是两代产品**——2.0 文档明言 "Unlike the earlier Agent Manager, it functions independently of an IDE"（https://antigravity.google/docs/overview/ ），且 IDE 对企业客户不开放（"Antigravity IDE is not supported for enterprise customers"，https://antigravity.google/docs/ide/overview/ ）。

## 二、功能特性清单（按域分组，括号内为来源 URL，全部官方除非标【第三方】）

### 2.1 Agent 编排

- **多代理并行**：可同时开多个代理会话并行跑（https://antigravity.google/docs/agent/ ）；v1 Manager 视图是 "mission control for spawning, orchestrating, and observing multiple agents across multiple workspaces in parallel"，带 Inbox 收异步通知（发布文 https://antigravity.google/blog/introducing-google-antigravity ）。
- **Projects 项目原语**：以文件夹组圈定代理访问边界，多文件夹跨仓上下文，每项目独立设置与安全策略；安全预设 Default / Full machine / Unrestricted；授权可持久化让代理「learn trusted actions」（https://antigravity.google/docs/features/ ；https://antigravity.google/docs/getting-started/ ）。
- **Worktree 隔离**：会话可选 Local Mode 或 New Worktree Mode（隔离 git worktree，https://antigravity.google/docs/getting-started/ ）；项目原生支持 worktree 供代理后台隔离操作（https://antigravity.google/docs/features/ ）。
- **子代理体系**：内置 3 种——research（代码调研）、browser（沙箱浏览器操控，仅经 `/browser` 调起）、self（父代理克隆）；自定义子代理 = Markdown+YAML frontmatter（`.agents/agents/<name>.md` 或全局 `~/.gemini/config/agents/`），frontmatter 可指定 tools/model/mcpServers/skills；`invoke_subagent` 派生并发会话，工作区三态 inherit/branch/share；异步执行态 Running/Idle/Killed，嵌套上限 10 层；权限继承父代理（https://antigravity.google/docs/subagents/ ）。
- **/boost 多代理推理管线**：Primary Orchestrator 三阶段——目标与策略制定 → 并行子任务（实现/调查/本地验证三类工作流，各自隔离 worktree）→ 综合交付；断言失败自动回灌下一轮修正，「multi-round independent verification」；付费计划可用（https://antigravity.google/docs/boost/ ）。
- **/teamwork-preview**：多代理团队协作面向大型项目/多文件重构（https://antigravity.google/docs/slash-commands/ ）。
- **定时任务**：`/schedule` 把指令设为一次性或 cron 周期任务，固定用最新 Flash 模型，结果落侧栏可续聊（https://antigravity.google/docs/features/ ；https://antigravity.google/docs/slash-commands/ ）。
- **执行模式与评审策略**：Planning Mode（先出结构化计划工件）/ Fast Mode（直接执行）二选一（https://antigravity.google/docs/artifact-review/ ）；工件评审策略 Request Review（默认，生成计划/diff 必暂停求批）vs Always Proceed（全自动）（https://antigravity.google/docs/artifact-review/ ）。
- **Remote Control**：Web 登录 antigravity.google.com 远程驱动多机桌面会话与 CLI 实例；实例切换器选机器；移动端装 PWA 收推送；CLI 有 systemd/LaunchAgent 常驻 daemon 模式（`agy remote-control start`）（https://antigravity.google/docs/remote-control/ ）。
- **异步任务管理**：长操作（装依赖等）卸载到后台进程不阻塞 agent loop，结果实时回流（https://antigravity.google/blog/google-io-2026-feature-deep-dive ）。

### 2.2 Artifacts 工件

- **定义**："a structured deliverable created by the agent to accomplish its task and communicate its progress and thinking to the human user"——人评审里程碑级交付物而非逐个工具调用（https://antigravity.google/docs/artifacts/ ）。官方 codelab 直说工件是「弥合信任鸿沟」的证明物：「an agent creates an artifact to prove」工作完成（https://codelabs.developers.google.com/getting-started-google-antigravity ）。
- **类型清单**：现行文档列 rich markdown 计划 / code diffs / 架构图 / 图片 / 浏览器录制（https://antigravity.google/docs/artifacts/ ）；v1 发布文列 "task lists, implementation plans, walkthroughs, screenshots, and browser recordings"（https://antigravity.google/blog/introducing-google-antigravity ）；codelab 教学序即此四件套：任务清单（编码前结构化计划，可评论）→ 实现计划（技术细节送审）→ walkthrough（完工摘要+如何测试）→ diff+截图（含 UI 前后对比）（https://codelabs.developers.google.com/getting-started-google-antigravity ）。
- **工件评审**：Implementation Plan 工件带 Proceed（放行继续）与 Review（汇拢评论再反馈）双按钮，评论后代理迭代计划或开工（https://antigravity.google/docs/implementation-plan/ ）；2.0 有可视化侧栏+评审面板（交互计划/diff/录制回放），CLI 有键盘驱动面板+状态栏通知（https://antigravity.google/docs/artifacts/ ）。
- **评论反馈**：Google Docs 式行内评论 + 截图框选评论，反馈自动并入而不必打断代理（发布文 https://antigravity.google/blog/introducing-google-antigravity ）；语音转写也可用于工件评论（https://antigravity.google/docs/features/ ）。
- **面板演进（changelog）**：外部文档（Drive/PDF/Office）独立 Documents 区；SQL/JSONL 虚拟化语法高亮查看器；scratch files 折叠区；URL 工件卡内嵌预览（https://antigravity.google/changelog/ 2.13.0/2.10.0 条目）。
- **Task Groups 任务组**（IDE 专属）：Planning Mode 下把大任务拆组，每组含目标概览、已编辑文件 pill（点开看当前态）、可展开子任务步骤、末尾「待批步骤」专区（浏览器 setup/需批准终端命令）（https://antigravity.google/docs/tools/ ）。
- **Knowledge 知识库（v1 概念，现行已弱化）**：发布文称代理 "retrieving from and contributing to a knowledge base"（代码片段/架构/子任务成功步骤），可从 Agent Manager 查看（https://antigravity.google/blog/introducing-google-antigravity ）。**现行文档站无 Knowledge 页、changelog 全文零命中**——2.x 未见对应物；相近替代是 `/learn` 命令："Distills session feedback and corrections into persistent Rules or Skills"（https://antigravity.google/docs/slash-commands/ ）。判定：三分离中的 Knowledge 在现行产品已转为 Rules/Skills 沉淀机制。

### 2.3 浏览器控制

- **能力**："can open, read, and actuate a local Chrome browser"——测试 dev 站点、读文档、自动化浏览器任务；由专职 **Browser Subagent** 操作标签页，"capturing screenshots and saving action videos as interactive artifacts"；`/browser` 按需调起；与 Chrome DevTools MCP 集成；录制为 webm（https://antigravity.google/docs/ide/browser/ ；https://antigravity.google/docs/features/ ）。
- **安全三层**：Denylist+Allowlist 双层 URL 管控（https://antigravity.google/docs/ide/allowlist-denylist ，经 browser 页链接）；代理跑在完全独立的 Chrome profile 隔离个人数据（https://antigravity.google/docs/ide/separate-chrome-profile ，经 browser 页链接）；浏览器工具可在设置里整体关闭（https://antigravity.google/docs/ide/browser/ ）。
- **验证用途**：发布文示例——代理写前端代码、终端起 localhost、再「actuate the browser to test that the new feature works」（https://antigravity.google/blog/introducing-google-antigravity ）；Gemini 3 发布文：代理 "validates its execution through browser-based computer use"，与 Gemini 2.5 Computer Use 模型 + Nano Banana 图像模型配套（https://blog.google/products-and-platforms/products/gemini/gemini-3/ ）。
- codelab：`/browser` 起浏览器子代理与 Chrome 调试会话（需 Chrome 为默认浏览器），浏览站点逐动作请求权限（https://codelabs.developers.google.com/getting-started-google-antigravity ）。

### 2.4 验证体系

- **范式承诺**：代理 "thoroughly think[ing] through verification of its work, not just the work itself"——验证与工作本身同级（发布文 https://antigravity.google/blog/introducing-google-antigravity ）；Gemini 3 文："autonomously plan and execute complex, end-to-end software tasks... while validating their own code"（https://blog.google/products-and-platforms/products/gemini/gemini-3/ ）。
- **落地机制**（现行文档可考的三条）：① 工件即证据（diff/截图/录制/walkthrough 供人验证）；② Task Groups 的待批步骤专区把浏览器/终端动作收敛到评审位（https://antigravity.google/docs/tools/ ）；③ /boost 的本地验证工作流（build/测试套件）+ 断言失败自动回灌修正 + 多轮独立验证（https://antigravity.google/docs/boost/ ）。
- **Verification Center（Deductive/Inductive verification）：未能获取一手来源。**现行 docs 站无 verification 页、changelog 与 FAQ 全文检索零命中（https://antigravity.google/changelog/ ；https://antigravity.google/docs/faq/ ）；已抓的 blog.google Gemini 3 发布文、The Verge/TechCrunch/Ars Technica 发布日报道（https://www.theverge.com/news/822833/google-antigravity-ide-coding-agent-gemini-3-pro ；https://techcrunch.com/2025/11/18/google-launches-gemini-3-with-new-coding-app-and-record-benchmark-scores/ ；https://arstechnica.com/google/2025/11/google-unveils-gemini-3-ai-model-and-ai-first-ide-called-antigravity/ 【均第三方】）均未出现该术语。blog.google 多个候选 URL 404、Wayback 503，无法回溯 v1 文档。推断为 v1 时代概念、2.0 重构后未沿用或更名——此推断本身无一手锚点，如实存疑。

### 2.5 编辑器基础

- **IDE 编辑面**：Tab 自动补全（"high-speed intelligent code completion"）、自然语言代码命令、可配置上下文感知代理（https://antigravity.google/product/antigravity-ide ；https://antigravity.google/docs/ide/overview/ ）。
- **Agent Side Panel**：侧栏内开新会话、贴图、切代理模式、选模型；输入框上方工具栏实时显示「打开的文件变更、运行中的终端进程、工件」（https://antigravity.google/docs/ide/agent-side-panel/ ）。
- **扩展矩阵**：VS Code（≥1.90，Marketplace 官方扩展，首启自动装本地 agy 后端，https://antigravity.google/docs/ide/extensions/vscode/ ）、Visual Studio 2026、JetBrains、Zed、Xcode 五家；统一账号体系跨面共用（https://antigravity.google/docs/ide/extensions/ ）。**「迁移自 VS Code」**：v1 IDE 本身是 VS Code/Windsurf fork（fork 争议见【第三方】https://en.wikipedia.org/wiki/Google_Antigravity 、https://visualstudiomagazine.com/articles/2025/11/21/googles-antigravity-ide-sparks-forking-debate.aspx ）；2.x 现行文档**无** VS Code 设置/键位导入页——路线已变为「扩展嵌入」而非「迁移」。
- **快捷键**：⌘K 会话选择器、⌘P 文件搜索、⌘L 聚焦输入、⌘N 新会话、Alt+↑/↓ 切会话（https://antigravity.google/docs/getting-started/ ）；Alt+J 传送回等待中的子代理（https://antigravity.google/docs/subagents/ ）。
- **集成终端**：侧栏终端，Ctrl/Cmd+`（https://antigravity.google/docs/features/ ）。
- **VCS 面板**：未提交 diff、分支 diff、代理编辑三视图；stage/unstage/discard；提交（自动生成 message）与 push（https://antigravity.google/docs/features/ ）。

### 2.6 模型与 MCP

- **模型矩阵**：Gemini 3.1 Pro、Gemini 3.8/3.7/3.6 Flash（全套餐+企业）；Claude Sonnet 4.6 (thinking)、Claude Opus 4.6 (thinking)、GPT-OSS-120b（个人各档可用，企业不可用）（https://antigravity.google/docs/models/ ）。发布时档位：Gemini 3 + Claude Sonnet 4.5 + GPT-OSS，限额每 5 小时刷新（https://antigravity.google/blog/introducing-google-antigravity ）。
- **切换语义**：提示框下模型下拉；每模型可调推理档位（Low/Medium/High）；选择在会话内粘性（sticky），运行中切换下一轮生效；选择器内嵌 Weekly/Five-Hour 余量双仪表（Gemini 与 Claude+GPT 分开计）（https://antigravity.google/docs/models/ ）。
- **图像模型**：Nano Banana 2 驱动 UI mockup/网页填充/架构图生成，不可换（https://antigravity.google/docs/models/ ）。
- **MCP**：MCP Store 内置 56 个服务器（数据库/CI-CD/前端设计/安全/分析类，GitHub、Linear、Figma、Chrome DevTools 等）可搜索一键装；配置双作用域 `~/.gemini/config/mcp_config.json`（全局）+ `.agents/mcp_config.json`（工作区）；传输 stdio `command` 或 `serverUrl`（Streamable HTTP/SSE）；认证三通道 ADC（google_credentials）/ OAuth（动态注册或 clientId+Secret）/ headers；`disabledTools` 可对模型隐藏单工具；权限模式 `mcp(server/tool)`、`mcp(server/*)`、`mcp(*)`，默认 Ask 逐次批准（https://antigravity.google/docs/mcp/ ）。

### 2.7 其他（安全/扩展生态/输入）

- **Terminal Sandbox**：OS 级沙箱免 VM/Docker——Linux namespace 隔文件系统/进程/网络，macOS Seatbelt（sandbox-exec）；`~/.ssh`、`.env` 屏蔽，网络默认禁、经 `read_url` 域白名单放行；预设 Default/Request Review/Turbo；`unsandboxed(git push)` 类逃生规则；Windows 为 opt-in 预览（https://antigravity.google/docs/sandbox/ ）。
- **Skills**：agentskills.io 开放标准；SKILL.md（frontmatter description 必填）+ scripts/examples/resources；渐进披露三阶段（Discovery 只见名/描述 → Activation 读全文 → Execution 执行）；作用域 workspace `.agents/skills/` / 全局 `~/.gemini/config/skills/` / 插件；CLI 技能自动变 slash 命令（https://antigravity.google/docs/skills/ ）。
- **Hooks**：代理周期关键点（工具调用前后/模型响应前后/循环停止条件）跑本地 shell 脚本；全局+工作区 JSON 配置，工作区优先（https://antigravity.google/docs/features/ ；https://antigravity.google/blog/google-io-2026-feature-deep-dive ）。
- **Slash 命令集**：/boost、/teamwork-preview、/goal（直达目标不中断）、/plan（只出计划工件）、/grill-me（先反问澄清）、/learn（沉淀为 Rules/Skills）、/schedule、/browser、/btw（后台旁路提问）（https://antigravity.google/docs/slash-commands/ ）。
- **语音转写**：Ctrl+M 实时转写、smart cleanup 修口语、上下文感知术语（https://antigravity.google/docs/features/ ）。
- Plugins / Rules-Workflows / Sidecars：文档站有专区（sitemap 见 https://antigravity.google/docs/getting-started/ 导航），详情页本轮未抓。
- WSL：所有已抓官方页均未提及 WSL 支持（发布文与 remote-control 页均无）——任务点中的「WSL」未能获取，远程能力以 Remote Control 形态存在（见 2.1）。
- 计划与配额：/pricing、AI credits、5 小时窗口（https://antigravity.google/ ；https://antigravity.google/docs/models/ ）。

## 三、与我方 IDE 差距对照（基线 overlay/custom/client/ide 15 views，判定沿用 zcode.md 符号 ≈/→/×）

| Antigravity 能力 | 我方现状 | 裁决 |
|---|---|---|
| Manager/多代理并行编排 + Inbox 异步通知 | IdeTaskSidebar 多任务 + IdeSubagentsFloat 单流浮窗 | →：缺任务级「指挥中心」聚合视图与代理间消息回汇 |
| 子代理三种内置角色 + 自定义 md 子代理 + 目录/状态 | IdeSubagentsFloat（chatStore.subagentStreams） | →：无目录视角与 Running/Idle 状态机（zcode.md P0-2 同源，合流推进） |
| Artifacts 一等公民：计划/diff/截图/录制/walkthrough 统一评审 + 行内评论 + Proceed 门 | IdePlanFloat（计划浮窗）+ RunTrace 模态 + 审批门在工具调用级 | →：**工件未成体系**——无证据类工件（截图/录制）、无工件级评论与放行门 |
| Task Groups（计划模式任务分组+文件 pill+待批专区） | IdeTaskSidebar 分组（任务维度）+ IdeTaskContextBar | ≈ 结构上平手，→ 语义上缺「每组编辑文件清单+待批收敛」 |
| Knowledge 知识库 / /learn 沉淀 | IdeMemoryPane + IdeWikiPane | ≈ 有载体，→ 缺「代理自动检索/贡献」闭环与会话反馈自动沉淀链路 |
| Browser Subagent：截图/录制工件 + allowlist/denylist + 独立 profile | IdeSidePane browser tab（复用 DesktopBrowserView，人用为主） | →：无代理驱动回路、无安全层、无证据产出（zcode.md §6.1 已判 browser-use ≈，本轮 Antigravity 侧证据抬高价值） |
| 验证体系：工件即证据 + /boost 断言回灌 + 待批专区 | 审批门（Permission 浮层）≈ Request Review 策略 | →：缺「agent 自验证产物」范式；审批粒度在工具级不在里程碑级 |
| 模型切换：下拉+推理档位+粘性+余量双仪表 | 模型配置在 hermes 侧（/ide 无选择器） | →：会话内模型切换器+档位（我方遥测面板已有余量原料） |
| MCP Store 56 源一键装 + disabledTools + 权限模式 | IdeMcpPane 表单 CRUD + 对话式配置（✅M3） | ≈ 管理面平手，→ 缺目录化安装与工具级禁用 |
| Skills/Hooks/Rules 工作台入口 | 无（zcode.md P0-3 已记） | →：跨调研同判，维持 |
| /goal /grill-me /learn /btw 命令语义 | ChatInput slash（静态+cmd:mcp-config） | →：缺任务形态类命令 |
| 定时任务（cron 会话+侧栏回流） | 跳 hermes.jobs（zcode.md P2-29 已记） | →：维持 |
| Terminal Sandbox（OS 级） | node-pty 直连 | ×/→：后端重投入，价值取决于安全定位 |
| Remote Control（Web 驱动桌面会话） | 我方本来就是 Web 工作台 | × 不适用：形态反置——这是我们相对 Antigravity 桌面版的天然优势 |
| IDE 扩展矩阵（嵌入五编辑器） | 无 | ×：产品形态不同，不做 |
| 语音转写 | 无 | → backlog |

## 四、建议对齐项（P0-P2，价值/成本各一句）

**P0**

1. **证据型工件（截图/录制/diff 卡）挂任务里程碑**。价值：Antigravity 信任范式的核心是「交付可验证证据」，我方 browser tab 与 RunTrace 已有原料，只缺「以工件形态归档到任务」的通道。成本：中——前端新增工件列表+详情，hermes 侧复用 run-trace 产物通道补截图/录制事件。
2. **计划工件升级为可评审对象（行内评论 + Proceed/Review 双按钮）**。价值：把审批从工具调用级升到计划级，直接对齐 Request Review 策略，长任务人机协作体验质变。成本：低-中——IdePlanFloat 加评论流与放行事件，后端会话恢复语义小改。
3. **任务组语义（每组 edited-files 清单 + 待批步骤专区）**。价值：Antigravity Task Groups 证明「组内文件可点开+待批收敛一处」是长任务可读性的关键形态。成本：中——IdeTaskSidebar/IdeChatPane 数据结构加分组维度，审批流已具备。

**P1**

4. 子代理目录+Running/Idle 状态+快捷跳转（zcode.md P0-2 合流）。价值：多代理巡览刚需；成本：低，subagentStreams 数据已在。
5. 浏览器安全层（URL allowlist/denylist + 独立 profile/上下文隔离）。价值：代理驱动浏览器的前提护栏；成本：中，需 hermes 侧浏览器驱动通道先落地（与第 6 项捆绑）。
6. 代理驱动浏览器回路（browser subagent 语义：截图→动作→录制回流工件）。价值：前端验证自动化+证据工件的上游；成本：高，涉及 agent 工具协议与 CDP 链路。
7. 会话内模型切换器（下拉+粘性+推理档位+余量仪表）。价值：高频操作入口缺位，遥测面板已有用量数据；成本：低-中，前端为主。
8. 任务形态 slash 命令（/goal /grill-me /btw /learn 语义）。价值：一行提示词即可切换协作形态，/learn 同时补 Knowledge 闭环；成本：低-中，前端命令+hermes 提示词模板。
9. /learn 沉淀闭环（会话反馈→规则/技能/记忆）。价值：Antigravity 用 /learn 替代了 v1 Knowledge 面，我方记忆+wiki 载体现成；成本：中，需反馈信号采集与沉淀管道。

**P2**

10. MCP 目录化安装 + disabledTools 工具级禁用。价值：降低 MCP 接入门槛；成本：中，目录数据源+安装编排。
11. /boost 式多代理推理管线 UI。价值：疑难任务并行验证的高阶形态；成本：高，hermes 工作流可承接但编排语义重。
12. Terminal 沙箱、语音、定时任务编辑视图。价值：安全/输入/自动化各有场景但非当前主矛盾；成本：高（沙箱）/中（语音、定时）。
