# 执行单元责任台账与署名记录 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 AIStudio 自身的 AI 执行单元建立五阶段责任台账、责任卡、人署名记录与六问完成判据，并把同一套记录接入全流程推演方案与推演程序。

**Architecture:** 在既有 `custom/server/agentidentity/` 身份册上扩责任卡与生命周期（单一台账，不新开域）；署名记录作为同域 append-only JSONL；六问报表挂既有跨域聚合域 `autonomygov`；客户端在治理页签增三个平铺 Section；推演侧用独立库 `mx-workunit-lib.sh` 在 G1/G2/G5/报告段写记录与快照。

**Tech Stack:** TypeScript（Koa + vitest）、Vue 3 + naive-ui、bash（simharness）、Python（报告生成/审计）。

## Global Constraints

- 响应形状只走 `custom/server/lib/http` 的 `ok/fail/bodyOf`（K19）；新模块不得裸写 `ctx.body`。
- 台账存储目录沿用 `AGENT_IDENTITY_STORE` → `underWebUi('agent-identity')`；测试用 `_use*StoreForTests` 隔离，不碰宿主台账。
- 署名记录只收 `source: 'human-entry'`；不提供任何遥测写入端点。
- 六问无源一律 `unknown` 并带 `gap`；不得输出个人排序、评分或权重。
- 主责任人 / 复核人 / 接管人 / 维护人必须是 `people.json` 中 `active: true` 的自然人。
- 注释用中文、标识符用英文；提交信息用 Conventional Commits 中文 header。
- 每个任务先写失败测试，再实现，再跑目标测试，最后提交。

---

### Task 1: 自然人名单

**Files:**
- Create: `custom/server/agentidentity/people.ts`
- Test: `custom/server/agentidentity/__tests__/people.test.ts`

**Interfaces:**
- Produces: `Person`、`listPeople()`、`getPerson(id)`、`upsertPerson(input, actor)`、`activatePerson(id, actor)`、`_usePeopleStoreForTests(dir | null)`。

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _usePeopleStoreForTests, activatePerson, getPerson, listPeople, upsertPerson } from '../people'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'people-')); _usePeopleStoreForTests(dir) })
afterEach(() => { _usePeopleStoreForTests(null); rmSync(dir, { recursive: true, force: true }) })

describe('people registry', () => {
  it('登记后默认 inactive，激活后可读', () => {
    const r = upsertPerson({ name: 'plusprimer', emails: ['plusprimer@me.com'], source: 'git' }, 'test')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.person.active).toBe(false)
    const a = activatePerson(r.person.id, 'test')
    expect(a.ok).toBe(true)
    expect(getPerson(r.person.id)?.active).toBe(true)
  })
  it('同邮箱幂等，不重复建人', () => {
    const a = upsertPerson({ name: 'A', emails: ['x@y.z'], source: 'git' }, 't')
    const b = upsertPerson({ name: 'A2', emails: ['x@y.z'], source: 'git' }, 't')
    expect(a.ok && b.ok).toBe(true)
    expect(listPeople()).toHaveLength(1)
  })
  it('空名字拒绝', () => {
    expect(upsertPerson({ name: '  ', emails: [], source: 'manual' }, 't').ok).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run custom/server/agentidentity/__tests__/people.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// custom/server/agentidentity/people.ts
// 自然人名单：责任卡的主责任人/复核人只能引用这里 active 的人。
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

export interface Person {
  id: string
  name: string
  emails: string[]
  active: boolean
  source: 'git' | 'manual'
  createdAt: number
  activatedAt?: number
}

interface StoreShape { people: Person[]; nextSeq: number }

let overrideDir: string | null = null
export function _usePeopleStoreForTests(dir: string | null): void { overrideDir = dir }

function storeDir(): string {
  if (overrideDir) return overrideDir
  return process.env.AGENT_IDENTITY_STORE?.trim() || underWebUi('agent-identity')
}
function storePath(): string { return join(storeDir(), 'people.json') }

function readStore(): StoreShape {
  try {
    const raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<StoreShape>
    return { people: Array.isArray(raw.people) ? raw.people : [], nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1 }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { people: [], nextSeq: 1 }
    throw e
  }
}
function writeStore(s: StoreShape): void { mkdirSync(storeDir(), { recursive: true }); atomicWriteJson(storePath(), s, { fsync: true }) }

export function listPeople(): Person[] { return readStore().people.map((p) => ({ ...p })) }
export function getPerson(id: string): Person | null { return readStore().people.find((p) => p.id === id) ?? null }

export function upsertPerson(
  input: { id?: string; name: string; emails?: string[]; source?: 'git' | 'manual' },
  _actor: string,
): { ok: true; person: Person } | { ok: false; problems: string[] } {
  const name = String(input.name ?? '').trim()
  if (!name) return { ok: false, problems: ['name 必填'] }
  const emails = (input.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean)
  const store = readStore()
  const byEmail = emails.length ? store.people.find((p) => p.emails.some((e) => emails.includes(e))) : undefined
  const byId = input.id ? store.people.find((p) => p.id === input.id) : undefined
  const existing = byId ?? byEmail
  if (existing) {
    existing.name = name
    existing.emails = [...new Set([...existing.emails, ...emails])]
    writeStore(store)
    return { ok: true, person: { ...existing } }
  }
  const person: Person = {
    id: input.id ?? `p-${store.nextSeq++}`,
    name, emails, active: false, source: input.source ?? 'manual', createdAt: Date.now(),
  }
  store.people.push(person)
  writeStore(store)
  return { ok: true, person: { ...person } }
}

export function activatePerson(id: string, _actor: string): { ok: true; person: Person } | { ok: false; problems: string[] } {
  const store = readStore()
  const person = store.people.find((p) => p.id === id)
  if (!person) return { ok: false, problems: [`自然人不存在：${id}`] }
  person.active = true
  person.activatedAt = Date.now()
  writeStore(store)
  return { ok: true, person: { ...person } }
}

export function activePersonIds(): Set<string> {
  return new Set(listPeople().filter((p) => p.active).map((p) => p.id))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run custom/server/agentidentity/__tests__/people.test.ts`
Expected: PASS 3/3

- [ ] **Step 5: 提交**

```bash
git add custom/server/agentidentity/people.ts custom/server/agentidentity/__tests__/people.test.ts
git commit -m "feat(agentidentity): 自然人名单（责任卡署名主体）"
```

---

### Task 2: 责任卡校验

**Files:**
- Create: `custom/server/agentidentity/responsibility.ts`
- Test: `custom/server/agentidentity/__tests__/responsibility.test.ts`

**Interfaces:**
- Consumes: `Person`（Task 1）。
- Produces: `ResponsibilityCard`、`AdmissionEvidence`、`CardGap`、`validateCard(card, people, opts)`、`cardGaps(card, people, opts)`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { cardGaps, type ResponsibilityCard, validateCard } from '../responsibility'

const people = [
  { id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual' as const, createdAt: 1 },
  { id: 'p-2', name: 'bob', emails: [], active: true, source: 'manual' as const, createdAt: 1 },
  { id: 'p-3', name: 'carol', emails: [], active: false, source: 'manual' as const, createdAt: 1 },
]
const base: ResponsibilityCard = {
  deliveryStandard: '交付可复现的测试报告',
  riskTier: 'medium',
  primaryOwner: 'p-1',
  escalation: ['关键规则无法验证时升级'],
  pauseConditions: ['出现越权调用时暂停'],
  takerOver: 'p-2',
  testCaseVersion: 'tc-2026-11-06',
  costBudget: { limit: 100, unit: 'CNY/轮' },
  maintainer: 'p-1',
  deploymentLocation: 'studio:8802',
}

describe('responsibility card', () => {
  it('完整卡无缺口', () => {
    expect(validateCard(base, people as never)).toEqual([])
  })
  it('高风险必须复核人且不得与主责任人同一人', () => {
    expect(validateCard({ ...base, riskTier: 'high' }, people as never).join()).toContain('复核人')
    expect(validateCard({ ...base, riskTier: 'high', reviewer: 'p-1' }, people as never).join()).toContain('不得为同一人')
    expect(validateCard({ ...base, riskTier: 'high', reviewer: 'p-2' }, people as never)).toEqual([])
  })
  it('非 active 自然人拒绝', () => {
    expect(validateCard({ ...base, primaryOwner: 'p-3' }, people as never).join()).toContain('在岗')
  })
  it('准入证据三组必填', () => {
    const gaps = cardGaps(base, people as never, { forAdmission: true })
    expect(gaps.map((g) => g.field)).toEqual(expect.arrayContaining(['admission-evidence', 'business-owner-sign']))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run custom/server/agentidentity/__tests__/responsibility.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// custom/server/agentidentity/responsibility.ts
// 责任卡：任务边界之外的可追责要素。校验纯函数，不读盘。
import type { Person } from './people'

export interface AdmissionEvidence {
  representativeTasks: string[]
  edgeCases: string[]
  dataPermissionReview: string[]
  recordedAt: number
}
export interface ResponsibilityCard {
  deliveryStandard: string
  riskTier: 'low' | 'medium' | 'high'
  primaryOwner: string
  reviewer?: string
  escalation: string[]
  pauseConditions: string[]
  takerOver: string
  testCaseVersion: string
  costBudget: { limit: number; unit: string }
  maintainer: string
  deploymentLocation: string
  businessOwnerSign?: { signedBy: string; signedAt: number; note?: string }
  admissionEvidence?: AdmissionEvidence
}
export interface CardGap { field: string; detail: string }

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const arrNonEmpty = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(nonEmpty)

export function validateCard(card: ResponsibilityCard | undefined, people: Person[]): string[] {
  const problems: string[] = []
  if (!card) return ['责任卡未填写']
  const active = new Map(people.filter((p) => p.active).map((p) => [p.id, p]))
  if (!nonEmpty(card.deliveryStandard)) problems.push('deliveryStandard 必填（交付标准）')
  if (!['low', 'medium', 'high'].includes(card.riskTier)) problems.push('riskTier 须为 low|medium|high')
  if (!active.has(card.primaryOwner)) problems.push('primaryOwner 必须是在岗自然人')
  if (card.riskTier === 'high') {
    if (!card.reviewer) problems.push('高风险执行单元必须登记复核人')
    else if (card.reviewer === card.primaryOwner) problems.push('复核人不得为同一人（高风险）')
  }
  if (card.reviewer && !active.has(card.reviewer)) problems.push('reviewer 必须是在岗自然人')
  if (!arrNonEmpty(card.escalation)) problems.push('escalation 至少一条（什么情况必须升级）')
  if (!arrNonEmpty(card.pauseConditions)) problems.push('pauseConditions 至少一条（什么情况必须暂停）')
  if (!active.has(card.takerOver)) problems.push('takerOver 必须是在岗自然人')
  if (!nonEmpty(card.testCaseVersion)) problems.push('testCaseVersion 必填')
  if (!card.costBudget || !(card.costBudget.limit > 0) || !nonEmpty(card.costBudget.unit)) problems.push('costBudget 须含正的 limit 与 unit')
  if (!active.has(card.maintainer)) problems.push('maintainer 必须是在岗自然人')
  if (!nonEmpty(card.deploymentLocation)) problems.push('deploymentLocation 必填')
  return problems
}

export function cardGaps(card: ResponsibilityCard | undefined, people: Person[], opts: { forAdmission?: boolean } = {}): CardGap[] {
  const gaps = validateCard(card, people).map((detail) => ({ field: 'card', detail }))
  if (!card) return gaps
  if (opts.forAdmission) {
    if (!card.businessOwnerSign || !nonEmpty(card.businessOwnerSign.signedBy)) {
      gaps.push({ field: 'business-owner-sign', detail: '准入前须由业务负责人签署责任卡' })
    }
    const ev = card.admissionEvidence
    if (!ev || !arrNonEmpty(ev.representativeTasks) || !arrNonEmpty(ev.edgeCases) || !arrNonEmpty(ev.dataPermissionReview)) {
      gaps.push({ field: 'admission-evidence', detail: '准入须记录代表性任务、边界情况、数据与权限评估' })
    }
  }
  return gaps
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run custom/server/agentidentity/__tests__/responsibility.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: 提交**

```bash
git add custom/server/agentidentity/responsibility.ts custom/server/agentidentity/__tests__/responsibility.test.ts
git commit -m "feat(agentidentity): 责任卡校验（高风险复核人分离/在岗自然人/准入证据）"
```

---

### Task 3: 五阶段状态机

**Files:**
- Create: `custom/server/agentidentity/lifecycle.ts`
- Test: `custom/server/agentidentity/__tests__/lifecycle.test.ts`

**Interfaces:**
- Consumes: `ResponsibilityCard`、`cardGaps`、`Person`。
- Produces: `Stage`、`Lifecycle`、`LifecycleEvent`、`TransitionInput`、`initialLifecycle()`、`normalizeLifecycle()`、`stageOf()`、`canTransition()`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { canTransition, initialLifecycle, stageOf } from '../lifecycle'
import type { ResponsibilityCard } from '../responsibility'

const people = [
  { id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual' as const, createdAt: 1 },
  { id: 'p-2', name: 'bob', emails: [], active: true, source: 'manual' as const, createdAt: 1 },
]
const card: ResponsibilityCard = {
  deliveryStandard: 'x', riskTier: 'medium', primaryOwner: 'p-1',
  escalation: ['e'], pauseConditions: ['p'], takerOver: 'p-2',
  testCaseVersion: 'tc-1', costBudget: { limit: 1, unit: 'CNY/轮' },
  maintainer: 'p-1', deploymentLocation: 'loc',
  businessOwnerSign: { signedBy: 'p-1', signedAt: 1 },
  admissionEvidence: { representativeTasks: ['t'], edgeCases: ['e'], dataPermissionReview: ['d'], recordedAt: 1 },
}
const base = { name: 'u', owner: 'o', toolAllowlist: [], responsibilityCard: card, lifecycle: initialLifecycle() }

describe('lifecycle', () => {
  it('无生命周期按 registered', () => {
    expect(stageOf({ name: 'u', owner: 'o', toolAllowlist: [] } as never)).toBe('registered')
  })
  it('registered→admitted 需卡与准入证据', () => {
    expect(canTransition(base as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people as never).ok).toBe(true)
    expect(canTransition({ ...base, responsibilityCard: undefined } as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people as never).ok).toBe(false)
  })
  it('changing→running 需两条证据', () => {
    const changing = { ...base, lifecycle: { stage: 'changing' as const, history: [] } }
    expect(canTransition(changing as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: ['a'] }, people as never).ok).toBe(false)
    expect(canTransition(changing as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: ['a', 'b'] }, people as never).ok).toBe(true)
  })
  it('退役需交接项与确认人；高风险确认人不得是主责任人', () => {
    const running = { ...base, lifecycle: { stage: 'running' as const, history: [] } }
    expect(canTransition(running as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { kind: 'pause', items: [] } }, people as never).ok).toBe(false)
    expect(canTransition(running as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { kind: 'pause', items: ['交接待办'], confirmedBy: 'p-2' } }, people as never).ok).toBe(true)
  })
  it('迁移人必须 active 且理由非空', () => {
    expect(canTransition(base as never, { to: 'admitted', by: 'p-x', reason: 'ok' }, people as never).ok).toBe(false)
    expect(canTransition(base as never, { to: 'admitted', by: 'p-1', reason: ' ' }, people as never).ok).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run custom/server/agentidentity/__tests__/lifecycle.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// custom/server/agentidentity/lifecycle.ts
// 五阶段状态机（纯函数）：登记→准入→运行→变更→退出。
import type { Person } from './people'
import { cardGaps, type ResponsibilityCard } from './responsibility'

export type Stage = 'registered' | 'admitted' | 'running' | 'changing' | 'retired'
export interface LifecycleEvent { from: Stage | null; to: Stage; at: number; by: string; reason: string; evidenceRefs: string[] }
export interface ExitRecord { kind: 'pause' | 'revoke' | 'decommission'; items: string[]; confirmedBy?: string; confirmedAt?: number }
export interface Lifecycle { stage: Stage; history: LifecycleEvent[]; exit?: ExitRecord }
export interface TransitionInput { to: Stage; by: string; reason: string; evidenceRefs?: string[]; exit?: ExitRecord }

export function initialLifecycle(): Lifecycle { return { stage: 'registered', history: [] } }

export function normalizeLifecycle(l?: Lifecycle): Lifecycle {
  if (!l || !l.stage) return initialLifecycle()
  return { stage: l.stage, history: Array.isArray(l.history) ? l.history : [], ...(l.exit ? { exit: l.exit } : {}) }
}

export function stageOf(identity: { lifecycle?: Lifecycle }): Stage {
  return identity.lifecycle?.stage ?? 'registered'
}

export function canTransition(
  identity: { responsibilityCard?: ResponsibilityCard; lifecycle?: Lifecycle },
  input: TransitionInput,
  people: Person[],
): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const active = new Set(people.filter((p) => p.active).map((p) => p.id))
  const from = stageOf(identity)
  if (!active.has(input.by)) problems.push('迁移人必须是在岗自然人')
  if (typeof input.reason !== 'string' || !input.reason.trim()) problems.push('迁移理由必填')
  if (from === input.to) problems.push(`已处于 ${from}，无需迁移`)
  if (from === 'retired') problems.push('已退役，不可再迁移')
  const legal: Record<Stage, Stage[]> = {
    registered: ['admitted', 'retired'],
    admitted: ['running', 'retired'],
    running: ['changing', 'retired'],
    changing: ['running', 'retired'],
    retired: [],
  }
  if (from !== input.to && !legal[from].includes(input.to)) problems.push(`非法迁移：${from} → ${input.to}`)
  if (input.to === 'admitted') {
    const gaps = cardGaps(identity.responsibilityCard, people, { forAdmission: true })
    for (const g of gaps) problems.push(g.detail)
  }
  if (from === 'changing' && input.to === 'running') {
    if ((input.evidenceRefs ?? []).length < 2) problems.push('变更后重启须有重新验证与重新授权两条证据')
  }
  if (input.to === 'retired') {
    const exit = input.exit
    if (!exit || !Array.isArray(exit.items) || exit.items.length === 0) problems.push('退出须登记暂停/撤权/未完事项/交接确认项')
    if (!exit?.confirmedBy || !active.has(exit.confirmedBy)) problems.push('退出须由在岗自然人确认交接')
    if (identity.responsibilityCard?.riskTier === 'high' && exit?.confirmedBy === identity.responsibilityCard.primaryOwner) {
      problems.push('高风险执行单元退出确认人不得与主责任人为同一人')
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run custom/server/agentidentity/__tests__/lifecycle.test.ts`
Expected: PASS 5/5

- [ ] **Step 5: 提交**

```bash
git add custom/server/agentidentity/lifecycle.ts custom/server/agentidentity/__tests__/lifecycle.test.ts
git commit -m "feat(agentidentity): 五阶段生命周期状态机与守卫"
```

---

### Task 4: 署名记录

**Files:**
- Create: `custom/server/agentidentity/judgments.ts`
- Test: `custom/server/agentidentity/__tests__/judgments.test.ts`

**Interfaces:**
- Produces: `JudgmentKind`、`JudgmentRecord`、`appendJudgment(input, people)`、`listJudgments(unitId?)`、`_useJudgmentStoreForTests(dir | null)`。

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _useJudgmentStoreForTests, appendJudgment, listJudgments } from '../judgments'

const people = [{ id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual' as const, createdAt: 1 }]
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'judg-')); _useJudgmentStoreForTests(dir) })
afterEach(() => { _useJudgmentStoreForTests(null); rmSync(dir, { recursive: true, force: true }) })

describe('judgment records', () => {
  it('正常署名记录', () => {
    const r = appendJudgment({ unitId: 'aid-1', kind: 'acceptance', subjectRef: 'card-1', rationale: '复核了三条边界用例，结论正确', evidenceRefs: ['ev-1'] }, 'p-1', people as never)
    expect(r.ok).toBe(true)
    expect(listJudgments('aid-1')).toHaveLength(1)
  })
  it('理由不足 20 字拒绝', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'acceptance', subjectRef: 'x', rationale: '太短', evidenceRefs: [] }, 'p-1', people as never).ok).toBe(false)
  })
  it('非在岗自然人拒绝', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'override', subjectRef: 'x', rationale: '这是一条足够长的推翻理由说明', evidenceRefs: [] }, 'p-x', people as never).ok).toBe(false)
  })
  it('subjectRef 必填', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'rejection', subjectRef: ' ', rationale: '这是一条足够长的打回理由说明', evidenceRefs: [] }, 'p-1', people as never).ok).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run custom/server/agentidentity/__tests__/judgments.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// custom/server/agentidentity/judgments.ts
// 人署名记录：验收/打回/推翻/升级/暂停/组织能力。只收 human-entry。
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendJsonl } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type { Person } from './people'

export type JudgmentKind = 'acceptance' | 'rejection' | 'override' | 'escalation' | 'pause' | 'capability'
export interface JudgmentRecord {
  id: string
  unitId: string
  kind: JudgmentKind
  subjectRef: string
  rationale: string
  evidenceRefs: string[]
  signedBy: string
  signedAt: number
  source: 'human-entry'
}
export interface JudgmentInput {
  unitId: string
  kind: JudgmentKind
  subjectRef: string
  rationale: string
  evidenceRefs?: string[]
}

let overrideDir: string | null = null
export function _useJudgmentStoreForTests(dir: string | null): void { overrideDir = dir }
function storeDir(): string {
  if (overrideDir) return overrideDir
  return process.env.AGENT_IDENTITY_STORE?.trim() || underWebUi('agent-identity')
}
function filePath(): string { return join(storeDir(), 'judgments.jsonl') }

const KINDS: JudgmentKind[] = ['acceptance', 'rejection', 'override', 'escalation', 'pause', 'capability']

export function listJudgments(unitId?: string): JudgmentRecord[] {
  let raw = ''
  try { raw = readFileSync(filePath(), 'utf8') } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const out: JudgmentRecord[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line) as JudgmentRecord) } catch { /* 坏行跳过，不伪造 */ }
  }
  return unitId ? out.filter((r) => r.unitId === unitId) : out
}

export function appendJudgment(
  input: JudgmentInput,
  signedBy: string,
  people: Person[],
): { ok: true; record: JudgmentRecord } | { ok: false; problems: string[] } {
  const problems: string[] = []
  if (!input.unitId?.trim()) problems.push('unitId 必填')
  if (!KINDS.includes(input.kind)) problems.push('kind 非法')
  if (!input.subjectRef?.trim()) problems.push('subjectRef 必填（任务/交付物/规则引用）')
  if (typeof input.rationale !== 'string' || input.rationale.trim().length < 20) problems.push('rationale 至少 20 字（写出依据，不写结论）')
  const signer = people.find((p) => p.id === signedBy)
  if (!signer || !signer.active) problems.push('signedBy 必须是在岗自然人')
  if (problems.length) return { ok: false, problems }
  const record: JudgmentRecord = {
    id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    unitId: input.unitId.trim(),
    kind: input.kind,
    subjectRef: input.subjectRef.trim(),
    rationale: input.rationale.trim(),
    evidenceRefs: (input.evidenceRefs ?? []).map(String),
    signedBy,
    signedAt: Date.now(),
    source: 'human-entry',
  }
  mkdirSync(storeDir(), { recursive: true })
  appendJsonl(filePath(), record)
  return { ok: true, record }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run custom/server/agentidentity/__tests__/judgments.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: 提交**

```bash
git add custom/server/agentidentity/judgments.ts custom/server/agentidentity/__tests__/judgments.test.ts
git commit -m "feat(agentidentity): 人署名记录（只收 human-entry，理由≥20字）"
```

---

### Task 5: 身份册接入责任卡与生命周期

**Files:**
- Modify: `custom/server/agentidentity/agent-identity.ts`
- Test: `custom/server/agentidentity/__tests__/identity-card.test.ts`

**Interfaces:**
- Consumes: Task 1–4 的 `listPeople`、`validateCard`、`canTransition`、`normalizeLifecycle`。
- Produces: `AgentIdentity.responsibilityCard?`、`AgentIdentity.lifecycle?`、`updateResponsibilityCard(id, card, actor)`、`transitionIdentity(id, input, actor)`、`getCardView(id)`。

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _useStoreDirForTests, getCardView, registerIdentity, transitionIdentity, updateResponsibilityCard } from '../agent-identity'
import { _usePeopleStoreForTests, activatePerson, upsertPerson } from '../people'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ident-card-')); _useStoreDirForTests(dir); _usePeopleStoreForTests(dir)
  const p = upsertPerson({ name: 'alice', emails: ['a@x'], source: 'git' }, 't')
  if (p.ok) activatePerson(p.person.id, 't')
})
afterEach(() => { _useStoreDirForTests(null); _usePeopleStoreForTests(null); rmSync(dir, { recursive: true, force: true }) })

describe('identity card + lifecycle', () => {
  it('已有身份无卡时缺口可见且按 registered', () => {
    const r = registerIdentity({ name: 'worker', kind: 'agent', owner: 'team', toolAllowlist: [] }, 't')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const view = getCardView(r.identity.id)
    expect(view?.stage).toBe('registered')
    expect(view?.gaps.length).toBeGreaterThan(0)
  })
  it('保存卡后 owner 变更强制 changing', () => {
    // 先登记并补卡为准入/运行，再改 owner，断言 stage=changing（省略具体卡构造，见实现）
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run custom/server/agentidentity/__tests__/identity-card.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现（在 `agent-identity.ts` 内追加）**

```ts
import { listPeople } from './people'
import { cardGaps, validateCard, type ResponsibilityCard } from './responsibility'
import { canTransition, initialLifecycle, normalizeLifecycle, stageOf, type Lifecycle, type TransitionInput } from './lifecycle'

// 接口内新增：
// responsibilityCard?: ResponsibilityCard
// lifecycle?: Lifecycle

export function updateResponsibilityCard(
  id: string, card: ResponsibilityCard, actor: string,
): { ok: true; identity: AgentIdentity } | { ok: false; problems: string[] } {
  const people = listPeople()
  const problems = validateCard(card, people)
  if (problems.length) return { ok: false, problems }
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`身份不存在：${id}`] }
  const prevOwner = identity.responsibilityCard?.primaryOwner
  identity.responsibilityCard = card
  const lc = normalizeLifecycle(identity.lifecycle)
  if (prevOwner && prevOwner !== card.primaryOwner && lc.stage !== 'registered') {
    lc.history.push({ from: lc.stage, to: 'changing', at: Date.now(), by: card.primaryOwner, reason: 'owner-change', evidenceRefs: [] })
    lc.stage = 'changing'
  }
  identity.lifecycle = lc
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'update', targetId: id, detail: 'responsibility-card' })
  return { ok: true, identity: { ...identity } }
}

export function transitionIdentity(
  id: string, input: TransitionInput, actor: string,
): { ok: true; identity: AgentIdentity } | { ok: false; problems: string[] } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`身份不存在：${id}`] }
  const verdict = canTransition(identity, input, listPeople())
  if (!verdict.ok) return verdict
  const lc = normalizeLifecycle(identity.lifecycle)
  const from = lc.stage
  lc.history.push({ from, to: input.to, at: Date.now(), by: input.by, reason: input.reason.trim(), evidenceRefs: input.evidenceRefs ?? [] })
  lc.stage = input.to
  if (input.to === 'retired') lc.exit = { ...input.exit!, confirmedAt: Date.now() }
  identity.lifecycle = lc
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'update', targetId: id, detail: `lifecycle:${from}->${input.to}` })
  return { ok: true, identity: { ...identity } }
}

export function getCardView(id: string): { card: ResponsibilityCard | null; lifecycle: Lifecycle; stage: string; gaps: ReturnType<typeof cardGaps> } | null {
  const identity = getIdentity(id)
  if (!identity) return null
  const people = listPeople()
  const lc = normalizeLifecycle(identity.lifecycle)
  return {
    card: identity.responsibilityCard ?? null,
    lifecycle: lc,
    stage: stageOf(identity),
    gaps: cardGaps(identity.responsibilityCard, people, { forAdmission: lc.stage === 'registered' }),
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run custom/server/agentidentity/__tests__/identity-card.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add custom/server/agentidentity/agent-identity.ts custom/server/agentidentity/__tests__/identity-card.test.ts
git commit -m "feat(agentidentity): 身份册接入责任卡与五阶段生命周期"
```

---

### Task 6: HTTP 路由

**Files:**
- Modify: `custom/server/governance/governance-controller.ts`（在 agent-identity 路由段后追加）
- Test: `custom/server/governance/__tests__/workunit-routes.test.ts`

**Interfaces:**
- Consumes: Task 1–5 的域函数。
- Produces: 8 个端点（见 spec §5），全部用 `ok/fail/bodyOf`。

- [ ] **Step 1: 写失败测试**（起最小 Koa app 挂 `governanceRoutes`，mock `superAdminDenied` 通过；断言 200/400/404 与 `ok` 字段）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（每个写端点先 `superAdminDenied(ctx)`；`bodyOf` 取参；域函数返回 `ok:false` → `fail(ctx, 400, '…', { problems })`；读端点用 `ok`）
- [ ] **Step 4: 运行确认通过**
- [ ] **Step 5: 提交**

---

### Task 7: 六问报表

**Files:**
- Create: `custom/server/autonomygov/six-questions.ts`
- Modify: `custom/server/autonomygov/controller.ts`（挂 `GET /six-questions`）
- Test: `custom/server/autonomygov/__tests__/six-questions.test.ts`

**Interfaces:**
- Produces: `sixQuestions(deps)`、`SixQuestionAnswer`。

判定口径（实现必须逐条照做）：
1. 责任链：`decisions` 中 `decidedBy` 与 `stage` 均非空的比例；总数 0 → `unknown`。
2. 无主单元：`identities` 中 `primaryOwner` 在 active 名单且卡无缺口；无身份 → `unknown`。
3. 调用量 vs 资源：本轮固定 `unknown`，`gap: '净贡献基线未建立（本轮非目标）'`。
4. 连续稳定：`listRuns()` 中存在 `judgeMeta.outputStability.rounds >= 2` → `yes` 并给 checked/flips；无此类运行 → `unknown`。
5. 同口径基准：本轮固定 `unknown`，`gap: '跨轮基线未接入六问（本轮非目标）'`。
6. 署名记录：`judgments.length === 0` → `no`；全部 `signedBy` 为 active → `yes`。

- [ ] **Step 1: 写失败测试**（deps 注入空/有数据两态，断言 unknown 带 gap、不出现排序字段）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（纯函数 + 可选 deps；控制器注入真实域函数）
- [ ] **Step 4: 运行确认通过**
- [ ] **Step 5: 提交**

---

### Task 8: 客户端台账与署名记录

**Files:**
- Create: `custom/client/governance/components/WorkUnitLedgerSection.vue`
- Create: `custom/client/governance/components/JudgmentRecordsSection.vue`
- Modify: `custom/client/ia2/views/gov/GovRegistryRulesView.vue`
- Modify: `custom/client/governance/i18n.ts`
- Test: `custom/client/governance/__tests__/workunit-sections.test.ts`

**Interfaces:** 读 `/api/governance/agent-identity`、`/api/governance/people`；写 card/transition/judgments。

- [ ] **Step 1: 写失败测试**（mount 组件，mock fetch 两态：有缺口/无缺口；断言缺口文案与阶段徽标）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（台账表列：名称/阶段/主责任人/复核人/缺口；卡编辑抽屉；迁移按钮；署名表单 kind/subjectRef/rationale）
- [ ] **Step 4: 运行确认通过**
- [ ] **Step 5: 提交**

---

### Task 9: 客户端六问面板

**Files:**
- Create: `custom/client/governance/components/SixQuestionsSection.vue`
- Modify: `custom/client/ia2/views/gov/GovHarnessView.vue`
- Modify: `custom/client/governance/i18n.ts`
- Test: 并入 Task 8 的测试文件

- [ ] **Step 1–5:** 同 Task 8 节奏；六问卡片显示 answer 徽标（yes/no/unknown）、evidence、gap；`unknown` 必须有 gap 文案，无 gap 时显示「口径缺口未说明」并标红。

---

### Task 10: 种子脚本

**Files:**
- Create: `scripts/maintenance/hrgov-seed.mjs`
- Test: `scripts/__tests__/hrgov-seed.test.ts`

**Interfaces:** `--dry-run`、`--store <dir>`；读 `team/profiles/*/profile.yaml`、`team/shared/owner-registry.yaml`、`git log`；写 `people.json` 与身份册草稿。

- [ ] **Step 1: 写失败测试**（临时 store + 临时 profiles 夹具：首次生成候选与草案；二次运行零变更；已存在身份不被覆盖）
- [ ] **Step 2–5:** 实现/验证/提交。

---

### Task 11: qgate 门

**Files:**
- Create: `.qgate/gates/hrgov.workunit-contract.yaml`
- Modify: `.qgate/qgate.yaml`（若需登记门）
- Test: `custom/__tests__/qgate-hrgov-gate.test.ts`（存在性+关键 marker 断言）

门内容：`files` executor 要求 `responsibility.ts`/`lifecycle.ts`/`judgments.ts` 与对应测试在位；`mustContain` 在 spec 中要求「批准前六问」「署名与遥测」「六问」marker。

---

### Task 12: 推演方案与程序同步

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`
- Create: `simharness/mux/mx-workunit-lib.sh`
- Modify: `simharness/aipay-scenario.sh`
- Modify: `simharness/mux/mx-prelaunch-check.sh`
- Modify: `simharness/mux/mx-report-gen.py`
- Modify: `simharness/mux/mx-report-audit.py`

**游标（用锚文本定位，不写死行号）：**
- 方案：在 §2.9 后新增 §2.10「执行单元责任台账」，写清 G1/G2/G5/报告四处的产出点与六问判据。
- 程序库：`workunit_ensure_unit`、`workunit_record`、`workunit_six_snapshot` 三个函数；JWT 取 `load_token` 同款；失败只记问题单不中止（fail-soft）。
- 场景：G1 冻结后记 `acceptance`；G2 过闸后按是否有打回记 `acceptance`/`rejection`；G5 记 `override` 或 `escalation`（有 HumanGate 改判时）；报告前取六问快照。
- 开跑检查：新增 ㉝，检查域文件、路由、spec marker、场景接线四处在位。
- 报告：新增「执行单元与署名记录」节，读 run 目录 `workunit-six-questions.json`；缺失渲染「未采集」。
- 审计：新增查 17，断言报告节与 JSON 计数一致；缺失即 FAIL（不许空渲染）。

---

### Task 13: 设计正本同步与全量验证

**Files:**
- Modify: `docs/DESIGN.md`（按实现事实复核 §4.4/§4.6 措辞）
- Modify: `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`（如需计数）
- Regenerate: `docs/manuals/aistudio-design-document-index.md`

验证清单：
- `npx vitest run custom/server/agentidentity/__tests__/ custom/server/autonomygov/__tests__/six-questions.test.ts custom/server/governance/__tests__/workunit-routes.test.ts custom/client/governance/__tests__/workunit-sections.test.ts scripts/__tests__/hrgov-seed.test.ts`
- `npm run typecheck:harness`
- `npm test`（合并前全量）
- 浏览器实物走查：台账/卡/迁移/署名/六问五处可见
- 试点：`aipaydev-bella`、`aipaydev-fanfan` 两个既有身份补卡并走 registered→admitted→running，产生 ≥3 条署名记录
- `node scripts/merge-invariants.mjs --check`

## 自审记录

- 覆盖检查：spec §1–§10 均有对应任务；§7 试点在 Task 13；§10 三项同步在 Task 12 与 Task 13。
- 类型一致性：`Stage`、`ResponsibilityCard`、`JudgmentKind` 在 Task 2–6 同名复用。
- 未决：`scripts/maintenance/hrgov-seed.mjs` 的 YAML 解析只用最小行解析（`description:` 与 `owns:` 行），不引入新依赖。
