# M1 交付协议扩展（delivery.*）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 overlay 新增 `delivery-protocol.ts`：交付案例房三事件（case/stage/gate）+ 案例索引 account data 的常量、schema、容错解析器、幂等投影与 HumanGate 发送者校验，全部纯函数、零 UI、零 patch。

**Architecture:** 复制 `custom/client/matrix-teams/protocol.ts` 的成熟模式（事件类型常量单文件收敛 + 解析器非法输入返回 null + 守门测试防内联漂移），新增平行文件 `delivery-protocol.ts`。本里程碑只做协议层；store 接线与 UI 属 M2（被 unified-navigation 合 main 阻塞）。

**Tech Stack:** TypeScript + vitest（既有 `vitest.config.ts`，include `custom/**/*.test.ts`）；零新依赖。

**Spec:** `docs/superpowers/specs/2026-09-18-distributed-delivery-network-design.md`（本计划随 Task 1 提交入 overlay 仓库；源文件在 `/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/` 同名路径）

## Global Constraints

- 只改 `overlay/`；严禁改 `upstream/`（workspace 规则）。
- M1 = 纯 A 类：不新增/不修改 `patches/`、不动 i18n、不改 upstream 注入态。收口前 `git diff main --stat` 只允许出现 `custom/client/matrix-teams/` 与 `docs/superpowers/` 下的新增文件。
- 事件类型字符串只准出现在 `delivery-protocol.ts`（守门测试强制，模式同 protocol.ts）；全部 content 带 `schemaVersion`，解析器只认版本 1，未知版本返回 null（spec §11 协议漂移对策：忽略即降级只读）。
- 解析器非法输入一律返回 null，不抛异常（spec §5 容错，同 protocol.ts 纪律）。
- commit 用 Conventional Commits 中文 header，风格随仓库历史（`feat(delivery): ...`）。
- 分支 `feat/delivery-protocol` 基于 main 创建；开发在 worktree 进行（主工作区被并行会话 feat/unified-navigation 占用，严禁切走其 HEAD）。合并回 main 时若主工作区仍被占用，用 Task 5 的零劫持配方。
- 全程不跑 `npm run inject`（无 patch 改动）；全量测试用 `npm test`。

---

### Task 1: worktree 就位 + 协议核心（常量/类型/case 与 index 解析器）

**Files:**
- Create: `custom/client/matrix-teams/delivery-protocol.ts`
- Create: `custom/client/matrix-teams/__tests__/delivery-protocol.test.ts`
- Create: `docs/superpowers/specs/2026-09-18-distributed-delivery-network-design.md`（从 `/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/` 复制，随分支版本化）

**Interfaces:**
- Consumes: 无（首任务）。
- Produces: `DELIVERY_SCHEMA_VERSION`、`DELIVERY_EVENT_TYPES`、`DELIVERY_INDEX_ACCOUNT_DATA_TYPE`、`isDeliveryEventType(type): boolean`、`DELIVERY_STAGES`/`DELIVERY_GATES`/`HUMAN_GATES`、类型 `DeliveryStage`/`DeliveryGate`/`DeliveryTier`/`CaseContent`/`IndexContent`、`parseCaseContent(raw): CaseContent | null`、`parseIndexContent(raw): IndexContent | null`。Task 2-4 的测试与实现引用这些名字。

- [ ] **Step 1: 建 worktree 与分支，挂依赖链**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git worktree list   # 在途 worktree ≤3 方可新建（当前 1 个：matrix-fleet-deploy；本分支加入后 2 个）
git worktree add .claude/worktrees/feat-delivery-protocol -b feat/delivery-protocol main
cd .claude/worktrees/feat-delivery-protocol
ln -sfn /Volumes/nvme2230/lab/ncwk/overlay/node_modules node_modules
# .claude/worktrees/upstream 共享符号链已存在（vitest alias ../upstream 由此解析），无需新建
cp /Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-09-18-distributed-delivery-network-design.md docs/superpowers/specs/
```

- [ ] **Step 2: 写失败测试（常量 + case/index 解析）**

创建 `custom/client/matrix-teams/__tests__/delivery-protocol.test.ts`：

```ts
// overlay/custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
// 交付协议守门：事件类型常量 + content schema 解析（容错返回 null）+ 幂等投影 + HumanGate 校验。
import { describe, it, expect } from 'vitest'
import {
  DELIVERY_SCHEMA_VERSION, DELIVERY_EVENT_TYPES, DELIVERY_INDEX_ACCOUNT_DATA_TYPE,
  CASE_ROOM_POWER_LEVELS, isDeliveryEventType,
  DELIVERY_STAGES, DELIVERY_GATES, HUMAN_GATES,
  parseCaseContent, parseIndexContent,
} from '../delivery-protocol'

describe('事件类型常量与 PL 矩阵', () => {
  it('三事件 + index account data 类型符合 spec §5', () => {
    expect(DELIVERY_EVENT_TYPES.case).toBe('com.swarmstudio.delivery.case')
    expect(DELIVERY_EVENT_TYPES.stage).toBe('com.swarmstudio.delivery.stage')
    expect(DELIVERY_EVENT_TYPES.gate).toBe('com.swarmstudio.delivery.gate')
    expect(DELIVERY_INDEX_ACCOUNT_DATA_TYPE).toBe('com.swarmstudio.delivery.index')
    expect(DELIVERY_SCHEMA_VERSION).toBe(1)
  })
  it('PL：case=50（state），stage/gate=0（普通消息）', () => {
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.case]).toBe(50)
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.stage]).toBe(0)
    expect(CASE_ROOM_POWER_LEVELS.events[DELIVERY_EVENT_TYPES.gate]).toBe(0)
    expect(CASE_ROOM_POWER_LEVELS.state_default).toBe(50)
    expect(CASE_ROOM_POWER_LEVELS.events_default).toBe(0)
  })
  it('阶段/门禁枚举：P1-P6、G1-G6、人工门=G1/G5', () => {
    expect([...DELIVERY_STAGES]).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])
    expect([...DELIVERY_GATES]).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
    expect([...HUMAN_GATES]).toEqual(['G1', 'G5'])
  })
  it('isDeliveryEventType 按前缀识别，team.* 不误判', () => {
    expect(isDeliveryEventType('com.swarmstudio.delivery.case')).toBe(true)
    expect(isDeliveryEventType('com.swarmstudio.team.duty')).toBe(false)
    expect(isDeliveryEventType('m.room.message')).toBe(false)
  })
})

describe('parseCaseContent', () => {
  const ok = {
    schemaVersion: 1, caseId: 'c-001', title: 'stringops v0.2', repoUrl: 'git@example:ops.git',
    tier: 'standard', stage: 'P3', ownerAccount: '@alice:matrix.test',
    frozenAcceptance: 'AC1: pytest 全绿', createdAt: 1, updatedAt: 2, updatedBy: '@alice:matrix.test',
  }
  it('合法 content 原样解析（含可选 frozenAcceptance）', () => {
    expect(parseCaseContent(ok)).toEqual(ok)
  })
  it('可选字段缺省容忍', () => {
    const { frozenAcceptance, ...rest } = ok
    expect(parseCaseContent(rest)).toEqual({ ...rest, frozenAcceptance: undefined })
  })
  it('schemaVersion 缺失或非 1 → null（未知版本降级只读）', () => {
    const { schemaVersion, ...rest } = ok
    expect(parseCaseContent(rest)).toBeNull()
    expect(parseCaseContent({ ...ok, schemaVersion: 2 })).toBeNull()
    expect(parseCaseContent({ ...ok, schemaVersion: '1' })).toBeNull()
  })
  it('tier / stage 非枚举值 → null', () => {
    expect(parseCaseContent({ ...ok, tier: 'heavy' })).toBeNull()
    expect(parseCaseContent({ ...ok, stage: 'P7' })).toBeNull()
  })
  it('必填字段缺失或类型错 → null', () => {
    expect(parseCaseContent(null)).toBeNull()
    expect(parseCaseContent('str')).toBeNull()
    expect(parseCaseContent({ ...ok, ownerAccount: 5 })).toBeNull()
    expect(parseCaseContent({ ...ok, updatedAt: 't' })).toBeNull()
  })
  it('超限幅（title>200 / frozenAcceptance>4000）→ null', () => {
    expect(parseCaseContent({ ...ok, title: 'x'.repeat(201) })).toBeNull()
    expect(parseCaseContent({ ...ok, frozenAcceptance: 'x'.repeat(4001) })).toBeNull()
  })
})

describe('parseIndexContent', () => {
  const ok = { schemaVersion: 1, roomIds: ['!r1:x', '!r2:x'], updatedBy: '@alice:matrix.test', updatedAt: 3 }
  it('合法解析；roomIds 混入非字符串 → null', () => {
    expect(parseIndexContent(ok)).toEqual(ok)
    expect(parseIndexContent({ ...ok, roomIds: ['!r1:x', 1] })).toBeNull()
  })
  it('roomIds 超 50 → null', () => {
    expect(parseIndexContent({ ...ok, roomIds: Array.from({ length: 51 }, (_, i) => `!r${i}:x`) })).toBeNull()
  })
  it('schemaVersion/updatedBy 缺失 → null', () => {
    const { schemaVersion, ...rest } = ok
    expect(parseIndexContent(rest)).toBeNull()
    expect(parseIndexContent({ ...ok, updatedBy: undefined })).toBeNull()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat-delivery-protocol
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：FAIL（`Cannot find module '../delivery-protocol'`）。

- [ ] **Step 4: 写最小实现**

创建 `custom/client/matrix-teams/delivery-protocol.ts`：

```ts
// overlay/custom/client/matrix-teams/delivery-protocol.ts
// 交付案例房事件协议（分布式交付网络 spec §5 单一事实源）。
// 事件类型字符串只准在本文件出现（守门测试强制，模式同 protocol.ts）。
// 容错纪律同 protocol.ts：非法输入一律返回 null，不抛。
// schemaVersion 只认当前版本：未知版本解析为 null，事件被投影忽略（spec §11 降级只读）。
export const DELIVERY_SCHEMA_VERSION = 1

export const DELIVERY_EVENT_TYPES = {
  case: 'com.swarmstudio.delivery.case',
  stage: 'com.swarmstudio.delivery.stage',
  gate: 'com.swarmstudio.delivery.gate',
} as const

export const DELIVERY_INDEX_ACCOUNT_DATA_TYPE = 'com.swarmstudio.delivery.index'

const DELIVERY_EVENT_PREFIX = 'com.swarmstudio.delivery.'

export function isDeliveryEventType(type: string): boolean {
  return type.startsWith(DELIVERY_EVENT_PREFIX)
}

export const DELIVERY_STAGES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const
export const DELIVERY_GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const
/** G1 需求冻结 / G5 发布准入：verdict 的 sender 必须是人类账号（spec §6）。 */
export const HUMAN_GATES = ['G1', 'G5'] as const
export type DeliveryStage = (typeof DELIVERY_STAGES)[number]
export type DeliveryGate = (typeof DELIVERY_GATES)[number]
export type DeliveryTier = 'lite' | 'standard' | 'compliance'

/** 建交付案例房时的 power level 覆盖（spec §5：case state=50，stage/gate 普通消息=0）。 */
export const CASE_ROOM_POWER_LEVELS = {
  events_default: 0,
  state_default: 50,
  events: {
    [DELIVERY_EVENT_TYPES.case]: 50,
    [DELIVERY_EVENT_TYPES.stage]: 0,
    [DELIVERY_EVENT_TYPES.gate]: 0,
  },
} as const

export interface CaseContent {
  schemaVersion: number
  caseId: string
  title: string
  repoUrl: string
  tier: DeliveryTier
  stage: DeliveryStage
  ownerAccount: string
  /** G1 pass 后冻结的验收标准摘要（spec §6 纪律 1：改动=新案例）。 */
  frozenAcceptance?: string
  createdAt: number
  updatedAt: number
  updatedBy: string
}

export interface IndexContent {
  schemaVersion: number
  roomIds: string[]
  updatedBy: string
  updatedAt: number
}

// ── 解析器 ──
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function knownVersion(raw: Record<string, unknown>): boolean {
  return raw.schemaVersion === DELIVERY_SCHEMA_VERSION
}

const MAX_TITLE = 200
const MAX_ACCEPTANCE = 4000
const MAX_ROOMS = 50

export function parseCaseContent(raw: unknown): CaseContent | null {
  if (!isRecord(raw) || !knownVersion(raw)) return null
  const caseId = str(raw.caseId)
  const title = str(raw.title)
  const repoUrl = str(raw.repoUrl)
  const ownerAccount = str(raw.ownerAccount)
  const updatedBy = str(raw.updatedBy)
  const tier = str(raw.tier)
  const stage = str(raw.stage)
  const createdAt = num(raw.createdAt)
  const updatedAt = num(raw.updatedAt)
  if (!caseId || !title || !repoUrl || !ownerAccount || !updatedBy) return null
  if (createdAt === undefined || updatedAt === undefined) return null
  if (title.length > MAX_TITLE) return null
  if (tier !== 'lite' && tier !== 'standard' && tier !== 'compliance') return null
  if (!(DELIVERY_STAGES as readonly string[]).includes(stage)) return null
  const frozenAcceptance = str(raw.frozenAcceptance)
  if (frozenAcceptance !== undefined && frozenAcceptance.length > MAX_ACCEPTANCE) return null
  return {
    schemaVersion: DELIVERY_SCHEMA_VERSION, caseId, title, repoUrl,
    tier, stage, ownerAccount, frozenAcceptance, createdAt, updatedAt, updatedBy,
  }
}

export function parseIndexContent(raw: unknown): IndexContent | null {
  if (!isRecord(raw) || !knownVersion(raw)) return null
  const updatedBy = str(raw.updatedBy)
  const updatedAt = num(raw.updatedAt)
  if (!updatedBy || updatedAt === undefined || !Array.isArray(raw.roomIds)) return null
  if (raw.roomIds.length > MAX_ROOMS) return null
  const roomIds: string[] = []
  for (const r of raw.roomIds) {
    if (typeof r !== 'string') return null
    roomIds.push(r)
  }
  return { schemaVersion: DELIVERY_SCHEMA_VERSION, roomIds, updatedBy, updatedAt }
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：PASS（本任务 3 个 describe 组全绿）。

- [ ] **Step 6: 提交**

```bash
git add custom/client/matrix-teams/delivery-protocol.ts custom/client/matrix-teams/__tests__/delivery-protocol.test.ts docs/superpowers/specs/2026-09-18-distributed-delivery-network-design.md
git commit -m "feat(delivery): M1 协议核心——delivery.* 事件常量/case+index 解析器（含 spec 入库）"
```

---

### Task 2: stage 与 gate 解析器（worker 三级目标 + 证据 + 打回必附理由）

**Files:**
- Modify: `custom/client/matrix-teams/delivery-protocol.ts`（追加类型与解析器）
- Test: `custom/client/matrix-teams/__tests__/delivery-protocol.test.ts`（追加 describe）

**Interfaces:**
- Consumes: Task 1 的 `knownVersion`/`str`/`num`/`isRecord`（模块内私有）、`DeliveryStage`，以及 Task 1 修复轮加入的私有类型谓词 `isDeliveryStage(v: string): v is DeliveryStage`（`.includes()` 不收窄类型，守卫是唯一合规写法，禁止再写裸 includes 判枚举）。
- Produces: 类型 `StageWorker`/`StageOutcome`/`StageContent`/`GateVerdict`/`GateEvidenceKind`/`GateContent`；`parseStageContent(raw): StageContent | null`、`parseGateContent(raw): GateContent | null`。Task 3-4 引用这些类型。

- [ ] **Step 1: 追加失败测试**

在测试文件末尾追加：

```ts
import { parseStageContent, parseGateContent } from '../delivery-protocol'

describe('parseStageContent', () => {
  const ok = {
    schemaVersion: 1, caseId: 'c-001', stage: 'P3',
    worker: { account: '@bob:matrix.test', agentTeam: 'backend', profile: 'worker-coder' },
    outcome: 'done', artifactRef: 'git:main#abc123:docs/delivery/c-001/design.md',
    reportedBy: '@bob-agent:matrix.test', at: 10,
  }
  it('合法 content 原样解析（可选项缺省容忍）', () => {
    expect(parseStageContent(ok)).toEqual(ok)
    const { artifactRef, ...rest } = ok
    expect(parseStageContent(rest)).toEqual({ ...rest, artifactRef: undefined })
  })
  it('stage 非枚举 / outcome 非枚举 / worker 缺 account → null', () => {
    expect(parseStageContent({ ...ok, stage: 'P9' })).toBeNull()
    expect(parseStageContent({ ...ok, outcome: 'paused' })).toBeNull()
    expect(parseStageContent({ ...ok, worker: { agentTeam: 'x' } })).toBeNull()
    expect(parseStageContent({ ...ok, worker: null })).toBeNull()
  })
  it('schemaVersion 缺失 / at 非数 / artifactRef 超限 → null', () => {
    expect(parseStageContent({ ...ok, schemaVersion: 99 })).toBeNull()
    expect(parseStageContent({ ...ok, at: 'now' })).toBeNull()
    expect(parseStageContent({ ...ok, artifactRef: 'x'.repeat(513) })).toBeNull()
  })
})

describe('parseGateContent', () => {
  const pass = {
    schemaVersion: 1, caseId: 'c-001', gate: 'G1', verdict: 'pass',
    evidence: { kind: 'human', summary: 'owner 冻结验收边界' },
    decidedBy: '@alice:matrix.test', at: 20,
  }
  const rejected = {
    ...pass, gate: 'G4', verdict: 'reject',
    evidence: { kind: 'command-exit', summary: 'pytest exit 1: 2 failed' },
    reason: '[REJECT:用例不足] 补边界用例后重验',
    decidedBy: '@carol:matrix.test',
  }
  it('pass 合法（reason 可选）；reject 带 reason 合法', () => {
    expect(parseGateContent(pass)).toEqual(pass)
    expect(parseGateContent(rejected)).toEqual(rejected)
  })
  it('verdict=reject/conditional 而 reason 缺失 → null（spec §6 纪律 2：打回必附方向）', () => {
    const { reason, ...noReason } = rejected
    expect(parseGateContent(noReason)).toBeNull()
    expect(parseGateContent({ ...rejected, verdict: 'conditional', reason: undefined })).toBeNull()
  })
  it('gate 非枚举 / verdict 非枚举 / evidence 非法 → null', () => {
    expect(parseGateContent({ ...pass, gate: 'G7' })).toBeNull()
    expect(parseGateContent({ ...pass, verdict: 'maybe' })).toBeNull()
    expect(parseGateContent({ ...pass, evidence: null })).toBeNull()
    expect(parseGateContent({ ...pass, evidence: { kind: 'vibes', summary: 's' } })).toBeNull()
    expect(parseGateContent({ ...pass, evidence: { kind: 'human' } })).toBeNull()
  })
  it('summary 超 400 / reason 超 1000 → null', () => {
    expect(parseGateContent({ ...pass, evidence: { kind: 'human', summary: 'x'.repeat(401) } })).toBeNull()
    expect(parseGateContent({ ...rejected, reason: 'x'.repeat(1001) })).toBeNull()
  })
})
```

注意：`import` 语句合并到文件头部既有 import（与 Task 1 的 from '../delivery-protocol' 合并为一行导入），不要留两个同源 import。

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：FAIL（`parseStageContent` 未导出）。

- [ ] **Step 3: 追加实现**

在 `delivery-protocol.ts` 的 `parseIndexContent` 之后追加：

```ts
export type StageWorker = { account: string; agentTeam?: string; profile?: string }
export type StageOutcome = 'started' | 'done' | 'failed'

export interface StageContent {
  schemaVersion: number
  caseId: string
  stage: DeliveryStage
  worker: StageWorker
  outcome: StageOutcome
  /** 制品指针 git:<ref>#<commit>:<path>，本体在中央仓，不进事件（spec §4 边界规则 2）。 */
  artifactRef?: string
  reportedBy: string
  at: number
}

export type GateVerdict = 'pass' | 'conditional' | 'reject'
export type GateEvidenceKind = 'command-exit' | 'artifact' | 'human'

export interface GateContent {
  schemaVersion: number
  caseId: string
  gate: DeliveryGate
  verdict: GateVerdict
  evidence: { kind: GateEvidenceKind; summary: string }
  /** reject/conditional 必填（打回必附方向）；pass 可选。 */
  reason?: string
  decidedBy: string
  at: number
}

const MAX_REF = 512
const MAX_SUMMARY = 400
const MAX_REASON = 1000

function isDeliveryGate(v: string): v is DeliveryGate {
  return (DELIVERY_GATES as readonly string[]).includes(v)
}

function parseWorker(v: unknown): StageWorker | null {
  if (!isRecord(v)) return null
  const account = str(v.account)
  if (!account) return null
  return { account, agentTeam: str(v.agentTeam), profile: str(v.profile) }
}

export function parseStageContent(raw: unknown): StageContent | null {
  if (!isRecord(raw) || !knownVersion(raw)) return null
  const caseId = str(raw.caseId)
  const stage = str(raw.stage)
  const reportedBy = str(raw.reportedBy)
  const outcome = str(raw.outcome)
  const at = num(raw.at)
  if (!caseId || !reportedBy || at === undefined) return null
  if (stage === undefined || !isDeliveryStage(stage)) return null
  if (outcome !== 'started' && outcome !== 'done' && outcome !== 'failed') return null
  const worker = parseWorker(raw.worker)
  if (!worker) return null
  const artifactRef = str(raw.artifactRef)
  if (artifactRef !== undefined && artifactRef.length > MAX_REF) return null
  return { schemaVersion: DELIVERY_SCHEMA_VERSION, caseId, stage, worker, outcome, artifactRef, reportedBy, at }
}

export function parseGateContent(raw: unknown): GateContent | null {
  if (!isRecord(raw) || !knownVersion(raw)) return null
  const caseId = str(raw.caseId)
  const gate = str(raw.gate)
  const verdict = str(raw.verdict)
  const decidedBy = str(raw.decidedBy)
  const at = num(raw.at)
  if (!caseId || !decidedBy || at === undefined) return null
  if (gate === undefined || !isDeliveryGate(gate)) return null
  if (verdict !== 'pass' && verdict !== 'conditional' && verdict !== 'reject') return null
  if (!isRecord(raw.evidence)) return null
  const kind = str(raw.evidence.kind)
  const summary = str(raw.evidence.summary)
  if (kind !== 'command-exit' && kind !== 'artifact' && kind !== 'human') return null
  if (!summary || summary.length > MAX_SUMMARY) return null
  const reason = str(raw.reason)
  if (reason !== undefined && reason.length > MAX_REASON) return null
  if ((verdict === 'reject' || verdict === 'conditional') && !reason) return null
  return {
    schemaVersion: DELIVERY_SCHEMA_VERSION, caseId, gate, verdict,
    evidence: { kind, summary }, reason, decidedBy, at,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add custom/client/matrix-teams/delivery-protocol.ts custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
git commit -m "feat(delivery): stage/gate 解析器——worker 三级目标、证据三源、打回必附理由"
```

---

### Task 3: 发送者主体校验（HumanGate 人工判定 + 主体一致性）

**Files:**
- Modify: `custom/client/matrix-teams/delivery-protocol.ts`（追加校验函数）
- Test: `custom/client/matrix-teams/__tests__/delivery-protocol.test.ts`（追加 describe）

**Interfaces:**
- Consumes: Task 2 的 `StageContent`/`GateContent` 类型、Task 1 的 `HUMAN_GATES`。
- Produces: `isHumanAccount(userId): boolean`、`samePrincipal(a, b): boolean`、`validateGateSender(content, sender): string[]`、`validateStageSender(content, sender): string[]`。M2 的 store 读端消费这两个 validate（忽略校验不通过的事件并告警）。

背景：bot 命名约定 `@<user>-agent`（ncwk-sim spec §2.1，`@alice` 人类 + `@alice-agent` 其集群 bot）。principal = 去掉 `-agent` 后缀的 (localpart, domain)。

- [ ] **Step 1: 追加失败测试**

```ts
import { isHumanAccount, samePrincipal, validateGateSender, validateStageSender } from '../delivery-protocol'

describe('发送者主体校验', () => {
  it('isHumanAccount：-agent 后缀 = bot，其余 = 人类', () => {
    expect(isHumanAccount('@alice:matrix.test')).toBe(true)
    expect(isHumanAccount('@alice-agent:matrix.test')).toBe(false)
    expect(isHumanAccount('@agent:matrix.test')).toBe(true) // 本名就叫 agent，不带 -agent 后缀
  })
  it('samePrincipal：人类与其 bot 同主体，跨账号/跨域不同主体', () => {
    expect(samePrincipal('@alice:matrix.test', '@alice-agent:matrix.test')).toBe(true)
    expect(samePrincipal('@alice-agent:matrix.test', '@alice:matrix.test')).toBe(true)
    expect(samePrincipal('@alice:matrix.test', '@bob:matrix.test')).toBe(false)
    expect(samePrincipal('@alice:x', '@alice-agent:y')).toBe(false)
  })
  it('HumanGate（G1/G5）sender 是 bot → 报错（spec §5 负例）', () => {
    const g1 = { schemaVersion: 1, caseId: 'c', gate: 'G1', verdict: 'pass', evidence: { kind: 'human', summary: 's' }, decidedBy: '@alice:matrix.test', at: 1 } as const
    expect(validateGateSender(g1, '@alice:matrix.test')).toEqual([])
    expect(validateGateSender(g1, '@alice-agent:matrix.test')).toEqual(['gate G1 requires human sender'])
  })
  it('非 HumanGate 门禁允许 bot sender，但 decidedBy 须同主体', () => {
    const g4 = { schemaVersion: 1, caseId: 'c', gate: 'G4', verdict: 'conditional', evidence: { kind: 'command-exit', summary: 's' }, reason: 'r', decidedBy: '@carol:matrix.test', at: 1 } as const
    expect(validateGateSender(g4, '@carol-agent:matrix.test')).toEqual([])
    expect(validateGateSender(g4, '@bob-agent:matrix.test')).toEqual(['decidedBy is not the sender principal'])
  })
  it('stage：sender 须与 worker.account 和 reportedBy 同主体（spec §5 读端忽略依据）', () => {
    const st = { schemaVersion: 1, caseId: 'c', stage: 'P3', worker: { account: '@bob:matrix.test' }, outcome: 'done', reportedBy: '@bob:matrix.test', at: 1 } as const
    expect(validateStageSender(st, '@bob-agent:matrix.test')).toEqual([])
    expect(validateStageSender(st, '@carol-agent:matrix.test')).toEqual(['stage sender does not match worker/reportedBy principal'])
  })
})
```

同样：import 合并到文件头部统一导入。

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：FAIL（四个函数未导出）。

- [ ] **Step 3: 追加实现**

```ts
// ── 发送者主体校验（应用层角色约束，spec §5；Matrix PL 只管类型不管主体归属） ──

/** @<user>-agent 为集群 bot 命名约定（ncwk-sim §2.1）；非该后缀视为人类账号。 */
export function isHumanAccount(userId: string): boolean {
  const colon = userId.indexOf(':')
  const local = userId.startsWith('@') ? userId.slice(1, colon >= 0 ? colon : undefined) : userId
  return !local.endsWith('-agent')
}

function principalKey(userId: string): string {
  const colon = userId.indexOf(':')
  const domain = colon >= 0 ? userId.slice(colon) : ''
  let local = userId.startsWith('@') ? userId.slice(1, colon >= 0 ? colon : undefined) : userId
  if (local.endsWith('-agent')) local = local.slice(0, -'-agent'.length)
  return `${local}${domain}`
}

/** 同一人类与其集群 bot 视为同主体（人类名去 -agent 后缀 + 域名一致）。 */
export function samePrincipal(a: string, b: string): boolean {
  return principalKey(a) === principalKey(b)
}

export function validateGateSender(content: GateContent, sender: string): string[] {
  const errors: string[] = []
  if ((HUMAN_GATES as readonly string[]).includes(content.gate) && !isHumanAccount(sender)) {
    errors.push(`gate ${content.gate} requires human sender`)
  }
  if (!samePrincipal(content.decidedBy, sender)) {
    errors.push('decidedBy is not the sender principal')
  }
  return errors
}

export function validateStageSender(content: StageContent, sender: string): string[] {
  const ok = samePrincipal(content.worker.account, sender) && samePrincipal(content.reportedBy, sender)
  return ok ? [] : ['stage sender does not match worker/reportedBy principal']
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add custom/client/matrix-teams/delivery-protocol.ts custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
git commit -m "feat(delivery): 发送者主体校验——HumanGate 人工门禁与 worker 主体一致性"
```

---

### Task 4: 幂等投影（last-write-wins 按 at 取最新）

**Files:**
- Modify: `custom/client/matrix-teams/delivery-protocol.ts`（追加投影函数）
- Test: `custom/client/matrix-teams/__tests__/delivery-protocol.test.ts`（追加 describe）

**Interfaces:**
- Consumes: Task 2 的 `StageContent`/`GateContent`。
- Produces: `latestBy<T>(items, keyOf, atOf): Map<string, T>`（同 key 取 at 最大者，at 相同取数组靠后者）、`latestGateVerdicts(gates): Map<string, GateContent>`（key=`caseId:gate`）、`latestStageOutcomes(stages): Map<string, StageContent>`（key=`caseId:stage`）。M2 store 增量投影与外派视图聚合直接消费。

- [ ] **Step 1: 追加失败测试**

```ts
import { latestBy, latestGateVerdicts, latestStageOutcomes } from '../delivery-protocol'

describe('幂等投影（spec §5：最新 at 覆盖，幂等语义同 receipt）', () => {
  it('latestBy：同 key 取 at 最大；at 相同取靠后元素', () => {
    const items = [
      { id: 'a', at: 1, v: 'old' },
      { id: 'b', at: 5, v: 'only' },
      { id: 'a', at: 3, v: 'new' },
      { id: 'a', at: 3, v: 'last-wins' },
    ]
    const m = latestBy(items, x => x.id, x => x.at)
    expect(m.get('a')?.v).toBe('last-wins')
    expect(m.get('b')?.v).toBe('only')
    expect(m.size).toBe(2)
  })
  it('latestBy：空输入返回空 Map', () => {
    expect(latestBy([], () => '', () => 0).size).toBe(0)
  })
  it('latestGateVerdicts：同案例同门禁取最新 verdict（打回后补验覆盖）', () => {
    const mk = (at: number, verdict: 'reject' | 'pass') => ({
      schemaVersion: 1 as const, caseId: 'c-001', gate: 'G4' as const, verdict,
      evidence: { kind: 'command-exit' as const, summary: 's' },
      ...(verdict === 'reject' ? { reason: '[REJECT:x] r' } : {}),
      decidedBy: '@carol:matrix.test', at,
    })
    const m = latestGateVerdicts([mk(10, 'reject'), mk(12, 'pass')])
    expect(m.get('c-001:G4')?.verdict).toBe('pass')
  })
  it('latestStageOutcomes：同案例同阶段取最新 outcome（started→done）', () => {
    const mk = (at: number, outcome: 'started' | 'done') => ({
      schemaVersion: 1 as const, caseId: 'c-001', stage: 'P3' as const,
      worker: { account: '@bob:matrix.test' }, outcome, reportedBy: '@bob-agent:matrix.test', at,
    })
    const m = latestStageOutcomes([mk(5, 'started'), mk(9, 'done')])
    expect(m.get('c-001:P3')?.outcome).toBe('done')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：FAIL（三个函数未导出）。

- [ ] **Step 3: 追加实现**

```ts
// ── 幂等投影：事件按 key 归并，同 key 取 at 最新（at 相同取靠后元素，homeserver 定序兜底） ──

export function latestBy<T>(items: readonly T[], keyOf: (t: T) => string, atOf: (t: T) => number): Map<string, T> {
  const out = new Map<string, T>()
  for (const it of items) {
    const k = keyOf(it)
    const prev = out.get(k)
    if (!prev || atOf(it) >= atOf(prev)) out.set(k, it)
  }
  return out
}

export function latestGateVerdicts(gates: readonly GateContent[]): Map<string, GateContent> {
  return latestBy(gates, g => `${g.caseId}:${g.gate}`, g => g.at)
}

export function latestStageOutcomes(stages: readonly StageContent[]): Map<string, StageContent> {
  return latestBy(stages, s => `${s.caseId}:${s.stage}`, s => s.at)
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add custom/client/matrix-teams/delivery-protocol.ts custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
git commit -m "feat(delivery): 幂等投影 latestBy/latestGateVerdicts/latestStageOutcomes"
```

---

### Task 5: 守门测试 + 全量回归 + 合并收口

**Files:**
- Test: `custom/client/matrix-teams/__tests__/delivery-protocol.test.ts`（追加守门 describe）

**Interfaces:**
- Consumes: 前四个任务的全部产物（本任务零新接口）。
- Produces: 收口后的 `feat/delivery-protocol` → main 合并；守门断言覆盖 delivery 前缀字面量防漂移。

- [ ] **Step 1: 追加守门测试（delivery 字面量只准出现在 delivery-protocol.ts）**

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

describe('协议守门：delivery 事件类型字符串禁止内联', () => {
  function collect(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...collect(p))
      else if (p.endsWith('.ts') || p.endsWith('.vue')) out.push(p)
    }
    return out
  }
  it('除 delivery-protocol.ts 与测试外，模块内不得出现 com.swarmstudio.delivery. 字面量', () => {
    const root = join(__dirname, '..')
    const offenders = collect(root).filter(
      p => !p.endsWith('delivery-protocol.ts') && !p.includes('__tests__')
        && readFileSync(p, 'utf8').includes('com.swarmstudio.delivery.'),
    )
    expect(offenders).toEqual([])
  })
})
```

说明：既有 `protocol.test.ts` 的守门用 `endsWith('protocol.ts')` 放行，`delivery-protocol.ts` 天然豁免、不会误红；本断言补齐 delivery 前缀的专项防线（M2 写端只能 import 常量）。`node:fs`/`node:path` import 若与文件头部重复则合并。

- [ ] **Step 2: 跑本文件 + 全量套件**

```bash
npx vitest run custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
npm test
```

预期：全绿（基线 154 文件 / 1624 测试 + 本文件新增，不引入任何既有测试变红）。若出现与本分支无关的红（并行会话正在主工作区注入 unified-navigation 的 B 类 patch，upstream 树为共享态，有注入态伪影先例）：先 `git stash list` 与 `git -C ../../.. log -1` 记录现场，再切到 main 基线复跑同文件——main 上同样红的是环境伪影，如实记录后继续（不伪造通过、不修别人分支的文件）；main 上不红的才是本分支引入，必须修复后再走 Step 3。

- [ ] **Step 3: 范围断言（M1 纯 A 类自检）**

```bash
git diff main --stat
```

预期：只有 `custom/client/matrix-teams/delivery-protocol.ts`、`custom/client/matrix-teams/__tests__/delivery-protocol.test.ts`、`docs/superpowers/specs/2026-09-18-distributed-delivery-network-design.md` 三处新增。若出现 `patches/` 或其他路径——停下排查，M1 不允许 B 类改动（无 patch 变更故无需 inject 重放）。

- [ ] **Step 4: 提交守门测试**

```bash
git add custom/client/matrix-teams/__tests__/delivery-protocol.test.ts
git commit -m "test(delivery): delivery 事件类型字面量守门断言"
```

- [ ] **Step 5: 合并回 main（主工作区空闲走标准路；被并行会话占用走零劫持配方）**

先探测主工作区状态：

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git status --short | wc -l          # 脏文件数
git branch --show-current            # 当前 HEAD
```

路径 A（主工作区 clean 且在 main）——标准收口：

```bash
git merge --no-ff feat/delivery-protocol -m "merge: feat/delivery-protocol — M1 delivery.* 协议扩展"
git worktree remove .claude/worktrees/feat-delivery-protocol
git branch -d feat/delivery-protocol
```

路径 B（主工作区被并行会话占用：非 clean 或 HEAD≠main）——零劫持配方（不触碰主工作区 HEAD 与工作树）：

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/feat-delivery-protocol
git fetch origin --prune 2>/dev/null; git rebase main   # main 若已被并行推进，先 rebase
git worktree add --detach /tmp/merge-delivery main
cd /tmp/merge-delivery
git merge --no-ff feat/delivery-protocol -m "merge: feat/delivery-protocol — M1 delivery.* 协议扩展"
git update-ref refs/heads/main HEAD    # main 指针前移，主工作区不动
git worktree remove /tmp/merge-delivery
cd /Volumes/nvme2230/lab/ncwk/overlay                  # 先退出待删 worktree 再删
git worktree remove .claude/worktrees/feat-delivery-protocol
git merge-base --is-ancestor feat/delivery-protocol main && git branch -D feat/delivery-protocol   # 已并入 main，强删指针
```

- [ ] **Step 6: 推送与清理验证**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git push origin main        # 推送口径按用户当日指令执行（此前有「待统一推」先例）；直连失败走 ssh443 deploy key 通道（记忆：swarmstudio-release-network-routes）
git worktree list           # 预期只剩 main + 其他并行会话的 worktree，无 feat-delivery-protocol
git branch --list 'feat/delivery-protocol'   # 预期空
```

推送被拒（origin 领先）时：`git pull --rebase origin main` 后重推；仍冲突则停下来向用户报告，不强行推。用户未要求推送时，合并留在本地 main 并在收口报告中注明「未推 origin」。

---

## 自检记录（写计划时已核）

1. **Spec 覆盖**：spec §5 三事件 schema（case/stage/gate）→ Task 1/2；index 发现 → Task 1（parseIndexContent + isDeliveryEventType 兜底检测）；幂等覆盖 → Task 4；HumanGate sender 校验负例 → Task 3；守门测试 → Task 5；PL 矩阵 → Task 1（CASE_ROOM_POWER_LEVELS）。M1 验收门四项（schema 容错/幂等/HumanGate 负例/纯 A 类）全部有对应任务。
2. **占位符扫描**：无 TBD/TODO；全部代码块完整可粘贴。
3. **类型一致性**：`GateContent.evidence` 在 Task 2 定义、Task 3 测试 `as const` 用法已核对（`kind: 'human' as const` 满足字面量类型）；`latestBy` 泛型签名与 Task 4 两个包装函数一致；import 合并说明在 Task 2/3/5 各有一句。
