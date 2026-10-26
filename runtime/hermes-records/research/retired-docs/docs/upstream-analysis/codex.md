# codex 源码普查：协议面、审批沙箱、TUI 渲染与 SDK 能力

2026-09-21，基于 upstream/codex @ a866315（克隆时 HEAD，即「TUI 独立渲染开关」当日提交）。Apache-2.0，允许参考实现；落点为 overlay 组件，不拷代码。锚点均为相对 `upstream/codex/` 的路径。

## 一、仓库概览与技术栈

OpenAI 官方 coding agent，Rust 核心 + TS CLI 包装 + 双语 SDK，Bazel 构建（`MODULE.bazel`、根 `BUILD.bazel`）。

| 目录 | 内容 |
|---|---|
| `codex-rs/`（124 个 crate） | Rust 主体。核心域各占独立 crate：`core`（agent 循环/工具）、`protocol`（协议类型）、`app-server*`（IDE 通道，5 个 crate）、`execpolicy`（命令审批策略语言）、`sandboxing`/`linux-sandbox`/`windows-sandbox-rs`/`mxc-sandbox`（沙箱）、`tui`（终端 UI）、`exec`（无 UI 一次性执行）、`rollout`（会话持久化 JSONL）、`memories`（记忆读写管线）、`skills`/`hooks`/`plugin`/`connectors`（扩展机制）、`realtime-webrtc`/`voice-host`（语音）、`state`（SQLite 日志）、`cloud-tasks*`、`thread-store`/`thread-manager-sample`（多会话） |
| `codex-cli/` | npm 分发壳（`bin/codex.js` 启动 Rust 二进制），非逻辑所在 |
| `sdk/typescript`、`sdk/python(-runtime)` | 包装 CLI 的进程级 SDK（stdin/stdout JSONL） |
| `docs/` | 用户文档（config/sandbox/skills/slash_commands/execpolicy 等） |

关键修正一个预设：**VS Code 扩展本体不在此仓**（README:6 指向 developers.openai.com/codex/ide 分发）。本仓提供的是扩展消费的服务端：`app-server` 二进制以 JSON-RPC 暴露全部能力（`codex-rs/app-server/src/main.rs:9` 起 `run_main_with_transport_options`）。

## 二、功能特性清单

### 2.1 IDE 集成协议（app-server JSON-RPC）——本次普查最高价值区

协议三层定义全部在 `codex-rs/app-server-protocol/src/protocol/common.rs` 的宏表里，是机器可读的单一事实源（serde tag = 方法名，ts-rs 同步导出 TS 类型）：

- **客户端→服务端请求**（`common.rs:506` `client_request_definitions!`，约 170 个方法）。按域分组的核心面：
  - 会话：`thread/start|resume|fork|archive|delete|revert|list|read|search`、`thread/turns/list`、`thread/items/list`、`thread/section/*`（会话内手动分节）、`thread/inject_items`
  - 轮次：`turn/start|interrupt|steer|settings/update`（steer = 轮中进行中追加引导输入，`protocol/v2/turn.rs:293`）
  - 队列与目标：`thread/queue/add|list|reorder|start`（排队任务）、`thread/goal/set|get|clear`
  - 上下文：`rollout/compress`、`thread/compact/start`
  - 文件：`fs/readFile|writeFile|readDirectory|watch|unwatch`（服务端代理文件系统 + 监听推送）、`fuzzyFileSearch`（含会话式增量）
  - 进程/终端：`command/exec*`（一次性+交互式写 stdin/resize/terminate）、`process/spawn|writeStdin|kill|resizePty`
  - MCP：`mcpServer/oauth/login`、`mcpServerStatus/list`、`mcpServer/tool/call`、`mcpServer/event/stream/*`
  - 配置/账号：`config/read|value/write|batchWrite`、`account/*`（登录、rate limits、token usage）、`model/list`、`experimentalFeature/list`
  - 扩展生态：`plugin/*`（含 share/save 分享通道）、`marketplace/add|upgrade`、`skills/list`、`hooks/list`
- **服务端→客户端请求**（`common.rs:1754`）：`item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/permissions/requestApproval`、`item/tool/requestUserInput`、`mcpServer/elicitation/request`、`dynamicTool` 的 `item/tool/call`、`attestation/generate`、`currentTime/read`——审批与"服务端反向调用宿主"是协议一等公民。
- **服务端事件通知**（`common.rs:1909`，80+ 个）：线程生命周期（`thread/started|status/changed|compacted`）、轮次（`turn/started|completed|diff/updated|plan/updated`）、条目流（`item/started|completed`、`item/agentMessage/delta`、`item/plan/delta`、`item/reasoning/*`）、文件变更（`fs/changed`）、用量（`thread/tokenUsage/updated`）、Guardian 自动审批审查（`item/autoApprovalReview/*`）。
- **握手与能力协商**：`initialize` 带 `clientInfo` + `InitializeCapabilities`（experimentalApi 开关、按方法名 opt-out 通知、MCP extensions map，`protocol/v1.rs:29-63`）。
- **传输**：stdio JSONL（默认，`app-server-transport/src/transport/stdio.rs:1`）+ Unix socket 上的 WebSocket（远程控制/守护，`transport/unix_socket.rs:1`）。`app-server-daemon` 支持连接恢复（`app-server/src/daemon_thread_recovery.rs`）。
- **渲染模型 ThreadItem**（`protocol/v2/item.rs:236`，18 个变体）：UserMessage/AgentMessage/Reasoning/Plan/CommandExecution/FileChange/McpToolCall/DynamicToolCall/CollabAgentToolCall/SubAgentActivity/ImageView/ContextCompaction/EnteredReviewMode 等——服务端已完成"原始模型事件 → UI 可渲染条目"投影（`protocol/thread_history_projection.rs`），客户端零解析逻辑。

### 2.2 审批与沙箱模型

- **审批策略四档**（`protocol/src/protocol.rs:986`）：`untrusted`（未信任项目一律审批）/ `on-request`（模型自行决定，默认）/ `granular`（分项：sandbox 审批、规则、技能、权限请求、MCP elicitation 各自开关，`protocol/src/protocol.rs:1004` 与 `app-server-protocol/src/protocol/v2/shared.rs:182-191`）/ `never`。
- **决策枚举比"批/拒"丰富**（`protocol/src/protocol.rs:4145` ReviewDecision）：Approved / ApprovedForSession（本会话同类自动批）/ ApprovedExecpolicyAmendment（批准并沉淀为策略规则）/ ApprovedMcpPolicyAmendment / NetworkPolicyAmendment（按 host 持久化网络规则）/ Denied / Abort / TimedOut。**"批准即学习"是可搬的产品语义**。
- **沙箱模式三档**（`protocol/src/config_types.rs:104`）：read-only / workspace-write / danger-full-access；细粒度新模型 `FileSystemSandboxPolicy`（`protocol/src/permissions.rs:235`）为条目表：路径（含 `:root`/`:tmpdir` 等 special path、glob）× 访问模式 read/write/deny（`permissions.rs:114`），deny 优先、write 胜 read；`.git/.codex/.agents` 元数据目录默认写保护（`permissions.rs:38-46`）；网络独立 `NetworkSandboxPolicy`（`permissions.rs:80`）。legacy `SandboxPolicy` 枚举见 `protocol/src/protocol.rs:1072`。
- **平台执行**：macOS Seatbelt——`.sbpl` 策略文件编译嵌入（`sandboxing/src/seatbelt.rs:21-25`，base/network/preferences 三份，closed-by-default 起步，见 `seatbelt_base_policy.sbpl:8`）；Linux Landlock + bubblewrap（`sandboxing/src/landlock.rs:26` 把 permission profile 序列化后传给 `codex-linux-sandbox` helper，代理网络走 bwrap 网络命名空间）；另有 Windows 沙箱与 `mxc-sandbox`。
- **execpolicy 规则语言**（`execpolicy/src/`）：按可执行名/前缀模式的 allow 规则 + host 级网络规则（`execpolicy/src/policy.rs:30`、`rule.rs`），用户批准后可生成 amendment 持久化。
- **Guardian 自动审批审查**：同步/异步的"计划动作安全审查"子系统（`guardian-context/src/lib.rs:1`，`action.rs` 的 PlannedAction），审查过程对客户端可见（`item/autoApprovalReview/started|completed` 事件，`common.rs:1909` 表内）。

### 2.3 TUI（终端 UI）

- **渲染分项开关（当日 HEAD a866315）**：`tui.rendering.{mermaid,math,tables}` 三布尔，默认全开，独立于动画总开关（`config/src/tui_rendering.rs:11-19`；配置挂载 `config/src/types.rs:762-764`）。关闭时保留源文本（表格连 pipe 语法和围栏都原样保留），运行时全局偏好经 `tui/src/markdown_render/preferences.rs:11` 的 RwLock 静态读取，消费点 `tui/src/markdown.rs:251`（表格）与 `tui/src/markdown_render.rs:962`（mermaid）。
- **动画分级开关**：总开关 `animations` + 六个分项（starfield/shimmer/welcome/effort/progress/title，`config/src/tui_effects.rs:11-24`）。
- **状态栏可配置条目**（`tui/src/bottom_pane/status_line_setup.rs:56` StatusLineItem 枚举）：模型名+推理档、cwd、git 分支、PR 号、分支 diff 统计、审批模式、权限档、**context 剩余/已用百分比**、5 小时/周限额、窗口大小、会话 token 总量/输入/输出——每项可单独上栏。
- **通知**：外部命令钩子 `notify = ["notify-send", "Codex"]`，轮结束追加 JSON 参数调用（`core/src/config/mod.rs:733-743`）；TUI 内建桌面通知带事件筛选/方式/仅失焦时投递三档（`config/src/types.rs:715-730` TuiNotificationSettings）。app-server 侧可按连接剥离媒体负载（`app-server/src/notification_media.rs:11`）。
- **计划模式闭环**：Plan 模式产出计划后弹三选一：实现 / 清空上下文后实现 / 留在计划模式（`tui/src/chatwidget/plan_implementation.rs:8-19`，清空上下文提示词模板同文件 16-19 行）。
- **/ide 上下文注入**：`/ide` 命令开关 IDE 上下文 prompt 注入（`tui/src/chatwidget/ide_context.rs:1`）。会话 recap（`chatwidget/recap.rs`）、模型/服务档/速率限额/权限菜单（`chatwidget/model_popups.rs`、`rate_limits.rs`、`permissions_menu.rs`）等模块化拆分（chatwidget 目录 100 个文件）。

### 2.4 Agent 核心与工具面

- **计划工具**：`update_plan`（`core/src/tools/handlers/plan.rs:50`，schema 在 `plan_spec.rs:44`——step+status 列表，**同时只允许一个 in_progress**）。
- **多代理工具族**：v1 `spawn_agent/send_input/wait/close/resume`（`core/src/tools/handlers/multi_agents_spec.rs:85`）、v2 追加 `interrupt/list_agents/followup_task`（`handlers/multi_agents_v2.rs`）；ThreadItem 有对应 `SubAgentActivity`/`CollabAgentToolCall` 渲染条目（`protocol/v2/item.rs:370-393`）。
- **上下文工具**：`new_context`（agent 主动开新窗口、不摘要，`core/src/tools/handlers/new_context_window_spec.rs:6`）、`get_context_remaining`（`handlers/get_context_remaining.rs`）。
- 其他：apply_patch、unified exec（`handlers/unified_exec.rs`）、view_image、tool_search、request_permissions、request_user_input(_async)、动态工具（`app-server/src/dynamic_tools.rs`）、sleep；工具注册表 `core/src/tools/registry.rs`，清单装配 `core/src/tools/spec_plan.rs`。

### 2.5 compact / 上下文管理

- 三路压缩（`core/src/compact.rs`）：本地模型摘要（SUMMARIZATION_PROMPT，用户消息上限 20k token，`compact.rs:48`）、远端压缩 v2（`compact_remote_v2.rs`，含图片预算）、**token-budget 压缩**——跳过摘要直接换新窗口，但仍走完整 compact 生命周期（hooks、ContextCompaction 条目，`core/src/compact_token_budget.rs:15-46`）。
- 自动压缩阈值 `model_auto_compact_token_limit` + 作用域可配（`core/src/config/mod.rs:628-632`）；轮中压缩（mid-turn）与轮前/手动压缩的初始上下文回注策略不同（`compact.rs:50-58` InitialContextInjection）。
- 压缩前后有 pre/post compact hooks（`core/src/hook_runtime.rs`）。事件 `thread/compacted` 推给客户端（`common.rs:1909` 表）。

### 2.6 会话持久化、多会话与目标

- rollout：JSONL 逐条追加 + 反向扫描（`rollout/src/lib.rs:50`、`reverse_jsonl_scanner.rs`），fork/resume/压缩（`rollout/src/compression.rs`）。
- 目标追踪：`ThreadGoal` = objective + status（Active/Paused/Blocked/UsageLimited/BudgetLimited/Complete）+ token_budget/tokens_used/time_used（`protocol/src/protocol.rs:4085-4122`），事件 `thread/goal/updated`。
- 多会话管理样本：`thread-manager-sample` crate + `thread-store`。

### 2.7 token 用量与成本

- `TokenUsage`：input/cached_input/cache_write_input/output/reasoning_output/total（`protocol/src/protocol.rs:2235-2254`）；`TokenUsageInfo` = 累计 + 最近一次 + 窗口大小（`protocol.rs:2270-2276`）；每响应 `TokenUsageRecord`（thread/turn/session 三级归集，`protocol.rs:2258`）。
- 会话级美元成本：`ThreadUsage` 按 (model, reasoning_effort, speed) 分组的 credits/USD 估计 + 分组 token 明细（`app-server-protocol/src/protocol/v2/thread_usage.rs:9-29`）；`turn_cost_worker` 后台轮询后端成本 API（`app-server/src/turn_cost_worker.rs:35`，150s 轮询）。
- 账号级：`AccountTokenUsageSummary`（lifetime/peak_daily/最长轮时长/**连续使用天数**，`protocol/v2/account.rs:495-501`）+ 日桶（`account.rs:506`）——与 zcode G7 差距项同型。

### 2.8 SDK 能力面

- TS SDK（`sdk/typescript/src/codex.ts:11`）：`Codex.startThread()/resumeThread(id)`，`thread.run()` 缓冲式或 `runStreamed()` 异步生成器（`thread.ts:66/118`）；结构化输出 `outputSchema`（含 zod 转 JSON schema 用法，`outputSchemaFile.ts`）；图片输入走 `--image`（`thread.ts:144` normalizeInput）；config 覆盖序列化为 TOML 字面量传 `--config`（README:135-155）；env 完全可控（Electron 宿主场景，README:117-127）。事件类型对齐 exec_events（`events.ts:1-76`）。
- Python SDK 同构（`sdk/python/`，含 notebooks/examples）。
- SDK 是 app-server 之外的薄通道：spawn CLI、stdin/stdout JSONL——进程级集成样板。

### 2.9 其他

记忆管线：读路径注入 + 引用解析 + 使用分类，写路径两阶段提示词 + 合并模板（`memories/README.md`、`memories/read/src/citations.rs:6`），消息条目带 `memory_citation` 字段（`protocol/v2/item.rs:258`）。realtime 语音（`protocol/v2/realtime.rs`，480 行：音频增量/转录/SDP）。外部 agent 配置迁移（`external_agent_config/detect|import`，含进度与完成事件）。远端控制配对（`remoteControl/*` 9 个方法）。

## 三、与 SwarmStudio IDE 工作台差距对照

| codex 能力 | 我方现状 | 判定 | 理由与落点建议 |
|---|---|---|---|
| ThreadItem 投影模型（服务端出渲染条目） | 前端从 socket 事件自行组装消息树 | → | 语义可搬：后端 hermes-agent 增一层 item 投影，前端按 item 类型渲染，砍前端解析分支 |
| turn/steer 轮中引导 | 无（轮中只能等或停） | → | 需后端支持轮中注入；前端只需输入框 steer 态 |
| 审批决策 ApprovedForSession / 策略沉淀 | 审批门只有批/拒 | → | 高价值：审批 UI 加"本会话同类自动批"勾选，后端记规则缓存 |
| granular 审批分项（沙箱/技能/MCP 分开关） | 无分项 | → | 语义简单，落审批设置面板 |
| ReviewDecision 8 态（含 amendment） | 2 态 | → | 同上，随审批改造一并落 |
| 沙箱策略条目表（path×read/write/deny + 网络） | 无沙箱模型（hermes-agent 本机直跑） | × | 运行时差异（Rust Seatbelt/Landlock vs Node），除非后端引入沙箱，否则只有概念价值 |
| Guardian 自动审批审查 | 无 | × | 依赖 OpenAI 后端模型审查链路 |
| TUI 渲染分项开关 mermaid/math/tables | 无分项（MessageList 全有或全无） | → | 纯前端：MessageList 渲染器按偏好开关回退源码展示，设置存 localStorage+后端 |
| 状态栏可配置条目（token/限额/审批模式等逐项开关） | 状态栏遥测簇已具备（M2）但固定条目 | → | 扩展 IdeStatusBar 为条目可配置（借鉴 StatusLineItem 枚举面） |
| notify 外部命令钩子 + TUI 通知三档 | 无系统通知 | → | Koa 后端轮完成事件触发外部命令即可，成本低 |
| 计划模式三选一收口（实现/清上下文实现/留下） | IdePlanFloat 无实施门 | → | 纯前端交互 + 一条 prompt 模板（plan_implementation.rs:16 的清上下文提示词可直接参考措辞） |
| update_plan 工具（单 in_progress 约束） | hermes 侧已有计划工具（IdePlanFloat 消费） | ≈ | 语义平手；"至多一个 in_progress"约束值得对齐校验 |
| ThreadGoal 目标追踪（budget/status/时间） | G5 backlog（zcode 侧同型差距） | → | 与 G5 合并实现：goal 面板 + tokenBudget 进度 |
| token-budget compact（免摘要换窗）+ 阈值配置 | 无 compact（依赖底座自动） | → | 后端 hermes-agent 侧实现窗口重置语义 |
| 会话内分节 thread/section + 手动 move | 无 | → | 低优先；时间线分组 UI 已近 |
| thread/queue 排队任务 | 任务侧栏有队列语义（IdeTaskSidebar） | ≈ | 平手 |
| ThreadUsage 按 (model,effort) 分组成本 + 连续天数/日桶 | usage store 有模型/日趋势，无成本美元与连续天数 | → | 随 G7 轮次落 |
| MCP OAuth login / status list / tool call 直调 | IdeMcpPane 有 status（M3）；无 OAuth、无直调 | → | OAuth 是 G6 余项同型；直调需后端通道 |
| fs/watch + fuzzyFileSearch 服务端代理 | 文件树为前端拉取快照 | ≈→ | watch 推送可改善实时性，成本中等 |
| app-server JSON-RPC 单一事实源宏表 | REST+socket（zcode.md 已裁决不迁移架构） | ≈ | 借"协议类型即事实源 + ts-rs 导出"的治理方法，不搬协议 |
| TS/Python 进程级 SDK | hermes-agent 为内置运行时 | × | 架构位不同；SDK 的 outputSchema 结构化输出范式可借 |
| 语音 realtime / 远程控制 / 云任务 | 无 | × | 超出工作台当前范围 |

## 四、建议搬运项排序

| 优先级 | 搬运项 | 价值 | 成本 |
|---|---|---|---|
| P0 | 渲染分项开关（mermaid/math/tables 独立回退源码） | 消息渲染可控性是每日使用的高频体验，当日 HEAD 即此功能，语义已被上游验证 | 纯前端：MessageList 三个渲染分支加偏好开关 + 设置面板，无后端改动 |
| P0 | 审批"批准即学习"（ApprovedForSession + 规则沉淀语义） | 审批门是我方已有组件，只差决策丰富度；直接减少重复打扰 | 前端审批卡加勾选；后端按命令模式缓存会话级白名单，一个 store 即可 |
| P1 | 计划实施三选一门（实现/清上下文实现/留下） | IdePlanFloat 现在有计划无收口，计划→执行断层 | 纯前端弹层 + 两条 prompt 模板；"清上下文"依赖会话重置接口（若无则降级两选一） |
| P1 | 状态栏条目可配置化（对照 StatusLineItem 枚举面） | 遥测簇（M2）已具备数据，可配置化是低成本增值 | 状态栏组件改注册表模式 + 一个设置 UI |
| P1 | turn 完成 notify 外部命令钩子 | 长任务挂后台时的通知刚需，上游配置面极简（argv + JSON 参数） | Koa 一条配置 + child_process 调用 |
| P2 | ThreadGoal 目标追踪面板 | 与 zcode 侧 G5 同型，一次实现两边收益 | 需后端 goal 状态 + 事件；建议与 G5 合并排期 |
| P2 | token-budget 换窗（免摘要 compact） | 大会长会话的兜底手段，成本语义清晰 | 需 hermes-agent 理解"丢历史开新窗"，跨仓改动 |
| P2 | ThreadUsage 成本分组 + 连续天数 | usage 面板升级（G7）素材，美元计价对用户直观 | 依赖后端按 turn 记账；与 G7 合并 |
| P2 | steer 轮中引导 | 轮次纠偏不中断，体验强但依赖运行时轮中注入通道 | 后端通道是主要成本，先挂 backlog 观察需求强度 |

未覆盖声明：未逐行核读 `tui` 全部 100 个 chatwidget 模块与 `cloud-tasks`/`code-mode` 域（与本工作台无直接落点）；`docs/execpolicy.md` 为用户文档未展开。上述条目均直读源码核verified，无推测项。

---

# §二轮穷举补漏（表面枚举）

2026-09-21 二轮。方法与首轮相反：从各注册表（clap 枚举、slash 枚举、Feature 枚举、ConfigToml 结构体、hook 事件表、MCP 配置结构体）反向穷举表面。锚点相对 `upstream/codex/`；首轮已覆盖项不再展开。协议表精确计数（bounded 行区间实测）：client→server 请求 **167** 个（`common.rs:506-1753`）、server→client 请求 **9** 个（`common.rs:1754-1908`）、server→client 通知 **83** 个（`common.rs:1909-2052`）——首轮"约 170/80+"的说法成立，无需更正。

## A. 新发现功能清单（首轮未写，均带锚点）

1. **hooks 是全生命周期事件系统，不止 compact**：11 种事件 `PreToolUse/PermissionRequest/PostToolUse/PreCompact/PostCompact/SessionStart/UserPromptSubmit/SubagentStart/SubagentStop/Stop/Interrupt`（`codex-rs/hooks/src/schema.rs:102` HookEventNameWire；事件实现目录 `hooks/src/events/`）。hook 输出可回写 `decision`/`reason`/`system_message`/`suppress_output`（`schema.rs:88-99` universal 输出），即外部命令可否决工具调用。首轮只提了 pre/post compact hooks。
2. **config 是 8 层叠加模型，带 per-key 来源元数据**（`codex-rs/config/src/loader/README.md` 与 `loader/mod.rs:118-129`）：MDM managed > legacy managed 文件 > SessionFlags（CLI `--config` 点路径写入）> **Project（`.codex/config.toml`，含父目录与 git 根回溯，未 trust 则加载但禁用）** > user profile（`<name>.config.toml`）> user（`config.toml`）> enterprise 云配置 bundle > system（`/etc/codex/config.toml`）。`ConfigLayerStack` 输出 effective config + 每键 origins + 每层指纹（乐观并发检测）。`/debug-config` slash 可视化来源（`tui/src/slash_command.rs:122`）。
3. **profiles 完整机制**（`config/src/profile_toml.rs:24` ConfigProfile）：可覆盖 model/service_tier/provider/approval_policy/sandbox_mode/effort×2/verbosity/instructions 开关组/tools/web_search/analytics/features/windows 等 ~25 键；CLI `-p/--profile` 选择（`cli/src/main.rs:480`）。
4. **agent roles 用户自定义角色**（`codex-rs/agent-roles/src/agent_role_config.rs:10`）：`[agents.<role>]` = description + `config_file`（**角色专属配置层**，spawn 时叠加）+ `nickname_candidates`（子代理昵称池，`config/src/config_toml.rs:718-726` 示例）；`AgentsToml`（`config_toml.rs:696`）另有 max_concurrent_threads_per_session/max_depth/default_subagent_model(+effort)/interrupt_message。
5. **MCP client 能力面完整**（`config/src/mcp_types.rs`，首轮只写了协议方法名）：transport 二型——stdio（command/args/env/env_vars/cwd，`mcp_types.rs:564-576`）与 streamable-http（bearer_token_env_var/http_headers/env_http_headers/**http_headers_helper 本地命令动态产头**，`mcp_types.rs:577-594`）；auth 三模式——OAuth（默认）/ChatGPT 会话复用/EMA 企业 IdP refresh token 交换（`mcp_types.rs:194-209`）；per-server 控制——enabled/required/enabled_tools 白名单 + disabled_tools 黑名单/default_tools_approval_mode/startup_timeout_sec/tool_timeout_sec/omit_tools_from/scopes（`mcp_types.rs:218-278`）；elicitation 请求（`codex-mcp/src/elicitation.rs`）与企业 EMA 托管（`mcp_enterprise_managed_auth` 键）。
6. **Feature 开关注册表 148 个**（`codex-rs/features/src/lib.rs:93` Feature 枚举实测变体数）：`[features]` 配置节 + `codex features` 命令 + TUI `/experimental` 开关（`cli/src/main.rs:1146` FeaturesSubcommand；`tui/src/slash_command.rs:22`）。
7. **collaboration mode = 模式 × 设置捆绑**（`protocol/src/config_types.rs:674-708`）：ModeKind 目前 Plan/Default 两态（Default 别名 code/pair_programming/execute/custom），每个 mode 携带 model/reasoning_effort/developer_instructions 三件套并可 apply_mask 覆盖；`collaboration-mode-templates` crate 提供模板。
8. **web_search 四档语义**（`protocol/src/config_types.rs:376-391`）：Disabled/Cached/Indexed/Live，`restrict_to` 取两方配置交集——多层配置下"最严者胜"的合并语义。
9. **rollout 文件名编码与会话寻址**（`rollout/src/rollout_file_name.rs:11-16`）：文件名 = timestamp + thread_id + rollout_id；**revert 后的线程追加独立 rollout_id 后缀**（同 thread 多 rollout 并存）。RolloutItem 12 类载荷（`codex-rs/history/src/lib.rs:130-144`）：SessionMeta/ResponseItem/InterAgentCommunication/Compacted/TurnContext/TokenUsageRecord/WorldState/SecurityRiskScore/RetainedContext/EventMsg/RealtimeItem 等。
10. **history.jsonl 输入历史独立持久化**（`config/src/types.rs:200-215` History：persistence save-all/none + max_bytes 滚动截断）。
11. **遥测四件套全量**：otel 导出器 None/Statsig/OtlpHttp(headers/tls)/…（`config/src/types.rs:575-585` OtelExporterKind）+ **log_user_prompt 隐私开关** + span_attributes/tracestate 注入（`types.rs:603-621`）；`[analytics]` 节（app-server 默认关、IDE 首方默认开，`cli/src/main.rs:593-609` 注释）；feedback 诊断上传含 rollout 附件（`codex-rs/feedback/src/`）；**版本门控公告** announcement_tip.toml（仓根，按 version_regex/日期窗口/target_app 显示，仓根文件头注释）。
12. **`codex exec` flag 面**（`codex-rs/exec/src/cli.rs:18-80`）：`--json`（JSONL 事件流）/`--output-last-message`（末条消息落文件）/`--output-schema`（结构化输出）/`--ephemeral`/`--skip-git-repo-check`/`--ignore-user-config`/`--ignore-rules`/`--thread-source`。
13. **TUI keymap 重映射**：12 个键位上下文（`tui/src/keymap/bindings.rs:17-31` KeymapContext：global/chat/composer/editor/vim_normal/vim_operator/vim_search/vim_text_object/pager/list/agents/approval），`config/src/tui_keymap.rs` 含 154 个可绑定动作键；`/keymap` 进 UI。
14. **tool_search 是 BM25 延迟工具发现机制**（`core/src/tools/handlers/tool_search_spec.rs:94`）：Deferred 暴露的工具不进初始清单，模型用 `tool_search` 检索后"下一轮可用"；`ToolExposure` Direct/Deferred/DirectModelOnly 控制暴露面（`codex-rs/tools/src/tool_executor.rs:51-62`）。
15. **`/import` Claude Code 迁移入口在 TUI**（`tui/src/slash_command.rs:114`；external-agent-migration crate 首轮已列，此处补 TUI 面入口）。
16. **doctor 自检命令**（`cli/src/doctor.rs`，~3000 行）：安装/配置/认证/终端/状态库/网络可达性逐项只读检查，`--json` 产出支持报告（文件头 1-7 行声明 read-mostly 原则）。
17. **arg0 多入口单二进制分发**（`codex-rs/arg0/src/lib.rs:60,200`）：按 argv[0] 分发子工具，PATH 注入 `~/.codex/tmp/arg0` 别名目录。
18. **确认"没有"项**：本版**无用户自定义 markdown slash 命令加载器**（`docs/slash_commands.md:3` 仅外链官方文档；TUI 侧只发现 builtin + service-tier 两类，`tui/src/bottom_pane/slash_commands.rs:21-24`）——与 Claude Code 的 prompts 机制不同，搬运时勿照搬预期。

## B. 表面枚举总表

**B1. CLI 子命令（`codex-rs/cli/src/main.rs:150-247` Subcommand，30 个；斜体为隐藏/internal）**

| 命令 | 一句话 | | 命令 | 一句话 |
|---|---|---|---|---|
| 默认（无子命令） | 交互 TUI | | apply (a) | 把 agent 最近 diff `git apply` 到工作树 |
| agents | 共享 daemon 上的会话总览 | | resume | 恢复历史会话（picker/--last/--all） |
| *tcp-tunnel | HTTP/3 CONNECT TCP 隧道 | | queue | 给既有会话排队一条消息（--thread/--message） |
| exec (e) | 非交互执行 | | archive / unarchive | 会话归档/取消归档 |
| review | 非交互代码评审（review_model 键） | | delete | 永久删除会话（--force） |
| login / logout | 账号管理（--with-api-key/--with-access-token/--device-auth/login status） | | migrate-rollouts | 旧会话迁移到分页 thread history |
| mcp | 6 子命令 list/get/add/remove/login/logout（`mcp_cmd.rs:65`） | | fork | 分叉历史会话 |
| plugin | 4 子命令 add/list/marketplace/remove（`plugin_cmd.rs:60`） | | cloud | Codex Cloud 任务浏览与本地应用 |
| app-server | JSON-RPC 服务 + 5 子工具：daemon(9 子命令 bootstrap/start/restart/update/enable|disable-remote-control/stop/version/pid-update-loop)/proxy/generate-ts/generate-json-schema（`main.rs:768-838`） | | *responses-api-proxy | responses API 代理 |
| remote-control | start/stop/pair 三子命令（`remote_control_cmd.rs:53`） | | *stdio-to-uds | stdio→Unix socket 中继 |
| app | 启动桌面应用（mac/win） | | exec-server | 远程执行服务（Noise/Direct 传输、AWS SigV4、agent-identity auth，`main.rs:616-764`） |
| completion | shell 补全脚本 | | features | feature flag 检视（`main.rs:1146`） |
| update | 自更新 | | debug | 5 子命令 models/app-server/prompt-input/trace-reduce/clear-memories（`main.rs:263`） |
| doctor | 本地环境自检（--json） | | *execpolicy | check 子命令（`main.rs:498`） |
| sandbox | 在宿主沙箱内跑任意命令（按平台 Seatbelt/Landlock/Windows，`main.rs:466-471`） | | | |

**B2. TUI slash 命令（`tui/src/slash_command.rs:12-86`，62 变体；别名 approve/pwd/pets/subagents + 彩蛋 "g…al"→goal `bottom_pane/slash_commands.rs:115-119`）**。按功能域分组：会话（new/clear/rename/resume/fork/archive/delete/rollout/ps/stop/clean）、上下文（compact/recap/goal/side|btw 临时分叉/subagents 切换）、模型与档位（model/experimental/usage/plan/approve 重试自动审查拒绝）、审批与沙箱（permissions/setup-default-sandbox）、扩展（skills/import/hooks/mcp/apps/plugins/memories）、信息（status/pwd/cd/diff/mention/warnings/usage/debug-config）、外观（theme/title/statusline/tui/keymap/vim/raw/pets）、桌面与出口（app/daemon/logout/quit/exit/feedback/copy/export）、语音（voice）、worktree、ide。可用性谓词四维：available_during_task / available_in_side_conversation / available_when_thread_unavailable / supports_inline_args（`slash_command.rs:165-302`）；特性门控 flags 10 项（`bottom_pane/slash_commands.rs:57-68`）；另有 service-tier 动态命令注入（`slash_commands.rs:21-24,86-107`）。

**B3. 工具注册表（装配点 `core/src/tools/spec_plan.rs:968-1240`；wire 名以 handlers/*_spec.rs 为准）**

| 域 | 工具（wire 名） |
|---|---|
| shell | `shell`/unified exec（login shell 可拒、tty 特性门控、多环境 environment_id）+ `write_stdin`（`spec_plan.rs:1062-1070`） |
| 补丁/文件 | `apply_patch`（`apply_patch_spec.rs:19`）、`view_image` |
| 计划/上下文 | `update_plan`、`new_context`、`get_context_remaining`（均 DirectModelOnly 暴露，`spec_plan.rs:1163-1166`） |
| 交互/权限 | `request_user_input`(_async)、`send_message_to_user_async`、`request_permissions` |
| 时间/等待 | `curr_time`（`current_time.rs:25`）、`sleep`（AlwaysOn/ModelDriven 两模式）、`wait_for_environment` |
| 发现/插件 | `tool_search`（BM25，`tools/src/tool_discovery.rs:6`）、`list_available_plugins_to_install`、`request_plugin_install` |
| MCP | `list_mcp_resources`/`list_mcp_resource_templates`/`read_mcp_resource`（`mcp_resource_spec.rs:24-80`）+ 每服务器动态工具（`mcp__<server>__<tool>`，`handlers/mcp.rs:46-47`） |
| 多代理（v1/v2 共 9） | `spawn_agent`/`send_input`/`send_message`/`followup_task`/`resume_agent`/`wait_agent`/`list_agents`/`close_agent`/`interrupt_agent`（`multi_agents_spec.rs:85-351`） |
| 其他 | `test_sync_tool`（模型目录门控）、`extension_echo`（扩展样例）、动态工具（app-server 注入）、code-mode 的 `code`/`wait`（启用时**替换**同名普通工具，`spec_plan.rs:347-352`）、standalone `web_search`（provider 能力 + 特性门控，`spec_plan.rs:991-999`） |

**B4. config.toml 键面（`config/src/config_toml.rs:157-570` ConfigToml 顶层 ~90 键，按域分组）**

| 域 | 键（节） |
|---|---|
| model | model/review_model/model_provider/model_context_window/model_auto_compact_token_limit(+_scope)/model_post_turn_compact_threshold_percent/model_reasoning_effort/plan_mode_reasoning_effort/model_reasoning_summary/model_verbosity/model_catalog_json/service_tier/personality |
| 审批/沙箱 | approval_policy/approvals_reviewer/auto_review/sandbox_mode/sandbox_workspace_write/default_permissions/[permissions]/allow_login_shell/allow_symlinked_codex_home/trust_level |
| 提示词注入 | instructions/developer_instructions/include_{permissions,apps,collaboration_mode,environment_context}_instructions/model_instructions_file/compact_prompt |
| MCP | [mcp_servers]（B3/A5 全键）/mcp_enterprise_managed_auth/mcp_oauth_{credentials_store,callback_port,callback_url}/mcp_optional_startup_grace_ms |
| 账号/认证 | forced_chatgpt_workspace_id/forced_login_method/cli_auth_credentials_store(file/keyring/auto)/chatgpt_base_url/openai_base_url |
| 会话/存储 | history/sqlite_home/log_dir/file_opener/thread_unload_delay_secs/projects/[profiles]/profile/ghost_snapshot |
| TUI | [tui]（types.rs:753-879：animations/effects 六分项/rendering 三分项（首轮已列）/notifications 三档/status_line/terminal_title/show_tooltips/auto_recap/vim_mode_default/question_esc_back/raw_output_mode/fullscreen_transcript/theme/pet/session_picker_view/resume_cwd/[tui.keybindings] 154 键） |
| 扩展生态 | [tools]/tool_suggest/[agents]/[goals]/[memories]/[skills]/[hooks]/[plugins]/[marketplaces]/apps/desktop/web_search |
| 运维遥测 | [analytics]/[feedback]/[otel]/check_for_update_on_startup/disable_paste_burst/notice |
| 实验开关 | [features]（148 项）/experimental_*（realtime ws/webrtc/thread_store/compact_prompt_file/use_unified_exec_tool/policy_template）/oss_provider/policy |

**B5. 其余注册表**：hooks 11 事件（A1）；Feature 148（A6）；keymap 12 上下文 × 154 动作（A13）；协议 167/9/83（本节开头）；collaboration modes 2 模板（A7）；rollout 载荷 12 类（A9）。

## C. 差距对照与搬运建议（只列二轮变化项）

| codex 能力 | 我方现状 | 判定 | 建议 |
|---|---|---|---|
| hooks 11 事件 + decision/system_message 回写 | 无生命周期 hook | → | **P1 新增**：hermes-agent 侧 PreToolUse/Stop/SessionStart 三事件 + Koa 外部命令执行即可起步；审批 hook 与"批准即学习"（首轮 P0）同管道 |
| config 8 层叠加 + per-key origins + trust 门控 | 对话式配置为单层 | → | **P2**：对话式配置页签引入"层"概念（全局/项目/会话），UI 标注每键来源；`.codex/config.toml` 项目层 + 信任门控语义可直接搬 |
| agent roles（角色=配置层+昵称池+并发/深度上限） | 子代理浮窗无角色概念 | → | **P1 新增**：角色即"配置模板 + 昵称池"，落 overlay 子代理 spawn UI；AgentsToml 的 max_concurrent/max_depth 是现成护栏参数 |
| MCP per-server 白黑名单/审批档/超时/OAuth 三模式 | IdeMcpPane 仅 status | → | 首轮已列 OAuth；**增量**：enabled_tools/disabled_tools 与 tool_timeout_sec 语义简单，配置面板可直接补 |
| web_search 四档（Disabled/Cached/Indexed/Live + 交集收敛） | 无 | ≈ | 语义可借（搜索档位枚举 + restrict_to 合并），依赖后端搜索链路 |
| keymap 12 上下文重映射 | 命令面板固定快捷键 | → | P2：先做"快捷键可配置"，上下文分区可后置 |
| tool_search BM25 延迟暴露 + ToolExposure | hermes 工具全量注入 | → | 工具多到挤上下文时再搬；暴露面三态（Direct/Deferred/DirectModelOnly）是现成设计 |
| doctor 自检 / announcement 版本公告 / arg0 多入口 | 无 | ×/低 | doctor 的"只读自检+--json 报告"原则可参考；其余与桌面工作台关联弱 |
| /import Claude Code 迁移 TUI 入口 | 无 | → | 若有用户迁移场景，external-agent-migration 的进度/完成事件模型可参考 |
| 无自定义 markdown slash 命令（A18 确认） | 我方命令面板自研 | — | 上游无此机制，无对齐义务 |

首轮结论不变的部分（审批/沙箱/渲染开关/compact/ThreadGoal 等）维持原排序；二轮唯一对首轮的补充更正：首轮 2.6 只提"fork/resume/压缩"，rollout 文件名对 revert 线程的"同 thread 多 rollout 并存"寻址语义（A9）为首轮遗漏。

二轮未覆盖声明：`cloud-tasks` 子命令内部、`code-mode` 域内部、`tui` keymap 154 动作的逐条清单未展开（只确认数量与文件锚点）；Feature 148 项逐条语义未逐个核读（仅枚举计数）。

## 增量补扫（2026-09-25，HEAD ce7df36→origin/main 282cd7b，61 提交）

44 条实质改动（其余为测试稳定化/CI/重构）。新增可吸收点（对 Ycode 价值降序）：

1. **HTTP Retry-After 遵从**（9d8de19）——重试优先服从服务端建议（秒数/HTTP 日期→单调时钟 deadline），过期零延迟。任何 LLM 客户端层通用，价值最高。
2. **TUI 选中即复制三档**（ab021e9）——auto/always/never + 终端检测矩阵（tmux/Zellij/macOS，排除 Ghostty/Kitty）。
3. **per-model 工具描述/schema 覆盖族**（29f056c 等 4 提交）——模型目录按模型覆盖工具 description/parameters，轮中换模型即时生效，无效 schema 回退捆绑版并告警；对多模型融合工具是核心杠杆。
4. **流式元数据选择性裁剪**（e7165c2/53446f9）——超预算"先裁最大的、装得下就停"+分级牺牲顺序+15MiB wire 软预算。
5. 扩展 API 双提交（模型请求/响应拦截 8de2d33 + 工具分发/耗时观察 a79a18c）——Ycode 插件系统设计参考。
6. 终端 stdin 写入默认审批（c098f97）、OTLP 最终回复记录（e6da6fd）、早期执行输出保全（d47b9a8）、能力发现 V2（ab74392）等中低档项。

维持原判不吸收：Guardian 8 条（依赖 OpenAI 审查链路）、WebSocket/exec-server/网络策略深化（平台特异性）、Bedrock 目录限制等。以上 1-4 项列为 Ycode 后续吸收轮候选（第一批之外）。
