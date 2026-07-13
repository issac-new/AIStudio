# RunTraceView — 运行全过程可观测性(第 1 层)设计

> 状态:待评审  
> 日期:2026-06-27  
> 主题:RunTraceView 第 1 层(纯前端、零运行时改动)的 TraceSpan 数据模型、接电方式、证据分层与视图交互  
> 关联:`2026-06-27-observability-landing-analysis.md`(落地分析)  
> 架构参考:OpenRath Session Graph 思想(不引入其运行时,仅借鉴 Session 作为证据载体、动态图、可插拔后端三支柱的抽象)

## 1. 背景与目标

### 1.1 问题

当前运行过程的呈现完全是**线性聊天消息流**(`chat.ts` 的 `handleEvent` 把事件压成 `Message[]`)。当系统扩到多 agent 协作、调 MCP/Skills/ACP/Claude Code、联动远端 Git/ELK/DB、跨机分布式协同时,线性流无法呈现"并行/交叉/派生/收敛",调试、复现、编排全部失控。

### 1.2 目标(第 1 层边界)

第 1 层是**纯前端、零运行时改动**的运行全过程可观测性呈现:

- 把已有的 Socket.IO 事件流(`run/tool/subagent/usage/reasoning`)重构成 **Evidence Graph**(证据图),呈现运行全过程的并行/派生/收敛。
- skill 可下钻,展开内部"思维链 + 工具"交错编排。
- 思维链以动态激活流转呈现(想→做→想→做)。
- 严格区分证据来源层级,UI 永远只显示可信证据,拿不到的数据显式标注占位,不伪造。

### 1.3 非目标(留给后续层级)

- **LLM span 边界**:前端事件流无单次 LLM 调用边界事件,留第 2 层(运行时 `pre/post_api_request` hook)。
- **Hindsight recall/commit 准确呈现**:memory provider 不进 SessionDB、不传前端,留第 2 层。
- **分布式 peer 准确拓扑**:无统一 peer 抽象,留第 3 层 trace propagation。
- **claude code/codex 完整工具**:走独立 SSE 通道,不经 hermes-agent tool hook,留第 2 层专门 adapter。

## 2. 据实核查的事实约束

本设计的每个决策都基于对代码的核查,关键事实如下(均有 file_path 证据):

| 事实 | 证据 | 对设计的约束 |
|---|---|---|
| 事件流经 `registerSessionHandlers(sid, handlers)`,支持多消费者 | `api/hermes/chat.ts:129-155` | RunTraceView 可并行订阅,不侵入聊天流 |
| `RunEvent` 已带 `timestamp/tool/preview/error/usage/session_id/run_id` | `api/hermes/chat.ts:47-90` | 数据基础已具备 |
| `handleEvent`(`chat.ts:2887`)按 `evt.event` 分发,压成线性 Message | `chat.ts:2887-3353` | RunTraceView 不改它,另起并行消费者 |
| tool.completed 带 `duration` | `chat.ts:3130` | tool 节点 durationMs 第 1 层可靠 |
| subagent 事件带 `task_index/task_count/api_calls/input_tokens/output_tokens` | `chat.ts:1388-1451` | 子 agent 嵌套树可建 |
| 前端无单次 LLM 调用边界事件 | bridge/tui_gateway/coding-agent 三路径核查 | LLM span 不作独立 kind,留第 2 层 |
| reasoning 字段持久化 + `reasoning.delta` 流式 | `hermes_state.py:562-565`、`chat.ts:2999-3039` | 思维链文本第 1 层可见 |
| skill 无声明式 tools/steps,loader 不解析编排 | `skills_tool.py:28-46,660-668` | skill 子图靠激活期间 tool 调用,非声明 |
| skill 工具调用走 tool hook 但无 active_skill 标签 | `tool_executor.py:633-647`、`skill_commands.py:245-345` | skill 归因第 1 层用时间窗口推断,第 2 层打标签准确 |
| Hindsight 是 memory provider,prefetch/sync_turn 不持久化 | `memory_provider.py:93-131`、`conversation_loop.py:716-732` | memory 节点第 1 层不可见,留第 2 层 |
| workflow DAG 数据层已存在(snapshot_nodes/edges + node_id↔session_id) | `workflow-run-store.ts:7-38` | 主图以 Workflow DAG 为骨架,非凭空画 |
| MCP/Skills 走 tool hook;ACP 执行走 hook 但进度独立;claude code 独立 SSE | hermes-agent tool_executor / coding-agent-event-mapper 核查 | tool 节点 L1 可见;claude code 需专门 adapter(第 2 层) |
| 分布式无统一 peer 抽象 | 全局 grep peer/cluster/worker | peer 节点 L3 占位 |
| 现有主题是黑白水墨,light/dark 双主题 | `styles/variables.scss:7-111` | 视觉严格守水墨 token |

## 3. 数据模型

### 3.1 证据层级(贯穿节点与边)

```ts
type EvidenceTier = 'L1' | 'L2' | 'L3'
```

- **L1**:前端事件流已可靠可见 → 边实线、节点实边框,立即可用。
- **L2**:运行时 hook 后准确补齐 → 边虚线、节点 `推断` 标签。
- **L3**:分布式 trace propagation 后补齐 → 边点线、节点虚边框 `future`。

**不可伪造原则**:L2/L3 节点若第 1 层拿不到真实数据,必须用 `future` 样式或 `推断` 标签呈现,绝不画成 L1 实线节点误导用户。

### 3.2 TraceNode

```ts
type TraceNodeKind =
  | 'ingress' | 'workflow' | 'agent' | 'skill' | 'tool'
  | 'memory' | 'service' | 'peer' | 'approval'

type SpanStatus = 'running' | 'ok' | 'error' | 'cancelled'

interface TraceNode {
  id: string                  // `${kind}:${sessionId}:${seq}` 或 toolCallId
  kind: TraceNodeKind
  label: string
  detail?: string             // model/workspace/skill version
  status: SpanStatus
  startedAt: number           // ms(来自事件 timestamp)
  endedAt?: number
  durationMs?: number         // tool 可靠(L1);memory/peer 无(L2/3 补)
  evidence: EvidenceTier
  children?: TraceTimelineItem[]  // skill/agent 可下钻
  ref?: {
    sessionId?: string
    runId?: string
    toolCallId?: string
    workflowNodeId?: string
  }
}
```

### 3.3 skill 下钻子时间线

```ts
type TraceTimelineItemKind = 'thinking' | 'tool' | 'memory'

interface TraceTimelineItem {
  id: string
  kind: TraceTimelineItemKind
  ts: number
  text?: string               // 思维链 / 记忆召回文本
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  durationMs?: number
  status?: SpanStatus
  attribution: 'inferred' | 'accurate'  // 第1层推断 / 第2层准确
}
```

### 3.4 TraceEdge

```ts
type EdgeKind = 'spawn' | 'call' | 'recall' | 'converge' | 'delegate'

interface TraceEdge {
  id: string
  from: string
  to: string
  kind: EdgeKind
  evidence: EvidenceTier      // L1实线 / L2虚线 / L3点线
}
```

## 4. 接电方式

### 4.1 并行订阅(不侵入聊天流)

RunTraceView 通过 `registerSessionHandlers` 注册第二套 handler,与 chat store 的 handler 并行消费同一 session 事件,互不干扰。

```ts
// overlay/custom/client/cockpit/composables/useRunTrace.ts
export function useRunTrace(sessionId: Ref<string | null>) {
  const nodes = ref<TraceNode[]>([])
  const edges = ref<TraceEdge[]>([])
  let activeSkill: { id: string; startedAt: number } | null = null
  const openTools = new Map<string, TraceNode>()

  // registerSessionHandlers 要求 13 个必填回调全提供。
  // RunTraceView 只关心 run/tool/subagent/reasoning/usage,其余给 noop。
  const noop = () => {}
  function attach(sid: string): () => void {
    return registerSessionHandlers(sid, {
      onRunStarted, onRunCompleted, onRunFailed,
      onToolStarted, onToolCompleted, onSubagentEvent,
      onMessageDelta, onReasoningDelta, onThinkingDelta,
      onReasoningAvailable, onUsageUpdated,
      // 必填但 trace 不关心 → noop
      onCompressionStarted: noop, onCompressionCompleted: noop,
      onAbortStarted: noop, onAbortCompleted: noop,
    })
  }
  // registerSessionHandlers 返回 cleanup 函数,优先用它;兜底 unregisterSessionHandlers
  let cleanup: (() => void) | null = null
  function detach() { cleanup?.(); cleanup = null }

  watch(sessionId, (sid, old) => {
    detach()
    nodes.value = []; edges.value = []; resetInternal()
    if (sid) cleanup = attach(sid)
  }, { immediate: true })
  onUnmounted(detach)
  return { nodes, edges }
}
```

### 4.2 事件 → 节点/边 映射

| 事件 | 产出 | 证据层 |
|---|---|---|
| `run.started` | agent/workflow 根节点 + ingress 父 + spawn 边 | L1 |
| `tool.started` | tool 节点(running)+ call 边 | L1 |
| `tool.completed` | 闭合 tool(duration/status/result) | L1 |
| `subagent.start` | agent 子节点 + delegate 边(嵌套) | L1 |
| `subagent.complete` | 闭合子 agent(api_calls/tokens) | L1 |
| `reasoning.delta` | 累积进 skill/agent children 的 thinking 项 | L1(文本) |
| `message.delta` | 累积进 run/agent 节点的正文输出(非思维链,不进 thinking 项) | L1(文本) |
| `usage.updated` | 更新 run 节点 token 统计 | L1 |
| skill 激活(skill_view/slash) | skill 节点 + 设 activeSkill 时间窗口 | L1(调用) |
| Hindsight recall/commit | memory 节点 + recall 边 | L2(占位) |
| 远端 peer | peer 节点 + dotted 边 | L3(占位) |

### 4.3 skill 归因:时间窗口启发式

skill 无 `active_skill` 标签,工具/思维链归因靠时间窗口:`skill_view` 事件后、下次 skill 切换或 run 结束前的 tool/thinking 归给该 skill,标 `attribution: 'inferred'`。第 2 层运行时打 `active_skill` 标签后切 `accurate`。

### 4.4 历史回放

`resumeSession`(`chat.ts:727`)返回 `events: Array<{event, data: RunEvent}>`,服务端重放历史事件。同一套 handler 处理这批事件即可重建历史树,live 与回放共用同一构建逻辑。

### 4.5 L2/L3 占位

第 1 层拿不到的数据(Hindsight recall、远端 peer、git/ELK/DB 关联)不凭空生成:从已有数据(workflow snapshot_nodes/edges)推断占位时渲染为 `future` 节点 + `evidence: 'L3'`;第 2/3 层补齐时经 Koa API 回填真实数据,evidence 升级。

## 5. 视图与交互

### 5.1 融合布局(全屏 Modal)

```
┌─ TopBar: run 概览(dot/title/metrics) ─────────────────────────┐
├─ TimeBand: 甘特泳道(并行/重叠/耗时) ────────────────────────────┤
│  Evidence Graph(主图)              │  Inspector(详情抽屉)      │
│  Ingress / Workflow-Agent /         │  选中节点详情              │
│  Tools-Memory-Service / Peers 泳道  │  概览/思考流/参数/结果/diff │
└──────────────────────────────────────────────────────────────────┘
```

- 主图:vue-flow(已在依赖内)渲染 TraceNode/Edge,四泳道分层,节点复用 GraphNode 卡片样式(`is-focus` 加粗边框 + 柔光)。
- TimeBand:echarts(已在依赖内)或 div 甘特条,横轴时间,色块宽 = durationMs。
- Inspector:复用 Cockpit 详情抽屉样式,随选中节点联动。

### 5.2 交互

| 交互 | 行为 |
|---|---|
| 点击节点 | 成焦点,非焦点淡化 32%,相关边高亮 + 粒子流,Inspector 联动 |
| 点击 skill 节点 | 下钻:主图替换为 skill 内时间线(思维链+工具交错) |
| ▶ 生长重放 | 节点按 startedAt 逐个 grow + 进度条注入 + 边粒子流 |
| 思维链动态流转 | 激活节点墨韵脉冲 + 沿边粒子流 + 思维浮窗淡入光标闪烁 |
| 焦点模式切换 | has-focus class 控制非焦点淡化 |
| 双主题 | 跟随 app 主题,复用 variables.scss token |

### 5.3 skill 下钻视图

skill 节点点击后,主图区切换为该 skill 内部时间线:思维链(thinking)与工具(tool)按 ts 交错,复用 CockpitTimeline 竖线+圆点视觉;每项带 attribution 标签(推断/准确);memory 项虚边框 + 第2层标签。

### 5.4 证据线型渲染

```ts
const EDGE_STYLE: Record<EvidenceTier, string> = {
  L1: '', L2: 'dashed', L3: 'dotted',
}
const NODE_FUTURE_TIERS: EvidenceTier[] = ['L3']
```

## 6. 组件拆分

```
overlay/custom/client/cockpit/
  adapters/run-trace-adapter.ts        # 纯函数:RunEvent → TraceNode/Edge,可单测
  composables/useRunTrace.ts           # 订阅器:attach/detach + 状态
  components/
    CockpitRunTraceModal.vue           # 全屏 Modal 容器(三区布局 + 主题)
    RunTraceGraph.vue                  # vue-flow 主图(泳道+节点+边+粒子流)
    RunTraceTimeBand.vue               # 顶部甘特时间带
    RunTraceInspector.vue              # 右侧详情抽屉
    RunTraceSkillDrilldown.vue         # skill 下钻时间线
```

每个组件单一职责:adapter 纯函数可测,composable 管订阅生命周期,组件只渲染。复用 `useToolTraceVisibility` 模式(localStorage 开关)控制 Modal 显隐。

## 7. 入口与触发

- 从 CockpitTimeline 双击某次 run,或任务详情"执行次数"打开 Modal(复用 HistoryModal/NotifyModal overlay 模式)。
- Modal 内 `useRunTrace(sessionId)` 自动 attach 当前 session 展示 live;打开历史 run 则 `loadHistoricalTrace` 回放。
- 经 `registries/client/bootstrap.ts` 注册,符合 AGENTS.md(仅改 overlay,upstream 经 patch)。

## 8. 约束与遵循

- **不修改 upstream**:全部在 `@/custom/cockpit/` 新增,经 registries 注册。
- **不修改 chat store**:并行消费者,handleEvent 原样保留。
- **prompt cache 零影响**:纯前端订阅,不触碰 hermes-agent 运行时。
- **零新增依赖**:vue-flow/echarts 已在依赖内(overlay node_modules 指向上游符号链接)。
- **主题跟随 app**:所有颜色用 `var(--*)`,light/dark 自动适配。
- **不可伪造**:L2/L3 节点显式标注占位,不在第 1 层伪造数据。

## 9. 测试策略

- `run-trace-adapter.ts` 纯函数单测:喂构造的 RunEvent 序列,断言产出的 TraceNode/Edge 结构、evidence 层级、skill 归因(attribution)、时间排序。
- 覆盖关键场景:单 run 线性、subagent 嵌套派生、skill 激活期间工具归因、tool error 收敛、历史回放重放、L2/L3 占位不伪造。
- 测试纳入 overlay 现有 vitest 配置(`custom/**/*.test.ts`)。

## 10. 后续层级衔接

- **第 2 层**:hermes-agent observability 插件(参考 langfuse/nemo_relay),订阅 `pre/post_api_request`、`pre/post_tool_call`、memory hook,落盘 JSONL(借鉴 OpenRath header/chunk/trailer)。补齐 LLM span、memory recall/commit、claude code 工具、active_skill 准确归因。
- **第 3 层**:Koa 只读 API(`GET /sessions/:id/trace`),回填 L2 数据;peer trace propagation 补 L3。
- **第 4 层**:证据档案(evidence dossier)导出,对齐 OpenRath"证据卷宗"。
