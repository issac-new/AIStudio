# Codex 产品与 IDE 功能面调研（非 CLI 源码侧）

2026-09-21。CLI 仓库协议/TUI/沙箱已由 `codex.md` 覆盖，本文只写产品面：IDE 扩展、ChatGPT 端、云任务与集成。方法：全量抓官方文档站（`developers.openai.com/codex/*` 现 308 重定向至 **learn.chatgpt.com/docs/**，下文 URL 均为重定向后的真实地址，记作 `L:`），以 `L:/llms.txt` 全量索引穷举，共实抓 30 页；`openai.com/index/*` 博客与 `help.openai.com` 均被反爬拦截（403/404），**未能获取**，近期新功能以官方 `whats-new` 页为准。

**产品矩阵一句话**：CLI 终端面（`L:/codex/cli`）｜IDE 扩展嵌进编辑器（`L:/codex/ide`）｜ChatGPT 桌面 App/Web 宿主本地+产品功能（`L:/app`、`L:/web`）｜Codex Cloud 云端容器任务（`L:/cloud`），四端同一账号同一额度，本地消息与云任务共享用量池（`L:/pricing`）。关键事实：2026-07-09 起 Codex 已并入 ChatGPT 桌面 App 成为一个视图（`L:/whats-new` 7 月 6-10 日条目），独立 "Codex App" 叙事已收敛；手机经 Codex Remote 控制桌面宿主（`L:/features`）。

## 一、IDE 扩展功能清单（VS Code 族 + Xcode + JetBrains）

来源：`L:/codex/ide`、`L:/developer-commands?surface=ide`、`L:/developer-settings?surface=ide`、`L:/code-review`、`L:/permission-modes`、`L:/agent-configuration/subagents`。

**分发面**（`L:/codex/ide`）：VS Code / Cursor / Windsurf / VS Code Insiders 走 marketplace（`openai.chatgpt`）；Xcode 经 coding assistant 选 Codex 为 agent；JetBrains 经 AI Assistant 选中 Codex。

**侧边栏聊天面板**（`L:/codex/ide`）：

- 任务状态行（"Worked for 6m 53s"）+ 结果摘要 + 验证 bullet 列表。
- 变更文件列表，每文件 ±行数（如 `retry.ts +2−2`），逐文件 Undo，"Review" 链接直达 diff。
- composer 支持附件（打开的文件/选区/最近会话）、示例 prompt、模型选择器。

**编辑器上下文引用**（`L:/codex/ide`）：@-mention 引用打开的文件/选中代码/最近聊天（例 "using context from @merg"），卖点是 "starts with the code you are already looking at"。

**扩展命令与键位**（`L:/developer-commands?surface=ide`，全部可自定义键位）：

| 命令 | 默认键 | 作用 |
|---|---|---|
| `chatgpt.addToThread` | - | 选区加入当前会话上下文 |
| `chatgpt.addFileToThread` | - | 整文件加入当前会话上下文 |
| `chatgpt.newChat` | Cmd+N / Ctrl+N | 新建会话 |
| `chatgpt.newCodexPanel` | - | 新建 Codex 面板 |
| `chatgpt.openCommandMenu` / `openSidebar` | - | 命令菜单 / 侧栏 |

**IDE 侧 slash 命令 23 条**（`L:/developer-commands?surface=ide`）：approve / cloud / cloud-environment / compact / fast / feedback / fork / goal / ide-context / init / local / mcp / memories / model / personality / plan / project / reasoning / review / side / status / worktree。`/ide-context` 开关自动 IDE 上下文注入（对应 CLI 侧机制，见 `codex.md` §2.3）。

**扩展设置**（`L:/developer-settings?surface=ide`，`chatgpt.*` 键，不入 config.toml）：

| 设置 | 默认 | 语义 |
|---|---|---|
| `followUpQueueMode` | queue | 运行中新消息排队等下轮（queue）或转向当前轮（steer）；Cmd/Ctrl+Shift+Enter 单条反转 |
| `composerEnterBehavior` | enter | Enter 恒发送 / 多行时 Cmd+Enter / 恒需修饰键 |
| `reviewDelivery` | inline | /review 在当前会话（inline）或独立评审会话（detached） |
| `commentCodeLensEnabled` | true | TODO 注释上方显示让 Codex 处理的 CodeLens |
| `openOnStartup` / `localeOverride` | false / auto | 启动聚焦侧栏 / UI 语言 |
| `runCodexInWindowsSubsystemForLinux` | false | Windows 下跑在 WSL |
| `cliExecutable` / `chat.fontSize` / `chat.editor.fontSize` | - | 开发者 CLI 路径 / 聊天与代码字号 |

**内联 diff 审查**（`L:/codex/ide`）：聚焦式 diff（"inspect a focused diff"），按文件 keep/undo，无需跳其他面板。

**审批交互**（`L:/permission-modes`）：权限选择器位于 composer 下方，三档——Ask for approval（默认）/ Approve for me（越界请求交自动评审）/ Full access；沙箱边界与"谁来审"解耦（改审批人不扩沙箱）。协议层八态决策见 `codex.md` §2.2，不重复。

**/review 评审模式**（`L:/code-review`）：IDE 内两作用域——对比基线分支（自动找 merge-base）或未提交变更（staged+unstaged+untracked）；输出优先级化 findings、不改工作树。

**子代理面板**（`L:/agent-configuration/subagents`）：composer 上方 background-agent 面板：各子代理状态、stop-all、逐线程打开。

**云↔本地切换**（`L:/codex/ide`）：会话内 "Continue in / Work locally / Cloud"，任务长大时转云，回来仍在同一编辑器工作流里审（`/cloud`、`/local`、`/cloud-environment` 三条 slash 配套）。

## 二、ChatGPT 端 Codex 功能清单（桌面 App / Web）

来源：`L:/app`、`L:/web`、`L:/code-review`、`L:/automations`、`L:/long-running-work`、`L:/notifications`、`L:/pricing`、`L:/features`。

- **App 定位**（`L:/app`）："command center for complex work"——并行项目会话、artifacts 查看器（文档/表格/图片）、工具面（浏览器/Computer Use/插件/搜索/图像生成/语音/appshots）。Web 端分 Chat/Work 两档，Work = 规划+取上下文+执行+产出文件（`L:/web`）。
- **PR review 面板**（App 内，`L:/code-review`）：视图 Unstaged（默认）/Staged/Commit/Branch/Last turn（最近一轮 agent 改动）；行内评论（点 + 写反馈→"address the inline comments" 让 agent 修）；Stage/Revert 支持 all/单文件/单 hunk 三级；多仓项目带仓库选择器；装 `gh` 并登录后侧栏显示 PR 上下文与 reviewer 评论。
- **定时任务 Scheduled**（`L:/automations`）：本地或后台 worktree 运行（Git 仓库二选一）；chat 内任务（回同一会话）或独立任务（每次全新）；分钟/日/周 + RFC 5545 RRULE；Web 端事件触发（Gmail 收件/Slack 频道消息/GitHub PR 活动，可按作者/标签/动作过滤），事件与时间触发不可混用；运行历史即收件箱（未读标记、All/Active/Paused 筛选）；无人值守跑 `approval_policy="never"`。
- **Goal 长时模式**（`L:/long-running-work`）：`/goal` 设定持续目标（outcome + constraints + verification 三要素可自检完成）；App 内进度条 pause/resume/edit/clear；旁路 side chat 问状态不打断主会话。目标数据结构见 `codex.md` §2.6。
- **通知**（`L:/notifications`）：桌面 OS 通知三档频度（never/仅后台/always）+ 权限与提问独立开关；Web push/email/SMS；CLI 外部命令钩子（`codex.md` §2.3 已录）；App 侧 Activity 收件箱（铃铛，Cmd+Opt+U）按 Work/Chat/Pinned/Scheduled 筛选，chat 三态 unread/running/waiting。
- **子代理**（`L:/agent-configuration/subagents`）：并行 spawn+汇总单响应；Web 只读 Active/Done，App/CLI/IDE 可 steer/stop；自定义 agent = `~/.codex/agents/*.toml`（name/description/developer_instructions + 模型/沙箱/MCP/skills 覆盖）；`[agents]` 全局并发上限、默认子代理模型；内置 default/worker/explorer 三角色。
- **订阅与额度**（`L:/pricing`）：Free/Go/Plus($20)/Pro($100, 5x/20x)/Business/Enterprise 同一额度池，本地消息与云任务共享；**API key 仅 CLI/SDK/IDE，无任何云功能**（无 GitHub review、无 Slack）；限额按模型分档（Plus 档 GPT-5.6 Sol 每 5 小时窗 10-100 条本地消息、Luna 250-2000）；credits 按 1M token 计价（Sol 100 输入/10 缓存/500 输出）；语音 $0.05/min 走 Codex 预算；GitHub 触发的 review 算 Code Review 用量，本地 /review 算普通用量。
- **周边**（`L:/features`、`L:/features/codex-micro`、`L:/extend/record-and-replay`）：Pets 浮窗宠物显示会话状态；Appshots 双 Cmd 键截前台 App 入上下文；Codex Micro 实体键盘（6 个 Agent Keys 灯显状态：白空闲/蓝思考/绿完成/琥珀待输入/红错误，摇杆/拨盘控推理档）；Record & Replay 录 Mac 操作生成可复用技能；Agent import 从 Claude Code/Cursor 导入配置并可自动同步。

## 三、云任务与集成面

- **云任务模型**（`L:/cloud`、`L:/environments/cloud-environment`）：chatgpt.com/codex 建 chat → 容器起 → checkout 所选分支/SHA → setup script（缓存恢复时另跑可选 maintenance script）→ agent 循环改码/跑检查（读 AGENTS.md 的 lint/test 约定）→ 返回答案+diff → 开 PR 或追问。任务视图三 tab：Chats / Code reviews / Archive；可看任务日志；环境被多会话复用（演示环境累计 128/312 chats）。
- **环境（容器）**（`L:/environments/cloud-environment`）：默认 `universal` 镜像（github.com/openai/codex-universal 可本地拉取测试），可钉 Python/Node 版本；变量（全程生效）与 secrets（仅 setup 阶段解密，agent 阶段前移除）分层；npm/yarn/pnpm/pip/pipenv/poetry 自动装依赖；容器缓存 12 小时，setup/变量变更即失效，Business/Enterprise 全工作区共享缓存。
- **网络**（`L:/cloud/internet-access`）：agent 阶段默认断网、setup 有网；可开 + 域名白名单（"Common dependencies" 预置 70 域名：npm/pypi/crates/github 等）+ HTTP 方法限制（仅 GET/HEAD/OPTIONS）。
- **GitHub 集成**（`L:/third-party/github`）：`@codex review` 手动评审（👀 反应后"像队友一样"发 review）；Automatic reviews 开 PR 即自动评；只报 P0/P1 保聚焦；Security Review（research preview，`@codex security review`，结果在 Security Report tab，可按 threat model 定制）；AGENTS.md 加 `## Code Review Rules` 段定制规则（根文件全仓 + 嵌套文件分服务，建议 2-3 条起步）；`@codex fix …` 从 PR/issue 起云任务，有权限可推回分支。
- **GitLab Beta**（`L:/third-party/gitlab`）：MR 评审（手动含 P0-P2，自动聚焦 P0-P1）+ 自动评审策略（my/team/all MRs、Follow personal、实验性 Smart Trigger）；自管版走 service account + 签名 webhook。
- **Slack**（`L:/third-party/slack`）：频道/线程 @Codex 提及起云任务；自动匹配环境与仓库，歧义回退最近用过的环境；Enterprise 可禁"完成后线程内贴答案"只回 chat 链接。
- **Linear**（`L:/third-party/linear`）：issue 直接 assign 给 Codex（像分给同事）；Triage 规则 Delegate>Codex 新 issue 自动分派；本地侧 MCP 接法 `codex mcp add linear --url https://mcp.linear.app/mcp`。
- **GitHub Action**（`L:/github-action`）：`openai/codex-action@v1` 在 CI 装 CLI 跑 `codex exec`；输入 prompt/prompt-file（二选一）、model/effort/sandbox/output-file/codex-args；`safety-strategy: drop-sudo` 剥权（Windows 需 unsafe）；allow-users/allow-bots 限触发人；final-message 输出可回贴 PR 评论。
- **Worktree 隔离**（`L:/environments/git-worktrees`、`L:/environments/modes`）：会话三模式 Local/Worktree/Cloud，前两者跑本机；worktree 默认 detached HEAD 不污染分支；Local↔Worktree 双向 handoff（Codex 代办 git 操作，绕开"分支只能一处 checkout"限制）；`.worktreeinclude` 让被 ignore 的文件（.env 等）随 handoff 带走；默认保留最近 15 个、归档会话即清理，删除前快照可恢复。本地环境（`L:/environments/local-environment`）：per-project setup script（新 worktree 自动装依赖）+ actions（顶栏一键命令跑集成终端，可分平台），配置存项目 `.codex/` 可入库共享。
- **近期新功能脉络**（`L:/whats-new` 全表，2026-02→09）：2 月 App 首发 + 轮中转向；3 月定时任务 GA + 终端输出直读；4 月 App 内 PR review；5 月 Goal GA + 手机 Remote；6 月 Record&Replay + chat handoff（本地↔远端带 git 状态迁移）；7 月 GPT-5.6 三档模型（Sol/Terra/Luna）、**Codex 并入 ChatGPT App**、Codex Micro、subagents；8 月 Security Review、多仓评审、Activity 收件箱、事件触发定时任务、WebMCP、GitLab Beta、Agent import、GPT-6 Astra。**官方全表无 "best-of-n" 条目**（该特性名在页面不存在，如实记录）；"任务复用"即云环境的会话累积复用（`L:/cloud`）。

## 四、与我方 IDE 差距对照（≈已具备 / →可对齐附落点 / ×不适用）

我方基线：`overlay/custom/client/ide/`（views 15 文件；侧栏 10 tab 含 review，IdeSidePane.vue:25-35；ChatInput 附件/slash/排队/语音命令，IdeChatPane.vue:6）。与 `codex.md` §三重叠的协议项只列产品皮一句并引该文。

| Codex 产品能力 | 我方现状 | 判定 | 说明与落点 |
|---|---|---|---|
| 选区/文件/最近会话入 composer（addToThread 族 + @提及） | ChatInput 有附件，无引用语义 | → | 借语义：文件树/预览选中内容"加入当前会话"；@提及与 zcode.md P1-9 同一基建 |
| 任务结果卡（时长+验证 bullet+文件 ± 行数+逐文件 Undo） | 工具流里有 diff，无收口摘要卡 | → | git 面板已有数据，纯聚合渲染；Undo=单文件 checkout 一条 route |
| /review 评审模式（基线分支/未提交两域 + 专职 reviewer + 行内评论回流） | review tab 是 diff 查看器（IdeSidePane.vue:27），无评审 agent | → | hermes 起独立 reviewer 会话 + 行内评论数据结构；hunk 级 Stage/Revert 后置 |
| followUpQueueMode queue/steer 双模 + Cmd+Shift+Enter 反转 | ChatInput 仅排队（IdeChatPane.vue:6） | → | steer 依赖轮中注入通道，与 `codex.md` P2-steer 合并；设置项可先行 |
| 权限选择器常驻 composer 下方（三档，auto-review） | 审批门有批/拒（决策丰富度见 `codex.md` §三） | ≈→ | 产品皮差距：审批模式可切换且常驻；Approve for me 语义=越界先审后批 |
| 子代理面板（状态+stop-all+逐线程打开） | IdeSubagentsFloat 单流浮窗 | → | 与 zcode.md P0-2（子代理目录）同物，合并实现 |
| /goal 进度条（pause/resume/edit + 旁路 side chat） | IdePlanFloat 无目标态 | → | 与 zcode.md G5 合并；side chat 对应 zcode P1-18 |
| Worktree 会话隔离 + 双向 handoff + .worktreeinclude | 多会话共享单目录 | → | 后端 worktree 生命周期 + 文件树/git 面板适配多 checkout |
| 终端 actions（项目配置一键命令）+ setup script | IdeTerminalDock 手敲 | → | 便宜：SQLite 存项目命令表，dock 顶栏 chips |
| Activity 收件箱（unread/running/waiting 筛选）+ OS 通知 | 状态栏遥测有（M2），无收件箱/通知 | → | 任务状态已有，加铃铛面板；OS 通知与 `codex.md` notify 项同管道 |
| 定时任务编辑视图（RRULE/事件触发/运行历史收件箱） | 仅跳 hermes.jobs（zcode.md §6.1） | → | zcode.md P2-29 已记；事件触发（PR/Slack/Gmail）是增量语义 |
| AGENTS.md /init 脚手架 + ## Code Review Rules 规则段 | 后端已读 AGENTS.md（workspace-context.ts），无 /init 与规则段 | → | 低成本：init=一条 prompt 模板；Review Rules 段喂 /review 模式 |
| 云任务（容器环境/PR 流水线/@codex） | 无云运行时 | × | 仅借"任务转后台"交互语义；网络白名单表可作审批白名单参考数据 |
| Slack/Linear/GitHub App/GitHub Action 集成 | 无 | × | 依赖 OpenAI 云端与 GitHub App 形态 |
| Appshots/Voice/Pets/Micro 硬件/Record&Replay | 无 | × | 依赖桌面 App + Computer Use 形态 |
| TODO CodeLens | 非 IDE 编辑器 | × | 若未来做代码编辑器再评 |
| 订阅额度分层/credits 计价显示 | 状态栏有遥测无配额 | → | 借"配额条/限额显示"语义，数据源取决于我方计费形态（zcode.md G7 同区） |

## 五、建议对齐项 P0-P2（产品面；协议面排序见 codex.md §四）

- **P0-1 /review 评审模式**。价值：PR 自查 + agent 行内评论回流是高频刚需，我方 review tab 只差"会跑的 reviewer"。成本：中——独立 reviewer 会话（hermes 现成）+ 基线分支/未提交两域 prompt 模板 + 行内评论数据结构；P0/P1 聚焦标签先做展示。
- **P0-2 任务结果卡**。价值：把"改了什么、跑了多久、验证了什么"从工具流提为收口卡，Codex IDE 同款。成本：低-中——git diff 聚合渲染；逐文件 Undo 需一条 checkout route。
- **P0-3 排队/转向双模设置**。价值：运行中输入的双意图（等下轮 vs 立即转向）一屏表达，Cmd+Shift+Enter 反转是成熟交互。成本：前端低；steer 后端通道与 `codex.md` P2-steer 合并排期，可先落 queue 默认 + 设置项。
- **P1-4 Worktree 任务隔离 MVP**。价值：并行任务互踩文件是我方单目录多会话硬伤，官方以 worktree + handoff 根治。成本：高——后端 worktree 生命周期（建/还/清理上限）+ 前端多 checkout 适配；任务侧栏先加"此任务跑在 worktree"开关。
- **P1-5 Activity 收件箱 + 系统通知**。价值：多任务并行的注意力管理（unread/running/waiting 三态）。成本：低——任务状态已有，铃铛面板纯前端；通知走 `codex.md` notify 钩子同管道。
- **P1-6 终端 actions**。价值：dev server/测试一键化，项目级配置可入库共享（Codex 存 .codex/ 随 git）。成本：低。
- **P1-7 文件/选区引用入会话**。价值：上下文指定从口述变精确引用。成本：中——与 zcode.md P1-9 @提及同一基建，建议合并实现。
- **P2-8** goal 进度条 + 配额显示（与 zcode G5/G7、codex.md ThreadUsage 项三方合并）。**P2-9** 定时任务事件触发语义（先做 PR/webhook 单源）。**P2-10** AGENTS.md /init 脚手架。其余（云任务、三方集成、Computer Use 族、Micro）×，仅留概念参考。

未验证声明：openai.com 博客与 help.openai.com 被反爬未获取，本文近期功能全部以 `L:/whats-new` 为准；我方对照基线只核了 IdeSidePane/IdeChatPane/workspace-context 三处源码，其余基线描述引自 `zcode.md`（当日实测）。

## 附：实抓页面清单（30 页，均为 2026-09-21 抓取）

产品面：`/app`、`/web`、`/codex/ide`、`/codex/cli`、`/cloud`、`/features`、`/llms.txt`（全量索引）。
IDE 子页：`/developer-commands?surface=ide`、`/developer-settings?surface=ide`。
ChatGPT 端：`/code-review`、`/automations`、`/long-running-work`、`/notifications`、`/pricing`、`/agent-configuration/subagents`、`/features/codex-micro`、`/extend/record-and-replay`。
云与环境：`/environments/cloud-environment`、`/environments/modes`、`/environments/local-environment`、`/environments/git-worktrees`、`/cloud/internet-access`、`/integrated-terminal`、`/permission-modes`。
集成：`/third-party/github`、`/third-party/gitlab`、`/third-party/slack`、`/third-party/linear`、`/github-action`。
动态：`/whats-new`。
未能获取（反爬 403/404）：openai.com/index/codex、openai.com/index/introducing-codex、help.openai.com Codex collection、`/docs`（Overview 落地页 .md 版）。
