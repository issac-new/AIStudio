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
| P4 记忆 FTS | ✅ 一期 406+二期 v1 407 | 一期 FTS 索引视图+reconcile；二期 v1 规则式 distill 已落（§1.4bis）；LLM 摘要 v2 排队 |
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
| minimax | Turn 级动态 Bash 工具契约（schema 随运行时裁剪+shell 感知提示，61c4c31）；长会话已验证前缀复用 | 🔜 两候选 |
| kimi | trust-boundary 加固回滚（929403b6d 负信号：深度防恶意加固被撤回） | 📄 概念留档（加固边界停在信任提示前） |
| claude-code 2.1.281 | 恢复保形原则；命令替换递归删除强制询问（allow 规则不吞不可静态判定的破坏性命令） | 📄 概念留档（专有许可红线：只搬概念） |

### 1.4 codex 61 提交增量（15 新点，全文见 `docs/upstream-analysis/codex.md` 增量节）

高价值四候选：Retry-After 遵从（9d8de19）/TUI 选中即复制三档+终端检测矩阵（ab021e9）/per-model 工具描述覆盖族（4 提交）/流式元数据选择性裁剪（e7165c2）。扩展 API 双提交为插件系统设计参考。其余中低档项与维持原判清单见文档。全部 🔜 排队后续吸收轮。

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
- **流式元数据选择性裁剪** ✅ 半项落地 patch 409（"最大优先装下即停"次序化+proactive 超溢量目标；守门 3+回归 145 绿）；其余半项（分级牺牲优先级表/shed_bytes 指标）排队 P2。
- **长会话已验证前缀复用** 🔜 独立设计轮排队——涉 hermes_state 会话重放/持久层增量校验，架构级。
- **multica steering 语义** 🧬 已裁决原生（delegate action steer/stop）。
- **kimi 视频输入链路** 🔜 条件启动维持（台账钦点，条件到即立独立设计轮）。

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
| ④视频/媒体间接引用链路 | kimi | **🔜 排队（条件启动）** | 台账钦点能力（录屏投喂）；kimi-file:// 间接引用+会话物化+按模型能力解析+20MB 降级设计完整。条件：随 kimi 吸收表 #3/#4（视频输入链路+ReadMediaFile）立项一并设计，独立裁决其通道成本后再动。 |
| ⑤事件日志会话存储 | dsh | **❌ 不吸收** | zcode 底座已有 sqlite 会话库+75 事件词汇+v4 投影（总纲 §1.3 可观测列评"强"）；dsh 事件日志是另一套存储哲学，替换收益为负、迁移风险为正。 |

**收口结论**：第二批五项——两项不吸收（架构位冲突/收益重叠）、一项概念留档（许可红线）、一项排队（条件启动）、一项不吸收（存储哲学冲突）。无放行实施项，架构级吸收面就此闭合；唯 ④ 视频输入链路保留启动条件（台账钦点），到条件即立独立设计轮。

## 3. 第五批：全量审计补账（2026-09-25 三向审计：漏 122+/错 5/重 7 → 逐项处置）

审计根因：本矩阵此前实为"foundation 第一批+mimo+候补队列"增量合集，**非 12 份分析文档的全量投影**——antigravity/qoder/codex-product 三仓整缺席，十仓散点约 100 项无档，zcode §七 39 项底座差距清单未对账。本节补齐全部处置。

处置词：✅已落地（补丁号）｜🧬原生已有（锚点）｜📦旧账待迁（旧 /ide 轮已落，Ycode 切底座后需随迁）｜🔜排队（P0/P1/P2）｜❌不吸收（理由）。

### 3.1 antigravity（13 项，此前整仓缺席）

| 项 | 处置 |
|---|---|
| A1 证据型工件挂任务里程碑（截图/录制/diff 卡） | 🔜P1（与 routa"任务=证据累积"同域合并立项） |
| A2 计划工件评审化（行内评论+Proceed/Review） | 📦旧账已落（IdePlanFloat，R3）·待随迁 |
| A3 任务组语义（edited-files 清单+待批步骤专区） | 🔜P2 |
| A4 浏览器安全层（URL allow/deny+独立 profile） | 🔜P2（依赖浏览器工具面） |
| A5 代理驱动浏览器回路 | 🔜P2 |
| A6 会话内模型切换器（粘性+推理档+余量双仪表） | 📦旧账已落（IdeModelSwitcher，R4）·待随迁 |
| A7 任务形态 slash 命令语义 | 🧬部分（hermes slash 面已有）·余 🔜P2 |
| A8 /learn 沉淀闭环 | 🔜P2（衔接 P4 记忆域） |
| A9 MCP 目录化安装+工具级禁用 | 🔜P2 |
| A10 /boost 多代理推理管线 | 🔜P2 |
| A11 Terminal OS 级沙箱 | ❌不吸收（超 Ycode 范围）；定时任务编辑视图🔜P2 |
| A12 Manager 聚合视图+Inbox 异步通知 | 🧬驾驶舱同域已备·聚合 UI 🔜P2 |
| A13 Knowledge 代理检索/贡献闭环 | 🔜P2（依赖 semantica 迁移，§1.3 手册#2） |
| 补记：子代理目录 UI+状态机 | 📦旧账（IdeSubagentsFloat）·待随迁（并入 #10） |

### 3.2 qoder（16 项，此前整仓缺席）

| 项 | 处置 |
|---|---|
| Q1 Repo Wiki 生成闭环 | 📦旧账已落（wikiPipeline，R5）·待随迁 |
| Q2 规则体系四型作用域 | 🔜P1 |
| Q3 输入框 / 触发体系 | 🧬部分（slash 已备）·统一入口 🔜P2 |
| Q4 任务级 Worktree 选择 | 🧬原生（delegate worktree+loop WorktreeManager）·补记 |
| Q5 自动化（时区/到期日/无人值守授权） | 🧬大部分（hermes cron 域）·无人值守授权 🔜P2 |
| Q6 工作台体检五维报告 | 🔜P2 |
| Q7 会话手动压缩入口 | 🧬原生（hermes /compact+微压缩）·补记 |
| Q8 代码安全三档扫描 | 🔜P2 |
| Q9 白板 Agent 生成+圈选回传 | 🔜P2（旧账画板 undo 基础上扩） |
| Q10 Auto 模型路由+思考强度参数 | 🔜P2 |
| Q11 Hooks 生命周期配置界面 | 📦旧账已落（hooks 只读面板，R4）·写档面 🔜P2 |
| Q12 任务分支（回复 fork） | 🔜P2（与 kimi fork 合并立项） |
| Q13 扩展市场入口 | 🔜P2 |
| Q14 记忆全局/项目分治 | 🧬部分（memory/user 双 target）·项目级 🔜P2 |
| Q15 MCP 超时设置 | 🔜P2（与 codex X8 合并：per-server 白黑名单/审批档/超时 🔜P1） |
| Q16 Goal 自主到底档 | 并入 §3.9 goal 域合并裁决 |

### 3.3 kimi（12 项散点）

| 项 | 处置 |
|---|---|
| /mcp-config 余项（scope 三选一/超时指引/needs-auth 闭环） | 🔜P1（needs-auth OAuth 合成工具部分依赖 zcode P1-14 同项） |
| coder 交接话术（final message=entire handoff） | 🔜P1（纯提示词资产，衔接 400 compact 六段） |
| 会话 fork+undo 选择器 | 🔜P2（与 Q12 合并） |
| agent profile 五级来源+watch 热重载 | 🧬部分（404 配置层）·热重载 🔜P2 |
| AGENTS.md 装载链细节 | 🧬大部分（hermes 装载已有）·告警/防抖细节 🔜P2 |
| AgentSwarm 扇出+/btw 侧问 | 🧬delegate 批量已有·UI 🔜P2 |
| fileHistory 回合级快照 | 🔜P2（与 #5 恢复域合并） |
| goal 三预算字段 | 并入 §3.9 goal 域 |
| Ctrl-B detach shell | 🧬原生（terminal background+process_manage）·快捷键 🔜P2 |
| 状态栏可定制 | 🔜P2（**四源合并**：kimi/minimax/codex/dsh，含 custom-command 探针） |
| 会话全文搜索 | 🧬原生（session_search FTS5）·工作台入口 🔜P2 |
| headless -p stream-json | 🧬原生（zcode R1 实证）·补记 |

### 3.4 minimax-code（11 项散点）

| 项 | 处置 |
|---|---|
| /context 六段构成可视化 | 🧬部分（403 三投影）·六段网格扩展 🔜P1 |
| ask_user 结构化问卷契约 | 🔜P1（minimax+dsh 双源） |
| Plan Mode 三件套 | 🔜P1（R5 留档接续） |
| MCP tool_search 渐进披露 | 🔜P1 |
| 运行中 queue+GOAL-05 让位 | 🔜P1（steer 半边原生已裁；queue 让位半边无人认领——本行即认领） |
| compact 阈值策略校准 | 🔜P2（90% 线/reserve 公式对齐） |
| 状态栏 custom-command | 并入四源状态栏合并（kimi 行） |
| agent-team 汇总条/投影窗口 | 🔜P2 |
| 会话搜索/归档/重命名 | 🔜P2 |
| 命令面板元数据模型 | 🔜P2 |
| 草稿恢复（原子写） | 🔜P2 |

### 3.5 multica（12 项散点）

| 项 | 处置 |
|---|---|
| squad leader 协调协议（评估必录+dispatch 即停） | 🔜P0（驾驶舱协作主线；#7 只落了 mention 半边） |
| inbox 三档 severity×归档双轴 | 🔜P1（📦旧账活动收件箱关联） |
| 分派预演 WillEnqueueRun | 🔜P1（写读共用谓词，衔接 #7 派单链） |
| resume-unsafe 分档+work_dir 继承 | 🔜P2 |
| 在场两维（availability×workload） | 🔜P2 |
| execution log 每 run 一行+费用列 | 🧬RunTrace 已有骨架·费用列 🔜P2 |
| 分布式 cron 锁表 | ❌单机形态不适用（多机形态再启） |
| runtime brief 前缀稳定缓存 | 🔜P2 |
| 共享目录并发警告 | 🔜P2 |
| WS 房间细化到 task 级 | 🔜P2 |
| PR 交付链提示词规约 | 🔜P2 |
| 看板组织面（父子/五档/四视图） | 🧬kanban 父子已有·四视图 🔜P2 |

### 3.6 routa（14 项散点）

| 项 | 处置 |
|---|---|
| 列级 automation steps 编排 | 🔜P0（399 只落门禁半边，编排半边即本行） |
| 每 board 并发闸+事件驱动 drain | 🧬部分（per-profile cap）·board 级闸 🔜P1 |
| 任务=证据累积对象（laneSessions/交付快照/裁决） | 🔜P0（与 A1 合并立项） |
| 结果回收三兜底 | 🔜P1 |
| agent→coordinator 权限升级（urgency 三档） | 🔜P1（衔接 402 审批域） |
| dev 列 watchdog+监督模式 | 🔜P1（衔接 401 runaway-guard） |
| 执行租约+runner 反代 | ❌单机不适用（多机再启；A2A 依赖它同缓） |
| 共享会话四档模式+prompt 审批 | 📦旧账已落（ide-session-share R6）·待随迁 |
| 会话连续性四态徽标 | 🔜P2 |
| 泳道专家提示词资产 11 份 | 🔜P1（资产搬运，404 名册是 team 角色非泳道专家） |
| Worker 抽象 | 🔜P2 |
| A2A 出站/入站协议 | 🔜P2（依赖租约，同缓） |
| Yjs CRDT 共写笔记 | 🔜P2 |
| 名册树视图 | 🔜P2 |

### 3.7 claude-code（13 项散点；专有许可只搬概念）

| 项 | 处置 |
|---|---|
| 会话 recap（离开后发生了什么） | 🔜P0（cc/codex/dsh 三源合并；衔接 405 checkpoint 写手） |
| 子代理结果来源标头防冒充 | 🔜P0（安全项） |
| 通知补耗时/模型 | 📦旧账已含（R4 活动收件箱）·待随迁 |
| 计划模板（feature-dev 范式） | 🔜P1（纯资产） |
| 评审/验证轮编排模板 | 🔜P1（与 codex-product /review 合并） |
| 技能入口（skills=commands 合并口径） | 🔜P1（zcode SkillPort 原生面待核） |
| 权限模式 7 档语义+切换 UI | 🧬部分（402 决策态+规则）·模式语义 🔜P2 |
| 任务依赖 dependsOn | 🧬原生（kanban 父子依赖+claim 重检）·补记 |
| 缓存 miss 归因//context 建议//skill-doctor | 🔜P2 |
| /btw/输出风格/队列视觉/ralph | 🔜P2 |
| @提及六源（file/session） | 🔜P2（与 codex-product 文件引用合并；#7 A2A mention 是不同物） |
| auto memory 四类型+新鲜度 | 🔜P2（P4 域扩展） |
| security-guidance 同步拦+异步复查 | 🔜P2 |

### 3.8 codex（11 项）+ codex-product（7 项，整份此前缺席）+ deepseek-harness（7 项）+ dsh-TUI（6 项）

| 项 | 处置 |
|---|---|
| codex：渲染分项开关（mermaid/math/tables 回退源码） | 🔜P1（与 dsh mermaid 渲染合并） |
| codex：计划三选一门 | 📦旧账已落（IdePlanFloat R3）·待随迁 |
| codex：turn 完成 notify 外部命令钩子 | 🔜P2 |
| codex：token-budget 换窗 | 🔜P2 |
| codex：(model,effort) 成本分组+日桶 | 🔜P2（G7 域） |
| codex：config 8 层叠加+origins | 🔜P2 |
| codex：web_search 四档+restrict_to | 🔜P2 |
| codex：keymap 12×154 可重映射 | 🔜P2 |
| codex：会话内分节+手动 move | 🔜P2 |
| codex-product：/review 评审模式（两域+行内回流） | ✅ patch 414（review-store 两域/评论 open→resolved 回流/三裁决一次定音+evidence verification 联动） |
| codex-product：任务结果卡（验证 bullet+文件±行数+逐文件 Undo） | 🔜P0（Undo 与 #5 恢复域衔接） |
| codex-product：Activity 收件箱三态+OS 通知 | 📦旧账已落（R4）·待随迁 |
| codex-product：终端 actions（项目级一键命令） | 📦旧账已落（R4）·待随迁 |
| codex-product：文件/选区引用入会话 | 🔜P1（@域合并） |
| codex-product：webhook 事件触发 | 🔜P2 |
| codex-product：AGENTS.md /init | 🔜P2 |
| dsh：低上下文主动提醒（20k 余量 toast+迟滞） | ✅原生已落（IdeStatusBar lowNotified+迟滞，R1 代码实证）·补记 |
| dsh：会话成本估算（价目表三原则） | 🔜P0（两仓无价目表需自建，zcode §6.7 实证） |
| dsh：工作区分组管理 | 🔜P2 |
| dsh：/recap+tips | 并入 recap 域（cc 行） |
| dsh：trajectory hotspot 聚合 | 🔜P2（RunTrace 域） |
| dsh：per-turn changed-files 卡（deepseek-harness） | 🔜P0（与任务结果卡合并立项） |
| dsh：轮导航 rail（TurnNavigator） | 🔜P1（dsh+deepseek+zcode 三源） |
| dsh：present 交付物工具+交付卡 | 🔜P1 |
| dsh：compaction 留痕卡+/compact | 🔜P1 |
| dsh：RunTrace 时序图 | 🔜P1（T6 同物） |
| dsh：Office 三件套预览 | 🧬原生（hermes read_file Office 抽取链）·补记 |
| dsh：权限预设三档捆绑 | 🔜P2（402 域扩展） |

### 3.9 跨仓域合并裁决（D5/D6/D7 消解）

- **goal 域（八源归一）**：mimo P6/kimi/minimax/dsh/cc/codex/codex-product/zcode G5——裁决中心=goal 域以 hermes 原生 goals.py 为基座（每轮裁判+GoalGate+预算字段已有），**增量吸收统一立项**：goal 三预算字段显式化🔜P1、Quest"自主到底"档语义🔜P2。八源不再各自立项。
- **steering/queue 域（七源归一）**：steer 半边🧬原生已裁决（delegate action steer/stop）；**queue 让位半边🔜P1**（minimax GOAL-05：用户消息>自治目标）单独认领。七源归此两行。
- **命名空间消歧（D7）**："恢复点 restore-point"（#5 四恢复选项+kimi fork+qoder Q12+cc 逐文件 Undo+fileHistory——统一恢复域）vs"检查点摘要 checkpoint-writer"（P7 五节写手）。后续立项一律用此二名。
- **状态栏定制域**：kimi/minimax/codex/dsh 四源→单行🔜P2。
- **recap 域**：cc/codex/dsh 三源→单行🔜P0。
- **E4 补正**：认领四围栏中 runtime 新鲜度围栏=respawn guard+profile 可用性闸部分等价（实证）；wakeup 修订号围栏=❌单机无 wakeup 机制不适用。四围栏裁决理由补全。

### 3.10 zcode §七 39 项底座差距清单对账（此前整表未对账）

zcode 为底座本体：其差距清单的多数项随底座原生消解或由 R3+ 工作消费。逐项核验为独立核验轮（**列 🔜P1 核验批**，非实现批）；已可裁决的先行：G4 六源构成→🧬部分（403 三投影）扩展🔜P1；G8 rounds 表🔜P1；P0-3 技能工作台入口🔜P1；P0-5 Workflow 运行可视化 MVP🔜P1；P1-12 turnSteer🧬原生；P1-14 needs-auth OAuth 合成工具🔜P1（与 kimi /mcp-config 合并）；P1-10 轮导航🔜P1（三源行）；其余 ~24 项进核验批清单（含 @六源/任务六态/插件 MVP/MCP 导入同步/自定义命令/富文本输入/Claude 历史导入/G7 面板等）。

### 3.11 补账批统计

- 漏：122+ 项全部入档处置完毕（✅2 补记/🧬9 补记/📦9 旧账待迁/🔜100 排队（P0≈10·合并后/P1≈20/P2≈70）/❌3）；zcode §七 39 项→核验批 P1。
- 错：E1-E5 全部修正（证据源声明/409 状态回改/E4 补正/E5 锚点见 #4 行已含 minimax+codex 合并批原文）。
- 重：D1-D7 全部消解（收敛回改 4 处+域合并 5 组+命名空间 1 组）。
- **下一实施批（按优先级）**：~~P0 十项~~ → **P0 已落 8/10**（recap 域 v1+来源标头=410；价目表=pricing.ts；squad leader 协议=squad-protocol.ts；任务证据累积=patch 413；任务结果卡=result-card.ts；/review 评审域=patch 414；列级 automation 编排=patch 415 配置+匹配器）→ 余 P0 两项（执行编排 drain 挂 loop 会话域属后续扩，非独立 P0）→ P1 二十项 → 旧账随迁批（📦9 项）→ 核验批。
