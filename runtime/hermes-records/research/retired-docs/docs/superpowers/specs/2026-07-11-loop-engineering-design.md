# Loop Engineering — 循环工程管理系统设计

> 状态:待评审
> 日期:2026-07-11
> 主题:SwarmStudio Loop Engineering 功能——把"人逐条 prompt agent"升级为"系统驱动 agent 循环"，覆盖发现→交接→验证→持久化→调度五阶段
> 关联:GitHub issue issac-new/SwarmStudio #1（增加 Loop Engineering 的对应管理功能）
> 调研基础:Addy Osmani《Loop Engineering》原文 + Armin Ronacher《The Coming Loop》批评 + Martin Fowler《Humans and Agents in Software Engineering Loops》+ 14 个同类项目横向对比 + UI/可观测模式调研
> 架构参考:overlay A/B 分类（custom/ 纯新增 + patches/ upstream 骨架改动 + registries/ 运行时注册）+ cockpit adapter 模式

## 0. 摘要

本设计实现一个 Loop Engineering 管理系统，让用户定义一个递归目标（loop），系统按 cadence 或事件触发，自动经历**发现→交接→验证→持久化→调度**五阶段循环，直到满足可验证的停止条件。

系统采用**单体引擎 + State Store 适配器**架构：loop 引擎（编排/验证/调度/派发/UI）写一次全层共用，仅通过 State Store 适配器接口区分三层部署——个人层（本地文件）、团队层（Matrix 房间状态事件）、SaaS 层（多租户 PostgreSQL）。

首期交付个人层（M1-M3），包含完整引擎、LocalStore、三类验证器、cron+webhook+7 pattern 调度、worktree 管理、子代理派发、hook 生命周期闸门、Loop Spine UI。

---

## 1. 背景与目标

### 1.1 问题

issue #1 要求提供项目在 Loop 循环中管理、观察、处理的入口，覆盖发现→交接→验证→持久化→调度各过程。参考 Addy Osmani《Loop Engineering》提出的 5+1 原语（Automations / Worktrees / Skills / Plugins+Connectors / Sub-agents + State/Memory）。

当前 SwarmStudio 已具备部分底层基础（Kanban `auto_decompose` 编排、RunTrace 对 `subagent` 事件的可观测、任务级 worktree/scratch 工作区隔离、hermes-agent 子代理运行时），但缺少把它们串成五阶段闭环的编排与管控层。

### 1.2 目标用户（三层全要）

| 层 | 场景 | State 机制 |
|---|---|---|
| 个人 | 单人本地自驱，跑 loop 自动分诊自己的 issue/CI，自己审批 | 本地文件（STATE.md 脊柱） |
| 团队 | 小团队经 Matrix 消息渠道打通 hermes agent 和 SwarmStudio 共享 loop 调度 | Matrix 房间状态事件 |
| SaaS | 把 loop 能力作为 SwarmStudio 卖点功能对外提供 | 多租户 PostgreSQL |

### 1.3 目标

- **统一引擎**：5 阶段编排核心写一次，三层共用，仅 State Store 适配器不同
- **可见可控**：Loop Spine UI 提供状态脊柱总览 + 环形阶段图下钻
- **可信验证**：三类验证（Programmatic + Judge + Human），拒绝"全凭感觉验证"，judge 用不同模型族
- **可扩展调度**：cron + webhook 触发 + 7 命名 pattern 预设
- **治理理解债**：STATE.md 人可读脊柱 + fork-from-checkpoint + L1→L2→L3 渐进自治

### 1.4 非目标（首期）

- SaaS 层的租户管理 UI、账单系统（三期）
- Matrix 层的租约选举完整实现（二期）
- Skills 的 `SKILL.md` 自动生成（后续里程碑）
- 全自动 PR 合并（L3 才支持，且 gate='always' 不可跳过）

---

## 2. 调研吸收的关键洞察

### 2.1 原文与批评

| 来源 | 洞察 | 吸收到设计 |
|---|---|---|
| Addy Osmani《Loop Engineering》 | 5+1 原语（Automations/Worktrees/Skills/Connectors/Sub-agents/State）；`/goal` 每轮后独立小模型查完成 | 五阶段编排 + stopCondition 独立模型检查 |
| Armin Ronacher《The Coming Loop》 | 循环让责任消解；代码看似更健壮实则更难理解；"被强迫采用"风险 | L1→L2→L3 渐进自治；STATE.md 可读脊柱治理解债 |
| Martin Fowler《Humans and Agents》 | 人应"on the loop"（改进 harness）而非"in"（瓶颈）或"out"（vibe coding） | Human gate 设计；hook 生命周期闸门 |
| Boris Cherny（Claude Code） | "我不再 prompt Claude，我写 loop 来 prompt Claude" | 系统驱动而非人驱动 |

### 2.2 同类项目吸收（14 个）

| 项目 | 吸收点 |
|---|---|
| Codex CLI/Cloud | detached-HEAD worktree-per-task；`.worktreeinclude` 拷入被忽略文件；Handoff（git 操作搬工作而非共享分支）；`/goal` 独立小模型每轮查完成 |
| Claude Code | 完整 hook 分类（PreToolUse/PostToolBatch/TaskCompleted/WorktreeCreate）；5 种 handler（command/http/mcp_tool/prompt/agent）；Coordinator 子代理自身不能读写代码；SendMessage 唤醒已停子代理；深度5嵌套上限 |
| OpenHands | 无状态 agent + 事件溯源；Condenser 返回 View/Condensation；3 级 SecurityAnalyzer；Stuck Detector；OTel 追踪含 token/cost/latency |
| valkor-ai/loom（531★） | agent 不拥有工作流——"请求→读声明→写产物→提交→被校验"；requestReadPlan 带写边界+验证意图+结果模板；多目标修复路由（代码/计划/架构）；finalResponseGuard 防伪完成 |
| ksimback/looper（656★） | 3 类验证强制分类（Programmatic/Judge/Human）；拒绝"全凭感觉验证"；judge 须不同模型族；`loop lint --strict` CI 闸 |
| cobusgreyling/loop-engineering（6.9k★） | 5 契约文件（LOOP.md/STATE.md/budget/constraints/run-log）；loop-sync 漂移检测；7 命名 pattern（带 cadence+level+cost）；L1→L2→L3 渐进上线 |
| snarktank/ralph（21k★） | 无状态轮 + 3 文件持久（git+progress.txt+prd.json 的 passes 布尔）；严格任务切分（须适配单 context 窗口） |
| LoongFlow（446★） | PES 循环（Plan-Execute-**Summary** 显式写回记忆） |
| Aider | 树-sitter 图排序 repo map（动态 token 预算）；architect/editor 拆分 |
| Cline | Plan/Act 模式切换；响应式流监控长进程；Kanban 卡各带 worktree+依赖链 |
| gpt-pilot | 10 命名角色管线（Spec Writer→...→Reviewer→Debugger）；Reviewer 打回 Code Monkey |
| smol-developer | shared_dependencies.md 作跨文件契约；Agent Protocol（task_id+stepwise POST） |
| AgentGuard | 费用作 kill 信号；throw/notify/kill 三模式；`.agentGuardData` 优雅降级 |
| SWE-agent | 不用 cat——自建文件查看器；编辑即触发 linter |

### 2.3 UI/可观测模式吸收

| 模式 | 来源 | 吸收点 |
|---|---|---|
| 分层式布局 | Temporal 表格 + LangGraph 节点图 | 侧边栏+表格总览，环形阶段图下钻 |
| 粒度滑块 | LangGraph Studio | 控制历史详情密度 |
| 多格式历史 | Temporal（Timeline/All/Compact/JSON） | 同数据多视图 |
| 颜色状态分类 | Trigger.dev | 灰/蓝/绿/红 + 每种失败不同图标 |
| fork-from-checkpoint | LangGraph | 从任意检查点分叉不丢原史 |
| 持久可分享视图 | Temporal | 保存/分享过滤视图 |
| 阈值自动标记 | Temporal | N 次连续失败自动浮出 |
| Momentum 指标 | Linear | 进度可读治理解债 |

---

## 3. 整体架构与模块布局

### 3.1 架构方案：单体引擎 + State Store 适配器

```
┌─────────────────────────────────────────────────────────┐
│  Loop Spine UI（Vue，注册到 registries/client）          │
│  分层式：侧边栏+表格总览 → 环形阶段图下钻                  │
├─────────────────────────────────────────────────────────┤
│  Loop Engine（custom/server，纯逻辑，层无关）              │
│  ├ 任务契约（写边界+验证意图+结果模板，Loom 模式）          │
│  ├ 5 阶段编排：发现→交接→验证→持久化→调度                   │
│  ├ worktree-per-task 生命周期管理                          │
│  ├ 验证器（Programmatic+Judge+Human 三路）                │
│  ├ hook 生命周期闸门（PreToolUse/PostToolBatch/...）      │
│  ├ 子代理派发（制造者/检查者分离）                         │
│  └ 调度器（cron+webhook+7 pattern 模板）                   │
├─────────────────────────────────────────────────────────┤
│  State Store 适配器接口（同 cockpit adapter 模式）         │
├──────────────┬───────────────┬──────────────────────────┤
│ Local        │ Matrix         │ SaaS Server              │
│ (STATE.md)   │ (房间状态事件)  │ (多租户DB)               │
└──────────────┴───────────────┴──────────────────────────┘
```

选择理由：
1. 三层需求 + "预留扩展"要求，决定了必须有一次接口抽象——在 State Store 层做一次，其余全共用
2. 完美复用 overlay 已建立的 adapter 注册模式（cockpit 的 task-adapter/attention-adapter 等）
3. 首期工作量不大于耦合方案（Local adapter 就是文件读写，极薄），不欠技术债
4. Matrix 团队层有现成集成（matrix-chat 模块 50+ 组件），adapter 换成"读写 Matrix 房间状态事件"即可

### 3.2 代码落点（严格遵循 overlay A/B 分类）

```
overlay/
├── custom/
│   ├── client/loop/                    ← A 类：纯新增前端
│   │   ├── views/
│   │   │   ├── LoopSpineView.vue       总览+下钻主视图
│   │   │   └── LoopDetailView.vue      单 loop 详情
│   │   ├── components/
│   │   │   ├── LoopSidebar.vue          侧边栏（全部/运行中/待审批/阻塞/归档）
│   │   │   ├── LoopTable.vue           总览表格
│   │   │   ├── StageRing.vue           环形阶段图（5 阶段）
│   │   │   ├── StageNode.vue           单阶段节点
│   │   │   ├── TaskContractCard.vue    任务契约卡
│   │   │   ├── VerifierPanel.vue       三类验证面板
│   │   │   ├── ScheduleEditor.vue      调度编辑器（cron/webhook/pattern）
│   │   │   ├── WorktreeStatus.vue       worktree 状态行
│   │   │   └── LoopCreateWizard.vue    新建 Loop 向导
│   │   ├── composables/
│   │   │   ├── useLoopState.ts          loop 状态订阅
│   │   │   ├── useStageTransition.ts   阶段流转
│   │   │   └── useVerifier.ts           验证器调用
│   │   ├── store/
│   │   │   └── loop.ts                  Pinia store
│   │   ├── adapters/                    ← 前端适配器（同 cockpit 模式）
│   │   │   ├── loop-adapter.ts          loop 列表聚合
│   │   │   └── stage-adapter.ts         阶段事件聚合
│   │   └── styles/loop.scss
│   │
│   ├── server/loop/                    ← A 类：纯新增后端
│   │   ├── engine/
│   │   │   ├── loop-engine.ts           5 阶段编排核心
│   │   │   ├── task-contract.ts         任务契约模型（Loom 式）
│   │   │   ├── worktree-manager.ts      worktree 生命周期
│   │   │   ├── verifier.ts              三路验证调度
│   │   │   ├── scheduler.ts             cron+webhook+pattern
│   │   │   ├── subagent-dispatcher.ts   制造者/检查者派发
│   │   │   └── hooks.ts                 hook 生命周期闸门
│   │   ├── connectors/
│   │   │   ├── github-connector.ts      issues/CI/commits
│   │   │   ├── local-git-connector.ts   本地 git log/未推送
│   │   │   └── webhook-connector.ts     通用 webhook 端点
│   │   ├── store/
│   │   │   ├── state-store.ts            适配器接口
│   │   │   ├── local-store.ts            Local adapter（STATE.md）
│   │   │   ├── matrix-store.ts           Matrix adapter（房间状态事件）
│   │   │   └── saas-store.ts             SaaS adapter（多租户DB）
│   │   └── controllers/loop.ts           REST API
│   │
│   └── hermes-agent-plugins/loop/       ← A 类：agent 侧插件
│       ├── __init__.py
│       ├── loop_executor.py              执行 loop 任务
│       ├── loop_verifier.py              Judge 验证器
│       └── plugin.yaml
│
├── patches/
│   └── 133-loop-nav-entry.patch         ← B 类：注入导航入口+路由
│
├── config/
│   └── loop-config.ts                   ← State adapter 选择 + hook 配置
│
├── registries/client/index.ts            ← 注册 route + nav + component
└── tests/client/
    └── loop-*.spec.ts                   ← vitest 套件
```

### 3.3 运行时数据流

```
用户在 Spine UI 操作
       │
       ▼
LoopSpineView.vue ──HTTP/Socket.IO──▶ controllers/loop.ts
       ▲                                    │
       │                                    ▼
       │                              loop-engine.ts
       │                                    │
       │                    ┌───────────────┼───────────────┐
       │                    ▼               ▼               ▼
       │              scheduler.ts    verifier.ts    subagent-dispatcher.ts
       │                    │               │               │
       │                    ▼               ▼               ▼
       │              connectors/       Programmatic    hermes-agent
       │              (github/local/    + Judge model    (制造者/检查者)
       │               webhook)         + Human gate
       │                    │               │               │
       │                    └───────┬───────┘               │
       │                            ▼                       │
       │                      state-store.ts ◀─────────────┘
       │                      (Local/Matrix/SaaS)
       │                            │
       └──── Socket.IO 推送 ◀───────┘
            (loop.* 事件，同 RunTrace 模式)
```

### 3.4 注册方式

在 `registries/client/index.ts` 注册：
- **路由**：`/loop` → LoopSpineView，`/loop/:id` → LoopDetailView
- **导航**：侧边栏 "Loop Engineering" 入口
- **组件**：StageRing / VerifierPanel 等可复用组件

导航注入通过 B 类 patch（`133-loop-nav-entry.patch`）在 upstream 的导航骨架上加一条侧边栏项，与现有 cockpit/kanban 注册方式一致。

### 3.5 与现有模块的关系

- **cockpit**：loop 是 cockpit 的上游——cockpit 观察"单个 agent run 的 trace"，loop 观察"多个 agent 的循环编排"。可共享 task-adapter / attention-adapter 的数据源
- **kanban**：loop 的"持久化"阶段写入 kanban 任务（复用 `triage` 状态桶 + `auto_decompose`），不另建任务系统
- **RunTrace**：loop 的"交接"阶段产生的 `subagent` 事件由 RunTrace 渲染，loop 只管调度不管渲染
- **matrix-chat**：团队层的 Matrix state adapter 直接基于 matrix-chat 已有的 store/composables

---

## 4. Loop 数据模型

### 4.1 Loop 实例

```typescript
/** 一个 Loop = 一个递归目标，按 cadence 或事件触发迭代直到完成 */
interface LoopInstance {
  id: string                          // 'loop/auth-triage-20260711'
  name: string                        // 'Auth 模块每日分诊'
  goal: string                        // 递归目标（自然语言，喂给 agent）
  stopCondition: string               // 可验证停止条件（'/goal' 原语）
  pattern: LoopPattern                // 7 命名 pattern 之一
  schedule: ScheduleConfig            // cron/webhook/手动
  stage: LoopStage                    // 当前阶段
  status: LoopStatus                  // 运行态
  autonomyLevel: AutonomyLevel        // L1/L2/L3
  stateAdapter: 'local' | 'matrix' | 'saas'
  createdAt: string
  updatedAt: string
  lastTickAt: string | null
  nextTickAt: string | null
  budget: BudgetConfig                // 费用上限（AgentGuard 模式）
  stats: LoopStats                    // 进度统计
}

type LoopStage = 'discovery' | 'handoff' | 'validation' | 'persistence' | 'scheduling'
type LoopStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'awaiting-review' | 'completed' | 'failed'
type AutonomyLevel = 'L1' | 'L2' | 'L3'   // 报告/辅助修复/无人值守

interface LoopStats {
  totalIterations: number
  tasksDiscovered: number
  tasksCompleted: number
  tasksBlocked: number
  totalCost: number                   // 累计 token 费用
  currentIteration: number
}
```

### 4.2 五阶段状态机

```
                         ┌─────────────────────────────┐
                         │                             │
                         ▼                             │
  ┌─────────┐      ┌──────────┐      ┌──────────┐      │
  │discovery│─────▶│ handoff  │─────▶│validation│     │
  │  发现   │      │  交接    │      │  验证    │      │
  └────┬────┘      └────┬─────┘      └────┬─────┘     │
       │                │                 │            │
       │          (worktree创建)    ┌─────┴──────┐    │
       │                │           │            │    │
       │                │      pass │       fail │    │
       │                │           ▼            ▼    │
       │                │     ┌─────────┐  ┌────────┐  │
       │                │     │persistence│ │repair  │  │
       │                │     │ 持久化  │  │(回 handoff)│
       │                │     └────┬────┘  └────────┘  │
       │                │          │                    │
       │                │          ▼                    │
       │                │     ┌──────────┐              │
       │                └────▶│scheduling│──────────────┘
       │                       │ 调度    │ (下一 tick)
       │                        └──────────┘
       │                              │
       └──(stopCondition 满足)─────────▶ completed
```

阶段流转规则：
- **discovery → handoff**：发现器产出 ≥1 个可操作项 → 进入交接；发现为空 → 直接到 scheduling 等下一 tick
- **handoff → validation**：worktree 创建成功 + 制造者 subagent 产出已提交 → 进入验证
- **validation pass → persistence**：三类验证（Programmatic+Judge+Human）按自治级策略全过 → 持久化
- **validation fail → handoff**（repair）：回交接阶段，带失败原因给制造者 subagent 重做
- **persistence → scheduling**：写入 kanban + commit/PR + 更新 STATE → 等待下一 tick
- **stopCondition 满足 → completed**：每轮末尾独立小模型检查（非执行 agent）

### 4.3 任务契约（Loom 式）

```typescript
/** 一个 handoff 产物 = 一个有界任务契约 */
interface TaskContract {
  id: string                          // 'task/fix-auth-leak-001'
  loopId: string                      // 所属 loop
  source: TaskSource                  // 发现来源
  readPlan: ReadPlan                  // 允许读的文件/资源
  writeBoundary: string[]             // 允许写的路径 glob（白名单）
  verificationIntent: VerificationSpec // 什么算"完成"
  resultTemplate: ResultTemplate      // 预期产物格式
  worktreeId: string | null           // 绑定的 git worktree
  assignee: 'maker' | 'checker'       // 制造者/检查者
  status: ContractStatus
  attempts: number                    // 重做次数（上限触发升级）
  maxAttempts: number                 // 默认 3
}

interface TaskSource {
  type: 'github-issue' | 'github-ci' | 'git-commit' | 'local-test' | 'webhook'
  ref: string                         // issue #7 / commit hash / webhook event id
  summary: string                     // 发现器生成的一句话摘要
  rawPayload: unknown                 // 原始数据（供 agent 参考）
}

interface ReadPlan {
  requiredReads: string[]             // 必读文件（glob）
  mcpResources?: string[]             // MCP 字段资源（定向检索）
  repoMap?: string                    // Aider 式图排序 repo map 摘要
}

interface VerificationSpec {
  programmatic: ProgrammaticCheck[]   // 命令验证（test/lint/typecheck）
  judge: JudgeCheck | null            // 独立模型评 rubric
  human: HumanCheck | null            // 人工签批
}

interface ProgrammaticCheck {
  command: string                     // 'npm test -- auth'
  expectedExitCode: number            // 0
  timeout: number                     // ms
}

interface JudgeCheck {
  model: string                       // 独立模型（不同模型族，looper 模式）
  rubric: string                      // 评分标准
  minScore: number                    // 0-100
}

interface HumanCheck {
  gate: 'always' | 'on-fail'          // 总是审批 / 仅自动验证失败时升级
  approvers: string[]                 // Matrix 用户 ID 或本地用户
}

interface ResultTemplate {
  artifactType: 'patch' | 'pr' | 'commit' | 'report'
  requiredFiles: string[]             // 预期产物文件
  schema?: unknown                    // 结构化产物 schema
}

type ContractStatus = 'queued' | 'in-progress' | 'submitted' | 'verifying'
                      | 'passed' | 'failed' | 'escalated' | 'archived'
```

### 4.4 验证记录

```typescript
interface VerificationRecord {
  contractId: string
  results: {
    programmatic: Array<{
      command: string
      exitCode: number
      stdout: string
      passed: boolean
    }>
    judge: {
      model: string
      score: number
      reasoning: string
      passed: boolean
    } | null
    human: {
      approver: string
      decision: 'approved' | 'rejected' | 'changes-requested'
      comment: string
      timestamp: string
    } | null
  }
  overall: 'passed' | 'failed' | 'pending'
  finalResponseGuard: boolean         // 防伪完成（Loom 模式）
}
```

### 4.5 调度配置与 7 Pattern

```typescript
interface ScheduleConfig {
  mode: 'cron' | 'webhook' | 'manual'
  cron?: string                       // '0 9 * * *'
  webhookEvents?: WebhookEvent[]      // 触发事件类型
  timezone: string                    // 'Asia/Shanghai'
}

interface WebhookEvent {
  source: string                      // 'github' / 'ci' / 'custom'
  eventType: string                   // 'issue.opened' / 'workflow.failed'
  filter?: string                     // 可选过滤表达式
}

/** 7 命名 pattern（cobusgreyling 模式），一键套用 */
type LoopPattern =
  | 'daily-triage'        // 1d-2h, L1, 低成本：每日扫 issue+CI 失败
  | 'pr-babysitter'       // 5-15m, L1, 高成本：盯 PR 等 CI
  | 'ci-sweeper'          // 5-15m, L2, 极高成本：自动修 CI 失败
  | 'dep-sweeper'         // 6h-1d, L2, 中成本：扫依赖更新
  | 'changelog-drafter'   // 1d 或 tag, L1, 低成本：草拟 changelog
  | 'post-merge-cleanup'  // 1d-6h, L1, 低成本：合并后清理
  | 'issue-triage'        // 2h-1d, L1, 低成本：新 issue 分类

interface PatternTemplate {
  pattern: LoopPattern
  defaultCron: string
  defaultLevel: AutonomyLevel
  costEstimate: 'low' | 'medium' | 'high' | 'very-high'
  goalTemplate: string                // 预填 goal 文本
  stopConditionTemplate: string       // 预填停止条件
}
```

### 4.6 事件模型（Socket.IO，复用 RunTrace 模式）

```typescript
/** 所有 loop.* 事件经 Socket.IO 推送到前端 */
type LoopEvent =
  | { type: 'loop.created'; loop: LoopInstance }
  | { type: 'loop.stage-transition'; loopId: string; from: LoopStage; to: LoopStage; reason: string }
  | { type: 'loop.task-discovered'; loopId: string; contract: TaskContract }
  | { type: 'loop.task-handed-off'; loopId: string; contractId: string; worktreeId: string }
  | { type: 'loop.verification-progress'; contractId: string; record: Partial<VerificationRecord> }
  | { type: 'loop.verification-complete'; contractId: string; passed: boolean }
  | { type: 'loop.persisted'; loopId: string; contractId: string; artifact: string }
  | { type: 'loop.tick-complete'; loopId: string; iteration: number; stats: LoopStats }
  | { type: 'loop.budget-warning'; loopId: string; spent: number; limit: number }
  | { type: 'loop.stuck'; loopId: string; reason: string }    // OpenHands Stuck Detector
  | { type: 'loop.completed'; loopId: string; finalStats: LoopStats }
```

### 4.7 State Store 适配器接口

```typescript
/** 统一接口，三层各实现一个 */
interface LoopStateStore {
  // Loop 级 CRUD
  createLoop(loop: LoopInstance): Promise<void>
  getLoop(id: string): Promise<LoopInstance | null>
  listLoops(filter?: LoopFilter): Promise<LoopInstance[]>
  updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void>
  deleteLoop(id: string): Promise<void>

  // 任务契约
  appendContract(contract: TaskContract): Promise<void>
  getContract(id: string): Promise<TaskContract | null>
  queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]>
  updateContract(id: string, patch: Partial<TaskContract>): Promise<void>

  // 验证记录
  appendVerification(record: VerificationRecord): Promise<void>

  // 事件流（用于前端订阅 + 恢复）
  appendEvent(event: LoopEvent): Promise<void>
  queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]>

  // 漂移检测（cobusgreyling loop-sync 模式）
  detectDrift(loopId: string): Promise<DriftReport>
}
```

### 4.8 预算守卫（AgentGuard 模式）

```typescript
interface BudgetConfig {
  maxCostPerTick: number              // 单次 tick 费用上限（美元）
  maxCostTotal: number                // 总费用上限
  killMode: 'throw' | 'notify' | 'kill'  // 超限行为
  warningThreshold: number            // 0.8 → 80% 警告
}
```

超 80% → `loop.budget-warning` 事件推前端；超 100% → 按 killMode 处理（throw=暂停 loop+存状态可恢复，notify=仅通知，kill=终止）。

---

## 5. UI 交互设计

### 5.1 总览视图（LoopSpineView）

```
┌──────────────────────────────────────────────────────────────────────┐
│  ☰  SwarmStudio                              [🔍][⚙️][👤]            │
├────────┬─────────────────────────────────────────────────────────────┤
│        │  Loop Engineering                                            │
│  导航   │  ┌─────────────────────────────────────────────────────────┐│
│        │  │ [全部 12] [运行中 3●] [待审批 2] [阻塞 1] [已归档 6]      ││
│  Cockpit│  ├─────────────────────────────────────────────────────────┤│
│  Kanban │  │  Loop 名称          │ 阶段    │ 状态    │下次tick │进度 ││
│  Matrix │  │  ───────────────────────────────────────────────────── ││
│ ───────│  │  ● auth-triage       │ 验证    │ 运行中  │ 09:00   │ 4/5 ││
│  Loop   │  │  ○ dep-sweep        │ 交接    │ 待调度  │ 12:00   │ 1/5 ││
│  Eng.●  │  │  ● ci-fail          │ 发现    │ 运行中  │ now     │ 3/5 ││
│        │  │  ▣ changelog        │ 调度    │ 阻塞    │ 18:00   │ 5/5 ││
│        │  │  ✓ old-cleanup       │ 完成    │ 已归档  │ —       │ 5/5 ││
│        │  │                                                        ││
│        │  │  行内: [▶运行][⏸暂停][⏹终止][📝编辑][🗑归档]           ││
│        │  └─────────────────────────────────────────────────────────┘│
│        │  [+ 新建 Loop]    调度器: ●运行中(3) ○空闲(9)               │
│        │                                                             │
│        │  ┌─ 待办通知 ──────────────────────────────────────────────┐│
│        │  │ ⚠ auth-triage: PR#12 等待人工审批 (验证-Human)          ││
│        │  │ ⚠ changelog: 预算 82% 警告                               ││
│        │  │ ⚠ ci-fail: subagent 卡住已 15min (Stuck Detector)       ││
│        │  └────────────────────────────────────────────────────────┘│
└────────┴─────────────────────────────────────────────────────────────┘
```

侧边栏过滤分组：
- 按状态分组计数（可点击过滤）：全部 / 运行中(●) / 待审批 / 阻塞(▣) / 已归档(✓)
- 每组显示实时计数 badge，颜色编码（借鉴 Trigger.dev：灰=空闲/蓝=运行/绿=完成/红=阻塞）
- 底部"待办通知"区——从 attention-adapter 复用模式，聚合所有 loop 的待人工动作

表格列设计：

| 列 | 内容 | 交互 |
|---|---|---|
| 状态图标 | ●/○/▣/✓ + 颜色 | 行内动作按钮 |
| Loop 名称 | 可点击下钻 | 跳转详情视图 |
| 阶段 | discovery/handoff/... | 显示当前阶段 |
| 状态 | running/paused/blocked/... | 颜色编码 badge |
| 下次 tick | 时间或 "now" | 倒计时 |
| 进度 | N/M 完成任务数 | 进度条 |
| 费用 | $已花/$上限 | 超 80% 红色 |

### 5.2 下钻详情视图（LoopDetailView）

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← 返回列表    loop/auth-triage          [▶运行][⏸暂停][⏹终止]    │
│  Auth 模块每日分诊   pattern: daily-triage   L2 辅助修复            │
│  目标: 扫描 auth 模块相关 issue+CI 失败并修复                       │
│  停止条件: 所有 auth/* 测试通过 且 lint 无 error                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│              ┌──────────┐                                            │
│        ┌─────┤ 调度 ○  ├──next: 09:00 (3h后)            ┌────────┐ │
│   ┌────┴───┐ └──────────┘                               │ 费用   │ │
│   │持久化 ●│                ┌──────────┐                  │$3.42   │ │
│   └────┬───┘          ┌─────┤ 发现 ●  ├── 3 项发现       │/$50.00 │ │
│        │              │     └──────────┘                  │ 6.8%   │ │
│        │     ┌────────┴──┐                                └────────┘ │
│        └─────┤ 验证 ●    │ pass:2 fail:1                              │
│              └─────┬─────┘                                            │
│                    │                                                  │
│              ┌─────┴──────┐                                           │
│              │ 交接 ●     │ 2 进行中                                   │
│              └─────┬──────┘                                           │
│                    │                                                  │
│              ┌─────┴──────┐                                           │
│              │ ▣ PR#12    │ ⚠ 等待人工审批  [审批][拒绝][退回修改]    │
│              └────────────┘                                           │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  [历史] [工作者] [关系] [待办]    ← 标签页（借鉴 Temporal 多格式）  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ── 历史 (Timeline / Compact / JSON 切换) ──────────────────────     │
│  09:00  loop.tick-start        iteration #4                          │
│  09:01  loop.task-discovered   issue#42: auth token 泄露              │
│  09:02  loop.task-handed-off   → worktree auth-fix-42 (maker agent)   │
│  09:05  loop.verification      programmatic: npm test -- auth ✅      │
│  09:06  loop.verification      judge(opus): score 87 ≥ 80 ✅          │
│  09:06  loop.verification      human: ⏳ pending (approver: you)      │
│  09:07  loop.budget-warning    $3.42/$50.00 (6.8%) ← 正常              │
│  ...                                                                 │
│                                                                      │
│  [粒度滑块: ━━●━━━━━ 简洁 ◀───当前──▶ 详细]  （LangGraph 模式）      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

环形阶段图（StageRing 组件）交互：
- **节点颜色**：●蓝=进行中 / ●绿=已完成 / ○灰=空闲 / ▣红=阻塞
- **hover** 节点 → 展开 popover 显示该阶段的任务列表 + 统计
- **click** 节点 → 在下方展开该阶段的详情面板
- **阶段间连线**：实线=已流转 / 虚线=待流转 / 粗线红虚线=repair 回退

标签页（借鉴 Temporal 多格式历史查看器）：
- **历史**：Timeline / Compact / JSON 三视图切换同数据 + 粒度滑块控制密度
- **工作者**：显示参与本 loop 的 maker/checker subagent 列表 + 各自产出
- **关系**：parent/child loop 树（fork-from-checkpoint 产生的分叉关系）
- **待办**：当前 loop 的待人工动作清单

### 5.3 新建 Loop 向导

```
点击 [+ 新建 Loop]
  │
  ▼
Step 1: 选 Pattern（7 模板卡片网格）
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Daily    │ │ PR       │ │ CI       │
  │ Triage   │ │ Babysitter│ │ Sweeper  │
  │ 1d L1低  │ │ 15m L1高 │ │ 15m L2极高│
  └──────────┘ └──────────┘ └──────────┘
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Dep      │ │Changelog │ │Post-Merge│ │Issue     │
  │Sweeper   │ │Drafter   │ │Cleanup   │ │Triage    │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
  │
  ▼ 选择后预填 goal + stopCondition + cron
Step 2: 编辑详情
  ┌─ Loop 配置 ─────────────────────────────┐
  │ 名称:  [Auth 模块每日分诊             ] │
  │ 目标:  [扫描 auth 模块相关 issue+CI  ] │
  │ 停止条件: [所有 auth/* 测试通过且 lint  ] │
  │ 调度:  ○ cron [0 9 * * *]  ○ webhook  │
  │        ○ 手动                            │
  │ 自治级: [L1报告 ▼] L2辅助 L3无人       │
  │ 预算:  $[50]/tick  $[200]/total         │
  │ 超限:  [throw暂停可恢复 ▼]             │
  │ 验证:  ☑ Programmatic  ☑ Judge  ☑ Human│
  │ 读者范围: [packages/auth/**]          │
  │ 写边界:   [packages/auth/**]           │
  └────────────────────────────────────────┘
  │
  ▼
Step 3: 确认 → 创建 → 跳转详情视图
```

### 5.4 人工审批流

```
loop 推送 loop.verification-complete (passed=false, human=pending)
  │
  ▼
Spine 总览"待办通知"区弹出: ⚠ PR#12 等待人工审批
  │
  ▼ 点击
弹窗显示:
  ┌─ 人工审批: PR#12 ──────────────────────────────┐
  │ 任务: 修复 auth token 泄露 (issue#42)         │
  │ 来源: GitHub issue #42                         │
  │ ┌─ worktree ──────────────────────────┐       │
  │ │ auth-fix-42  branch: fix/auth-leak  │       │
  │ │ [查看 diff] [打开编辑器] [打开终端] │       │
  │ └─────────────────────────────────────┘       │
  │                                                │
  │ ── Programmatic 验证 ──                       │
  │ ✅ npm test -- auth        exit 0             │
  │ ✅ npm run lint            exit 0             │
  │                                                │
  │ ── Judge 验证 ──                              │
  │ ✅ opus-4 评分 87/100 (≥80)                   │
  │    "修复正确，边界用例已覆盖..."               │
  │                                                │
  │ ── 你的决定 ──                                │
  │ [✅ 批准]  [❌ 拒绝]  [↩ 退回修改]             │
  │ 批准后: loop 进入 persistence→scheduling      │
  │ 拒绝后: loop 终止此任务                       │
  │ 退回后: 回 handoff 阶段，带评语给 maker agent │
  └────────────────────────────────────────────────┘
```

### 5.5 fork-from-checkpoint

在历史标签页，任意一行可点击 [Fork]：
- 从此检查点分叉一个新 loop，继承父 loop 的 state + contract + 验证记录
- 不丢原史（LangGraph 模式），用于"换个策略试试"场景——治理解债

### 5.6 组件复用

| 组件 | 复用来源 | 说明 |
|---|---|---|
| LoopSidebar | cockpit store 模式 | 新增，借鉴模式 |
| LoopTable | kanban KanbanBoard 列表模式 | 新增，表格形式 |
| StageRing | useForceLayout（cockpit composables）| 新增，复用力导向布局 |
| StageNode | cockpit topology-adapter 节点 | 新增，简化版 |
| TaskContractCard | kanban TaskCard | 新增，契约字段 |
| VerifierPanel | RunTrace 验证展示 | 新增，三路验证 |
| ScheduleEditor | 无对应 | 新增，cron+webhook+pattern |
| WorktreeStatus | kanban workspaceKind | 新增，worktree 列式 |
| 待办通知 | cockpit attention-adapter | 复用 adapter 模式 |

### 5.7 三层 UI 差异

| 场景 | 个人 | 团队 | SaaS |
|---|---|---|---|
| 入口 | 本地 /loop 路由 | 同 | 多租户域名 |
| State 来源 | LocalStore | MatrixStore | SaaSStore |
| 审批人 | 自己 | Matrix 用户列表 | 租户成员 |
| 调度器 | 本地进程 | 多实例协调（Matrix 房间状态选举） | 服务端集中 |
| UI 组件 | **完全相同** | 同 | 同 |

引擎和 UI 三层共用，只有 State adapter 和审批人来源不同。

---

## 6. 验证器与调度器内部设计

### 6.1 验证器架构（三路并行 + 短路策略）

```
┌─ verifier.ts ────────────────────────────────────────────────┐
│                                                               │
│  verify(contract)                                             │
│       │                                                       │
│       ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐     │
│  │            VerificationCoordinator                   │     │
│  │  根据 autonomyLevel + contract.verificationSpec      │     │
│  │  决定执行策略                                        │     │
│  └─────────────────────────────────────────────────────┘     │
│       │                                                       │
│       ├──(并行)──▶ ProgrammaticRunner                         │
│       │                │                                      │
│       │                ▼                                      │
│       │          逐条执行 ProgrammaticCheck                   │
│       │          (在 worktree 内沙箱执行)                     │
│       │                │                                      │
│       │                ▼                                      │
│       │          收集 exitCode / stdout / passed             │
│       │                                                       │
│       ├──(并行)──▶ JudgeRunner                                │
│       │                │                                      │
│       │                ▼                                      │
│       │          独立模型族模型评 rubric                      │
│       │          (looper: judge ≠ maker 模型族)              │
│       │                │                                      │
│       │                ▼                                      │
│       │          score + reasoning                            │
│       │                                                       │
│       └──(条件)──▶ HumanGate                                  │
│                        │                                      │
│                        ▼                                      │
│                  gate='always' → 必须审批                     │
│                  gate='on-fail' → 仅前两路有 fail 时升级      │
│                        │                                      │
│                        ▼                                      │
│                  推送 loop.verification-progress               │
│                  (human=pending) → 等待                       │
│                        │                                      │
│                        ▼                                      │
│                  用户在 UI 审批 → 回调                        │
│                                                               │
│  ┌─ 短路策略 ─────────────────────────────────────────┐       │
│  │ L1: Programmatic fail → 短路，不跑 Judge           │       │
│  │     Programmatic pass → 仍跑 Judge（给质量评分）     │       │
│  │     两路全 pass → 标 awaiting-review，不自动合并    │       │
│  │     （L1 = 仅报告，所有通过项仍需 Human 审批才合并） │       │
│  │ L2: Programmatic + Judge 并行                       │       │
│  │     Programmatic fail → 短路 Judge                  │       │
│  │     Judge fail → 升级 Human                         │       │
│  │     两路全 pass → 标 awaiting-review（仍需 Human） │       │
│  │ L3: 三路并行（最激进）                               │       │
│  │     Programmatic+Judge pass → 自动跳过 Human        │       │
│  │     （仅 gate='on-fail' 时；'always' 不可跳）       │       │
│  └────────────────────────────────────────────────────┘       │
└───────────────────────────────────────────────────────────────┘
```

三路执行细节：

**ProgrammaticRunner**：
- 在契约绑定的 worktree 内执行（沙箱隔离）
- 命令白名单：仅允许 `npm test` / `npm run lint` / `npx tsc` / `pytest` 等预定义前缀
- 超时强制 kill（default 60s，可配）
- 输出截断：stdout > 10KB 只留尾部 + 行数
- 失败时自动附"如果跑不了该说什么"提示（SWE-agent 模式）

**JudgeRunner**：
- **模型族隔离**（looper 核心洞察）：maker 用 Claude → judge 必须用 GPT/Gemini/本地模型，反之亦然。配置时校验
- 输入：契约的 `writeBoundary` 内文件 diff + rubric + 验证意图
- 输出：`{ score: 0-100, reasoning: string, passed: boolean }`
- rubric 模板按 pattern 预设（如 ci-sweeper 的 rubric 聚焦"是否真正修复根因"）
- 防自我评价：judge 模型不可访问 maker 的 reasoning trace（只看产物 diff）

**HumanGate**：
- `gate='always'`：此契约必须人工签批，不可跳过（高风险变更如安全/数据库）
- `gate='on-fail'`：Programmatic+Judge 全 pass 时按自治级决定是否升级人工
  - L1/L2：仍标 awaiting-review（需 Human 审批才合并）
  - L3：可自动放行
  - 任一 fail 则升级人工（所有级别）
- 审批人来源：个人=本地配置；团队=Matrix 房间成员列表；SaaS=租户成员
- 超时策略：审批 pending 超 72h → 自动降级为 blocked，loop 暂停

### 6.2 finalResponseGuard（Loom 防伪完成）

```typescript
// 在 maker subagent 声明"完成"后，独立校验产物是否真存在
function finalResponseGuard(contract: TaskContract): GuardResult {
  // 1. 检查 resultTemplate.requiredFiles 是否都存在
  // 2. 检查文件非空且符合 schema
  // 3. 检查 git diff 非空（确实改了东西）
  // 4. 若任一不满足 → 返回 'premature-done'，回退 handoff
  // 防止 agent 空转后声称完成
}
```

### 6.3 多目标修复路由（Loom 模式）

验证失败后，根据失败类型路由到不同修复目标：

```
验证失败
  │
  ├─ Programmatic fail (test/lint 错误)
  │     → repair.target = 'code'        回 handoff，maker 修代码
  │
  ├─ Judge fail (score < minScore)
  │     → repair.target = 'code'        回 handoff，带 judge reasoning 给 maker
  │
  ├─ Human reject / changes-requested
  │     → repair.target = 'code'        回 handoff，带人工评语给 maker
  │
  └─ 契约本身有问题（writeBoundary 错/验证意图不清）
        → repair.target = 'task-plan'   回 discovery，重新生成契约
        （attempts 超限触发 'architecture' 升级 → 暂停 loop，通知人）
```

### 6.4 调度器架构

```
┌─ scheduler.ts ───────────────────────────────────────────────┐
│                                                               │
│  ┌─ TriggerRegistry ──────────────────────────────────┐     │
│  │  注册所有 loop 的触发源                             │     │
│  │  ├─ cron triggers (cron-parser)                    │     │
│  │  ├─ webhook triggers (Express 路由)                 │     │
│  │  └─ manual triggers (UI 按钮 → API)                 │     │
│  └────────────────────────────────────────────────────┘     │
│       │                                                       │
│       ▼                                                       │
│  ┌─ TickExecutor ────────────────────────────────────┐      │
│  │  每次 tick 执行:                                   │      │
│  │  1. 预算检查 (BudgetGuard)                         │      │
│  │  2. StuckDetector 检查                             │      │
│  │  3. 启动 loop-engine 的 5 阶段编排                  │      │
│  │  4. tick 完成后更新 nextTickAt                      │      │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌─ PatternRegistry ─────────────────────────────────┐      │
│  │  7 个 pattern 模板，新建 loop 时预填:              │      │
│  │  daily-triage: cron='0 9 * * *' L1 low            │      │
│  │  pr-babysitter: cron='*/15 * * * *' L1 high       │      │
│  │  ci-sweeper: cron='*/10 * * * *' L2 very-high     │      │
│  │  dep-sweeper: cron='0 */6 * * *' L2 medium        │      │
│  │  changelog-drafter: cron='0 0 * * 1' L1 low       │      │
│  │  post-merge-cleanup: cron='0 18 * * *' L1 low     │      │
│  │  issue-triage: cron='0 */2 * * *' L1 low          │      │
│  └────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

**Cron 触发**：
- 用 `cron-parser` 计算下次执行时间（轻量，无外部依赖）
- 时区支持：每 loop 独立 `timezone` 配置
- 错过补偿：如果上次 tick 因停机错过，启动时检查 `nextTickAt < now` → 立即补跑一次（仅 L2/L3；L1 跳过等下次）

**Webhook 触发**：
- 通用端点：`POST /api/loop/webhook/:loopId`
- 请求体：`{ source, eventType, payload, filter? }`
- 匹配逻辑：loop 的 `webhookEvents` 列表中找匹配 `source+eventType`，过 filter → 触发 tick
- GitHub 特化：内置 GitHub webhook 签名验证（`X-Hub-Signature-256`）
- 去抖：同一 loop 5 秒内多次 webhook → 合并为一次 tick

**手动触发**：
- UI `[▶运行]` → `POST /api/loop/:id/tick` → 立即执行一次（不影响 cron 调度）

### 6.5 BudgetGuard（AgentGuard 模式）

```typescript
class BudgetGuard {
  check(loop: LoopInstance): BudgetDecision {
    const tickCost = estimateTickCost(loop)  // 基于 pattern 成本估算
    const totalSpent = loop.stats.totalCost

    if (totalSpent + tickCost > loop.budget.maxCostTotal)
      return { allow: false, action: loop.budget.killMode }

    if (totalSpent / loop.budget.maxCostTotal > loop.budget.warningThreshold)
      emit('loop.budget-warning', { spent: totalSpent, limit: loop.budget.maxCostTotal })

    return { allow: true }
  }
}

// killMode 处理:
// 'throw'  → pauseLoop(loop), 保存 state, 推送通知, 可恢复
// 'notify' → 仅推送通知, 继续
// 'kill'   → terminateLoop(loop), 标记 failed, 不可恢复
```

### 6.6 StuckDetector（OpenHands 模式）

监控信号：
1. 同一契约 `attempts >= maxAttempts`（default 3）→ stuck
2. handoff 阶段无产出超 15min → stuck
3. validation 循环 pass→fail→repair→pass→fail 超 3 轮 → stuck
4. subagent 无 Socket.IO 事件超 10min → stuck

自动动作：
- `max-attempts` → 修复路由升级到 'architecture' → 暂停 + 通知人
- `no-output` → 暂停 loop, 保留 state
- `validation-loop` → 尝试换 maker 模型重试一次
- `agent-silent` → kill subagent, 回 handoff 重新派发

### 6.7 子代理派发（制造者/检查者分离）

```
┌─ subagent-dispatcher.ts ─────────────────────────────────────┐
│                                                               │
│  dispatch(contract, role: 'maker' | 'checker')                │
│       │                                                       │
│       ▼                                                       │
│  ┌─ WorktreeBinder ──────────────────────────────────┐       │
│  │  maker:                                            │       │
│  │    git worktree add .loop/worktrees/<contract-id>  │       │
│  │         -b fix/<contract-id> HEAD (detached)       │       │
│  │    写 .worktreeinclude (copy .env等)               │       │
│  │  checker:                                          │       │
│  │    只读挂载 maker 的 worktree (不创建新的)          │       │
│  └────────────────────────────────────────────────────┘     │
│       │                                                       │
│       ▼                                                       │
│  ┌─ AgentInvoker ────────────────────────────────────┐      │
│  │  调用 hermes-agent 运行时:                          │      │
│  │  - 传入 contract.readPlan (限定可读范围)            │      │
│  │  - 传入 contract.writeBoundary (限定可写范围)       │      │
│  │  - 传入 contract.resultTemplate (预期产物)          │      │
│  │  - 传入 loop.goal + stopCondition                   │      │
│  │  maker:  实现修复，产出 diff                        │      │
│  │  checker: 读 maker 产物 + 验证意图，产出 review     │      │
│  └────────────────────────────────────────────────────┘     │
│       │                                                       │
│       ▼                                                       │
│  ┌─ DepthLimiter ────────────────────────────────────┐      │
│  │  嵌套深度上限 5 (Claude Code 模式)                  │      │
│  │  超限 → 拒绝派发，标记 contract 为 'escalated'     │      │
│  └────────────────────────────────────────────────────┘     │
│       │                                                       │
│       ▼                                                       │
│  Socket.IO 推送 subagent.start/complete                      │
│  (复用 RunTrace 已有事件格式，不另建)                        │
└───────────────────────────────────────────────────────────────┘
```

worktree 生命周期：
- 契约创建 → `git worktree add`（detached HEAD）
- maker 执行中 → worktree 锁定
- 验证中 → worktree 保持（checker 只读）
- 持久化 → `git commit + push PR` → worktree 可回收
- 归档 → `worktree remove --force`
- 超时（24h 无活动）→ 自动 remove + 标记 contract 'archived'

`.worktreeinclude` 文件列出需拷入的被忽略文件（`.env`, `tsconfig.local.json` 等）（Codex 模式）。
回收策略：完成 1h 后自动 remove（除非 loop 配置保留）。
全局 worktree 上限：20 个（超过最老的自动回收，Codex 模式）。

### 6.8 hook 生命周期闸门（Claude Code 模式）

```typescript
/** hook 在 loop 编排的关键点插入，可阻断/改写 */
type LoopHook =
  | 'pre-discovery'      // 发现前：可注入额外数据源
  | 'post-discovery'     // 发现后：可过滤/重排发现项
  | 'pre-handoff'        // 交接前：可改写契约
  | 'post-handoff'       // 交接后（maker 产出）：可改写产物
  | 'pre-validation'     // 验证前：可注入额外验证规则
  | 'post-validation'    // 验证后：可覆盖验证结果
  | 'pre-persistence'    // 持久化前：最终闸门
  | 'post-persistence'   // 持久化后
  | 'pre-tick'           // 每次 tick 前：预算/stuck 检查点
  | 'post-tick'          // 每次 tick 后
  | 'on-stuck'           // 卡住时
  | 'on-budget-exceed'   // 超预算时

interface HookHandler {
  type: 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent'
  // command: 执行 shell, JSON stdin, 退出码决定 allow/deny
  // http: POST JSON, 响应决定
  // mcp_tool: 调 MCP 工具
  // prompt: 单轮 yes/no 问 Claude 小模型
  // agent: 起 subagent 读文件验证条件 (最强验证)
  matcher?: string              // 匹配 loopId pattern
  config: unknown               // type 特定配置
}

interface HookResult {
  decision: 'allow' | 'deny' | 'ask'  // ask=升级人工
  updatedInput?: unknown              // 改写后的输入 (pre-* hook)
  additionalContext?: string          // 注入上下文
}
```

默认 hook（`overlay/config/loop-config.ts`）：
- `pre-tick` → BudgetGuard（command 型）
- `pre-tick` → StuckDetector（command 型）
- `pre-persistence` → finalResponseGuard（agent 型，起 subagent 校验产物）
- `post-validation` → 人工审批升级（如 autonomyLevel=L1 则强制升级）

---

## 7. State Store 适配器与三层实现差异

### 7.1 实现总览

```
┌────────────────┬────────────────────┬───────────────────────────┐
│  LocalStore    │  MatrixStore       │  SaaSStore                 │
│  (个人层)      │  (团队层)           │  (SaaS 层)                │
├────────────────┼────────────────────┼───────────────────────────┤
│ 文件系统        │ Matrix 房间状态事件  │ PostgreSQL (RLS)          │
│ STATE.md       │ m.loop.state      │ loops 表                  │
│ contracts/     │ m.loop.contract   │ contracts 表              │
│ events.jsonl   │ 房间消息事件       │ events 表                 │
│ 无并发控制      │ 最终一致性          │ ACID 事务                  │
│ 离线可用        │ 需 Matrix 连接     │ 需服务端连接               │
│ git diff 可审  │ 跨实例共享          │ 多租户隔离                 │
└────────────────┴────────────────────┴───────────────────────────┘
```

### 7.2 LocalStore 实现（个人层，首期交付）

文件布局：

```
.loop/                              ← loop 工作区根目录（同 .loom/ 模式）
├── STATE.md                        ← 人可读的状态脊柱（cobusgreyling 模式）
├── STATE.json                      ← 机器可读的同步状态（STATE.md 的结构化镜像）
├── loops/
│   ├── auth-triage/
│   │   ├── loop.json               ← LoopInstance 序列化
│   │   ├── contracts/
│   │   │   ├── fix-auth-leak-001.json
│   │   │   └── fix-auth-leak-002.json
│   │   ├── verifications/
│   │   │   └── fix-auth-leak-001.verify.json
│   │   └── events.jsonl            ← 追加写事件流（一行一事件）
│   ├── dep-sweep/
│   │   └── ...
│   └── ...
├── worktrees/                      ← git worktree 挂载点
│   ├── fix-auth-leak-001/          ← 实际 worktree
│   └── ...
└── .worktreeinclude                ← 需拷入的被忽略文件清单
```

STATE.md（人可读脊柱）示例：

```markdown
# Loop State Spine
Updated: 2026-07-11T09:07:00Z

## Active Loops

### auth-triage
- **Goal**: 扫描 auth 模块相关 issue+CI 失败并修复
- **Stop**: 所有 auth/* 测试通过且 lint 无 error
- **Stage**: validation
- **Status**: running
- **Pattern**: daily-triage (L1, low cost)
- **Schedule**: cron `0 9 * * *` (Asia/Shanghai)
- **Iteration**: #4
- **Budget**: $3.42 / $50.00 (6.8%)
- **Next tick**: 2026-07-11T09:00:00Z
```

生成规则：
- 每次 `appendEvent` / `updateLoop` 后自动重生成
- 是 STATE.json 的人类可读投影，不存储额外信息
- `detectDrift()` 比对 STATE.md 与 STATE.json（cobusgreyling loop-sync 模式）：
  - 若 STATE.md 被人手改 → 报告 drift，提示"手改 STATE.md 不会生效，请改 STATE.json"
  - 若 STATE.json 与 STATE.md 不一致且非手改 → 序列化 bug，报错

并发模型：
- 文件锁：`STATE.lock`（`proper-lockfile` 库），写操作获取锁，超时 5s 报错
- 个人层单进程，锁仅防同一进程内异步竞态
- 无多写者并发需求——多写者是团队层的事

events.jsonl 格式：

```jsonl
{"type":"loop.created","loop":{...},"ts":"2026-07-11T09:00:00Z"}
{"type":"loop.stage-transition","loopId":"auth-triage","from":"discovery","to":"handoff","ts":"..."}
{"type":"loop.task-discovered","loopId":"auth-triage","contract":{...},"ts":"..."}
{"type":"loop.verification-complete","contractId":"fix-auth-leak-001","passed":true,"ts":"..."}
```

- 每行一个事件，追加写（`fs.appendFile`）
- `queryEvents(loopId, since)` → 流式读取，按 `ts` 过滤
- 轮转：单文件超 10MB → 归档为 `events-YYYYMM.jsonl`，新建空文件

### 7.3 MatrixStore 实现（团队层，二期）

Matrix 事件类型定义：

```typescript
const LOOP_EVENT_TYPES = {
  STATE: 'm.loop.state',           // 房间状态事件：存 LoopInstance（按 loopId 为 key）
  CONTRACT: 'm.loop.contract',     // 房间状态事件：存 TaskContract（按 contractId）
  VERIFICATION: 'm.loop.verification', // 房间状态事件：存 VerificationRecord
  EVENT_LOG: 'm.loop.event',       // 房间消息事件：追加事件流
}
```

房间模型：

```
一个团队 = 一个 Matrix 房间（!loop-team:matrix.org）

房间状态事件（state events，最终一致性）:
  m.loop.state         key=loopId       → LoopInstance
  m.loop.contract      key=contractId   → TaskContract
  m.loop.verification   key=contractId   → VerificationRecord

房间消息事件（message events，有序追加）:
  m.loop.event         body=LoopEvent JSON  → 事件流（events.jsonl 等价物）
```

并发模型：
- 状态事件：Matrix 用 `state_event` 的幂等性——同一 `type+key` 后写覆盖前写，最终一致
- 乐观锁：写入时带 `prev_content` 校验，冲突时重试
- 消息事件：天然有序（Matrix DAG 排序），追加写无冲突
- 调度者选举：多 SwarmStudio 实例都可能 tick → 用 Matrix 房间租约机制：
  - tick 前，实例向房间发 `m.loop.lease` 消息（带时间戳 + 实例ID）
  - 5 秒窗口内最小时间戳者获租约，其余跳过本次 tick
  - 租约 5 分钟过期（防实例崩溃不释放）

数据流：

```
SwarmStudio 实例 A                   SwarmStudio 实例 B
       │                                    │
       ▼                                    ▼
  tick 触发                              tick 触发
       │                                    │
       ▼                                    ▼
  发 m.loop.lease                      发 m.loop.lease
       │                                    │
       ▼                                    ▼
  比较时间戳: A 更早 ◀────────────────────  B 退出本次 tick
       │
       ▼
  读取 m.loop.state（房间状态）→ 获取 LoopInstance
       │
       ▼
  执行 5 阶段编排
       │
       ▼
  写 m.loop.contract / m.loop.verification（状态事件）
  追加 m.loop.event（消息事件）
       │
       ▼
  所有实例通过 Matrix 同步看到更新
  （前端订阅 Matrix 状态变更 → 转换为 LoopEvent 推给 loop store）
```

UI 适配：
- matrix-chat 模块已有 Matrix 客户端 store/composables
- MatrixStore 复用 `matrix-chat/stores/` 的 Matrix 客户端连接
- 前端订阅房间状态变更 → 转换为 `LoopEvent` 推给 loop store（对 UI 透明）

### 7.4 SaaSStore 实现（SaaS 层，三期）

数据库模型：

```sql
-- 多租户隔离：每行带 tenant_id，RLS 策略强制
CREATE TABLE loops (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  goal        TEXT NOT NULL,
  stop_condition TEXT,
  pattern     TEXT NOT NULL,
  schedule    JSONB NOT NULL,
  stage       TEXT NOT NULL,
  status      TEXT NOT NULL,
  autonomy_level TEXT NOT NULL,
  budget      JSONB NOT NULL,
  stats       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_tick_at TIMESTAMPTZ
);

CREATE TABLE loop_contracts (
  id           TEXT PRIMARY KEY,
  loop_id      TEXT NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  source       JSONB NOT NULL,
  read_plan    JSONB NOT NULL,
  write_boundary TEXT[] NOT NULL,
  verification_spec JSONB NOT NULL,
  result_template JSONB NOT NULL,
  worktree_id  TEXT,
  assignee     TEXT NOT NULL,
  status       TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loop_verifications (
  id           SERIAL PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES loop_contracts(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  results      JSONB NOT NULL,
  overall      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loop_events (
  id           BIGSERIAL PRIMARY KEY,
  loop_id      TEXT NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_loop_ts ON loop_events (loop_id, ts DESC);
```

RLS 策略：

```sql
ALTER TABLE loops ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loops
  USING (tenant_id = current_setting('app.tenant_id'));
-- 所有表同理
```

并发模型：
- ACID 事务，`SELECT ... FOR UPDATE` 防并发改同一 loop
- 调度者无需选举——服务端单一调度器，按 `next_tick_at` 轮询
- 事件流用数据库 NOTIFY/LISTEN 或 Socket.IO 转发到前端

### 7.5 三层能力对比

| 能力 | Local | Matrix | SaaS |
|---|---|---|---|
| 离线可用 | ✅ | ❌ | ❌ |
| 多实例协调 | ❌ | ✅（租约选举） | ✅（集中调度） |
| 实时同步 | 单进程 | Matrix 同步 | DB + Socket.IO |
| 并发控制 | 文件锁 | 乐观锁 | ACID 事务 |
| 可审计性 | git diff STATE.md | Matrix 房间历史 | DB 查询 |
| 租户隔离 | N/A | 房间访问控制 | RLS |
| 状态脊柱可读性 | ✅ 人可读 MD | 房间状态（需工具查看） | 需 UI |
| 漂移检测 | ✅ STATE.md vs JSON | 房间状态 vs 缓存 | DB 单源无漂移 |
| 启动成本 | 零 | 需 Matrix 连接 | 需服务端 |

### 7.6 切换机制

```typescript
// overlay/config/loop-config.ts
const loopConfig = {
  stateAdapter: process.env.LOOP_STATE_ADAPTER || 'local',
  matrix: {
    roomId: process.env.LOOP_MATRIX_ROOM_ID,
  },
  saas: {
    apiUrl: process.env.LOOP_SAAS_API_URL,
    tenantId: process.env.LOOP_SAAS_TENANT_ID,
  },
}

// store/state-store.ts
function createStateStore(config): LoopStateStore {
  switch (config.stateAdapter) {
    case 'local':  return new LocalStore('.loop/')
    case 'matrix': return new MatrixStore(config.matrix)
    case 'saas':   return new SaaSStore(config.saas)
  }
}
```

- 个人→团队升级：改环境变量 `LOOP_STATE_ADAPTER=matrix` + 配 Matrix 房间
- 团队→SaaS升级：改 `LOOP_STATE_ADAPTER=saas` + 配 API
- 引擎、UI、验证器、调度器、子代理派发——全部不感知 adapter 类型

### 7.7 数据迁移

- Local → Matrix：扫描 `.loop/loops/*/loop.json`，逐个发 `m.loop.state` 状态事件；`events.jsonl` 逐行发 `m.loop.event` 消息
- Matrix → SaaS：读房间状态事件批量 INSERT；消息事件转 `loop_events` 行
- 迁移工具：`overlay/scripts/loop-migrate.mjs`（A 类纯新增）
- 幂等：迁移可重复跑，按 ID 去重

---

## 8. 最终实现效果与使用场景

### 8.1 个人层完整旅程

**Day 0**：用户打开 SwarmStudio，侧边栏出现 "Loop Engineering"（绿点新功能）。首次点击出现引导卡片，3 步开始（选 pattern → 填目标停止条件 → 选数据源）。

**Day 1**：用户选 Daily Triage pattern，配置 auth 模块分诊 loop（goal/stopCondition/cron/budget/验证/写边界）。09:00 cron 触发首次 tick：
- discovery：github-connector 拉取 3 issue + 1 CI 失败；local-git-connector 拉取 2 未推送 commit → 产出 4 个 TaskContract
- handoff：每个 contract 创建 worktree + 派发 maker subagent 产出 diff
- validation：contract #1/#2 通过 Programmatic+Judge（L1 仅报告，标 awaiting-review）；contract #3 Programmatic fail → 短路回 repair；contract #4 非 actionable 归档
- persistence：#1/#2 通过验证 → commit+push PR #12/#13 → 写入 Kanban triage 列 → 更新 STATE.md
- scheduling：stopCondition 检查未满足 → nextTickAt=明天 09:00

用户查看结果：Spine 显示 auth-triage 2/4 完成 + 2 待审批通知。用户点击 PR#12 → 审批弹窗 → 查看 diff + 验证结果 → 批准 → loop 自动 persistence。

**Day 2-3**：contract #3 在下次 tick 修复成功。Day 3 无新发现，stopCondition 满足 → loop.completed。

### 8.2 团队层场景

3 人团队（Alice/Bob/Charlie）各 SwarmStudio 实例连同一 Matrix 房间。Alice 创建前端分诊 loop，Bob 创建后端 CI loop，Charlie 创建依赖更新 loop。

09:00 三个实例分别获租约 tick 各自 loop。Alice 的 loop 产出 PR#15 → Matrix 房间消息通知 → Bob 审批（他是前端负责人）。所有状态实时同步，三人看到的 Spine 一致。Matrix 房间同时有 loop.bot 的通知消息流。

### 8.3 SaaS 层场景

租户 A（Acme Corp，10 开发者，50 loop）和租户 B（Beta Inc，3 开发者，5 loop）共享服务端，RLS 隔离。SaaS 控制台显示租户统计（活跃 loop / 总迭代 / 总费用 / 平均完成率 / 平均审批延迟）。

### 8.4 治理"理解债"的机制

| 层 | 机制 | 效果 |
|---|---|---|
| 第 1 层 | STATE.md 人可读脊柱 | 不用问 agent 也能知道"系统在干什么"；可 git diff/blame |
| 第 2 层 | fork-from-checkpoint | 从任意检查点分叉不丢原史，鼓励"动手理解" |
| 第 3 层 | L1→L2→L3 渐进自治 | L1 仅报告先理解 loop 发现什么；L2 每次需 Human gate；L3 充分理解后才自动 |

---

## 9. 交付里程碑

### 首期（个人层 M1-M3）

| 交付物 | 说明 |
|---|---|
| Loop Spine UI | 侧边栏+表格总览，环形阶段图下钻 |
| Loop 引擎 | 5 阶段编排核心 |
| LocalStore | STATE.md/JSON + events.jsonl |
| 3 个 Connector | GitHub + 本地 git + webhook |
| 三路验证器 | Programmatic + Judge + Human |
| 调度器 | cron + webhook + 7 pattern 模板 |
| worktree 管理 | detached-HEAD 生命周期 |
| 子代理派发 | 制造者/检查者分离 |
| hook 生命周期 | BudgetGuard + StuckDetector + finalResponseGuard |
| 导航注入 | patch 133 注入侧边栏入口 |
| 设计文档 + 实施计划 | docs/superpowers/ 下 |
| 测试 | overlay/tests/ 下 vitest 套件 |

### 二期（团队层）

| 交付物 | 说明 |
|---|---|
| MatrixStore | Matrix 房间状态事件适配器 |
| 租约选举 | 多实例调度协调 |
| 团队审批流 | Matrix 用户列表作 approver |
| 迁移工具 | Local → Matrix 数据迁移 |
| Matrix bot | loop.bot 发通知到房间 |

### 三期（SaaS 层）

| 交付物 | 说明 |
|---|---|
| SaaSStore | PostgreSQL + RLS |
| 多租户管理 | 租户 CRUD + 成员管理 |
| 集中调度器 | 服务端 cron 调度 |
| 账单 | 按租户统计费用 |
| 迁移工具 | Matrix → SaaS 数据迁移 |

---

## 10. 与 issue #1 的映射

```
issue #1 要求:
  "覆盖【发现→交接→验证→持久化→调度】各过程"

本设计映射:
  发现   → discovery 阶段 + 3 connector（GitHub/本地git/webhook）
  交接   → handoff 阶段 + 任务契约 + worktree + 子代理派发
  验证   → validation 阶段 + 三路验证器（Programmatic+Judge+Human）
  持久化 → persistence 阶段 + State Store（STATE.md/Matrix/DB）
  调度   → scheduling 阶段 + cron+webhook+7 pattern

完全覆盖，且每阶段都有调研吸收的最佳实践落地。
```

---

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| agent 产出代码用户不理解（理解债） | STATE.md 脊柱 + fork-from-checkpoint + L1→L2→L3 渐进 |
| 费用失控 | BudgetGuard 三模式（throw/notify/kill）+ 80% 预警 |
| agent 卡死 | StuckDetector 4 信号检测 + 自动动作 |
| agent 假完成 | finalResponseGuard 独立校验产物存在性 |
| 验证自评偏差 | Judge 用不同模型族 + Human gate |
| 并发冲突（团队层） | Matrix 租约选举 + 乐观锁 |
| worktree 堆积 | 全局上限 20 + 完成后 1h 自动回收 + 24h 超时清理 |
| 嵌套子代理失控 | 深度上限 5 + 超限标记 escalated |
