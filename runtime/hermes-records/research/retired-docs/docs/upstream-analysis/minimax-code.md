# minimax-code 测绘：特性普查 vs SwarmStudio /ide 对照与搬运清单

2026-09-21，基于 upstream/minimax-code @ 89c930a（v0.5.0，当日 HEAD 即「fix: rebuild changed TUI scrollback after queued turns (#274)」）。数据来源：全仓探查 + 关键文件直读。纪律：本仓仅做参考测绘，不拷贝任何代码；upstream/ 只读。

## 一、仓库概览与技术栈

pnpm monorepo（pnpm 9.12.0 + Node 22.19/24.2+，esbuild 打包、vitest 测试），15 个 package。三入口（README.md:122-127）：交互 TUI（`mcode [prompt]`）、headless（`mcode exec`）、ACP（`mcode acp`，供 Zed 等编辑器接入）。另有闭源桌面应用（README.md:262 明确源码不含桌面端）。

| 目录 | 职责 |
|---|---|
| `packages/tui/` | TUI 主体（407 个 ts 文件）：engine（Pi fork）、controller/state（reducer 架构）、transcript、features、commands、acp、headless、provider、plugin、review |
| `packages/local-runtime-v2/` | 本地运行时 v2：service/{turn-system, session-system, model-system, mcp, plan, cron, sandbox, canvas, pin, plugin-system, llm-context-inspector, host-connector-system, content-safety, channel-system, browser-use, background-bash, workspace, prompt-config, miniapp, agent} |
| `packages/agent-modules/` | 可插拔 agent 模块：context-manager、permission、goal、background-task、runaway-guard、skills、mcp、cron、plugin-hooks、session-report、system-reminder、conversation-contract |
| `packages/agent-tools/` | 工具实现：desktop/（builtin 工具 40+ 文件）+ cloud/matrix-tools（多模态云工具） |
| `packages/agent-core/` `agent-runtime/` `agent-extension/` | agent 核心（基于 `@earendil-works/pi-agent-core`）、运行时装配、扩展协议 |
| `packages/config/` | config.yaml 全量解析（byok/provider/permission/sandbox/skills/telemetry 等 34 文件） |
| `packages/mcode-tools-host/` `oauth-core/` `oauth-lease-protocol/` | mcode-tools 子进程宿主 + OAuth 凭据/短时租约协议 |
| `packages/browser-core/` | 浏览器自动化（snapshot/语义树/动作） |
| `packages/protocol/` `shared/` | 协议与共享类型（含 models.dev 模型目录快照） |
| `third_party/pi-mono/` `third_party/sandbox-runtime/` | Pi TUI 上游快照；沙箱运行时 fork |

**LICENSE-STATUS 摘要（拷代码前必查，本文只参考不拷贝）**（LICENSE-STATUS.md:5-15、THIRD_PARTY_NOTICES.md）：

- 一方代码默认 MIT（根 LICENSE/NOTICE 为 MiniMax Code 署名）；源码门禁锁定 MIT 哈希防替换。
- 受限/例外目录：`third_party/sandbox-runtime` 为 **Apache-2.0**（分发须附其 LICENSE 与上游声明）；`third_party/pi-mono` 与 `packages/tui/src/tui/engine/`（Pi 派生终端引擎，MIT 但保留 Mario Zechner 2025 版权，且 `engine/LOCAL_CHANGES.md` 记录 30+ 条本地差异账本）；models.dev 模型目录快照（MIT，第三方署名）；`mcode-tools 0.0.4` 为独立分发物（MIT，哈希锁定于 scripts/lib/mcode-tools-artifact.mjs）；`release/dependency-licenses.json` 记录依赖许可。
- 发布范围以 docs/publication-authorization.md + release/public-source.json 为准；npm 包/安装器/付费服务不在源码内。

## 二、功能特性清单（按域分组，锚点均为 upstream/minimax-code 内相对路径）

### 2.1 TUI 渲染与 scrollback 重建（当日 HEAD 主题）

- **原生 scrollback 不可寻址的处理**：差分渲染只能改可视区；当变更行落入历史区时，先逐行比较 `stripTerminalSequences` 后的文本，纯样式变化只重绘视口，文本真变则 `fullRender` 完整重建（`packages/tui/src/tui/engine/tui-main-screen.ts:503-520`，HEAD 89c930a）。账本 L034「Regular viewport reconstruction」明确取舍：结构性重建会清掉 TUI 启动前的 shell 历史，换「每行当前会话内容在原生历史中恰好出现一次」（engine/LOCAL_CHANGES.md L034）。
- **连续 resize 回放**：立即画可视尾部，150ms 稳定后回放历史（LOCAL_CHANGES.md L027）；OSC 133 标记在 normal mode 下剥离防污染行比较（L033）；无框多行粘贴合并为单次 paste（L036）；IME 光标与帧同帧提交（L037）。
- **transcript 投影窗口**：长会话只投影尾部——`maxInitialTurns=30`、`maxCellsPerTurn=120`、`maxProjectedTurns=60`、`maxProjectedCells=1000`，锚点 cell 滚动窗口（`packages/tui/src/tui/transcript/projection-window.ts:32-100`）。
- **斜杠命令面**：实测提取 51 个命令名（`packages/tui/src/tui/commands/catalog.ts` + `application/command-descriptors.ts`），含 rewind/fork/edit（会话变异）、queue、steer、goal、permission、provider、plugins、checkin、btw、statusline 等；`/btw` 为 Ctrl+/ 唤起的侧会话（commands/side-session.ts）。
- **状态行可配置**：`/statusline` 面板选序 + config.yaml `tui.statusLine` 数组；16 个条目项（含 cache-read-ratio、context-remaining、context-meter、token-quota、custom-command 外部命令扩展，stdin 传 JSON 上下文、stdout 首行上屏）（`packages/tui/docs/status-line-config.md:50-120`）。

### 2.2 compact / 上下文管理

- **ContextManager = beforeLlmCall 钩子**（`packages/agent-modules/context-manager/src/manager.ts:40-147`）：评估触发→选切割计划→生成摘要→`replaceMessages`（保留尾部 + 前置摘要消息），全程带 observer 事件与 8 类 SkipReason；会话级锁防并发。
- **触发阈值**（context-manager/src/settings.ts:18-37）：MiniMax-M3 512K/1M 档用 90% 线；其余模型 `reserve = max(16384, 单轮 maxTokens + 2048)`，`triggerAt = contextWindow - reserve`。默认 `keepRecentTokens=20000`、`minMessagesToCompact=4`（settings.ts:3-11）。
- **token 计量双路**：优先远端 count_tokens（转发 headers 与 tools 声明——MCP 重工具会占数万 token，漏算会推迟触发，manager.ts:186-206），失败退化为本地估算（token-estimator.ts，379 行）。
- **v2 分层压缩算法族**（`packages/local-runtime-v2/src/service/turn-system/compaction/`）：algorithm/ 下 compact-context（切割）、history-reduction、tool-result-archiver（工具结果归档）、tool-trim-admission、assistant-iteration-cadence / background-cadence / todo-cadence（按节奏分层）、checkpoint-format；automatic-context-compactor.ts 组装。
- **/context 构成可视化**：六段构成 SYSTEM_PROMPT/MEMORY/TOOLS/SKILLS/MESSAGES/OTHER + 10×10 字符网格图例 + 压缩预留行（`packages/tui/src/tui/transcript/context-visualization.ts:11-34`）；容量条色阶 ≥90% error / ≥70% warning（transcript/capacity-meter.ts:32-40）。
- **/usage 可视化**：会话 input/output/total + Cache 段（Read/Fresh/Write 与 read 比率）+ 账户行（transcript/usage-visualization.ts:56-80）；状态行 cache 口径 `cacheRead/(input+cacheRead+cacheWrite)`，与我方 M2 落地口径一致（status-line-config.md:70）。

### 2.3 审批/权限体系

- **6 种 PermissionMode**：default/acceptEdits/bypassPermissions/auto/dontAsk/off（permission/src/types.ts:13-19）；内部收敛为 4 种 AskPolicy：on-request/on-request-llm/never/deny（ask-policy.ts:26-54）。acceptEdits 是「default + 启动时预置编辑允许规则」的别名（ask-policy.ts:42-46）。
- **三步决策流**：硬拒绝 → 允许快路径 → 兜底 ask；工具级 checker 注册表分派（permission/src/engine.ts:1-16, 47-62）。规则三作用域 global/agent/session，matcher 分 tool/command 前缀/path glob（types.ts:33-44）。
- **"always allow" 宽度候选**：决策附 candidateScopes，narrow（Codex 式 argv 精确前缀）/byFirstWord/byArgvPrefix2/byDomain/wholeTool 五档，`candidates[0]` 恒为窄默认保后向兼容（types.ts:170-195）。这是审批弹窗里「放行多宽」的完整语义。
- **双注册表安全层**：HARD_BLOCKED_REGISTRY（灾难性/不可逆/真实外泄终局拒绝，bypass 模式也不放行）+ SOFT_RISK_REGISTRY（chmod 777、sudo、`python -c` 等软风险强制进 LLM 门）（permission/src/classifier/dangerous-patterns.ts:1-30, 753）。
- **auto 模式云分类器**：cloud-classify-client.ts（`shouldUseCloudClassify()` :61），失败回落本地规则+确认；判定可携带建议规则（ask-policy.ts:68-80 ProposedRule，source 分 engine/cloud-gateway）。
- **危险命令改写而非拒绝**：`rm` 改写、Windows 走回收站、可恢复删除改写（types.ts:70-73 DecisionReason；windows-trash-execution.ts；permission-request-store.ts）。
- 落盘 schema `permission.json`：allow/deny/ask 三列表 + defaultMode（types.ts:256-261）。

### 2.4 模型路由（MiniMax 账号 / BYOK）

- `mcode provider add` CLI：三种 api-format（openai-completions/responses/anthropic-messages）、`--context-limit/--output-limit`、`--use` 先连通测试首个模型再落盘（README.md:91-99）。
- **配置树分层**：`provider.minimax` 为托管内置（受保护构建强制回写 baseURL/authMode=managed-login，读时修复不写盘）；用户 BYOK 只住 `custom_provider` 树；`minimax_api` 为保留 id，手写即被丢弃告警（config/src/byok-config.ts:258-343）。
- **legacy 迁移**：旧 BYOK 手写 provider 迁入 custom_provider，盘上备份 + migrations 标记幂等（byok-config.ts:178-256）。
- TUI provider 引导流 765 行（tui/src/tui/features/provider/onboarding.ts），模型选择器带 context-window/thinking/effort 子面板（features/model/）；模型目录来自 models.dev 快照（packages/shared/src/models-dev.ts）；启动时 `mcode -m <provider>/<model>` 按会话覆盖且存进会话（docs/tui-capabilities.md:66-79）。

### 2.5 多模态工具链（搜索/媒体与代码同一工作流）

- **18 个 matrix 云工具**（`packages/agent-tools/src/cloud/matrix-tools/tools/`）：图像理解/生成/搜索下载/反向搜索、视频生成（submit/query/batch text-to-video/image-to-video/gen_videos）、语音（get_voice_list/synthesize_speech/batch）、音频（text-to-audio/text-to-music/batch）、理解（audios/videos/transcribe_audio）+ web_search；tool-defs.ts 内集中声明（images_understand :72、synthesize_speech :490 等）并按能力分路由端点（web_search → `/matrix/api/v1/mcp/web_search`，tool-defs.ts:572）。
- **mcode-tools-host**：宿主中立子进程生命周期 + OAuth 租约 broker——宿主独占凭据存储，子进程只领短时 Access Token 租约（packages/mcode-tools-host/README.md:1-12）；资源 manifest v4 校验 SHA-256、拒符号链接。
- desktop 侧另有 matrix-mcp-server/matrix-mcp-stdio（以 MCP 形态暴露同一工具面，agent-tools/src/desktop/matrix-mcp-server.ts）。

### 2.6 任务编排与自治

- **thread goal**：create_goal/update_goal/get_goal 三工具（goal/src/tool-defs.ts:23,49,154）；continuation 提示词只注入一次完整契约、后续隐藏轮仅短提示以保持缓存前缀稳定（goal/src/continuation.ts:1-8）；目标态机含 complete/blocked/budget_limited，预算触顶投递隐藏预算摘要轮（durable clientRequestId 支持启动恢复重放，goal/src/budget-limit.ts:1-13）；续跑模板内嵌 ask_user 对齐路由（歧义阻塞必问卷、单选锁方案、超时安全默认 recommended，continuation.ts:24-40）。
- **task 工具投递语义**：append 返回 admission 而非结果——activated（新子轮）/steered（并入在飞轮，父拿一个合并回答）/duplicate（幂等去重）（agent-tools/src/desktop/builtin-defs.ts:607-640 LOCAL_TASK_APPEND_TOOL_DESCRIPTION）；完成以 `<background-task-finished>` 唤醒父会话。
- **agent-team 面板**：成员状态 failed/waiting/running/queued/done/stopped × phase thinking/tool/responding + 汇总计数（tui/src/tui/agent-team/model.ts:18-60）。
- **消息队列**：Alt+Enter 排队后续轮，queue 面板 + 暂停发送面板（tui/src/tui/features/queue/）；运行中 dispatcher claim/release/recoverClaims 崩溃恢复，自治 goal 让位排队用户消息（GOAL-05，local-runtime-v2/src/service/turn-system/queue.dispatcher.ts:35,133-189）；运行中转向用 steering 幂等键（turn-system/steering-identity.ts）。
- **runaway-guard 死循环检测**：六类信号 exact_action_repeat/exact_result_repeat/same_error_family/abab_action_cycle/polling_repeat/unchanged_progress_repeat（agent-modules/runaway-guard/src/contracts.ts:3-10）；工具步进 HMAC 指纹限 16KB 有界序列化（fingerprint.ts:6-14）。
- cron 模块 + mavis cron 适配（agent-modules/cron/；desktop/local-mavis-cron-adapter.ts）；todowrite 工具（builtin-defs.ts:240）。

### 2.7 会话管理

- **rewind/fork/edit**：历史浏览器选点后二选一 rewind-conversation / rewind-conversation-and-files（连文件一起回滚），带预览面板与作用域选择器（tui/src/tui/features/session-mutation/history-explorer.ts:450-458、rewind-preview-panel.ts、scope-picker.ts）；fork 复制分叉。
- `mcode --continue/--session` 恢复；`/sessions` 选择器（README.md:128-138）；session-report 模块做会话报表（agent-modules/session-report/）。

### 2.8 其他值得记录

- 沙箱：deny-first 网络 + SecurityServer 控制（third_party/sandbox-runtime/README.md，Apache-2.0）。ACP 客户端把 skills 暴露为命令（docs/tui-capabilities.md:24-37，tui/src/acp/）。headless 含 exit-policy/supervisor/settlement（tui/src/headless/）。skills 注册表 + 目录 watcher（agent-modules/skills/src/registry.ts）。插件系统含云端传输与发布校验（local-runtime-v2/src/service/plugin-system/）。memory 工具 target=user|main|topic|summary × 7 操作（builtin-defs.ts:310）。llm-context-inspector 逐调用捕获/存储 turn 摘要（service/llm-context-inspector/contracts.ts）。遥测三通道默认全关、诊断经最小化投影后才加密上传（docs/tui-capabilities.md:51-63）。

## 三、与 SwarmStudio IDE 工作台差距对照

| 能力 | minimax-code 实现 | 我方现状（/ide） | 裁决 |
|---|---|---|---|
| 会话聊天/流式 | TUI transcript + 投影窗口 | IdeChatPane 流式+审批门 | ≈ |
| 审批门 | 6 模式 + 规则库 + 宽度候选 + 双注册表 + 云分类器 | 单次审批门（会话级开关） | → 落点：审批弹窗加 candidateScopes 五档宽度 + 会话/全局 allow 规则存储（后端 SQLite 表 + ChatInput 旁挂） |
| 上下文水位 | 状态行 context-remaining/meter + /context 六段网格 | 状态栏水位条（60/80）已落 M2 | ≈（构成 breakdown 是 G4，→ 见搬运 P0） |
| 缓存命中 | cache-read-ratio 同口径 + /usage Read/Fresh/Write | 会话级缓存命中已落 M2 | ≈ |
| compact | beforeLlmCall 钩子 + 阈值策略 + 分层算法族 | hermes-agent 自有机制（未见阈值策略文档） | → 落点：借触发阈值公式与「工具结果归档」分层，校准 hermes 侧 |
| 会话 rewind/fork | rewind 对话/连文件 + 预览面板 | 无（dsh-TUI 时间回溯在 backlog） | → 落点：配合 git checkpoint（zcode G 项）做双档 rewind |
| 消息队列/转向 | Alt+Enter 队列 + steering 幂等 + GOAL-05 让位 | 无（运行中只能等或停） | → 落点：ChatInput 运行态切排队模式，hermes 侧 steering 通道 |
| 子代理 | agent-team 面板 + task admission 语义 | IdeSubagentsFloat | ≈（汇总计数条可补强） |
| 任务/计划 | thread goal（预算/续跑/对齐路由）+ todowrite | IdeTaskSidebar + IdePlanFloat | → 落点：goal 的 budget_limited 与续跑提示词范式 |
| 死循环防护 | runaway-guard 六类信号 | 无 | → 落点：hermes-agent 步进 hook |
| 模型路由 | provider 树 + BYOK CLI + 引导流 + models.dev 目录 | hermes 模型配置（表单） | → 落点：连通测试（--use 语义）+ 目录快照参照 |
| 多模态工具 | 18 个 matrix 云工具 + 租约 broker | 无媒体工具链 | ×（依赖 MiniMax 云服务；租约 broker 架构可留档备查） |
| 终端 | 原生 scrollback 重建 + resize 回放 | 终端 dock（xterm.js，web 自管 scrollback） | ×（问题域不同：web 终端无原生 scrollback 不可寻址问题；投影窗口思路可借鉴长会话 DOM 性能） |
| 状态栏自定义 | /statusline 16 项 + custom-command | 遥测簇固定 | → 落点：custom-command 扩展点（外部探针脚本上屏） |
| MCP | matrix-mcp-server + mcp 模块 | IdeMcpPane + 对话式配置 | ≈ |
| 记忆 | memory 工具四 target | IdeMemoryPane | ≈ |
| 沙箱 | sandbox-runtime fork（Apache-2.0） | 无沙箱 | ×（许可受限且为原生栈，仅概念参考） |

## 四、建议搬运项排序（价值/成本各一句，P0-P2）

1. **P0 /context 上下文构成可视化**：价值——直接消化 zcode 台账 G4（六段构成 + 网格 + 压缩预留线，minimax 已给出完整字段与渲染分层）；成本——前端照语义重写即可，但数据需 hermes-agent 插件产 span（后端是主要工时）。
2. **P0 审批宽度候选 + allow 规则库**：价值——审批门从「每次都问」进化到「问一次记住多宽」，candidateScopes 五档 + permission.json 三列表语义现成；成本——前端审批卡加选择器、后端一张规则表与会话/全局作用域，量小。
3. **P0 runaway-guard 六类信号**：价值——agent 打转是长任务最高频失败模式，minimax 的指纹+节奏信号设计可直接抄语义；成本——hermes-agent 步进 hook + 信号状态机，中等。
4. **P1 会话 rewind（对话级/连文件级 + 预览）**：价值——补齐 dsh-TUI「时间回溯」backlog 且带 git 文件回滚语义；成本——依赖 git checkpoint 通道（zcode G 项同源），前后端各一半。
5. **P1 运行中排队 + steering**：价值——「任务跑着也能继续说话」是工作台对 CLI 的核心体验优势，queue 让位语义（用户消息 > 自治目标）清晰；成本——ChatInput 排队 UI 小，hermes steering 通道中等。
6. **P1 goal 预算与续跑范式**：价值——budget_limited 隐藏轮 + 幂等重放 + ask_user 对齐路由，把「计划」变成可持续推进的目标态机；成本——提示词资产为主，运行时仅需预算计数与状态存储。
7. **P2 compact 阈值策略校准**：价值——M3 512K/1M 的 90% 线与 reserve 公式给 hermes compact 提供了可对照的参数化口径；成本——纯配置与公式对齐，小。
8. **P2 状态栏 custom-command 扩展**：价值——外部探针脚本（成本/自建监控）stdin JSON/stdout 上屏，扩展性收益明显；成本——一个子进程执行器 + 渲染位，小。
9. **P2 agent-team 汇总条 / transcript 投影窗口**：价值——子代理计数条与长会话只渲染尾部窗口（30 轮/1000 cell 上限）对性能有参照；成本——前端小改。

## 五、结论

minimax-code 与 zcode/kimi 的互补点在于**运行时治理深度**：审批宽度语义、双注册表安全层、死循环检测、消息队列让位、goal 预算态机都是「agent 长时间自治」的工程答案，而 SwarmStudio 当前停在「单轮审批门 + 人工盯守」。其 TUI scrollback 重建（HEAD 主题）解决的是原生终端历史不可寻址问题，对 web xterm.js 终端 dock 不直接适用，但 transcript 投影窗口对长会话渲染有参照价值。多模态矩阵工具链与 MiniMax 云强绑定，不做搬运，租约 broker（宿主独占凭据、子进程领短时 token）的架构留档备查。所有以上仅语义参考：TUI 引擎（Pi MIT 但带 fork 账本）与 sandbox-runtime（Apache-2.0）许可受限，任何实际取用须先过 LICENSE-STATUS.md。

## 六、二轮穷举补漏（表面枚举，2026-09-21 同日补充）

方法：从注册表反向穷举（命令目录、工具装配点、Config 接口、键位注册表、状态行目录、CLI 程序树），只补首轮未展开的表面；锚点均为 upstream/minimax-code 相对路径。

### A. 新发现功能清单（首轮未写或仅一笔带过）

1. **Plan Mode 全套**（首轮完全未提）：`/plan [on|off|status|view]` + Shift+Tab 切换（commands/catalog.ts:169-180；shell/keybindings.ts:406-413）；计划评审面板/查看面板/入口面板三个 UI（tui/src/tui/features/interaction/plan-review-panel.ts、plan-viewer-panel.ts、plan-entry-panel.ts）；agent 主动进入计划的 `plan-mode` 工具挂 `EnterPlanMode`（agent-extension/src/plan-mode.ts:127），由 beta 开关 `desktopPlanModeAgentEntry` 单独门控（config/src/config.ts:423-432）。
2. **ask_user 结构化问卷工具**（首轮只在 goal 续跑里提到，工具本体未展开）：1-4 步 × 每步 2-4 选项、单选/多选、选项可带图（HTTPS URL/本地 mavis 路径）、`recommended` 标记供 goal 超时自动采纳、`requiresExplicitResponse` 禁止超时自动回复（agent-tools/src/desktop/builtin-defs.ts:345-465）。完整提示词契约直接可用于我方对话式配置卡。
3. **mavis 巨型管理工具**：4 组约 28 个子命令——agent list/get/create/update/delete、cron list/get/resolve-model/create/self/once/update/delete/trigger/sessions、session list/get/send/update/delete/messages（支持 source=local|cloud、peers 模式、按 parent 过滤、归档过滤）、mcp list/get/create/update/delete（builtin-defs.ts:995-1027；local-mavis-commands.ts）。会话可被 agent 以工具面直接管理，远超首轮「cron 适配」的印象。
4. **子代理角色目录**：canonical 角色 explore（只读测绘）/worker（有界产出）/verifier（独立验证）+ mavis 杂项角色，`agent:<stable-name>` 引用式解决重名，保留名列表 RESERVED_SUBAGENT_NAMES（shared/src/subagent-roles.ts:8-42）。
5. **Browser 工具面**（首轮只提 browser-core 包，未列注册结构）：单一 `browser` 聚合工具带 25 个 action（inspect/query(text|semantic|dom|editable|console|network|snapshot)/navigate/open_tab/return_to_previous_tab/back/forward/reload/click/click_and_wait_for_navigation/double_click/drag/hover/fill/type/paste/press_key/check/uncheck/select_option/scroll/wait/screenshot/upload_files，builtin-browser-defs.ts:714-769）；首用强制 skill 装载否则 SKILL_REQUIRED 拒绝；动作后自动视觉回执（每轮 ≤4 图）；console/network 诊断查询默认可用且脱敏（不回 headers/cookies/URL 凭据）；另有 13 个遗留拆分工具（browser_inspect…browser_inspect_editable_targets，builtin-browser-defs.ts:804-1007）。
6. **code_review 工具 + /review 三入口**：`code_review` 工具仅限 staged/unstaged/untracked 对 HEAD，mode inline|subagent 由 review.mode 配置（builtin-defs.ts:287-307；config/src/review-config.ts）；`mcode exec review` headless 评审（tui/src/cli/program.ts:99）；状态行 review-link 项展示 PR/MR 链接。
7. **website_deploy 工具**：静态站点发布到公开 URL，本地零 OSS 凭据、走后端预签名上传，发布前强制 ask_user 二选一（覆盖现站点 vs 新 URL）（local-website-deploy.ts 文件头注释 1-25）。
8. **request_feature_enable 工具**：产品灰度功能经系统提醒触发、由用户在卡片上授权开启（builtin-defs.ts:467-482）——与 beta 可见性阶梯（B-5）构成完整灰度发布闭环。
9. **键位双层注册表 + 用户改键**：应用层 24 条（ctrl+c 清空/双击退出、esc 关面板或打断、ctrl+d 退出、ctrl+z 挂起、ctrl+/ 侧会话切换、ctrl+v/super+v/alt+v 剪贴板贴图、ctrl+g 外部编辑器、ctrl+r 提示词历史搜索、enter 运行中引导、alt+enter 排队、alt+up/shift+left 撤回队首消息、ctrl+t Todo 列表、ctrl+o 折叠 Thinking/工具输出/diff、shift+tab 计划、alt+m 权限循环、ctrl+- 撤销清空、pageUp/Down 交互滚动，tui/src/tui/shell/keybindings.ts:267-444）+ 引擎层 34 条编辑/选择/全屏滚动绑定（tui/src/tui/engine/keybindings.ts:71-210）；用户经 `{dataDir}/tui/keybindings.json` 覆盖，`/hotkeys` 面板查看改键，写盘原子替换、冲突检测（host/tui-keybindings.ts:24-76）。
10. **MCP tool_search 渐进披露**：mcpToolSearch 配置（enabled/modelWhitelist/thresholdPct/minDeferCount/topKDefault/topKMax/systemHint/maxSchemaTextLen，config.ts:902-911）——重 MCP 服务器延迟注册、模型按需检索工具，直接对治「MCP 工具声明吃掉数万 token」。
11. **会话管理器面板**（首轮只写 rewind/fork/edit）：`/sessions` 列表面板带搜索（200ms 防抖、可见上限 10 条）、Recent/Archived 双视图 × This workspace/All 双作用域（tui/src/tui/features/session/manager.ts:30-31,246-253）；`/rename`、`/archive`、`/retry`（catalog.ts:246-268）；`/export [path.md]` 导出 Markdown、`/transcript` 全文浏览+搜索面板（transcript/panel.ts:84-100，Ctrl+Shift+F 进入）、`/copy` 复制末答。
12. **CLI 子命令树**：`mcode init`（生成 AGENTS.md）/`exec`（含 exec review）/`acp`/`login`/`logout`/`update`/`telemetry status|preview`/`provider list|add|remove|test|use|set-minimax-key`/`plugin list|add|remove|enable|disable|marketplace list|refresh`（tui/src/cli/program.ts:84-330）。provider use 在 token_plan 与自有 API key 两凭据源间切换（program.ts:255-261）。
13. **插件市场双源**：official/local 两个 marketplace，TUI `/plugins` 四页签 all/installed/official/local，Enter 安装/Space 启停/Delete 卸载/Ctrl+R 刷新（tui/src/tui/features/plugin/manager.ts:15-16,176）；插件可经 TuiCommandContribution 注册命令（tui/src/tui/contributions/）。
14. **侧会话（/btw）只读命令白名单**：side mode 下仅 help/changelog/context/status/usage/export/transcript/copy/parent 九条可用，导航/变异/认证/进程控制全部拒绝且输入层强制（catalog.ts:39-49,741-758）。
15. **草稿恢复与附件**：composer 草稿崩溃恢复（2 MiB 上限，composer/draft-recovery.ts:47,649）；剪贴板图片/视频文件直接粘贴为附件；会话标题自动生成（sessionTitle 配置）与默认轻量模型（defaultLightModel 供标题生成等辅助任务，config.ts:951-952）。
16. **敏感路径防御纵深清单**：grep/glob 默认排除 VCS 元数据（.git/.svn/.hg/.bzr/.jj/.sl）与密钥文件（.env/.env.\*/\*.key/\*.pem/\*.p12/\*.pfx/.ssh/.aws/.kube/.npmrc 等），desktop 与 cloud 共用单一事实源（agent-tools/src/shared/rg-sensitive.ts:13-60）；workspace 守卫与权限门是主边界、此清单为纵深。
17. **权限运行时旋钮**：permission.policyOwner engine|core（core 默认、engine 回滚）、storageWriteVersion v1|v2、classifierTimeoutMs 默认 60s 硬下限 5s（为思考型 LLM 校准）、userConfirmationEnabled（headless 可关使 ASK 失败即拒，config/src/permission-config.ts:17-51）。
18. **matrix 工具注册结构**（首轮只做「不搬」结论，此处补表面）：18 个工具各有 1:1 REST 路由表 MATRIX_TOOL_PATHS（transcribe_audio 名实不一路由到 `/listen_audio`，tool-defs.ts:571-590）与超时表 MATRIX_TOOL_TIMEOUTS（生成类 600s / 非生成类 120s，tool-defs.ts:601-621）；常量 MAX_VIDEO_GENERATION_PROMPT_LENGTH=7000、H3 参考音频 ≤3 / 参考媒体 ≤12、MINIMAX-H3/Hailuo-2.3 模型档（tool-defs.ts:166-170）。
19. **acp 面与 headless 面**：ACP 暴露原生命令 new/status/doctor/context/skills/mcp + skills 映射为命令（tui/src/acp/commands.ts:45-157）；headless 14 文件含 exit-policy/supervisor/settlement/progress（tui/src/headless/）。
20. **ASR 语音输入**：cloud 语音转文字配置（config/src/asr.ts，beta.asr visibility=online）。

### B. 表面枚举总表

**B-1 斜杠命令 51 条**（catalog.ts:122-507 COMMAND_SOURCES；51 与首轮实测数一致，此处全量；audience=internal 的 9 条不出现在发现面）。Session：new(clear)/sessions(resume)/goal/plan/parent/btw(side)/history/fork/rewind/edit/retry/rename/archive\*/compact。Runtime：status/tasks/permission(Alt+M)/login/logout/doctor\*/config\*/context/steer/model/provider/feedback/checkin。Capability：review/plugins/skills/mcp。Input：add-dir/queue。Transcript：usage/export/transcript/copy。Decision（internal）：allow/always/deny/permissions/decision。Application：help/update/changelog/settings/statusline/hotkeys/reload/stop\*/quit(exit)。命令元数据模型：category × discoverability(primary/contextual/search-only) × readiness(immediate/controller/full) × runAvailability(idle) × visibleWhen 条件 × argumentHint + 参数补全（catalog.ts:51-84）。

**B-2 工具注册表**：装配点 buildLocalToolRegistry（desktop/index.ts:118-194）——7 个常驻（read/write/edit/bash/grep/glob/todowrite）+ 12 个按 adapter 条件注入（skill/memory/code_review/mavis/ask_user/request_feature_enable/web_fetch/web_search/task/task_append/task_query+task_output+task_stop/website_deploy）；browser 聚合工具 25 action + 13 遗留拆分；goal 三工具（goal/src/tool-defs.ts，首轮已覆盖）；matrix 云工具 18 个（tool-defs.ts:64-567）。本地工具面合计约 37 个名称。executionMode parallel|sequential 两档声明在每个 def。

**B-3 配置键**（config.ts:928-1030 Config 接口，约 45 键分组）：目录族 dataDir/agentsDir/sessionsDir/memoryDir/skillsDir/builtinSkillsDir/logsDir/pluginsDir/plansDir/harnessesDir/subAgentsDir；模型族 provider/minimax_api/custom_provider/minimaxModelSource/minimaxModelContextLimits/defaultModel(+Variant/Thinking/ContextWindow)/defaultLightModel/nexus；权限族 permissionMode/permission(policyOwner/storageWriteVersion/classifierTimeoutMs/userConfirmationEnabled)；治理族 goal/runawayGuard/toolResultCompaction/contextManagement/agentStop/sessionRotate/promptConfig/sandbox/cuBackend/contentReview；能力族 memory/skillEvolve/skills/askUser/browser/tui/telemetry/asr/review/mcpToolSearch/agentRuntime/opencode/cli/sessionTitle/sseErrorPush/notifications；杂项 logLevel/devPort/logRetentionDays/beta。

**B-4 TUI 组件/面板**：features 17 域——auth(login-region-picker)/changelog/composer(11 文件)/feedback/goal-banner/help/history-search/inspection(能力+报表)/interaction(决策帧/决策选择/权限选择/权限模式选择/计划三面板/问卷选择器)/model(picker+context-window+effort+thinking)/plugin/provider(manager+editor+connections+onboarding 765 行)/queue(panel+paused-send)/session-manager/session-mutation(explorer+picker+rewind-preview+scope-picker)/settings(status-line+hotkeys)/transcript/update。

**B-5 beta 特性注册表**（config.ts:329-638 BETA_FEATURE_DEFS）：约 20 开关，每个带 defaultVisibility/configurableVisibility × 四级可见性 none<test<internal<online（按构建变体映射）；含 autoMemory、skillEvolve（+BuiltinMr 子开关：夜间进化器开 worker 提 GitLab MR）、skillProposal（会话终了提案固化新 skill）、browserBridge（Chrome 扩展桥接真实登录态浏览器）、filePanelBrowser(+MultiTab)、browserUseTooling/AutoOpenPanel/AgentCursor、desktopPlanMode(+AgentEntry)、peek（/btw 生产强关）、keepAlive、promptOverride（文件覆盖内置 prompt）、computerUse、asr。

**B-6 状态行 16 项全 id + 别名**（shell/status-line-items.ts:29-46）：build-mode(别名 status-protocol/vela)/current-dir(workspace/cwd/project-dir)/session-title/git-branch(git/branch)/review-link(pr/mr/pull-request/merge-request/review)/plan-mode/approval-mode/model-with-reasoning/model/context-window/subagent/token-quota/cache-read-ratio/context-remaining/context-meter/custom-command。首轮 16 计数正确但未列 id，subagent 项（子代理计数）为首轮未点名条目。

**B-7 会话管理面**：CLI --continue/--session + /sessions 搜索面板 + /rename、/archive + mavis session 六子命令（含 cloud source 读云会话）+ export Markdown + transcript 搜索面板 + session-report 模块报表。无标签（tags）概念，归档是唯一分组维度。

**B-8 MCP/插件/扩展面**：local-runtime-v2/src/service/mcp（project-config + project-mcp.service + runtime/tools）；MCP 渐进披露见 A-10；插件 CLI+TUI 双入口（A-13）；agent-extension 16 模块（context-manager/permission/plan-mode/runaway-guard/session-report/skills/system-reminder/miniapp/terminal-response-recovery/tool-output-budget/source-reference 系 4 文件等，agent-extension/src/）。

**B-9 provider 层**：models.dev 目录快照 + 区域镜像（shared/src/models-dev.ts:9）；managed backend routing 按 lane 头路由（desktop/managed-routing.ts）；provider CLI 六子命令（A-12）；凭据双源 token_plan|minimax_api_key；BYOK 树保护与迁移（首轮已覆盖）。

### C. 差距对照与搬运建议（仅变化项，接首轮表与 P0-P2 清单）

1. **新增 P1：ask_user 问卷契约**——我方对话式配置/审批卡可直接借「1-4 步 × 2-4 选项 × recommended × 选项带图」的字段语义与提示词文案（builtin-defs.ts:345-465），比笼统的「审批弹窗」更完整；成本小（一个 Vue 卡片组件 + 后端暂停/恢复协议）。
2. **新增 P1：Plan Mode**——/ide 已有 IdePlanFloat，但缺「计划确认门 + agent 主动进入 + 评审面板」三件套；plan-mode.ts 的入口/退出/持久化恢复语义（beta.desktopPlanMode kill-switch 注释，config.ts:417-432）可作对齐参照。
3. **新增 P1：MCP tool_search 渐进披露**——IdeMcpPane 现在全量声明工具；thresholdPct/minDeferCount/topK 参数化思路可显著降 token 底座（config.ts:902-911）。
4. **新增 P2：会话搜索/归档/重命名**——/ide 会话列表可补搜索 + Recent/Archived 视图 + workspace/all 作用域（session/manager.ts），配合已有 rewind 形成完整会话治理。
5. **新增 P2：命令面板元数据模型**——命令面板（Ctrl+P）可借 catalog 的 category×discoverability×visibleWhen 元数据分层控制命令暴露密度；插件/技能注册命令走同一 contribution 通道。
6. **新增 P2：草稿恢复 + 粘贴附件**——ChatInput 崩溃/刷新丢草稿是真实痛点，2 MiB 上限 + 原子写模式（draft-recovery.ts）成本小。
7. **维持不搬**：matrix 工具注册结构（A-18）补齐表面后结论不变——18 工具 × 路由 × 超时 × 模型档全与 MiniMax 云绑定；租约 broker 架构留档。browser 工具面（A-5）语义设计（单工具多 action + skill 前置门 + 诊断查询脱敏）值得留档，但实现依托 Electron FilePanel/headless Chrome，对 Vue3 工作台仅概念参考。
8. **首轮勘误**：无事实性错误；两处计数（命令 51、状态行 16）经本轮逐项枚举复核成立。首轮「斜杠命令面」列举的命令子集与全量 51 条不矛盾，本轮已补全。
