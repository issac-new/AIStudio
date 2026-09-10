# SwarmStudio
本项目基于作者想法，由AI 100%完成，不包含任何人类代码。使用Apache 2.0 协议发布，对于参考的的上游项目，如需运行时部署，请遵守其授权约定，或自行参考迁移功能完成本地化实现。

Hard times create human code, humen code create ai times, ai times create weak men, and weak men create hard times。

> 基于 [hermes-studio](https://github.com/EKKOLearnAI/hermes-studio) 二次开发的 **AI 协作中心**桌面应用。本仓是 overlay（二次开发层），通过构建期注入将自定义功能叠加到上游，上游源码始终保持纯净、可独立升级。

SwarmStudio 把「人类协作伙伴 + 本地 Agent 集群 + 人机协作」三类工作统一在一个驾驶舱（Cockpit）里统筹：既有突出重点的全貌概览，又可针对具体任务接入，进行补充 / 评估 / 决策 / 审批。同时提供协作看板、Matrix 即时通讯、运行全过程可观测性等能力。满足AI协同的组织发展需要。

---

## 为什么需要 SwarmStudio

当 AI 协作从「单机单 Agent」走向「多人 + 多 Agent 并行」，原有的工具形态开始失灵。SwarmStudio 针对三类结构性困境给出答案：

- **三类工作割裂**：人类协作伙伴（Matrix / Slack / 微信）、本地 Agent 集群（Claude Code 终端、模型 API）、人机 1:1 协作（聊天框审批）散落在不同界面，无法统筹，切换成本极高。SwarmStudio 用 Cockpit 把三者收进同一个驾驶舱。
- **线性聊天流无法呈现多 Agent 协作**：多 agent 并行 / 派生（主 agent 拉起 subagent）/ 收敛（多 agent 结果汇总）在线性消息流里交错丢失。SwarmStudio 用 Evidence Graph（证据图）重构运行全过程，让并行 / 派生 / 收敛一目了然。
- **AI 运行过程缺乏可观测性与可追溯性**：推理链黑盒、工具调用无耗时、subagent 层级扁平、跨机协作无 trace。SwarmStudio 的 RunTraceView 让每一步推理可追溯、可回放、可导出，满足合规审计场景（金融 / 医疗 / 法律）。
- **上游二次开发易陷「分叉泥潭」**：fork 后大改导致上游无法升级。SwarmStudio 用 overlay 注入架构（A 类纯新增 + B 类 patch）让三个上游仓 `.git` 永不污染，可独立 `git pull` 升级。

> 工具的形态，决定了协作的效率。SwarmStudio 的答案：不要更多聊天框，要一个驾驶舱；不要更多终端，要一张证据图；不要更多切换，要一个多视角工作区。完整价值叙述见 `../docs/SwarmStudio-公众号宣传稿-深度版.md`。

---

## 运行效果图

> 以下截图为 P3 前的 Cockpit 界面（2.17 及之前）。P3 起主界面切换为信息架构 2.0 六区域（见功能特色首节），截图待更新。

### 沟通区：
<img width="1914" height="928" alt="d5515cbc-58fa-48d4-b66b-2edefd345b65" src="https://github.com/user-attachments/assets/786c5b94-1d63-4179-82c3-8f9946ffa420" />

### 编码区
<img width="1916" height="917" alt="d71cdaa7-eb9b-45ed-b435-1bc2ee2031f4" src="https://github.com/user-attachments/assets/85f568fe-57f4-4a49-83a9-48496b5aefa6" />

### 工作区
<img width="1920" height="923" alt="67876615-bab7-4880-b919-8c7f4caa1165" src="https://github.com/user-attachments/assets/71136468-70f8-4cb2-b7bb-c25978fdfb0a" />

### 日程区
<img width="1920" height="933" alt="d0c3941b21d78a93b6c90f67e9faea87" src="https://github.com/user-attachments/assets/4827c359-09bb-4052-9eb1-2696061c3e2d" />

### 看板区
<img width="1920" height="930" alt="ea0b09bd5c3e608883e6a661e6fc658b" src="https://github.com/user-attachments/assets/bf5293b0-374a-4a7a-92a1-645d87775cbe" />

### 观测区
<img width="1920" height="984" alt="27db8eb043e80742a8d77e9eee2b3b7a" src="https://github.com/user-attachments/assets/621e63d7-8e94-4e3e-ade2-f647e863020c" />



## 功能特色

### 🧭 信息架构 2.0 — 六区域新 IA（P3，登录默认落点 `/app`）

P3 起 SwarmStudio 客户端主界面从 Cockpit 三栏驾驶舱切换为六区域信息架构（侧栏一级导航），登录直落总览。全程 Pure Ink 主题零新色板（节点状态只用 error / warning / success 三色 + 灰阶）、深浅色跟随系统、文案中文优先（新 UI i18n zh/en 全键对称）、键盘可达（运行中心 j/k 移动 / Enter 打开 / r 回放 / a 审批）。R4 体验验收逐条走查：`docs/superpowers/specs/2026-09-10-loop-graph-p3-r4-checklist.md`。

**六区域导览（文字版）**：

| 区域 | 路由 | 内容 |
|------|------|------|
| **总览** | `/app` | 注意力条（blocked / review / triage 三梯队，点击跳工作项区带筛选）→ 四卡片（活跃运行 / 等你决策 / 今日日程 / 关键指标）→ 工作项状态分布 → 今日计划（到期 loop + 今日待办）；零数据时出现三步引导（选模板 → 设节奏 → 跑起来），任一 run 存在即消失。关键指标标注近似口径：平均耗时显示"基于 N 个样本"（近 7 天窗口内最近 20 个终态 run 的回放采样），loop 事件采集降级时熔断计数标"部分数据" |
| **编排** | `/app/orchestrate` | 模板库（五阶段模板只读列表）+ GraphSpec 可视化（与运行详情同源的画布投影）+ 一键实例化（cron 节奏 / 时区 / 租户，粗校交服务端 cron-parser） |
| **运行中心** | `/app/runs` | P2 运行中心整体迁入（阶段 × 状态双轴、`awaiting-input` 恒置顶、执行图画布 + 时间轴回放、三级分辨率、节点检查器、介入收件箱——详见下文「Loop Engineering」） |
| **介入中心** | `/app/inbox` | 五源聚合（awaiting 审批 / Triage 分诊队列 / 到期闹钟等）+ 就地审批 + 自动归档 |
| **工作项** | `/app/tasks` | SwarmKanban 协作看板整体承接 + 任务↔run 双向关联 + 追溯矩阵 |
| **沟通** | `/app/comms` | Matrix 聊天升一级（房间列表 + `/app/comms/room/:roomId` 房间路由） |

**追溯矩阵（工作项区）**：run 产物落库事件携带 `taskId`（persisted 契约台账），矩阵按任务聚合「来源 run ↔ 产物 ↔ 验证轮次」双向可溯；无 taskId 的存量 run 归入「未归属」桶并显式标注（旧数据形态非缺陷）。

**图引擎策略卡（设置页）**：`GRAPH_ENGINE` 三态模式与熔断 / 中断超时阈值的只读展示，策略当前为构建期默认值（可编辑策略文件随 P4）。

**兼容与退役**：旧落点经兼容守卫重定向——`/hermes/cockpit` → 总览、`/hermes/matrix-chat` → 沟通、`/hermes/swarm-kanban` → 工作项、旧 loop 路由 → 运行中心（携带 `?loop=` 上下文）；冷启动深链兼容重查。`VITE_IA_RETRO=1` 回退开关在 P3 收窄为仅放行旧 loop 落点（Cockpit 视图已删，回退需 revert 退役提交，窗口随 P4 关闭）。

### 🚀 Cockpit — AI 协作中心（**已退役**，P3）

2.13–2.16 期间的主操作界面：三段联动式布局（全貌 → 聚焦 → 处理），含顶栏（品牌 · 日程 · 时钟 · 搜索 · 通知）、注意力条、左栏 Kanban 统筹、中栏协作图 + 时序事件流、右栏 A2UI 表单 + 文件资源管理器 + 终端、⚡💬⌘ 模式切换。P3 信息架构 2.0 上线后整体退役：

- **能力去向**：日程弹窗（`CockpitScheduleModal` 原样复用于总览）、待办 + 闹钟（workspace store，kv 单一事实源）、注意力梯队模型（总览注意力条收编）、Kanban（工作项区承接）、Matrix 聊天（沟通区升一级）、指挥中心舰队聚合（审批 UI 暂无落点，P4 重建）
- **RETRO 语义收窄（如实注明）**：`VITE_IA_RETRO=1` 开关本期收窄——Cockpit 视图代码已删，该开关不再能回到旧驾驶舱，仅放行旧 loop 落点；完整回退 = revert 退役提交（`4bcb1e8`），回退窗口随 P4 关闭
- **目录遗留**：`custom/client/cockpit/` 保留 adapters / store / kv 与 2 个复用组件（新 IA 与运行中心仍在消费），视图与三栏布局已删除

### 🔭 RunTraceView — 运行全过程可观测性

把线性聊天消息流重构成 **Evidence Graph（证据图）**，呈现多 agent 协作的并行 / 派生 / 收敛：

- **证据分层**（不可伪造原则）：`L1` 前端事件流可靠可见（实线）/ `L2` 运行时 hook 后补齐（虚线 + 推断标签）/ `L3` 分布式 trace propagation 后补齐（点线 + future 标签）
- **TraceNode 类型**：ingress / workflow / agent / skill / tool …，skill 可下钻展开内部「思维链 + 工具」交错编排
- **时间轴 + 检查器 + 时间游标**：回放 live / replay 两种模式
- 对齐 **OpenTelemetry GenAI 语义约定**的 JSONL 导出 + 证据档案（Evidence Dossier）导出
- 第 1 层零运行时改动，纯前端消费已有 Socket.IO 事件流（`run/tool/subagent/usage/reasoning`）

### 📋 SwarmKanban — 协作看板

自定义组件（原 cockpit 子路由 `swarm-kanban`，P3 起由新 IA 工作项区 `/app/tasks` 承接，旧路径经兼容守卫重定向），与上游原生 KanbanView 并存：

- 看板列 / 任务卡 / 任务抽屉 / 任务表单 / 内联创建
- 批量操作栏、注意力条、编排面板、诊断区
- Markdown 渲染、附件管理、租户解析（多租户隔离）
- 工作区文件列表、时间线、附件同步 API

### 💬 Matrix Chat — 完整 Matrix 客户端

50 个组件构成的完整即时通讯客户端，路由动态注册（P3 起挂新 IA 沟通区 `/app/comms`）：

- 房间列表 / 消息流 / 消息输入 / 上下文菜单 / 消息操作栏
- 文件面板 / 成员列表 / 成员信息 / 邀请 / 转发 / 导出 / 加入 / 离开 / 创建房间
- 群聊未读追踪、自动 join、日期分隔符、清空消息
- 基于 `matrix-js-sdk`，经 Matrix homeserver 认证

### 🔐 Matrix 账号集成

- **登录**：Homeserver URL + MXID + 密码，Remember Me 持久化 + 本地降级
- **管理**：账号设置、用户管理（admin-service）
- 服务端：Matrix 认证路由、数据库 schema 扩展（Matrix 列 + SQLite UNIQUE 约束）

### 🔁 Loop Engineering — 循环工程

递归目标自动循环：定义目标后，引擎按 discovery → handoff → validation → persistence → scheduling 五阶段自动推进，直至满足可验证的停止条件。

- 状态存储适配器自动探测：`LOOP_STATE_ADAPTER` 覆盖 → PostgreSQL（SaaSStore）→ Matrix 凭据（MatrixStore）→ 本地兜底（LocalStore）
- 连接器（GitHub / Webhook / 本地 Git）+ 预算守卫 / 卡死检测 / 团队审批 / verifier
- 服务端 REST 路由 + Socket.IO namespace（patch 134/135）+ pg 依赖（patch 138）
- 状态迁移：`scripts/loop-migrate.mjs`（Local → Matrix）、`loop-migrate-saas.mjs`（Matrix → PostgreSQL）

**图引擎接管（P1 patch 202，P2 收口）**：LoopInstance 经编译器变为 GraphSpec（六节点：五阶段 + gate 质量门禁 + 守卫 repair 回边），由图内核执行——事件日志（`node:sqlite`，零新依赖）为唯一事实源，真 checkpoint/resume/fork、HITL interrupt 审批闭环、R2 workspace 上下文注入（GRAPH-CONTEXT.md）。`GRAPH_ENGINE` 环境变量三态切换：`legacy`（默认，旧引擎原样）/ `shadow`（双跑：新引擎 dryRun 对比事件序列，不写副作用）/ `on`（新引擎接管调度，详见下方 caveat）。`on` 模式额外装配两件守护：interrupt 超时扫描器（审批无人应答按 `escalate`/`auto-approve-with-log`/`fail` 三策略处置，缺省 72h + 节流水印落事件日志）与每日 Brief 任务（见下）。新 REST 面：`/api/graph/runs`（CRUD/resume/fork/replay）与 `/api/graph/specs`（specs 表化，随事件日志同库持久）；socket `/graph` namespace 按 run 订阅。旧数据迁移：`node scripts/graph-migrate.mjs`（dry-run 默认，`--apply` 落库幂等）。设计文档：`docs/superpowers/specs/2026-09-09-loop-graph-aihub-redesign-design.md`。

**运行中心（P2）**：入口 `/app/runs`（列表），详情 `/app/runs/:runId`（P3 起新 IA 路由；旧落点 `/hermes/loop/runs`、`/hermes/loop/runs/:id` 经兼容守卫重定向并携带 loop 上下文）。

- **运行列表**：阶段 × 状态双轴、状态驱动的合法操作集（不存在任意跳转）、`awaiting-input`（待我处理）恒置顶排序、状态筛选 + 搜索 + 分页、行内 peek 展开与内联审批
- **介入收件箱**：汇集等待人工决策的 run，两态归档（本地打标，不改服务端 run 状态）
- **运行详情**：左图右流——执行图画布（vue-flow 只读）+ 时间轴回放（游标 = 重放至第 N 事件，图与事件流共用前缀投影）；**三级分辨率**时间轴（`summary` 只看节点级结果 / `normal` 增加路由与耗时 / `verbose` 全量原始负载，逐级放开）
- **节点检查器**：选中节点查看类型 / 状态 / 迭代 / 耗时与最近一次 update 的 channel 键值（attach 档）；唯一介入动作是 failed 节点的「重跑整个 run」（fork → startRun 显式起跑）——审批不在检查器，位于列表行 peek 展开与介入收件箱的审批面板
- 数据面：`GET /api/graph/runs/:id` + `/replay`，socket `/graph` 实时推送

**R1 每日 Brief（P2）**：`on` 模式下每日定时（`LOOP_BRIEF_CRON`，缺省 `0 9 * * *` 本地时区）聚合过去 24h 的图引擎事实，渲染三段式结构化简报——进展（完成 / 失败 / 熔断升级告警）、等你决策（awaiting-input 及等待时长）、今日计划（到期未触发的 loop）。零 LLM 依赖，纯持久数据源（事件日志 + loop 台账），重启自然恢复；brief 自身作为 `graphId='daily-brief'` 审计 run 落事件日志，可回放可审计。**诚实边界**：Matrix 聊天投递需要 `LOOP_BRIEF_ROOM` 配置与宿主注入的传输通道（`briefDelivery`，patch 202 预留注入点）同时成立——**当前两者均未接线，默认只落事件日志，聊天里收不到每日简报**；投递最后一公里待 bot 身份 / 凭据来源确认后补齐。

**信息架构与编排（P3）**：六区域新 IA（见功能特色首节）+ 编排区（模板库 / Spec 可视化 / 实例化）+ 介入中心五源聚合 + 追溯矩阵 + 图引擎策略卡；cockpit 退役（能力去向与 RETRO 收窄见功能特色退役声明）。事件面配套：`loop.persisted` 产物事件带 `taskId`/`runId`（追溯锚点），`graph-runtime` 对 `loop.*` 事件整体透传负载（回放可反查产物）。

**P1 图引擎 caveat（终审修复波后仍成立的交付边界）**：
- `on` 模式接管调度，但失败语义与 legacy 有偏移：run 失败时 loop 重写为 `idle` 并按 `computeNextTick` 重排（连续失败达 10 次熔断转 `paused`）；legacy 的 tick 异常会把 loop 置 `status='failed'`。前端按 `paused/idle` 展示 on 模式失败态。
- `on` 模式产物落库为真实 kanban 写入（P2 Task 4 替换 P1 stub）：`KanbanPersistenceAdapter` 按 `loop.tenant` 六段格式解析 board（群聊名 slug 化——残段无字母或不足 3 字符时回落 roomId，解析不出跳过 + warn）、任务 title `[loop.name] contract.id` 按契约查重幂等（重复 persist 跳过）、kanban CLI 失败发 `loop.persist-failed` 事件并经 persistence→handoff 守卫回边重试（失败不炸 run）；重试达 `maxAttempts` 封顶则契约标 `escalated` + `tasksBlocked` 计数，含 escalated 契约的 run 不判收敛（loop 不会被假标 completed）。注意：`tenant` 由创建请求显式携带（`POST /api/loop/loops` 的 `body.tenant`，不传则解析不出 board、写入跳过）；新群聊首写可能命中尚不存在的 board——写入失败会进 repair 重试直至封顶 escalated。`shadow` 双跑 dryRun 语义不变（零写入）。
- judge 验证仍未接线真实模型调用方（P2 已备好 pending 结构：VerificationRecord 记 `judge:{status:'pending', reason}` 且不阻断 overall，judge 未配置时装配 warn 一次显式声明降级）：契约带 judge intent 时 judge 项按 pending 记录，程序化 + 人工门禁照常生效；刻意不注入恒失败假 judge（会让 judge 意图契约 repair 循环烧穿 escalated）。
- connector 发现与 legacy 生产同源（仅 webhook；GitHub/本地 Git 连接器待配置面引入后接入）。

### 🎨 品牌与网关通知

- 桌面端 rebrand 为 SwarmStudio（config + package）
- 品牌样式变量注入
- Gateway 通知横幅：Chat / Group Chat 关停公告，经内容检测识别（非 systemType）

### 🌐 国际化

扩展 i18n 翻译键（看板、历史筛选、Matrix 聊天等），直接经 patch 注入上游 locale 文件，无需运行时 merge。

---

## 架构

### 技术架构说明
<img width="2960" height="4000" alt="image" src="https://github.com/user-attachments/assets/3e41bc6e-7afc-4c2b-b437-404e1f33c629" />

### hermes agent kanban 任务状态转移图
<img width="6220" height="4960" alt="mermaid-1782269745463" src="https://github.com/user-attachments/assets/f5283991-2a8a-4679-bdf2-a6787f2cec11" />

### 工作区三层布局

```
ncwk/
├── upstream/                 # 上游原始项目（只读，禁止直接修改）
│   ├── hermes-studio/        #   SwarmStudio 桌面应用主体（v0.7.18）
│   ├── element-web/          #   Element Web Matrix 客户端参考实现
│   └── hermes-agent/         #   Hermes AI Agent 运行时
├── overlay/                  # ← 本仓：二次开发代码（唯一被提交的地方）
│   ├── custom/               #     A 类：纯新增代码（组件/store/服务）
│   ├── patches/              #     B 类：上游骨架修改（git apply 可逆）
│   ├── registries/           #     运行时注册中枢（路由/导航/组件）
│   ├── config/               #     功能开关
│   ├── scripts/              #     inject / build / sync 工具链
│   └── tests/                #     单测
└── docs/superpowers/         # 设计文档（specs + plans）
```

**核心原则**：三个上游仓始终保持上游原状，`.git` 永不污染，可独立 `git pull` 升级；所有二次开发代码集中在 overlay 仓。

### 混合注入策略（A 类 + B 类）

二次开发改动按「是否能纯新增」分两类，分别用不同机制接入上游：

| 类别 | 改动性质 | 存放 | 接入机制 | 可逆性 |
|------|---------|------|---------|--------|
| **A 类** | 纯新增文件（组件/store/服务） | `custom/` | 构建期 alias 重定向 + entry shim + 运行时 registry | 零侵入上游源码 |
| **B 类** | 修改上游骨架（schema/config/vite/路由） | `patches/` | `git apply`（构建期注入） | `git apply --reverse` 完全还原 |

> 为什么不全用 A 类？对修改文件做分类后发现，~7 类改的是上游骨架（schemas 加列、config 加字段、vite 预打包等），属运行前置条件，无法运行时注册，必须转 patch。

### overlay 仓库目录结构

```
overlay/
├── custom/
│   ├── client/                    # 前端 A 类代码
│   │   ├── ia2/                   #   信息架构 2.0（六区域：22 组件/视图 + store + adapters + 守卫）
│   │   ├── cockpit/               #   驾驶舱遗留（adapters/store/kv + 2 复用组件；视图已退役）
│   │   ├── matrix-chat/           #   Matrix 聊天（50 组件 + views）
│   │   ├── kanban/                #   协作看板（14 组件 + utils + views）
│   │   ├── loop/                  #   Loop 工程化（25 组件：引擎视图 + 运行中心 + 执行图 + store）
│   │   ├── chat/                  #   网关通知横幅
│   │   ├── branding/              #   品牌注入
│   │   └── test/                  #   测试桩
│   ├── desktop/                   # 桌面端 A 类（node-pty prebuild 剪枝测试）
│   ├── hermes-agent-plugins/      # hermes-agent Python 插件（run-trace OTel formatter）
│   └── server/                    # 服务端 A 类代码
│       ├── kanban/                #   看板服务
│       ├── matrix/                #   Matrix 认证路由 + admin-service
│       ├── loop/                  #   Loop 引擎（engine / connectors / store / controllers / graph 图引擎）
│       ├── controllers/           #   Hermes 扩展控制器（trace / 终端工具探测）
│       ├── services/              #   Hermes 扩展服务（task workspace 缓存）
│       └── security/              #   URL 守卫（SSRF 防护）
├── patches/                       # B 类 patch（177 个 active + 归档）
│   └── series                     #   patch 应用顺序清单
├── registries/
│   ├── client/                    # 客户端注册中枢 + entry shim + bootstrap
│   └── server/                    # 服务端 bootstrap（预留）
├── config/
│   ├── features.ts                # 功能开关（VITE_* 环境变量控制）
│   ├── loop-config.ts             # Loop 工程化配置（状态适配器探测）
│   └── bootstrap.ts
├── scripts/
│   ├── inject.mjs                 # 注入工具（应用 patch + 生成派生 config + 建符号链接）
│   ├── ensure-injected.mjs        # dev/build 前置钩子（幂等确保已注入）
│   ├── build.mjs                  # 完整构建编排
│   ├── build-dmg.mjs              # 桌面端 dmg 打包
│   ├── verify-clean.mjs           # 校验上游工作树干净
│   ├── sync-upstream.sh           # 上游升级流程
│   ├── serve-server.sh            # 开发期后端启动
│   ├── loop-migrate.mjs           # Loop 状态迁移（LocalStore → MatrixStore）
│   ├── loop-migrate-saas.mjs      # Loop 状态迁移（MatrixStore → PostgreSQL）
│   ├── add-i18n-keys.mjs          # locale 文件补齐缺失 i18n key
│   └── add-matrixchat-i18n.mjs    # Matrix Chat i18n key 注入
└── tests/                         # 单测源（matrix-chat 测试，经 patch 055-060 注入上游 tests/ 运行）
```

---

## 运行原理

### 1. 注入流程（`npm run inject`）

`scripts/inject.mjs` 是核心，幂等执行，将 overlay 叠加到上游工作树：

```
inject.mjs
  │
  ├─ 0. 清理自残留（旧 server/src/custom 符号链接 + 非 patch 的 build 产物）
  ├─ 1. 校验上游工作树干净（脏则报错，提示先 clean）
  ├─ 2. 应用 B 类 patch ──── 按 patches/series 顺序 git apply 到 hermes-studio / hermes-agent（按 patch 目标自动路由）
  ├─ 3. 建符号链接
  │     ├─ overlay/node_modules → upstream/hermes-studio/node_modules（复用上游依赖）
  │     └─ upstream/.../server/src/custom → overlay/custom/server（server 用相对路径 import）
  ├─ 4. 生成派生 vite.config.overlay.ts（alias 重定向 + entry 重定向，见下）
  └─ 5. 写清单 .overlay-injected.json（记录已应用 patch，供 clean 反向还原）
```

**`npm run clean`** 反向执行：按清单逆序 `git apply --reverse` 还原 patch + 移除符号链接 + 还原 build 产物，让上游完全回到 HEAD。

### 2. A 类接入：构建期 alias 重定向 + 运行时注册

A 类代码不改动上游源码，靠两个机制接入：

**(a) 派生 vite config 的 alias 重定向**

`inject` 生成的 `vite.config.overlay.ts` 在上游 vite config 基础上 `mergeConfig` 注入 alias（数组形式保证匹配顺序，更具体的前缀先匹配）：

| alias | 指向 | 作用 |
|-------|------|------|
| `/src/main.ts` | `overlay/registries/client/entry.mts` | 把 index.html 入口重定向到 overlay shim |
| `@/custom` / `@custom` | `overlay/custom/client` | 自定义组件解析到 overlay |
| `@registries` | `overlay/registries` | 注册中枢解析到 overlay |
| `@`（兜底） | `upstream/.../client/src` | `@/api`、`@/views` 等仍解析到上游 |

**(b) entry shim + 运行时 registry**

`registries/client/entry.mts` 忠实复制上游 `main.ts` 的启动序列（createApp → use pinia/i18n/router → FOUC/token 处理），唯一差别是在 `app.use(router)` 与 `app.mount()` 之间插入 A 类注册：

```
entry.mts
  ├─ 复制上游 main.ts 启动序列（createApp / use pinia / use i18n / use router）
  ├─ import('./bootstrap').then(bootstrapClient(app))   ← A 类注册插入点
  │     │
  │     ├─ 按 features 开关动态 import 各 custom 模块
  │     │   ├─ registerMatrixChat(app)
  │     │   ├─ registerKanbanEnhancements(app)
  │     │   ├─ registerBranding(app)
  │     │   └─ registerCockpit(app)
  │     │
  │     └─ 把 registry 收集到的路由 router.addRoute()（必须在 mount 前）
  │           └─ 动态子路由（如 matrix-chat 作为 cockpit 子路由）也在此注册
  │
  ├─ router.isReady() + 重导航（让动态路由对初始导航生效）
  └─ app.mount('#app')
```

`registries/client/index.ts` 是注册中枢，提供 `registerRoute` / `registerNavEntry` / `registerComponent`，各 custom 模块调用它们收集扩展，bootstrap 在 mount 前统一挂载。

> **为何不用顶层 await**：es2020 target 不支持，用 `.then` 链式保证 bootstrap 在 mount 前完成。

### 3. 功能开关

`config/features.ts` 用 `import.meta.env.VITE_*` 读取环境变量（必须带 `VITE_` 前缀，否则 Vite 不注入客户端 bundle）。默认全开（向后兼容），可经环境变量关闭：

| 开关 | 环境变量 | 默认 |
|------|---------|------|
| matrixChat | `VITE_CUSTOM_MATRIX_CHAT=false` | 开 |
| matrixAuth | `VITE_CUSTOM_MATRIX_AUTH=true` | 关 |
| matrixAdmin | `VITE_CUSTOM_MATRIX_ADMIN=true` | 关 |
| kanbanEnhancements | `VITE_CUSTOM_KANBAN_ENHANCEMENTS=false` | 开 |
| branding | `VITE_CUSTOM_BRANDING=false` | 开 |
| extendedI18n | `VITE_CUSTOM_EXTENDED_I18N=false` | 开 |
| loopEngineering | `VITE_CUSTOM_LOOP=false` | 开 |

> 注：`cockpit`（`VITE_CUSTOM_COCKPIT`）开关随 P3 Task 8 cockpit 退役一并移除（`/hermes/cockpit` 路由本体已删除，新 IA `/app` 为唯一一级界面）；`VITE_IA_RETRO=1` 仅保留旧 `/hermes/loop*` 深链不强制迁移的回退语义。

### 4. 完整构建流水线（`npm run build:full`）

`scripts/build.mjs` 编排四步，产物落到上游 `dist/`（desktop 构建读取该目录）：

```
1. openapi:generate     → dist/server/openapi.json（上游脚本）
2. vite build           → dist/client/（用 overlay config：@/custom alias + entry shim）
3. tsc --noEmit         → server 类型检查
4. build-server         → dist/server/（上游打包脚本）
```

桌面端打包：`npm run build:dmg:mac|win|linux`（`scripts/build-dmg.mjs`）。

### 5. 数据流（运行时）

```
浏览器 (Vue3 + Pinia + Vue Router)
  │  index.html → entry shim (alias 重定向)
  │  ├─ @/custom/*   → overlay custom 组件
  │  └─ @/*          → 上游 client src
  │
  │  Socket.IO 事件流 (run/tool/subagent/usage/reasoning)
  │  ├─ chat.ts handleEvent        → 线性 Message[]（上游，不改）
  │  └─ RunTraceView 并行消费者     → Evidence Graph（overlay，零侵入）
  │
Koa Server (上游 packages/server + custom/server 经符号链接)
  ├─ Matrix 认证路由 (custom/server/matrix/routes.ts)
  ├─ Kanban 服务 (custom/server/kanban)
  └─ element-web 中间件 (patch 008)
  │
hermes-agent (运行时；本地安装优先，否则首次启动下载捆绑 runtime)
```

---

## 快速开始

### 环境要求

- Node.js ≥ 23.0.0
- 上游仓已 clone 到 `../upstream/`（hermes-studio / element-web / hermes-agent）

### 上游依赖

SwarmStudio 基于以下三个上游开源项目二次开发：

| 上游项目 | GitHub 仓库 | 用途 |
|---------|-----------|------|
| **hermes-studio** | https://github.com/EKKOLearnAI/hermes-studio | SwarmStudio 桌面应用主体（Vue 前端 + Koa 后端 + Electron 壳），本 overlay 的注入目标（v1.0.2） |
| **hermes-agent** | https://github.com/NousResearch/hermes-agent | Hermes AI Agent 运行时（Python，源码跟踪 v0.21.1 / v2026.9.7，4 个 CLI patch 注入；桌面捆绑 runtime pin hermes-0.21.0-runtime，首次启动下载） |
| **element-web** | https://github.com/element-hq/element-web | Element Web Matrix 客户端参考实现（v1.12.27） |

**独立安装运行（不依赖 overlay 二次开发）**

若只想运行上游原版，可直接用官方命令安装：

```bash
# 1. 安装 hermes-agent 运行时（Python）
pip install hermes-agent[all]

# 2. 安装 hermes-web-ui（SwarmStudio 桌面应用）
npm install -g hermes-web-ui

# 3. 启动 web UI 服务
hermes-web-ui start

# 4. 启动 agent（终端 TUI 交互模式）
hermes --tui

# 5. 启动 agent dashboard（桌面 GUI 后端）
hermes dashboard --tui
```

> 注：上述是上游官方用法。本 overlay 仓的二次开发版需经 `npm run inject` 注入后从源码构建（见下文「开发启动」），不走全局安装路径。

### 开发启动（首次）

```bash
cd overlay
npm run inject                                       # 1. 注入 patches + 生成派生 config + 建符号链接

cd ../upstream/hermes-studio
npm install --no-audit --no-fund --ignore-scripts    # 2. 安装上游依赖（overlay 经符号链接复用）
mkdir -p dist

cd ../../overlay
bash scripts/serve-server.sh &                       # 3. 后端 :8647（ts-node 直跑上游 src/index.ts）
npm run dev                                          # 4. 前端 :8649（vite，host + strictPort）
```

开发期 vite dev server 代理 `/agent-health` → `http://127.0.0.1:8650/health`。

### 前后端服务重启

开发期后端用 `serve-server.sh`（前台进程，`node -r ts-node/register` 直跑 TS 源码，无热重载）；前端用 vite dev server（HMR 自动热更新）。两者各自独立，重启互不影响。

**重启后端**（改了 server 代码 / patch / `custom/server/` 后需重启）：

```bash
# 1. 找到并杀掉旧后端进程（监听 :8647）
lsof -ti:8647 | xargs kill -9 2>/dev/null

# 2. 重新启动（后台）
cd overlay
bash scripts/serve-server.sh &                        # 默认 :8647
# 或指定端口：bash scripts/serve-server.sh --port 8647

# 若改了 B 类 patch，重启前需先重注入：
# npm run clean && npm run inject
```

**重启前端**（改了 `custom/client/` 后通常无需重启——vite HMR 自动热更新；仅当改了 `vite.config.overlay.ts` / alias / entry shim 时需重启）：

```bash
# 1. 杀掉旧 vite 进程（监听 :8649）
lsof -ti:8649 | xargs kill -9 2>/dev/null

# 2. 重新启动
cd overlay
npm run dev                                           # 前台跑，Ctrl+C 停止；或加 & 后台
```

> **若改了 B 类 patch**：后端重启前必须 `npm run clean && npm run inject` 重新注入，否则上游工作树仍是旧 patch 状态。

### 完整构建 + 桌面端打包（两个版本构建物）

SwarmStudio 桌面端当前版本 **0.7.18**，构建产物分 **macOS** 与 **Windows** 两个版本。

**方式 A — overlay 一键脚本（推荐，自动 inject + build:full + electron-builder）**

```bash
cd overlay

# macOS 版（arm64 DMG + zip）
npm run build:dmg:mac
# 产物：upstream/hermes-studio/packages/desktop/release/
#       ├── SwarmStudio-0.7.18-arm64.dmg
#       └── SwarmStudio-0.7.18-arm64.zip

# Windows 版（x64 zip + NSIS exe 安装器）
npm run build:dmg:win
# 产物：upstream/hermes-studio/packages/desktop/release/
#       ├── SwarmStudio-0.7.18-x64.zip
#       └── SwarmStudio-0.7.18-x64.exe
```

`build-dmg.mjs` 编排 5 步（自动完成，无需手动分步）：
1. `inject` — 应用 patch + 生成派生 config + 建符号链接
2. `build:full` — 用 overlay vite config 构建 web UI → `dist/client` + `dist/server`
3. `desktop:install` — `npm ci --prefix packages/desktop`
4. `build:main` — `tsc` 编译桌面主进程
5. `electron-builder --<platform> --publish never` — 打包

**方式 B — 手动分步（更细粒度控制）**

```bash
cd overlay
npm run inject                  # 1. 注入 patch
npm run build:full              # 2. 构建 dist/(openapi + client + server)

cd ../upstream/hermes-studio
npm ci --prefix packages/desktop --no-audit --no-fund   # 3. 桌面端依赖
npm --prefix packages/desktop run build:main            # 4. tsc 编译主进程

# 5. 打包（--mac / --win / --linux，可组合）
npm --prefix packages/desktop run dist -- --mac --win --publish never
# 产物同样落到 packages/desktop/release/
```

> **关键**：必须用 overlay 的 `build:full`（`scripts/build.mjs`，用 overlay vite config），而非上游的 `npm run build`——后者会覆盖 `dist/` 且不带 `@/custom` alias + entry shim，产物不含自定义组件。`build-dmg.mjs` 已默认绕开上游 `npm run dist`（避免其内部 `npm run build` 覆盖 dist）。

**仅构建 web UI（不打桌面端）**

```bash
cd overlay
npm run inject          # 应用 177 patch
npm run build:full      # 构建 dist/(openapi + client + server)，落到上游 dist/
```

### 常用命令

| 命令 | 作用 |
|------|------|
| `npm run inject` | 应用 B 类 patch + 生成派生 config + 建符号链接 |
| `npm run clean` | 反向还原上游工作树（逆序 reverse patch + 移除链接） |
| `npm run verify` | 校验上游工作树状态干净 |
| `npm run sync` | 上游升级（clean → fetch/reset → re-inject） |
| `npm run dev` | 前端开发服务器 :8649 |
| `npm run build` | 仅构建 client bundle |
| `npm run build:full` | 完整构建 web UI（openapi + client + server）→ 上游 dist/ |
| `npm run build:dmg:mac` | macOS 版构建物（arm64 DMG + zip，一键 inject+build+打包） |
| `npm run build:dmg:win` | Windows 版构建物（x64 zip + exe 安装器，一键 inject+build+打包） |
| `npm run build:dmg:linux` | Linux 版构建物（一键 inject+build+打包） |
| `npm test` | 运行单测（vitest） |

---

## 开发工作流

### 修改上游骨架（B 类）

1. 在 `upstream/hermes-studio` 直接改（临时）
2. `git diff > overlay/patches/NNN-描述.patch` 生成 patch
3. 还原上游工作树（`git checkout -- .`）
4. 把 patch 文件名加入 `overlay/patches/series`
5. `npm run inject` 验证可应用

### 新增功能（A 类）

1. 在 `overlay/custom/client/<feature>/` 写组件 / store
2. 在 `overlay/registries/client/bootstrap.ts` 调度注册（按 features 开关动态 import）
3. 用 `registerRoute` / `registerNavEntry` / `registerComponent` 收集扩展
4. `npm run dev` 即可热加载验证

### 上游升级

```bash
npm run sync   # = clean → git fetch/reset upstream → re-inject
```

patch 冲突时用 `git apply --reject` 手动排查，修复后重跑 inject。详见 `docs/superpowers/specs/2026-06-21-overlay-architecture-design.md`。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 + Pinia + Vue Router + Vite + TypeScript |
| UI | Naive UI + Pure Ink 自定义主题（黑白灰）+ ECharts |
| 通讯 | Matrix（matrix-js-sdk）+ Socket.IO |
| 后端 | Koa + SQLite（Loop 工程化可选 PostgreSQL） |
| 桌面 | Electron（hermes-studio packages/desktop） |
| 测试 | Vitest（106 个测试文件，custom/**） |
| Agent | hermes-agent（运行时下载，OpenTelemetry GenAI 语义对齐） |

---

## 规模

- **177** 个 active B 类 patch（100% inject 通过率）
- **113** 个自定义 Vue 组件（Matrix Chat 50 / IA2 21 / Loop 25 / Kanban 14 / Cockpit 复用 2 / 其他 1）
- **106** 个单测文件（vitest，custom/**）
- 上游基础：hermes-studio v0.7.18 / hermes-agent v0.21.0 / element-web v1.12.27

## 设计文档

完整设计文档位于 `../docs/superpowers/`（specs + plans），覆盖 Cockpit、RunTraceView、Kanban、Matrix 集成、overlay 架构等。

## ⚠️ 同版本号覆盖更新的缓存陷阱

桌面端 `webuiDir()` 优先用 `~/.hermes-web-ui/webui/<version>/` 的副本。每次发版需递增版本号，重装后删除旧副本：

```bash
rm -rf ~/.hermes-web-ui/webui/<version>/
```

## 不包含

- hermes-agent（运行时首次启动自动下载，不在本仓）
