# dsh-TUI 源码普查：特性清单与 SwarmStudio /ide 差距对照

2026-09-21，基于 upstream/dsh-TUI @ 7068cc2（= M2 移植基线；`git ls-remote` 实测远端 main 同为 7068cc2，**相对移植时零新提交**）。npm 名 `@deepseek-harness-tui/dsh-tui`，MIT（package.json:2-3,18）。v0.10.2 tag（9abb910，09-17）落后 HEAD 34 个提交，即本文所见包含发布版之外的全部 in-flight 工作。数据来源：全仓文件清单 + 关键模块直读。

## 一、仓库概览与技术栈

**定位**：DeepSeek Harness（dsh，Cordis 插件内核）的终端界面插件。约 560 个 TS/TSX 源文件，单包 `src/` 无子包。

**技术栈**：TypeScript + React 19 + react-reconciler 0.34，渲染器是**自移植的 Ink 全家桶**（`src/ink/`：reconciler、Yoga 布局桥、差分输出、termio CSI/OSC/SGR 解析器、鼠标/滚轮/焦点事件系统），Yoga 用纯 TS 实现（`src/native-ts/yoga-layout/`）。运行时依赖里值得注意：`lovely-mermaid`（mermaid 字符图）、`sixel` 0.16（编码）、`sharp`（optional，图片降采样）、`marked` + `highlight.js`（package.json:346-386）。Node ≥22.19/24（package.json:109-111）。

**目录地图**（读源码的导航图，均实读验证）：

| 目录/文件 | 职责 |
|---|---|
| `src/index.ts` | Cordis 插件契约入口（名称/注入声明/Schema），保持轻量 |
| `src/dsh-adapter/` | 与 dsh 上游对接的全部逻辑：`plugin.ts` 服务装配、`channel.ts`（组合根）+ `channel/*`（30 余个 specialist：rewind/fork/compaction/projection/ide-selection 等）、`sessions/` 列表与摘要、`trajectory/` 轨迹聚合 |
| `src/adapter/` | 插件分层边界：`ports/`（UI 中立端口类型）、`standard/`（生态插件准入/授权/协商）、`kernel/`（运行时与回放隔离）、`upstream/`（上游版本驱动）、`channel/`（Channel 协议） |
| `src/screens/` | 5 个屏：Chat（主界面 4765 行）、SessionSupervisor（三合一会话管理）、SessionTree（家族树）、TrajectoryScene（轨迹）、Settings、StatusLine/StatusMetrics（状态行与度量） |
| `src/components/` | 视图组件（RewindPicker、MermaidDiagram、ImagePreviewOverlay、ContextBarView、EffortSlider、轨迹/子代理面板族）+ `design-system/` |
| `src/ink/` | 自移植 Ink 渲染器：reconciler、layout/yoga、事件系统、sixel/kitty 图形、选区、AlternateScreen |
| `src/terminal-utils/` | 终端侧纯函数：mermaid 桥、markdown、语法高亮、超链接、会话配色 |
| 根部散件 | `workspaces.ts`/`sessionPins.ts`/`sessionMounts.ts`（持久台账族，均落 `~/.dsh-tui/`）、`deepseekBalance.ts`/`deepseekPricing.ts`、`reload.ts`、`commands.ts`（slash 命令注册表）、`i18n.ts`（zh/en 双语千余键） |
| `presets/liangshen/` | 打包 preset 示例（compaction-epoch、custom-bash 等插件脚本） |
| `docs/` | architecture / interaction / plugins / vscode / session-mount-runtime 等中英双语文档 |

**纯插件挂载、零核心改动怎么实现**（三层）：

1. `cordis.yml`（根）声明服务组合清单：挂 `dsh-user-questions`、`dsh-user-approval`、子代理 spawn/fork 后端、JSONL 会话持久化、token-meter、compact（阈值 20%/保留 5%——DeepSeek 1M 窗口下 80% 默认永不触发的定制，cordis.yml:241-249）等 dsh 官方插件，最后挂自己（`- id: dsh-tui`，cordis.yml:52-57）。安装即 `dsh plugin --profile dsh-tui add …`，卸载不残留。
2. `cordis.patch.yml`（profile bundle 层，`package.json:473-477` 的 `dsh.bundle.patch` 指向）决定服务行、覆盖关系与挂载顺序（docs/architecture.md:36）。
3. `src/index.ts` 只放插件契约与 Schema 并延迟加载 runtime；`src/dsh-adapter/plugin.ts` 做 TTY 检查、服务装配、Agent 创建/恢复、React 挂载（docs/architecture.md:24-26）。

**运行链路**（docs/architecture.md:7-18）：cordis profile → index.ts → plugin.ts → DSH Agent/session/tool 服务 → `dsh-adapter/channel.ts`（session/event → Channel 投影）→ `screens/Chat.tsx`（按键与模式编排，4765 行）→ components → ui.ts → ink/* → ANSI 终端。

**关键架构事实**：

- **Session 事件日志是真源**，React 数组只是投影；rewind 的 turn 边界、resume/compact/fork 后的重建都从 JSONL 事件流来，工具结果按 callId 关联（docs/architecture.md:47-58）。持久化在 `~/.dsh/sessions/`（profile 层）或 `~/.dsh-tui/sessions/`（docs/architecture.md:84-99）。
- **adapter 分层**：`src/adapter/{ports,standard,kernel,upstream,channel}` 把「上游 dsh 版本差异」「插件准入协商」「内核运行时」隔离在 UI 之外；生态插件经 13 个接缝挂入（设置区块/全屏场景/托管对话框/状态行/快捷键/渲染器/主题/决策事件/toast 等，README.md:160-172）。
- **长会话性能**：差分输出、虚拟化列表（屏外行用上次测量高度占位）、回放合并连续 token chunk、有界缓存、East-Asian 宽度按 cell 计（docs/architecture.md:60-68）。
- Inline（内容留主屏 scrollback）与 fullscreen（AlternateScreen，自管滚动/选区/OSC 52 复制）双模共享 Channel 与视图（docs/architecture.md:74-81）。

## 二、功能特性清单（锚点 = 仓库相对路径:行号）

### 遥测簇（M2 已移植部分，锚点复核）

- **分段上下文水位条**：5 段配色 system/prompt/assistant/thinking/tools（`src/screens/StatusMetrics.ts:19-27` USED_SEGMENTS）；最大余数法列分配（allocateProportionally，StatusMetrics.ts 末段）；右对齐读数阶梯 `13k/64k 19.5%` → 窄时只留百分比（contextBarReadout，StatusMetrics.ts:103-111）；悬停图例 contextBarBreakdown（全段 breakdown + 三档 label 阶梯，StatusMetrics.ts:170 起；JSX 双胞胎 `src/components/ContextBarView.tsx:1-20`）；读数压力变色阈值 80%/95%（StatusMetrics.ts:73-74，与我方裁决的 60/80 不同源，我方已按 ChatInput 对齐）。分段数据在投影层逐事件累计（`src/dsh-adapter/channel/projection.ts:511-526,572,745-833`：assistant 文本进 assistant 段、thinking 单独、工具结果进 tools 段，压缩后以摘要 token 折叠 prompt 段）。
- **TPS 仪表**：流式期间 `outputTokens = 已结算 token + ceil(outputChars/4)`（projection.ts:429-442），首 token 时刻锚定 decode 时距；轮结束用全轮结算值覆盖并采样进火花线（projection.ts:734,882-907）；色阶绿 ≥50 / 黄 ≥20 / 红（StatusMetrics.ts:1-9 头注释，pi-tps-meter 血统）。
- **缓存命中率**：M2 已按我方 SessionSummary 口径落地（`overlay/custom/client/ide/utils/metrics.ts:45`），dsh 侧口径在 lastUsage 三元组（见下条）。

### 双击 Esc 时间回溯（rewind）

- **触发**：输入框空时双击 Esc（`src/components/PromptInput.tsx:927-938` escPendingRef + escTimerRef 窗口判定）；Esc 整体层级语义见 docs/interaction.md:19（关帮助→关预览→关菜单→清选区→中断→清空→双击回溯）。入口还有 `/rewind` 命令（src/commands.ts:47）。
- **列表与确认**：候选 = 用户消息倒序（`src/screens/Chat.tsx:2581-2585`，排除 steering 侧问）；选中后先走 `tui/rewind-prompt` 插件决策（Chat.tsx:2608-2618），插件可否决或追加模式（如「同时恢复文件」），模式 0 恒为内置「仅对话」（`src/components/RewindPicker.tsx:12-22`）。
- **实现本质 = 事件前缀 fork，非原地修改**（`src/dsh-adapter/channel/session-rewind.ts:34-148`）：① 回合运行中先 cancel 并轮询等待 `turn/end` 落定（:19-31,54-60）；② 从选中行 seq 向上找 `turn/start` 边界（:64-70）；③ `sliceLiveSessionSeed` 把源会话事件日志切到该边界（:78，刻意不用 sessions.fork()——那会注册真子会话污染切点，:75-77 注释）；④ `agents.create` 新建子会话（新 SessionId + seed + parentSession 记血缘，:90-107），子会话启动前 `agent.inbox.clear()` 撤销继承的待办认领（:100-105）；⑤ 挂工作区登记 + mount 预留 + `adoptForkedAgent` 提交切换（:113-141）；⑥ 旧会话完整留在 /resume；被回溯的消息文本回填输入框供改写重发（Chat.tsx:2620-2630 setHistoryFill）。
- **语义区分**：rewind 记 parentSession（血缘分支）；`/fork` 是无血缘独立副本（`src/dsh-adapter/channel/session-fork.ts:74-76` 注释明示 kimi-code 语义），detach 后写标题 `Fork: …` 并提示 resume 命令（:99-111）。

### 会话家族树 /tree 与会话管理

- `/tree` 家族树（`src/dsh-adapter/sessionTree.ts:4-11`）：DSH 会话是线性日志，rewind 产生记 `parentSession + seedLength` 的新会话；树把全家拼回——每会话贡献 seq ≥ seedLength 的自有条目，fork 挂在父的最后一条 seed 条目上，父的尾部即被弃主线。渲染 `src/screens/SessionTree.tsx`；树节点可直接 rewind/fork/adopt（`src/dsh-adapter/channel/session-tree-actions.ts:29` 起，支持从非当前会话的持久化日志加载）；drop-turn 确认预告丢失范围（sessionTree.ts:67-88 droppedTurnInfo，含「整分支就一轮」陷阱提示）；压缩检查点是树节点类型（src/i18n.ts:216）。过滤四态 default/no-tools/user-only/all（sessionTree.ts:21-22）。
- **三合一会话管理界面**（`src/screens/SessionSupervisor.tsx:28-46`）：`/resume`、`/home`、`/agentview`、`/bg` 与输入行 `⌸` 落同一屏——左工作区栏（持久登记/编辑/重命名/移除，`src/dsh-adapter/workspaces.ts:56-77` TuiWorkspaceHost，登记只是记录不删目录）、右该工作区会话列表（实时状态、筛选、行内 ★ 固定，`src/sessionPins.ts:1-9` 持久化 `~/.dsh-tui/session-pins.json` 原子写）。被其他 TUI 占用的会话列出但拒绝进入；本终端停放会话可随时切回且**切换不中断正在跑的回合**。
- **跨进程占用台账**（`src/sessionMounts.ts:1-50` 头注释）：`~/.dsh-tui/session-mounts.json`，每进程发布已挂载会话集合，活性用 `process.kill(pid, 0)` 见证（无心跳时间戳，防「该刷新的进程恰是刷新不了的」）；读路径永不写、写路径加短锁重读后原子替换、锁带 token 防活锁持有者被偷；账本读不出来 ≠ 没人占用，fail-closed。
- `/export` 存 Markdown、`/rename`、空会话判定只认「完整读取且无用户消息」（README.md:70-71）。

### mermaid Unicode 字符图

- 引擎 `lovely-mermaid`：纯 TS 进程内布局，无浏览器/SVG/图片协议；布局产出自然宽度，适配视口或回退源码由组件决定（`src/terminal-utils/mermaid.ts:1-12`）。懒加载——首个 mermaid fence 才 dynamic import（mermaid.ts:29-51）；同步 peek 避免首渲染闪源码（:58-60）。源码 >20k 字符直接跳过（:27）；解析 best-effort，流式前缀持续成形不闪换（:6-8）；引擎异常一律降级回围栏源码（:74-81）。语义角色着色（边=permission 色、标题=subtle 等，:88-95），节点文本不涂色继承正文色。组件 `src/components/MermaidDiagram.tsx`；类型覆盖 flowchart/sequence/state/class/ER/pie/mindmap/timeline/gitGraph（README.md:69）；`/settings → mermaidDiagrams` 实时开关（cordis.yml:66-67）。落地于 v0.10.2 之后（commit a97f7bd）。

### 终端内图片（Sixel / Kitty）

- **协议探测**：Kitty 优先（kittyStatus OK），否则 DA1 属性含 4 则 Sixel，否则 none；`DSH_TUI_IMAGE_PROTOCOL` 只改协议选择不越过 TTY/无障碍守卫（`src/ink/terminal-image-protocol.ts:1-14`）。
- **Kitty 通道**：APC `\x1b_G` 分块 base64 + zlib deflate，image id（像素内容）与 placement id（每个 DOM 节点）分离，z-index 垫底不遮文字（`src/ink/kitty-graphics.ts:13-17,54-58`）。
- **Sixel 通道**：Worker 线程编码（`src/ink/sixel-graphics.ts:1` node:worker_threads），256 色自适应调色板、透明与背景合成；滚动只编码可见部分、移出视野或被浮层覆盖时擦除；帧/缓存/条目多级容量上限超限回退文字（README.md:53-58；常量见 sixel-graphics.ts:7-11 引 terminal-image.ts）。
- **大图预览**：`src/components/ImagePreviewOverlay.tsx:15-40` ——对话区 95% 宽高预算、最长边 2048px；适应窗口/100%/200%/400%/800% 缩放、拖动平移；`←`/`→` 切换本会话图片；底部「打开原图」调系统看图程序读未重编码附件。缩略图常驻 transcript（用户附件 + 工具结果持久图片块，`src/components/messages/TranscriptImages.tsx`）。
- **入站降采样**（v0.10.2 后 commit 61d8906）：贴图超单边/总像素上限先等比缩，格式不符按 profile 重编码，动图需改字节则明确拒绝（README.md:67；sharp 可选依赖）。
- 输入框 `[Image #N]` 是整体 token：光标整跳、删除整生效、悬停反显自动开预览，vim `x`/`X`/`u` 同语义（README.md:67）。

### 上下文压力分级之外的提醒动作

- **低上下文主动 toast**：绝对余量阈值 `CONTEXT_WARNING_BUFFER_TOKENS = 20_000` token（`src/dsh-adapter/channel.ts:116`），口径 = 上一轮 `input + cacheRead + cacheWrite`（`src/dsh-adapter/channel/context-bookkeeping.ts:23`——input 单独会漏缓存读写，恢复会话全量重放时的诚实分子）；每会话只警一次（warning 门闩），压缩后复位（projection.ts:531）；文案给动作建议：「上下文即将耗尽（剩余 N%）· 运行 /clear 或新建会话」（src/i18n.ts:180）。
- **/compact 手动压缩事务**（`src/dsh-adapter/channel/compaction.ts:50-133`）：先走 `tui/compact` 插件决策（可否决），压缩期间 owner 生命周期护栏 + 切会话即中止并等落定（3s 上限）；阈值 20%/保留 5% 的定制见 cordis.yml:241-249。无自动 compact——自动的只有提醒，动作留给人。
- **/recap 与自动回顾**：无工具单次 LLM 调用，只喂最近 6 轮/6000 字符的对话摘录，产出一行总结 + 提议标题，**不进会话日志**（`src/dsh-adapter/recap.ts:1-23`）；恢复会话时可自动显示为底部暗色回顾行，hover 出操作、用户开新消息即让位（`src/components/AutoRecapRow.tsx:8-14`）。

### 审批、问卷、子代理与后台任务

- **工具审批面板**：dsh 的 `approval/request` waterfall 由 TUI 注册自身为 answerer（cordis.yml:13-25 注释 + 挂载行）；协议只有一次/拒绝两档，无「总是允许」（docs/architecture.md:107-110）。`src/components/approvals/ApprovalPanel.tsx` 渲染。
- **问卷（ask_user_question）**：`src/components/questions/AskUserQuestionPanel.tsx` + `PlanReviewPanel.tsx`；可折叠成最小化条（`QuestionMinimizedBar.tsx`，commit 3f47622）。
- **子代理**：spawn/fork 双后端 + `subagent`/`subagent_fork` 双工具（cordis.yml:143-170，maxDepth 1 保持工具卡浅）；`/agents` 面板（`src/components/SubagentDashboard.tsx:1-25`）+ 点击子代理卡进详情场景（`src/components/SubagentDetailScene.tsx`）。
- **后台任务 `/jobs`**：`src/components/JobsPanel.tsx`，面板内 k 键 kill、Esc 关闭独占按键（Chat.tsx:2843-2849 注释）。

### 长会话与渲染性能机制

- 差分输出：每帧只写屏幕变化，按终端能力探测决定同步输出与光标策略（docs/architecture.md:62-63）。
- 虚拟化消息列表：屏外行用上次测量的固定高度占位，不参与完整子树布局（docs/architecture.md:64-65）；列表行窗口化工具 `src/components/listWindow.ts`。
- 回放合并：历史回放时合并连续 token chunk，避免长流式消息二次字符串增长（docs/architecture.md:66）。
- 有界缓存：transcript/渲染节点/测量缓存均有上限（docs/architecture.md:67）。
- 平台兼容实测项：Windows ConPTY 路径（98b43f1 Sixel 修复）、zellij 内禁用 DECSTBM 硬件滚动（da50f48）。

### 工作台其余特性（速览，均有锚）

- **trajectory /trace 轨迹屏**（`src/screens/TrajectoryScene.tsx:21-38`）：整屏接管（less/fzf 式），wake 全会话波带 + ledger 时间线 + inspector + hotspot 视图；聚合回答「时间去哪了」——按工具/按模型阶段（decode vs TTFT vs 重试退避）/按轮分组排名，own-duration-only 防父子重复计数、无流输出的步不伪造 TTFT 样本、burst 行按调用展开（`src/dsh-adapter/trajectory/aggregate.ts:1-18`）。fold 增量：每渲染只消费新增事件（Chat.tsx:2643-2648）。
- **IDE 选区通道**（v0.10.2 后 commit e41d46b）：后台启动、非阻塞、自降级（channel.ts:308-315）；编辑器选区 → 模型侧 `<attached-file path selection>` 块，协议 2 verbatim、协议 1 磁盘行切片兜底，一切失败静默（`src/dsh-adapter/channel/ide-selection.ts:1-15`）；输入框下 `⧉ N lines selected` 徽标；lock 自动发现本机 IDE（README.md:72）；配套 VS Code companion 扩展（docs/vscode.md）。
- **余额与成本估算**：`/balance` 查官方账户余额（GET user/balance，Bearer，8s 超时，`src/deepseekBalance.ts:24-45`）；「本会话花费」按官方价目表把累计 token 折人民币——[空闲, 高峰] 两档单价、缓存命中按命中价、未收录模型返回 undefined 不显示金额绝不瞎算（`src/deepseekPricing.ts:1-30,35-37`）。
- **推理强度 effort**：`/effort` 滑杆（`src/components/EffortSlider.tsx`），持久化 `~/.dsh-tui/effort.json`；当前路由无该档时**只向下降级**并大声提示（`src/effortPrefs.ts:1-10`）。
- **输入体验**：`/vim` vim 模式（Chat.tsx:2452 附近）；Ctrl+R 历史搜索（`src/components/HistorySearchDialog.tsx:1-17`）；全屏草稿编辑 Ctrl+Shift+E（行号+当前行高亮，README.md:70）；草稿跨屏快照/恢复（`src/components/promptDraftCache.ts`）；`/btw` 侧问不打断主回合（src/commands.ts:51）。
- **鼠标与选区**：双击选词/三击选行、拖选即复制（OSC 52 + wl-copy/xclip/xsel 兜底，cordis.yml:60-63）；时间轴 rail / 可拖拽滚动条 / 隐藏三态（`src/components/TimelineRail.tsx`、`src/components/ScrollbarGutter.tsx`，拖拽落地 commit 1a52ecb）；600ms 悬停 tooltip、拖选期间一律不弹（README.md:66，守卫 commit d3d05ed）。
- **主题与 i18n**：dark / dark-ansi（16 色）/ light + auto（OSC 11 探测终端背景），静态 JSON 与运行时插件主题并存（`src/theme.ts:1-18,187-196`）；会话强调色 `/color`；zh/en 全量双语（src/i18n.ts，千余键）。
- **slash 命令面**：约 60 条（src/commands.ts:41-112），含 `/doctor`、`/init`（生成 AGENTS.md）、`/plugins`（插件契约/授权/台账诊断）、`/context`（已加载上下文明细，`src/components/LoadedContextPanel.tsx`）、`/jobs`（后台任务面板 + k kill，`src/components/JobsPanel.tsx`）、`/permission`（registry 驱动预设切换，走官方写路径绝不伪造事件，docs/architecture.md:104-137）。
- **/reload 软重载**：五个 boot-only 偏好文件的优先级计划器（env > cordis.yml/设置层 > pref 文件），纯函数可注入测试（`src/reload.ts:1-33,114-191`）。
- **安全模式 `dsh-tui safe`**（v0.10.2 后 commit 5a4d0a4）：dsh 异常退出后的只读诊断控制面 + 救援 profile（干净性四条门禁，fail-closed，README.md:137-146）。
- **启动体验**：像素鲸鱼顶栏（欢迎期可点击互动，首个任务后永久定格零开销，README.md:77）、tips 轮换（`src/tips.ts:1-22`，启动首屏与 `/tips` 共池）、问卷面板可折叠（commit 3f47622）。

### 版本对照结论

- **相对 M2 移植基线（7068cc2）：零新提交**（本地 == 远端 main == 移植基线，`git ls-remote` 实测），无需重吸收。
- **v0.10.2 tag 之后、HEAD 之前的 34 提交**里值得点名的特性：三合一会话管理界面（92064ef）、mermaid 字符图（a97f7bd）、IDE 选区通道（e41d46b）、上下文条悬停图例 + 读数压力变色（b46523a）、低上下文警告修复（bacd54d）、图片入站降采样（61d8906）、安全模式（5a4d0a4）、问卷折叠（3f47622）、Windows Terminal Sixel 修复（98b43f1）。npm 上装的 v0.10.2 **不含**这些；本文锚点均以 HEAD 为准。

## 三、与 SwarmStudio IDE 工作台差距对照

我方现状锚点：`overlay/custom/client/ide/`（views 15 个 + composables/useSessionMetrics.ts + utils/metrics.ts）。

| # | dsh-TUI 特性 | 我方现状 | 裁决 | 一句理由 |
|---|---|---|---|---|
| 1 | 上下文水位条 / TPS / 缓存命中（StatusMetrics.ts、projection.ts） | M2 已移植（useSessionMetrics.ts + IdeStatusBar.vue） | ≈ | 阈值已按 ChatInput 60/80 裁决对齐，口径一致 |
| 2 | 上下文**构成**分段（system/prompt/assistant/thinking/tools 五段 + 悬停图例，projection.ts:511-833） | 无 | → | 即台账 G4 前端半：dsh 证明纯事件累计可做，我方需 socket 推分类型 payload（后端 span） |
| 3 | 低上下文主动提醒（20k 绝对余量 toast + 动作建议，channel.ts:116） | 水位条变色，无主动提醒 | → | 把静态指示变成可行动提醒，原料 M2 已备 |
| 4 | 双击 Esc 时间回溯（session-rewind.ts） | 无（会话线性不可回退） | → | 概念价值高：消息级「回到此重发」；实现依赖后端事件前缀/新会话 seed 通道 |
| 5 | 会话 fork（session-fork.ts） | 无 | → | 同上依赖后端；前端只需入口与提示 |
| 6 | 家族树 /tree（sessionTree.ts） | 无 | → | 依赖 #4/#5 的血缘数据，后落地 |
| 7 | 工作区分组管理（SessionSupervisor + workspaces 登记台账） | 任务侧栏有项目/时间线分组，无目录登记视图 | → | 「工作区=登记的目录 + 其会话清单」的信息架构可纯前端+SQLite 落 |
| 8 | 跨进程占用互斥（sessionMounts.ts） | 单服务端 Socket 已有会话归属 | × | 形态不同：我方无多进程写同一日志的问题 |
| 9 | mermaid 字符图（mermaid.ts） | 聊天 Markdown 渲染无 mermaid | → | web 端直接用 SVG mermaid 更自然；搬「流式渐进成形 + 一切失败保源码 + 超宽保源码」语义 |
| 10 | 终端图片 Sixel/Kitty（ink/sixel-*、kitty-graphics.ts） | web DOM 原生图片 | × | 终端协议问题在浏览器不存在；预览交互（缩放档/切图/打开原图）可参考 |
| 11 | /recap 恢复自动回顾（recap.ts、AutoRecapRow.tsx） | 无 | → | 小成本大体验：恢复旧会话时一行「上次谈到哪」 |
| 12 | trajectory hotspot 聚合（aggregate.ts） | RunTrace L1/L2 模态 | → | 我方有每轮数据，缺「按工具/阶段分组排名」的聚合视角 |
| 13 | 余额查询 + 会话成本估算（deepseekBalance.ts、deepseekPricing.ts） | usage 面板有 token 无金额 | → | 价目表折算 + 高低峰两档 + 未收录不显示，三原则可直接抄；需扩多底座价目 |
| 14 | IDE 选区通道（ide-selection.ts + VS Code 扩展） | 我们本身就是 web IDE，选区上下文天然可得 | × | 场景不成立 |
| 15 | effort 推理强度滑杆（effortPrefs.ts） | 无推理强度 UI | → | 取决于 hermes-agent 是否暴露 effort 参数 |
| 16 | Ctrl+R 历史 / tips 轮换 / /btw 侧问 | ChatInput 历史上翻；无 tips；无侧问 | ≈/→ | 历史已有近似；tips 与侧问是小件 |
| 17 | vim 输入 / 全屏草稿编辑 / 终端主题 / OSC 52 | web 原生能力覆盖 | × | 浏览器环境无对应问题 |

## 四、建议搬运项排序

| 优先 | 项 | 价值（一句） | 成本（一句） | 落点建议 |
|---|---|---|---|---|
| **P0** | 低上下文主动提醒 | 水位到临界时给一条带动作建议的 toast，把 M2 的静态条变成可行动信号 | 小：useSessionMetrics 已有水位数据，加 20k 绝对余量门闩 + toast + i18n（一次性、压缩后复位语义照搬 context-bookkeeping.ts:20-30） | `ide/composables/useSessionMetrics.ts` 扩展 + IdeStatusBar toast |
| **P0** | 会话成本估算 | 用户最关心的「这一session花多少钱」从 token 数变成金额 | 小-中：价目表 [空闲,高峰] 两档 + 缓存命中分价 + 未收录不显示（deepseekPricing.ts 三原则直抄），但需多底座价目扩展 | `ide/utils/pricing.ts` + usage/状态栏段位 |
| **P1** | 上下文构成分段条（G4 前端半） | 一根条变五段构成，「谁吃掉了窗口」一眼可读 | 中：dsh 是纯前端按事件累计（projection.ts），我方需 socket 事件带分类型 payload，无则退化为后端 span（G4 原案） | IdeStatusBar 水位条升级 + 悬停图例（contextBarBreakdown 阶梯语义） |
| **P1** | 「回到此消息重发」（rewind 概念） | 纠错成本从「新开会话重贴上下文」降为一次点击 | 大：核心依赖后端「事件前缀新会话/截断」通道（同 fork），前端只做消息菜单 + 确认 + 文本回填 | 后端 SessionService 先行；前端 MessageList 行菜单 |
| **P1** | 工作区分组管理 | 多项目并行的导航主轴：目录登记 + 其会话清单 + pin | 中：纯前端 + 一张 SQLite 表（dsh 的「登记不删目录」「未登记兜底分组」语义直接抄 workspaces.ts） | 任务侧栏升级或独立页签 |
| **P2** | /recap 恢复回顾 + tips 轮换 | 恢复旧会话的连续感；首屏教育位 | 小：recap 一次轻 LLM 调用不进日志；tips 是静态文案池 | IdeChatPane 顶部回顾行；首屏卡片 |
| **P2** | mermaid 渲染（web 形态） | 模型输出的架构图直接可读 | 小-中：SVG mermaid 成熟库接入，关键是抄「流式渐进成形 + 失败/超宽保源码」降级语义 | IdeChatPane Markdown 渲染器 |
| **P2** | trajectory hotspot 聚合 | 长会话「时间去哪了」诊断（按工具/阶段排名） | 中：RunTrace 数据已在，聚合视图 + own-duration 防重复计数规则照搬 | RunTrace 模态新增 hotspot 页签 |

**明确不搬**：Sixel/Kitty 终端图片协议、scrollback/AlternateScreen 管理、OSC 52 复制、vim 输入模式、跨进程占用台账——全部是终端形态特有的问题，web IDE 无对应场景。双击 Esc 的「输入框空时双击」触发手势本身也不搬（web 有更直接的 UI），搬的是「消息级时间回溯 + 改写重发」语义。
