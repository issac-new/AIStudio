# zcode 源码底座设计——SwarmStudio 引擎层重构总纲

**主旨三句话**：本文唯一主旨是把 SwarmStudio 的会话引擎层从「hermes-studio 内置 codex 集成」切换为「upstream/zcode 开源源码为底座」，并在该底座上消化吸收六仓调研功能与手册八能力。写给本项目维护者，读后应能理解架构裁决、复用边界、吸收路线与每轮验收。读完促成按 R1-R5 路线图逐轮实施。

## 0. 决策变更声明

- **旧决策（2026-09-16，d974d3e spec D4）**：以 upstream 既有 codex 集成为 agent 底座，全量复用 zcode 对应的会话 UI 能力。
- **新决策（2026-09-23 用户裁定）**：**以 upstream/zcode 源码为底座**（二次开发），upstream 下各编码工具与《AI 原生研发范式实践手册》的已调研功能在此底座上消化吸收。
- **影响面**：`/ide` UI 保留（本就是 zcode 对齐产物）；引擎层从 hermes coding-agent 体系迁到 zcode 引擎服务；hermes 侧五引擎（claude-code/codex/pi/grok/dsh）过渡期保留。
- **定位红线（2026-09-25 用户裁定，纠偏）**：IDE 工作台的产物形态是**一个全新的编码工具（暂名 Ycode）**——以 zcode 源码为基底，统筹吸收融合各编码类工具的优势功能整合而成；**不是编码工具聚合器，不以"兼容/托管更多编码工具"为目标**。三条判定：① 与驾驶舱"沟通协作"流畅衔接，支撑人机协同研发；② 符合传统研发人员便利的使用习惯；③ 上游工具的优势功能须**融合进** Ycode 能力面，而非把工具**接入**为第 N 个可选项。"接为第 N 个托管 Agent"（如 patch 381/382 之 mimo）仅为过渡期对照/调研手段，不是路线终点。

## 1. 调研结论汇总（四份一手材料）

### 1.1 zcode 四层架构与复用地图

源码级调研（v3.14.0 @872ad96，全部锚点见仓库）结论：zcode 已把「引擎（core/adapters）—服务化（services/server/rpc）—协议（shared v4）—多 agent 编排（dynamic-workflow）」四层备齐。

| 层 | 结论 | 关键锚点 |
|---|---|---|
| contracts（事件词汇/Model/Tool/Port 接口） | 直接复用，视为冻结契约 | `apps/zcode-cli/packages/contracts/src/events/session.events.ts:83`（约 75 个事件，turn/tool/model/permission/hook/compact/subagent/workflow 全覆盖） |
| core 内核（turn-machine + AgentRuntime + tool 执行器） | 直接复用；以 deps 注入扩展，勿 fork | `runtime/agent-runtime.ts:228-308`（port 化构造，modelFactory/skillPort/mcpPort/subagentPort/permissionBroker/hookRunner 全注入面）；`tool/scheduler.ts:50`（拓扑排序+并行分组） |
| provider + AI SDK adapter | 直接复用；加 provider 是配置（apiType 三枚举），加协议才动代码 | `packages/provider/src/config/provider-data-schema.ts:4`；`adapters/src/model/model-execution.ts:364` |
| rpc + shared v4 + services + server | 直接复用，这就是引擎服务化层 | `packages/shared/src/zcode-protocol-v4/transport.ts:307`（V4_METHODS 约 30 个）；`packages/server/src/http.ts:110`（service 集合暴露） |
| dynamic-workflow + subagent + coordinator 端口 | **二开主战场**：驾驶舱「沟通协调/任务看板」语义是其 GUI 投影 | `contracts/src/interfaces/coordinator-response.port.ts:18`；`session.events.ts:140`（workflow 进度事件） |
| bootstrap（ZCodeApp/session-mapper/v4 projection） | 按需扩展：新增看板/协调事件投影在此加 | `bootstrap/src/zcode-protocol/session-mapper.ts`（1530 行，stream-json 与 v4 共用事件源） |
| TUI/web/desktop | 需要重写：SwarmStudio 自有驾驶舱 UI | 产品形态强耦合 |

**引擎服务面双通道**：① 无头 CLI `zcode -p <prompt> --output-format stream-json --cwd <dir>`（NDJSON 事件信封 `{type,eventId,sessionId,seq,timestamp,payload}`，`result` 行收尾，`--resume <sessionId>` 续跑，sqlite `~/.zcode/cli/db/db.sqlite` 持久化）；② 独立引擎服务 `packages/server/entry-http.ts`（Hono HTTP+WS :3030，`IZCodeAgentService` descriptor 通道，`packages/zcode-server-cli` 打成独立 bin）。宿主接入的最小面 = WS 连 3030 按 service descriptor 建 channel client（`packages/client/src/websocket.ts` 现成）。

### 1.2 六仓待吸收功能（第一批 10 项）

综合分析文档（`docs/upstream-analysis/*.md`，ncwk 根）得出 30 项功能点 × 优先级矩阵，第一批按落地顺序：

1. **dispatch reason code 词表**（multica）：queued/coalesced/runtime_offline 等 12 稳定枚举透传 UI chip——为什么没跑一眼可见。落 `packages/shared` 枚举 + UI chip。
2. **(task,agent) 认领四围栏 SQL**（multica）：同人串行+在线新鲜度+wakeup 修订号+优先级四道围栏一句 SQL。落 kanban/task 存储层。
3. **compact 六段交接提示词**（kimi）：真实意图/已定未定/精确命令与错误行/还不知道/前向计划/诚实标注——纯提示词资产即插即用。
4. **审批五档宽度+八态**（minimax+codex 合并批）：candidateScopes 五档（argv 精确前缀→wholeTool）+ ApprovedForSession/ExecpolicyAmendment 等决策态，「批准即学习」。落审批域+权限规则求值序（deny→ask→allow）。
5. **checkpoint/rewind 四恢复选项**（claude-code，概念级）：代码+对话/仅对话/仅代码/Summarize from here——zcode `gitCheckpointService` 已有双端点，补语义与 UI。
6. **runaway-guard 六信号**（minimax）：exact_action_repeat/same_error_family/abab_action_cycle 等 + 工具步进 HMAC 指纹。落 agent 循环步进 hook。
7. **@mention A2A 总线**（multica）：`[@agent]`=enqueue run、`[@member]`=人 inbox、`[@squad]`=leader，评论即总线全程留痕。落 comment/dispatch 域+会话输入。
8. **看板协调总线+门禁四件套**（routa）：列级 specialist 自动化 + COLUMN_TRANSITION + requiredHumanApproval/checklist/validator/gateMode 服务端强制。
9. **token-meter 三投影+StatsPills**（dsh）：tokenUsage/contextPressure/contextBreakdown 三段恒等 + TTFT/decode 逐 attempt 台账，与 zcode 既有 rounds 契约互校。
10. **子代理目录+continuation 路由+角色名册**（dsh+codex+kimi 合并批）：send_message 转向/interrupt 只停当前轮 + agent roles 配置层/昵称池/并发深度护栏 + profile 五级来源。

**第二批（架构级，需先行设计后单独裁决）**：ThreadItem 服务端投影+协议宏表治理（codex）、function-hooks 插件 API 契约形态（claude-code，概念级）、everything-is-a-plugin 内核（dsh）、视频/媒体间接引用链路（kimi）、事件日志会话存储（dsh）。

### 1.3 手册八能力 × zcode 底座对齐

手册第三章八能力位（差距分析原文见 `docs/superpowers/specs/2026-09-23-base-runtimes-design.md` §1，ncwk 根）换到 zcode 底座后的新对齐：

| # | 能力位 | zcode 底座现状 | 缺口动作 |
|---|---|---|---|
| 1 | Agent Harness | **强**：AgentRuntime port 化 + hooks 7 事件 + permission broker 双实现 | 补审批八态（第一批 #4） |
| 2 | 企业知识库 | 弱：memory/ 目录文件级 | semantica 经 McpPort 迁移（过渡期挂 hermes 侧不动） |
| 3 | 工具体系 MCP/Skill/CLI | 强：McpPort/SkillPort + MCP 工具注册进 ToolRegistry | pua 技能集迁移；命中率评测列路线 |
| 4 | Sandbox | 缺：桌面态本机执行 | 路线（第二批后再评） |
| 5 | Coding 环境 | 中：workspace 概念已有 | 环境定义 YAML 化列路线 |
| 6 | Identity & Policy | 中：permission rule-matching 已有 | 委托语义列路线 |
| 7 | Guardrail | 弱：无生产动作门控 | 三态 Evidence 门控列路线（手册 §3.3.2） |
| 8 | 可观测 Trajectory | 强：75 事件全量 + v4 projection + sqlite 会话库 | RunTrace 对接 v4 topic |

核心判断不变：编码只占研发链路 20-30%，主战场在环境与验证——zcode 的事件/投影/编排层正是「持续有效」的工程化基座。

## 2. 三案对比与裁决

| 案 | 形态 | 代价 | 收益 | 裁决 |
|---|---|---|---|---|
| A 包外挂 | zcode CLI 包成 hermes 第 7 个编码 agent（server ~10 处+client 7 组接线） | 最小改动 | zcode 仍是外挂进程；六仓功能吸收只能到「spawn 层」，进不了引擎 | 否 |
| **B 源码二开** | **zcode 仓受管 fork（pin+patch 层，同 overlay↔hermes-studio 模式）+ SwarmStudio 消费其引擎服务；内核只读，二开落在 server service 层与统筹级新 service** | 中：patch 机制一套 + WS 通道 + 会话投影 | 吸收深度直达引擎层（port/deps 注入面全开）；驾驶舱=workflow 投影 | **是** |
| C 全量重构 | SwarmStudio 全部迁进 zcode monorepo | 最高：驾驶舱/loop/kanban/matrix 全重写 | 单仓纯度 | 否 |

B 案与用户指令（二次开发/源码级迁移重构）及调研结论（「新宿主 app + server 侧新 service + 内核只读复用」）双向一致。

### D1 zcode 仓定位升级：UI 参照系 → 引擎源码底座（受管 fork）

- `upstream/zcode` 保持 git 干净（当前 @872ad96 clean）；ncwk 侧变更一律走 patch 层，复刻 overlay↔hermes-studio 的 inject/clean/series 协议（目录 `overlay/zcode-patches/`）。
- 升级纪律沿用 swarm-yuan 运行时升级轮协议：pin commit、克隆 tag、补核轮载体、升级后查规范层数字裂缝。上游 2026-09-21 才开源、无 tag、迭代快，pin 是硬前提。

### D2 接入通道：引擎服务（WS :3030）为主，无头 CLI 为辅

- 主通道 `IZCodeAgentService`（createSession/subscribeConversationV4/sendPrompt）；会话投影直接消费 v4 topic（conversation/sessions-index/workspace-config），不走 hermes 的 CanonicalResponsesEvent 归一化——zcode 事件词汇本就是单一事实源。
- 无头 CLI 保留为脚本化/CI 场景的辅助面（`-p --output-format stream-json`）。

### D3 过渡期双栈并存

- hermes 侧五引擎与 `/app` 驾驶舱、loop、kanban、matrix 协作全部不动；`/ide` 会话列逐轮切 zcode 引擎，切完前旧引擎不拆。
- base-runtimes（semantica patch 375 + pua）挂 hermes 侧现状保留；后续经 zcode McpPort 迁移，另行一轮。

## 3. 目标架构

```
SwarmStudio（overlay，UI/协作/驾驶舱）
├─ /ide 会话列 ──────────────┐
├─ /app 驾驶舱（看板/循环）──┤
└─ 统筹级新 service（跨 workspace 调度、@mention 总线、看板门禁）
        │ WS :3030（@zcode/rpc channel）
        ▼
zcode 引擎服务（packages/server，受管 fork + patch 层）
├─ IZCodeAgentService / IFileService / IGitService / ITerminalService
├─ v4 协议 topic 订阅 + workflow artifact 查询
└─ 按 workspace 复用的 CLI app-server 子进程（zcodeAgentProcessManager）
        ▼
zcode 内核（core/adapters，只读复用）
├─ AgentRuntime（port 注入面 = 全部扩展点）
├─ ToolRegistry/Scheduler/Executor（权限闸门+hook 流）
└─ dynamic-workflow + subagent + coordinator（多 agent 编排）
```

唯一允许碰内核的情形：新 port 进 `contracts/src/interfaces/` + adapters 实现 + `AgentRuntimeDeps` 注入 + 事件进 `SessionEventType`/v4 projection。除此之外的扩展全部落在 server service 层与统筹级新 service。

## 4. 路线图与验收

| 轮 | 内容 | 验收（硬标准） |
|---|---|---|
| R1 底座可运行性实证 | 工具链就绪（Node ≥24/pnpm 10.33.2 已核实）→ pnpm install + build → entry-http 起服务 → createSession + sendPrompt | 一个真实编码回合经 zcode 引擎完成（工具调用+文本产出可见），事件流可采 |
| R2 受管 fork + patch 机制 | `overlay/zcode-patches/`（series+inject/clean 脚本）+ zcode server 构建产物接入 SwarmStudio 启动链 | patch 往返幂等；SwarmStudio dev 链自动拉起 zcode server |
| R3 /ide 会话列切 zcode | WS 通道 + v4 会话投影 + resume；IDE 默认引擎 zcode（DEFAULT_IDE_AGENT 迁移） | 走查：新建会话/发消息/工具卡/续跑全通；hermes 五引擎仍可选 |
| R4 统筹级 service | 驾驶舱看板 × v4 workflow topic；第一批 #7 @mention、#8 看板门禁、#1/#2 dispatch 词表+认领围栏 | 看板列动即事件；@agent 派单可追溯到 run |
| R4 统筹级 service ✅（2026-09-25 全四批落地：P2 patch 398 会话投影+词表 / P3 @mention 派单总线 / P4 patch 399 看板门禁四件套+围栏验收；E2E 实跑修复帧回调时序） |
| R5 吸收批 ✅（2026-09-25：#3 patch 400 / #6 patch 401 / #4 patch 402 / #9 patch 403 / #10 patch 404 名册层+continuation 经核实原生已有（delegate background+action steer/stop） / #5 checkpoint-options 组合层；mimo P6 ngram+P7 写手 patch 405，goal 冷裁判原生已有；P4 记忆 FTS 按 spec 分期留独立轮） |
| R5+ 功能吸收轮 | 第一批剩余（#3 compact/#4 审批/#5 checkpoint/#6 runaway-guard/#9 token-meter/#10 子代理名册），每轮 1-2 项 | 每项带守门测试 + 实机走查 |

## 5. 许可红线与风险

- **claude-code 专有**：只搬功能概念与工作流设计，禁拷任何代码/提示词/配置结构（第一批 #5 须自研重写）。
- **minimax-code**：`LICENSE-STATUS.md` 声明部分目录许可不同（`third_party/`、TUI 引擎受限），取用前必查。
- **zcode 上游**：新开源无 tag 迭代快——pin + 受管 fork 是硬前提；每次升级跑全量回归。
- **双栈并存期**：两套会话存储（hermes sessions 表 + zcode sqlite）不互通，/ide 切换轮里显式处理迁移语义。
- 分析文档（`docs/upstream-analysis/*.md`）是概念源不是代码源；吸收一律自研重写。

## 6. 与既有资产的关系

- `/ide` UI 全保留（zcode 对齐产物即底座原生 UI）；`2026-09-16-ide-main-page-design.md` D4 由本文取代。
- 手册 OCR 全文已备份 `docs/upstream-analysis/ai-native-handbook-ocr.txt`（ncwk 根，190,630 字符）。
- swarm-yuan 方法论仓不受影响；本仓 overlay patch 序列 377 之后续编。
