# 四款本地仓库功能盘点（Claude Code / Codex / Kimi Code / MiniMax Code）

调查日期：2026-10-18。调查方式：只读（`git describe`、`git log`、ripgrep、阅读 README/CHANGELOG/docs/源码），未运行任何被测 CLI，未修改任何仓库文件。

锚点约定：`文件:行号` 均相对于各仓库根目录；命令输出锚点写作 `命令 → 结果`。仓库根目录为：

- `/Users/cuishi/lab/ncwk/upstream/claude-code`
- `/Users/cuishi/lab/ncwk/upstream/codex`
- `/Users/cuishi/lab/ncwk/upstream/kimi-code`
- `/Users/cuishi/lab/ncwk/upstream/minimax-code`

---

## 0. 版本核验与仓库性质

| 工具 | 实测版本 | 核验命令输出 | 最新提交 | 仓库性质 |
| --- | --- | --- | --- | --- |
| Claude Code | v2.1.300 | `git describe --tags` → `v2.1.300` | `94506ff` 2026-10-14 | 发行/文档镜像：无核心源码，含 CHANGELOG、官方 plugins、内置 mods 源码；`mods/README.md:3-6` 明确“这是构建进二进制的 mod 源码” |
| Codex | rust-v0.162.1 | `git describe --tags` → `rust-v0.162.1` | `092d3ac` 2026-10-09 | 完整 Rust 源码（`codex-rs/`），含 CLI/TUI/app-server/SDK |
| Kimi Code | @moonshot-ai/kimi-code@2.1.1-6-ga940f2ff0 | `git describe --tags` → `@moonshot-ai/kimi-code@2.1.1-6-ga940f2ff0` | `a940f2ff` 2026-09-28 | 完整 TypeScript monorepo（`apps/`、`packages/`） |
| MiniMax Code | v0.6.5 | `git describe --tags` → `v0.6.5` | `309e285` 2026-10-09 | 完整 TypeScript monorepo（TUI/headless/ACP 源码；桌面端源码不在仓库内，`README.md:298`） |

版本补充：

- Claude Code 的版本号来自 CHANGELOG 与 git tag，仓库未提供提交日期对应的发版日期；最新提交日期为 2026-10-14（`git log -1 --format=%cd`）。
- Codex 本地 `CHANGELOG.md:1-5` 只有 Unreleased 一条，明确“changelog 在 GitHub releases 页面”，因此本地无法直接取得 0.162.1 的官方 release notes；本报告的“版本亮点”用 `git log` 的提交主题作锚点。
- Kimi 的文档 CHANGELOG 最新为 2.1.1（2026-09-24，`docs/en/release-notes/changelog.md:7-9`），当前 checkout 比该 tag 多 6 个提交（`git describe` 后缀 `-6-g`）。
- MiniMax 存在文档滞后：根 `package.json:3` 与 `packages/tui/package.json:3` 为 0.6.5，但 `packages/tui/CHANGELOG.md` 最新条目只到 0.5.5（`packages/tui/CHANGELOG.md:10`），`README.md:278` 仍写“targets the 0.4.12 source preview”。本报告以代码与 git tag 为准，并标注文档滞后。

---

# 1. Claude Code（v2.1.300）

## 1.1 产品形态、版本与文档

- 终端 CLI/TUI 是主形态，官方定位为“agentic coding tool that lives in your terminal”，同时支持 IDE 与 GitHub 上的 `@claude`（`README.md:7`）。
- 桌面端：CHANGELOG 记录“Introducing Claude Code for Desktop”（`CHANGELOG.md:8084`），后续有桌面端启动提示与 Desktop Code tab 的网关策略（`CHANGELOG.md:287-288`、`CHANGELOG.md:7019`）。
- Web/云端会话：`Claude Code on the web` 可通过以 `&` 开头的消息把后台任务送到 web（`CHANGELOG.md:8121`），提交/PR 会带会话 URL（`CHANGELOG.md:7675`）。
- IDE：VS Code 扩展有独立的设置、会话恢复、diff/plan 跟随字体等条目（`CHANGELOG.md:84-92`）。
- Slack/协作面：Claude Tag 在 Slack 中工作，支持 Slack Connect、审批卡片、语音片段（`CHANGELOG.md:86-90`）。
- 浏览器控制：Claude in Chrome（Beta）通过 Chrome 扩展直接控制浏览器（`CHANGELOG.md:7928`）。
- 插件与扩展：官方插件目录覆盖 code review、commit、feature-dev、hookify、plugin-dev、PR review toolkit 等（`plugins/README.md:15-27`）；另有更底层的“mods”扩展机制（见 1.6）。
- 文档入口：README 指向 `code.claude.com/docs`（`README.md:9`）；本仓库的 CHANGELOG 覆盖 420 个版本段（`grep -c '^## ' CHANGELOG.md → 420`），最早到 0.2.21（`CHANGELOG.md:9065-9073`）。

## 1.2 会话与任务模型

- 新建/恢复：交互式 `claude`、`--resume`、`/resume`；`/clear` 清空当前上下文（`CHANGELOG.md:194`、`CHANGELOG.md:599`）。
- 分叉：`/fork` 已改名为 `/branch`，`/fork` 仍为别名（`CHANGELOG.md:6777`）；`/branch` 与后台会话、`--worktree` 一起出现在恢复提示中（`CHANGELOG.md:6126`）。
- 回退/检查点：`/rewind`（别名 `/undo`）把对话回退并撤销代码改动（`CHANGELOG.md:8361`）；Esc Esc 也可打开 rewind 选择器（`CHANGELOG.md:780`）；`--rewind-files` 可单独恢复文件（`CHANGELOG.md:2813`）。
- 归档：VS Code 侧把 “Delete session” 改为 “Archive session”，归档会话进入可折叠分组并支持 Unarchive（`CHANGELOG.md:3007`）。
- 后台代理：`background agent support`，代理在后台运行而主线程继续工作（`CHANGELOG.md:8033`）；`←←` 打开 agents view（`CHANGELOG.md:5019`）；`/tasks` 汇总后台工作，系统任务折叠为一行（`CHANGELOG.md:19`、`CHANGELOG.md:1291`）。
- 队列/插话：运行中按 Enter 可排队追加消息（`CHANGELOG.md:8950`）；后台会话与队列记录可被 mod 的 `session.append` 的 `queue` 分支改写（`CHANGELOG.md:108`）。
- 长任务目标：`/goal` 设置完成条件，跨轮持续工作，显示耗时/轮次/token 浮层，支持交互式、`-p` 与 Remote Control（`CHANGELOG.md:5425`）。
- 定时任务：会话内 cron 调度工具（`CHANGELOG.md:6947`），`/loop`、`CronCreate`、`ScheduleWakeup` 均存在（`CHANGELOG.md:6483`、`CHANGELOG.md:130`）。
- 动态工作流：`/workflows` 查看运行，工作流可在后台编排数十到数百个 agent（`CHANGELOG.md:5011`）。

## 1.3 执行模式与审批

- 计划模式（Plan mode）：先产出计划再执行；后续版本强化计划精度（`CHANGELOG.md:8087`），并引入 Plan 子代理（`CHANGELOG.md:8222`）；`/plan` 可直接进入（`CHANGELOG.md:7808`）。
- 权限模式：
  - 默认逐项审批；Shift+Tab 在计划模式中可选 “auto-accept edits”（`CHANGELOG.md:7758`）。
  - Auto mode：由安全分类器决定是否放行，支持 `settings.autoMode.hard_deny` 硬拒绝规则（`CHANGELOG.md:5486`）；分类器拒绝后可触发 `PermissionDenied` hook 并允许重试（`CHANGELOG.md:6395`）。
  - Bypass permissions：`--dangerously-skip-permissions` 对应完全跳过审批（`CHANGELOG.md:5870`）。
  - Safe mode：`--safe-mode`/`CLAUDE_CODE_SAFE_MODE` 禁用 CLAUDE.md、插件、技能、hooks、MCP 等全部定制，用于排障（`CHANGELOG.md:4782`）。
  - Bare mode：`--bare` 面向脚本化 `-p`，跳过 hooks、LSP、插件同步、技能目录扫描，禁用 auto-memory（`CHANGELOG.md:6636`）。
- 审批持久化：Auto mode 的 opt-in 提示提供 “Don't ask again”（`CHANGELOG.md:5854`）；Cowork 云端审批提供 “Allow for this task”（`CHANGELOG.md:83`）；永久 allow/deny 规则由设置与 hooks 管理（`CHANGELOG.md:6737` 的 sandbox 读写规则、`CHANGELOG.md:702` 的 connector ask policy）。
- 沙箱：`sandbox.failIfUnavailable` 在沙箱无法启动时直接失败而不是无沙箱运行（`CHANGELOG.md:6559`）；`allowRead` 可在 `denyRead` 区域内重新允许读（`CHANGELOG.md:6737`）；`sandbox.enableWeakerNetworkIsolation` 用于 macOS 自定义 MITM 代理（`CHANGELOG.md:7016`）；`/sandbox` 提供依赖状态与安装说明（`CHANGELOG.md:7579`）。
- 顾问：`/advisor` 选择顾问模型，`advisorModel` 或 `--advisor` 配置；`CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` 关闭（`CHANGELOG.md:7`）。
- 工作树：`--worktree` 启动隔离工作树，并有 WorktreeCreate/WorktreeRemove 插件 hooks（`CHANGELOG.md:26-37`）。

## 1.4 上下文

- 项目指令：`CLAUDE.md` 为默认；`AGENTS.md` 在项目没有 `CLAUDE.md` 时作为替代读取，可在 `/config` 的 “Project instructions” 切换（`CHANGELOG.md:1926`）；内置 `agents-md` mod 支持四种模式（仅 CLAUDE.md、CLAUDE.md 或 AGENTS.md、二者并存、仅组织级）（`mods/README.md:13`）。
- 规则：支持 `.claude/rules/*.md`，加载时触发 `InstructionsLoaded` hook（`CHANGELOG.md:8006`、`CHANGELOG.md:7021`）。
- 记忆：agent frontmatter 支持 `memory: user|project|local` 持久记忆（`CHANGELOG.md:7445`）；`autoMemoryDirectory` 可配置自动记忆目录（`CHANGELOG.md:6844`）。
- 压缩：自动压缩与手动 `/compact`；空闲压缩会在 200K+ token 会话闲置约 54 分钟时先压缩，避免一小时 prompt cache 过期（`CHANGELOG.md:97`）；`/autocompact` 可调整窗口（`CHANGELOG.md:1282`）。
- @ 提及：支持 `@` 文件提及（`CHANGELOG.md:6396`）；`CLAUDE_CODE_DISABLE_FILE_MENTIONS` 让模型只拿到路径、不注入内容（`CHANGELOG.md:94`）。
- 技能：Agent Skills 作为独立类别进入上下文可视化（`CHANGELOG.md:7819`），并支持 Claude Skills（`CHANGELOG.md:8268`）。
- MCP 工具搜索：当 MCP 工具描述超过上下文 10% 时自动延迟加载并通过 MCPSearch 发现（`CHANGELOG.md:7696`）。
- 仓库索引：本仓库（仅 CHANGELOG/插件/mods）未提及持久化代码库索引或向量索引；上下文来自指令文件、@ 提及、工具读取与压缩。核心二进制未提供，无法验证内部是否另有索引，标记为“未验证”。

## 1.5 多智能体

- 子代理：命名子代理可被 `@` 提及（`CHANGELOG.md:6396`）；子代理支持 frontmatter 的 `autoCompactWindow` 提前压缩（`CHANGELOG.md:290`）。
- Agent Teams：研究预览，多代理协作，需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`，token 消耗高（`CHANGELOG.md:7461`）；支持 tmux 或 iTerm2 的 teammate 模式（`CHANGELOG.md:4556`），并有 `TeammateIdle`、`TaskCompleted` hooks（`CHANGELOG.md:7443`）。
- 动态工作流：用脚本编排大量 agent，后台运行，`/workflows` 管理；可通过 `agent.spawn` mod hook 拒绝或改写 workflow agent（`CHANGELOG.md:5011`、`CHANGELOG.md:9`）；并发上限可调到 1–256（`CHANGELOG.md:2409`）。
- 后台代理与 agents view：后台 agent 持续运行（`CHANGELOG.md:8033`），agents view 可查看、搜索、分组、重命名（`CHANGELOG.md:909`）。
- 隔离：`--worktree` 会话（`CHANGELOG.md:26-37`）；workflow agent 可用 `isolation: "worktree"`（`CHANGELOG.md:4921`）。
- 编排/审批：工作流、团队、子代理都受 permission hooks 与 `agent.spawn` 控制（`CHANGELOG.md:9`、`CHANGELOG.md:680`）。

## 1.6 工具

- 终端/文件/git：Bash、Edit、Write、NotebookEdit（`CHANGELOG.md:49`）；内置 git 提交/PR 指令可通过 `includeGitInstructions` 移除（`CHANGELOG.md:7017`）。
- 浏览器：Claude in Chrome 控制真实浏览器（`CHANGELOG.md:7928`）；可用 `/chrome` 选择已连接浏览器（`CHANGELOG.md:5020`）。
- Web：WebFetch/WebSearch（`CHANGELOG.md:55` 的 Cowork WebFetch 改进）。
- Artifact：发布/更新 HTML artifact，可在一次调用中做小改并重新发布（`CHANGELOG.md:58`）；Artifact 读取/更新有独立权限规则（`CHANGELOG.md:2565`）。
- MCP：支持 MCP OAuth 发现、SSE/HTTP、自动重连（`CHANGELOG.md:8736`、`CHANGELOG.md:8818`）；MCP 工具可按需搜索（`CHANGELOG.md:7696`）。
- Hooks：生命周期 hooks，含 `PreToolUse`、`PermissionRequest`、`PostToolUse`、`SessionStart`、`SessionEnd`、`InstructionsLoaded`、`PermissionDenied` 等（`CHANGELOG.md:7021`、`CHANGELOG.md:6395`、`CHANGELOG.md:8140`）。
- Plugins/Marketplace：插件可含命令、agents、skills、hooks、MCP（`plugins/README.md:7`）；支持市场、自动更新、`claude plugin install`、`plugin eval`（`CHANGELOG.md:579`、`CHANGELOG.md:105`）。
- Mods：插件的一种，行为写在 hooks 模块中，用 `register(on, options)` 挂引擎事件，`($, e, next)` 形式；内置 `sec-default`、`diff`、`telemetry`、`agents-md`（`mods/README.md:3-13`）。CHANGELOG 宣布 “Claude Mods: plugins may now modify deeper behavior”（`CHANGELOG.md:996`）。
- 定时：会话内 cron/循环（`CHANGELOG.md:6947`）。
- 终端体验：Vim 模式（`CHANGELOG.md:9071`）、键位重绑（`CHANGELOG.md:7610`）、fullscreen、OSC 7501 工作状态（`CHANGELOG.md:370`）。

## 1.7 审查/验证

- `/diff`：内置 mod 在 transcript 旁展示未提交改动，逐文件 hunk，随编辑与命令刷新（`mods/README.md:11`）。
- `/code-review`：对正确性 bug 做分级审查，可指定 effort，`--comment` 把发现发到 GitHub PR 行内评论（`CHANGELOG.md:5170`）。
- `/ultrareview`：云端并行多代理审查，可审当前分支或指定 PR；`claude ultrareview` 可在 CI 非交互运行并以 0/1 退出（`CHANGELOG.md:5998`、`CHANGELOG.md:5769`）。
- Code Review 服务：GitHub PR 审查、`@claude review`、按仓库暂停、分析图表（`CHANGELOG.md:91-92`、`CHANGELOG.md:670`）。
- 测试：通过 Bash 运行（`CHANGELOG.md:49`）；本报告未发现 CLI 内置测试命令的文档入口。
- 用量/成本：`/usage` 展示计划用量和告警（`CHANGELOG.md:7650`、`CHANGELOG.md:112`）；`/cost` 展示成本与缓存命中原因（`CHANGELOG.md:347`、`CHANGELOG.md:1867`）；`/context` 展示上下文分布（`CHANGELOG.md:6843`）。
- 遥测：OpenTelemetry，含 `api_request`、`tool_result`、`user_prompt` 等事件；2.1.300 增加 GenAI 语义约定属性（`CHANGELOG.md:8`、`CHANGELOG.md:8373`）。

## 1.8 协作/共享/远程

- Remote Control：`claude remote-control` 把本机会话暴露给 claude.ai/手机/桌面端（`CHANGELOG.md:7200`）；可命名会话（`CHANGELOG.md:7012`）。
- 云会话/Cowork：Claude Desktop 的 Cowork 云会话，支持审批、Artifact、Chrome、定时任务（`CHANGELOG.md:47-55`、`CHANGELOG.md:614`、`CHANGELOG.md:2605`）。
- Web/移动：Claude Code on the web 与 session URL 归属（`CHANGELOG.md:8121`、`CHANGELOG.md:7675`）；`/teleport` 可从云会话转本地（`CHANGELOG.md:3744`）。
- Slack：Claude Tag（`CHANGELOG.md:86-90`）。
- 企业自托管：`claude self-hosted-runner` 把自有机器/容器变成 Web、移动、桌面会话的执行环境（`CHANGELOG.md:3708`）。
- 网关/策略：Claude apps gateway 的 `code` 策略、模型 allow/deny、spend limit、审计请求 ID（`CHANGELOG.md:287`、`CHANGELOG.md:376`、`CHANGELOG.md:3020`、`CHANGELOG.md:379`）。
- 共享 transcript：本地会话 transcript 记录每次 API 请求的 system prompt、工具与参数，便于复现（`CHANGELOG.md:71`）。

## 1.9 最新版本亮点（2.1.296–2.1.300）

- 2.1.300：mod 可绘制不进草稿的 `virtualText`、`$.ui.view({agentId})` 在主视图看 agent transcript、`prompt.change` hook、OTel GenAI 语义属性、`/advisor` 在 AWS 上可用（`CHANGELOG.md:5-12`）。
- 2.1.299：空闲压缩（200K+ token 闲置约 54 分钟先压缩），`CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` 可调阈值（`CHANGELOG.md:97-98`）。
- 2.1.296：子代理 frontmatter/`--agents` 支持 `autoCompactWindow`；`CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` 统一 workflow agent 模型（`CHANGELOG.md:288-289`）。
- 2.1.295：hooks 支持 `onFailure: "block"`（启动失败/超时/异常退出码可阻断动作）；OSC 7501 工作状态（`CHANGELOG.md:369-370`）。
- 2.1.292：Agent 工具新增 `effort` 参数，可按指定 effort 运行子代理（`CHANGELOG.md:580`）。

## 1.10 差异化能力

- 深层 Mods API：以函数 hooks 直接挂引擎事件与 `$` 名词，可改写/拒绝 agent、prompt、工具调用、UI、telemetry；内置 sec-default 还负责组织策略隔离（`mods/README.md:3-13`、`CHANGELOG.md:996`）。
- 动态工作流：脚本编排数十到数百 agent，后台运行，有 `/workflows`、并发上限、独立模型（`CHANGELOG.md:5011`、`CHANGELOG.md:2409`、`CHANGELOG.md:291`）。
- Agent Teams + tmux/iTerm2 teammate：真正的多终端协作代理（`CHANGELOG.md:7461`、`CHANGELOG.md:4556`）。
- `/goal` 长任务目标：跨轮持续、支持 `-p` 与 Remote Control（`CHANGELOG.md:5425`）。
- Artifact 发布 + Claude in Chrome：一个负责产出网页，一个负责操作真实浏览器（`CHANGELOG.md:58`、`CHANGELOG.md:7928`）。
- Remote Control + 自托管 runner + Claude Tag：覆盖手机、桌面、Slack、企业内网（`CHANGELOG.md:7200`、`CHANGELOG.md:3708`、`CHANGELOG.md:86`）。
- 空闲压缩：在缓存过期前主动压缩，降低下一轮重算成本（`CHANGELOG.md:97`）。

## 1.11 “编码模式”与“工作/通用模式”语义

- **没有名为 Work mode 的开关**。CLI 的模式轴是“计划/权限”（Plan、Auto、Accept edits、Bypass、Safe、Bare），不是“编码/通用”（`CHANGELOG.md:7758`、`CHANGELOG.md:5486`、`CHANGELOG.md:4782`、`CHANGELOG.md:6636`）；`rg -i 'work mode' CHANGELOG.md` 无命中。
- 编码面：终端 CLI/TUI、IDE、Claude Desktop 的 Code tab（`README.md:7`、`CHANGELOG.md:8084`、`CHANGELOG.md:287-288`）。
- 工作/通用面：Cowork 云会话（Claude Desktop）、claude.ai/Claude Code on the web、Slack 的 Claude Tag、Remote Control 的远端会话（`CHANGELOG.md:49`、`CHANGELOG.md:8121`、`CHANGELOG.md:86-90`、`CHANGELOG.md:7200`）。这些是独立产品面，不是 CLI 内的模式切换；本仓库未给出统一的 Work mode 定义，标记为“产品层概念、仓库内无定义”。

---

# 2. Codex（rust-v0.162.1）

## 2.1 产品形态、版本与文档

- 本地 CLI/TUI 编码代理（`README.md:1`）；IDE 支持 VS Code、Cursor、Windsurf（`README.md:6`）；桌面应用 `codex app`（`README.md:7`、`codex-rs/cli/src/main.rs:181`）；云端 Codex Web（`README.md:8`）。
- 另有 `codex app-server`（JSON-RPC 服务）、`codex remote-control`、`codex cloud`、`codex exec`、SDK（`codex-rs/cli/src/main.rs:174`、`:177`、`:229`、`:156`；`sdk/typescript/README.md:3-9`）。
- 文档：`docs/` 目录含 config、sandbox、skills、AGENTS.md、exec、execpolicy 等入口，但多数只有一句链接到 developers.openai.com（`docs/config.md:3-7`、`docs/sandbox.md:3`、`docs/skills.md:3`、`docs/agents_md.md:3`、`docs/exec.md:3`）。
- 本地 CHANGELOG 只有 Unreleased 一条，官方 release notes 在 GitHub Releases（`CHANGELOG.md:1-5`）。

## 2.2 会话与任务模型

- CLI 子命令覆盖：`agents`（浏览共享 daemon 上的所有会话）、`exec`、`review`、`resume`、`queue`、`archive`、`delete`、`unarchive`、`fork`、`cloud`、`remote-control`、`app`、`apply`、`sandbox`（`codex-rs/cli/src/main.rs:149-243`）。
- 会话内斜杠命令（按 UI 顺序）：`/new`、`/resume`、`/fork`、`/archive`、`/delete`、`/rename`、`/worktree`、`/app`、`/compact`、`/recap`、`/plan`、`/goal`、`/agents`、`/subagents`、`/side`、`/btw`、`/review`、`/diff`、`/mention`、`/status`、`/usage`、`/ps`、`/stop`、`/clear` 等（`codex-rs/tui/src/slash_command.rs:12-87`）。
- 队列：`codex queue --thread <id> --message <text>` 向已有会话排队消息，只支持文本、不支持图片附件（`codex-rs/cli/src/queue_cmd.rs:10-25`、`:38-40`）；服务端方法 `thread/queue/add`（`codex-rs/tui/src/session_queue_commands.rs:24`）。
- 回退：Esc/Enter 的 transcript backtrack 可回到较早 prompt 并重新编辑，属于“对话回退”，不是文件检查点（`codex-rs/tui/src/app_backtrack.rs:1-10`）；本文检索范围内未发现文件级 checkpoint/rewind 命令。
- 目标：`/goal` 设置长期任务目标，`ThreadGoal` 有 Active/Paused/Blocked/UsageLimited/BudgetLimited/Complete 状态、token budget、耗时（`codex-rs/tui/src/goal_display.rs:5-41`、`codex-rs/app-server-protocol/src/protocol/v2/thread.rs:800-827`）。
- 侧对话：`/side`、`/btw` 在临时 fork 中开侧对话（`codex-rs/tui/src/slash_command.rs:142-144`）。
- 后台终端：`/ps` 列出后台终端，`/stop` 停止（`codex-rs/tui/src/slash_command.rs:128-129`）。
- 归档/删除/恢复：CLI 与斜杠命令均支持（`codex-rs/cli/src/main.rs:207-225`、`codex-rs/tui/src/slash_command.rs:100-104`）。

## 2.3 执行模式与审批

- 协作模式只有两种：`Plan` 与 `Default`（`ModeKind`），`Default` 的 serde 别名包括 `code`、`pair_programming`、`execute`、`custom`；TUI 只显示这两种（`codex-rs/protocol/src/config_types.rs:674-703`）。
- Plan 模式是严格的“非变更”模式：允许读、搜索、静态分析、可写缓存的测试/构建，不允许编辑、格式化改写、apply patch、迁移等变更；最终计划用 `<proposed_plan>` 包裹（`codex-rs/collaboration-mode-templates/templates/plan.md:1-90`）。Default 模式倾向直接执行，只有 `request_user_input` 可用时才提问（`codex-rs/collaboration-mode-templates/templates/default.md:1-19`）。
- 审批策略：`AskForApproval` 有 `untrusted`、`on-request`（默认，别名 on-failure）、`granular`、`never`；granular 可分别控制 sandbox、execpolicy、skill、request_permissions、MCP elicitation（`codex-rs/protocol/src/protocol.rs:1002-1042`）。
- 沙箱：`read-only`（可带 network_access）、`workspace-write`（可加 writable_roots）、`danger-full-access`、`external-sandbox`（`codex-rs/protocol/src/config_types.rs:104-114`、`codex-rs/protocol/src/protocol.rs:1088-1120`）；另有 permission profile 抽象（`codex-rs/protocol/src/models.rs:421`）。
- 执行策略：`execpolicy` 子命令与 `policy` 规则，可在审批前静态判定命令（`codex-rs/cli/src/main.rs:200`、`docs/execpolicy.md:3`）。
- 自动审查（Guardian）：对命令、execve、stdin 写入、apply_patch、网络访问、MCP 调用、权限请求做 reviewer 模型评估，输出 allow/deny、风险级别、用户授权级别、理由；状态含 in_progress/approved/denied/timed_out/aborted（`codex-rs/protocol/src/approvals.rs:89-260`）。TUI 的 `/approve` 可批准一次最近的自动审查拒绝（`codex-rs/tui/src/slash_command.rs:24-25`、`codex-rs/tui/src/auto_review_denials.rs:1-30`）。
- 工作树：`/worktree` 启动/继续新工作树（`codex-rs/tui/src/slash_command.rs:105`）；`codex-rs/worktree` 提供 `WorktreeManager`、`ManagedWorktree`，TUI 有 managed worktree 工具（`codex-rs/worktree/src/lib.rs:24-50`、`codex-rs/tui/src/managed_worktree_tools.rs:1-10`）。

## 2.4 上下文

- `AGENTS.md`：项目指令文件，`/init` 可生成（`codex-rs/tui/src/slash_command.rs:95`、`docs/agents_md.md:3`）；核心有 `agents_md.rs`、`agents_md_manager.rs`（`codex-rs/core/src/agents_md.rs:1`、`codex-rs/core/src/agents_md_manager.rs:1`）。
- 记忆：两阶段管线，Phase 1 从 rollout 提取结构化记忆，Phase 2 全局合并，产物在 `~/.codex/memories/`，含 `raw_memories.md`、`rollout_summaries/`，并用 git 基线做 diff（`codex-rs/memories/README.md:29-80`）。
- 压缩：`/compact` 摘要对话，`/recap` 立即总结（`codex-rs/tui/src/slash_command.rs:96-97`）；核心有 compact/remote compaction 多个模块（`codex-rs/core/src/compact.rs`、`compact_remote_v2.rs`）。
- 技能：`/skills` 使用技能改进特定任务（`codex-rs/tui/src/slash_command.rs:114`）；`codex-rs/skills` 负责加载、frontmatter、显式/隐式调用（`codex-rs/skills/src/lib.rs:1-40`）。
- @ 提及：`/mention` 提及文件（`codex-rs/tui/src/slash_command.rs:113`）；`mention_syntax.rs` 在 core（`codex-rs/core/src/mention_syntax.rs`）。
- 文件搜索：`codex-rs/file-search` 用 nucleo 做模糊匹配，不依赖语义索引（`codex-rs/file-search/src/lib.rs:1-20`）。
- 仓库索引：本文检索范围内未发现持久化语义索引；以 AGENTS.md、记忆、文件搜索、工具读取为主，标记为“未发现”。
- MCP：`/mcp`、`/mcp login <name>`，支持 OAuth 与工具发现（`codex-rs/tui/src/slash_command.rs:152`、`git log → 4773a132c3 Add /mcp login <name> to the TUI`）。

## 2.5 多智能体

- 多代理工具：`spawn_agent`、`send_message`、`wait`、`close_agent`，并有 V2 版本（`codex-rs/core/src/tools/spec_plan.rs:35-50`）；`/subagents` 在会话内切换子代理（`codex-rs/tui/src/slash_command.rs:141`）。
- Agent 角色：`codex-rs/agent-roles` 支持角色文件、描述、昵称候选、角色专属 config layer（`codex-rs/agent-roles/src/agent_role_config.rs:1-30`）。
- Agent 命令中心：`/agents` 打开命令中心，0.162 增加共享任务 pinning（`codex-rs/tui/src/slash_command.rs:140`、`git log → 7298a6e020 Add shared task pinning to the agent command center`）。
- 远程消息板：`codex-rs/agent-message-board-client` 为多代理会话提供远程消息板，凭据按会话隔离（`codex-rs/agent-message-board-client/src/lib.rs:1-12`）。
- 工作树：见 2.3；TUI 的 managed worktree 工具可创建/列出/附加（`codex-rs/tui/src/managed_worktree_tools.rs:1-10`）。
- 并行/编排：多代理 V2 开关 `Feature::MultiAgentV2`（`codex-rs/features/src/lib.rs:1421`），并有 `agent-graph-store` 记录代理图（`codex-rs/agent-graph-store`）。

## 2.6 工具

- Shell/终端：unified exec，支持 PTY、stdin、后台进程、等待/输出（`codex-rs/core/src/unified_exec`）；`/ps` 管理后台终端（`codex-rs/tui/src/slash_command.rs:128`）。
- 文件编辑：`apply_patch` 支持流式解析、preserve line endings（`codex-rs/apply-patch/src/lib.rs:1-30`、`codex-rs/features/src/lib.rs:1279`）；`codex apply` 把 agent 的 diff 以 `git apply` 应用（`codex-rs/cli/src/main.rs:204`）。
- Git：`/diff` 展示含未跟踪文件的 git diff（`codex-rs/tui/src/slash_command.rs:112`）；`Feature::CodexGitCommit`（`codex-rs/features/src/lib.rs:1213`）。
- MCP/插件/应用：`/mcp`、`/plugins`、`/apps`（`codex-rs/tui/src/slash_command.rs:152-154`）；插件市场支持 add/list/upgrade/remove（`codex-rs/cli/src/marketplace_cmd.rs:1-40`）。
- Hooks：12 个事件：PreToolUse、PermissionRequest、PostToolUse、PreCompact、PostCompact、SessionStart、SessionEnd、UserPromptSubmit、SubagentStart、SubagentStop、Stop、Interrupt（`codex-rs/hooks/src/lib.rs:20-35`）。
- 浏览器：功能门控含 InAppBrowser、BrowserAnnotationApi、BrowserUse、BrowserUseFullCdpAccess、BrowserUseExternal；注释明确这些是 “desktop apps” 能力（`codex-rs/features/src/lib.rs:277-318`）。
- 语音：`/voice` 启动/停止语音（`codex-rs/tui/src/slash_command.rs:138`）；`realtime-webrtc`、`voice-host` crate（`codex-rs/realtime-webrtc`、`codex-rs/voice-host`）。
- Web 搜索：`Feature::WebSearchRequest`、`WebSearchCached`、`StandaloneWebSearch`（`codex-rs/features/src/lib.rs:1189-1207`）。
- 终端宠物：`/pets` 选择/隐藏终端宠物（`codex-rs/tui/src/slash_command.rs:127`、`codex-rs/tui/src/pets/mod.rs:1-12`）。

## 2.7 审查/验证

- `codex review` 非交互审查（`codex-rs/cli/src/main.rs:159`）；`/review` 审查当前改动（`codex-rs/tui/src/slash_command.rs:98`）。
- Guardian 自动审查：对所有高风险审批动作做模型评估，是“审批闸门”而非代码审查（`codex-rs/protocol/src/approvals.rs:89-260`）；`/approve` 允许一次重试（`codex-rs/tui/src/slash_command.rs:24-25`）。
- Diff：`/diff`、`get_git_diff.rs`、`diff_model.rs`（`codex-rs/tui/src/get_git_diff.rs`、`codex-rs/tui/src/diff_model.rs`）。
- Artifact：未发现 artifact 发布能力；MCP App UI 可记录 widget 的 `resourceUri` 与显示模式（`codex-rs/app-server/README.md:10-20`），不等同于 artifact 托管。
- 用量：`/usage`、`/status` 显示账户用量与 token（`codex-rs/tui/src/slash_command.rs:119-122`）；OTel crate 提供指标与 trace（`codex-rs/otel/src`）。
- 测试：通过 shell/unified exec 运行（`codex-rs/core/src/unified_exec`）；本报告未发现内置测试命令的文档入口。

## 2.8 协作/共享/远程

- Remote Control：`codex remote-control start|stop|pair`，把本机 app-server daemon 暴露给远程，配对码短期有效（`codex-rs/cli/src/main.rs:177`、`codex-rs/cli/src/remote_control_cmd.rs:40-75`）。
- App Server：`codex app-server` 作为 JSON-RPC 服务供 IDE/桌面/自定义客户端使用，支持 daemon、proxy、TS/JSON schema 生成（`codex-rs/cli/src/main.rs:174`、`:1298-1432`）。
- 云端：`codex cloud` 浏览 Codex Cloud 任务并把改动应用到本地（`codex-rs/cli/src/main.rs:229`）；`cloud-tasks` crate（`codex-rs/cloud-tasks`）。
- 桌面：`codex app [path]` 打开桌面应用，未安装则拉起安装器（`codex-rs/cli/src/app_cmd.rs:1-24`）。
- SDK：TypeScript SDK 通过子进程 + JSONL 事件嵌入 Codex；Python SDK 同目录（`sdk/typescript/README.md:3-9`、`sdk/python/README.md`）。
- Slack/Linear/GitHub：只在 analytics 标签与测试 fixture 中出现（`codex-rs/tui/src/analytics/normalize.rs:336-341`），未在本仓库发现对应的用户侧集成实现，标记为“产品层、实现未验证”。

## 2.9 最新版本亮点（0.161.0 → 0.162.1）

- 0.162.1 只有 3 个提交，全部是修复/稳定性（`git log --oneline rust-v0.162.0..rust-v0.162.1 → 092d3ac、f715d50、1a1335e`），没有新功能。
- 0.162.0 窗口内的用户可见变化（`git log --oneline rust-v0.161.0..rust-v0.162.0`）：
  - Agent 命令中心支持共享任务 pinning（`7298a6e020`）。
  - Guardian 支持可选 JSON transcript 格式（`61969074a7`）。
  - JavaScript code mode 增加 ranked tool discovery（`4d15794336`）。
  - TUI 增加 managed worktree 工具（`e7ea5f4a86`）。
  - V2 子代理支持 dynamic tool inheritance（`e4e33a56b0`）。
  - 云端 thread resume/attach 增加原生 gRPC 客户端（`b707714ae4`）。
  - 浏览器扩展请求头纳入配置要求（`a6c5f3a9fa`）。
- 0.161.0 窗口内：Daybreak 状态与切换、语音麦克风/音频设备选择、`/mcp login <name>`、远程 agent 消息板、Guardian 缓存审批（`git log --oneline rust-v0.160.0..rust-v0.161.0`：`8ea2428c38`、`e53e932dc8`、`4773a132c3`、`68e1a421f5`、`4f16bdc265`）。

## 2.10 差异化能力

- Guardian 自动审批审查：不是简单 allow/deny，而是带风险级别、用户授权级别、理由和状态机的 reviewer 模型（`codex-rs/protocol/src/approvals.rs:89-260`）。
- Plan 模式“决策完备”规范：计划必须详细到另一个工程师/代理可直接实施，且用 `<proposed_plan>` 结构化输出（`codex-rs/collaboration-mode-templates/templates/plan.md:1-90`）。
- JavaScript code mode：模型可写 JS 调用工具，支持 ranked tool discovery、promise settlement 流式辅助（`codex-rs/code-mode-protocol/src/description.rs:20-30`、`git log → 4d15794336`、`28a264fbc7`）。
- 多代理 V2 + 角色文件 + 远程消息板：`spawn_agent/send_message/wait/close_agent`、agent roles、message board 三层（`codex-rs/core/src/tools/spec_plan.rs:35-50`、`codex-rs/agent-roles/src/agent_role_config.rs:1-30`、`codex-rs/agent-message-board-client/src/lib.rs:1-12`）。
- TUI 内 managed worktree + 会话归档/队列：把 worktree、archive、queue 做成 CLI 原生操作（`codex-rs/cli/src/main.rs:207-225`、`codex-rs/tui/src/managed_worktree_tools.rs:1-10`）。
- app-server + Remote Control + SDK：同一 agent 核心可被 IDE、桌面、远程、脚本复用（`codex-rs/cli/src/main.rs:174-177`、`sdk/typescript/README.md:3-9`）。

## 2.11 “编码模式”与“工作/通用模式”语义

- CLI 内只有 `Default`（别名 code/execute）与 `Plan` 两种协作模式，没有 Work 模式（`codex-rs/protocol/src/config_types.rs:674-703`）。
- 但产品层存在 Work 家族：analytics 明确有 `work_web`、`work_desktop`、`work_mobile` 以及 `work` 标签（`codex-rs/tui/src/analytics/normalize.rs:331-343`），app-server 测试使用 `codex_work_desktop` 作为 originator（`codex-rs/app-server/tests/suite/v2/thread_start.rs:367`、`:408`）。
- 桌面端功能门控包含 InAppBrowser、InAppChat、InAppVoice、InAppLocalAutomation（`codex-rs/features/src/lib.rs:277-302`），`projectless.rs` 为“非项目文件夹”选择桌面式执行默认值（`codex-rs/tui/src/projectless.rs:1-3`）。这证明 Codex 有“工作/通用”产品面，但其 UI、任务模型与提示词语义不在本仓库，标记为“仓库内无定义、未验证”。
- 结论：本仓库可直接验证的是“编码 CLI + Default/Plan”；Work 模式是仓库外的产品面，只能从 analytics/originator/feature gate 看到痕迹。

---

# 3. Kimi Code（2.1.1-6-ga940f2ff0）

## 3.1 产品形态、版本与文档

- 单二进制 CLI/TUI，官方强调“single-binary distribution”“blazing-fast startup”“purpose-built TUI”（`README.md:55-57`）。
- 编辑器和 IDE：通过 `kimi acp` 以 Agent Client Protocol 接入 Zed、JetBrains 等（`README.md:63-84`）；仓库内也有 VS Code 扩展（`apps/vscode/package.json:2-6`）。
- Web：`kimi web` 启动本机 Web UI，默认绑定 loopback，使用 URL fragment token 认证（`docs/en/reference/kimi-command.md:156-181`）。
- 远程：`kimi rc`/`kimi remote`/`kimi web --remote-control`，通过 Kimi 中继在手机/其他设备上控制本机会话（`docs/en/guides/remote-control.md:3-20`）。
- 桌面：`kimi install-desktop`/`/desktop` 打开桌面应用下载页（`docs/en/reference/slash-commands.md:45`、`docs/en/reference/kimi-command.md:199-207`）。
- 会话可视化：`kimi vis` 启动浏览器可视化器（`docs/en/reference/kimi-command.md:284-308`）。
- 文档：`docs/en/` 分 configuration/customization/guides/reference/release-notes，共 28 个 Markdown 文件（`find docs/en -name '*.md' | wc -l → 28`）；中文文档在 `docs/zh/`。

## 3.2 会话与任务模型

- 新建/恢复：`kimi` 新建；`kimi --continue` 恢复当前目录最近会话；`kimi --session [id]` 指定或打开选择器（`docs/en/guides/sessions.md:38-60`）。
- 会话内：`/new`（别名 `/clear`）、`/sessions`（别名 `/resume`）、`/title`（别名 `/rename`）（`docs/en/reference/slash-commands.md:30-38`）。
- 分叉：`/fork` 复制完整对话为独立会话，当前会话不受影响；fork 不复制 `/goal`（`docs/en/guides/sessions.md:80-90`）。
- 回退：`/undo` 撤销最近 prompt，可回滚 todo 与 plan 状态，但**不回滚代码改动**；压缩前的 prompt 不能撤销（`docs/en/reference/slash-commands.md:36`）。
- 压缩：自动压缩 + `/compact [instruction]`（`docs/en/guides/sessions.md:66-77`）。
- 导出：`kimi export` 打包会话为 ZIP；`/export-debug-zip`、`/export-md`（`docs/en/guides/sessions.md:92-113`、`docs/en/reference/slash-commands.md:40-41`）。
- 后台任务：`Bash` 支持 `run_in_background`，`TaskList/TaskOutput/TaskStop` 管理；任务完成自动通知（`docs/en/reference/tools.md:119-132`）。
- 目标：`/goal` 跨轮持续，支持 pause/resume/cancel/replace/next，goal 有 token/time 预算（`docs/en/guides/interaction.md:97-123`）。
- 队列/插话：`Ctrl-S` 把输入注入正在运行的 turn；`UserPromptQueued` hook 事件表示排队（`docs/en/guides/interaction.md:131-135`、`docs/en/customization/hooks.md:111`）。
- 归档：SessionEnd 的 matcher 支持 `archive`（`docs/en/customization/hooks.md:120`）；会话选择器支持 Ctrl+X 删除（`docs/en/release-notes/changelog.md:96`）。

## 3.3 执行模式与审批

- 三种权限模式（`docs/en/guides/interaction.md:67-71`）：
  - Always Ask（原 Manual，默认）：只读自动放行，编辑/命令逐项确认。
  - Ask When Needed（原 YOLO，`/yolo`）：常规工具调用自动放行，但敏感文件、危险命令（`shutdown`、`rm -rf`）和退出 Plan 仍会询问。
  - Never Ask（原 Auto，`/auto`）：全部自动，包括敏感文件与 Plan 退出，agent 不再提问；危险命令也直接运行。
- Plan 模式：先出计划并等待批准，`Shift-Tab` 或 `/plan` 切换，`/plan clear` 清除；Plan 模式下 `Write/Edit` 只能写 plan 文件，`TaskStop` 被禁止（`docs/en/guides/interaction.md:76-83`、`docs/en/reference/tools.md:73`）。
- Shell 模式：输入框输入 `!` 直接跑 shell，输出进入上下文；`Ctrl+B` 转入后台（`docs/en/guides/interaction.md:85-95`）。
- Goal 模式：面向“必须变成真的”的结果，跨轮持续，有 blocked/paused/complete 终态（`docs/en/guides/interaction.md:97-123`）。
- 审批持久化：审批面板提供 “Approve for this session”（`docs/en/guides/interaction.md:60`）；永久 allow/deny 写在配置文件（`docs/en/guides/interaction.md:62`）。
- 沙箱：**没有 OS 级沙箱**。系统提示明确 “The environment is not a sandbox: your actions take effect on the user's system immediately.”（`packages/agent-core-v2/src/app/agentProfileCatalog/system.md:59`）。安全边界依赖权限规则、工作区信任、symlink 越界阻断、仓库 git 配置不执行命令（`docs/en/release-notes/changelog.md:20-22`）。

## 3.4 上下文

- `AGENTS.md`：全局 `$KIMI_CODE_HOME/AGENTS.md`、跨工具 `~/.agents/AGENTS.md`、项目级 `AGENTS.md`/`.kimi-code/AGENTS.md`（`docs/en/customization/agents.md:197`）；`/init` 生成 AGENTS.md（`docs/en/reference/slash-commands.md:39`）。
- 主 agent 提示词覆盖：`$KIMI_CODE_HOME/SYSTEM.md` 可整体替换默认主 agent 的 system prompt（`docs/en/customization/agents.md:156-168`）。
- 自定义 agent：文件 frontmatter 声明 name/description/tools/disallowedTools，作用域优先级 Explicit > Project > Extra > User > Plugin > Built-in（`docs/en/customization/agents.md:50-124`）。
- 压缩：`max_context_size`、`max_input_size`、`reserved_context_size`、`loop_control.compaction_max_attempts` 可配（`docs/en/configuration/config-files.md:151-152`、`:323-330`）。
- @ 文件引用：`@` 触发路径补全，git/非 git 目录都可用，隐藏路径包含、`.git` 排除；快速搜索 helper 未下载完时回退到基本文件扫描（`docs/en/guides/interaction.md:44-50`）。
- 技能：目录式 `SKILL.md` 或扁平 `.md`；扫描目录含 `$KIMI_CODE_HOME/skills/`、`~/.agents/skills/`、项目 `.kimi-code/skills/`、`.agents/skills/`（`docs/en/customization/skills.md:85-97`）。
- 记忆：未发现独立持久记忆工具/记忆库；持久指令由 AGENTS.md、SYSTEM.md、技能与会话历史承担（`rg -n -i 'memory tool|persistent memory|long-term memory' docs/en` 无结果）。标记为“无独立记忆”。
- 仓库索引：未发现语义索引；有 `@` 文件快速搜索 helper（`docs/en/guides/interaction.md:50`）与会话全局搜索（minidb search worker，`docs/en/release-notes/changelog.md:134`），二者都不是代码库向量索引。

## 3.5 多智能体

- 主 agent + 子代理：内置 `coder`、`explore`、`plan`；`explore` 只读，`plan` 连 shell 都没有；内置子代理不能再派生子代理（`docs/en/customization/agents.md:7-20`）。
- 子代理隔离：独立上下文，只看到主 agent 显式传入的任务描述，只把最终结果返回主上下文（`docs/en/customization/agents.md:33-40`）。
- 子代理工具：`Agent` 支持 `subagent_type`、`resume`、`run_in_background`、`model`；`AgentSwarm` 可按 item 启动多个子代理（`docs/en/reference/tools.md:89-105`）。
- Swarm：`/swarm on|off`、`/swarm <task>`，turn 正常结束后自动关闭（`docs/en/reference/slash-commands.md:55-56`）。
- Tower：实验性多 agent 编排，`/tower` 可指定 base branch；工具集 `TowerPlan/TowerSpawn/TowerMerge/TowerTeardown/TowerSend/TowerInbox/TowerFinding/TowerReview/TowerMission/TowerStatus`（`docs/en/release-notes/changelog.md:144`、`packages/agent-core-v2/src/features/tower/tower.ts:3-14`）。Tower worker 在独立 worktree 中执行 mission，reviewer 审 branch，merge 前有 review gate（`packages/agent-core-v2/src/features/tower/tools/spawn/spawn.ts:1-40`、`apps/kimi-code/CHANGELOG.md:251`）。
- 编排/审批：子代理权限继承主 agent 的 always-allow 规则；`Agent` 工具默认允许（`docs/en/customization/agents.md:44-48`）。

## 3.6 工具

- 文件：`Read`、`Write`、`Edit`、`Grep`（ripgrep）、`Glob`、`ReadMediaFile`；读有 100k 字符默认/500k 上限，写前需先读（`docs/en/reference/tools.md:12-30`）。
- Shell：`Bash` 支持 cwd、timeout、`run_in_background`、`disable_timeout`；前台超时默认转后台（`docs/en/reference/tools.md:50-63`）。
- Web：`WebSearch`、`FetchURL`，需要 host 注入实现（`docs/en/reference/tools.md:66-69`）。
- Plan：`EnterPlanMode`、`ExitPlanMode`，退出时提交计划并让用户选择 1–3 个方案（`docs/en/reference/tools.md:71-75`）。
- 状态：`TodoList` 维护可见任务清单（`docs/en/reference/tools.md:77-83`）。
- 协作：`Agent`、`AgentSwarm`、`AskUserQuestion`、`NotifyUser`、`Skill`（`docs/en/reference/tools.md:85-105`）。
- MCP：stdio/HTTP/SSE 三种连接；用户级 `~/.kimi-code/mcp.json` 与项目级 `.kimi-code/mcp.json`；`/mcp-config` 交互式编辑（`docs/en/customization/mcp.md:20-60`）。
- 插件：`/plugins` 面板，Installed/Official/Curated/Custom 四页；支持本地目录、zip URL、GitHub 仓库 URL；插件可含 skills、agents、MCP、hooks、命令（`docs/en/customization/plugins.md:5-80`）。
- Hooks：`[[hooks]]` 配置，事件含 UserPromptSubmit、UserPromptQueued、PreToolUse、Stop、TurnStarted、PostToolUse、PostToolUseFailure、PermissionRequest、PermissionResult、SessionStart、SessionEnd、SessionHeartbeat、SubagentStart、SubagentStop、TaskStarted、StopFailure、Interrupt、PreCompact、PostCompact、Notification（`docs/en/customization/hooks.md:110-130`）。
- 浏览器：Kimi Browser Extension（原 Kimi WebBridge）驱动用户真实浏览器，保留登录态和 cookie（`docs/en/customization/plugins.md:169-196`）。
- 计算机使用：server API 注册 `kimi-cu`（Kimi Computer Use）与 `kimi-webbridge` 能力（`docs/en/reference/server-api.md:1374`）。

## 3.7 审查/验证

- 未发现内置 `/review` 代码审查命令；斜杠命令表中没有 `/review`（`docs/en/reference/slash-commands.md:26-63`）。
- Tower 内有 `TowerReview` 工具与 review-to-merge gate（`packages/agent-core-v2/src/features/tower/tower.ts:3-14`、`apps/kimi-code/CHANGELOG.md:251`）。
- 代码审查可通过技能/MCP/自定义 agent 实现；仓库提供 `review-pr` 技能示例（`docs/en/customization/skills.md:146`）。
- 可视化：`kimi vis` 在浏览器逐事件查看会话（`docs/en/reference/kimi-command.md:284-308`）。
- 导出：Markdown/ZIP 调试包（`docs/en/guides/sessions.md:92-113`）。
- 用量：`/usage` 显示 token、上下文、配额（`docs/en/reference/slash-commands.md:107`）。
- 遥测：`packages/telemetry` 与 `/status`；具体上传策略未在本次调查展开，标记为未验证（`docs/en/reference/slash-commands.md:108`）。

## 3.8 协作/共享/远程

- Remote Control：`kimi rc`、`kimi web --remote-control`、`/remote-control`；任务始终在本机执行，网页只是遥控窗口；同一账号约 3 台设备（`docs/en/guides/remote-control.md:3-20`、`:58`）。
- Kimi Code Web：`kimi web` 本机/局域网 Web UI，与 CLI 共享登录、配置、会话（`docs/en/guides/web.md:3-60`）。
- ACP：Zed/JetBrains 等编辑器通过 stdio JSON-RPC 驱动会话（`docs/en/reference/kimi-command.md:148-154`）。
- VS Code 扩展：`apps/vscode`（`apps/vscode/package.json:2-6`）。
- 桌面应用：`kimi install-desktop` 打开下载页，桌面端源码不在本仓库（`docs/en/reference/kimi-command.md:199-207`）。
- 共享：`kimi export` ZIP 可分享/归档/报 bug（`docs/en/guides/sessions.md:92-103`）。

## 3.9 最新版本亮点（2.0.0–2.1.1）

- 2.1.0：实验性 fullscreen TUI，可在 `/settings` 或 `~/.kimi-code/tui.toml` 设 `tui_mode = "fullscreen"`；fullscreen 支持点击折叠块、Jump to bottom（`docs/en/release-notes/changelog.md:11-19`）。
- 2.1.1：恢复 config/workspace 文件 watcher 默认开启，可用 `[watch] enabled=false` 或 `KIMI_CODE_WATCH=0` 关闭（`docs/en/release-notes/changelog.md:7-9`）。
- 2.0.0：`/desktop` 与 `kimi install-app`；Mermaid 在终端渲染（`docs/en/release-notes/changelog.md:67-72`）。
- 0.42.0：Remote Control 正式常开，移除实验 flag；子代理模型池常开；minidb 会话索引与全局搜索常开（`docs/en/release-notes/changelog.md:127-134`）。
- 0.41.0：Web 端 Tower 多 agent 协作模式（实验），支持 base branch；Web 选择标注；会话评分（`docs/en/release-notes/changelog.md:144-150`）。
- 0.43.0：会话选择器 Ctrl+X 删除；`/undo`、Goal 预算与 compaction 重试上限等（`docs/en/release-notes/changelog.md:96-110`）。

## 3.10 差异化能力

- 视频输入：可直接粘贴视频让模型分析，是 TUI 交互文档明确列出的一等能力（`docs/en/guides/interaction.md:15`）；MiniMax 也有云端 `videos_understand` 视频理解工具，但入口不同（`packages/agent-tools/src/cloud/matrix-tools/tool-defs.ts:538`）。
- Tower 多 agent 编排：mission + worker worktree + reviewer branch + merge gate（`packages/agent-core-v2/src/features/tower/tower.ts:3-14`、`packages/agent-core-v2/src/features/tower/tools/spawn/spawn.ts:1-40`）。
- Remote Control + Web UI + ACP + VS Code：同一会话可从终端、浏览器、手机、IDE 进入（`docs/en/guides/remote-control.md:3-20`、`docs/en/guides/web.md:3-60`、`docs/en/reference/kimi-command.md:148-154`、`apps/vscode/package.json:2-6`）。
- 单二进制 + 极速 TUI：官方主打无需 Node.js、毫秒级启动（`README.md:55-57`）。
- AI 原生 MCP 配置：`/mcp-config` 会话式增删改与 OAuth（`README.md:59`、`docs/en/customization/mcp.md:60`）。
- 浏览器扩展：驱动用户真实浏览器，保留登录态（`docs/en/customization/plugins.md:169-196`）。
- 无 OS 沙箱的“真机执行”定位：系统提示明确不是沙箱（`packages/agent-core-v2/src/app/agentProfileCatalog/system.md:59`）。

## 3.11 “编码模式”与“工作/通用模式”语义

- Kimi Code 是纯编码 CLI，没有“编码/工作”双模式开关（`README.md:10`、`docs/en/reference/slash-commands.md:47-57`）。
- 它的模式轴是权限（Always Ask / Ask When Needed / Never Ask）、Plan、Shell、Goal、Swarm、Tower（`docs/en/guides/interaction.md:67-123`、`docs/en/reference/slash-commands.md:50-56`）。
- `kimi web`/Remote Control 是同一编码会话的不同入口，不是通用工作模式（`docs/en/guides/web.md:3-8`、`docs/en/guides/remote-control.md:3`）。
- `/btw` 是侧对话（fork 子 agent），不是通用工作模式（`docs/en/reference/slash-commands.md:106`）。结论：**无独立工作/通用模式**。

---

# 4. MiniMax Code（v0.6.5）

## 4.1 产品形态、版本与文档

- 交互式 TUI `mcode`、headless `mcode exec`、ACP `mcode acp` 三个入口（`README.md:143-147`）。
- 桌面应用独立存在，仓库只托管其 issue，桌面源码不在公开仓库（`README.md:298`）。
- BYOK：支持 OpenAI-compatible（chat completions/responses）与 Anthropic messages（`README.md:99-103`）。
- 文档：`docs/README.md` 索引 installation/examples/tui-capabilities/telemetry/architecture 等（`docs/README.md:5-14`）；TUI CHANGELOG 在 `packages/tui/CHANGELOG.md`。
- 版本证据：`git describe --tags` → `v0.6.5`；`packages/tui/package.json:3` → `0.6.5`；但 CHANGELOG 最新 0.5.5，README 仍写 0.4.12 source preview，存在文档滞后（见第 0 节）。

## 4.2 会话与任务模型

- 恢复：`mcode --continue` 恢复当前工作区最近会话；`mcode --session` 打开选择器；TUI 内 `/sessions`（`README.md:171-181`）。
- 分叉：`/fork` 从当前会话分叉，可选择隔离 worktree；仅 coding 模式可用 worktree（`packages/tui/src/tui/commands/catalog.ts:226-233`、`packages/local-runtime-v2/src/infra/git/fork-worktree-adapter.ts:225-226`）。
- 回退/编辑：`/rewind` 可选择历史范围并回退（会话和/或工作区）；`/edit` 编辑之前的消息并重发（`packages/tui/src/tui/commands/catalog.ts:235-252`、`packages/tui/CHANGELOG.md:475`、`:607`）。
- 归档：`/archive`（内部命令，`packages/tui/src/tui/commands/catalog.ts:275-280`）。
- 队列/插话：Enter 发送或 steer 正在运行的任务；Alt+Enter 排队；`/queue` 管理等待消息（`README.md:185-186`、`packages/tui/src/tui/commands/catalog.ts:512-519`）。
- 目标：`/goal` 设置可持续目标，支持 pause/resume/edit/clear/budget（`packages/tui/src/tui/commands/catalog.ts:161-175`、`packages/tui/src/application/thread-goal-command.ts:7-24`）。
- 后台任务：`/tasks` 统一查看 Agent Team 与 Runtime 后台工作，可下钻子会话 transcript（`packages/tui/CHANGELOG.md:390-392`）。
- 侧对话：`/btw`/`/side` 在不打断主任务的情况下开侧会话（`packages/tui/src/tui/commands/catalog.ts:204-215`）。
- 定时任务：源码存在 cron 模块（`packages/agent-modules/cron`）与 `mavis` 的 cron 命令，但嵌入式 CLI 关闭 Cron 适配器（`packages/agent-modules/system-reminder/src/types.ts:348-354`）；斜杠命令目录未列 cron（`packages/tui/src/tui/commands/catalog.ts:116-523`）。标记为“桌面/云端能力，TUI 未暴露”。

## 4.3 执行模式与审批

- 权限模式三种：Ask（`default`）、Auto（`auto`）、Full access（`bypassPermissions`），另有 `off`；Alt+M 切换，`/permission [status|ask|auto|full]`（`packages/tui/src/application/permission-mode.ts:1-17`、`packages/tui/src/tui/commands/catalog.ts:304-316`、`README.md:190`）。
- Auto 模式：云端分类器 + 本地规则，分类器失败时回退到确认（`docs/tui-capabilities.md:78`）。
- Plan 模式：`/plan [on|off|status|view]`，Shift+Tab 切换；Plan 模式与 Ask 模式的 turn 结算在 0.6.x 修复（`packages/tui/src/tui/commands/catalog.ts:176-188`、`git log → f7483f5 feat: add launch-scoped system prompt overrides and fix Ask/Plan turn settlement`）。
- Goal 模式：跨轮自动继续，可用 token budget 限制（`packages/tui/src/tui/commands/catalog.ts:161-175`）。
- 沙箱：基于 `third_party/sandbox-runtime`（pinned `0.0.74-mcode.2`），保留 SecurityServer、独立 unlink 作用域、deny-first 网络策略、净化的 baseEnv、即使关闭网络代理也保护文件（`third_party/sandbox-runtime/README.md:3-12`）；macOS 有真实 `sandbox-exec` 与 Git 探针测试（`docs/verification.md:31`）。
- 审批持久化：`/allow`（一次）、`/always`（同类永久）、`/deny`（`packages/tui/src/tui/commands/catalog.ts:478-503`）；还有 `permissions` 面板查看待处理请求（`:499-503`）。

## 4.4 上下文

- `AGENTS.md`：全局 agent 指令在 data dir 的 `AGENTS.md`（`packages/local-runtime-v2/src/service/turn-system/persistence/global-instructions.ts:26-31`）；项目级 AGENTS.md 由 system-reminder 注入（`packages/agent-modules/system-reminder/src/types.ts:159`）；`mcode init .` 生成/更新项目指导（`README.md:141`）。
- 记忆工具：`memory` 支持 target=user|main|topic|summary，操作 read/search/append/edit/create/delete/write；user append 需要 reason，summary write 需要确认（`packages/agent-tools/src/desktop/builtin-defs.ts:296-320`）。系统提示把记忆分为 Project memory（AGENTS.md/topic）与 Agent memory（native memory 工具）（`packages/local-runtime-v2/assets/agents/mavis/features/memory.md.hbs:1-40`）。
- 压缩：自动压缩 + `/compact [instructions]`（`packages/tui/src/tui/commands/catalog.ts:280-295`）；大上下文模型预留回复空间并更早压缩（`packages/tui/CHANGELOG.md:10-21`）。
- @ 提及：`@` 引用工作区文件/目录（`README.md:188`）。
- 技能：工作区 `.agents/skills`、`.claude/skills`、`.minimax/skills`，支持目录 symlink；`SKILL.md` 必须是普通文件（`docs/tui-capabilities.md:143-150`）。ACP 会话也会收到启用的 Skills 作为斜杠命令（`docs/tui-capabilities.md:153-165`）。
- 仓库索引：公开分发包**移除**了后台工作区索引与语义搜索工具，不再上传工作区快照/ZIP；仅保留用户主动的文件读取、搜索与 Git（`docs/tui-capabilities.md:167-171`）。
- MCP：项目 `.mcp.json` 自动加载，`/mcp` 显示配置来源与连接状态（`packages/tui/CHANGELOG.md:163-164`）；`mcp_invoke`、`tool_search` 做 MCP 工具暴露与检索（`packages/agent-tools/src/mcp-disclosure/mcp-invoke.ts:83`、`packages/agent-tools/src/mcp-disclosure/tool-search.ts:27-54`）。

## 4.5 多智能体

- 内置角色：`mavis`（广谱/混合任务）、`explore`（只读地图）、`worker`（有明确范围的生产工作）、`verifier`（独立验证交付物，不改项目文件）（`packages/shared/src/subagent-roles.ts:1-22`）。
- 子代理工具：`task`、`task_append`、`task_query`、`task_output`、`task_stop`，支持后台与续写（`packages/agent-tools/src/desktop/builtin-defs.ts:593-700`）。
- Agent Team：TUI 有 Agent Team 面板与摘要（`packages/tui/src/tui/agent-team/panel.ts:21-36`、`packages/tui/src/tui/agent-team/summary.ts:30-60`）；`/tasks` 统一下钻子会话（`packages/tui/CHANGELOG.md:390-392`）。
- 隔离：`/fork` 可选隔离 worktree（`packages/tui/src/tui/commands/catalog.ts:226-233`、`packages/local-runtime-v2/src/infra/git/fork-worktree-adapter.ts:225-226`）。
- 编排：Goal 会自动继续；`mavis` 工具提供 `agent list` 等发现能力（`packages/shared/src/subagent-roles.ts:72`）。

## 4.6 工具

- 基础工具：`read`、`write`、`edit`、`bash`、`grep`、`glob`、`todowrite`、`skill`、`code_review`、`memory`、`ask_user`、`request_feature_enable`、`web_fetch`、`task*`、`mavis`（`packages/agent-tools/src/desktop/builtin-defs.ts:19-946`）。
- Web：`web_search`（`packages/agent-tools/src/shared/web-search.ts:5`）、`web_fetch`（`packages/agent-tools/src/desktop/builtin-defs.ts:471`）。
- 媒体生成/理解：Matrix 工具含图像理解、图像生成、图像搜索/反搜、视频生成/理解、语音列表、TTS、音乐生成、音频转写等（`packages/agent-tools/src/cloud/matrix-tools/tool-defs.ts:72-556`）。需要账户权限/额度（`README.md:251`）。
- 浏览器：桌面端内置浏览器工具 `browser`、`browser_inspect`、`navigate`、`click`、`type`、`press_key`、`scroll`、`hover`、`wait_for`、`get_dom`、`screenshot`、`paste`、`verify_text` 等（`packages/agent-tools/src/desktop/builtin-browser-defs.ts:780-995`）；`browser-core` 用 CDP、语义树、快照等实现（`packages/browser-core/src/index.ts:1-30`）。这些属于桌面/本地运行时能力，TUI 能力表未列浏览器（`docs/tui-capabilities.md:66-81`），TUI 是否装配未验证。
- 部署：`website_deploy`（`packages/agent-tools/src/desktop/local-website-deploy.ts:94`）。
- MCP：见 4.4。
- Hooks：与 Plugin 格式兼容的生命周期 hooks，TUI 可显示 `systemMessage`（`docs/hooks.md:1-70`）；事件包括 SessionStart/UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/SubagentStart/SubagentStop/PostCompact/Stop 等（`docs/hooks.md:59-70`）。
- 插件：`/plugins` 与 `mcode plugin` 管理 official/local 两个来源；GitHub URL/任意市场导入未在 CLI/TUI 暴露（`docs/examples.md:191-230`）。
- 计划任务：cron 模块存在，但 TUI 关闭（见 4.2）。

## 4.7 审查/验证

- `/review` 审查 staged/unstaged/untracked 本地改动（`packages/tui/src/tui/commands/catalog.ts:189-193`）。
- `code_review` 工具：只审当前工作树相对 HEAD 的未提交改动，支持 inline 或隐藏子代理执行（`packages/agent-tools/src/desktop/builtin-defs.ts:274-296`）。
- 子代理 `verifier`：独立验证已有交付物并报告发现，不改项目文件（`packages/shared/src/subagent-roles.ts:17-20`）。
- `mcode exec review` 支持 `--effort`（`packages/tui/CHANGELOG.md:56-60`）。
- 用量：`/usage`、`/context`（`packages/tui/src/application/command-descriptors.ts:28-48`、`packages/tui/src/tui/commands/catalog.ts:449-453`）。
- 遥测：三类通道（usage/metrics/diagnostics）默认全关、分别 opt-in；`MCODE_DISABLE_TELEMETRY`/`DO_NOT_TRACK` 全局关闭（`docs/telemetry.md:1-20`）。
- 测试：通过 `bash` 运行（`packages/agent-tools/src/desktop/builtin-defs.ts:107`）；仓库自身有 14 道 verify gate（`docs/verification.md:31`），但这是产品仓库的 CI，不是用户侧测试框架。

## 4.8 协作/共享/远程

- ACP：`mcode acp` 接入 Zed 等 ACP 客户端（`README.md:147`）；ACP 支持会话 fork、模式/配置切换（`packages/tui/CHANGELOG.md:537`）。
- 桌面应用：独立产品，源码不在仓库；桌面端有 native Electron 控制、云会话 handoff 等能力，但公开分发包未启用/未包含（`docs/tui-capabilities.md:167-171`、`README.md:298`）。
- 远程控制：**未发现** TUI 的 remote-control/网页遥控功能（`rg -i 'remote-control|remote control' packages/tui/src docs` 无命中）；`docs/tui-capabilities.md:171` 明确 remote encrypted prompt updates、cloud session handoff、native Electron desktop control 不在公开分发范围。标记为“无远程控制”。
- 共享：`/export` 导出 Markdown（`packages/tui/src/tui/commands/catalog.ts:470-477`）；本报告未发现 artifact 托管/分享面板（斜杠命令目录 `packages/tui/src/tui/commands/catalog.ts:116-523` 未列）。
- 插件市场：official/local 两端，无 GitHub/任意市场导入（`docs/examples.md:223-230`）。

## 4.9 最新版本亮点（0.5.5–0.6.5）

- 0.5.5：Bash 自动转后台默认/最大总超时改为 1 小时；前台 60 秒返回 task ID 但不重置计时；自动压缩可靠性改进（`packages/tui/CHANGELOG.md:10-21`）。
- 0.6.0：`/retry` 可在 `/btw` 侧会话重发；默认模型改为 MiniMax-M3.1-Flash-Preview；Goal 完成后保留一个 turn 输出最终总结；provider 安全拒绝不重试并归类为 content_filter（`git show -s --format=%B 9150441`）。
- 0.6.1：sync 发布（`git log → ef2f43d feat: sync and release MiniMax Code 0.6.1`）。
- 0.6.3–0.6.5 窗口：0.6.3 新增 opt-in lightweight context mode（`git log → 4401b0e`，`git tag --contains 4401b0e` → v0.6.3）；launch-scoped system prompt overrides 与 Ask/Plan turn settlement 修复（`f7483f5`，v0.6.3）；每请求图片上限与会话恢复（`1852771`，v0.6.3）；模型请求首事件/空闲超时（`f07e6ef`，v0.6.3）。0.6.4 的 cron `once --after` 接受周单位（`56d2369`，v0.6.4）。0.6.5 修正 turn 起始缓冲对输出速率的影响（`8348311`，v0.6.5）。
- 文档滞后：上述 0.5.6–0.6.5 条目没有进入 `packages/tui/CHANGELOG.md`，该文件最新仍为 0.5.5（`packages/tui/CHANGELOG.md:10`）。

## 4.10 差异化能力

- 显式 coding/work/tui 三套提示词：`_v2/coding`、`_v2/work`、`_v2/tui` 各有一套 SYSTEM 模板（`packages/local-runtime-v2/assets/agents/_v2/coding/SYSTEM.md.hbs:1-20`、`packages/local-runtime-v2/assets/agents/_v2/work/SYSTEM.md.hbs:1-20`、`packages/local-runtime-v2/assets/agents/_v2/tui/SYSTEM.md.hbs:1-20`）；work 版明确“研究、分析信息、创建专业交付物”，并优先使用专业数据源（如 Wind/iFinD）而非 web_search（`packages/local-runtime-v2/assets/agents/_v2/work/SYSTEM.md.hbs:1-15`）。
- Lightweight 通用对话模式：小 system prompt、无工具 schema、无工作区/Skills/记忆/MCP，专用于会话和常识问答（`README.md:149-169`、`packages/local-runtime-v2/src/service/turn-system/agent-host/execution/prompt.ts:8-17`）。
- 子代理角色带 verifier：mavis/explore/worker/verifier 四类，verifier 独立验证交付物（`packages/shared/src/subagent-roles.ts:1-22`）。
- 媒体生成全家桶：图像、视频、语音、音乐、转写等 Matrix 工具（`packages/agent-tools/src/cloud/matrix-tools/tool-defs.ts:72-556`）。
- 网站部署：`website_deploy` 工具（`packages/agent-tools/src/desktop/local-website-deploy.ts:94`）。
- 双层记忆 + AGENTS.md 项目记忆：memory 工具支持 user/main/topic/summary，系统提示区分 Project/Agent memory（`packages/agent-tools/src/desktop/builtin-defs.ts:296-320`、`packages/local-runtime-v2/assets/agents/mavis/features/memory.md.hbs:1-40`）。
- 桌面浏览器自动化：browser_* 工具 + browser-core/CDP（`packages/agent-tools/src/desktop/builtin-browser-defs.ts:780-995`、`packages/browser-core/src/index.ts:1-30`），但 TUI 未公开。

## 4.11 “编码模式”与“工作/通用模式”语义

- **有显式的编码/工作双轨**：
  - 会话 `AppMode` 类型为 `'coding' | 'work'`（`packages/local-runtime-v2/src/service/session-system/sessions/repo/contract.ts:37`）；`fork` worktree 与内置 code review 只在 coding 模式可用（`packages/local-runtime-v2/src/infra/git/fork-worktree-adapter.ts:225-226`、`packages/local-runtime/src/review/hosted-capability.ts:100`）。
  - 提示词有三套：tui/coding/work（`packages/local-runtime-v2/src/service/agent/contracts.ts:20`、`packages/local-runtime-v2/src/service/agent/builtin/catalog.ts:605-606`）；`mcode exec --prompt-mode tui|coding|work` 可为非交互运行选择（`packages/tui/src/headless/invocation.ts:57`、`:116-119`、`packages/tui/CHANGELOG.md:103-104`）。
  - TUI 交互默认走 `tui` 提示（实际是编码 agent 提示，`packages/local-runtime-v2/assets/agents/_v2/tui/SYSTEM.md.hbs:1-20`）；桌面应用使用 coding/work 两种 appMode（`packages/local-runtime-v2/assets/agents/managed-prompts.json:14-19`），桌面源码不在仓库。
- 另有 `--mode lightweight`（通用对话）与 `--mode standard`（编码/工具）两种上下文模式；lightweight 不能与 `--session`/`--continue` 组合，ACP 与桌面会话始终 standard（`README.md:149-169`、`packages/tui/src/cli/contract.ts:96-99`）。
- 结论：在本报告覆盖的四款中，MiniMax 是唯一把“编码/工作”做成显式提示词与会话属性、并在 CLI 暴露 `--prompt-mode` 的产品；TUI 默认是编码型 tui 提示，工作型提示主要面向桌面/非交互运行。

---

# 5. 横向对照

| 维度 | Claude Code | Codex | Kimi Code | MiniMax Code |
| --- | --- | --- | --- | --- |
| 形态 | CLI/TUI + IDE + Desktop + Web/云 + Slack + Chrome | CLI/TUI + IDE + Desktop + Web/云 + app-server + SDK | CLI/TUI + ACP/IDE + Web + 手机遥控 + VS Code | TUI + headless + ACP + 桌面（源码不在仓库） |
| 版本 | v2.1.300 | rust-v0.162.1 | 2.1.1-6-ga940f2ff0 | v0.6.5 |
| 显式编码/工作模式 | 无 Work mode 开关；编码面与 Cowork/Claude Tag 等工作面分离（`CHANGELOG.md:49`、`:86-90`） | CLI 仅 Default/Plan；产品层有 work_web/work_desktop/work_mobile 痕迹（`codex-rs/tui/src/analytics/normalize.rs:331-343`） | 无；纯编码 CLI（`README.md:10`） | 有 `coding`/`work` AppMode 与 `--prompt-mode`（`packages/local-runtime-v2/src/service/session-system/sessions/repo/contract.ts:37`、`packages/tui/src/headless/invocation.ts:116-119`）；另有 lightweight 通用对话（`README.md:149-169`） |
| 计划/执行模式 | Plan、Auto、Accept edits、Bypass、Safe、Bare（`CHANGELOG.md:7758`、`:5486`、`:4782`、`:6636`） | Plan/Default，Plan 严格非变更（`codex-rs/protocol/src/config_types.rs:674-703`、`codex-rs/collaboration-mode-templates/templates/plan.md:1-90`） | Plan、Ask/YOLO/Auto、Shell、Goal、Swarm、Tower（`docs/en/guides/interaction.md:67-123`） | Plan、Ask/Auto/Full、Goal、lightweight（`packages/tui/src/tui/commands/catalog.ts:176`、`packages/tui/src/application/permission-mode.ts:1-17`） |
| 沙箱 | 有，可配置 failIfUnavailable/allowRead/网络隔离（`CHANGELOG.md:6559`、`:6737`、`:7016`） | read-only/workspace-write/danger-full-access/external（`codex-rs/protocol/src/protocol.rs:1088-1120`） | 无 OS 沙箱，明确“不是沙箱”（`packages/agent-core-v2/src/app/agentProfileCatalog/system.md:59`） | sandbox-runtime，macOS sandbox-exec（`third_party/sandbox-runtime/README.md:3-12`） |
| 多智能体 | Agent Teams、Workflow、后台 agents、worktree（`CHANGELOG.md:7461`、`:5011`、`:8033`） | 多代理 V2、agent roles、message board、worktree（`codex-rs/core/src/tools/spec_plan.rs:35-50`、`codex-rs/agent-roles/src/agent_role_config.rs:1-30`） | coder/explore/plan、Swarm、Tower（`docs/en/customization/agents.md:7-20`、`packages/agent-core-v2/src/features/tower/tower.ts:3-14`） | mavis/explore/worker/verifier、Agent Team、fork worktree（`packages/shared/src/subagent-roles.ts:1-22`） |
| 上下文持久化 | CLAUDE.md/AGENTS.md、rules、memory frontmatter、autoMemory（`CHANGELOG.md:1926`、`:8006`、`:7445`） | AGENTS.md、两阶段 memory 管线（`codex-rs/memories/README.md:29-80`） | AGENTS.md/SYSTEM.md，无独立记忆（`docs/en/customization/agents.md:197`、`:156`） | AGENTS.md + memory 工具 user/main/topic/summary（`packages/agent-tools/src/desktop/builtin-defs.ts:296-320`） |
| 审查 | /diff、/code-review、/ultrareview、Code Review 服务（`mods/README.md:11`、`CHANGELOG.md:5170`、`:5998`） | codex review、/review、Guardian 审批审查（`codex-rs/cli/src/main.rs:159`、`codex-rs/protocol/src/approvals.rs:89-260`） | 无内置 /review；TowerReview + 技能（`packages/agent-core-v2/src/features/tower/tower.ts:3-14`、`docs/en/customization/skills.md:146`） | /review、code_review 工具、verifier（`packages/tui/src/tui/commands/catalog.ts:189`、`packages/agent-tools/src/desktop/builtin-defs.ts:274`） |
| 远程/协作 | Remote Control、Cowork、Claude Tag、self-hosted runner（`CHANGELOG.md:7200`、`:3708`、`:86`） | remote-control、app-server、cloud、SDK（`codex-rs/cli/src/main.rs:174-229`） | Remote Control、Web、ACP、VS Code（`docs/en/guides/remote-control.md:3-20`） | ACP、桌面；无远程控制（`docs/tui-capabilities.md:171`） |

---

# 6. 未验证与未知清单

1. Claude Code 核心二进制不在仓库：本报告对“无仓库索引/无某功能”的判断只基于 CHANGELOG、plugins、mods，不能代表闭源二进制全部实现（`mods/README.md:3-6` 说明 mods 是源码，但不含核心）。
2. Codex 的 Work 产品面：只看到 analytics/originator/feature gate 痕迹（`codex-rs/tui/src/analytics/normalize.rs:331-343`、`codex-rs/features/src/lib.rs:277-302`），Work 的 UI、提示词、任务模型未在本仓库，未验证。
3. Codex 官方 release notes 不在本地：`CHANGELOG.md:1-5` 指向 GitHub Releases；本报告的 0.162 亮点来自 `git log` 提交主题，不是官方 release note 原文。
4. Kimi 的“记忆/索引”：`rg` 未发现独立记忆工具或语义索引；不能排除由技能/MCP/插件提供的外部实现。
5. Kimi 遥测：未展开 `packages/telemetry` 的上传字段与默认开关，标记为未验证。
6. MiniMax 桌面端：源码不在公开仓库（`README.md:298`），桌面端的 Work 模式、浏览器、cron、云 handoff 只能从提示词资产、工具定义、能力文档间接判断；TUI 是否装配 browser_* 未验证。
7. MiniMax 文档滞后：CHANGELOG 最新 0.5.5、README 仍写 0.4.12，0.6.x 的用户可见变化只能从 git log/commit body 提取（`packages/tui/CHANGELOG.md:10`、`README.md:278`）。
8. 四款产品均未在本机运行，所有“可用性/行为”均来自源码与文档，不是实测运行结果。
