# Ycode 吸收矩阵全量盘点 + 第二批架构项裁决

日期：2026-09-25 ｜ 性质：对账与裁决档（Ycode 实现轮收口产物）
定位基准：`2026-09-23-zcode-foundation-design.md` §0 定位红线（Ycode=以 zcode 源码为基底融合的全新编码工具，非聚合器）。

本文两部分：**§1 全量吸收矩阵**（upstream 全部参考物 × 功能点 × 状态对账，补齐此前未落档的整域盘点）；**§2 第二批架构级五项裁决**（总纲 §1.2 所列"需先行设计后单独裁决"的放行/否决）。

## 1. 全量吸收矩阵

状态词：✅已落地（补丁号）｜🧬原生已有（实证不重造）｜🔜排队（后续轮候选）｜❌不吸收（有因）｜📄概念留档。

### 1.1 总纲第一批十项（全数收口）

| # | 功能点 | 来源 | 状态 | 锚点 |
|---|---|---|---|---|
| 1 | dispatch reason code 词表 | multica MUL-4525 | ✅ 398 | `custom/server/zcode/dispatch-reasons.ts`（18→21 枚举，引擎通道扩展档） |
| 2 | 认领四围栏 SQL | multica agent.sql:743 | 🧬+✅ | hermes 认领已有 per-profile cap/claim_lock/优先级序；399 补同人双跑拦截验收测试 |
| 3 | compact 六段交接 | kimi 吸收表 1 | ✅ 400 | context_compressor TRUE INTENT/新两段/[UNVERIFIED] 标注（既有段强于 kimi 部分不重造） |
| 4 | 审批五档宽度+八态 | minimax types.ts:170-195 | ✅ 402 | `custom/server/approval/`（candidates[0] 恒窄默认；deny→ask→allow） |
| 5 | checkpoint 四恢复选项 | claude-code 概念 | ✅ 组合层 | `custom/server/zcode/checkpoint-options.ts`（zcode v4 原语组合；POST /checkpoint/recover） |
| 6 | runaway-guard 六信号 | minimax contracts.ts:3-10 | ✅ 401+405 | 工具侧六信号+HMAC 指纹；文本侧 ngram（mimo max-mode 原语） |
| 7 | @mention A2A 派单 | multica §3.1 | ✅ | `mention-dispatch.ts`（逐 mention outcome+单 pending 槽 coalesced+可追溯 run） |
| 8 | 看板门禁四件套 | routa kanban.ts:109-127 | ✅ 399 | kanban_gates.py（gates.json 声明式；column_transition 事件） |
| 9 | token-meter 三投影 | deepseek-harness token-meter | ✅ 403 | `custom/server/tokens/`（恒等契约+zcode rounds 互校对账） |
| 10 | 子代理目录+continuation+名册 | dsh+codex+kimi | ✅+🧬 | 名册 patch 404（角色/昵称池/护栏）；continuation 原生已有（delegate background+action steer/stop+`_merge_late_steer`） |

### 1.2 mimo 调研 P1-P9（全数收口或裁决）

| 项 | 状态 | 说明 |
|---|---|---|
| P1 mimo 接入 | ✅ 393/394 | 按 Ycode 定位红线降级为过渡对照手段（非路线终点） |
| P2 LSP 工具化 | ✅ 397 | 五只读操作，真 pyright 冒烟全通 |
| P3 delegate 后台化 | 🧬 | **调研判定有误**——background 模式/steer/stop/_merge_late_steer 原生已有（delegate_tool.py:560-580 实证），worktree 隔离仍是 hermes 独有优势 |
| P4 记忆 FTS | ✅ 一期 406+二期 v1 407 | 一期 FTS 索引视图+reconcile；v1 规则式 distill 已落；v2 LLM 摘要=**条件挂起（407 自注：等 FTS 真实使用反馈，不闭门造摘要）**+触发判定面已落 distill-v2-gate.ts（反馈到量门槛/簇合成门槛/陈旧标记） |
| P5 失败级联 | ✅ 395 | 调研判定有误的二次修正（hermes 已有分段调度，只补级联） |
| P6 goal 冷裁判+ngram | ✅ 部分 405 | goal 冷裁判原生已有（goals.py 每轮裁判+GoalGate，强于 mimo 单次冷裁判）；ngram 新增 |
| P7 checkpoint 写手 | ✅ 405 | 五节模板+锚点校验+幂等+对账降级（挂预算触顶） |
| P8 workflow 沙箱 | ❌缓 | 与 loop-engineering 重叠，spec 原裁决维持 |
| P9 Exa MCP | ✅ 396 | runtime/exa 单一事实源 |

### 1.3 五仓增量补扫新点（2026-09-25，全部候选排队）

> **证据源声明（审计 E1/E2 修正）**：本节四行锚点（multica ec70b224/minimax 61c4c31/kimi 929403b6d/claude-code 2.1.281）来自 2026-09-25 增量扫描实录（直接读各仓 git log/diff），**尚未回写分析文档**（文档基线较旧）——回写列为补账动作；与文档冲突处以增量实录为准（multica §3.1 "无 steer" 为旧基线结论，ec70b224 已实现 ACP in-turn interject）。

| 来源 | 高价值新点 | 裁决 |
|---|---|---|
| multica | ACP 原子 in-turn interject（steering 三件套：prompt 生命周期开窗+版本门控+ack 超时，ec70b224）；Telegram 媒体双向管线 | steering 语义→🧬 原生已裁决（§1.4bis）；媒体管线参考→排队 P2 |
| minimax | Turn 级动态 Bash 工具契约（schema 随运行时裁剪+shell 感知提示，61c4c31）；长会话已验证前缀复用 | 动态契约✅ bashcontract/dynamic-bash-contract.ts；前缀复用 🔜 独立设计轮 |
| kimi | trust-boundary 加固回滚（929403b6d 负信号：深度防恶意加固被撤回） | 📄 概念留档（加固边界停在信任提示前） |
| claude-code 2.1.281 | 恢复保形原则；命令替换递归删除强制询问（allow 规则不吞不可静态判定的破坏性命令） | 📄 概念留档（专有许可红线：只搬概念） |

### 1.4 codex 61 提交增量（15 新点，全文见 `docs/upstream-analysis/codex.md` 增量节）

高价值四候选终态：Retry-After 遵从🧬原生（行 62）/流式元数据选择性裁剪✅409+475/TUI 选中即复制三档+终端检测矩阵✅tuicopy/copy-on-select.ts（off·on-select·foreground+能力降级）/per-model 工具描述覆盖族✅tooldesc/description-overrides.ts（整段替换/词表校验/省字账）。扩展 API 双提交为插件系统设计参考（维持）。其余中低档项与维持原判清单见文档。

### 1.4bis 候补队列实施与再裁决（2026-09-25 第二批）

| 候补项 | 来源 | 终态 | 说明 |
|---|---|---|---|
| 命令替换递归删除强制询问 | cc 2.1.281 | ✅ 落地 | approval 域 hardAskOverride：rm -rf 目标含 $(...)/反引号 → allow 也不放行强制 ask（deny 仍最优先） |
| 记忆自动沉淀 v1 | mimo P4 二期 | ✅ patch 407 | 规则式 distill（去重/容量剪枝/报告）+action=consolidate；LLM 摘要列 v2；7d/30d 经既有 cron 运维面 |
| HTTP Retry-After 遵从 | codex 9d8de19 | 🧬 原生已有 | retry_utils.parse_retry_after_seconds 双形态（数值/HTTP-日期/头映射双大小写）+外层会话循环遵从（agent_runtime_helpers:1891 注释自证） |
| 动态 Bash 工具契约 | minimax 61c4c31 | 🧬 原生已有（更深） | _WINDOWS_BASH_SHELL_HINT 全套陷阱块（MSYS 路径/PowerShell 内建禁用/PTY CR 语义）+远端 OS 探测（Windows x64 轮实战沉淀）；schema 级动态裁剪通道在 zcode turn 工具面（toolDisallowlist） |
| E2E 全链四跳 | — | ✅ 实证 | /zcode socket 认证接入+REST 词表回执+事件房间投递+冷运行时 existing-only 正确拒绝；附真缺陷修复（onAgentRuntimeRestarted 真签名直收监听器 zcodeAgentService:5615；IdeStatusBar socket 生命周期接线） |

剩余候补终态处置（第三批，2026-09-25）：
- **per-model 工具描述/参数覆盖** ✅ 落地 patch 408（config 声明式/通配匹配/坏 schema 回退；_load_tools 接线；守门 5 例；switch_model 热切换列 v2）。
- **流式元数据选择性裁剪** ✅ patch 409（"最大优先装下即停"次序化+超溢量目标）+patch 475 余半项（分级牺牲优先级表：可再生只读工具 tier0 先牺牲/同级大小降序；shed_bytes 指标 demoted·shed_bytes·target·met_target；守门 5 例）。
- **长会话已验证前缀复用** ✅ 设计轮层 1 已落=2026-09-26-prefix-reuse-design.md（链式指纹+增量校验+回退语义）+prefix-reuse.ts 数据面（4 守门）；层 2/3（hermes_state 指纹链接线/请求链路）随真实长会话分轮推进。
- **multica steering 语义** 🧬 已裁决原生（delegate action steer/stop）。
- **kimi 视频输入链路** ✅ 通道成本已裁决（2026-09-26 用户拍板完成剩余）+实施层 1=video-ref.ts（间接引用红线/能力三解析/20MB 降级链/物化幂等）；层 2（抽帧引擎接线）随首个真实录屏投喂需求推进。

至此候补队列每项均有终态处置：落地（补丁号）/原生已有（实证锚点）/排队（量化理由）/条件启动（触发条件）。

### 1.5 已知事项（E2E 实测，非缺陷即如实记录）

1. **createSession 索引可见性**：经桥 createSession 的新会话不即时出现在 sessions-index initial 快照（E2E 双桶探测证据）；索引归属 host 会话注册表面（zcode session 表 workspace_id 语义，`rememberSessionTrace` 注册链）。待 /ide UI 会话链实测核验。
2. **workspace 键规范**：/tmp↔/private/tmp（macOS 符号链）为不同 runtime 键；调用方须传 realpath。
3. **ts-node 严格面**：vitest/esbuild 不全量类型检查，服务端改动须 `npm run serve` 真启动验证（R3 教训本轮回环重演，收口记录）。

## 2. 第二批架构级五项裁决（放行/否决逐项）

总纲 §1.2 原文五项"需先行设计后单独裁决"。裁决依据：zcode 底座四层复用地图（§1.1）+ 本实现轮各批实证。

| 项 | 来源 | 裁决 | 理由 |
|---|---|---|---|
| ①ThreadItem 服务端投影+协议宏表治理 | codex | **❌ 不吸收** | ThreadItem 是 codex 协议内部数据模型；zcode v4 的 sessions-index/conversation topic 投影（398 实证）已覆盖同类需求，架构位不同。协议宏表治理只在 codex 协议面成立。 |
| ②function-hooks 插件 API 契约形态 | claude-code | **📄 概念留档** | 专有许可（红线：只搬概念）。zcode contracts 已含 hook 事件词汇（75 事件）+hermes plugin 体系并存，基础面已覆盖；待 Ycode 插件体系立项时以其契约形态作设计参考。 |
| ③everything-is-a-plugin 内核 | dsh | **❌ 不吸收** | 与 zcode port/deps 注入面（AgentRuntime 构造注入，`agent-runtime.ts:228-308`）哲学冲突；zcode 扩展模型（contracts port 面）已覆盖全部扩展点。整内核插件化吸收成本极高、收益与 port 面重叠。 |
| ④视频/媒体间接引用链路 | kimi | ✅ 层 1 已落 | 通道裁决：base64❌/原生视频（可遇）/抽帧图片化主通道✅/转写兜底；video-ref.ts 间接引用+物化幂等+20MB 降级链（>10MB 帧减半/>16MB 再降分辨率/>20MB 拒）；层 2 抽帧引擎随真实录屏需求接线。 |
| ⑤事件日志会话存储 | dsh | **❌ 不吸收** | zcode 底座已有 sqlite 会话库+75 事件词汇+v4 投影（总纲 §1.3 可观测列评"强"）；dsh 事件日志是另一套存储哲学，替换收益为负、迁移风险为正。 |

**收口结论**：第二批五项——两项不吸收（架构位冲突/收益重叠）、一项概念留档（许可红线）、一项排队（条件启动）、一项不吸收（存储哲学冲突）。无放行实施项，架构级吸收面就此闭合；唯 ④ 视频输入链路保留启动条件（台账钦点），到条件即立独立设计轮。

## 3. 第五批：全量审计补账（2026-09-25 三向审计：漏 122+/错 5/重 7 → 逐项处置）

审计根因：本矩阵此前实为"foundation 第一批+mimo+候补队列"增量合集，**非 12 份分析文档的全量投影**——antigravity/qoder/codex-product 三仓整缺席，十仓散点约 100 项无档，zcode §七 39 项底座差距清单未对账。本节补齐全部处置。

处置词：✅已落地（补丁号）｜🧬原生已有（锚点）｜📦旧账待迁（旧 /ide 轮已落，Ycode 切底座后需随迁）｜🔜排队（P0/P1/P2）｜❌不吸收（理由）。

### 3.1 antigravity（13 项，此前整仓缺席）

| 项 | 处置 |
|---|---|
| A1 证据型工件挂任务里程碑（截图/录制/diff 卡） | ✅ evidence 域合并落（evidence-store kind=artifact+milestone 挂载+changedFilesByTurn 分组投影，patch 413 台账） |
| A2 计划工件评审化（行内评论+Proceed/Review） | 📦旧账已落（IdePlanFloat，R3）·待随迁 |
| A3 任务组语义 | ✅ task-groups.ts（edited-files 清单/待批步骤专区/组汇总） |
| A4 浏览器安全层 | ✅ browser-security.ts（deny 优先/白名单/独立 profile） |
| A5 浏览器回路 | ✅ browser-loop.ts（截图-动作-录制严格回路/录制回流计数） |
| A6 会话内模型切换器（粘性+推理档+余量双仪表） | 📦旧账已落（IdeModelSwitcher，R4）·待随迁 |
| A7 任务形态 slash 命令语义 | ✅ hermes slash 面+command-as-task.ts（任务模板派生/槽位填充/门禁随行/纯命令不派生） |
| A8 /learn 沉淀闭环 | ✅ learn-distill.ts（三归宿判定/流程化优先） |
| A9 MCP 目录化 | ✅ mcp-catalog.ts（工具级禁用/Store 装机/可用工具扣减） |
| A10 /boost 管线 | ✅ boost-pipeline.ts（断言回灌/一致数胜出/多数一致 verified） |
| A11 Terminal OS 级沙箱/语音/定时视图 | 沙箱❌不吸收（超范围）；语音转写✅ speech-transcribe.ts（低置信标注/质量三档）；定时编辑视图✅ 并入 autosched |
| A12 Manager 聚合视图 | ✅ manager-hub.ts（驾驶视图排序/working-idle/要人总数） |
| A13 Knowledge 代理检索/贡献闭环 | ✅ 判定面 knowledge-loop.ts（通用性准入/检索命中才入选）；semantica 存储迁移仍排队（§1.3 手册#2） |
| 补记：子代理目录 UI+状态机 | 📦旧账（IdeSubagentsFloat）·待随迁（并入 #10） |

### 3.2 qoder（16 项，此前整仓缺席）

| 项 | 处置 |
|---|---|
| Q1 Repo Wiki 生成闭环 | 📦旧账已落（wikiPipeline，R5）·待随迁 |
| Q2 规则体系四型作用域 | ✅ rules-scope.ts（always/model-decides/at-manual/glob 四型+global/project 两级合并） |
| Q3 输入框 / 触发体系 | ✅ slash 已备+统一入口=cmdmeta 三元组+ide 命令面板（command-palette 守门） |
| Q4 任务级 Worktree 选择 | 🧬原生（delegate worktree+loop WorktreeManager）·补记 |
| 自动化（定时/时区/到期/无人值守） | ✅ automation-schedule.ts（到期自停/授权双门/时区日分组） |
| 工作台体检（五维） | ✅ harness-health.ts（五维评分/优化卡/损坏降级） |
| Q7 会话手动压缩入口 | 🧬原生（hermes /compact+微压缩）·补记 |
| 代码安全三档扫描 | ✅ code-security.ts（静态/语义/数据流按风险选档/发现分级） |
| Q9 白板回路 | ✅ whiteboard-loop.ts（Agent 生成/圈选标注回传/区域校验） |
| Auto 模型路由 | ✅ model-routing.ts（三档成本/low~max 思考强度） |
| Q11 Hooks 生命周期配置界面 | ✅ 旧账只读面板（R4）+hooks-write.ts 写档面（upsert/启停/重排/七事件词表 d.ts:402） |
| Q12 任务分支（回复 fork） | ✅ session-fork.ts（分叉点 atIndex/谱系 parent·forkPoint/树投影 childrenOf·rootOf/越界拒） |
| Q13 扩展市场入口 | ✅ extension-market.ts（安装态三档/版本检测/入口可见性） |
| 记忆全局/项目两级分治 | ✅ memory-scope.ts（开关/清空/文件数下限/汇总） |
| Q15 MCP 超时设置 | ✅ mcp-config.ts per-server timeoutMs（kimi 超时指引+Q15/X8 同物合并，[1,600000] 归一）；白黑名单=mcpcatalog 工具级禁用 |
| Goal 自主到底档 | ✅ goal-autonomy.ts（三档停点/majorFork 例外/不可达与预算同停） |

### 3.3 kimi（12 项散点）

| 项 | 处置 |
|---|---|
| /mcp-config 余项（scope 三选一/超时指引/needs-auth 闭环） | ✅ mcp-config.ts（scope project/global/session+timeoutMs 归一）+patch 459（needs-auth OAuth 合成工具，zcode P1-14 同项已覆盖） |
| coder 交接话术（final message=entire handoff） | ✅ handoff-script.ts（六段：done/notDone/risks/next/artifacts/verify+结构守门+渲染） |
| 会话 fork+undo 选择器 | ✅ fork=session-fork.ts（与 Q12 合并项）；undo 选择器=file-history.ts 双相快照回读（#5 恢复域） |
| agent profile 五级来源+watch 热重载 | ✅ 404 配置层+458 watch 热重载 patch |
| AGENTS.md 装载链细节 | 🧬原生主面（prompt_builder context files 注入+防注入防护）；32KB 告警/防抖 watch 细节 ✅ agents-md.ts（32KB 告警+shouldEmit 防抖 300ms 窗口） |
| AgentSwarm 扇出 | ✅ swarm-fanout.ts（批量分解/并发限流/排队计数）；/btw 侧问随 UI |
| fileHistory 回合级双相快照 | ✅ file-history.ts（before/after 双相/单文件回读/diff 三态；#5 恢复域数据面） |
| goal 三预算字段 | 并入 §3.9 goal 域 |
| kimi Ctrl-B detach | ✅ shell-detach.ts（前台转后台/PTY 提示） |
| 状态栏可定制 | ✅ statusline-config.ts（四源合并：6 槽/整行替换/custom 探针） |
| 会话全文搜索 | ✅ 原生 session_search FTS5+工作台入口（cockpit store sessionSearch 缓存面） |
| headless -p stream-json | 🧬原生（zcode R1 实证）·补记 |

### 3.4 minimax-code（11 项散点）

| 项 | 处置 |
|---|---|
| /context 六段构成可视化 | ✅ 403 三投影+context-six-source.ts 六源网格（四段→六源映射+isEstimate 诚实标注+fromSpans 升级面） |
| ask_user 结构化问卷契约 | ✅ ask-contract.ts（1-4 步×2-4 选项×recommended≤1×带图；一次定音；挂载 455） |
| Plan Mode 三件套 | ✅ plan-mode.ts（agent 主动进入/确认门/auto 免打扰档/执行流转；评审面板=IdePlanFloat 数据面） |
| MCP tool_search 渐进披露 | 🧬原生已有（tools/tool_search.py：threshold_pct 0-100+listing_max_tokens 双预算 min() 控制；topK 条数限制被 token 预算覆盖更细）——再裁决（2026-09-25 核查） |
| 运行中 queue+GOAL-05 让位 | ✅ goal-preemption.ts（用户消息>自治目标/让位 yielded/让位点续跑/goal 不抢位）+steer 半边🧬原生 |
| compact 阈值策略校准 | ✅ compact-threshold.ts（reserve=输出预算+5% 余量/90% 线/under·soon·now 三级） |
| 状态栏 custom-command | 并入四源状态栏合并（kimi 行） |
| agent-team 汇总条/投影窗口 | ✅ team-summary-bar.ts（五态计数/健康色红黄绿/零值段省略）；投影窗口并入 projection-socket task 房间 |
| 会话搜索/归档（两轴筛选） | ✅ session-archive.ts（Recent/Archived×workspace/all+子串搜索；重命名随 UI） |
| 命令面板元数据模型 | ✅ command-meta.ts（category×discoverability×visibleWhen 三元组过滤/分组） |
| 草稿恢复（2MiB 原子写） | ✅ draft-store.ts（2MiB 拒存/原子写 rename/恢复清稿） |

### 3.5 multica（12 项散点）

| 项 | 处置 |
|---|---|
| squad leader 协调协议（评估必录+dispatch 即停） | ✅ squad-coordinator.ts（评估必录拒空 rationale/dispatch 即停拒叠加/三态闭环）+#7 mention 派单半边（驾驶舱协作主线） |
| inbox 三档 severity×归档双轴 | ✅ patch 418（三档/双轴四象限/双收件人/正文截 200/批量操作） |
| 分派预演 WillEnqueueRun | ✅ dispatch-preview.ts（写读共用谓词 willEnqueueRun：暂停/重复/并发上限/去重键四因子）+#7 派单链 |
| 会话续接 resume-unsafe 分档 | ✅ resume-safety.ts（黑名单优先/new_session/safe_retry/backoff 指数退避封顶）；work_dir 继承随 delegate 域后续 |
| 在场两维（availability×workload） | ✅ presence-two-axis.ts（圆点+芯片分画/30s-90s 心跳三档/在线闲与离线忙可分） |
| execution log 每 run 一行+费用列 | ✅ run-log.ts（一行一 run：结论三态/耗时/命令截断/费用列/倒序筛选） |
| 分布式 cron 锁表 | ❌单机形态不适用（多机形态再启） |
| runtime brief 前缀稳定缓存 | ✅ brief-cache.ts（稳定前缀/词边界回退/链收益统计） |
| 共享目录并发警告块 | ✅ workdir-adjacency.ts（并发>1 警告/chat 共享警示块/互斥锁归调度层） |
| WS 房间细化到 task 级 | ✅ projection-socket.ts subscribe-task 归属闸+task 房间扇出（multica §五） |
| PR 交付链提示词规约 | ✅ pr-delivery.ts（--base 显式/分支规约/验据锚点/交付边界提示词） |
| 看板组织面 | ✅ board-organize.ts（四视图投影/五档/acceptance 准备度/父子缩进） |

### 3.6 routa（14 项散点）

| 项 | 处置 |
|---|---|
| 列级 automation steps 编排 | ✅ automation-steps.ts 编排半边（列绑定 steps/门禁前置/fail-fast·continue 策略/skip≠失败）+399 门禁半边 |
| 每 board 并发闸+事件驱动 drain | ✅ patch 419（board_concurrency 默认 1/超限排队/同 tick 计数/默认板有闸）；事件驱动 drain 随 loop 域扩 |
| 任务=证据累积对象（laneSessions/交付快照/裁决） | ✅ evidence 域全落：交付快照/裁决（evidence-store delivery_snapshot·verification）+A1 工件+lane 履历（lane-timeline.ts 时序/小结） |
| 结果回收三兜底 | 🧬原生已有（再裁决 2026-09-25）：hermes delegate 同步 join=结果必回强于旁路兜底；_fabricated_entry 超时断连兜底=auto-report 语义；background 结果轮间回注=wakeParent；session-end finally=清理兜底 |
| agent→coordinator 权限升级（urgency 三档） | ✅ urgency-escalation.ts（low=queue/normal=inbox-first/critical=preempt 打断+升级必录理由，衔接 402+456） |
| dev 列 watchdog+监督模式 | ✅ runaway_supervisor.py（watchdog_retry/ralph_loop 判定面+有界恢复转人工；patch 457；执行钩子后续） |
| 执行租约+runner 反代 | ❌单机不适用（多机再启；A2A 依赖它同缓） |
| 共享会话四档模式+prompt 审批 | ✅ 服务端 R6 三端点+客户端入口=IdeShareEntry.vue（view 档创建+链接展示+剪贴板；守门 2 例）——客户端半边收官 |
| 会话连续性四态徽标 | ✅ session-continuity.ts（active/interrupted/restorable/stale 7 天线，routa 语义） |
| 泳道专家提示词资产 11 份 | ✅ runtime/roster/lane-specialists/（MIT 附出处原样搬运+README 升级纪律） |
| Worker 抽象 | ✅ worker-abstraction.ts（五态心跳状态机/capability 路由/三环境） |
| A2A 出站/入站协议 | ✅ a2a-protocol.ts（Agent Card 校验/终态判定/externalTaskId 映射） |
| Yjs CRDT 共写笔记 | ✅ crdt-notes.ts（Yjs 轻量语义：段落 LWW/决胜规则/归因；引擎后可替换） |
| 名册树视图 | ✅ roster-tree.ts（lead 聚合/delegates/descendants 子树和/降序） |

### 3.7 claude-code（13 项散点；专有许可只搬概念）

| 项 | 处置 |
|---|---|
| 会话 recap（离开后发生了什么） | ✅ patch 410 recap v1（cc/codex/dsh 三源合并域：重派开局带 checkpoint 上次进展；衔接 405 写手） |
| 子代理结果来源标头防冒充 | ✅ patch 410 agent-source-marks（代码侧不可伪造标记/子文本同款中性化/单点生成） |
| 通知补耗时/模型 | 📦旧账已含（R4 活动收件箱）·待随迁 |
| 计划模板（feature-dev 范式） | ✅ runtime/roster/prompts/plan-template.md（cc 概念自研重写：阶段+门禁+关键文件清单；红线合规） |
| 评审/验证轮编排模板 | ✅ review-template.md（高信号纪律+独立验证轮自研；实件 /review 已落 patch 414） |
| 技能入口（skills=commands 合并口径） | ✅ 🧬原生 skills 面+工作台 UI 入口=IdeMcpPane 技能 tab（hermes-skills.ts 取数+ledger 投影+patch 476 词条，UI 批首件落地） |
| 权限模式 7 档语义+切换 UI | ✅ permission-modes.ts 七档语义（cc d.ts:6046 六档+readonly/放行面/三档映射）+402 决策态；切换 UI 随 UI 批 |
| 任务依赖 dependsOn | 🧬原生（kanban 父子依赖+claim 重检）·补记 |
| cc：缓存 miss 归因 | ✅ cache-attribution.ts（归因优先序/命中率三档/建议文案） |
| cc：/btw 侧问 | ✅ btw-sidebar.ts（三态/合并回注/不改主方向） |
| @提及六源（file/session） | ✅ mention-resolution.ts（六源 file/session/skill/plugin/subagent/whiteboard+派单 agent/squad 同解析口径，client/ide/utils） |
| auto memory 四类型+新鲜度 | ✅ memory-taxonomy.ts（四类型归档/7-30 天三档/stale 降权/fact 锚点） |
| security-guidance 双层 | ✅ security-guidance.ts（同步拦/异步复查/放行三态） |

### 3.8 codex（11 项）+ codex-product（7 项，整份此前缺席）+ deepseek-harness（7 项）+ dsh-TUI（6 项）

| 项 | 处置 |
|---|---|
| codex：渲染分项开关（mermaid/math/tables 回退源码）+dsh mermaid 渲染策略 | ✅ render-options.ts + mermaid-render.ts（开关降级/渲染败降级 SVG/摘要） |
| codex：计划三选一门 | 📦旧账已落（IdePlanFloat R3）·待随迁 |
| codex：turn notify 外呼钩子 | ✅ turn-notify.ts（占位替换/off 关/触发台账） |
| codex：token-budget 换窗决策 | ✅ window-shift.ts（shift/prune/compact 三策略；critical 事实强制 compact） |
| codex：(model,effort) 成本分组+日桶 | ✅ thread-usage.ts（分组降序/日桶升序/衔接 rounds-table/usage-ledger） |
| codex：config 8 层叠加+per-key origins | ✅ config-layers.ts（覆盖序/来源追踪/debug 视图） |
| codex：web_search 四档+域收敛 | ✅ web-search-policy.ts（off/light/full/agent/交集收敛/子域准入） |
| codex：keymap 可重映射 | ✅ keymap.ts（override 覆盖/一键双绑冲突检测） |
| codex：会话内分节 | ✅ session-sections.ts（定义幂等/手动 move/汇总） |
| codex-product：/review 评审模式（两域+行内回流） | ✅ patch 414（review-store 两域/评论 open→resolved 回流/三裁决一次定音+evidence verification 联动） |
| codex-product：任务结果卡（验证 bullet+文件±行数+逐文件 Undo） | ✅ result-card.ts 前两半+file-undo.ts 逐文件 Undo（三态/回写计划，#5 恢复域 file-history 衔接） |
| codex-product：Activity 收件箱三态+OS 通知 | 📦旧账已落（R4）·待随迁 |
| codex-product：终端 actions（项目级一键命令） | 📦旧账已落（R4）·待随迁 |
| codex-product：文件/选区引用入会话 | ✅ 文件=mention-resolution file 源；选区=selection-ref.ts（@file:L 区间/校验/引用卡） |
| codex-product：webhook 事件触发 | ✅ loop/connectors/webhook-connector.ts（事件触发已有接线面） |
| codex-product：AGENTS.md /init | ✅ agents-md.ts initTemplate（目标/构建与验证/约定/红线四段骨架） |
| dsh：低上下文主动提醒（20k 余量 toast+迟滞） | ✅原生已落（IdeStatusBar lowNotified+迟滞，R1 代码实证）·补记 |
| dsh：会话成本估算（价目表三原则） | ✅ tokens/pricing.ts（自建价目表）+usage-ledger.ts 用量台账 |
| 工作区分组管理 | ✅ workspace-groups.ts（登记幂等/pin 置顶/清单汇总） |
| dsh：/recap+tips | 并入 recap 域（cc 行） |
| dsh：trajectory hotspot 聚合（按工具/阶段排名 own-duration） | ✅ trajectory-hotspot.ts（工具/阶段降序排名/防重复计数/衔接 timing） |
| dsh：per-turn changed-files 卡（deepseek-harness） | ✅ changed-files-card.ts（一轮一卡/行数账/折叠 +N more）；任务结果卡=present 交付物原生已有 |
| dsh：轮导航 rail（TurnNavigator） | ✅ turn-outline.ts（三源行：轮轮廓/跳转） |
| dsh：present 交付物工具+交付卡 | ✅ 🧬原生 present 交付物+result-card.ts 交付卡（验证 bullet/文件±行数） |
| dsh：compaction 留痕卡+/compact | ✅ compaction-trace.ts 留痕卡+400 compact 六段 |
| dsh：RunTrace 时序图 | ✅ run-trace-adapter.ts+run-trace-timing.ts（T6 同物） |
| dsh：Office 三件套预览 | 🧬原生（hermes read_file Office 抽取链）·补记 |
| dsh：权限预设三档捆绑 | ✅ permission-presets.ts（readonly/standard/full-auto 放行面+审批面+升级单调性） |

### 3.9 跨仓域合并裁决（D5/D6/D7 消解）

- **goal 域（八源归一）**：mimo P6/kimi/minimax/dsh/cc/codex/codex-product/zcode G5——裁决中心=goal 域以 hermes 原生 goals.py 为基座（每轮裁判+GoalGate+预算字段已有），**增量吸收统一立项**：goal 三预算字段显式化✅ goal-budget.ts（steps/tokens/wallclock 独立触顶）、Quest"自主到底"档语义✅ goal-autonomy.ts（三档停点）。八源不再各自立项。
- **steering/queue 域（七源归一）**：steer 半边🧬原生已裁决（delegate action steer/stop）；**queue 让位半边✅ goal-preemption.ts**（minimax GOAL-05：用户消息>自治目标）。七源归此两行。
- **命名空间消歧（D7）**："恢复点 restore-point"（#5 四恢复选项+kimi fork+qoder Q12+cc 逐文件 Undo+fileHistory——统一恢复域）vs"检查点摘要 checkpoint-writer"（P7 五节写手）。后续立项一律用此二名。
- **状态栏定制域**：kimi/minimax/codex/dsh 四源→单行✅ statusline-config.ts（6 槽/整行替换/custom 探针）。
- **recap 域**：cc/codex/dsh 三源→单行✅ patch 410 recap v1。
- **E4 补正**：认领四围栏中 runtime 新鲜度围栏=respawn guard+profile 可用性闸部分等价（实证）；wakeup 修订号围栏=❌单机无 wakeup 机制不适用。四围栏裁决理由补全。

### 3.10 zcode §七 39 项底座差距清单对账（✅核验批已闭 2026-09-25 三向核验）

zcode 为底座本体：其差距清单的多数项随底座原生消解或由 R3+ 工作消费。逐项核验为独立核验轮（**列 🔜P1 核验批**，非实现批）；已可裁决的先行（~~当时排 P1~~ **2026-09-25 终态：全部落地，详见 §3.10 行 282**）：G4 六源网格✅/G8 rounds 表✅/P0-3 技能入口✅/P0-5 Workflow run-line✅/P1-12 turnSteer🧬原生/P1-14 needs-auth✅459/P1-10 轮导航✅turn-outline.ts；其余 ~24 项进核验批清单（含 @六源/任务六态/插件 MVP/MCP 导入同步/自定义命令/富文本输入/Claude 历史导入/G7 面板等）。

#### 核验批终态表（A=upstream/zcode 底座源码 / B=series 390-459 / C=custom 域模块三向核验）

**四类统计（39 项）**：底座已有 22（#2,11-20,23-32,36）｜已覆盖 4（#4 git checkpoint=403/checkpoint-options、#10 轮导航=turn-outline.ts、#21 needs-auth=459、#38 价目表=pricing.ts）｜待排期 8（#1 G8 rounds 表/#3 技能工作台入口/#5 Workflow 可视化 MVP/#6 G4 六源网格扩展/#7 G5 三预算显式化/#8 G7 用量面板升级/#9 @提及 ChatInput 域合并/#22 Claude 历史导入改造）｜不适用 5（#33 自动更新/#34 反馈中心/#35 Onboarding/#37 桌面能力/#39 CUA——依赖 Electron 分发/自家后端/zcode-cua 占位）。

**核验备注**：
1. "多数项随底座原生消解"获证实：22 底座已有+4 已覆盖=26/39（67%）已闭合；8 待排期中 6 项（1/3/5/6/7/8）底座契约/参考实现现成（zcode DeveloperToolsPane/SkillsSection/TaskWorkflowRunLines/task-types/UsageStatsSection/mentions 六源均有锚点），从零新做仅 #22（codex/kimi 导入器改造）与 #9 半边（ChatInput 接线）。
2. 矩阵预裁 2 处升档已覆盖（#21 needs-auth=patch 459 收口、#10 轮导航=P1 批落地）。
3. #30 OffPeak 原 × 理由（无计费体系）随底座 coding-plan-subscription 消解改判底座已有；#36 三通道字段齐备留 P2 产品择机；33/37 若转 Electron 分发随 packages/desktop 重启评估。
4. 待排期 8 项建议落点：#1→IdeRoundsPane；#3→IdeMcpPane 技能 tab；#5→loop run-line 接线；#6→contextBreakdown 六源网格；~~#7→IdeGoalBudgetFloat 三预算字段~~（✅goal-budget.ts）；~~#6→contextBreakdown 六源网格~~（✅context-six-source.ts）；~~#1→IdeRoundsPane~~（✅rounds-table.ts）；~~#8~~（✅usage-ledger.ts）；~~#5~~（✅workflow-run-line.ts）；~~#3 技能入口~~（✅skills-ledger.ts）；~~#9~~（✅mention-resolution.ts）；~~#22 导入器换源~~（✅session-importer.ts：codex/kimi/claude 三源→统一行适配面，坏行计数不丢全会话）。**✅核验批待排期 8 项全部落地**（G5 三预算/G4 六源网格/G8 rounds 表/G7 用量台账/run-line 技能清单/@域合并/导入器换源）——**zcode §七 39 项对账全闭**。

### 3.11 补账批统计

- 漏：122+ 项全部入档处置完毕（✅2 补记/🧬9 补记/📦9 旧账待迁/🔜100 排队（P0≈10·合并后/P1≈20/P2≈70）/❌3）；zcode §七 39 项→核验批 P1。
- 错：E1-E5 全部修正（证据源声明/409 状态回改/E4 补正/E5 锚点见 #4 行已含 minimax+codex 合并批原文）。
- 重：D1-D7 全部消解（收敛回改 4 处+域合并 5 组+命名空间 1 组）。
- **下一实施批（按优先级）**：~~P0 十项~~ **P0 已落 10/10**（终账：410 recap+来源标头/pricing.ts 价目表/squad-protocol.ts/patch 413 证据台账/result-card.ts 结果卡/patch 414 评审域/patch 415 列编排+执行半环）→ ~~旧账随迁批~~ **随迁核验已闭（2026-09-25 浏览器实证）**：8/9 组件实证接线（IdePlanFloat/IdeModelSwitcher/Wiki W tab/活动收件箱🔔/终端 actions 面板内/IdeSubagentsFloat/hooks⚓/低水位 toast 原生✅）；1 件 session-share 服务端路由已接（R6 patch）客户端入口待活跃会话态核验 → P1 批（已落 8+原生再裁 1：预演+交接话术 416+inbox 418+board 闸 419+ask 455+权限升级 456+GOAL-05 队列+监督模式 457；tool_search 原生）→ P1 已落 13（+轮导航 rail 投影）+原生再裁 4（present 交付物/任务依赖/技能入口/AGENTS.md 装载主面）→ P1 已落 14（+compaction 留痕卡投影）→ **P1 队列收官（17 落地+4 原生再裁=全项处置完毕）**——最后一项 kimi /mcp-config 余项=mcpconfig 域（scope 三选一/timeout 有界/needs-auth 闭环，patch 459）。**下一批=核验批**（zcode §七 39 项逐项核验）。

### 3.14 UI 融合批（2026-09-26 用户拍板"开工"，origin=d38429a）

完成标准=浏览器可感知。**真完成 6 件**（每件=组件+数据接线+守门+vite 编译实证）：

1. **轮导航 rail**（IdeTurnRail）：消息流右缘轮序条，悬停显锚点/步数/工具数，点击经 chatStore.focusMessageId 走 MessageList 既有滚动链；2 守门。
2. **team 汇总条**（IdeTeamSummaryBar）：子代理浮窗顶条，subagentStreams 六态映射+健康色红黄绿+stale（5 分钟无更新）判定；2 守门。
3. **run 逐文件 Undo**（run-undo 控制器+patch 482）：workspace_run_change_files 库内 patch 真反向应用（git apply -R），added 反向删/deleted 反向重建/无 patch 422；run 卡文件行 ⎌ 按钮；3 守门含真恢复用例。
4. **交接卡**（IdeHandoffCard）：末条 assistant 消息过 handoff 六段校验即浮结构化交接卡（跨树引用 server 域 validateHandoff——注入同树相对 import 实证可行）；2 守门。
5. **状态栏槽位定制**（IdeStatusBar ⚙）：显隐+CSS order 排序+localStorage 持久化；2 守门。
6. **G8 逐轮表费用/耗时列**（patch 481）：estimateCostUsd 逐行折算，未收录显 —（dsh 三原则）。

**记档 4 件（依赖如实）**：compaction 消息流内嵌卡（缺服务端压缩事件下发链）；权限七档切换器（真生效依赖 zcode 引擎配置写穿=层 2，不做存储摆设件）；会话 fork 入口（服务端会话复制端点缺，MessageList 仅渲染分界）；IDE 内嵌看板四视图（cockpit 侧看板已全，IDE 内嵌列下批）。

- 坑：**共享树并行操作抹掉三个文件的挂载接线**（组件在 main、接线丢——commit 后 grep 复核制度确立：组件+挂载必须同一 commit 且提交后核对接线在档）。

### 3.13 独立模型配置（2026-09-26 用户指令）

用户指令：IDE 工作台编程工具（zcode 底座）的模型配置（功能同 zcode）与 hermes agent 的模型**独立设置**。层 1 已落（origin=c671bcb，2887/2887 终验绿）：

- **enginemodels 域**：providers（id/baseURL/apiKeyEnv——只存环境变量名不存凭据）×models（id+推理档）+默认模型；唯一性/可达性校验+隔离断言（与 hermes config 源零交集）。
- **REST**：`/api/ide/engine-models` GET/PUT（runtime/ide-engine-models.json 独立存储+原子写），patch 477 挂载（356 session-share 同款两行）。
- **客户端**：IdeModelSwitcher 数据源切换——**独立目录优先，空/失败回落 appStore.modelGroups**（未配置前不空白）；engine-models.ts 取数 util。
- **附带根治**：AssignEventContent 严格面欠账（421-453 批遗留 TS2345）经接口加索引签名根治；engine-model-config 笔误（p.modelId→m.modelId）修正。
- **层 2 排队**：写穿 ~/.zcode/v2 引擎配置（zcode 运行时格式探明后独立轮）——当前引擎消费侧仍读自有配置，本层先把 IDE 侧目录独立。

### 3.12 P2 批收官（2026-09-25 终态）

P2 批全队列实施完毕（**实现类清零**），20 件落地（每件=纯函数域模块+守门测试+合 main+推 origin）：

1. rulesscope 规则四型作用域（always/model-decides/at-manual/glob+两级合并）
2. runlog 执行日志每 run 一行（结论三态/费用列/倒序筛选）
3. permpresets 权限预设三档（放行面/审批面/升级单调性）
4. changedfiles 每轮改动文件卡（行数账/+N more 折叠）
5. teamsummary agent-team 汇总条（五态计数/健康色红黄绿）
6. compactthreshold compact 阈值校准（reserve=输出预算+5%/90% 线/三级）
7. sessionfork 会话 fork（分叉点/谱系/树投影/越界拒）
8. goalbudget goal 三预算显式化（steps/tokens/wallclock 独立触顶）
9. handoff coder 交接话术六段（final message=entire handoff+结构守门）
10. permmodes 权限模式七档（cc d.ts:6046 六档+readonly/三档映射）
11. commandtask slash 命令任务形态派生（槽位/门禁随行）
12. agentsmd AGENTS.md 域（/init 四段模板+32KB 告警+防抖 watch）
13. hookswrite Q11 Hooks 写档面（upsert/启停/重排/七事件词表）
14. selection-ref 选区引用入会话（@file:L 区间/校验/引用卡）
15. lane-timeline 泳道履历时间线（行 197 lane 半边）
16. file-undo 逐文件 Undo（行 242，三态/回写计划）
17. squad-coordinator squad 协调协议（评估必录/dispatch 即停，行 178 P0）
18. automation-steps 列级编排（行 195 P0，门禁前置/失败策略/skip≠失败）
19. goal-preemption GOAL-05 让位（行 166，用户消息>自治目标）
20. dispatch-preview WillEnqueueRun 预演（行 180，写读共用谓词）
21. urgency-escalation urgency 三档升级（行 199，queue/inbox-first/preempt）

另批：十行回写核验批已落件（turn-outline/pricing/usage-ledger/compaction-trace/run-trace/
skills-ledger/workflow-run-line/mention-resolution/context-six-source/present 原生）——
此前只进 §3.10 总账未落明细行，本轮对齐。

**实现类终态**：P0=10/10+4（178/195/197/242 四行 P0 收编）｜P1 实现批清零｜P2 实现批清零。
残余 🔜 全部为裁决性项（非实现缺口）：长会话前缀复用（独立设计轮）/minimax 两候选+四候选（排队后续吸收轮）/kimi 视频链路（条件启动，台账钦点条件到才立项）/技能入口 UI（随 UI 批）。
