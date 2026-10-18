# 四款 AI 编程/工作产品最新版本与完整能力盘点

研究日期：2026-10-18。下文所有 URL 均为当日访问。优先使用官方文档、官方更新日志与官方产品页；官方页面无法抓取正文时，改用官方云文档或主流媒体，并在正文中标注证据等级。无法确认的事实一律标“未证实”，不推测。

## 0. 先给结论

1. OpenAI 已把 Codex 桌面应用并入 ChatGPT 桌面应用，形成 Chat、ChatGPT Work、Codex 三个模式。Work 和 Codex 能力高度重叠、共享用量；差别主要在表达方式与界面，Work 隐藏 Git、shell、diff 等开发者表面，Codex 保留 diff、PR 审查、worktree 等技术表面。因此 Work 不是能力孤岛，而是同一应用内更偏非技术表达与交付的模式；官方未披露两者是否共用同一底层引擎。
2. Google Antigravity 2.x 是独立的 agent 工作台，没有 coding/work 模式开关。代码任务与非代码任务共用项目、artifacts、权限和调度体系；编程入口主要由 IDE 扩展承担，工作台本身是“agent 指挥中心”。
3. Qoder 在同一工作台内提供显式的“编程模式/通用模式”切换：编程模式以 workspace 为边界，带分支、worktree、代码 diff；通用模式以 folder 为边界，面向研究、文档、内容等任务。两者共用任务引擎、权限、执行器和自动化。
4. 腾讯的 CodeBuddy 与 WorkBuddy 是两条并存的产品线，不是简单更名：CodeBuddy 是编程套件（插件、IDE、CLI），WorkBuddy 是全场景 AI 工作台（桌面端、小程序、移动端、企业版）。WorkBuddy 的“模式”是自主性等级（默认 Agent、计划 Plan、仅问答 Ask），不是“编程/通用”的领域切换；它也能做代码任务，并可把工作区交接给 CodeBuddy。
5. 四家共同收敛出的工作台能力是：任务化会话、隔离执行、分级权限与审查门、计划/产物评审、上下文与记忆、多智能体编排、终端/Git/浏览器工具、MCP/技能/插件扩展、自动化、远程与协作。

---

# 1. OpenAI：ChatGPT + Codex

## 1.1 最新版本与来源

| 项目 | 版本/日期 | 来源 |
|---|---|---|
| ChatGPT/Codex 桌面应用 | 26.1007，2026-10-08（changelog 仍以 “Codex app” 条目发布） | [O1] |
| Codex CLI | 0.163.0，2026-10-15 | [O1] |
| Codex IDE 扩展 | 官方未公布版本号（未证实） | [O10] |
| Work 模式发布 | 2026-07-06 至 07-10 当周 | [O2] |
| Codex 应用并入 ChatGPT 桌面应用 | 2026-07-09 | [O2] |
| Codex 应用 macOS 首发 | 2026-02-02 至 02-06 当周 | [O2] |
| Automations 正式可用 | 2026-03-12 | [O2] |
| Plugins 发布 | 2026-03-23 至 03-27 当周 | [O2] |

来源：
- [O1] https://learn.chatgpt.com/docs/changelog
- [O2] https://learn.chatgpt.com/docs/whats-new
- [O10] https://learn.chatgpt.com/docs/codex/ide

## 1.2 产品形态

- 统一桌面应用：macOS、Windows；Linux 于 2026-08-10 至 08-14 当周进入预览。[O2]
- Web 与移动端：Work 可在 web/mobile 使用；移动端可启动 Codex 任务、审批动作。[O3][O7]
- Codex CLI：终端形态，支持交互与 `codex exec` 非交互执行，可用于脚本与自动化。[O1][O10]
- Codex IDE 扩展：VS Code 及兼容编辑器（Cursor、Windsurf、VS Code Insiders）；Xcode、JetBrains 由各自集成提供 Codex。[O10]
- Codex Cloud：云端任务与环境。[O7]
- 硬件：Codex Micro 可用硬件键盘控制聊天。[O4]

## 1.3 任务/会话模型

- 以 Projects 和 Chats 组织上下文；项目可包含多个本地文件夹（2026-07-20 至 07-24 当周）。[O2][O3]
- Codex 侧有 Command Center，可把任务固定到共享的 Pinned 组，跨启动保留（CLI 0.162.0）。[O1]
- 并行任务：每个任务独立工作区；云端任务各有自己的 workspace，可共享同一环境的依赖安装结果。[O7]
- 本地并行：托管 Git worktree，每个聊天通常独占一个 worktree；聊天被交回时回到同一 worktree。默认放在 `$CODEX_HOME/worktrees`，保留最近 15 个，删除前保存快照并可恢复。[O8]
- Local 与 Worktree 可安全 Handoff；忽略文件不会随迁，除非写入 `.worktreeinclude`。[O8]
- 长任务：Work 支持 long-running work；Cloud 任务在电脑休眠时仍可继续，关闭桌面应用后云端任务仍可运行。[O3][O7]
- 侧会话：`/side` 会话在切换线程后仍保留（CLI 0.163.0）。[O1]
- 子代理线程：每个子代理有独立 agent thread，可在支持的客户端中打开查看进度与结果。[O13]

## 1.4 执行模式与审批

### 三个应用模式

- Chat：日常问答、搜索、头脑风暴、起草。[O3]
- ChatGPT Work：给定结果目标，由 agent 规划、收集上下文、调用工具，交付成品；偏好非技术语言和完成态输出；隐藏 Git、shell、diff 等细节；没有 PR 面板；没有 Quick chat；可运行代码和 shell，可使用代码审查与仓库。[O3]
- Codex：面向开发项目，显示 diff 与审查视图，支持 PR 面板、Quick chat 等开发者表面。[O3]

Work 与 Codex 的关系：官方明确说两者“能力重叠”，共享用量限制；Codex 也能做研究、文档、演示和知识工作。Work 的差异主要是界面与沟通风格，不是独占能力。[O3]

### 本地、worktree、云端

- Work 在 Web 上运行于托管云环境；桌面端可在 Cloud（隔离托管环境，关闭应用后任务继续）与 Local（使用本机文件、应用、浏览器）之间选择，具体取决于账号或工作区设置。[O3]
- Codex Cloud：先创建或选择环境（仓库、工具、访问权限），环境需发布后才能启动任务；每个任务独立 workspace；完成后检查变更与测试结果，再提交或开 PR。[O7]
- 本地/Worktree：新聊天选择 Worktree、起点分支即可创建；可在 worktree 中建分支、提交、推送、开 PR，也可 Handoff 回 Local。[O8]

### 权限与审查

- 权限模式：`read-only`、`workspace-write`、`full access`；定时任务默认使用你的默认沙箱设置，`full access` 下可无人值守改文件、跑命令、联网。[O5]
- Auto-review：用一个独立 reviewer agent 替代人工审查沙箱边界请求；主 agent 的审批策略与网络/文件限制不变，官方称其为“reviewer swap, not a permission grant”。[O14]
- Auto-review 覆盖：请求提升沙箱权限的 shell/exec、被策略阻断的网络请求、写出可写根之外的文件、需要批准的 MCP/app 工具调用；沙箱内已允许的常规动作不触发。[O14]
- 审批门：仅适用于交互式审批策略；`approval_policy = "never"` 时没有可审查对象；连续 3 次拒绝或最近 50 次审查中 10 次拒绝会中断回合；`/approve` 可对精确被拒动作重试一次，但仍走 Auto-review。[O14]
- Computer Use：macOS/Windows，Work 与 Codex 均可用；安装 Computer Use 插件，macOS 需屏幕录制与辅助功能权限；使用应用前需批准，可“Always allow”。Windows 只能前台操作；macOS 支持后台限定任务与锁屏使用。不能自动化终端应用或 ChatGPT 自身。[O6]

## 1.5 上下文、记忆与规则

- 上下文来源：上传文件、Projects、memories、ChatGPT Library、插件、连接器、浏览器、Computer Use、appshots。[O3]
- 规则：`AGENTS.md`；worktree 会自动复制被忽略的 `AGENTS.override.md`。[O8]
- Worktree 初始化文件：`.worktreeinclude` 复制被忽略的环境文件（如 `.env`）。[O8]
- 技能与插件：插件可打包 Skills、MCP servers、浏览器扩展、Hooks；Chat/Work 与 Codex 共用一个插件目录。[O11]
- Hooks 可注入上下文、阻断提示、自动总结到记忆、按目录调整提示词。[O12]
- Composer predictions（beta）：根据当前线程建议下一条消息，Tab 接受为草稿（2026-10-09）。[O1]

## 1.6 多智能体与编排

- 子代理：内置 `default`、`worker`、`explorer`；自定义代理为 TOML，放在 `~/.codex/agents/` 或 `.codex/agents/`；可配置模型与推理强度；不能覆盖父级的 sandbox、approval、model provider、MCP servers。[O13]
- 并行：Codex 负责派生、路由后续消息、等待和关闭线程；等所有结果到齐后合并返回；写密集型并行编辑有冲突风险。[O13]
- 入口：Codex CLI/IDE/app 默认启用；ChatGPT Work（web）对符合条件账号开放，侧栏只读，不能单独停止或操控某个子代理；Ultra 可主动委派。[O13]
- Dots：跨聊天持续工作的持久 agent，逐步开放。[O2]
- Team Tasks 与 ChatGPT Space：DevDay 2026 宣布，Space 是共享文件、Pages 与协作者的工作区。[O2]

## 1.7 工具层

- 终端与文件：Codex 可读集成终端；CLI 支持 shell、文件编辑、搜索；Work 可运行代码与 shell。[O2][O3]
- Git：worktree 创建/列出、分支、提交、推送、PR；Codex 桌面端有 Changes 面板；PR 收件箱按 Assigned to me/team、Authored by me 组织。[O1][O8][O9]
- 浏览器：内置浏览器、Chrome 扩展（跨标签页）、浏览器 Developer mode（Chrome DevTools Protocol，2026-06-08 至 06-12 当周）。[O2][O4]
- Computer Use：见 1.4。[O6]
- 搜索：Web search；图像生成与图像输入；appshots。[O4]
- MCP：插件可包含 MCP servers；CLI 有 `/mcp login`、MCP prompts、OAuth 等。[O1][O11]
- Hooks：生命周期事件包括 PreToolUse、PermissionRequest、PostToolUse、PreCompact/PostCompact、UserPromptSubmit、SubagentStop、Stop、Interrupt、SessionStart、SubagentStart、SessionEnd；支持 command 与 mcp_tool handler。[O12]
- 插件在 IDE 扩展中不可用；插件 hooks 在云编排的 Work 中不支持。[O11]

## 1.8 审查、验证与产物

- Code Review 内置于桌面应用，可从插件固定到侧栏；Web 的 Work 可上传代码或通过 source 插件访问；CLI `/review` 生成专用 reviewer，读取 diff 并给出按优先级排序的发现，不改工作树；IDE `/review` 支持对基线分支或未提交变更审查。[O9]
- PR 审查：GitHub 已正式可用，GitLab 合并请求为预览；支持 `@codex review` 或自动 MR 审查；Submit review 可选 Comment、Approve、Request changes；聊天中审查不会自动发评论、批准或合并。[O9]
- 自动审查：配置 ChatGPT Codex connector、仓库权限并开启自动审查后，Codex 可在你打开 PR 前审查，评论出现在 GitHub 与 Code Review；云审查不需要创建云环境。[O9]
- 安全审查：Codex Security Review 研究预览（2026-08-03 至 08-07 当周）；Codex Security Cloud 研究预览（DevDay 2026）。[O2]
- 产物：Work 可生成文档、演示、表格、PDF、图片、可视化、Sites/应用；Codex 输出 diff、测试结果、PR。[O3][O7]
- 审查结果：桌面端审查面板覆盖 Unstaged、Staged、Commit、Branch、Last turn；支持多仓库项目。[O9]

## 1.9 自动化与调度

- Automations/Scheduled tasks：可创建独立任务或在聊天内运行；支持分钟级间隔、每日/每周、RFC 5545 RRULE；可组合 skills。[O5]
- Web：从 Chat 或 ChatGPT Work 创建；可用上传上下文与连接工具，但不能直接操作本机文件夹；运行之间不保留本地文件夹或 worktree。[O5]
- 桌面：可在项目目录或隔离 worktree 中运行；需要本机文件时必须保持电脑开机、应用运行。[O5]
- CLI/IDE：不提供任务管理，只能帮助准备和测试 prompt/skill/script。[O5]
- 事件触发：Gmail（新邮件，可按发件人/主题过滤）、Slack（选定频道新消息）、GitHub（PR 活动）；仅在 web/mobile 可用，桌面/CLI/IDE 不支持；事件触发不能与时间计划组合。[O5]
- 云端：可复用 cloud environments；任务在电脑休眠时继续；完成后可提交或开 PR。[O7]

## 1.10 协作、分享与远程

- ChatGPT Space：共享文件、Pages 与协作者。[O2]
- Sites：创建、发布、分享站点；Site 协作编辑、可编辑 URL、共享线程快照（2026-08-17 至 08-21 当周）。[O2][O4]
- Work sync：桌面开始的任务可在 web/mobile 继续；跨设备 Work（2026-09-28 至 10-02 当周）。[O2]
- 移动远程：手机启动任务、审批动作；Remote 可把移动端连接到 Mac；Windows 远程连接（2026-05-25 至 05-29 当周）。[O2][O4]
- 语音：ChatGPT Voice 在 Chat、Work、Codex 中可用；支持文件与 Projects（2026-08-03 至 08-07 当周）。[O4][O2]
- Codex Micro：硬件控制面。[O4]

## 1.11 编码模式 vs 工作模式（OpenAI）

| 维度 | Codex（编码模式） | ChatGPT Work（工作模式） |
|---|---|---|
| 对象 | 代码仓库、开发项目 | 结果目标、文档/表格/演示/站点 |
| 默认表面 | diff、Changes、PR、终端、worktree | 成品文件、可视化、Sites、浏览器 |
| 技术细节 | 显示 Git、shell、实现细节 | 隐藏 Git、shell、diff；非技术语言 |
| 专属/缺失 | 有 PR 面板、Quick chat | 无 PR 面板、无 Quick chat |
| 执行位置 | 本地、worktree、cloud | web 云端；桌面可选 Cloud 或 Local |
| 审批 | 沙箱 + approvals + auto-review | 同一套沙箱/审批；长任务可审批 |
| 关系 | 共享用量；Codex 也能做研究与文档 | 能力与 Codex 重叠，非独立引擎 |

结论：OpenAI 的 “Work” 是表达层与交付层，不是能力孤岛；真正的领域区分是“是否暴露代码/仓库表面”。“Code mode” 在应用层对应 Codex；CLI 内另有 Code Mode（JS cell 执行），changelog 0.162.0/0.163.0 提到 Code Mode cells 与 Code Mode 内的工具搜索，但官方没有独立文档页。[O1][O3]

---

# 2. Google Antigravity

## 2.1 最新版本与来源

| 项目 | 版本/日期 | 来源 |
|---|---|---|
| Antigravity App | 2.24.0，2026-10-15 | [A1] |
| Antigravity CLI（agy） | 1.4.0，2026-10-16 | [A1] |
| Antigravity 2.0 | 2026-05-19（v2.0.1 标注 “Antigravity 2.0 Launch bug fixes”） | [A1] |
| IDE 扩展 | 与 App/CLI 分开版本；官方 changelog 未给出扩展版本号（未证实） | [A1][A3] |

来源：
- [A1] https://antigravity.google/docs/changelog
- [A2] https://antigravity.google/product/antigravity-2
- [A3] https://antigravity.google/docs/overview

## 2.2 产品形态

- Antigravity App：独立桌面应用，macOS、Windows、Linux、Googlebook；2.0 以独立 App 形态发布，与 IDE 扩展并存，定位为 agent 指挥中心。[A2][A3]
- Antigravity CLI：`agy`；支持交互与 headless daemon，可被 Remote Control 驱动；官方提供从 Gemini CLI 迁移的指引。[A3][A10]
- IDE 扩展：VS Code、Visual Studio、JetBrains、Zed、Xcode 五个宿主。[A3]
- Python SDK：3.10+，用同一 agent harness 构建自定义 agent。[A3]
- 企业：SSO/BYOID、美国/欧盟数据驻留、VPC-SC、Cloud Audit Logging、不训练数据保证。[A3]

## 2.3 任务/会话模型

- Projects：对话按项目组织，项目可跨多个文件夹；支持自定义设置与按项目限定的权限；项目默认继承全局权限预设。[A2][A4]
- Agent Manager：启动、监控、编排多个并行 agent 的中心。[A2]
- 项目外会话：一次性会话在隔离的本地 scratch 文件夹中运行。[A4]
- 异步任务：长命令后台运行，主 agent 不被阻塞；支持动态子代理。[A2]
- 并行隔离：多个后台 agent 在隔离的 Git worktree 中运行。[A3]
- Worktree：项目支持 Git worktree；环境选择器会记住上次使用的 worktree（v2.5.0）。[A4][A1]
- 调度：Scheduled Tasks，cron 风格，分钟级精度；v2.21.1 改名为 Automations；v2.24.0 支持为自动化选择模型。[A2][A1][A4]
- 会话管理：归档会话视图（v2.18.1）；侧栏拖拽（v2.22.0）；全屏媒体查看器与 `.zip`/文件夹附件（v2.23.0）。[A1]

## 2.4 执行模式与审批

### 规划与推理命令

- `/plan`：多阶段规划与发现流程；先读代码、调用图、依赖，不提前写代码；需求不清时提出针对性问题；产出 Implementation Plan artifact，包含任务拆解与验证检查点；可在评审面板逐段反馈；是否在计划处暂停由项目的 artifact review policy 决定；点击 Proceed 后按计划执行，并用测试验证每个里程碑。[A7]
- `/boost`：多 agent 深度推理，面向并发 bug、算法优化等，付费计划可用。[A7]
- `/teamwork-preview`：协作 agent 团队，面向长迁移等，付费计划可用。[A7][A9]
- `/grill-me`：苏格拉底式设计访谈。[A7]
- `/browser`：浏览器子代理。[A8]
- 官方没有名为 “fast mode” 的模式；速度维度由模型与 thinking level 控制（overview 提到 low/medium/high），定时任务固定使用 Gemini 3.8 Flash。[A3][A4][A7]

### 权限与审批

- 统一权限引擎：每个敏感操作表示为 `action(target)`；规则分为 Deny、Ask、Allow，冲突按 Deny > Ask > Allow 解析。[A6]
- App 预设：
  - Default：启用沙箱；终端命令在沙箱内运行，越界时询问；工作区 + 临时目录；MCP/web 默认 Ask。[A6]
  - Request Review：无沙箱；每条终端命令都询问；仅工作区文件；MCP/web Ask。[A6]
  - Turbo：无沙箱；终端不受限；全文件系统；MCP/web 允许。[A6]
- 动作类型：`read_file`/`write_file`、`read_url`/`execute_url`、`command`、`mcp`、Windows 专用 `unsandboxed`；支持通配符与正则。[A6]
- 命令安全例外：子 shell、反引号、花括号展开、重定向、非字面量命令名等会关闭前缀匹配，只能整行精确/正则匹配或询问。[A6]
- 审批卡：文件/URL/MCP 请求可扩大目标范围（如文件扩到父目录），扩大后的授权在当前回合有效；终端命令不能扩范围。[A6]
- Plan Review Policy：v2.17.0 引入，控制计划是否需要人工批准。[A1]
- Windows 仍使用旧权限模型，部分差异（如 `unsandboxed(...)`）。[A6]

## 2.5 上下文、记忆与规则

- 规则文件、Skills（`SKILL.md`）、MCP、项目设置、artifacts 共同构成上下文。[A11][A12][A3]
- 官方文档未见 Repo Wiki 或独立长期记忆系统；项目知识主要通过规则、skills、artifacts 与代码本身传递。[A3][A12]
- Skills：文件夹 + `SKILL.md`，YAML frontmatter 中 `description` 必填；渐进式披露（先看名称/描述，再读全文）；工作区 `.agents/skills`，全局 `~/.gemini/config/skills`；CLI 支持插件提供的 skills 与 `/skill-name` 调用。[A12]
- MCP：stdio 用 `command`，远程用 `serverUrl`（Streamable HTTP/SSE）；支持 OAuth、Google ADC、headers；未配置的 MCP 工具默认 Ask；App 有 MCP Store。[A11]
- Hooks：`hooks.json` 可放工作区 `.agents/hooks.json` 或全局 `~/.gemini/config/hooks.json`；支持 SessionStart、PreToolUse、PostToolUse、PreInvocation、PostInvocation、Stop；PreToolUse 可 allow/auto_approve/deny/ask/force_ask/deny_unless_prior_grant，并可 overwrite 参数或调整权限；Stop 可返回 continue 让 agent 继续。[A13]

## 2.6 多智能体与编排

- 动态子代理：主 agent 按需定义并实例化子代理，处理并行子问题，避免污染主上下文。[A2]
- 子代理可直接对话；有实时子代理卡片（v2.16.0/v2.19.1）。[A1]
- Teamwork（预览，付费计划，App 与 CLI）：
  - 动态组队，按任务调整角色、验证深度与团队构成。[A9]
  - 两阶段：主 agent 先做结构化访谈，产出可审阅的 prompt artifact；确认后进入自主执行。[A9]
  - 角色：Sentinel 路由任务并生成最终 auditor；Project Orchestrator 拆分里程碑、分配文件、在里程碑之间交接给新的继任者；Explorers 只读研究；Workers 在互不重叠的轨道实现；Critic 代码审查；Challenger 对抗性测试；Auditor 校验完整性与真实测试输出；Success Auditor 做端到端验收。[A9]
  - 隔离：工作目录默认 `~/teamwork_projects/{PROJECT_NAME}`；每个子代理有私有 scratch 目录；文件独占所有权，多个 worker 不会同时改同一文件。[A9]
  - 有轻量 “Iterative coding” 路径，适合小型任务。[A9]

## 2.7 工具层

- 终端：内置终端、终端分屏（v2.11.0）。[A4][A1]
- Git：VCS 面板可审查未提交、分支、agent diff；支持 stage/unstage/discard、提交（自动生成消息）、推送。[A4]
- 浏览器：`/browser` 子代理驱动 Google Chrome，通过 Chrome DevTools MCP 操作；支持导航、标签页、点击/拖拽/输入/上传、控制台与网络请求、截图、性能 trace、Lighthouse、堆快照、视口/网络/CPU 模拟；每次会话录制 WebM 并存入 artifacts；不在 IDE 中可用；执行页面 JS 默认需要批准，其他浏览器工具自动允许。[A8]
- MCP：App/IDE 有 MCP Store；CLI `/mcp` 管理器；支持按工具禁用。[A11]
- Skills、Hooks、插件市场（v2.18.1 引入 Customizations 标签与插件市场）。[A12][A13][A1]
- 语音：实时转写，麦克风按钮或 Ctrl+M；支持 agent 输入与 artifact 评论。[A4]

## 2.8 审查、验证与产物

- Artifacts 定义：agent 为完成任务、沟通进度与思考而产出的结构化交付物；示例包括 Markdown 实施计划、代码 diff、架构图、图片、浏览器录像。[A5]
- 生成时机：主要在 Planning 模式生成；App 与 CLI 都支持。[A5]
- 评审：App 侧栏与评审面板可检查交互式计划、可视化 diff、回放浏览器录像；CLI 有键盘驱动的评审面板，需要批准时终端状态栏出现通知；agent 可在中间里程碑暂停请求评审；可对计划内联文字反馈，再决定是否改本地文件。[A5]
- 验证报告：overview 提到 artifact review、verification reports。[A3]
- VCS 面板：按未提交/分支/agent diff 审查，支持提交与推送。[A4]
- Plan Review Policy：控制计划是否暂停等待批准。[A1][A7]

## 2.9 自动化与调度

- Scheduled Tasks / Automations：cron 风格，分钟级精度；v2.21.1 改名；v2.24.0 支持为自动化选择模型。[A2][A1][A4]
- App 与 CLI 支持 scheduled tasks 与 cron “sidecars”。[A3]
- 定时任务默认使用 Gemini 3.8 Flash。[A4]

## 2.10 协作、分享与远程

- Remote Control：从任意浏览器驱动桌面 App 会话与 CLI 实例；可查看活跃对话、启动新 agent 任务、审阅实施计划、检查 artifacts；CLI 交互模式支持跨设备工具批准与提问；headless CLI daemon 可作为常驻服务。[A10]
- 登录：必须使用与主机相同的 Google 账号；CLI daemon 使用 CLI 自己的登录，与编辑器登录分离；组织策略未开启功能开关时不可用。[A10]
- 平台行为：Linux daemon 开机启动、无需登录、注销后仍存活；macOS 登录启动、注销停止；Windows 管理员安装才开机启动，否则登录启动；崩溃最多重启 3 次；远程界面不能改设置，只能改 CLI。[A10]
- 手机可把站点安装为 Web App 接收推送。[A10]
- Teamwork 的 artifact 交接用于长项目协作。[A9]

## 2.11 编码模式 vs 工作模式（Antigravity）

- Antigravity 没有显式的 coding/work 模式开关。它是一个统一的 agent 工作台：代码任务使用 worktree、Git 面板、终端、IDE 扩展；非代码任务使用 artifacts、文档、图片、浏览器录像。两者共用项目、权限、调度与评审体系。[A2][A3][A4][A5]
- 因而 “work mode” 在 Antigravity 中不是一个命名模式，而是默认的 agent 工作台；编程能力通过 IDE 扩展与代码工具存在，而不是通过模式切换获得。[A3]
- 如果必须划一条线：App 是“工作/编排”表面，IDE 扩展是“编码”表面；但这只是表面分工，不是能力隔离。[A3]

---

# 3. Qoder

## 3.1 最新版本与来源

| 项目 | 版本/日期 | 来源 |
|---|---|---|
| Qoder 工作台 | 0.4.8，2026-10-15 | [Q1] |
| 全新 Qoder 发布 | 0.1.0，2026-08-27 | [Q1][Q2] |
| Qoder CLI | 官方文档未给版本号；用 `qoder --version` 查看（未证实具体版本） | [Q16] |
| Qoder IDE / JetBrains / Cloud Agents / QoderWake | 产品线并存；各自版本未逐一核实 | [Q17][Q1] |

说明：官方博客另有 “Qoder 1.0” 一文（讲从 AI IDE 到自主开发桌面），但 2026-08-27 的全新工作台更新日志从 0.1.0 起算，官方没有把这次发布命名为 2.0；本文以更新日志版本号为准。[Q1]

来源：
- [Q1] https://docs.qoder.cn/product-overview/qoder-update-log.md
- [Q2] https://www.ithome.com/0/994/977.htm
- [Q16] https://docs.qoder.com/cli/overview.md
- [Q17] https://docs.qoder.com

## 3.2 产品形态

- Qoder 桌面工作台：独立桌面应用，国际版 qoder.com、中国版 qoder.cn。[Q2]
- Qoder IDE、JetBrains 插件、CLI、移动端/Web、Cloud Agents、QoderWake（数字员工）、Agent SDK、Enterprise。[Q17]
- QoderWork：文档/表格/研究/浏览器/桌面任务产品；官方下载页称其将于 2027-09-05 停止运营。[Q18]
- 定位：以 Coding 能力为核心底座、面向所有人的智能体工作台；工作对象从“代码工程”转为“智能体任务”。[Q2]

## 3.3 任务/会话模型

- 每个对话是一个 task。[Q4]
- 编程模式按 Workspace 分组；选择 workspace 后确认 Local 或 Worktree 模式与当前分支。[Q3]
- 通用模式按 Folder 分组；可选择文件夹，或在不需要本地文件时不选。[Q3]
- 执行环境：Local、Worktree、SSH；已有任务不能在 Local 与 Worktree 之间切换。[Q15]
- Worktree：为受支持的本地 Git 工作区创建独立副本，要求仓库有提交且支持 worktree。[Q3]
- 并行：可同时运行多个任务；侧边任务（Start Side task）有独立对话，关闭 Qoder 后消失，不支持语音任务。[Q4]
- 任务管理：固定工作区/任务、标记未读、批量归档、恢复、排序（最近更新/手动/名称/创建时间）、按工作区与活跃度过滤。[Q4]
- 任务连续性：同一结果、上下文仍适用时复用任务；目标、工作区、执行边界或成功标准变化时新建。[Q3]
- Plan/Goal：CLI 提供 Plan 模式（先分析并确认方案再改代码）与 Goal 模式（设定完成标准后持续工作）；工作台更新日志提到 Goal-mode 改进；工作台任务文档确认侧边任务，未在任务创建页列出 Plan/Goal 按钮。[Q16][Q1][Q3]

## 3.4 执行模式与审批

### 编程模式 vs 通用模式

- 两种模式可切换，且都不限制提问内容；工作性质变化时可切换。[Q3]
- 编程模式：适合改代码、跑项目命令、在 Git 分支上工作、用 Worktree 隔离并行工作；需要 workspace、分支、执行模式。[Q3]
- 通用模式：适合研究、文档处理、内容工作等以文件夹为自然边界的任务；可选文件夹或不选。[Q3]
- 官方文档没有说通用模式会硬性隐藏代码表面；它改变的是任务组织方式（workspace vs folder）与执行边界，而不是禁用工具。[Q3]

### 权限

- 三种审批模式：Ask for approval（默认）、Auto approve、Full access。[Q15]
- Ask：workspace 内文件自动；workspace 外文件询问；只读终端命令自动，其他命令询问；联网询问。[Q15]
- Auto approve：workspace 内无风险时自动；workspace 外、终端、网络检测到风险时询问。[Q15]
- Full access：文件、终端、网络全部自动，不再询问；官方建议仅在受控工作、已审阅范围与后果时使用。[Q15]
- 静态检查、轻量扫描、深度扫描是独立的安全设置，不随操作审批模式变化。[Q15]

### 执行器

- 默认执行器 Qoder；也可选择自定义 agent 或 agent team；选择模型并审阅该任务的访问权限。[Q3]
- 模型：0.1.0 引入顶级模型与 Auto 调度；0.4.4 增加 Fast 模型以加快响应。[Q1][Q2]
- 自定义 agent：有独立指令、上下文与允许工具，适合 code reviewer、test investigator 等聚焦角色；可由插件提供，`/` 手动选择或由 Qoder 自动匹配。[Q9]

## 3.5 上下文、记忆与规则

- Memory：全局记忆（跨项目的个人偏好、习惯、长期上下文）与项目记忆（仓库规则、经验、长期上下文）；可分别开关；显示文件数与最近更新时间；可打开目录检查或清空。[Q5]
- Repo Wiki：从代码库生成结构化项目知识；支持英文/简体中文；Auto Update 在代码变化时增量刷新；Auto Export 每次生成后导出 Markdown；Citation 让 agent 把生成知识用作任务上下文；生成在本地、多个本地 agent 只读必要文件、代码不上传、结果留在本地仓库、默认关闭。[Q6]
- Knowledge Base：团队维护的结构化信息，与 Memory、Repo Wiki 分工。[Q5]
- 规则：项目记忆包含仓库规则；CLI 使用 `AGENTS.md`。[Q16]
- 技能与插件：Skills 可导入 ZIP 或 `SKILL.md`；插件可打包 Skills、connectors、Agents、commands、rules、Hooks。[Q12][Q13]
- 更新日志 0.1.0 称 “30+ 插件、20,000+ 技能与 20+ 连接器”；IT之家报道称 “40+ 连接器、70+ 插件与 20K+ 技能”。两套口径不一致，官方更新日志更保守。[Q1][Q2]

## 3.6 多智能体与编排

- 自定义 agent + subagents：主 agent 协调整体结果，专家处理局部；可手动 `/` 选择或自动匹配。[Q9]
- Agent Teams：1 名 Team Leader + 1 至 4 名 Additional members；成员必须是绑定本地 Qoder runtime 的已启用 agent；可从模板创建；团队名创建后不能改。[Q8]
- 协作方式：Team Leader 按协作指令澄清需求、协调工作、整合结果；团队按任务在 New Task 的执行器选择器中选择；在项目与讨论中可用 `@` 呼叫 lead（标记 TL）或成员。[Q8]
- 运行位置：团队任务在当前设备运行，设备必须在线；禁用团队不会禁用其成员。[Q8]
- 角色由用户定义，不固定；示例中 planner 识别依赖与实施步骤，reviewer 检查风险与缺失测试。[Q8]
- 项目与讨论中的团队功能需要 Teams/Enterprise，个人版不可用。[Q8]
- 更新日志 0.4.7 将 Agent Teams 开放到个人账户。[Q1]

## 3.7 工具层

- 文件/终端/Git：任务内可读文件、跑命令、看 diff、提交；终端沙箱与执行环境分开配置。[Q15][Q3]
- 浏览器：内置浏览器位于任务对话旁；可打开公共页面或预览本地应用；支持导航、多标签、读取文本/表格/状态、点击/输入/滚动、截图、标注、复制链接；只在任务允许浏览器操作时可用；官方没有描述正式沙箱，但提示把页面指令当不可信内容。[Q14]
- Computer Use 2.0：更新日志 0.3.3 加入，含 Linux 支持。[Q1]
- Sites：更新日志 0.3.3 加入网站构建器。[Q1]
- MCP/连接器：插件与连接器生态；具体 MCP 文档在 CLI/Cloud Agents 侧更完整。[Q13][Q16]
- Hooks：事件覆盖 SessionStart/SessionEnd、UserPromptSubmit、PreToolUse/PostToolUse/PostToolUseFailure、PermissionRequest/PermissionDenied、Stop/StopFailure、SubagentStart/SubagentStop、PreCompact/PostCompact、Notification、InstructionsLoaded、ConfigChange、CwdChanged、FileChanged、WorktreeCreate/WorktreeRemove、Elicitation/ElicitationResult；handler 类型有 command、http、prompt、agent；配置在 `~/.qoder/settings.json`、项目 `.qoder/settings.json`、`.qoder/settings.local.json`，多来源合并。[Q11]
- Skills：Extensions → Skills；市场按分类/热门/最新/搜索；可查看描述与发布者后安装；支持 `/` 调用或自动匹配；Create with Qoder 生成的技能留在本机。[Q12]
- Plugins：Extensions → Plugins；可打包 Skills、connectors、Agents、commands、rules、Hooks；市场显示发布者、用途、包含组件、外部依赖；支持上传 ZIP 或 Create with Qoder。[Q13]

## 3.8 审查、验证与产物

- 任务结果：查看 agent 回复、工具调用、文件变更；运行验证；提交前审阅 Diff。[Q3]
- 安全扫描：Static Check、Lightweight Scan、Deep Scan，独立于操作审批。[Q15]
- 浏览器证据：截图、标注、复制链接，用于布局/渲染状态等需要视觉证据的场景。[Q14]
- Canvas：`/canvas` 把文本/数据/分析转成可视化面板（统计卡、表格、图表）；生成 `.canvas.tsx`，实时预览；用自然语言迭代；支持标注模式（点击元素或手绘圈选后评论）；可发布，但仅组织内可见，需要 Teams/Enterprise；可把重复布局打包成 Skill。[Q10]
- Repo Wiki：作为任务上下文时需开启 Citation；官方提醒 Wiki 不是运行时行为的权威来源，关键结论要对回代码、配置、测试与运行输出。[Q6]
- 产物形态：文档、表格、PPT、网页/Sites、可视化 Canvas、代码 diff、浏览器截图/标注。[Q1][Q10][Q14]

## 3.9 自动化与调度

- Automations：按时间表运行 agent 任务；设置名称、执行位置、Schedule、时间与 Time zone；可设过期日期；支持一次性运行。[Q7]
- 输出类型：Independent task（每次执行新建任务）或 Merged task（结果累积到同一任务，携带历史）。[Q7]
- 创建方式：Create with Qoder（引导式）或 New automation（直接表单）。[Q7]
- 本地：在本机运行，适合需要本地工作目录、文件或 Skills 的任务；Qoder 必须在计划时间运行且能访问网络、账号、文件；可开启 Execution authorization 无人值守调用工具；Keep device awake 降低错过概率。[Q7]
- 云端：完全在云端运行；当前不支持添加 Skills、本地文件、上传本地环境；指令必须自包含；云停止需要远程确认。[Q7]
- 触发：只有时间触发，没有事件触发。[Q7]
- CLI：Scheduled Task、`/loop` 固定间隔重复、Goal 模式。[Q16]
- 更新日志 0.4.1 加入 cloud automation。[Q1]

## 3.10 协作、分享与远程

- 移动远程控制：0.2.1 加入；0.4.7 加入 Apple Silicon Mac 上的 iPhone 控制、锁屏操作（Beta，macOS 14.4+）、Remote Control/SSH 改进。[Q1]
- Cloud Agents：API 运行的托管 agent（Agents、Environments、Sessions）；移动端/网页可远程监控与审批。[Q17]
- Canvas 分享：一键发布，但仅组织内可见，需要 Teams/Enterprise；可同步、复制链接、取消发布、查看 My Shares。[Q10]
- 项目讨论/团队讨论：Teams/Enterprise 可用；团队可在讨论中用 `@` 呼叫。[Q8]
- QoderWake：常驻数字员工。[Q17]
- QoderWork：文档/表格/研究/浏览器/桌面任务产品，2027-09-05 停止运营（官方下载页）。[Q18]

## 3.11 编码模式 vs 工作模式（Qoder）

| 维度 | 编程模式 | 通用模式 |
|---|---|---|
| 任务边界 | Workspace | Folder，或不需要文件夹 |
| 执行模式 | Local / Worktree，需选分支 | 主要 Local；以文件夹为边界 |
| 代码表面 | 代码编辑、项目命令、Git 分支、worktree、diff | 研究、文档、内容等非代码产出 |
| 工具限制 | 未限制提问内容，可切换 | 未限制提问内容，可切换 |
| 共享能力 | 同一任务引擎、权限、执行器、自动化、记忆、Repo Wiki、Canvas | 同上 |

结论：Qoder 是四家中唯一把“编程/通用”做成同一工作台内显式切换的产品；切换改变任务组织与执行边界，不改变底层 agent 能力。媒体所称“通用模式隐藏全部代码细节”在官方任务文档中没有对应硬性声明，应视为界面呈现差异而非能力阉割。[Q3][Q2]

---

# 4. 腾讯：CodeBuddy 与 WorkBuddy

## 4.1 名称与最新版本

结论：CodeBuddy 与 WorkBuddy 都是当前产品名，但指代不同产品，不是“CodeBuddy 更名为 WorkBuddy”。

- CodeBuddy：腾讯云 AI 编程套件，官方定义为支持“插件、IDE 和 CLI 三种编程形态”，覆盖专业开发者到零基础用户。[T11]
- WorkBuddy：腾讯“全场景 AI 工作台”，桌面端 + 小程序 + 移动端 + 企业版；官方文档导航同时列出 IDE、Plugin、CLI、WorkBuddy、Mini Program、Mobile、Enterprise，说明两条产品线并存。[T2]
- 未发现官方“CodeBuddy 更名 WorkBuddy”的声明；二手资料中的更名说未证实。

| 项目 | 版本/日期 | 来源 |
|---|---|---|
| WorkBuddy | 5.8.2，2026-10-16 | [T1] |
| WorkBuddy 正式发布 | 4.5.0，2026-03-04 | [T1] |
| CodeBuddy IDE 独立版本号 | 官方可抓取页面未公布（未证实）；CodeBuddy 套件官方文档最后更新 2026-08-14 | [T11] |
| CodeBuddy CLI | 官方未给版本号（未证实） | [T11] |

来源：
- [T1] https://www.codebuddy.cn/docs/workbuddy/Changelog
- [T2] https://www.codebuddy.cn/docs/workbuddy/Overview
- [T11] https://cloud.tencent.com/document/product/1831/134343

补充：网络上流传的 WorkBuddy “Ask/Plan/Craft 三模式”与官方文档不一致。官方任务栏文档只列“默认（Agent）/计划（Plan）/仅问答（Ask）”，没有 Craft。本文以官方为准。[T3]

## 4.2 产品形态

- WorkBuddy：Windows、macOS、UOS（统信）、银河麒麟；桌面端、小程序、移动端、企业版；可通过微信、企业微信、QQ、飞书、钉钉接入助理。[T2][T13]
- CodeBuddy：插件（VS Code/JetBrains 等）、IDE、CLI（CodeBuddy Code）三种形态。[T11]
- 集成：WorkBuddy 5.7.0 支持把工作区在 CodeBuddy 中打开（CodeBuddy handoff）。[T1]

## 4.3 任务/会话模型

- WorkBuddy 每个对话是一个独立任务，有自己的 workspace 与上下文；多个任务可并行，左侧任务列表显示进度。[T3]
- 任务列表可搜索、管理、归档；任务结果在右侧结果面板展示 artifacts、文件、变更、预览。[T2]
- 项目：项目计划板、项目资产库、外部数据源、任务交接、消息中心（5.0.0）。[T1]
- 团队：项目、邀请、权限（5.0.0）；多人多 Agent 协作（Library）。[T1][T2]
- Worktree 并行任务：每个并行任务有完全隔离的工作目录，共享分支与 Git 对象；任务分支在 `~/WorkBuddy/Worktrees`，命名 `workbuddy/{基础分支}-{8位随机哈希}`；25 个任务警告，50 个必须清理。[T5]
- Git：分支显示与切换、搜索本地/远程分支；切换前可提交/暂存/丢弃未提交变更；失败完整回滚；worktree 任务内不能切分支。[T5]
- 终端/后台命令面板：5.4.0 加入。[T1]

## 4.4 执行模式与审批

### 自主性模式（官方）

- 默认（Agent）：高效执行，直接给结果。[T3]
- 计划（Plan）：先出方案，确认后再执行；与 Ask 互斥；关闭两者回到默认模式；输入框下方有模式指示。[T3]
- 仅问答（Ask）：只问答与想法，不执行。[T3]

要点：WorkBuddy 没有“编程模式/通用模式”切换。代码开发是任务模板/场景之一（代码开发模板、Git、Worktree、终端），不是独立模式。[T3][T2]

### 权限

- 默认权限：以 workspace 为边界；普通文件写入通常直接执行；受保护/敏感路径写入、删除受保护文件、批量删除、运行脚本/命令/外部程序、联网/敏感能力需确认；命令先在沙箱约束下运行；删除进回收站；可选修改前自动备份。[T4]
- 完全访问权限：关闭第二层确认（文件写入、删除、脚本、外部程序），作用域是当前客户端内所有任务（含已有与新建）；切换时弹出风险确认；官方不建议用于生产数据、唯一副本、桌面/下载/项目根目录、批量操作、不熟悉的脚本，建议只在 Docker/VM 等隔离环境使用。[T4]
- 工作区信任：首次打开含 `.codebuddy` 等开发配置目录的工作区会提示；选择受限模式仍可浏览/搜索/编辑文件，但不扫描或运行工作区配置目录下的文件，不自动加载设置、规则、命令、脚本。[T4]
- 安全中心：文件/命令/网络规则、自动备份、工具管理、敏感信息保护、审计日志。[T4]

## 4.5 上下文、记忆与规则

- 工作区、`@` 引用文件/文档/规则、截图粘贴、上传/拖拽文件、微信/企业微信聊天记录转发。[T3]
- 记忆：MEMORY.md 自动创建（4.7.0）、按工作区 Working Memory（4.6.2）、长期记忆加载（5.3.14）、记忆编辑（5.3.3）、记忆与进化入口（5.4.5）。[T1]
- 规则：工作区规则；受限模式下不自动加载工作区配置目录中的规则/命令/脚本。[T4]
- Library：搜索、上传、zip、引用到任务（5.8.0/5.5.5）。[T1]
- 专家：专家 = 人设 + 方法论 + 工具链；专家团 = 团长自动拆解、并行执行、整合交付。[T7]
- Skills：市场按推荐/SkillHub/套件分类；可上传本地技能包；可在对话中调用；自制技能需上传；第三方技能需自行校验来源、权限、脚本。[T8]
- 连接器：QQ 邮箱、腾讯文档、腾讯乐享、腾讯会议、TAPD、腾讯微云、自定义连接器；两种形态：MCP + CLI、Skill + CLI；每个连接器独立授权，不超出用户已有权限，不主动定时抓取。[T9]

## 4.6 多智能体与编排

- 专家：按行业浏览，独立角色切换；专家卡片显示能力介绍、擅长、示例任务、使用次数、开发者信息；可创建个人专家、分享链接、删除；名称创建后不能改。[T7]
- 专家团：团长自动拆解、并行执行、整合交付；团队卡片显示成员与版本；团队会话积分消耗约为单专家的 3 至 5 倍；团队内切换其他专家需要开新对话。[T7]
- 多人多 Agent 协作：Library 中的功能；Teams 5.0.0 支持项目、邀请、权限、任务交接。[T2][T1]
- 企业智能体/企业专家：5.3.3、5.7.2 等版本涉及企业智能体与企业分配助理。[T1]
- Buddy apps/widgets：5.8.0 内嵌 Buddy 应用组件；5.5.0 行业 Buddy 应用；企业版有独立智能体配置。[T1][T12]

## 4.7 工具层

- 本地文件读写、批量操作、独立文件浏览器（5.8.0）。[T2]
- 终端/后台命令面板（5.4.0）；Git 分支、worktree（5.4.0）。[T1][T5]
- 浏览器：官方零成本技能列表含 Agent Browser；5.6.0 支持 Edge/QQ 浏览器。[T8][T1]
- Computer Use：4.22.4 实验性 macOS 支持。[T1]
- MCP：连接器支持 MCP + CLI；5.6.0 可手动编辑 `mcp.json`；5.4.4 MCP 配置修复。[T9][T1]
- Skills/插件：SkillHub 市场、插件市场、插件 hooks（5.3.5 扩展插件 hooks）。[T8][T1]
- 文件格式：Word、Excel、PPT、PDF、Markdown、HTML 预览/编辑；Office 预览上限 Word/Excel 100MB、演示 500MB（5.5.3）。[T2][T1]
- 图像/视频：图像处理（去水印、修复、增强、去背景，5.5.0）、视频生成、3D 模型生成（5.4.0）、Kling V3（5.5.3）。[T1]

## 4.8 审查、验证与产物

- 结果面板：artifacts、文件、变更、预览；可审阅并接受交付物。[T2]
- 工作区信任与安全中心：自动备份、回收站、审计日志、敏感信息保护。[T4]
- Artifact 分享：链接、二维码、微信分享、HTML 预览、云端 artifact 开关。[T1]
- 代码审查：CodeBuddy 插件侧有本地代码审查；WorkBuddy 侧没有公开的 PR 审查门禁文档。WorkBuddy 的审查主要是结果验收、权限确认与工作区信任，不是 GitHub PR 审批流。[T11][T2]
- 质量提示：官方提醒专家生成内容仅供参考，不构成专业意见。[T7]

## 4.9 自动化与调度

- 定时任务：名称、prompt、时间、workspace、权限；重复选项含间隔、单次、每天、每周、每双周、每月、每年；可设有效期；多个执行日期写在一条规则中。[T6]
- 来源：本地（桌面客户端创建，本机运行）、项目（项目内创建，项目内管理）、云端（云沙箱运行，带云标识）。[T6]
- 无人值守：完全访问权限推荐用于无人值守；默认权限下敏感操作会停在等待确认；本地任务执行期间不要关机或退出客户端。[T6]
- 云端：电脑关机或离线也能按时运行；不需要 workspace 或权限；不能访问本地文件；不支持推送到企业微信。[T6]
- 结果推送：企业微信机器人或独立机器人；推送失败不影响执行。[T6]
- 频率/时长/并发受系统限制；建议先试跑一次。[T6]

## 4.10 协作、分享与远程

- IM 助理：微信、企业微信、QQ、飞书、钉钉；可在聊天中下发任务、接收结果；微信/企业微信聊天记录可作为附件转发。[T13][T2]
- 远程遥控：手机远程继续处理任务（通勤、出差、跨设备）；可查找文件、继续排查项目报错；建议先预览再执行删除/覆盖/批量移动。[T10]
- 团队协作：项目、邀请、权限、任务交接、消息中心（5.0.0）；多人多 Agent 协作。[T1][T2]
- Artifact 分享：链接、二维码、微信、HTML 预览。[T1]
- CodeBuddy handoff：WorkBuddy 5.7.0 可把工作区在 CodeBuddy 中打开。[T1]

## 4.11 编码模式 vs 工作模式（腾讯）

腾讯的区分是产品级，不是单产品内的模式开关：

| 维度 | CodeBuddy（编程） | WorkBuddy（工作） |
|---|---|---|
| 形态 | 插件、IDE、CLI | 桌面端、小程序、移动端、企业版 |
| 对象 | 代码库、项目、终端 | 全场景任务：文档、表格、PPT、数据、网页/应用、代码 |
| 自主性模式 | CodeBuddy 自身模式未在官方可抓取页展开（未证实） | 默认 Agent、计划 Plan、仅问答 Ask |
| 代码能力 | 补全、错误修复、解释、单测、代码审查、@workspace 问答、多文件生成、Figma-to-code、BaaS、部署 | 代码开发模板、Git、worktree、终端、网站/小程序/应用生成；可 handoff 到 CodeBuddy |
| 审查 | 本地代码审查、企业 RAG | 结果验收、权限确认、工作区信任、安全中心；未见 PR 审查门禁 |
| 关系 | 同一厂商生态；WorkBuddy 可交接 CodeBuddy | 可做代码，但不是专用编程 IDE |

结论：腾讯没有“一个工作台内的编程/通用切换”；它用两个产品覆盖两种工作形态。WorkBuddy 的“模式”是自主性等级，不应与 Qoder 的“编程/通用”或 OpenAI 的“Work/Codex”混为一谈。[T3][T11]

---

# 5. 跨产品矩阵：编码模式 vs 工作模式

说明：
- “显式 coding 模式”指产品内有命名、可切换的编码模式。
- “显式 work 模式”指产品内有命名的通用/工作模式。
- “共享内核”指两种模式是否共用任务、权限、上下文与执行引擎。
- “代码表面隔离”指工作模式是否隐藏 diff/终端/Git 等表面。
- “工作模式独占能力”指只在工作模式出现的功能。

| 维度 | OpenAI ChatGPT + Codex | Google Antigravity | Qoder | 腾讯 WorkBuddy / CodeBuddy |
|---|---|---|---|---|
| 产品形态 | 统一桌面应用 + Web/移动 + CLI + IDE 扩展 + Cloud | 独立 App + CLI + 5 个 IDE 扩展 + SDK | 工作台 + IDE + JetBrains + CLI + 移动 + Cloud Agents + QoderWake | WorkBuddy 桌面/小程序/移动/企业 + CodeBuddy 插件/IDE/CLI |
| 显式 coding 模式 | 有，Codex 模式 | 无 | 有，编程模式 | 无（CodeBuddy 是独立产品） |
| 显式 work 模式 | 有，ChatGPT Work | 无（统一 agent 工作台） | 有，通用模式 | 无（WorkBuddy 是独立产品；内部是 Ask/Plan/Agent） |
| 模式切换 | Chat / Work / Codex 三选一 | 无模式开关；靠表面与权限预设 | 编程/通用切换，可随任务性质改变 | 产品级切换：CodeBuddy vs WorkBuddy |
| 共享内核 | Work 与 Codex 能力重叠、共享用量 | 全部任务共享项目/权限/artifacts | 两模式共享任务引擎、权限、执行器 | 同一厂商生态；WorkBuddy 可 handoff 到 CodeBuddy |
| 代码表面隔离 | 是：Work 隐藏 Git/shell/diff，且无 PR 面板 | 否：统一工作台，不隐藏代码表面 | 呈现层：通用模式按 folder 组织；官方未声明硬性隐藏代码 | 产品级：WorkBuddy 也保留 Git/worktree/终端 |
| 工作模式独占能力 | 无严格独占：Codex 也能做研究/文档；Work 侧重文档/演示/表格/Sites 与非技术表达 | 无严格独占：统一工作台 | 无硬性独占：两模式共享任务引擎、权限、执行器、记忆 | 相对 CodeBuddy：WorkBuddy 独占办公/IM/文档生态；CodeBuddy 独占编程 IDE/CLI 形态 |
| 任务模型 | Projects/Chats、并行任务、worktree、cloud、pinned | Projects、Agent Manager、并行 agent、worktree、scratch 会话 | 任务=对话、workspace/folder、Local/Worktree/SSH、侧边任务 | 任务=对话、workspace、并行、worktree、项目计划板 |
| 隔离执行 | Local / Worktree / Cloud | 本地 worktree / 项目隔离 / scratch | Local / Worktree / SSH / Cloud automation | 本地 worktree / 云沙箱定时任务 |
| 计划/评审门 | 长任务审批、auto-review、PR review、计划性任务 | `/plan` + Plan Review Policy + artifact review | Plan/Goal/侧边任务 + Diff 审阅 + 安全扫描 | Plan 模式 + 权限确认 + 结果验收 |
| 权限/沙箱 | read-only / workspace-write / full access；auto-review | Deny > Ask > Allow；Default/Request Review/Turbo | Ask / Auto approve / Full access | 默认权限 / 完全访问；工作区信任；安全中心 |
| 产物/artifacts | 文档、演示、表格、PDF、图片、Sites、diff、测试结果 | 实施计划、diff、架构图、图片、浏览器录像、验证报告 | 文档、表格、PPT、Sites、Canvas、diff、截图 | 文档、表格、PPT、网页/应用、图片/视频、HTML artifact |
| 记忆/规则 | memories、Library、AGENTS.md、skills | 规则、skills、MCP、项目设置 | 全局/项目 Memory、Repo Wiki、Knowledge Base、rules | MEMORY.md、工作区记忆、规则、Library |
| 代码知识库 | Repo 上下文；无独立 Repo Wiki | 无独立 Repo Wiki | Repo Wiki（Auto Update/Citation） | 无独立 Repo Wiki |
| 多智能体 | subagents（default/worker/explorer）、Dots、Team Tasks、Ultra | 动态 subagents、Teamwork（Sentinel/Orchestrator/Critic/Challenger/Auditor） | 自定义 agents、Agent Teams（1 lead + 1-4） | 专家、专家团（团长拆解/并行/整合）、多人多 Agent |
| 终端/Git | 终端、worktree、Changes、PR | 终端、VCS 面板、worktree | 终端、Git diff/commit、worktree | 终端/后台命令、Git 分支、worktree |
| 浏览器/Computer Use | 内置浏览器、Chrome 扩展、Computer Use | `/browser`（Chrome DevTools MCP）；未见独立 Computer Use 文档（未证实） | 内置浏览器、Computer Use 2.0 | Agent Browser 技能、实验性 macOS Computer Use |
| MCP/skills/plugins/hooks | MCP、skills、plugins、hooks | MCP Store、skills、hooks、插件市场 | MCP/connectors、skills、plugins、hooks | MCP/connectors、skills、插件、插件 hooks |
| 自动化 | Automations、cloud tasks、事件触发 | Scheduled Tasks/Automations、cron sidecars | Automations（本地/云）、CLI scheduled/loop | 定时任务（本地/项目/云） |
| 远程/协作 | ChatGPT Space、Sites、Team Tasks、mobile remote、Voice | Remote Control（浏览器/CLI/daemon）、Teamwork | 移动远程、锁屏操作、Cloud Agents、Canvas 组织内分享 | IM 助理（微信/企微/QQ/飞书/钉钉）、手机远程、Teams |
| 版本锚点 | App 26.1007（10-08）、CLI 0.163.0（10-15） | App 2.24.0（10-15）、CLI 1.4.0（10-16） | 0.4.8（10-15） | WorkBuddy 5.8.2（10-16）；CodeBuddy IDE 版本未证实 |

## 5.1 “编码模式”与“工作模式”的本质差异

| 维度 | 编码模式 | 工作模式 |
|---|---|---|
| 工作对象 | 仓库、分支、代码文件 | 文件夹、文档、数据、网页、桌面应用 |
| 主要表面 | 编辑器、diff、终端、Git、PR | 成品文件、可视化、Sites、浏览器、artifacts |
| 成功标准 | 编译/测试通过、审查通过、PR 可合并 | 结果可验收、格式/内容正确、可分享 |
| 权限重点 | 文件写、命令执行、网络、密钥 | 本机文件、应用操作、第三方连接器、发布 |
| 上下文重点 | 代码库、依赖、测试、规则 | 用户文件、记忆、组织知识、连接器数据 |
| 产物 | 代码变更、补丁、PR | 文档、表格、演示、报告、站点、图像/视频 |
| 风险 | 破坏代码、泄露密钥、执行恶意命令 | 误删文件、误发消息、越权访问、错误交付 |

## 5.2 四家的路线差异

- OpenAI：同一应用内的“表达层双模式”。Work 与 Codex 共享能力与额度，Work 隐藏技术表面，Codex 保留开发者表面。适合“一个应用覆盖两类用户”，但模式边界容易模糊。
- Antigravity：不切模式，统一 agent 工作台。用 projects、permissions、artifacts 把代码与非代码任务放在同一模型里；编程入口交给 IDE 扩展。适合“agent 优先”的重度用户，但非技术用户仍会看到代码概念。
- Qoder：同一工作台内的“任务组织双模式”。编程=workspace，通用=folder；共享引擎，切换成本低。适合“一个工作台服务开发者与业务人员”，但两种模式的差异主要是任务组织与呈现层，不是能力隔离。
- 腾讯：产品级双产品。CodeBuddy 做编程，WorkBuddy 做工作；WorkBuddy 也能做代码并交接。适合“组织内分工明确”的采购与部署，但用户需要在两个产品之间切换。

---

# 6. 一个 IDE 工作台最应具备的 10 项能力

按四家产品的收敛程度排序，每项给出“为什么”和“证据”。

1. 统一任务内核，双模式共享上下文与权限
   - 任务应是一等公民：每个任务有独立 workspace、上下文、状态、产物，可并行、可恢复、可归档。模式切换不应丢失任务上下文。
   - 证据：OpenAI Projects/任务/worktree；Qoder 任务=对话、编程/通用共享引擎；Antigravity Projects/Agent Manager；WorkBuddy 任务=对话、并行任务。

2. 隔离执行与安全交接（Local / Worktree / Cloud / SSH）
   - 并行任务必须隔离，否则文件冲突与上下文污染不可避免；隔离环境还要能安全交接回主工作区。
   - 证据：OpenAI managed worktrees + Handoff + Cloud；Antigravity 隔离 Git worktree；Qoder Local/Worktree/SSH；WorkBuddy worktree 任务与 Git 回滚。

3. 分级权限、沙箱与自动审查门
   - 默认安全、按需放开；高风险动作必须有人或 reviewer agent 把关；无人值守任务要有独立的权限策略。
   - 证据：OpenAI read-only/workspace-write/full access + auto-review；Antigravity Deny>Ask>Allow + 三预设；Qoder Ask/Auto/Full；WorkBuddy 默认/完全访问 + 工作区信任。

4. 计划先行的可编辑产物（Plan artifact）
   - 复杂任务先产出可审阅计划，再执行；计划要能逐段评论、拆分任务、删除可选项、设置验证点。
   - 证据：Antigravity `/plan` + Implementation Plan artifact + Plan Review Policy；Qoder Plan/Goal；WorkBuddy 计划模式；OpenAI 长任务审批与计划性工作。

5. 可审阅的 artifacts 与验证闭环
   - 仅给聊天文本不够；要能看 diff、计划、截图、浏览器录像、文档/表格/PPT，并能在产物上直接评论、迭代、验收。
   - 证据：Antigravity artifacts + 内联反馈 + 浏览器录像；Qoder Canvas 标注 + 浏览器截图；OpenAI 文档/演示/表格/Sites + diff + 测试结果；WorkBuddy 结果面板 + artifact 分享。

6. 上下文工程：规则、记忆、代码知识库
   - 规则保证行为一致；记忆保留偏好与项目经验；Repo Wiki/知识库把隐性知识显性化；上下文压缩保证长任务不爆窗。
   - 证据：OpenAI AGENTS.md/memories/Library；Qoder Memory/Repo Wiki/Knowledge Base；Antigravity rules/skills；WorkBuddy MEMORY.md/工作区记忆/Library。

7. 多智能体编排与验证角色
   - 复杂任务需要 planner、worker、reviewer、tester 等角色；关键不是“多”，而是角色分工、文件所有权、验证闭环。
   - 证据：OpenAI subagents（default/worker/explorer）+ Ultra；Antigravity Teamwork（Critic/Challenger/Auditor）；Qoder Agent Teams（lead + 1-4）；WorkBuddy 专家团（团长拆解/并行/整合）。

8. 完整的工具层：终端、Git、浏览器、Computer Use
   - 编码需要终端与 Git；工作需要通过浏览器与桌面应用操作真实世界；两者都要有审批与证据留存。
   - 证据：OpenAI 终端/worktree/PR/浏览器/Computer Use；Antigravity 终端/VCS 面板/`/browser`；Qoder 终端/Git/浏览器/Computer Use 2.0；WorkBuddy 终端/Git/Agent Browser/实验性 Computer Use。

9. 开放扩展：MCP、Skills、Plugins、Hooks
   - 工作台不可能内置所有工具；MCP 接系统，Skills 封装流程，Plugins 打包能力，Hooks 做确定性守门。
   - 证据：OpenAI MCP/plugins/skills/hooks；Antigravity MCP Store/skills/hooks/插件市场；Qoder connectors/skills/plugins/hooks；WorkBuddy MCP 连接器/skills/插件 hooks。

10. 自动化、远程与协作
    - 定时/云端任务让 agent 在无人值守时工作；远程让用户在手机/浏览器接管；协作让产物可分享、可评论、可交接。
    - 证据：OpenAI Automations/Cloud/事件触发/Space/mobile remote；Antigravity Automations/Remote Control；Qoder Automations/移动远程/Canvas 分享；WorkBuddy 定时任务/IM 助理/手机远程/Teams。

---

# 7. 证据等级与未证实项

## 7.1 证据等级

- 一级：官方文档/官方更新日志/官方产品页（本文绝大多数）。
- 二级：官方云文档（腾讯云产品文档）、官方营销页。
- 三级：主流媒体（IT之家），仅用于官方页面无法抓取正文的发布时间/发布事实。

## 7.2 未证实项

1. CodeBuddy IDE 独立版本号：官方可抓取页面未公布；官方产品文档最后更新 2026-08-14。[T11]
2. CodeBuddy CLI 版本号：官方未给。[T11]
3. OpenAI Codex IDE 扩展版本号：官方未给。[O10]
4. Antigravity IDE 扩展版本号：官方 changelog 只列 App 与 CLI；扩展版本未给。[A1]
5. Qoder CLI 版本号：文档只说用 `qoder --version` 查看。[Q16]
6. “CodeBuddy 更名为 WorkBuddy”：未发现官方声明；官方文档同时维护两条产品线，故该说法不成立/未证实。[T2][T11]
7. WorkBuddy “Ask/Plan/Craft 三模式”：官方任务栏只列默认（Agent）/计划（Plan）/仅问答（Ask），没有 Craft；二手资料说法未证实。[T3]
8. Qoder 连接器/插件/技能数量：官方更新日志 0.1.0 为 30+ 插件、20,000+ 技能、20+ 连接器；IT之家为 40+ 连接器、70+ 插件、20K+ 技能；两套口径不一致。[Q1][Q2]
9. “通用模式隐藏全部代码细节”：官方任务文档只说按 folder 组织、适合非代码任务，未声明硬性隐藏；该说法来自媒体，未证实。[Q3][Q2]
10. Antigravity “fast mode”：官方文档没有该命名模式；速度由模型/thinking level 控制，深度推理用 `/boost`。若有人把“快速模型”称作 fast mode，属于非官方说法。[A3][A4][A7]
11. OpenAI “Work 与 Codex 使用同一底层 Codex agent”：官方只说能力重叠、共享用量；未在可抓取文档中直接写“同一 agent”。本文按“重叠、共享”表述，不写“同一引擎”。[O3]

---

# 8. 来源清单（按产品）

## OpenAI

- [O1] https://learn.chatgpt.com/docs/changelog
- [O2] https://learn.chatgpt.com/docs/whats-new
- [O3] https://learn.chatgpt.com/docs/use-chatgpt.md
- [O4] https://learn.chatgpt.com/docs/features.md
- [O5] https://learn.chatgpt.com/docs/automations.md
- [O6] https://learn.chatgpt.com/docs/computer-use.md
- [O7] https://learn.chatgpt.com/docs/cloud.md
- [O8] https://learn.chatgpt.com/docs/environments/git-worktrees.md
- [O9] https://learn.chatgpt.com/docs/code-review.md
- [O10] https://learn.chatgpt.com/docs/codex/ide
- [O11] https://learn.chatgpt.com/docs/plugins.md
- [O12] https://learn.chatgpt.com/docs/hooks.md
- [O13] https://learn.chatgpt.com/docs/agent-configuration/subagents.md
- [O14] https://learn.chatgpt.com/docs/sandboxing/auto-review.md

## Google Antigravity

- [A1] https://antigravity.google/docs/changelog
- [A2] https://antigravity.google/product/antigravity-2
- [A3] https://antigravity.google/docs/overview
- [A4] https://antigravity.google/docs/features
- [A5] https://antigravity.google/docs/artifacts
- [A6] https://antigravity.google/docs/permissions
- [A7] https://antigravity.google/docs/plan
- [A8] https://antigravity.google/docs/commands/browser
- [A9] https://antigravity.google/docs/teamwork
- [A10] https://antigravity.google/docs/remote-control
- [A11] https://antigravity.google/docs/mcp
- [A12] https://antigravity.google/docs/skills
- [A13] https://antigravity.google/docs/hooks

## Qoder

- [Q1] https://docs.qoder.cn/product-overview/qoder-update-log.md
- [Q2] https://www.ithome.com/0/994/977.htm
- [Q3] https://docs.qoder.com/qoder/new-task.md
- [Q4] https://docs.qoder.com/qoder/task-management.md
- [Q5] https://docs.qoder.com/qoder/memory.md
- [Q6] https://docs.qoder.com/qoder/repo-wiki.md
- [Q7] https://docs.qoder.com/qoder/automations.md
- [Q8] https://docs.qoder.com/qoder/custom-agent-teams.md
- [Q9] https://docs.qoder.com/qoder/subagents.md
- [Q10] https://docs.qoder.com/extensions/canvas.md
- [Q11] https://docs.qoder.com/qoder/hooks.md
- [Q12] https://docs.qoder.com/qoder/skills.md
- [Q13] https://docs.qoder.com/qoder/plugins.md
- [Q14] https://docs.qoder.com/qoder/browser.md
- [Q15] https://docs.qoder.com/qoder/approval-and-sandbox.md
- [Q16] https://docs.qoder.com/cli/overview.md
- [Q17] https://docs.qoder.com
- [Q18] https://qoder.com/download

## 腾讯 CodeBuddy / WorkBuddy

- [T1] https://www.codebuddy.cn/docs/workbuddy/Changelog
- [T2] https://www.codebuddy.cn/docs/workbuddy/Overview
- [T3] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Task-Bar
- [T4] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Permission-Modes
- [T5] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Worktree-Task
- [T6] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Automation-Guide
- [T7] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Expert-Center
- [T8] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market
- [T9] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector
- [T10] https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Practice-Six
- [T11] https://cloud.tencent.com/document/product/1831/134343
- [T12] https://cloud.tencent.com/act/pro/workbuddy
- [T13] https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Efficient-Tips
