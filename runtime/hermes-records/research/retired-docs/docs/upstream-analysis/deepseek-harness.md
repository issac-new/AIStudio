# DeepSeek Harness（dsh）全量特性普查：源码测绘 vs SwarmStudio /ide 对照

2026-09-21，基于 upstream/deepseek-harness @ master ddefc45（tag dsh-v0.1.6-alpha.2，MIT，336M）。方法：54 个分组目录、291 个 workspace 包的 package.json 全量枚举 + 生成文档（architecture.md / tool-catalog.md，均 CI 门禁保鲜）+ bundle patch yml + 关键包 README 直读。dsh-TUI（社区终端插件）已有单独文档，本文只查 harness 本体，不重复其 UX。开发者预览期，官方预告破坏性变更（README.md:13）。

## 一、顶层目录地图

`dsh` = Cordis（vendored，vendor/cordis）之上的 everything-is-a-plugin 运行时；一个运行中的 dsh 是启动时按层组合出的插件树（docs/architecture.md:17-19）。

| 目录 | 是什么 |
|---|---|
| `apps/cli` | `dsh` 唯一 Node 启动器：`dsh <name>/--profile`（web/headless/sdk/sdk-minimal/acp）+ `dsh plugin`（转发 pnpm 管理插件）+ `--dump-config`；`src/args.ts` 拥有命令语法（apps/cli/README.md:5,11-18） |
| `apps/web` | Vite 前端壳（src 仅 main.ts/preview.ts，业务全在 packages/client/ui-*，src/main.ts） |
| `apps/desktop` + `desktop-host` | Electron 桌面应用：自带签名 runtime，保留 `$DSH_HOME/profiles/desktop`，默认端口 19387（docs/architecture.md:51-55） |
| `packages/`（54 组 291 包） | 全部产品代码，每组一个 README 是权威包图（packages/README.md:29-84） |
| `vendor/`（9 个） | cordis/cosmokit/schemastery/loader/hmr/timer/group/include/logger-console 内置 fork |
| `native/system` | Landlock 启动器原生构建（Linux 沙箱，pnpm-workspace.yaml:8-10） |
| `python/` | Python SDK（§八） |
| `website` `benchmarks` `snapshots` `patches` `scripts` | 文档站、基准、快照 fixtures、pnpm patches、约百个治理脚本（verify-* / gen-* 系列，package.json scripts） |

**Web 工作台（:3080）能力面全列**（`npx @deepseek-ai/dsh web`，README.md:24-27；端口默认 3080，packages/bundle/web-app/cordis.patch.yml:139）：

| 区 | 组件（包） | 职责 |
|---|---|---|
| 布局 | ui-layout | 三列 AppFrame + 拖拽手柄 + ctx.layout 导航态 |
| 左栏 | ui-sidebar + ui-workspace | 品牌行/新建会话/折叠 56px 轨/设置座；workspace 分组或扁平会话行、增/重命名/重排序（最近更新与手动两模式）、搜索（标题即时 + 250ms 防抖内容搜索，SQLite FTS5）、**fork（在最后完成轮分叉并继承标题）**、归档；运行中后代点蓝点、schedule 告警标记（ui-workspace/README.md:2,42,46） |
| 会话主视图 | ui-conversation + ui-chat | 对话组装/shell/composer/队列（steering 排队）/视图导航；节点族 20 种（assistant/tool/turn-process/turn-tail/compaction/command/inbox/partial/retry/turn-error/turn-max-tokens/turn-navigation/fallback 等，packages/client/ui-chat/src/client/conversation-nodes/）；**TurnNavigator 轮导航 + turn rail**（turnOutline 投影）；**StatsPills 双弹窗**（仪表盘 pill：轮/步数+输出速度→时间与速度对话框；数据库 pill：总 token+缓存命中→token 用量对话框，StatsPills.tsx:1-9）；ReasoningRow 思考链；SystemPromptRow/ContextInjectionRow 上下文注入可视化 |
| 输入区 | ui-input-trigger + ui-commands + ui-reference + ui-skill | '/' 与 '@' 触发管线、命令三种 UI 形态、@file/@session/@子代理/@skill 引用源 |
| 会话头 | ui-jobs + ui-schedule + ui-open-in-app | 后台任务列表（jobsBySession 镜像）、活动提醒目录（只读）、"Open In..."用本地应用打开工作区 |
| GoalBar | ui-goal | 停靠在 composer 上方的会话目标条（goal 投影） |
| 右侧栏 | ui-sidebar-right + dockkit | 每会话一个停靠面（split-tree 布局引擎）；tab 类型走 VS Code 编辑器解析器：extension/builtin/fallback 三优先带 + glob 地址识别 + 指南页（tab-registry.ts:1-25） |
| 右栏 tab | ui-sidebar-files / -terminal / -browser / -documentpreview | 文件树（懒加载目录）、交互 shell tab、沙箱化 HTTP(S) 浏览器 tab（含 loopback）、文档预览（Office/Markdown/高亮代码/图/PDF/HTML/文本，office-to-pdf 用 LibreOffice kit） |
| 审批/交互 | ui-approval + ui-user-questions + ui-plan | 审批 composer 接管（Remote Event waterfall 上）、ask_user_question composer 接管 + plan 评审、plan 模式控制行 |
| 子代理 | ui-subagent | 子代理会话目录、continuation 路由 UI、'@' 引用源 |
| 工作流 | ui-workflow-run | 持久 workflow-run 会话节点 + 嵌套成员披露 |
| 交付 | ui-deliverables | 每 turn 结尾 changed-files 卡（逐文件对比 tab）+ present 交付卡 + 最终回复文件引用可点 |
| 模型 | ui-model-selection | /model popupSelect + composer 模型座（session.selectModel） |
| 权限 | ui-permission-presets | 新会话默认权限（General 设置）+ 当前会话 /permission 弹层 |
| 预设 | ui-agent-preset | 后续会话默认预设、本会话座、**组合编辑器**（cordis.yml 每会话 agent 组合，packages/preset/agent-presets/README.md:27-30） |
| 反馈 | ui-message-feedback | 逐消息赞/贬 + /feedback 对话框（messageFeedback/sessionFeedback Remotes） |
| 轨迹 | ui-trajectory | 事件台账 + 可交互 timing 时序总览（纯消费插件，注册进 ViewMap） |
| 设置 | ui-settings(-general/-models/-plugins/-plugin-inventory/-unarchive-sessions) | General/Models（provider 配置+onboarding）/插件配置卡/Loader 清单只读 tab/归档会话恢复页 |
| 插件 | ui-plugin-manager | 侧栏 Plugins 页：安装/启停/重试/移除 profile 的 bundle |
| 导出 | session-log-export | /export 命令 + 共享下载对话框 |
| 其他 | ui-theme（light/dark/system + --dsw-* token）、locale（zh/en 可扩展）、ui-attachment（附件呈现）、ui-tool（工具调用树+逐工具卡）、ui-cordis（cordis_define 动态插件定义卡）、ui-brand-official、resources（URL→活值统一资源模型）、file-upload（流式上传） |

实验层（agent-team-web-profile）：Agent Teams roster/task board/队友导航（packages/experimental/client-ui-agent-team）。

## 二、插件体系与挂载协议

**everything-is-a-plugin**：没有特权核心，连模型适配器、工具注册表、会话日志、agent loop 本身都是插件，各自可从配置替换（docs/architecture.md:11-13）。挂载协议（docs/cordis-primer.md:9-13,45）：

1. 插件 = 实现 Service 的对象（函数带 `inject`/`apply(ctx)` 或 Service 子类），声明式依赖注入：`inject` 列出所需服务，加载顺序由服务可用性驱动而非手工排序。
2. 一切注册是**可逆 effect**：`ctx.effect()`/`ctx.on()` 安装的 prompt 段、工具 schema、适配器在卸载/重载时按序回退。
3. 事件三分域：Session 事件（durable 落日志）、Agent 事件（live 拦截）、Capability 事件（fs/*、tools/*、telemetry/* 挂策略不 import loop）（docs/architecture.md:74-80）。
4. 组合层序：空表 → profile 列出的 bundle 依次 insert → profile `cordis.patch.yml` → home 级 → `--patch` 覆盖；patch 按 id 定位整行替换 config（docs/architecture.md:27-29）。YAML 内 `!!js` 表达式可引用 ctx 服务与环境（cordis.patch.yml:22 `disabled: !!js "!ctx.get('profileContext')"`）。
5. Profile/bundle 声明在各自 package.json 的 `dsh` 字段（dsh.profile / dsh.bundle）；5 个模板 profile：web/headless/sdk/sdk-minimal/acp（docs/architecture.md:19-25）。
6. **agent preset**：web 模式下模型面工具/提示段/技能按「每会话组合」挂载——standard/ptc/cordis/minimal 四个内置预设 + `$DSH_HOME/.agent-presets` 用户预设（packages/preset/agent-presets/README.md:25-30,70-77；standard 见 presets/standard/agent.cordis.yml）。服务行必须带 `isolate` realm 隔离，否则多预设撞名（同文件注释）。
7. 双半插件：host 半（node）+ client 半（浏览器）同一包发布（`dsh.client` 行由 modules 扫描进 `window.__DSH_BOOT__`，web-app/cordis.patch.yml:43-44,170-177）；模型可用 `cordis_define` 工具现场写动态插件挂到运行时（extensions/cordis-host-runner + ui-cordis），持久化要经 plugin_manager 装成 bundle（tool-catalog.md:27）。

官方插件清单按 54 组给到（每组一句，291 包全量见 packages/README.md:29-84 分组表 + 各组 README）：core（会话存储/agent 接口/agent loop/系统提示/工具注册表/作用域）、api（Typert RPC 网关 + 6 个 controller）、typert（TS 类型图生成/加载/注册，RPC 协议的单一事实源）、goal（同会话目标 4 包）、schedule（会话内定时提醒）、feedback（/feedback + 逐消息评分）、identity（匿名 id）、llm（6 适配器 + token-meter + retry）、subprocess/ssh/shell/terminal/ptc-runtime（进程树/POSIX 远程/bash+pwsh/PTY/沙箱代码执行五族）、computer-use、browser-use、sandbox（bwrap/Landlock/Seatbelt/WinACL 四后端）、deliverables（present + workspace-changes）、fs（seam/local/sandbox/观测策略 + 3 工具包）、lsp、skill（注册表/文件系统/badge/office/工具）、compaction（seam/basic/裁剪/图片卸载//compact）、context（AGENTS.md/文件引用/会话引用/时间/tmux）、subagent（seam + 9 后端：spawn/fork in-process、ACP、claude-code、codex、dsh-sdk）、jobs、experimental（16 包：agent-team/browser-use 4 路/computer-use 2 路/inspector/webworker/ptc-python/auto-review）、workflow（seam + PTC 引擎 + workflow/ralph 工具）、webhook（GitHub 签名 webhook → 建会话）、web（search 三 provider + fetch + 工具）、document、attachment、spill（超限工具结果落盘）、todo、plan、preset、guard（重复调用提醒 + 工具超时）、bundle、extensions、mcp（client + resources）、hooks（Claude Code/Codex hook 线协议 + 两桥）、session（19 包：JSONL 持久化/v0-v3 迁移/投影/投影缓存/stats/turn-outline/标题/OTel 遥测/checkpoint 策略/log 扩展）、session-query（FTS5 检索 + 5 只读工具 + 导出）、settings、credentials（含 authorization 对话式取凭证）、storage、workspace、sdk（进程外 JSON-RPC 三包）、acp、interaction（命令/审批/权限预设/ask-user 5 包）、boot（4 包含 plugin-manager）、host（8 包 webserver/静态/dist picker/open-in-app/清单）、client（55 包即 §一 UI 面）、test-support（7 包，含 llm-mock/replay/remote-mock）、runtime-diagnostics、util（16 个零依赖原语）。

## 三、工具系统与审批/权限模型

**内置工具全量**（tool-catalog.md:16-47 工具包映射表，30 个工具包）：plugin_manager；MCP 资源三件（list/read 模板与资源）；stagehand 六件（act/extract/navigate/observe/screenshot/tabs，实验）；ask_user_question；run_code（PTC 模式保留传输：TS 程序体直接以 API 调工具，native/ptc/both 三呈现）；exit_plan_mode；bash 与 pwsh（一次性，run_in_background 转 job）；bash/pwsh persistent（PTY 常驻）；str_replace_editor（view/create/replace/insert）；fs 四件（edit/read/**read_image**/write，写前必读策略）；fs-search（glob/grep，内置 ripgrep）；terminal 六件（open/read/send/signal/list/close）；goal 三件（create/get/update，轮预算 max_goal_rounds）；schedule 三件（create/delete/list，after/at/every）；lsp（定义/引用/实现/hover）；ralph（fresh-agent 循环，默认关）；skill；session-query 五件（session_search/trace + session_event_read/search/trace）；subagent + list_subagent_models（按 settings 启用模型选择，continuable 后台）；subagent-control 三件（send_message/interrupt_agent/list_agents，descendants 树遍历）；jobs 三件（job_output/job_list/job_kill，bash/PTY/子代理统一 job 面）；agent-team 九件（实验：spawn_teammate/team_task_*/wait_agent/send_message/interrupt/list）；todo_write；workflow（JS 编排脚本：agent/pipeline/parallel/phase/log，schema 化产出）；web_search/web_fetch（1-4 query 合并）。

**审批/权限模型**三层（docs/subsystems/approval.md 域）：

1. **Sandbox 模式**（文件效果）：read-only / workspace-write / danger-full-access，每会话可切、事件落日志重启存活、模型经 runtime-context 快照得知当前模式（sandbox-policy/README.md:52-76）。
2. **审批策略**：ask（默认，waterfall answerer；Web 的 ui-approval 是 answerer）/ never；一次性决定、fail-closed、approval/asked+decided 审计对、模型只见工具结果不见审计（user-approval/README.md:12,30-36,155-156）。
3. **权限预设**：一个 Permissions 选择捆绑 sandbox+approval（workspace-write+ask / danger-full-access+never / read-only+ask），`/permission` 切换、新会话默认、组合不匹配显示 custom；实验 **Auto** 预设 = 每工具调用 LLM 授权审查（permission-presets/README.md:38-49；experimental/auto-review）。
4. 执行管线：tools/pre-execute → tools/execute（waterfall）→ tools/post-execute；沙箱升级（sandbox_permissions + justification）经审批重试；`[sandbox: file access denied]` 教模型这是策略拒绝（tool-catalog.md:24,22）。超时策略给每工具装 deadline、重复调用提醒阈值 [3,5,8]（base/cordis.patch.yml:387-388,441-445）。

## 四、上下文与会话管理

- **会话 = append-only SessionEvent 日志**，`deriveMessages()` 从日志投影模型历史；「模型可见 ⟺ 已落日志」是不变量（docs/architecture.md:119-125）。
- **compact**：compaction-basic 阈值驱动（默认 thresholdRatio 0.8、retainRatio 0.16，可按模型覆盖），先跑 tool-result 裁剪（8192 阈值 head4096/tail1024）再 LLM 摘要，`<compacted-summary>` 替换最老平衡段；CONTEXT_WINDOW_EXCEEDED 时旁路阈值做一次最大头部缩减并重试；`/compact` 人工立即压缩（compaction-basic/README.md 摘要 + base/cordis.patch.yml:327-333,399-414）。**image-offload**：图片超预算时最旧图换占位符重试（专门包）。
- **持久化**：JSONL（可 zstd），v0→v3 相邻迁移链、已提交代次路径永不改名、写前先独占发布 vN+1 后继（docs/architecture.md:123）；投影缓存 throttled write-behind（writeEveryEvents 200 / 5s，base/cordis.patch.yml:169-172）；**checkpoint 策略**：模型请求前和工具副作用前打持久化检查点（base:398-400）。
- **fork/resume**：fork = `ctx.agents.create({sessionId, seed, meta:{parentSession, seedLength}})`，只在轮边界（docs/architecture.md:160）；子代理 fork 后端种子 = 父会话**已完成轮**的快照，in-flight 轮不含（subagent-fork-in-process/README.md 摘要）；fork 不开模型选择以保持 KV cache 前缀复用（base:363-368 注释）。UI 一键 fork 在最后完成轮分叉并递增继承标题（ui-workspace/README.md:46）。
- **上下文构成数据**：token-meter 三投影——`tokenUsage`（uncachedInput/output/cacheRead/cacheWrite）、`contextPressure`（pressureTokens=最近上报 prompt、projectedTokens=下一请求预估、contextWindow）、`contextBreakdown`（systemTokens/toolsTokens/messageTokens 启发式构成，之和恒等 surface）（token-meter/README.md:56-72）。系统提示即 surface 节点，`systemPromptUpdate: in-history` 的模型在缓存历史后 append 新快照而不改写头部（llm-deepseek/README.md:78；architecture.md:113）。
- 跨会话引用：session-reference 包提供跨会话快照引用 + 持久不可信模型上下文（packages/context/session-reference/package.json 描述）。

## 五、Agent 编排

- **子代理 9 后端一接口**（ctx.subagents 命名注册表）：in-process spawn/fork、out-of-process ACP、claude-code（官方 Agent SDK）、codex（官方 app-server 协议）、dsh-sdk（stdio JSON-RPC 子进程）（packages/subagent/ 目录）。continuable 后台子代理可 send_message 转向（运行中最近步边界）/interrupt（只停当前轮）/list（children 或 descendants 全树，depth-1 才可发消息）（tool-catalog.md:1862-1930）。
- **目标驱动 + 预算**：goal 服务（同会话单目标，跨轮/重启/fork 存活，CAS 更新，默认轮上限 256）+ goal-round-driver（空闲且 armed 且有余量时自动续轮；**只有进入模型历史的轮消耗预算**，耗尽记 `round-limit` blocker；预约-准入两段防竞态；resume/fork 后必须人工 resume 才重新 armed）（goal/README.md:12；goal-round-driver/README.md 摘要+实现）。UI = GoalBar。
- **workflow 工具**：JS 编排脚本（agent/pipeline/无栅栏流水线/parallel/phase/log/args），运行在沙箱 Node PTC 进程，并发与总 agent 数受部署上限；与 zcode dynamic-workflow 同概念但语法更瘦（tool-catalog.md:2352-2364）。
- **ralph**：fixed 前台 workflow，每轮开全新无历史子代理、共享工作区即长期记忆、只有有界结构化报告跨轮，默认关（tool-catalog.md:1515；base:426-435）。
- **Agent Teams（实验）**：隐式 Lead + 持久队友 roster + 信箱 + 共享任务 DAG（CAS 修订、blocked_by、write_scopes 冲突预警），9 工具；dsh-base 默认禁用，专用 profile patch 开启（experimental/agent-team + tool-catalog.md:43）。
- 转向：排队消息在下一步准入（inbox 投影）；`agent/pre-step` 听者可改写或拒收（docs/architecture.md:86-113）。

## 六、遥测与成本

- **usage 管道源头**即 token-meter（§四三投影）；`deriveTurnTokenUsage` 把一轮折成**逐 attempt 精确 usage**（含 cache/reasoning/route，证据不全则不产出聚合）（token-meter/README.md:73）。
- StatsPills 两弹窗口径：时间与速度（turns/steps、llmMs、toolMs、**ttftMs/ttftSteps**、decodeMs/decodeTokens→输出速度）与 token 用量（总 token + **缓存命中百分比**，formatCacheHitPercent）（StatsPills.tsx:23-50 + token-format.ts）；sessionStats 投影供全日志轮/步数与墙钟（session-stats 包）。dsh-TUI 消费的正是这些投影（contextPressure→水位、tokenUsage→TPS/命中）。
- **成本：无金额字段、无价目表**——token-meter 只产 token，全仓成本相关仅 OTel 遥测管道（session-telemetry-otel，FEEDBACK_ONLY 模式，仅在用户主动反馈时释放日志前缀，base:174-204）。我方成本估算不能从此仓取数（与 zcode 结论一致）。
- 图片 token 有精确口径：DeepSeek 视觉定价 14px patch 网格、3:1 降采样、544 地板、1024 上限（llm-deepseek/README.md:180）。

## 七、模型路由与 Provider 层

- ctx.llm 是 provider 无关流式服务：适配器注册 route、`listProviders/listModels/resolveModelInfo`（contextWindow/输出默认/reasoning efforts/输入模态/systemPromptUpdate）、请求深冻结不可改写、终态恒为单个 finish chunk、错误码稳定（NO_ADAPTER/MISSING_CREDENTIAL/RATE_LIMIT/CONTEXT_WINDOW_EXCEEDED/IMAGE_OFFLOAD_REQUIRED…）（llm/README.md:12,57-70）。
- 适配器两只：**dsh-llm-deepseek**（deepseek-official，Messages 协议默认 https://api.deepseek.com/anthropic，Chat Completions 可选；默认目录 deepseek-flash 图文 + deepseek-v4-pro 纯文本各 1M 窗口；thinking 档 off/low/high/max；图片走 Files API 上传带缓存/配额治理）与 **dsh-llm-pi-ai**（pi-ai 多 provider 孪生，默认休眠，settings 写入 `llm-pi-ai:` 段即激活路由）（llm-deepseek/README.md:12,78-88；base:107-115）。默认模型 deepseek-official/deepseek-flash（base:82-86）。
- 子代理可独立选路（list_subagent_models 发现 + 委托工具 provider/model/reasoning_effort 字段）；llm-retry 在 agent 失败步扩展点重跑。
- 无模型价目表（§六）。

## 八、Python 工具链与 client/host 双端拆分

- **Python SDK**：`deepseek-harness-sdk`（高层 turns API：DeepSeekHarness 上下文管理器 → Session.run 返回事件流 + final_response/finish_reason 工具函数，python/sdk/src/deepseek_harness/api.py）+ runtime wheel 打包同版 dsh CLI 为平台包，默认 `--profile sdk`，必须显式 DSH_HOME（python/README.md:8-11）。**pytest 侧只有 SDK 测试**（pytest.ini testpaths=python/sdk/tests：client/运行时解析/bundled runtime/发布版本/smoke）。另有实验 ptc-runtime-python（CPython 子进程执行 PTC）。
- **client/host 双 tsconfig**：tsconfig.host.json 与 tsconfig.client.json 两个聚合，因为两端在同名 cordis Context 键（sessions/loader）下合并**不同服务实例**，单程序不能同时看两端（tsconfig.host.json:2-4 注释）；tsconfig.base.client.json 强制浏览器 lib/无 node 全局（:1-9）；浏览器纯净度另有 client-bundle-purity.spec 门禁。构建按 face 出双份 lib（package.json build:lib:host/client）。架构价值：同一包可同时携带 node 半与浏览器半且类型互不污染——我们 overlay 的 client/server 共享类型与「同键双态」形态可借鉴其**双 face 编译边界**思想，但需 Electron/Node 宿主才全额受益，优先级低。

## 九、与 SwarmStudio /ide 差距对照表

判定符号：≈ 已具备 / → 可搬（附落点）/ × 不适用。我方基线 = 会话聊天（流式+审批门）、文件树、git 面板+历史、MCP 页签+对话式配置、记忆/存储/wiki/白板、终端 dock、命令面板、计划/子代理浮窗、任务侧栏、状态栏遥测簇（水位/TPS/缓存命中，✅M2）。

| dsh 能力 | 我方判定 | 理由（一句） |
|---|---|---|
| 会话聊天/流式/审批门 | ≈ | 双方同构；dsh 审批走 composer 接管、我方审批浮层，形态差异非差距 |
| 上下文构成 breakdown（contextBreakdown 三段 + SystemPromptRow/ContextInjectionRow） | → | 我方 G4 缺口的直接实现样板：投影口径现成，UI 是两行组件，落点 IdeSidePane 新 tab 或状态栏簇扩展 |
| StatsPills 双弹窗（TTFT/decode 速度/轮步数 + token/缓存命中） | → | G8 会话级对应物，M2 TPS 管道已有前端原料，纯前端可补 |
| TurnNavigator 轮导航 + turnOutline 投影 | → | zcode P1-10 同款缺口；轮边界数据我方 chatStore 已有近似（轮次号） |
| per-turn changed-files 卡（workspace-changes git 快照） | → | turn tail 文件变更卡，配合我方 git 面板天然成立；需后端逐轮 git 快照 |
| present 交付工具 + 交付卡 | → | 显式交付物语义（写完必须 present），增强任务产物可视化 |
| 子代理目录 + continuation 路由（send_message/目录/后台） | → | 与 zcode P0-2 合流；dsh 的「目录+可续聊」比我方浮窗单流强一代 |
| GoalBar + goal 轮预算驱动 | → | G5 对应物；dsh 证明「目标+轮上限+自动续轮」闭环可行，需 hermes 后端 |
| 会话内容搜索（SQLite FTS5 session-query） | → | 侧栏搜索只搜标题的我方痛点；dsh 索引按需开启（openAt first-search） |
| 会话 fork（最后完成轮）+ KV-cache 保持 | → | fork 语义+缓存前缀不失效细节可直接抄 |
| ui-trajectory 事件台账+时序图 | → | RunTrace 升级方向（timing overview per event） |
| compaction 留痕卡 + /compact 命令 | → | 压缩事件对用户可见可解释；我方 compact 无 UI 痕迹 |
| LSP 工具（定义/引用/实现/hover） | → | 模型侧代码导航能力，hermes-agent 加只读工具即可 |
| session-query 五只读工具 | → | 跨会话历史检索工具（我方记忆面板是 UI 面，模型侧无工具） |
| ui-jobs 后台任务列表（session header） | → | bash 后台任务可视化；zcode P2-31 同款 |
| steering 排队消息面板 | → | ChatInput 有排队逻辑无面板；低成本低收益 P2 |
| ask_user_question composer 接管 | ≈→ | 我方有 AskUserQuestion 工具卡；composer 接管形态更醒目，P2 观感项 |
| plan 模式（exit_plan_mode 审批 + 只读约束提示段） | ≈ | 我方计划浮窗+审批已有；dsh 的「计划期禁改文件」提示段写法可抄进提示词 |
| Office/文档预览 | → | zcode P2-26 同款；dsh 用 LibreOffice kit + office-to-pdf，重依赖 P2 |
| 权限预设三档 + /permission 切换 | ≈→ | 我方审批门已有；「三档捆绑 + 会话中途切 + 模型可见快照」的语义可借鉴 |
| 插件体系（profile/bundle/patch/plugin_manager/UI） | × | 我方经 overlay patch 注入 upstream，形态不同；其 patch 层序设计是 overlay 机制的上位参考（观察即可） |
| agent preset 每会话组合编辑器 | ×→ | 依赖插件化运行时；「每会话选工具面」的产品概念值得远期记 backlog |
| webworker 浏览器内运行时 / ACP / SDK profile / webhook 触发 / OTel 上报 / Electron 桌面 | × | 宿主与产品形态不同（Koa+SQLite+hermes；无桌面分发、无匿名遥测需求） |
| ralph / Agent Teams（实验） | × | 实验期未默认启用，列为观察项（多代理 task board 与我方子代理体系演进方向相关） |
| run_code PTC（工具即 API） | ×→ | agent 运行时能力（hermes 侧），IDE 侧只消费展示 |
| 双语 locale 插件化 / 主题 token | ≈ | 我方 i18n patch 体系已覆盖 |

## 十、建议搬运项排序（P0-P2）

**P0（4 项）**

1. **G4 上下文构成 breakdown**。价值：上下文治理刚需，dsh 口径（system/tools/message 三段启发式 + 之和恒等）已验证，直接对上我方 G4 backlog。成本：后端中（hermes 仿 token-meter 在请求组装处产三段 span）+ 前端低（两行组件或状态栏簇分段）。落点：`ide/views` 新 ContextBreakdown 行 + metrics.ts 扩展。
2. **G8 会话级用量/速度弹窗（StatsPills 对应物）**。价值：把 M2 已有的 TPS/水位/命中从状态栏常驻升级为可点开的完整台账（TTFT/decode/llmMs/toolMs/逐 attempt usage）。成本：低——前端聚合 chatStore 既有事件 + usage 结算；契约抄 StatsPills.tsx:23-50 WindowStats。
3. **子代理目录 + continuation（与 zcode P0-2 合流）**。价值：多代理任务巡览与二次驱动（对 idle 子代理发消息）是工作台代差。成本：中——后端需子代理注册表（hermes 侧）+ send_message 通道；先做目录列表再续聊。
4. **per-turn changed-files 卡**。价值：每轮改了什么文件一眼可见，任务可回溯性大增（dsh 用 git 工作树快照记录）。成本：中——后端轮结束打 `git status/diff --name-only` 快照存 SQLite，前端 turn 尾插卡；与既有 IdeGitPane 数据同源。

**P1（7 项）**

5. 轮导航 rail（TurnNavigator + turnOutline 语义；轮边界我方已有）。6. 会话内容搜索 FTS5（SQLite 已在我方栈内，openAt 按需开启的懒加载索引设计照抄）。7. GoalBar + goal 轮预算（G5；后端重，dsh 的「预算只计进入历史的轮 + blocked 需满 3 轮」防滥用细节照抄）。8. RunTrace 升级为事件时序图（ui-trajectory 的 timing overview）。9. LSP 只读工具（hermes 加 lsp 工具，schema 稳定于 provider 之外的分层做法照抄）。10. present 交付物工具 + 交付卡。11. compaction 留痕卡 + /compact slash（压缩可解释性）。

**P2（观察/低优）**

12. steering 排队面板。13. 会话 fork 按钮（依赖后端 fork 语义）。14. ask_user composer 接管形态。15. Office 预览（LibreOffice 依赖重）。16. 权限预设三档语义。17. ralph/Agent Teams/插件管理 UI/双 face 编译边界（形态依赖项，记 backlog 不动手）。

**核查定论**：dsh **无模型价目表、无成本金额字段**（§六），与 zcode 结论一致；两仓都不能作为我方成本估算数据源。
