# kimi-code 普查：Moonshot 官方 CLI 源码特性盘点 vs SwarmStudio /ide

2026-09-21，基于 upstream/kimi-code @ 65ae3e3（tag @moonshot-ai/kimi-code@2.0.2，MIT）。**这是完整 TS 源码仓（pnpm monorepo），不是产物仓**——CLI、TUI、agent 引擎、web 服务器全部可读可搬。数据来源：全仓探查 + 关键文件直读；所有论断带锚点，未读到的不写。

## 一、仓库概览与技术栈

根 package.json：`@moonshot-ai/monorepo`，Node ≥24.15、pnpm 10.33、vitest + oxlint + changesets；最终以 install.sh 分发单二进制（README.md Install 节），但源码即全部实现。

| 位置 | 内容 |
|---|---|
| `apps/kimi-code` | CLI 本体：`src/cli`（commander 入口/headless/`kimi web` 子命令）、`src/tui`（pi-tui 差分渲染界面，43 个 slash 命令）、`dist-web`（随二进制附带的 web UI 静态资产，`src/native/web-assets.ts` 加载） |
| `packages/agent-core-v2` | **统一 agent 引擎**（DI × Scope 架构，自建 VSCode 风格 DI）：`src/agent/{media,contextMemory,fullCompaction,mcp,tools}`、`src/features/{swarm,tower,cron,goal,fileHistory,externalHooks,skill,plan,todo,btw,notify,reminder,usage,tokenCounting}`、`src/mcpCore`（连接管理 + OAuth）、`src/app/{plugin,capability,auth,config}` |
| `packages/kap-server` | `kimi web` 的 HTTP/WS 服务器（openapi/routes/security），`packages/klient` 为其客户端 SDK facade |
| `packages/{kosong,kaos}` | LLM 抽象层 / 执行环境抽象层 |
| `packages/{pi-tui,minidb,transcript,tree-sitter-bash,oauth,telemetry,remote-control,acp-server,node-sdk,migration-legacy}` | TUI 库（差分渲染）；纯 Node KV+SQLite WAL 混合库；转写渲染四层数据结构；纯 TS bash 解析器（节点与 tree-sitter 一一对应）；OAuth 工具包；遥测；中继隧道客户端；ACP（Zed/JetBrains 接入）；对外 SDK；`~/.kimi/`→`~/.kimi-code/` 迁移 |
| `apps/{vis,vscode,kimi-inspect}` | 会话调试可视化、官方 VS Code 插件、inspect 工具 |
| `plugins/` | `marketplace.json`（6 条目，tier official/curated）+ `official/{kimi-datasource,kimi-webbridge}` |

对工作台最有价值的三块：`agent-core-v2/src/agent/media`（视频链路）、`features/skill/catalog/builtin/mcp-config.md`（对话式 MCP 范式全文）、`app/plugin`（市场+信任）。

## 二、功能特性清单（带源码锚点）

### 2.1 会话与恢复

- **Sessionless 启动**：v2 引擎首条消息才建会话，启动只 `hydrateLazyConfigDefaults()` 显示引擎将应用的默认值（`apps/kimi-code/src/tui/kimi-tui.ts:966-972`）。毫秒启动=懒会话+pi-tui 差分渲染（README Acknowledgements）。
- **`--continue` / `--resume <id>`**：continue 只取 `listSessionsPage({workDir, limit:1})` 一页（kimi-tui.ts:944）；resume 校验 workDir 不符则提示 `cd <dir> && kimi -r <id>`（kimi-tui.ts:926-938）。恢复带回放，`REPLAY_TURN_LIMIT = 10` 轮（`src/tui/utils/message-replay.ts:25`）。
- **恢复状态**：`session.getResumeState()` 返回 `sessionMetadata.agents` 与 warning（kimi-tui.ts:846-850）。
- **`/fork`**：复制当前会话但留在原会话（fork 会关闭源会话的 in-flight turn），给出进入 fork 的完整命令（`src/tui/commands/session.ts:61-95`）。
- **`/undo [count]`**：对话级回退到第 N 个用户消息，`session.undoHistory(count)` RPC（`packages/node-sdk/src/session.ts:382`）；`UndoSelectorComponent` 列出可回退点、回退后 `restoreInputText` 还原该轮输入草稿（`src/tui/commands/undo.ts:185-200`）；bundled prompt 的 skill 激活卡与 hook 结果有专门保留规则（undo.ts:82-135 注释）。
- **fileHistory 回合级文件快照**：每 turn `start`/`end` 两相 checkpoint 记录 `{path→version}`（`packages/agent-core-v2/src/features/fileHistory/fileHistory.ts:11-19`），`changes(turnId)` 给 diff、`contentAt` 读历史版本——agent 写坏可回读旧版。

### 2.2 输入与附件（视频链路重点）

- **媒体三态生命周期**：粘贴/上传 → 后台 daemon 上传得 `kimi-file://<fileId>` 引用（`agent/media/mediaRef.ts:102-114`）；提交时 `materializePromptDaemonRefs` 把文件物化进会话媒体目录（`agent/media/promptMediaIntake.ts:14-46`，目录名 `SESSION_MEDIA_DIR='media'`，mediaRef.ts:138）；`StagingLeaseTracker` 管理暂存租约——daemon 上传在消费 turn 结束即删、本地缓存副本退到会话级桶会话关闭删（`src/tui/controllers/staging-leases.ts:1-53` 头注释）。
- **请求时解析**（`agent/media/mediaResolverService.ts:104-155`）：发请求前把 `kimi-file://` 引用解析为真内容；模型能力门控 `model.capabilities.video_in`/`image_in`（:404/:244），不支持则降级为 `<video path="...">` 文本标签。
- **上传通道与缓存**：优先走 provider 上传得 `ms://<id>`，缓存键 = fileId+provider+protocol+baseUrl+accountHash（:406-409，accountHash 对 JWT 取 sub 防换 key 失效，:539-556），持久在 blob store `video-upload-cache`/`image-upload-cache` 两 scope（:39-40）。openai/openai_responses 协议不支持 inline video，只能上传或降级（`agent/media/videoUpload.ts:18-25`）。
- **每请求媒体预算**：20MB 高水位 / 10MB 低水位，超限从最老的媒体开始替换为 path 标签并发 `WarningIssued('media-budget-exceeded')` 告警（mediaResolverService.ts:48-49, 172-220）。图片另有 LRU memo（单张 ≤8MB、总 ≤64MB，:46-47, 378-396）。
- **ReadMediaFile 工具**：agent 主动读图/视频，输入 path（支持 `kimi-file://` 引用）+ 可选 `region` 裁剪（全图降采样后对局部全保真细看）+ `full_resolution`；上限 `MAX_MEDIA_MEGABYTES = 100`（`agent/tools/read-media-file/read-media-file.ts:6-45`）。
- **TUI 渲染**：`ReadMediaFile` 输出的 JSON envelope 只显示 kind/path/mime/size 芯片，绝不 dump base64（`src/tui/components/messages/tool-renderers/media.ts:1-16` 头注释）；`mediaUrlPartToText` 把 data URL 摘要为 `[video video/mp4, 3.2 MB]`（`src/tui/utils/media-url.ts:7-12`）。
- **模型能力前置校验**：提交带视频但当前模型无 `video_in` 直接报错 'Current model does not support video input.'（kimi-tui.ts:1579-1582）。

### 2.3 MCP（/mcp-config 完整范式）

- **本体是 builtin skill**：markdown 提示词资产 + 普通代理回合，`disableModelInvocation: true`、`productSpecific: true`（`features/skill/catalog/builtin/mcp-config.ts:14-24`）；builtin skill 直接注册为裸 slash 命令名（`src/tui/commands/skills.ts:38-42`）。
- **全文范式**（`builtin/mcp-config.md`，131 行）三分支：Login / Config edit / 查看-only。要点：
  - 三文件优先级：`<KIMI_CODE_HOME>/mcp.json`（先 `echo $KIMI_CODE_HOME` 解析实际根，绝不假设 `~/.kimi-code`）→ 项目根 `.mcp.json`（从 cwd 向上找 `.git`）→ `<cwd>/.kimi-code/mcp.json`（:40-68）。
  - **查看-only**：读全部三文件给合并视图，带源路径上下文以便从声明它的文件里删除，不写不问 scope（:95-98）。
  - **scope 问题结构化**：仅 scope-less 请求用一次 `AskUserQuestion` 问三选一（默认 user-global），其余追问一律纯文本（:102-110）；用户取消 scope 问题就停——"不能瞎猜用户想写哪儿"（:110）。
  - **先读后告**：读目标文件→展示路径+现有条目+将写入条目；定位是"透明非确认门"，真门是 Edit/Write 审批；yolo/auto 无提示是这些模式的契约（:111-119）。
  - JSON 解析失败原样报错停止，严禁覆盖破损文件（:112-114）；写后保留无关条目与 `mcpServers` 包装，并告知需 `/new` 或重启生效（:120-123）。
  - 字段指引：stdio 最小 `command`，http 最小 `url`+`bearerTokenEnvVar`；transport 由 command/url 推断可省；全局超时走 `config.toml [mcp]` 或 `KIMI_MCP_STARTUP_TIMEOUT_MS`/`KIMI_MCP_TOOL_TIMEOUT_MS`，per-server `startupTimeoutMs`/`toolTimeoutMs` 必须是 1..2147483647 整数（:75-93）；密钥不落盘（:127-130）。
- **needs-auth OAuth 合成工具**：连接失败于 OAuth 时服务器进入 `needs-auth` 态（`mcpCore/connection-manager.ts:17,342`），运行时为其合成 `mcp__<server>__authenticate` 工具——零参数，输出授权 URL（含 state+PKCE，必须逐字展示不得改）、阻塞等回调最长 15 分钟、成功后 reconnect 并用真工具替换合成工具（`agent/mcp/tools/auth.ts:21-40,55-120`）；URL 通过 `MCP_OAUTH_AUTHORIZATION_URL_TOOL_UPDATE` 自定义事件推给 UI（auth.ts:88-92）。
- **状态闭环**：会话事件里 needs-auth 直接提示 `run /mcp-config login <server>`（`src/tui/controllers/session-event-handler.ts:1028`）；`/mcp` 状态面板六态排序渲染，needs-auth 行给 `action: run /mcp-config login <name>`，空列表提示 `Run /mcp-config to add one`（`src/tui/components/messages/mcp-status-panel.ts:12-41,109,147,153`）。

### 2.4 插件市场与信任

- **市场清单**：默认 URL `https://code.kimi.com/kimi-code/plugins/marketplace.json`，env `KIMI_CODE_PLUGIN_MARKETPLACE_URL` 可覆盖（dev 有 `dev:cli:marketplace` script）；tier 只有 `official`/`curated` 两档，entry 含 id/displayName/source/version/keywords/homepage/builtIn（`app/plugin/marketplace.ts:8-26`）；source 支持 http/file/GitHub repo/release zip（`github-resolver.ts`、marketplace.ts:70-83）。
- **插件清单**：`kimi.plugin.json` 或 `.kimi-plugin/plugin.json`（`app/plugin/manifest.ts:16-17`），字段 skills/agents/mcpServers/hooks/commands/sessionStart/systemPrompt（`app/plugin/types.ts:34-52`）；systemPrompt 上限 32KB（manifest.ts:14）。`rootSkillFallback` 让无 skills 目录的插件以根目录为技能。
- **信任门**：official 隐式信任；其余安装前弹 `PluginInstallTrustConfirmComponent` 明确 opt-in（`src/tui/commands/plugins.ts:452-467`）；capability 条目按 `builtIn` 标志判官方免信任（plugins.ts:529-533 注释）；capability 安装 700ms×260 次轮询进度（plugins.ts:472-477）。
- **workspace trust**：独立的 `IWorkspaceTrust` get/trust/untrust + `onDidChange`（`workspace/workspaceTrust/workspaceTrust.ts:8-21`），项目级 `.mcp.json` stdio 启动即执行命令的安全前提（mcp-config.md:66-67 同时向用户提示）。
- **capability 分发**：`kimi-cu`（macOS KimiCU.app 伴随程序，需 accessibility+screenRecording 权限，launchd 常驻）+ `kimi-cu-win` + `kimi-webbridge`（`app/capability/entries/kimiCu.ts:9-28`；plugins.ts:478-482）。webbridge = 本地 daemon(127.0.0.1:10086) + 浏览器扩展走 CDP 控制用户真浏览器，登录态不出设备（`plugins/official/kimi-webbridge/kimi.plugin.json` interface.longDescription）。

### 2.5 子代理与编排

- **AgentSwarm**：swarm 模式注入的扇出工具，`prompt_template` 含 `{{item}}` 占位 + `items` 数组，每 item 一个子代理，最多 128 个自动排队（`features/swarm/agent/enter-reminder.md` 协作纪律全文）；默认超时 2h（`features/swarm/configSection.ts:19`）。`/swarm <prompt>` 在 manual 权限下先弹 auto/yolo 选择再开跑（`src/tui/commands/swarm.ts:39-46`）。
- **Tower（实验）**：workspace 级多代理塔，协议文件全在 `.tower/` 且只允许 Tower* 工具写（手写会被 merge gate 拒），工具族 finding/inbox/init/merge/mission/plan/review/send/spawn/status/teardown，worker/reviewer 双角色（`features/tower/tower-worker-overlay.md`、`features/tower/tools/` 目录）；开关 `KIMI_CODE_EXPERIMENTAL_TOWER=1`（tower.ts:45），单 workspace 同时只允许一个 tower owner（tower.ts:53）。
- **/btw 侧问**：`session.startBtw()` 起一个独立小代理开侧面板，不打断主会话（`src/tui/commands/btw.ts:16-29`）。
- **goal 预算**：objective + completionCriterion + `tokenBudget/turnBudget/wallClockBudgetMs` 三预算，GoalBudgetReport 报剩余与超限（`features/goal/types.ts:6-36`），带 deadline 调度器（goalDeadlineScheduler.ts）。
- **cron**：agent 内定时任务 add/delete/cursor/fired（`features/cron/cronOps.ts:24-69`）；后台代理状态有专门渲染组件（`components/messages/background-agent-status.ts`，undo.ts import 可见）。

### 2.6 compact / 上下文管理

- **RuntimeCompactionStrategy**：triggerRatio 0.85 触发、reservedContextSize 50k、保留最近 4 条消息且不超过 20% 窗口、溢出时最多重试 3 次且每次至少降 5%（`agent/fullCompaction/strategy.ts:15-30`）。
- **交接摘要提示词**（`fullCompaction/compaction-instruction.md`，纯资产可直接搬）：要求写清——最新请求的真实意图（kept 消息会被截断，风险部分要保）；已定决策 vs 未定问题分开（不许静默重开已定项）；做过什么保留精确命令/路径/关键返回值/错误行，只留最终可用版本；**还不知道什么**（引用未读的文件、假设未见的 schema、用户未答的问题）；前向计划此刻全力投资（此刻是上下文最全的最后一刻）；TODO 与事件日志会自动重挂不要复述；**诚实标注未验证的"已完成"**（"tests passing"但没验过就说没验过）；摘要长度与任务成比例不注水。
- **恢复指针**：事件日志留在磁盘、recovery pointer 自动追加（compaction-instruction.md:51）；`context-recovery-footer.md` + `contextRecovery.ts` 组装。

### 2.7 其他

- **`/web` 会话移交**：TUI 退出、本进程变 kap-server 前台服务并开 deep link 把当前会话交给浏览器（`src/tui/commands/web.ts:21-34`）；`remote-control` 包经中继转发 HTTP/WS 并出 QR（packages/remote-control/package.json description）。
- **`/import-from-cc-codex` skill**：从 Claude Code/Codex 迁移 instructions/skills/MCP 声明，负面清单明确（不迁 credentials/hooks/插件/自定义命令），写前必须预览+确认（`builtin/import-from-cc-codex.md:14-31`）。
- **sub-skill（parent/review/consolidate）**：知识整理型 builtin skill（`builtin/sub-skill/` 目录）。
- **ACP**：Zed/JetBrains 经 `kimi acp` stdio 驱动（README；packages/acp-server）。
- **外部 hooks**：生命周期关键点跑本地命令门禁/审计/通知（README Key Features；`features/externalHooks/`）。
- **tree-sitter-bash**：纯 TS bash 解析器，为命令安全分析提供语法树（package.json description）——shell 工具的安全层底座。

## 三、与 SwarmStudio IDE 工作台差距对照

| 能力 | kimi 实现（锚点见上） | 我方现状 | 裁决 |
|---|---|---|---|
| 会话聊天+审批门 | TUI turn 循环 | IdeChatPane 流式+审批 | ≈ |
| MCP 状态页 | 六态面板+action 提示 | IdeMcpPane（连接/传输/工具数/错误行） | ≈（差 action 闭环一行） |
| 对话式 MCP 配置 | mcp-config.md 全范式 | mcpConfigPrompt.ts 已移植主干 | → 余项：查看-only 合并视图、scope 三选一结构化问法、超时/字段指引、bearerTokenEnvVar 话术 |
| needs-auth OAuth | authenticate 合成工具+15min 阻塞 | 无（后端无通道） | → G6 余项，需 hermes-agent 出通道 |
| 视频输入 | kimi-file 引用+请求时解析+预算 | 无 | → 设计蓝图可整体借（附件面板+agent 侧解析） |
| 媒体预算降级 | 20MB/10MB 换 path 标签 | 无 | → 与上项同批 |
| agent 读媒体 | ReadMediaFile（region 裁剪） | 无 | → 随视频项 |
| compact 交接 | compaction-instruction.md | hermes 侧自有 compact | → 提示词结构直接吸收 |
| 会话 fork | /fork 留原会话 | 无 | → 任务侧栏可加「复制会话」 |
| 对话 undo | /undo+选择器+草稿还原 | 无 | ×/→ 取决于 hermes 会话模型 |
| 文件 checkpoint | fileHistory turn 双相快照 | IdeGitPane 无 checkpoint | → zcode git-checkpoint 之外的第二个参照 |
| 子代理扇出 | AgentSwarm items 模板 | IdeSubagentsFloat（单发） | → 批量 items 范式 |
| 侧问面板 | /btw | 无 | → 轻量可搬 |
| goal 预算 | token/turn/wallClock 三预算 | 无（zcode G5 亦未做） | → backlog 参照 |
| 定时任务 | cron feature | 无 | → 远期 |
| 插件市场+信任门 | marketplace+trust prompt | 技能/MCP 管理页无信任门 | × 生态未到，暂不搬 |
| 毫秒 TUI 启动 | 懒会话+差分渲染 | 我们是 web 常驻 | × 不适用；但其**懒建会话+恢复限 10 轮回放**对会话切换开销有参照价值 |
| web 会话移交 /web | TUI→浏览器 | 本身即 web | × |
| tower 多代理塔 | .tower/ 协议+merge gate | 计划/子代理浮窗已够用 | × 实验态，概念留档 |

## 四、建议搬运项排序

| # | 项 | 价值 | 成本 | 优先级 |
|---|---|---|---|---|
| 1 | compact 交接摘要提示词结构（意图/已定 vs 未定/做过什么/还不知道什么/前向计划/诚实未验证） | 纯提示词资产，直接提升 hermes compact 后的续作质量，六段式比通用"总结对话"强得多 | 极低：一段 markdown 融进 hermes compact 提示词 | P0 |
| 2 | /mcp-config 余项（查看-only 合并视图话术、scope AskUserQuestion 三选一、超时字段指引、IdeMcpPane needs-auth 行的 action 提示闭环） | 我方已建范式骨架，补齐后 agent 行为与 kimi 对齐，MCP 页签从纯展示变可引导 | 低：提示词改写 + 面板一行 | P0 |
| 3 | 视频输入链路（kimi-file:// 间接引用 + 会话物化 + 请求时按模型能力解析 + 20MB 预算降级为 path 标签 + capability 前置校验） | 录屏投喂是台账钦点能力，kimi 的间接引用设计让 wire 记录、重放、跨模型重解析都不带 base64 | 中高：需 hermes-agent 增媒体解析与上传通道；前端附件面板+预览芯片可先行 | P1 |
| 4 | ReadMediaFile 工具（含 region 裁剪） | agent 主动看图/看视频是视频输入的另一半；region 二段式（降采样全图→局部全保真）是省 token 的好设计 | 中：随 #3 同批 | P1 |
| 5 | 会话 fork（复制留原）+ undo 选择器 UX | 探索分支不打断主线，是任务侧栏的自然扩展；undo 需后端会话模型支持，先搬 fork | 中：fork 需会话复制 API | P1 |
| 6 | AgentSwarm items 扇出 + /btw 侧问 | 批量并行子代理一键扇出（128 排队）与主会话外快问，对应我方子代理浮窗的两个增量 | 中：hermes 侧需并发子代理 | P2 |
| 7 | fileHistory 回合级 checkpoint | agent 改坏的兜底回读，与 zcode git-checkpoint 合并评估（G backlog 已列） | 中：后端存储 | P2 |
| 8 | goal 三预算（token/turn/wallClock） | zcode G5 的互补参照，两仓字段口径可互校 | 中 | P2 |

不搬：插件市场信任门（生态未到）、tower（实验态）、TUI 启动优化（形态不同）、/web 与 remote-control（我们是 web 工作台本身）。MIT 许可，代码级搬运无法律障碍。

## 五、二轮穷举补漏（表面枚举，2026-09-21 追加）

方法：从注册表反向穷举（slash 命令表、工具注册调用、config section 注册调用、flag 注册、profile 注册、MIME 表、hook 事件表、TUI 组件/键位清单），只写首轮未覆盖项。首轮一处口径更正：仓库概览中"43 个 slash 命令"指 `BUILTIN_SLASH_COMMANDS` 数组本身（`apps/kimi-code/src/tui/commands/registry.ts:147-459`，实测 43 条无误），但完整命令面还有三路动态来源（见 B1），首轮未说明。

### A. 新发现功能清单（首轮未写，带锚点）

1. **自定义 agent profile 体系（markdown agent 文件）**：五级来源 builtin(0) < plugin(5) < user(10) < extra(20) < workspace(30) < explicit(40)（`agent-core-v2/src/app/agentProfileCatalog/agentProfileContribution.ts:24-30`）。发现目录：user 级 `~/.kimi-code/agents` 或 `~/.agents/agents`，项目级 `<gitRoot>/.kimi-code/agents` 或 `.agents/agents`，取第一个存在者（`workspace/workspaceAgentProfileLoader/internal/agentRoots.ts:14-41`），watch 200ms 防抖热重载（workspaceAgentProfileLoaderService.ts:20,43）。CLI `--agent <name>` / `--agent-file <path>` 直接指定（`apps/kimi-code/src/cli/commands.ts:84-114`）。
2. **内置三 profile 的角色分工与交接提示词**：agent（默认，可派生）/coder（**唯一有写工具的子代理**，whenToUse 明示）/explore（只读，promptPrefix 自动注入 git 状态上下文）（`session/agentLifecycle/profile/profiles.ts:90-125`）。coder 的 handoff 提示词"Your final message is the entire handoff — the parent sees nothing else…keep the handoff current"（profiles.ts:82-88）是子代理交接的成品话术，可直接搬给我方子代理浮窗。
3. **profile 工具清单暴露完整工具面**（profiles.ts:11-44,46-69,71-80）：除首轮已提工具外，还有 TodoList、CronCreate/CronList/CronDelete、Skill（技能即工具调用入口，`features/skill/skillFeature.ts:17`）、NotifyUser、EnterPlanMode/ExitPlanMode（`features/plan/planFeature.ts:19`）、CreateGoal/GetGoal/SetGoalBudget/UpdateGoal、SelectTools、WaitFor、FetchURL、AskUserQuestion、TaskList/TaskOutput/TaskStop、mcp__* 通配。
4. **权限规则引擎**：`[permission] rules`，decision ∈ allow/deny/ask × scope ∈ turn-override/session-runtime/project/user，pattern 校验 + reason；`dangerousCommandGuard` 开关（env `KIMI_CODE_DANGEROUS_COMMAND_GUARD`）（`agent/permissionRules/configSection.ts:20-50`）。权限模式仅 manual | yolo | auto 三态（`agent/permissionPolicy/types.ts:6`）。工具白黑名单 `[tools] enabled/disabled`（`agent/toolPolicy/configSection.ts:10-14`）。
5. **外部 hooks 完整事件表 20 个**：PreToolUse、PostToolUse、PostToolUseFailure、PermissionRequest、PermissionResult、UserPromptSubmit、UserPromptQueued、TurnStarted、Stop、StopFailure、Interrupt、SessionStart、SessionEnd、SessionHeartbeat、SubagentStart、SubagentStop、TaskStarted、PreCompact、PostCompact、Notification（`features/externalHooks/internal/types.ts:3-24`）；定义 `{event, matcher?, command, timeout?≤600s}`（`features/externalHooks/configSection.ts:10-26`）。
6. **AGENTS.md 装载链（我方"记忆/规则"资产的对标物）**：全局 `~/.kimi-code/AGENTS.md` → `~/.agents/<name>` → 每个 workDir 的 git worktree 根到 cwd 逐目录（`.kimi/AGENTS.md` 优先 + 平名文件取第一个非空），去重合并；总量 >32KB 出"增加成本"告警（`agent/profile/context.ts:13,137-199`）；文件 watch 200ms 防抖自动重载（`workspace/workspaceInstructions/workspaceInstructionsService.ts:20,27`）。`/init` 生成 AGENTS.md 即此机制的写入端。
7. **媒体矩阵补全——音频是一等公民**：MediaKind = image | video | audio | file（`agent/media/mediaRef.ts:5`）；ContentPart 有 `audio_url`（mediaRef.ts:103-107）；扩展名表 image 13 种（png/jpg/jpeg/gif/bmp/tif/tiff/webp/ico/heic/heif/avif/svgz）、video 13 种（mp4/mpg/mpeg/mkv/avi/mov/ogv/wmv/webm/m4v/flv/3gp/3g2）、audio 10 种（mediaRef.ts:8-50）。粘贴图片 Ctrl-V（win32 Alt+V）剪贴板检测提示（`tui/controllers/clipboard-image-hint.ts:16-18`）。
8. **新增 4 个 builtin skill**（完整 builtin 表 9 个，`features/skill/catalog/builtin/builtin.ts:18-28`）：`update-config`（对话式检查/修改自身 config.toml+tui.toml，含废弃键修复）、`custom-theme`（生成 JSON 自定义配色）、`write-goal`（把粗想法改写成带完成判据/边界/停止规则的 goal 合同）、`check-kimi-code-docs`（用官方文档回答产品问题）。
9. **键位全表**（`tui/components/dialogs/help-panel.ts:33-45` + editor-keyboard.ts）：Shift-Tab 切 plan 模式、Ctrl-G 外部编辑器、Ctrl-O 展开工具输出/compact 摘要、Ctrl-T 展开 todo、**Ctrl-S steer（流式输出中注入后续指令）**（editor-keyboard.ts:317）、**Ctrl-B detach 正在跑的 shell 为后台任务**（kimi-tui.ts:379）、Ctrl-C 中断/双击退出待确认（editor-keyboard.ts:212-221）、Ctrl-D 退出、Esc 关弹窗、↑↓ 输入历史。
10. **tui.toml UI 域 + 可定制状态栏**：renderLatex、disablePasteBurst、cacheExpiryHint、disableFeedbackSurvey、editorCommand、theme、notifications{enabled, condition: unfocused|always, command}、upgrade.autoInstall、markdown.mermaid off|final、**statusLine{items: [mode|goal|model|tasks|cwd|git|tips] 顺序可排，command 首行输出整行替换}**（`tui/config.ts:34,55-104`）。
11. **kap-server 全局会话内容搜索**：live（当前会话）+ search-index（磁盘索引 `search-index/` 目录，后台同步、只读刷新降级服务 stale 视图）双路径（`packages/kap-server/src/search/searchService.ts:57,402-410,340,390`）；`[database]` 配置 base/search/searchSyncSessionCap/searchSyncDebounceMs + 4 个 env（`persistence/configSection.ts:12-43`）。
12. **会话索引与生命周期**：sessionIndex manifest（schema v2）+ byParent 父子索引 + generation 化集合 `session:g<n>` + workspace 级 active/archived 计数（`app/sessionIndex/sessionIndexModel.ts:3-31`）；会话可 archive（`app/sessionManager/sessionManager.ts:24,48`）；导出面：`/export-md`、`/export-debug-zip`（含 wire-scan 自检，`app/sessionExport/wire-scan.ts`）。
13. **CLI 子命令全量 12 个 + 隐藏 2**：export、fork、provider、session（列表/过滤/--json）、acp、web、login、doctor、vis、install-desktop、migrate、upgrade(alias update)（`cli/commands.ts:124-143` + `cli/sub/` 目录）；主命令旗标含 `-p/--prompt` headless、`--output-format text|stream-json`、`--skills-dir`（可重复）、`--agent/--agent-file`、`--add-dir`（可重复）、`--plan`（commands.ts:41-133）。
14. **实验 flag 注册表 5 面**：toolSelect（渐进式工具披露）、WaitFor、NotifyUser、Tower、subagentFork（子代理上下文 fork）；三源合并 master-env > env > config `[experimental]`（`app/flag/flag.ts:13,43-52` + 各 feature flag.ts）。
15. **AgentSwarm 硬约束**：必须是一个模型响应里唯一的工具调用，违反即拒绝并要求重试（`features/swarm/agent/swarmService.ts:94-107`）。
16. **features 目录全量 18 项**，首轮未提 3 项：`dateChange`（跨日上下文披露基线）、`reminder`（`<system-reminder>` 包裹注入，features/reminder/systemReminder.ts:3-8）、`sessionInit`（会话启动模板）。
17. **Reverse-RPC**：TUI 内 approval/question 弹窗可经反向 RPC 通道驱动（`apps/kimi-code/src/tui/reverse-rpc/`：approval/question/base-controller/modal-coordinator）——即 headless/web 场景下审批弹窗转发给远端 UI 的机制，kap-server 与 TUI 共用组件。
18. **loopControl / image / subagent / swarm 可调参数**：`[loopControl]` maxStepsPerTurn、maxAttemptsPerStep、maxRalphIterations、reservedContextSize、compactionTriggerRatio(0.5-0.99)、compactionMaxAttempts（`agent/loop/configSection.ts`）；`[image]` maxEdgePx、readByteBudget（`agent/media/configSection.ts`）；`[subagent]` timeoutMs；`[secondaryModel]` defaultModel/models(profile→model 映射)/force；`[swarm]` timeoutMs（各 configSection.ts）。

### B. 表面枚举总表

**B1. slash 命令（43 内置 + 3 路动态）**，registry.ts:147-459：

| 组 | 命令（一句话） |
|---|---|
| 权限/模式 | yolo(=yes 常规自动/险项仍问)、auto(全自动不问)、permission(模式选择)、plan(切/清计划模式)、settings(=config 设置面板)、swarm(on/off/单任务)、tower(status/teardown/on/off/基分支，实验旗) |
| 模型/提供方 | model(切换)、secondary-model(=subagent-model 子代理模型)、effort(=thinking 推理力度)、provider(add/delete/refresh)、login/logout |
| 会话 | new(=clear)、sessions(=resume 浏览恢复)、fork、undo、title(=rename)、compact(带自定义指令)、init(生成 AGENTS.md)、export-md(=export)、export-debug-zip |
| 任务/状态 | tasks(=task 后台任务浏览器)、mcp(状态面板)、plugins、goal(status/pause/resume/cancel/replace/next 六子命令+队列)、usage(令牌+窗口+配额)、status(会话与运行时)、feedback(=bug) |
| 环境 | add-dir(附加工作区目录，路径补全)、experiments(=experimental)、reload(config.toml+tui.toml)、reload-tui(仅 UI)、editor(Ctrl-G 外部编辑器)、theme |
| 分发 | btw、web、desktop(=install-desktop)、remote-control(=rc)、copy(末条回复进剪贴板)、help(=h,?)、exit(=quit,q)、version |

动态来源：builtin skill 直接注册为裸命令名（`tui/commands/skills.ts:38-42`，9 个见 A8）；插件 commands（plugin-commands.ts）；项目 `.kimi-code/` 自定义命令（skills 发现目录 `.kimi-code/skills` / `.agents/skills`，catalog/configSection.ts）。

**B2. agent 工具（约 31 + mcp__\* + Tower\* 9 + needs-auth 合成）**：

| 域 | 工具 | 注册锚点 |
|---|---|---|
| 文件 | Read、Write、Edit、Glob、Grep | tools/os/*/\*Tool.ts:623/136/115/329/348 |
| 执行 | Bash（含后台 process 任务） | bashTool.ts:439 |
| 任务 | TaskList、TaskOutput、TaskStop、WaitFor(实验) | task/*/\*Tool.ts:45/107/64/362 |
| 子代理 | Agent、AgentSwarm（唯一调用约束） | agentTool.ts:682、swarmService.ts:94 |
| 媒体 | ReadMediaFile（region 裁剪） | media/registerMediaTools.ts |
| Web | WebSearch、FetchURL | webSearchTool.ts:114、fetchUrlTool.ts:79 |
| 交互 | AskUserQuestion、NotifyUser(实验)、SelectTools(实验) | askUserQuestionTool.ts:255、notifyFeature.ts、selectToolsTool.ts:80 |
| 计划/目标 | EnterPlanMode、ExitPlanMode、CreateGoal、GetGoal、SetGoalBudget、UpdateGoal | planFeature.ts:19、goal feature |
| 记忆/日程 | TodoList、CronCreate、CronList、CronDelete | todoFeature.ts:13、cron |
| 技能 | Skill | skillFeature.ts:17 |
| MCP | mcp__\*、mcp__\<server\>__authenticate(needs-auth 合成) | profiles.ts:43、agent/mcp/tools/auth.ts |
| Tower(实验) | TowerInit/Status/Teardown + finding/inbox/merge/mission/plan/review/send/spawn | features/tower/tools/ |

**B3. config.toml 域（约 30 组）**：providers、models、modelCatalog、thinking、defaultModel、defaultProvider、defaultPermissionMode、defaultPlanMode、permission、tools、experimental、hooks、background、mcp、read、image、loopControl、task、agentTask、subagent、secondaryModel、swarm、cron、goal、todo、plan、notify、skill(extraSkillDirs)、extraAgentDirs、identity、watch、database、edit、questionTools、toolSelect、web、os（各 configSection.ts 注册，见 A4/A5/A14/A18）。

**B4. TUI 面**：33 个对话框组件（dialogs/ 目录：model-selector、approval-panel、undo-selector、session-picker、tasks-browser、goal-queue-manager、trust-prompt、experiments-selector 等）；消息渲染 26 类（messages/ 目录：agent-swarm-progress、goal-panel、plan-box、mcp-status-panel、usage-panel、thinking、cron-message 等）；键位 12 条（A9）。

**B5. 其他注册表**：CLI 12+2 子命令（A13）；实验旗 5 面（A14）；hook 事件 20 个（A5）；builtin skill 9 个（A8）；builtin agent profile 3 个（A2）；媒体 MIME 表 image 13/video 13/audio 10（A7）；tui.toml 9 键域（A10）；插件 manifest 字段 skills/agents/mcpServers/hooks/commands/sessionStart/systemPrompt（首轮已提）。

### C. 差距对照增量（仅变化项）

| 新对照项 | kimi 实现 | 我方现状 | 裁决 |
|---|---|---|---|
| 自定义 agent（markdown profile 文件） | 五级来源优先级 + 目录发现 + 热重载 + --agent | 子代理浮窗仅内置类型 | → P1：`.kimi-code/agents` 目录发现 + 角色文件格式值得整体对齐（含 coder 唯一可写、explore 只读注入 git 上下文的分工） |
| coder 交接话术 | "final message is the entire handoff"（profiles.ts:82-88） | 子代理结果无结构化交接约定 | → P0 级低成本：一段提示词 |
| 权限规则引擎 | allow/deny/ask × 4 scope 持久化 + 危险命令守卫 | 审批门无规则记忆 | → P1 参照（会话内"总是允许"落库为规则） |
| steer 流中注入 | Ctrl-S 流式输出中排入后续指令 | 无 | → P1：聊天流式中的"补充指令"入口 |
| Ctrl-B detach shell | 前台命令转后台任务不阻塞 | 终端页签无 detach | → P2 |
| 状态栏可定制 | 7 槽位排序 + command 整行替换 | 状态栏遥测固定 | → P2：槽位开关/排序即可 |
| 会话全文搜索 | kap-server live+index 双路径 | 会话列表无内容搜索 | → P2（后端 SQLite 已有底座） |
| AGENTS.md 装载链 | 全局→通用→git 根到叶 + 32KB 告警 + watch | 记忆页签自有实现 | → 对照校验：层级合并/超限告警/热重载三细节可吸收 |
| TodoList/Cron/plan-mode 工具族 | agent 可自查改 todo/起 cron/进出 plan 模式 | 计划与子代理浮窗为 UI 侧，agent 工具族待核 | → 与 hermes-agent 对账 |
| 外部 hooks 20 事件 | 生命周期全挂点 | 无 | → G backlog（审批/紧凑/子代理事件面值得留档） |
| headless -p/--output-format stream-json | 单次非交互 + 流式 JSON 输出 | 无 headless 口 | → P2：CI/脚本化场景 |
| update-config skill | agent 对话式改自身配置+修废弃键 | mcpConfigPrompt 已有同型 | → 范式再复用一份即可，成本低 |

首选拷新增（并入 §四 排序建议）：coder 交接话术与 AGENTS.md 装载链细节并入 P0/P1 批；自定义 agent profile 目录与 steer 注入列 P1；权限规则引擎、状态栏槽位、会话搜索列 P2。
