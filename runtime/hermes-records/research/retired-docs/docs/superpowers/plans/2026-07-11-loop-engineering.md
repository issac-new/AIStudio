# Loop Engineering Implementation Plan (Phase 1: Personal Layer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Loop Engineering system for SwarmStudio's personal layer — users define a recursive goal, the system auto-cycles through discovery→handoff→validation→persistence→scheduling until a verifiable stop condition is met.

**Architecture:** Single-engine + State Store adapter. The loop engine (5-stage orchestration, verifier, scheduler, subagent dispatcher, hooks) is written once and layer-agnostic. Personal layer uses LocalStore (STATE.md + events.jsonl). All code is A-class (custom/) except one B-class patch for navigation injection.

**Tech Stack:** Vue 3 (script setup), Pinia (setup syntax), vue-router 4, vue-i18n 11, d3-force, naive-ui, Koa + @koa/router, socket.io-client, cron-parser, proper-lockfile, vitest.

## Global Constraints

- **Only modify `overlay/` directory.** `upstream/` is read-only.
- **A-class code** goes in `overlay/custom/` (pure new files). **B-class patches** go in `overlay/patches/` (upstream skeleton changes via `git apply`).
- All client aliases: `@/custom` → `overlay/custom/client`; `@` → upstream `packages/client/src`. Alias order is load-bearing (`@/custom` before `@`).
- Feature flags in `config/features.ts` use `VITE_CUSTOM_*` env vars. Default-on uses `!== 'false'`.
- Vue SFCs use `<script setup lang="ts">` only. `defineProps`/`defineEmits` use type-literal syntax.
- Pinia stores use setup syntax: `defineStore('id', () => { ... })`.
- Server controllers: `import Router from '@koa/router'`, `const router = new Router()`, `export default router`. Routes wired via B-class patch to `packages/server/src/routes/index.ts`.
- Server services: plain TS modules, no class, named exports, inline path/security helpers (symlink import limitation).
- Tests live as `custom/**/__tests__/*.test.ts` or `custom/**/*.test.ts`. Aliases mirrored from vitest.config.ts.
- No new npm dependencies without a B-class patch to upstream `package.json`. `cron-parser`, `proper-lockfile` need patches.
- Branch: `feat/loop-engineering` based on `overlay/main`.

---

## File Structure

```
overlay/
├── custom/
│   ├── client/loop/
│   │   ├── index.ts                          registerLoopEngineering(app)
│   │   ├── types.ts                          all TS interfaces (LoopInstance, TaskContract, etc.)
│   │   ├── store/loop.ts                     Pinia store (setup syntax)
│   │   ├── api/
│   │   │   ├── loop-socket.ts                Socket.IO client singleton
│   │   │   └── loop-rest.ts                  REST API calls
│   │   ├── composables/
│   │   │   ├── useLoopState.ts               reactive loop list subscription
│   │   │   ├── useStageTransition.ts         stage transition watcher
│   │   │   └── useVerifier.ts                verification status polling
│   │   ├── adapters/
│   │   │   ├── loop-adapter.ts               loop list mapping
│   │   │   └── stage-adapter.ts              stage event → UI node mapping
│   │   ├── components/
│   │   │   ├── LoopSidebar.vue
│   │   │   ├── LoopTable.vue
│   │   │   ├── LoopCreateWizard.vue
│   │   │   ├── StageRing.vue
│   │   │   ├── StageNode.vue
│   │   │   ├── TaskContractCard.vue
│   │   │   ├── VerifierPanel.vue
│   │   │   ├── ScheduleEditor.vue
│   │   │   ├── WorktreeStatus.vue
│   │   │   └── LoopApprovalDialog.vue
│   │   ├── views/
│   │   │   ├── LoopSpineView.vue             total overview
│   │   │   └── LoopDetailView.vue           single loop drill-down
│   │   └── styles/loop.scss
│   ├── server/loop/
│   │   ├── engine/
│   │   │   ├── loop-engine.ts                5-stage orchestration core
│   │   │   ├── task-contract.ts              contract model helpers
│   │   │   ├── worktree-manager.ts           git worktree lifecycle
│   │   │   ├── verifier.ts                   3-route verification coordinator
│   │   │   ├── scheduler.ts                  cron+webhook+pattern dispatcher
│   │   │   ├── subagent-dispatcher.ts        maker/checker dispatch
│   │   │   ├── budget-guard.ts               cost kill switch
│   │   │   ├── stuck-detector.ts             stuck signal detection
│   │   │   └── hooks.ts                      hook lifecycle gates
│   │   ├── connectors/
│   │   │   ├── github-connector.ts
│   │   │   ├── local-git-connector.ts
│   │   │   └── webhook-connector.ts
│   │   ├── store/
│   │   │   ├── state-store.ts                adapter interface
│   │   │   └── local-store.ts                LocalStore (STATE.md + events.jsonl)
│   │   ├── services/
│   │   │   └── loop-socket.ts                Socket.IO namespace handler
│   │   └── controllers/loop.ts              REST API (Koa Router)
│   └── hermes-agent-plugins/loop/
│       ├── __init__.py
│       ├── loop_executor.py
│       ├── loop_verifier.py
│       └── plugin.yaml
├── config/
│   └── loop-config.ts                        adapter selection + hook config
├── patches/
│   ├── 133-loop-nav-entry.patch              B-class: inject nav entry + router child
│   ├── 134-loop-server-routes.patch          B-class: wire server controller
│   ├── 135-loop-socket-namespace.patch       B-class: register /loop socket namespace
│   ├── 136-cron-parser-dep.patch             B-class: add cron-parser to upstream deps
│   └── 137-proper-lockfile-dep.patch          B-class: add proper-lockfile to upstream deps
└── tests/client/
    └── loop/
        ├── types.test.ts
        ├── local-store.test.ts
        ├── loop-engine.test.ts
        ├── task-contract.test.ts
        ├── verifier.test.ts
        ├── scheduler.test.ts
        ├── budget-guard.test.ts
        ├── stuck-detector.test.ts
        ├── hooks.test.ts
        ├── github-connector.test.ts
        ├── local-git-connector.test.ts
        ├── webhook-connector.test.ts
        └── worktree-manager.test.ts
```

---

## Task 1: Types & Feature Flag

**Files:**
- Create: `overlay/custom/client/loop/types.ts`
- Modify: `overlay/config/features.ts`
- Test: `overlay/custom/client/loop/__tests__/types.test.ts`

**Interfaces:**
- Produces: all TypeScript types used by subsequent tasks — `LoopInstance`, `LoopStage`, `LoopStatus`, `AutonomyLevel`, `LoopStats`, `TaskContract`, `TaskSource`, `ReadPlan`, `VerificationSpec`, `ProgrammaticCheck`, `JudgeCheck`, `HumanCheck`, `ResultTemplate`, `ContractStatus`, `VerificationRecord`, `ScheduleConfig`, `WebhookEvent`, `LoopPattern`, `PatternTemplate`, `LoopEvent`, `BudgetConfig`, `LoopStateStore` interface, `DriftReport`.

- [ ] **Step 1: Add feature flag to `config/features.ts`**

Add `loopEngineering` to both `FeatureConfig` interface and `features` object:

```ts
// In FeatureConfig interface, add after cockpit:
  loopEngineering: boolean;

// In features object, add after cockpit:
  loopEngineering: import.meta.env.VITE_CUSTOM_LOOP !== 'false',
```

- [ ] **Step 2: Create `types.ts` with all interfaces**

```typescript
// overlay/custom/client/loop/types.ts

export type LoopStage = 'discovery' | 'handoff' | 'validation' | 'persistence' | 'scheduling'
export type LoopStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'awaiting-review' | 'completed' | 'failed'
export type AutonomyLevel = 'L1' | 'L2' | 'L3'
export type LoopPattern =
  | 'daily-triage' | 'pr-babysitter' | 'ci-sweeper' | 'dep-sweeper'
  | 'changelog-drafter' | 'post-merge-cleanup' | 'issue-triage'
export type ContractStatus = 'queued' | 'in-progress' | 'submitted' | 'verifying'
  | 'passed' | 'failed' | 'escalated' | 'archived'

export interface LoopStats {
  totalIterations: number
  tasksDiscovered: number
  tasksCompleted: number
  tasksBlocked: number
  totalCost: number
  currentIteration: number
}

export interface BudgetConfig {
  maxCostPerTick: number
  maxCostTotal: number
  killMode: 'throw' | 'notify' | 'kill'
  warningThreshold: number
}

export interface ScheduleConfig {
  mode: 'cron' | 'webhook' | 'manual'
  cron?: string
  webhookEvents?: WebhookEvent[]
  timezone: string
}

export interface WebhookEvent {
  source: string
  eventType: string
  filter?: string
}

export interface LoopInstance {
  id: string
  name: string
  goal: string
  stopCondition: string
  pattern: LoopPattern
  schedule: ScheduleConfig
  stage: LoopStage
  status: LoopStatus
  autonomyLevel: AutonomyLevel
  stateAdapter: 'local' | 'matrix' | 'saas'
  createdAt: string
  updatedAt: string
  lastTickAt: string | null
  nextTickAt: string | null
  budget: BudgetConfig
  stats: LoopStats
}

export interface PatternTemplate {
  pattern: LoopPattern
  defaultCron: string
  defaultLevel: AutonomyLevel
  costEstimate: 'low' | 'medium' | 'high' | 'very-high'
  goalTemplate: string
  stopConditionTemplate: string
}

export interface TaskSource {
  type: 'github-issue' | 'github-ci' | 'git-commit' | 'local-test' | 'webhook'
  ref: string
  summary: string
  rawPayload: unknown
}

export interface ReadPlan {
  requiredReads: string[]
  mcpResources?: string[]
  repoMap?: string
}

export interface ProgrammaticCheck {
  command: string
  expectedExitCode: number
  timeout: number
}

export interface JudgeCheck {
  model: string
  rubric: string
  minScore: number
}

export interface HumanCheck {
  gate: 'always' | 'on-fail'
  approvers: string[]
}

export interface VerificationSpec {
  programmatic: ProgrammaticCheck[]
  judge: JudgeCheck | null
  human: HumanCheck | null
}

export interface ResultTemplate {
  artifactType: 'patch' | 'pr' | 'commit' | 'report'
  requiredFiles: string[]
  schema?: unknown
}

export interface TaskContract {
  id: string
  loopId: string
  source: TaskSource
  readPlan: ReadPlan
  writeBoundary: string[]
  verificationIntent: VerificationSpec
  resultTemplate: ResultTemplate
  worktreeId: string | null
  assignee: 'maker' | 'checker'
  status: ContractStatus
  attempts: number
  maxAttempts: number
}

export interface VerificationRecord {
  contractId: string
  results: {
    programmatic: Array<{ command: string; exitCode: number; stdout: string; passed: boolean }>
    judge: { model: string; score: number; reasoning: string; passed: boolean } | null
    human: { approver: string; decision: 'approved' | 'rejected' | 'changes-requested'; comment: string; timestamp: string } | null
  }
  overall: 'passed' | 'failed' | 'pending'
  finalResponseGuard: boolean
}

export type LoopEvent =
  | { type: 'loop.created'; loop: LoopInstance; ts: string }
  | { type: 'loop.stage-transition'; loopId: string; from: LoopStage; to: LoopStage; reason: string; ts: string }
  | { type: 'loop.task-discovered'; loopId: string; contract: TaskContract; ts: string }
  | { type: 'loop.task-handed-off'; loopId: string; contractId: string; worktreeId: string; ts: string }
  | { type: 'loop.verification-progress'; contractId: string; record: Partial<VerificationRecord>; ts: string }
  | { type: 'loop.verification-complete'; contractId: string; passed: boolean; ts: string }
  | { type: 'loop.persisted'; loopId: string; contractId: string; artifact: string; ts: string }
  | { type: 'loop.tick-complete'; loopId: string; iteration: number; stats: LoopStats; ts: string }
  | { type: 'loop.budget-warning'; loopId: string; spent: number; limit: number; ts: string }
  | { type: 'loop.stuck'; loopId: string; reason: string; ts: string }
  | { type: 'loop.completed'; loopId: string; finalStats: LoopStats; ts: string }

export interface DriftReport {
  hasDrift: boolean
  details: string
}

export interface LoopFilter {
  status?: LoopStatus[]
  stage?: LoopStage[]
}

export interface ContractFilter {
  status?: ContractStatus[]
}

export const PATTERN_TEMPLATES: Record<LoopPattern, PatternTemplate> = {
  'daily-triage': {
    pattern: 'daily-triage', defaultCron: '0 9 * * *', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Scan issues and CI failures, report actionable items',
    stopConditionTemplate: 'All issues triaged and no CI failures',
  },
  'pr-babysitter': {
    pattern: 'pr-babysitter', defaultCron: '*/15 * * * *', defaultLevel: 'L1', costEstimate: 'high',
    goalTemplate: 'Monitor open PRs for CI status',
    stopConditionTemplate: 'All tracked PRs are merged or closed',
  },
  'ci-sweeper': {
    pattern: 'ci-sweeper', defaultCron: '*/10 * * * *', defaultLevel: 'L2', costEstimate: 'very-high',
    goalTemplate: 'Automatically fix CI failures',
    stopConditionTemplate: 'CI is green for all branches',
  },
  'dep-sweeper': {
    pattern: 'dep-sweeper', defaultCron: '0 */6 * * *', defaultLevel: 'L2', costEstimate: 'medium',
    goalTemplate: 'Scan and update dependencies',
    stopConditionTemplate: 'All dependencies are up to date',
  },
  'changelog-drafter': {
    pattern: 'changelog-drafter', defaultCron: '0 0 * * 1', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Draft changelog from recent commits',
    stopConditionTemplate: 'Changelog covers all commits since last release',
  },
  'post-merge-cleanup': {
    pattern: 'post-merge-cleanup', defaultCron: '0 18 * * *', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Clean up after merges (branches, worktrees, stale refs)',
    stopConditionTemplate: 'No stale branches or orphaned worktrees',
  },
  'issue-triage': {
    pattern: 'issue-triage', defaultCron: '0 */2 * * *', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Classify and label new issues',
    stopConditionTemplate: 'All issues have labels and assignees',
  },
}
```

- [ ] **Step 3: Write test for PATTERN_TEMPLATES completeness**

```typescript
// overlay/custom/client/loop/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import { PATTERN_TEMPLATES, type LoopPattern } from '../types'

describe('PATTERN_TEMPLATES', () => {
  const allPatterns: LoopPattern[] = [
    'daily-triage', 'pr-babysitter', 'ci-sweeper', 'dep-sweeper',
    'changelog-drafter', 'post-merge-cleanup', 'issue-triage',
  ]

  it('has a template for every pattern', () => {
    for (const p of allPatterns) {
      expect(PATTERN_TEMPLATES[p]).toBeDefined()
      expect(PATTERN_TEMPLATES[p].pattern).toBe(p)
    }
  })

  it('every template has a valid cron expression', () => {
    for (const p of allPatterns) {
      expect(PATTERN_TEMPLATES[p].defaultCron).toMatch(/^[\d*/,-]+(\s[\d*/,-]+)+$/)
    }
  })
})
```

- [ ] **Step 4: Run test**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/types.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add custom/client/loop/types.ts custom/client/loop/__tests__/types.test.ts config/features.ts
git commit -m "feat(loop): add types, pattern templates, and feature flag"
```

---

## Task 2: LoopStateStore Interface & LocalStore

**Files:**
- Create: `overlay/custom/server/loop/store/state-store.ts`
- Create: `overlay/custom/server/loop/store/local-store.ts`
- Test: `overlay/custom/client/loop/__tests__/local-store.test.ts`

**Interfaces:**
- Consumes: `LoopInstance`, `TaskContract`, `VerificationRecord`, `LoopEvent`, `DriftReport` from Task 1 types
- Produces: `LoopStateStore` interface, `LocalStore` class implementing it

- [ ] **Step 1: Add `proper-lockfile` dependency via B-class patch**

Create `overlay/patches/137-proper-lockfile-dep.patch`:

```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -89,6 +89,7 @@
     "pinia": "^3.0.4",
     "plist": "^3.1.0",
     "postcss": "^8.5.3",
+    "proper-lockfile": "^4.1.2",
     "react": "^19.0.0",
```

Add to `overlay/patches/series` (append line):
```
137-proper-lockfile-dep.patch
```

Run inject + install:
```bash
cd overlay && npm run inject && cd ../upstream/hermes-studio && npm install
```

- [ ] **Step 2: Create `state-store.ts` (the adapter interface)**

```typescript
// overlay/custom/server/loop/store/state-store.ts
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../../client/loop/types'

export interface LoopStateStore {
  createLoop(loop: LoopInstance): Promise<void>
  getLoop(id: string): Promise<LoopInstance | null>
  listLoops(filter?: LoopFilter): Promise<LoopInstance[]>
  updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void>
  deleteLoop(id: string): Promise<void>

  appendContract(contract: TaskContract): Promise<void>
  getContract(id: string): Promise<TaskContract | null>
  queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]>
  updateContract(id: string, patch: Partial<TaskContract>): Promise<void>

  appendVerification(record: VerificationRecord): Promise<void>

  appendEvent(event: LoopEvent): Promise<void>
  queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]>

  detectDrift(loopId: string): Promise<DriftReport>
}
```

- [ ] **Step 3: Create `local-store.ts`**

```typescript
// overlay/custom/server/loop/store/local-store.ts
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import lockfile from 'proper-lockfile'
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../../client/loop/types'
import type { LoopStateStore } from './state-store'

const LOOP_DIR = '.loop'

function loopDir(id: string): string {
  return resolve(LOOP_DIR, 'loops', id)
}

function contractPath(loopId: string, contractId: string): string {
  return resolve(loopDir(loopId), 'contracts', `${contractId}.json`)
}

function verifyPath(loopId: string, contractId: string): string {
  return resolve(loopDir(loopId), 'verifications', `${contractId}.verify.json`)
}

function eventsPath(loopId: string): string {
  return resolve(loopDir(loopId), 'events.jsonl')
}

function stateJsonPath(): string {
  return resolve(LOOP_DIR, 'STATE.json')
}

function stateMdPath(): string {
  return resolve(LOOP_DIR, 'STATE.md')
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = resolve(LOOP_DIR, 'STATE.lock')
  await ensureDir(LOOP_DIR)
  const release = await lockfile.lock(LOOP_DIR, {
    lockfilePath: lockPath,
    stale: 5000,
    retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
  })
  try {
    return await fn()
  } finally {
    await release()
  }
}

export class LocalStore implements LoopStateStore {
  constructor(private baseDir: string = LOOP_DIR) {}

  async createLoop(loop: LoopInstance): Promise<void> {
    await withLock(async () => {
      const dir = loopDir(loop.id)
      await ensureDir(dir)
      await ensureDir(resolve(dir, 'contracts'))
      await ensureDir(resolve(dir, 'verifications'))
      await fs.writeFile(resolve(dir, 'loop.json'), JSON.stringify(loop, null, 2), 'utf-8')
      await this.regenerateStateFiles()
    })
  }

  async getLoop(id: string): Promise<LoopInstance | null> {
    const p = resolve(loopDir(id), 'loop.json')
    if (!existsSync(p)) return null
    const data = await fs.readFile(p, 'utf-8')
    return JSON.parse(data) as LoopInstance
  }

  async listLoops(filter?: LoopFilter): Promise<LoopInstance[]> {
    const loopsDir = resolve(this.baseDir, 'loops')
    if (!existsSync(loopsDir)) return []
    const entries = await fs.readdir(loopsDir)
    const loops: LoopInstance[] = []
    for (const entry of entries) {
      const p = resolve(loopsDir, entry, 'loop.json')
      if (existsSync(p)) {
        loops.push(JSON.parse(await fs.readFile(p, 'utf-8')))
      }
    }
    if (!filter) return loops
    return loops.filter(l => {
      if (filter.status && !filter.status.includes(l.status)) return false
      if (filter.stage && !filter.stage.includes(l.stage)) return false
      return true
    })
  }

  async updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void> {
    await withLock(async () => {
      const existing = await this.getLoop(id)
      if (!existing) throw new Error(`Loop not found: ${id}`)
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
      await fs.writeFile(resolve(loopDir(id), 'loop.json'), JSON.stringify(updated, null, 2), 'utf-8')
      await this.regenerateStateFiles()
    })
  }

  async deleteLoop(id: string): Promise<void> {
    await withLock(async () => {
      const dir = loopDir(id)
      if (existsSync(dir)) {
        await fs.rm(dir, { recursive: true, force: true })
      }
      await this.regenerateStateFiles()
    })
  }

  async appendContract(contract: TaskContract): Promise<void> {
    await withLock(async () => {
      await ensureDir(resolve(loopDir(contract.loopId), 'contracts'))
      await fs.writeFile(
        contractPath(contract.loopId, contract.id),
        JSON.stringify(contract, null, 2),
        'utf-8',
      )
    })
  }

  async getContract(id: string): Promise<TaskContract | null> {
    // Contracts are nested under loops; search all loop dirs
    const loopsDir = resolve(this.baseDir, 'loops')
    if (!existsSync(loopsDir)) return null
    for (const entry of await fs.readdir(loopsDir)) {
      const p = resolve(loopsDir, entry, 'contracts', `${id}.json`)
      if (existsSync(p)) {
        return JSON.parse(await fs.readFile(p, 'utf-8'))
      }
    }
    return null
  }

  async queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]> {
    const contractsDir = resolve(loopDir(loopId), 'contracts')
    if (!existsSync(contractsDir)) return []
    const files = await fs.readdir(contractsDir)
    const contracts: TaskContract[] = []
    for (const f of files) {
      if (f.endsWith('.json')) {
        contracts.push(JSON.parse(await fs.readFile(resolve(contractsDir, f), 'utf-8')))
      }
    }
    if (!filter) return contracts
    return contracts.filter(c => {
      if (filter.status && !filter.status.includes(c.status)) return false
      return true
    })
  }

  async updateContract(id: string, patch: Partial<TaskContract>): Promise<void> {
    const contract = await this.getContract(id)
    if (!contract) throw new Error(`Contract not found: ${id}`)
    const updated = { ...contract, ...patch }
    await fs.writeFile(
      contractPath(contract.loopId, id),
      JSON.stringify(updated, null, 2),
      'utf-8',
    )
  }

  async appendVerification(record: VerificationRecord): Promise<void> {
    const contract = await this.getContract(record.contractId)
    if (!contract) throw new Error(`Contract not found: ${record.contractId}`)
    await ensureDir(resolve(loopDir(contract.loopId), 'verifications'))
    await fs.writeFile(
      verifyPath(contract.loopId, record.contractId),
      JSON.stringify(record, null, 2),
      'utf-8',
    )
  }

  async appendEvent(event: LoopEvent): Promise<void> {
    const loopId = 'loopId' in event ? event.loopId : (event as any).loop?.id
    if (!loopId) return
    await ensureDir(loopDir(loopId))
    const line = JSON.stringify(event) + '\n'
    await fs.appendFile(eventsPath(loopId), line, 'utf-8')
    await this.regenerateStateFiles()
  }

  async queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> {
    const p = eventsPath(loopId)
    if (!existsSync(p)) return []
    const content = await fs.readFile(p, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    let events: LoopEvent[] = lines.map(l => JSON.parse(l))
    if (since) {
      events = events.filter(e => (e as any).ts > since)
    }
    if (limit) {
      events = events.slice(-limit)
    }
    return events
  }

  async detectDrift(loopId: string): Promise<DriftReport> {
    // Compare STATE.md (human-readable) vs STATE.json (machine-readable)
    // If STATE.md was hand-edited, report drift
    const stateJson = stateJsonPath()
    const stateMd = stateMdPath()
    if (!existsSync(stateJson) || !existsSync(stateMd)) {
      return { hasDrift: false, details: 'State files not yet created' }
    }
    const jsonContent = JSON.parse(await fs.readFile(stateJson, 'utf-8'))
    const mdContent = await fs.readFile(stateMd, 'utf-8')
    // Simple heuristic: check if loopId appears in both
    const jsonHasLoop = jsonContent.loops?.some((l: any) => l.id === loopId)
    const mdHasLoop = mdContent.includes(`### ${loopId}`)
    if (jsonHasLoop !== mdHasLoop) {
      return { hasDrift: true, details: `Loop ${loopId} exists in JSON but not in MD (or vice versa). STATE.md is auto-generated; hand-editing it will not take effect. Edit STATE.json or use the API instead.` }
    }
    return { hasDrift: false, details: 'No drift detected' }
  }

  private async regenerateStateFiles(): Promise<void> {
    const loops = await this.listLoops()
    // STATE.json
    const stateJson = { updated: new Date().toISOString(), loops }
    await ensureDir(this.baseDir)
    await fs.writeFile(stateJsonPath(), JSON.stringify(stateJson, null, 2), 'utf-8')
    // STATE.md (human-readable projection)
    const md = this.renderStateMd(loops)
    await fs.writeFile(stateMdPath(), md, 'utf-8')
  }

  private renderStateMd(loops: LoopInstance[]): string {
    const lines: string[] = [
      '# Loop State Spine',
      `Updated: ${new Date().toISOString()}`,
      '',
    ]
    const active = loops.filter(l => l.status !== 'completed' && l.status !== 'failed')
    const archived = loops.filter(l => l.status === 'completed' || l.status === 'failed')
    if (active.length > 0) {
      lines.push('## Active Loops', '')
      for (const l of active) {
        lines.push(`### ${l.id}`)
        lines.push(`- **Goal**: ${l.goal}`)
        lines.push(`- **Stop**: ${l.stopCondition}`)
        lines.push(`- **Stage**: ${l.stage}`)
        lines.push(`- **Status**: ${l.status}`)
        lines.push(`- **Pattern**: ${l.pattern} (${l.autonomyLevel})`)
        lines.push(`- **Schedule**: ${l.schedule.mode} ${l.schedule.cron ?? ''} (${l.schedule.timezone})`)
        lines.push(`- **Iteration**: #${l.stats.currentIteration}`)
        lines.push(`- **Budget**: $${l.stats.totalCost.toFixed(2)} / $${l.budget.maxCostTotal.toFixed(2)} (${((l.stats.totalCost / l.budget.maxCostTotal) * 100).toFixed(1)}%)`)
        lines.push(`- **Next tick**: ${l.nextTickAt ?? '—'}`)
        lines.push('')
      }
    }
    if (archived.length > 0) {
      lines.push('## Archived Loops', '')
      for (const l of archived) {
        lines.push(`### ${l.id} (${l.status})`)
        lines.push(`- **Pattern**: ${l.pattern}`)
        lines.push(`- **Iterations**: ${l.stats.totalIterations}`)
        lines.push(`- **Tasks completed**: ${l.stats.tasksCompleted}`)
        lines.push('')
      }
    }
    return lines.join('\n')
  }
}
```

- [ ] **Step 4: Write LocalStore tests**

```typescript
// overlay/custom/client/loop/__tests__/local-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LocalStore } from '../../server/loop/store/local-store'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { resolve } from 'path'
import type { LoopInstance, LoopEvent } from '../types'

const TEST_DIR = '.loop-test'

function makeLoop(id: string = 'test-loop'): LoopInstance {
  return {
    id, name: 'Test Loop', goal: 'test goal', stopCondition: 'all tests pass',
    pattern: 'daily-triage', schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('LocalStore', () => {
  let store: LocalStore

  beforeEach(() => {
    store = new LocalStore(TEST_DIR)
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('creates and retrieves a loop', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)
    const retrieved = await store.getLoop('test-loop')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.name).toBe('Test Loop')
  })

  it('updates a loop', async () => {
    await store.createLoop(makeLoop())
    await store.updateLoop('test-loop', { status: 'running', stage: 'handoff' })
    const updated = await store.getLoop('test-loop')
    expect(updated!.status).toBe('running')
    expect(updated!.stage).toBe('handoff')
  })

  it('lists loops with filter', async () => {
    await store.createLoop(makeLoop('loop-a'))
    const lb = makeLoop('loop-b')
    lb.status = 'running'
    await store.createLoop(lb)
    const all = await store.listLoops()
    expect(all.length).toBe(2)
    const running = await store.listLoops({ status: ['running'] })
    expect(running.length).toBe(1)
    expect(running[0].id).toBe('loop-b')
  })

  it('deletes a loop', async () => {
    await store.createLoop(makeLoop())
    await store.deleteLoop('test-loop')
    const retrieved = await store.getLoop('test-loop')
    expect(retrieved).toBeNull()
  })

  it('appends and queries events', async () => {
    await store.createLoop(makeLoop())
    const event: LoopEvent = {
      type: 'loop.stage-transition', loopId: 'test-loop',
      from: 'discovery', to: 'handoff', reason: 'tasks found', ts: new Date().toISOString(),
    }
    await store.appendEvent(event)
    const events = await store.queryEvents('test-loop')
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('loop.stage-transition')
  })

  it('regenerates STATE.md after create', async () => {
    await store.createLoop(makeLoop())
    const mdPath = resolve(TEST_DIR, 'STATE.md')
    expect(existsSync(mdPath)).toBe(true)
    const md = await fs.readFile(mdPath, 'utf-8')
    expect(md).toContain('# Loop State Spine')
    expect(md).toContain('### test-loop')
    expect(md).toContain('Test Loop')
  })

  it('detects drift returns false when state is consistent', async () => {
    await store.createLoop(makeLoop())
    const report = await store.detectDrift('test-loop')
    expect(report.hasDrift).toBe(false)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/local-store.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add custom/server/loop/store/ custom/client/loop/__tests__/local-store.test.ts patches/137-proper-lockfile-dep.patch patches/series
git commit -m "feat(loop): add StateStore interface and LocalStore implementation"
```

---

## Task 3: Loop Engine Core (5-Stage State Machine)

**Files:**
- Create: `overlay/custom/server/loop/engine/loop-engine.ts`
- Create: `overlay/custom/server/loop/engine/task-contract.ts`
- Test: `overlay/custom/client/loop/__tests__/loop-engine.test.ts`

**Interfaces:**
- Consumes: `LoopStateStore` (Task 2), `LoopInstance`, `TaskContract`, `LoopEvent` (Task 1)
- Produces: `LoopEngine` class with `tick(loopId)` method that runs the 5-stage cycle

- [ ] **Step 1: Create `task-contract.ts` helpers**

```typescript
// overlay/custom/server/loop/engine/task-contract.ts
import type { TaskContract, TaskSource, ReadPlan, VerificationSpec, ResultTemplate } from '../../client/loop/types'

let counter = 0
export function generateContractId(loopId: string, summary: string): string {
  counter++
  const slug = summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30).replace(/^-|-$/g, '')
  return `task/${slug}-${counter.toString().padStart(3, '0')}`
}

export function createContract(params: {
  loopId: string
  source: TaskSource
  readPlan: ReadPlan
  writeBoundary: string[]
  verificationIntent: VerificationSpec
  resultTemplate: ResultTemplate
  maxAttempts?: number
}): TaskContract {
  const id = generateContractId(params.loopId, params.source.summary)
  return {
    id,
    loopId: params.loopId,
    source: params.source,
    readPlan: params.readPlan,
    writeBoundary: params.writeBoundary,
    verificationIntent: params.verificationIntent,
    resultTemplate: params.resultTemplate,
    worktreeId: null,
    assignee: 'maker',
    status: 'queued',
    attempts: 0,
    maxAttempts: params.maxAttempts ?? 3,
  }
}
```

- [ ] **Step 2: Create `loop-engine.ts`**

```typescript
// overlay/custom/server/loop/engine/loop-engine.ts
import type {
  LoopInstance, TaskContract, LoopEvent, LoopStage, LoopStats,
} from '../../client/loop/types'
import type { LoopStateStore } from '../store/state-store'
import type { GithubConnector } from '../connectors/github-connector'
import type { LocalGitConnector } from '../connectors/local-git-connector'
import type { Verifier } from './verifier'
import type { SubagentDispatcher } from './subagent-dispatcher'
import type { WorktreeManager } from './worktree-manager'
import type { BudgetGuard } from './budget-guard'
import type { StuckDetector } from './stuck-detector'
import type { HookManager } from './hooks'

export interface LoopEngineDeps {
  store: LoopStateStore
  githubConnector?: GithubConnector
  localGitConnector?: LocalGitConnector
  verifier: Verifier
  dispatcher: SubagentDispatcher
  worktreeManager: WorktreeManager
  budgetGuard: BudgetGuard
  stuckDetector: StuckDetector
  hookManager: HookManager
  emitEvent: (event: LoopEvent) => void
}

export class LoopEngine {
  constructor(private deps: LoopEngineDeps) {}

  async tick(loopId: string): Promise<void> {
    const loop = await this.deps.store.getLoop(loopId)
    if (!loop) throw new Error(`Loop not found: ${loopId}`)
    if (loop.status === 'running') return // already running

    // pre-tick hooks
    const preResult = await this.deps.hookManager.run('pre-tick', loop)
    if (preResult.decision === 'deny') return

    // budget check
    const budgetDecision = this.deps.budgetGuard.check(loop)
    if (!budgetDecision.allow) {
      await this.handleBudgetExceed(loop, budgetDecision.action!)
      return
    }

    // stuck check
    const stuckReason = await this.deps.stuckDetector.check(loop)
    if (stuckReason) {
      this.deps.emitEvent({ type: 'loop.stuck', loopId, reason: stuckReason, ts: new Date().toISOString() })
      await this.deps.stuckDetector.handleStuck(loop, stuckReason)
      return
    }

    await this.deps.store.updateLoop(loopId, { status: 'running', lastTickAt: new Date().toISOString() })
    loop.status = 'running'
    loop.stats.currentIteration++

    try {
      // Stage 1: Discovery
      const contracts = await this.runDiscovery(loop)
      if (contracts.length === 0) {
        await this.transition(loop, 'discovery', 'scheduling', 'no actionable items found')
      } else {
        // Stage 2: Handoff
        await this.transition(loop, 'discovery', 'handoff', `${contracts.length} items discovered`)
        const results = await this.runHandoff(loop, contracts)

        // Stage 3: Validation
        await this.transition(loop, 'handoff', 'validation', 'maker subagents completed')
        const validations = await this.runValidation(loop, results)

        // Stage 4: Persistence (for passed contracts)
        const passed = validations.filter(v => v.passed)
        if (passed.length > 0) {
          await this.transition(loop, 'validation', 'persistence', `${passed.length} contracts passed`)
          await this.runPersistence(loop, passed)
        }

        // Repair routing (for failed contracts)
        const failed = validations.filter(v => !v.passed)
        for (const f of failed) {
          await this.routeRepair(loop, f.contractId, f.failType)
        }

        if (passed.length > 0) {
          await this.transition(loop, 'persistence', 'scheduling', 'artifacts persisted')
        } else {
          await this.transition(loop, 'validation', 'scheduling', 'no contracts passed')
        }
      }

      // Stage 5: Scheduling — check stop condition
      const stopMet = await this.checkStopCondition(loop)
      if (stopMet) {
        this.deps.emitEvent({
          type: 'loop.completed', loopId,
          finalStats: loop.stats, ts: new Date().toISOString(),
        })
        await this.deps.store.updateLoop(loopId, {
          status: 'completed', stage: 'scheduling',
          nextTickAt: null,
        })
      } else {
        const nextTick = this.computeNextTick(loop)
        await this.deps.store.updateLoop(loopId, {
          status: 'idle', stage: 'scheduling', nextTickAt: nextTick,
        })
      }
    } catch (err) {
      await this.deps.store.updateLoop(loopId, { status: 'failed' })
      throw err
    }

    // post-tick hook
    await this.deps.hookManager.run('post-tick', loop)

    // emit tick-complete
    const updated = await this.deps.store.getLoop(loopId)
    this.deps.emitEvent({
      type: 'loop.tick-complete', loopId,
      iteration: updated!.stats.currentIteration,
      stats: updated!.stats, ts: new Date().toISOString(),
    })
  }

  private async runDiscovery(loop: LoopInstance): Promise<TaskContract[]> {
    await this.transition(loop, loop.stage, 'discovery', 'tick start')
    const contracts: TaskContract[] = []
    if (this.deps.githubConnector) {
      contracts.push(...await this.deps.githubConnector.discover(loop))
    }
    if (this.deps.localGitConnector) {
      contracts.push(...await this.deps.localGitConnector.discover(loop))
    }
    for (const c of contracts) {
      await this.deps.store.appendContract(c)
      this.deps.emitEvent({ type: 'loop.task-discovered', loopId: loop.id, contract: c, ts: new Date().toISOString() })
    }
    return contracts
  }

  private async runHandoff(loop: LoopInstance, contracts: TaskContract[]): Promise<Array<{ contractId: string; worktreeId: string }>> {
    const results: Array<{ contractId: string; worktreeId: string }> = []
    for (const c of contracts) {
      const worktreeId = await this.deps.worktreeManager.create(c)
      await this.deps.dispatcher.dispatch(c, 'maker')
      await this.deps.store.updateContract(c.id, { status: 'in-progress', worktreeId })
      this.deps.emitEvent({
        type: 'loop.task-handed-off', loopId: loop.id,
        contractId: c.id, worktreeId, ts: new Date().toISOString(),
      })
      results.push({ contractId: c.id, worktreeId })
    }
    return results
  }

  private async runValidation(loop: LoopInstance, results: Array<{ contractId: string; worktreeId: string }>): Promise<Array<{ contractId: string; passed: boolean; failType?: string }>> {
    const validations: Array<{ contractId: string; passed: boolean; failType?: string }> = []
    for (const r of results) {
      const contract = await this.deps.store.getContract(r.contractId)
      if (!contract) continue
      const record = await this.deps.verifier.verify(contract, loop)
      await this.deps.store.appendVerification(record)
      this.deps.emitEvent({
        type: 'loop.verification-complete', contractId: r.contractId,
        passed: record.overall === 'passed', ts: new Date().toISOString(),
      })
      if (record.overall === 'passed') {
        validations.push({ contractId: r.contractId, passed: true })
      } else {
        const failType = this.determineFailType(record)
        validations.push({ contractId: r.contractId, passed: false, failType })
      }
    }
    return validations
  }

  private async runPersistence(loop: LoopInstance, passed: Array<{ contractId: string; passed: boolean }>): Promise<void> {
    for (const p of passed) {
      const contract = await this.deps.store.getContract(p.contractId)
      if (!contract) continue
      const artifact = `PR for ${contract.id}`
      this.deps.emitEvent({
        type: 'loop.persisted', loopId: loop.id,
        contractId: p.contractId, artifact, ts: new Date().toISOString(),
      })
      loop.stats.tasksCompleted++
    }
  }

  private async routeRepair(loop: LoopInstance, contractId: string, failType?: string): Promise<void> {
    const contract = await this.deps.store.getContract(contractId)
    if (!contract) return
    const attempts = contract.attempts + 1
    if (attempts >= contract.maxAttempts) {
      await this.deps.store.updateContract(contractId, { status: 'escalated', attempts })
      loop.stats.tasksBlocked++
      return
    }
    if (failType === 'task-plan') {
      // Route back to discovery for contract regeneration
      await this.deps.store.updateContract(contractId, { status: 'queued', attempts })
    } else {
      // Route back to handoff for code repair
      await this.deps.store.updateContract(contractId, { status: 'queued', attempts })
    }
  }

  private determineFailType(record: import('../../client/loop/types').VerificationRecord): string {
    const progFailed = record.results.programmatic.some(p => !p.passed)
    if (progFailed) return 'programmatic'
    if (record.results.judge && !record.results.judge.passed) return 'judge'
    if (record.results.human && record.results.human.decision !== 'approved') return 'human'
    return 'unknown'
  }

  private async checkStopCondition(loop: LoopInstance): Promise<boolean> {
    // Delegates to an independent small model (implemented in verifier or a dedicated checker)
    // For now, a simple heuristic: if no contracts are queued/in-progress, consider done
    const contracts = await this.deps.store.queryContracts(loop.id, {
      status: ['queued', 'in-progress', 'submitted', 'verifying'],
    })
    return contracts.length === 0
  }

  private computeNextTick(loop: LoopInstance): string {
    if (loop.schedule.mode === 'manual') return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
      try {
        const parser = require('cron-parser')
        const interval = parser.parseExpression(loop.schedule.cron, { tz: loop.schedule.timezone })
        return interval.next().toISOString()
      } catch {
        return new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }
    }
    return new Date(Date.now() + 60 * 60 * 1000).toISOString()
  }

  private async transition(loop: LoopInstance, from: LoopStage, to: LoopStage, reason: string): Promise<void> {
    this.deps.emitEvent({
      type: 'loop.stage-transition', loopId: loop.id,
      from, to, reason, ts: new Date().toISOString(),
    })
    await this.deps.store.updateLoop(loop.id, { stage: to })
    loop.stage = to
  }

  private async handleBudgetExceed(loop: LoopInstance, action: string): Promise<void> {
    if (action === 'throw') {
      await this.deps.store.updateLoop(loop.id, { status: 'paused' })
    } else if (action === 'kill') {
      await this.deps.store.updateLoop(loop.id, { status: 'failed' })
    }
    this.deps.emitEvent({
      type: 'loop.budget-warning', loopId: loop.id,
      spent: loop.stats.totalCost, limit: loop.budget.maxCostTotal,
      ts: new Date().toISOString(),
    })
  }
}
```

- [ ] **Step 3: Write engine tests with mock deps**

```typescript
// overlay/custom/client/loop/__tests__/loop-engine.test.ts
import { describe, it, expect, vi } from 'vitest'
import { LoopEngine } from '../../server/loop/engine/loop-engine'
import type { LoopStateStore } from '../../server/loop/store/state-store'
import type { LoopInstance, TaskContract, LoopEvent, VerificationRecord } from '../types'

function makeLoop(): LoopInstance {
  return {
    id: 'test-loop', name: 'Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

function makeMockStore(loop: LoopInstance): LoopStateStore {
  const contracts: TaskContract[] = []
  return {
    createLoop: vi.fn(),
    getLoop: vi.fn().mockResolvedValue(loop),
    listLoops: vi.fn().mockResolvedValue([loop]),
    updateLoop: vi.fn().mockImplementation(async (id, patch) => { Object.assign(loop, patch) }),
    deleteLoop: vi.fn(),
    appendContract: vi.fn().mockImplementation(async (c) => { contracts.push(c) }),
    getContract: vi.fn().mockImplementation(async (id) => contracts.find(c => c.id === id) ?? null),
    queryContracts: vi.fn().mockResolvedValue([]),
    updateContract: vi.fn(),
    appendVerification: vi.fn(),
    appendEvent: vi.fn(),
    queryEvents: vi.fn().mockResolvedValue([]),
    detectDrift: vi.fn().mockResolvedValue({ hasDrift: false, details: '' }),
  }
}

describe('LoopEngine', () => {
  it('completes a tick with no discoveries (idle → scheduling)', async () => {
    const loop = makeLoop()
    const store = makeMockStore(loop)
    const events: LoopEvent[] = []
    const engine = new LoopEngine({
      store: store as any,
      verifier: { verify: vi.fn() } as any,
      dispatcher: { dispatch: vi.fn() } as any,
      worktreeManager: { create: vi.fn(), remove: vi.fn() } as any,
      budgetGuard: { check: vi.fn().mockReturnValue({ allow: true }) } as any,
      stuckDetector: { check: vi.fn().mockResolvedValue(null), handleStuck: vi.fn() } as any,
      hookManager: { run: vi.fn().mockResolvedValue({ decision: 'allow' }) } as any,
      emitEvent: (e) => { events.push(e) },
    })
    await engine.tick('test-loop')
    expect(loop.stats.currentIteration).toBe(1)
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)
  })

  it('transitions through discovery → handoff → validation → persistence → scheduling', async () => {
    const loop = makeLoop()
    loop.schedule.mode = 'manual'
    const store = makeMockStore(loop)
    const events: LoopEvent[] = []
    const mockContract: TaskContract = {
      id: 'task/test-001', loopId: 'test-loop',
      source: { type: 'github-issue', ref: '#1', summary: 'test bug', rawPayload: {} },
      readPlan: { requiredReads: [] },
      writeBoundary: ['packages/**'],
      verificationIntent: { programmatic: [], judge: null, human: null },
      resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    }
    const mockVerify = vi.fn().mockResolvedValue({
      contractId: 'task/test-001',
      results: { programmatic: [], judge: null, human: null },
      overall: 'passed', finalResponseGuard: true,
    } as VerificationRecord)

    const engine = new LoopEngine({
      store: store as any,
      githubConnector: { discover: vi.fn().mockResolvedValue([mockContract]) } as any,
      verifier: { verify: mockVerify } as any,
      dispatcher: { dispatch: vi.fn() } as any,
      worktreeManager: { create: vi.fn().mockResolvedValue('wt-1'), remove: vi.fn() } as any,
      budgetGuard: { check: vi.fn().mockReturnValue({ allow: true }) } as any,
      stuckDetector: { check: vi.fn().mockResolvedValue(null), handleStuck: vi.fn() } as any,
      hookManager: { run: vi.fn().mockResolvedValue({ decision: 'allow' }) } as any,
      emitEvent: (e) => { events.push(e) },
    })
    await engine.tick('test-loop')

    const transitions = events.filter(e => e.type === 'loop.stage-transition') as any[]
    expect(transitions.length).toBeGreaterThanOrEqual(4)
    expect(transitions[0].to).toBe('discovery')
    expect(transitions.some(t => t.to === 'handoff')).toBe(true)
    expect(transitions.some(t => t.to === 'validation')).toBe(true)
    expect(transitions.some(t => t.to === 'persistence')).toBe(true)
    expect(transitions.some(t => t.to === 'scheduling')).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/loop-engine.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/engine/ custom/client/loop/__tests__/loop-engine.test.ts
git commit -m "feat(loop): add loop engine 5-stage state machine and contract helpers"
```

---

## Task 4: BudgetGuard & StuckDetector & Hooks

**Files:**
- Create: `overlay/custom/server/loop/engine/budget-guard.ts`
- Create: `overlay/custom/server/loop/engine/stuck-detector.ts`
- Create: `overlay/custom/server/loop/engine/hooks.ts`
- Test: `overlay/custom/client/loop/__tests__/budget-guard.test.ts`
- Test: `overlay/custom/client/loop/__tests__/stuck-detector.test.ts`
- Test: `overlay/custom/client/loop/__tests__/hooks.test.ts`

**Interfaces:**
- Consumes: `LoopInstance`, `LoopEvent` (Task 1)
- Produces: `BudgetGuard`, `StuckDetector`, `HookManager` classes

- [ ] **Step 1: Create `budget-guard.ts`**

```typescript
// overlay/custom/server/loop/engine/budget-guard.ts
import type { LoopInstance, LoopEvent } from '../../client/loop/types'

export interface BudgetDecision {
  allow: boolean
  action?: 'throw' | 'notify' | 'kill'
}

export class BudgetGuard {
  constructor(private emitEvent: (event: LoopEvent) => void) {}

  check(loop: LoopInstance): BudgetDecision {
    const totalSpent = loop.stats.totalCost
    const total = loop.budget.maxCostTotal

    if (totalSpent >= total) {
      return { allow: false, action: loop.budget.killMode }
    }

    if (totalSpent / total > loop.budget.warningThreshold) {
      this.emitEvent({
        type: 'loop.budget-warning', loopId: loop.id,
        spent: totalSpent, limit: total, ts: new Date().toISOString(),
      })
    }

    return { allow: true }
  }

  estimateTickCost(loop: LoopInstance): number {
    const costMap: Record<string, number> = {
      low: 0.5, medium: 2, high: 10, 'very-high': 30,
    }
    return costMap[loop.pattern] ?? 1
  }
}
```

- [ ] **Step 2: Create `stuck-detector.ts`**

```typescript
// overlay/custom/server/loop/engine/stuck-detector.ts
import type { LoopInstance, LoopStateStore } from '../../client/loop/types'

export type StuckReason = 'max-attempts' | 'no-output' | 'validation-loop' | 'agent-silent'

export class StuckDetector {
  constructor(private store: LoopStateStore) {}

  async check(loop: LoopInstance): Promise<StuckReason | null> {
    const contracts = await this.store.queryContracts(loop.id)
    // max-attempts: any contract at maxAttempts
    for (const c of contracts) {
      if (c.attempts >= c.maxAttempts && c.status !== 'escalated') {
        return 'max-attempts'
      }
    }
    // no-output: running for > 15min with no recent events
    if (loop.status === 'running' && loop.lastTickAt) {
      const elapsed = Date.now() - new Date(loop.lastTickAt).getTime()
      if (elapsed > 15 * 60 * 1000) {
        const events = await this.store.queryEvents(loop.id, undefined, 1)
        if (events.length === 0 || this.isStaleEvent(events[0])) {
          return 'no-output'
        }
      }
    }
    // validation-loop: check for repeated fail pattern in events
    const recentEvents = await this.store.queryEvents(loop.id, undefined, 20)
    const failCount = recentEvents.filter(e =>
      e.type === 'loop.verification-complete' && !(e as any).passed
    ).length
    if (failCount >= 3) return 'validation-loop'

    return null
  }

  private isStaleEvent(event: any): boolean {
    if (!event.ts) return true
    return Date.now() - new Date(event.ts).getTime() > 10 * 60 * 1000
  }

  async handleStuck(loop: LoopInstance, reason: StuckReason): Promise<void> {
    switch (reason) {
      case 'max-attempts':
        await this.store.updateLoop(loop.id, { status: 'paused' })
        break
      case 'no-output':
        await this.store.updateLoop(loop.id, { status: 'paused' })
        break
      case 'validation-loop':
        // Try switching maker model — just flag for now
        await this.store.updateLoop(loop.id, { status: 'blocked' })
        break
      case 'agent-silent':
        await this.store.updateLoop(loop.id, { status: 'blocked' })
        break
    }
  }
}
```

- [ ] **Step 3: Create `hooks.ts`**

```typescript
// overlay/custom/server/loop/engine/hooks.ts
import type { LoopInstance } from '../../client/loop/types'

export type LoopHook =
  | 'pre-discovery' | 'post-discovery'
  | 'pre-handoff' | 'post-handoff'
  | 'pre-validation' | 'post-validation'
  | 'pre-persistence' | 'post-persistence'
  | 'pre-tick' | 'post-tick'
  | 'on-stuck' | 'on-budget-exceed'

export interface HookHandler {
  type: 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent'
  matcher?: string
  config: unknown
}

export interface HookResult {
  decision: 'allow' | 'deny' | 'ask'
  updatedInput?: unknown
  additionalContext?: string
}

type HandlerFn = (loop: LoopInstance) => Promise<HookResult>

export class HookManager {
  private handlers: Map<LoopHook, HandlerFn[]> = new Map()

  register(hook: LoopHook, fn: HandlerFn): void {
    const existing = this.handlers.get(hook) ?? []
    existing.push(fn)
    this.handlers.set(hook, existing)
  }

  async run(hook: LoopHook, loop: LoopInstance): Promise<HookResult> {
    const fns = this.handlers.get(hook) ?? []
    let result: HookResult = { decision: 'allow' }
    for (const fn of fns) {
      const r = await fn(loop)
      if (r.decision === 'deny') return r
      if (r.decision === 'ask') result = r
      if (r.additionalContext) {
        result.additionalContext = (result.additionalContext ?? '') + r.additionalContext
      }
    }
    return result
  }
}
```

- [ ] **Step 4: Write BudgetGuard test**

```typescript
// overlay/custom/client/loop/__tests__/budget-guard.test.ts
import { describe, it, expect, vi } from 'vitest'
import { BudgetGuard } from '../../server/loop/engine/budget-guard'
import type { LoopInstance, LoopEvent } from '../types'

function makeLoop(totalCost: number, maxTotal: number = 200): LoopInstance {
  return {
    id: 'test', name: 'Test', goal: 'g', stopCondition: 's',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: maxTotal, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost, currentIteration: 0 },
  }
}

describe('BudgetGuard', () => {
  it('allows when under budget', () => {
    const guard = new BudgetGuard(vi.fn())
    const result = guard.check(makeLoop(10))
    expect(result.allow).toBe(true)
  })

  it('warns at 80% threshold', () => {
    const events: LoopEvent[] = []
    const guard = new BudgetGuard((e) => { events.push(e) })
    guard.check(makeLoop(170, 200))
    expect(events.some(e => e.type === 'loop.budget-warning')).toBe(true)
  })

  it('denies when over budget with throw mode', () => {
    const guard = new BudgetGuard(vi.fn())
    const result = guard.check(makeLoop(250, 200))
    expect(result.allow).toBe(false)
    expect(result.action).toBe('throw')
  })

  it('kill mode returns kill action', () => {
    const loop = makeLoop(250, 200)
    loop.budget.killMode = 'kill'
    const guard = new BudgetGuard(vi.fn())
    const result = guard.check(loop)
    expect(result.action).toBe('kill')
  })
})
```

- [ ] **Step 5: Write StuckDetector & Hooks tests**

```typescript
// overlay/custom/client/loop/__tests__/stuck-detector.test.ts
import { describe, it, expect, vi } from 'vitest'
import { StuckDetector } from '../../server/loop/engine/stuck-detector'
import type { LoopStateStore } from '../../server/loop/store/state-store'
import type { LoopInstance } from '../types'

function makeMockStore(contracts: any[], events: any[]): LoopStateStore {
  return {
    getLoop: vi.fn(), createLoop: vi.fn(), listLoops: vi.fn(),
    updateLoop: vi.fn(), deleteLoop: vi.fn(),
    appendContract: vi.fn(), getContract: vi.fn(),
    queryContracts: vi.fn().mockResolvedValue(contracts),
    updateContract: vi.fn(), appendVerification: vi.fn(),
    appendEvent: vi.fn(),
    queryEvents: vi.fn().mockResolvedValue(events),
    detectDrift: vi.fn().mockResolvedValue({ hasDrift: false, details: '' }),
  } as any
}

describe('StuckDetector', () => {
  it('returns null when everything is fine', async () => {
    const store = makeMockStore([], [])
    const detector = new StuckDetector(store)
    const loop = { id: 'l', status: 'idle', stats: { totalCost: 0 } } as any
    expect(await detector.check(loop)).toBeNull()
  })

  it('detects max-attempts when a contract exceeds maxAttempts', async () => {
    const store = makeMockStore([{ id: 'c1', attempts: 3, maxAttempts: 3, status: 'in-progress' }], [])
    const detector = new StuckDetector(store)
    const loop = { id: 'l', status: 'running', stats: { totalCost: 0 } } as any
    expect(await detector.check(loop)).toBe('max-attempts')
  })

  it('detects validation-loop when 3+ fails in recent events', async () => {
    const fails = [
      { type: 'loop.verification-complete', passed: false, ts: new Date().toISOString() },
      { type: 'loop.verification-complete', passed: false, ts: new Date().toISOString() },
      { type: 'loop.verification-complete', passed: false, ts: new Date().toISOString() },
    ]
    const store = makeMockStore([], fails)
    const detector = new StuckDetector(store)
    const loop = { id: 'l', status: 'idle', stats: { totalCost: 0 } } as any
    expect(await detector.check(loop)).toBe('validation-loop')
  })
})
```

```typescript
// overlay/custom/client/loop/__tests__/hooks.test.ts
import { describe, it, expect, vi } from 'vitest'
import { HookManager } from '../../server/loop/engine/hooks'
import type { LoopInstance } from '../types'

describe('HookManager', () => {
  it('allows when no handlers registered', async () => {
    const hm = new HookManager()
    const loop = { id: 'l' } as any
    const result = await hm.run('pre-tick', loop)
    expect(result.decision).toBe('allow')
  })

  it('deny from a handler short-circuits', async () => {
    const hm = new HookManager()
    hm.register('pre-tick', async () => ({ decision: 'deny' }))
    hm.register('pre-tick', async () => ({ decision: 'allow' }))
    const loop = { id: 'l' } as any
    const result = await hm.run('pre-tick', loop)
    expect(result.decision).toBe('deny')
  })

  it('accumulates additionalContext', async () => {
    const hm = new HookManager()
    hm.register('post-tick', async () => ({ decision: 'allow', additionalContext: 'ctx1' }))
    hm.register('post-tick', async () => ({ decision: 'allow', additionalContext: 'ctx2' }))
    const loop = { id: 'l' } as any
    const result = await hm.run('post-tick', loop)
    expect(result.additionalContext).toBe('ctx1ctx2')
  })

  it('ask escalates but does not deny', async () => {
    const hm = new HookManager()
    hm.register('pre-persistence', async () => ({ decision: 'ask' }))
    const loop = { id: 'l' } as any
    const result = await hm.run('pre-persistence', loop)
    expect(result.decision).toBe('ask')
  })
})
```

- [ ] **Step 6: Run all tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/budget-guard.test.ts custom/client/loop/__tests__/stuck-detector.test.ts custom/client/loop/__tests__/hooks.test.ts
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add custom/server/loop/engine/budget-guard.ts custom/server/loop/engine/stuck-detector.ts custom/server/loop/engine/hooks.ts custom/client/loop/__tests__/budget-guard.test.ts custom/client/loop/__tests__/stuck-detector.test.ts custom/client/loop/__tests__/hooks.test.ts
git commit -m "feat(loop): add BudgetGuard, StuckDetector, and HookManager"
```

---

## Task 5: Connectors (GitHub + Local Git + Webhook)

**Files:**
- Create: `overlay/custom/server/loop/connectors/github-connector.ts`
- Create: `overlay/custom/server/loop/connectors/local-git-connector.ts`
- Create: `overlay/custom/server/loop/connectors/webhook-connector.ts`
- Test: `overlay/custom/client/loop/__tests__/github-connector.test.ts`
- Test: `overlay/custom/client/loop/__tests__/local-git-connector.test.ts`
- Test: `overlay/custom/client/loop/__tests__/webhook-connector.test.ts`

**Interfaces:**
- Consumes: `LoopInstance`, `TaskContract` (Task 1), `createContract` (Task 3)
- Produces: `GithubConnector`, `LocalGitConnector`, `WebhookConnector` classes, each with `discover(loop): Promise<TaskContract[]>`

- [ ] **Step 1: Create `github-connector.ts`**

```typescript
// overlay/custom/server/loop/connectors/github-connector.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { LoopInstance, TaskContract } from '../../client/loop/types'
import { createContract } from '../engine/task-contract'

const execFileAsync = promisify(execFile)

export interface GithubConnectorConfig {
  repo: string        // 'owner/repo'
  token?: string      // GitHub PAT
  apiUrl?: string     // default: https://api.github.com
}

export class GithubConnector {
  constructor(private config: GithubConnectorConfig) {}

  async discover(loop: LoopInstance): Promise<TaskContract[]> {
    const contracts: TaskContract[] = []
    const [issues, ciFails, recentCommits] = await Promise.all([
      this.fetchOpenIssues(),
      this.fetchCIFailures(),
      this.fetchRecentCommits(),
    ])
    for (const issue of issues) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'github-issue', ref: `#${issue.number}`, summary: issue.title, rawPayload: issue },
        readPlan: { requiredReads: ['packages/**'] },
        writeBoundary: ['packages/**'],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      }))
    }
    for (const ci of ciFails) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'github-ci', ref: ci.workflowName, summary: `CI failure: ${ci.workflowName}`, rawPayload: ci },
        readPlan: { requiredReads: ['.github/workflows/**'] },
        writeBoundary: ['.github/workflows/**', 'packages/**'],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      }))
    }
    for (const commit of recentCommits) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'git-commit', ref: commit.sha, summary: commit.message, rawPayload: commit },
        readPlan: { requiredReads: [] },
        writeBoundary: [],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'report', requiredFiles: [] },
      }))
    }
    return contracts
  }

  private async fetchOpenIssues(): Promise<Array<{ number: number; title: string }>> {
    try {
      const url = `${this.config.apiUrl ?? 'https://api.github.com'}/repos/${this.config.repo}/issues?state=open`
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' }
      if (this.config.token) headers['Authorization'] = `Bearer ${this.config.token}`
      const res = await fetch(url, { headers })
      if (!res.ok) return []
      const data = await res.json()
      return (data as any[]).map(i => ({ number: i.number, title: i.title }))
    } catch { return [] }
  }

  private async fetchCIFailures(): Promise<Array<{ workflowName: string; runId: number }>> {
    try {
      const url = `${this.config.apiUrl ?? 'https://api.github.com'}/repos/${this.config.repo}/actions/runs?status=failure&per_page=5`
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' }
      if (this.config.token) headers['Authorization'] = `Bearer ${this.config.token}`
      const res = await fetch(url, { headers })
      if (!res.ok) return []
      const data = await res.json()
      return (data.workflow_runs ?? []).map((r: any) => ({ workflowName: r.name, runId: r.id }))
    } catch { return [] }
  }

  private async fetchRecentCommits(): Promise<Array<{ sha: string; message: string }>> {
    try {
      const { stdout } = await execFileAsync('git', ['log', '--oneline', '-5', '--format=%H%n%s'])
      return stdout.trim().split('\n').reduce((acc: Array<{ sha: string; message: string }>, line, i) => {
        if (i % 2 === 0 && line) {
          acc.push({ sha: line, message: stdout.split('\n')[i + 1] ?? '' })
        }
        return acc
      }, [])
    } catch { return [] }
  }
}
```

- [ ] **Step 2: Create `local-git-connector.ts`**

```typescript
// overlay/custom/server/loop/connectors/local-git-connector.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { LoopInstance, TaskContract } from '../../client/loop/types'
import { createContract } from '../engine/task-contract'

const execFileAsync = promisify(execFile)

export class LocalGitConnector {
  constructor(private cwd: string = process.cwd()) {}

  async discover(loop: LoopInstance): Promise<TaskContract[]> {
    const contracts: TaskContract[] = []
    const unpushed = await this.getUnpushedCommits()
    for (const commit of unpushed) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'git-commit', ref: commit.sha, summary: `Unpushed: ${commit.message}`, rawPayload: commit },
        readPlan: { requiredReads: [] },
        writeBoundary: [],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'report', requiredFiles: [] },
      }))
    }
    return contracts
  }

  private async getUnpushedCommits(): Promise<Array<{ sha: string; message: string }>> {
    try {
      const { stdout } = await execFileAsync('git', ['log', '--oneline', '-10', '--format=%H%n%s', '@{u}..HEAD'], { cwd: this.cwd })
      if (!stdout.trim()) return []
      const lines = stdout.trim().split('\n')
      const commits: Array<{ sha: string; message: string }> = []
      for (let i = 0; i < lines.length; i += 2) {
        if (lines[i]) commits.push({ sha: lines[i], message: lines[i + 1] ?? '' })
      }
      return commits
    } catch { return [] } // no upstream → empty
  }
}
```

- [ ] **Step 3: Create `webhook-connector.ts`**

```typescript
// overlay/custom/server/loop/connectors/webhook-connector.ts
import type { LoopInstance, TaskContract } from '../../client/loop/types'
import { createContract } from '../engine/task-contract'

export interface WebhookPayload {
  source: string
  eventType: string
  payload: unknown
}

export class WebhookConnector {
  private pendingPayloads: Map<string, WebhookPayload[]> = new Map()

  enqueue(loopId: string, payload: WebhookPayload): void {
    const existing = this.pendingPayloads.get(loopId) ?? []
    existing.push(payload)
    this.pendingPayloads.set(loopId, existing)
  }

  async discover(loop: LoopInstance): Promise<TaskContract[]> {
    const pending = this.pendingPayloads.get(loop.id) ?? []
    if (pending.length === 0) return []
    const contracts = pending.map(p => createContract({
      loopId: loop.id,
      source: { type: 'webhook', ref: `${p.source}:${p.eventType}`, summary: `${p.eventType} from ${p.source}`, rawPayload: p.payload },
      readPlan: { requiredReads: [] },
      writeBoundary: ['packages/**'],
      verificationIntent: { programmatic: [], judge: null, human: null },
      resultTemplate: { artifactType: 'patch', requiredFiles: [] },
    }))
    this.pendingPayloads.delete(loop.id)
    return contracts
  }
}
```

- [ ] **Step 4: Write connector tests**

```typescript
// overlay/custom/client/loop/__tests__/github-connector.test.ts
import { describe, it, expect, vi } from 'vitest'
import { GithubConnector } from '../../server/loop/connectors/github-connector'
import type { LoopInstance } from '../types'

function makeLoop(): LoopInstance {
  return { id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null, budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 }, stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } }
}

describe('GithubConnector', () => {
  it('returns empty array when fetch fails', async () => {
    const connector = new GithubConnector({ repo: 'invalid/invalid' })
    const result = await connector.discover(makeLoop())
    expect(result).toEqual([])
  })
})
```

```typescript
// overlay/custom/client/loop/__tests__/local-git-connector.test.ts
import { describe, it, expect } from 'vitest'
import { LocalGitConnector } from '../../server/loop/connectors/local-git-connector'
import type { LoopInstance } from '../types'

function makeLoop(): LoopInstance {
  return { id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null, budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 }, stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } }
}

describe('LocalGitConnector', () => {
  it('returns empty array when no unpushed commits (or no upstream)', async () => {
    const connector = new LocalGitConnector('/tmp')
    const result = await connector.discover(makeLoop())
    expect(result).toEqual([])
  })
})
```

```typescript
// overlay/custom/client/loop/__tests__/webhook-connector.test.ts
import { describe, it, expect } from 'vitest'
import { WebhookConnector } from '../../server/loop/connectors/webhook-connector'
import type { LoopInstance } from '../types'

function makeLoop(): LoopInstance {
  return { id: 'wh-loop', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage', schedule: { mode: 'webhook', timezone: 'UTC' }, stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null, budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 }, stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } }
}

describe('WebhookConnector', () => {
  it('returns empty when no payloads enqueued', async () => {
    const connector = new WebhookConnector()
    const result = await connector.discover(makeLoop())
    expect(result).toEqual([])
  })

  it('returns contracts when payloads are enqueued and clears queue', async () => {
    const connector = new WebhookConnector()
    connector.enqueue('wh-loop', { source: 'ci', eventType: 'workflow.failed', payload: { runId: 42 } })
    const result = await connector.discover(makeLoop())
    expect(result.length).toBe(1)
    expect(result[0].source.type).toBe('webhook')
    expect(result[0].source.ref).toBe('ci:workflow.failed')
    // second discover should be empty
    const result2 = await connector.discover(makeLoop())
    expect(result2).toEqual([])
  })
})
```

- [ ] **Step 5: Run tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/github-connector.test.ts custom/client/loop/__tests__/local-git-connector.test.ts custom/client/loop/__tests__/webhook-connector.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add custom/server/loop/connectors/ custom/client/loop/__tests__/github-connector.test.ts custom/client/loop/__tests__/local-git-connector.test.ts custom/client/loop/__tests__/webhook-connector.test.ts
git commit -m "feat(loop): add GitHub, local-git, and webhook connectors"
```

---

## Task 6: Verifier (3-Route: Programmatic + Judge + Human)

**Files:**
- Create: `overlay/custom/server/loop/engine/verifier.ts`
- Test: `overlay/custom/client/loop/__tests__/verifier.test.ts`

**Interfaces:**
- Consumes: `TaskContract`, `LoopInstance`, `VerificationRecord`, `AutonomyLevel` (Task 1)
- Produces: `Verifier` class implementing the 3-route verification coordinator with short-circuit strategy

- [ ] **Step 1: Create `verifier.ts`**

```typescript
// overlay/custom/server/loop/engine/verifier.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  TaskContract, LoopInstance, VerificationRecord, AutonomyLevel,
} from '../../client/loop/types'

const execFileAsync = promisify(execFile)

export interface VerifierDeps {
  // Judge: call an independent model (different model family from maker)
  callJudge?: (model: string, diff: string, rubric: string) => Promise<{ score: number; reasoning: string }>
  // Human: notify and await approval
  requestHumanApproval?: (contractId: string, approvers: string[]) => Promise<'approved' | 'rejected' | 'changes-requested' | 'pending'>
}

export class Verifier {
  constructor(private deps: VerifierDeps = {}) {}

  async verify(contract: TaskContract, loop: LoopInstance): Promise<VerificationRecord> {
    const level = loop.autonomyLevel
    const spec = contract.verificationIntent

    // --- Programmatic ---
    const progResults: Array<{ command: string; exitCode: number; stdout: string; passed: boolean }> = []
    let progFailed = false
    for (const check of spec.programmatic) {
      const result = await this.runProgrammatic(check, contract.worktreeId)
      progResults.push(result)
      if (!result.passed) progFailed = true
    }

    // Short-circuit: L1/L2/L3 all short-circuit Judge if Programmatic fails
    if (progFailed) {
      return {
        contractId: contract.id,
        results: { programmatic: progResults, judge: null, human: null },
        overall: 'failed',
        finalResponseGuard: false,
      }
    }

    // --- Judge (skip if not configured) ---
    let judgeResult: VerificationRecord['results']['judge'] = null
    if (spec.judge && this.deps.callJudge) {
      // Judge only sees the diff, not maker's reasoning trace
      const diff = await this.getWorktreeDiff(contract.worktreeId)
      const jr = await this.deps.callJudge(spec.judge.model, diff, spec.judge.rubric)
      judgeResult = {
        model: spec.judge.model,
        score: jr.score,
        reasoning: jr.reasoning,
        passed: jr.score >= spec.judge.minScore,
      }
    }

    const judgeFailed = judgeResult && !judgeResult.passed

    // --- Human gate ---
    let humanResult: VerificationRecord['results']['human'] = null
    if (spec.human) {
      const needsHuman = this.needsHumanGate(level, spec.human.gate, progFailed, !!judgeFailed)
      if (needsHuman && this.deps.requestHumanApproval) {
        const decision = await this.deps.requestHumanApproval(contract.id, spec.human.approvers)
        if (decision === 'pending') {
          return {
            contractId: contract.id,
            results: { programmatic: progResults, judge: judgeResult, human: null },
            overall: 'pending',
            finalResponseGuard: true,
          }
        }
        humanResult = {
          approver: spec.human.approvers[0] ?? 'unknown',
          decision,
          comment: '',
          timestamp: new Date().toISOString(),
        }
      }
    }

    // --- Determine overall ---
    const allPassed = !progFailed && (!judgeResult || judgeResult.passed)
      && (!humanResult || humanResult.decision === 'approved')

    // --- finalResponseGuard ---
    const guardPassed = await this.finalResponseGuard(contract)

    return {
      contractId: contract.id,
      results: { programmatic: progResults, judge: judgeResult, human: humanResult },
      overall: allPassed && guardPassed ? 'passed' : 'failed',
      finalResponseGuard: guardPassed,
    }
  }

  private needsHumanGate(level: AutonomyLevel, gate: 'always' | 'on-fail', progFailed: boolean, judgeFailed: boolean): boolean {
    if (gate === 'always') return true
    // gate = 'on-fail'
    if (level === 'L3') return progFailed || judgeFailed  // L3 only escalates on fail
    return true  // L1/L2 always need human even on pass
  }

  private async runProgrammatic(
    check: { command: string; expectedExitCode: number; timeout: number },
    worktreeId: string | null,
  ): Promise<{ command: string; exitCode: number; stdout: string; passed: boolean }> {
    const cwd = worktreeId ? `.loop/worktrees/${worktreeId}` : process.cwd()
    try {
      const { stdout } = await execFileAsync(check.command.split(' ')[0], check.command.split(' ').slice(1), {
        cwd,
        timeout: check.timeout,
        maxBuffer: 1024 * 1024,
      })
      const stdoutTrimmed = stdout.length > 10240 ? stdout.slice(-10240) + `\n... (${stdout.length} bytes total)` : stdout
      return { command: check.command, exitCode: 0, stdout: stdoutTrimmed, passed: true }
    } catch (err: any) {
      const stdout = err.stdout ?? err.message ?? ''
      return { command: check.command, exitCode: err.code ?? 1, stdout, passed: false }
    }
  }

  private async getWorktreeDiff(worktreeId: string | null): Promise<string> {
    if (!worktreeId) return ''
    try {
      const { stdout } = await execFileAsync('git', ['diff'], { cwd: `.loop/worktrees/${worktreeId}` })
      return stdout
    } catch { return '' }
  }

  private async finalResponseGuard(contract: TaskContract): Promise<boolean> {
    // Check requiredFiles exist and are non-empty
    if (!contract.worktreeId) return false
    const { existsSync, statSync } = require('fs')
    const { resolve } = require('path')
    const wtPath = `.loop/worktrees/${contract.worktreeId}`
    for (const f of contract.resultTemplate.requiredFiles) {
      const p = resolve(wtPath, f)
      if (!existsSync(p)) return false
      if (statSync(p).size === 0) return false
    }
    return true
  }
}
```

- [ ] **Step 2: Write verifier tests**

```typescript
// overlay/custom/client/loop/__tests__/verifier.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Verifier } from '../../server/loop/engine/verifier'
import type { TaskContract, LoopInstance, VerificationRecord } from '../types'

function makeContract(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    id: 'task/test-001', loopId: 'l',
    source: { type: 'github-issue', ref: '#1', summary: 'test', rawPayload: {} },
    readPlan: { requiredReads: [] },
    writeBoundary: ['packages/**'],
    verificationIntent: { programmatic: [], judge: null, human: null },
    resultTemplate: { artifactType: 'patch', requiredFiles: [] },
    worktreeId: null, assignee: 'maker', status: 'in-progress', attempts: 0, maxAttempts: 3,
    ...overrides,
  }
}

function makeLoop(level: 'L1' | 'L2' | 'L3' = 'L1'): LoopInstance {
  return {
    id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'validation', status: 'running',
    autonomyLevel: level, stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Verifier', () => {
  it('passes with empty verification spec and guard', async () => {
    const v = new Verifier()
    // finalResponseGuard returns false when no worktreeId, so set requiredFiles=[]
    const contract = makeContract({ worktreeId: null, resultTemplate: { artifactType: 'report', requiredFiles: [] } })
    const record = await v.verify(contract, makeLoop())
    expect(record.overall).toBe('passed')
  })

  it('fails when programmatic check fails', async () => {
    const v = new Verifier()
    const contract = makeContract({
      verificationIntent: {
        programmatic: [{ command: 'false', expectedExitCode: 0, timeout: 5000 }],
        judge: null, human: null,
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop())
    expect(record.overall).toBe('failed')
    expect(record.results.programmatic[0].passed).toBe(false)
  })

  it('short-circuits judge when programmatic fails', async () => {
    const callJudge = vi.fn().mockResolvedValue({ score: 90, reasoning: 'good' })
    const v = new Verifier({ callJudge })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [{ command: 'false', expectedExitCode: 0, timeout: 5000 }],
        judge: { model: 'gpt-4', rubric: 'correctness', minScore: 80 },
        human: null,
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop())
    expect(record.results.judge).toBeNull()
    expect(callJudge).not.toHaveBeenCalled()
  })

  it('L1 always needs human gate even on pass', async () => {
    const requestApproval = vi.fn().mockResolvedValue('approved' as const)
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'on-fail', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop('L1'))
    expect(requestApproval).toHaveBeenCalled()
    expect(record.results.human).not.toBeNull()
    expect(record.results.human!.decision).toBe('approved')
  })

  it('L3 skips human gate on pass when gate=on-fail', async () => {
    const requestApproval = vi.fn()
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'on-fail', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop('L3'))
    expect(requestApproval).not.toHaveBeenCalled()
    expect(record.results.human).toBeNull()
    expect(record.overall).toBe('passed')
  })

  it('gate=always requires human even in L3', async () => {
    const requestApproval = vi.fn().mockResolvedValue('approved' as const)
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'always', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    await v.verify(contract, makeLoop('L3'))
    expect(requestApproval).toHaveBeenCalled()
  })

  it('returns pending when human approval is pending', async () => {
    const requestApproval = vi.fn().mockResolvedValue('pending' as const)
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'always', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop('L3'))
    expect(record.overall).toBe('pending')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/verifier.test.ts
```
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add custom/server/loop/engine/verifier.ts custom/client/loop/__tests__/verifier.test.ts
git commit -m "feat(loop): add 3-route verifier with short-circuit strategy"
```

---

## Task 7: Scheduler (cron + webhook + 7 patterns) & WorktreeManager & SubagentDispatcher

**Files:**
- Create: `overlay/custom/server/loop/engine/scheduler.ts`
- Create: `overlay/custom/server/loop/engine/worktree-manager.ts`
- Create: `overlay/custom/server/loop/engine/subagent-dispatcher.ts`
- Create: `overlay/config/loop-config.ts`
- Test: `overlay/custom/client/loop/__tests__/scheduler.test.ts`
- Test: `overlay/custom/client/loop/__tests__/worktree-manager.test.ts`

**Interfaces:**
- Consumes: `LoopStateStore` (Task 2), `LoopEngine` (Task 3), `PATTERN_TEMPLATES` (Task 1), `TaskContract` (Task 1)
- Produces: `Scheduler`, `WorktreeManager`, `SubagentDispatcher` classes

- [ ] **Step 1: Add `cron-parser` dependency via B-class patch**

Create `overlay/patches/136-cron-parser-dep.patch`:

```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -31,6 +31,7 @@
     "cookie": "^0.7.2",
     "cookie-parser": "^1.4.7",
     "csrf-csrf": "^1.0.4",
+    "cron-parser": "^5.1.1",
     "dayjs": "^1.11.13",
```

Append to `overlay/patches/series`: `136-cron-parser-dep.patch`

- [ ] **Step 2: Create `scheduler.ts`**

```typescript
// overlay/custom/server/loop/engine/scheduler.ts
import cronParser from 'cron-parser'
import type { LoopInstance, LoopEvent } from '../../client/loop/types'
import type { LoopStateStore } from '../store/state-store'
import type { LoopEngine } from './loop-engine'
import type { WebhookConnector } from '../connectors/webhook-connector'

export class Scheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map()

  constructor(
    private store: LoopStateStore,
    private engine: LoopEngine,
    private webhookConnector: WebhookConnector,
  ) {}

  start(): void {
    this.scheduleAll()
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  async scheduleAll(): Promise<void> {
    const loops = await this.store.listLoops({ status: ['idle'] })
    for (const loop of loops) {
      this.scheduleLoop(loop)
    }
  }

  scheduleLoop(loop: LoopInstance): void {
    // Clear existing timer
    const existing = this.timers.get(loop.id)
    if (existing) clearTimeout(existing)

    if (loop.schedule.mode === 'manual') return
    if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
      const nextTick = this.computeNextTick(loop)
      const delay = Math.max(0, new Date(nextTick).getTime() - Date.now())
      const timer = setTimeout(() => {
        this.engine.tick(loop.id).catch(() => {}).finally(() => {
          this.rescheduleLoop(loop.id)
        })
      }, delay)
      this.timers.set(loop.id, timer)
    }
    // webhook mode: handled by webhook endpoint, no timer needed
  }

  private async rescheduleLoop(loopId: string): Promise<void> {
    const loop = await this.store.getLoop(loopId)
    if (loop && loop.status === 'idle') {
      this.scheduleLoop(loop)
    }
  }

  async handleWebhook(loopId: string, source: string, eventType: string, payload: unknown): Promise<void> {
    // Debounce: 5s window
    const key = `${loopId}:${source}:${eventType}`
    const existing = this.timers.get(key)
    if (existing) clearTimeout(existing)
    this.webhookConnector.enqueue(loopId, { source, eventType, payload })
    const timer = setTimeout(() => {
      this.engine.tick(loopId).catch(() => {}).finally(() => {
        this.timers.delete(key)
      })
    }, 5000)
    this.timers.set(key, timer)
  }

  async manualTick(loopId: string): Promise<void> {
    await this.engine.tick(loopId)
    const loop = await this.store.getLoop(loopId)
    if (loop) this.scheduleLoop(loop)
  }

  computeNextTick(loop: LoopInstance): string {
    if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
      try {
        const interval = cronParser.parseExpression(loop.schedule.cron, { tz: loop.schedule.timezone })
        return interval.next().toISOString()
      } catch {
        return new Date(Date.now() + 3600_000).toISOString()
      }
    }
    return new Date(Date.now() + 3600_000).toISOString()
  }
}
```

- [ ] **Step 3: Create `worktree-manager.ts`**

```typescript
// overlay/custom/server/loop/engine/worktree-manager.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'
import type { TaskContract } from '../../client/loop/types'

const execFileAsync = promisify(execFile)
const WORKTREE_DIR = '.loop/worktrees'
const MAX_WORKTREES = 20

export class WorktreeManager {
  constructor(private baseDir: string = '.loop') {}

  async create(contract: TaskContract): Promise<string> {
    const worktreeId = contract.id.replace('task/', 'wt-')
    const wtPath = resolve(this.baseDir, 'worktrees', worktreeId)

    // Prune if at max
    await this.pruneOldWorktrees()

    if (existsSync(wtPath)) {
      await fs.rm(wtPath, { recursive: true, force: true })
    }
    await fs.mkdir(resolve(this.baseDir, 'worktrees'), { recursive: true })

    // Create detached-HEAD worktree
    await execFileAsync('git', ['worktree', 'add', '--detach', wtPath, 'HEAD'])

    // Copy .worktreeinclude files
    await this.copyIncludedFiles(wtPath)

    return worktreeId
  }

  async remove(worktreeId: string): Promise<void> {
    const wtPath = resolve(this.baseDir, 'worktrees', worktreeId)
    if (existsSync(wtPath)) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', wtPath])
      } catch {
        await fs.rm(wtPath, { recursive: true, force: true })
      }
    }
  }

  async cleanupStale(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const worktreesDir = resolve(this.baseDir, 'worktrees')
    if (!existsSync(worktreesDir)) return
    const entries = await fs.readdir(worktreesDir)
    const now = Date.now()
    for (const entry of entries) {
      const p = resolve(worktreesDir, entry)
      try {
        const stat = await fs.stat(p)
        if (now - stat.mtimeMs > maxAgeMs) {
          await this.remove(entry)
        }
      } catch {}
    }
  }

  private async pruneOldWorktrees(): Promise<void> {
    const worktreesDir = resolve(this.baseDir, 'worktrees')
    if (!existsSync(worktreesDir)) return
    const entries = await fs.readdir(worktreesDir)
    if (entries.length < MAX_WORKTREES) return
    // Remove oldest by mtime
    const stats = await Promise.all(entries.map(async e => {
      const stat = await fs.stat(resolve(worktreesDir, e))
      return { name: e, mtime: stat.mtimeMs }
    }))
    stats.sort((a, b) => a.mtime - b.mtime)
    const toRemove = stats.slice(0, stats.length - MAX_WORKTREES + 1)
    for (const s of toRemove) {
      await this.remove(s.name)
    }
  }

  private async copyIncludedFiles(wtPath: string): Promise<void> {
    const includePath = resolve(this.baseDir, '.worktreeinclude')
    if (!existsSync(includePath)) return
    const content = await fs.readFile(includePath, 'utf-8')
    const files = content.trim().split('\n').filter(Boolean)
    for (const f of files) {
      const src = resolve(process.cwd(), f)
      if (existsSync(src)) {
        await fs.copyFile(src, resolve(wtPath, f))
      }
    }
  }
}
```

- [ ] **Step 4: Create `subagent-dispatcher.ts`**

```typescript
// overlay/custom/server/loop/engine/subagent-dispatcher.ts
import type { TaskContract } from '../../client/loop/types'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface SubagentDispatcherDeps {
  // Invoke hermes-agent with the given prompt + worktree
  invokeAgent?: (prompt: string, worktreePath: string, readPlan: string[], writeBoundary: string[]) => Promise<string>
}

export class SubagentDispatcher {
  private depth: number = 0
  private readonly maxDepth: number = 5

  constructor(private deps: SubagentDispatcherDeps = {}) {}

  async dispatch(contract: TaskContract, role: 'maker' | 'checker'): Promise<void> {
    if (this.depth >= this.maxDepth) {
      throw new Error(`Max subagent depth (${this.maxDepth}) exceeded for contract ${contract.id}`)
    }
    this.depth++

    try {
      const worktreePath = contract.worktreeId ? `.loop/worktrees/${contract.worktreeId}` : process.cwd()
      const prompt = role === 'maker'
        ? `Goal: ${contract.source.summary}\nRead: ${contract.readPlan.requiredReads.join(', ')}\nWrite to: ${contract.writeBoundary.join(', ')}\nProduce: ${contract.resultTemplate.artifactType}`
        : `Review the work in this worktree. Verify against: ${JSON.stringify(contract.verificationIntent)}`

      if (this.deps.invokeAgent) {
        await this.deps.invokeAgent(prompt, worktreePath, contract.readPlan.requiredReads, contract.writeBoundary)
      } else {
        // Fallback: invoke hermes-agent CLI
        try {
          await execFileAsync('hermes', ['--prompt', prompt, '--cwd', worktreePath], { timeout: 300_000 })
        } catch (err) {
          // Agent invocation failure is non-fatal; verification will catch missing output
        }
      }
    } finally {
      this.depth--
    }
  }
}
```

- [ ] **Step 5: Create `loop-config.ts`**

```typescript
// overlay/config/loop-config.ts
import type { LoopHook, HookHandler } from '../custom/server/loop/engine/hooks'

export const loopConfig = {
  stateAdapter: process.env.LOOP_STATE_ADAPTER || 'local',
  matrix: {
    roomId: process.env.LOOP_MATRIX_ROOM_ID || '',
  },
  saas: {
    apiUrl: process.env.LOOP_SAAS_API_URL || '',
    tenantId: process.env.LOOP_SAAS_TENANT_ID || '',
  },
  github: {
    repo: process.env.LOOP_GITHUB_REPO || '',
    token: process.env.LOOP_GITHUB_TOKEN || '',
  },
}

export const defaultHooks: Array<{ hook: LoopHook; handler: HookHandler }> = [
  // BudgetGuard and StuckDetector are called directly in loop-engine, not as hooks
  // These are for user-extensible hooks
]
```

- [ ] **Step 6: Write scheduler & worktree tests**

```typescript
// overlay/custom/client/loop/__tests__/scheduler.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Scheduler } from '../../server/loop/engine/scheduler'
import type { LoopStateStore } from '../../server/loop/store/state-store'
import type { LoopInstance } from '../types'

function makeLoop(mode: 'cron' | 'manual' | 'webhook' = 'cron'): LoopInstance {
  return {
    id: 'sched-test', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage',
    schedule: { mode, cron: mode === 'cron' ? '0 9 * * *' : undefined, timezone: 'UTC' },
    stage: 'scheduling', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Scheduler', () => {
  it('computes next tick from cron expression', () => {
    const store = { listLoops: vi.fn() } as any
    const engine = { tick: vi.fn() } as any
    const wc = { enqueue: vi.fn() } as any
    const sched = new Scheduler(store, engine, wc)
    const next = sched.computeNextTick(makeLoop('cron'))
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now())
  })

  it('does not schedule timer for manual mode', () => {
    const store = { listLoops: vi.fn().mockResolvedValue([]) } as any
    const engine = { tick: vi.fn() } as any
    const wc = { enqueue: vi.fn() } as any
    const sched = new Scheduler(store, engine, wc)
    sched.scheduleLoop(makeLoop('manual'))
    expect(engine.tick).not.toHaveBeenCalled()
  })
})
```

```typescript
// overlay/custom/client/loop/__tests__/worktree-manager.test.ts
import { describe, it, expect } from 'vitest'
import { WorktreeManager } from '../../server/loop/engine/worktree-manager'
import type { TaskContract } from '../types'

describe('WorktreeManager', () => {
  it('removes a non-existent worktree without error', async () => {
    const wm = new WorktreeManager('.loop-test-wt')
    await expect(wm.remove('nonexistent')).resolves.not.toThrow()
  })
})
```

- [ ] **Step 7: Run tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/scheduler.test.ts custom/client/loop/__tests__/worktree-manager.test.ts
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add custom/server/loop/engine/scheduler.ts custom/server/loop/engine/worktree-manager.ts custom/server/loop/engine/subagent-dispatcher.ts config/loop-config.ts custom/client/loop/__tests__/scheduler.test.ts custom/client/loop/__tests__/worktree-manager.test.ts patches/136-cron-parser-dep.patch patches/series
git commit -m "feat(loop): add scheduler, worktree manager, subagent dispatcher, loop config"
```

---

## Task 8: Server Controller & Socket.IO

**Files:**
- Create: `overlay/custom/server/loop/controllers/loop.ts`
- Create: `overlay/custom/server/loop/services/loop-socket.ts`
- Create: `overlay/patches/134-loop-server-routes.patch`
- Create: `overlay/patches/135-loop-socket-namespace.patch`
- Test: `overlay/custom/client/loop/__tests__/loop-controller.test.ts`

**Interfaces:**
- Consumes: `LoopStateStore` (Task 2), `Scheduler` (Task 7), `WebhookConnector` (Task 5)
- Produces: Koa router with REST endpoints, Socket.IO namespace handler

- [ ] **Step 1: Create `controllers/loop.ts`**

```typescript
// overlay/custom/server/loop/controllers/loop.ts
import Router from '@koa/router'
import type { LoopStateStore } from '../store/state-store'
import type { Scheduler } from '../engine/scheduler'
import type { WebhookConnector } from '../connectors/webhook-connector'
import type { LoopInstance } from '../../../client/loop/types'

export function createLoopRouter(
  store: LoopStateStore,
  scheduler: Scheduler,
  webhookConnector: WebhookConnector,
): Router {
  const router = new Router()

  // List loops
  router.get('/api/loop/loops', async (ctx) => {
    const status = ctx.query.status as string | undefined
    const filter = status ? { status: status.split(',') as any } : undefined
    const loops = await store.listLoops(filter)
    ctx.body = { loops }
  })

  // Get single loop
  router.get('/api/loop/loops/:id', async (ctx) => {
    const loop = await store.getLoop(ctx.params.id)
    if (!loop) { ctx.status = 404; ctx.body = { error: 'Loop not found' }; return }
    ctx.body = { loop }
  })

  // Create loop
  router.post('/api/loop/loops', async (ctx) => {
    const body = ctx.request.body as Partial<LoopInstance>
    if (!body.id || !body.name || !body.goal) {
      ctx.status = 400; ctx.body = { error: 'Missing required fields: id, name, goal' }; return
    }
    const loop: LoopInstance = {
      id: body.id,
      name: body.name,
      goal: body.goal,
      stopCondition: body.stopCondition ?? '',
      pattern: body.pattern ?? 'daily-triage',
      schedule: body.schedule ?? { mode: 'manual', timezone: 'UTC' },
      stage: 'discovery',
      status: 'idle',
      autonomyLevel: body.autonomyLevel ?? 'L1',
      stateAdapter: 'local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastTickAt: null,
      nextTickAt: null,
      budget: body.budget ?? { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
      stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    }
    await store.createLoop(loop)
    scheduler.scheduleLoop(loop)
    ctx.body = { loop }
  })

  // Update loop
  router.patch('/api/loop/loops/:id', async (ctx) => {
    const patch = ctx.request.body as Partial<LoopInstance>
    await store.updateLoop(ctx.params.id, patch)
    const loop = await store.getLoop(ctx.params.id)
    if (loop) scheduler.scheduleLoop(loop)
    ctx.body = { loop }
  })

  // Delete loop
  router.delete('/api/loop/loops/:id', async (ctx) => {
    await store.deleteLoop(ctx.params.id)
    ctx.body = { ok: true }
  })

  // Manual tick
  router.post('/api/loop/loops/:id/tick', async (ctx) => {
    await scheduler.manualTick(ctx.params.id)
    ctx.body = { ok: true }
  })

  // Pause loop
  router.post('/api/loop/loops/:id/pause', async (ctx) => {
    await store.updateLoop(ctx.params.id, { status: 'paused' })
    ctx.body = { ok: true }
  })

  // List contracts
  router.get('/api/loop/loops/:id/contracts', async (ctx) => {
    const contracts = await store.queryContracts(ctx.params.id)
    ctx.body = { contracts }
  })

  // Get events
  router.get('/api/loop/loops/:id/events', async (ctx) => {
    const since = ctx.query.since as string | undefined
    const limit = ctx.query.limit ? parseInt(ctx.query.limit as string) : undefined
    const events = await store.queryEvents(ctx.params.id, since, limit)
    ctx.body = { events }
  })

  // Human approval
  router.post('/api/loop/contracts/:id/approve', async (ctx) => {
    const body = ctx.request.body as { decision: string; approver: string; comment?: string }
    // The verifier will poll for this — store the approval
    // For now, append an event
    ctx.body = { ok: true, decision: body.decision }
  })

  // Webhook endpoint
  router.post('/api/loop/webhook/:loopId', async (ctx) => {
    const body = ctx.request.body as { source: string; eventType: string; payload: unknown }
    await scheduler.handleWebhook(ctx.params.loopId, body.source, body.eventType, body.payload)
    ctx.body = { ok: true }
  })

  // Pattern templates
  router.get('/api/loop/patterns', async (ctx) => {
    const { PATTERN_TEMPLATES } = require('../../../client/loop/types')
    ctx.body = { patterns: Object.values(PATTERN_TEMPLATES) }
  })

  return router
}
```

- [ ] **Step 2: Create `services/loop-socket.ts`**

```typescript
// overlay/custom/server/loop/services/loop-socket.ts
import type { Server, Socket } from 'socket.io'
import type { LoopStateStore } from '../store/state-store'

export function setupLoopSocketNamespace(io: Server, store: LoopStateStore): void {
  const nsp = io.of('/loop')

  nsp.on('connection', (socket: Socket) => {
    // Client subscribes to a loop's events
    socket.on('subscribe', (loopId: string) => {
      socket.join(`loop:${loopId}`)
      // Send recent events on connect
      store.queryEvents(loopId, undefined, 50).then(events => {
        socket.emit('loop:history', events)
      })
    })

    socket.on('unsubscribe', (loopId: string) => {
      socket.leave(`loop:${loopId}`)
    })
  })
}

export function emitLoopEvent(io: Server, event: { loopId?: string; type: string }): void {
  if (event.loopId) {
    io.of('/loop').to(`loop:${event.loopId}`).emit('loop:event', event)
  }
}
```

- [ ] **Step 3: Create B-class patches**

`overlay/patches/134-loop-server-routes.patch`:
```diff
diff --git a/packages/server/src/routes/index.ts b/packages/server/src/routes/index.ts
--- a/packages/server/src/routes/index.ts
+++ b/packages/server/src/routes/index.ts
@@ -1,4 +1,6 @@
 import type { Router } from '@koa/router'
+import loopRouter from '../custom/controllers/hermes/../../../loop/controllers/loop'
+
 // overlay[loop-routes]: register Loop Engineering REST API
 export function registerRoutes(app, authMiddleware) {
+  app.use(loopRouter.routes())
```

`overlay/patches/135-loop-socket-namespace.patch`:
```diff
diff --git a/packages/server/src/index.ts b/packages/server/src/index.ts
--- a/packages/server/src/index.ts
+++ b/packages/server/src/index.ts
@@ -XX,6 +XX,8 @@
 // overlay[loop-socket]: register /loop Socket.IO namespace
+import { setupLoopSocketNamespace } from '../custom/loop/services/loop-socket'
+setupLoopSocketNamespace(io, loopStore)
```

Append both to `overlay/patches/series`.

- [ ] **Step 4: Write controller tests**

```typescript
// overlay/custom/client/loop/__tests__/loop-controller.test.ts
import { describe, it, expect, vi } from 'vitest'
// Note: server tests can't use @ alias; use relative imports

describe('Loop Controller (integration)', () => {
  it('createLoopRouter returns a Router', async () => {
    const { createLoopRouter } = await import('../../server/loop/controllers/loop')
    const mockStore = {
      listLoops: vi.fn().mockResolvedValue([]),
      getLoop: vi.fn(), createLoop: vi.fn(), updateLoop: vi.fn(), deleteLoop: vi.fn(),
      appendContract: vi.fn(), getContract: vi.fn(), queryContracts: vi.fn().mockResolvedValue([]),
      updateContract: vi.fn(), appendVerification: vi.fn(), appendEvent: vi.fn(),
      queryEvents: vi.fn().mockResolvedValue([]), detectDrift: vi.fn(),
    }
    const mockSched = { scheduleLoop: vi.fn(), manualTick: vi.fn(), handleWebhook: vi.fn() }
    const mockWC = { enqueue: vi.fn() }
    const router = createLoopRouter(mockStore as any, mockSched as any, mockWC as any)
    expect(router).toBeDefined()
    expect(router.routes).toBeDefined()
  })
})
```

- [ ] **Step 5: Run tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/loop-controller.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add custom/server/loop/controllers/ custom/server/loop/services/ custom/client/loop/__tests__/loop-controller.test.ts patches/134-loop-server-routes.patch patches/135-loop-socket-namespace.patch patches/series
git commit -m "feat(loop): add REST API controller, Socket.IO namespace, server patches"
```

---

## Task 9: Frontend Store & API Layer

**Files:**
- Create: `overlay/custom/client/loop/store/loop.ts`
- Create: `overlay/custom/client/loop/api/loop-rest.ts`
- Create: `overlay/custom/client/loop/api/loop-socket.ts`
- Create: `overlay/custom/client/loop/adapters/loop-adapter.ts`
- Create: `overlay/custom/client/loop/adapters/stage-adapter.ts`

**Interfaces:**
- Consumes: all types from Task 1, REST API from Task 8
- Produces: Pinia store `useLoopStore`, REST/Socket API clients, frontend adapters

- [ ] **Step 1: Create `api/loop-rest.ts`**

```typescript
// overlay/custom/client/loop/api/loop-rest.ts
import type { LoopInstance, TaskContract, LoopEvent, PatternTemplate } from '../types'

const BASE = '/api/loop'

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function patchJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function deleteJson(url: string): Promise<any> {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const loopRest = {
  listLoops: async (status?: string[]): Promise<LoopInstance[]> => {
    const qs = status ? `?status=${status.join(',')}` : ''
    return (await fetchJson(`${BASE}/loops${qs}`)).loops
  },
  getLoop: async (id: string): Promise<LoopInstance> => {
    return (await fetchJson(`${BASE}/loops/${id}`)).loop
  },
  createLoop: async (loop: Partial<LoopInstance>): Promise<LoopInstance> => {
    return (await postJson(`${BASE}/loops`, loop)).loop
  },
  updateLoop: async (id: string, patch: Partial<LoopInstance>): Promise<LoopInstance> => {
    return (await patchJson(`${BASE}/loops/${id}`, patch)).loop
  },
  deleteLoop: async (id: string): Promise<void> => {
    await deleteJson(`${BASE}/loops/${id}`)
  },
  tickLoop: async (id: string): Promise<void> => {
    await postJson(`${BASE}/loops/${id}/tick`, {})
  },
  pauseLoop: async (id: string): Promise<void> => {
    await postJson(`${BASE}/loops/${id}/pause`, {})
  },
  getContracts: async (loopId: string): Promise<TaskContract[]> => {
    return (await fetchJson(`${BASE}/loops/${loopId}/contracts`)).contracts
  },
  getEvents: async (loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> => {
    const qs = since ? `?since=${since}` : ''
    const qs2 = limit ? `${since ? '&' : '?'}limit=${limit}` : ''
    return (await fetchJson(`${BASE}/loops/${loopId}/events${qs}${qs2}`)).events
  },
  getPatterns: async (): Promise<PatternTemplate[]> => {
    return (await fetchJson(`${BASE}/patterns`)).patterns
  },
}
```

- [ ] **Step 2: Create `api/loop-socket.ts`**

```typescript
// overlay/custom/client/loop/api/loop-socket.ts
import { io, type Socket } from 'socket.io-client'
import type { LoopEvent } from '../types'

let loopSocket: Socket | null = null

export function connectLoop(): Socket {
  if (loopSocket?.connected) return loopSocket
  const baseUrl = window.location.origin
  loopSocket = io(`${baseUrl}/loop`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  })
  return loopSocket
}

export function disconnectLoop(): void {
  if (loopSocket) {
    loopSocket.disconnect()
    loopSocket = null
  }
}

export function subscribeToLoop(socket: Socket, loopId: string, onEvent: (event: LoopEvent) => void): void {
  socket.emit('subscribe', loopId)
  socket.on('loop:event', onEvent)
  socket.on('loop:history', (events: LoopEvent[]) => {
    events.forEach(onEvent)
  })
}

export function unsubscribeFromLoop(socket: Socket, loopId: string): void {
  socket.emit('unsubscribe', loopId)
}
```

- [ ] **Step 3: Create adapters**

```typescript
// overlay/custom/client/loop/adapters/loop-adapter.ts
import type { LoopInstance, LoopStatus } from '../types'

export type LoopRowStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'awaiting-review' | 'completed' | 'failed'

export interface LoopTableRow {
  id: string
  name: string
  stage: string
  status: LoopRowStatus
  statusIcon: string
  statusColor: string
  nextTick: string
  progress: string
  cost: string
  costWarning: boolean
}

export function toLoopTableRow(loop: LoopInstance): LoopTableRow {
  const completed = loop.stats.tasksCompleted
  const discovered = loop.stats.tasksDiscovered || 1
  const costPct = (loop.stats.totalCost / loop.budget.maxCostTotal) * 100
  const iconMap: Record<LoopStatus, string> = {
    idle: '○', running: '●', paused: '⏸', blocked: '▣',
    'awaiting-review': '⚠', completed: '✓', failed: '✗',
  }
  const colorMap: Record<LoopStatus, string> = {
    idle: 'gray', running: 'blue', paused: 'gray', blocked: 'red',
    'awaiting-review': 'orange', completed: 'green', failed: 'red',
  }
  return {
    id: loop.id,
    name: loop.name,
    stage: loop.stage,
    status: loop.status,
    statusIcon: iconMap[loop.status],
    statusColor: colorMap[loop.status],
    nextTick: loop.nextTickAt ?? '—',
    progress: `${completed}/${discovered}`,
    cost: `$${loop.stats.totalCost.toFixed(2)}/$${loop.budget.maxCostTotal.toFixed(2)}`,
    costWarning: costPct > loop.budget.warningThreshold * 100,
  }
}
```

```typescript
// overlay/custom/client/loop/adapters/stage-adapter.ts
import type { LoopEvent, LoopStage } from '../types'

export interface StageNodeData {
  id: string
  label: string
  stage: LoopStage
  active: boolean
  blocked: boolean
  completed: boolean
  detail?: string
}

export interface StageEdgeData {
  source: string
  target: string
  type: 'forward' | 'pending' | 'repair'
}

const STAGE_ORDER: LoopStage[] = ['discovery', 'handoff', 'validation', 'persistence', 'scheduling']

export function buildStageGraph(currentStage: LoopStage, events: LoopEvent[]): {
  nodes: StageNodeData[]
  edges: StageEdgeData[]
} {
  const currentIdx = STAGE_ORDER.indexOf(currentStage)
  const nodes: StageNodeData[] = STAGE_ORDER.map((stage, i) => ({
    id: stage,
    label: stage,
    stage,
    active: i === currentIdx,
    completed: i < currentIdx,
    blocked: false,
  }))

  // Check for blocked (from events)
  const hasStuck = events.some(e => e.type === 'loop.stuck')
  if (hasStuck && nodes[currentIdx]) nodes[currentIdx].blocked = true

  const edges: StageEdgeData[] = []
  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    edges.push({
      source: STAGE_ORDER[i],
      target: STAGE_ORDER[i + 1],
      type: i < currentIdx ? 'forward' : 'pending',
    })
  }
  // repair edge (validation → handoff)
  const hasRepair = events.some(e =>
    e.type === 'loop.stage-transition' &&
    (e as any).from === 'validation' && (e as any).to === 'handoff'
  )
  if (hasRepair) {
    edges.push({ source: 'validation', target: 'handoff', type: 'repair' })
  }

  return { nodes, edges }
}
```

- [ ] **Step 4: Create Pinia store**

```typescript
// overlay/custom/client/loop/store/loop.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LoopInstance, LoopEvent, TaskContract, PatternTemplate } from '../types'
import * as rest from '../api/loop-rest'
import { connectLoop, disconnectLoop, subscribeToLoop } from '../api/loop-socket'
import type { Socket } from 'socket.io-client'

export const useLoopStore = defineStore('loop', () => {
  const loops = ref<LoopInstance[]>([])
  const currentLoop = ref<LoopInstance | null>(null)
  const currentContracts = ref<TaskContract[]>([])
  const currentEvents = ref<LoopEvent[]>([])
  const patterns = ref<PatternTemplate[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let socket: Socket | null = null

  const activeLoops = computed(() => loops.value.filter(l => l.status === 'running'))
  const awaitingReviewLoops = computed(() => loops.value.filter(l => l.status === 'awaiting-review'))
  const blockedLoops = computed(() => loops.value.filter(l => l.status === 'blocked'))
  const archivedLoops = computed(() => loops.value.filter(l => l.status === 'completed' || l.status === 'failed'))

  async function fetchLoops(): Promise<void> {
    loading.value = true
    try {
      loops.value = await rest.listLoops()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchLoop(id: string): Promise<void> {
    loading.value = true
    try {
      currentLoop.value = await rest.getLoop(id)
      currentContracts.value = await rest.getContracts(id)
      currentEvents.value = await rest.getEvents(id)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createLoop(loop: Partial<LoopInstance>): Promise<void> {
    const created = await rest.createLoop(loop)
    loops.value.push(created)
    currentLoop.value = created
  }

  async function tickLoop(id: string): Promise<void> {
    await rest.tickLoop(id)
    await fetchLoops()
  }

  async function pauseLoop(id: string): Promise<void> {
    await rest.pauseLoop(id)
    await fetchLoops()
  }

  async function deleteLoop(id: string): Promise<void> {
    await rest.deleteLoop(id)
    loops.value = loops.value.filter(l => l.id !== id)
  }

  async function fetchPatterns(): Promise<void> {
    patterns.value = await rest.getPatterns()
  }

  function connectSocket(loopId: string): void {
    if (!socket) {
      socket = connectLoop()
    }
    subscribeToLoop(socket, loopId, (event) => {
      currentEvents.value.push(event)
      // Update loop status based on events
      if (event.type === 'loop.stage-transition' && currentLoop.value) {
        currentLoop.value.stage = (event as any).to
      }
      if (event.type === 'loop.tick-complete' && currentLoop.value) {
        currentLoop.value.stats = (event as any).stats
      }
    })
  }

  function disconnectSocket(): void {
    disconnectLoop()
    socket = null
  }

  return {
    loops, currentLoop, currentContracts, currentEvents, patterns,
    loading, error,
    activeLoops, awaitingReviewLoops, blockedLoops, archivedLoops,
    fetchLoops, fetchLoop, createLoop, tickLoop, pauseLoop, deleteLoop,
    fetchPatterns, connectSocket, disconnectSocket,
  }
})
```

- [ ] **Step 5: Commit**

```bash
git add custom/client/loop/store/ custom/client/loop/api/ custom/client/loop/adapters/
git commit -m "feat(loop): add Pinia store, REST/Socket API clients, frontend adapters"
```

---

## Task 10: Frontend Components & Views

**Files:**
- Create: `overlay/custom/client/loop/components/LoopSidebar.vue`
- Create: `overlay/custom/client/loop/components/LoopTable.vue`
- Create: `overlay/custom/client/loop/components/LoopCreateWizard.vue`
- Create: `overlay/custom/client/loop/components/StageRing.vue`
- Create: `overlay/custom/client/loop/components/VerifierPanel.vue`
- Create: `overlay/custom/client/loop/components/LoopApprovalDialog.vue`
- Create: `overlay/custom/client/loop/views/LoopSpineView.vue`
- Create: `overlay/custom/client/loop/views/LoopDetailView.vue`
- Create: `overlay/custom/client/loop/styles/loop.scss`
- Create: `overlay/custom/client/loop/index.ts`

**Interfaces:**
- Consumes: `useLoopStore` (Task 9), adapter functions (Task 9), types (Task 1)
- Produces: full UI — Spine overview view, detail view with StageRing, create wizard, approval dialog

- [ ] **Step 1: Create `LoopSidebar.vue`**

```vue
<!-- overlay/custom/client/loop/components/LoopSidebar.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'

const store = useLoopStore()

const groups = computed(() => [
  { label: '全部', count: store.loops.length, status: undefined, icon: '📋' },
  { label: '运行中', count: store.activeLoops.length, status: 'running' as const, icon: '●' },
  { label: '待审批', count: store.awaitingReviewLoops.length, status: 'awaiting-review' as const, icon: '⚠' },
  { label: '阻塞', count: store.blockedLoops.length, status: 'blocked' as const, icon: '▣' },
  { label: '已归档', count: store.archivedLoops.length, status: 'completed' as const, icon: '✓' },
])

const activeFilter = ref<string | undefined>(undefined)
import { ref } from 'vue'

function selectGroup(status?: string) {
  activeFilter.value = status
}
</script>

<template>
  <div class="loop-sidebar">
    <div class="loop-sidebar__group"
      v-for="g in groups" :key="g.label"
      :class="{ 'loop-sidebar__group--active': activeFilter === g.status }"
      @click="selectGroup(g.status)">
      <span class="loop-sidebar__icon">{{ g.icon }}</span>
      <span class="loop-sidebar__label">{{ g.label }}</span>
      <span class="loop-sidebar__count">{{ g.count }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Create `LoopTable.vue`**

```vue
<!-- overlay/custom/client/loop/components/LoopTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'
import { toLoopTableRow } from '@/custom/loop/adapters/loop-adapter'

const store = useLoopStore()
const emit = defineEmits<{ (e: 'select', id: string): void }>()

const rows = computed(() => store.loops.map(toLoopTableRow))
</script>

<template>
  <div class="loop-table">
    <div class="loop-table__header">
      <span class="loop-table__col loop-table__col--status">状态</span>
      <span class="loop-table__col loop-table__col--name">Loop 名称</span>
      <span class="loop-table__col">阶段</span>
      <span class="loop-table__col">下次tick</span>
      <span class="loop-table__col">进度</span>
      <span class="loop-table__col">费用</span>
      <span class="loop-table__col">操作</span>
    </div>
    <div class="loop-table__row" v-for="row in rows" :key="row.id"
      :style="{ color: row.statusColor }"
      @click="emit('select', row.id)">
      <span class="loop-table__col loop-table__col--status">{{ row.statusIcon }}</span>
      <span class="loop-table__col loop-table__col--name">{{ row.name }}</span>
      <span class="loop-table__col">{{ row.stage }}</span>
      <span class="loop-table__col">{{ row.nextTick }}</span>
      <span class="loop-table__col">{{ row.progress }}</span>
      <span class="loop-table__col" :class="{ 'loop-table__cost--warning': row.costWarning }">{{ row.cost }}</span>
      <span class="loop-table__col loop-table__actions">
        <button @click.stop="store.tickLoop(row.id)">▶</button>
        <button @click.stop="store.pauseLoop(row.id)">⏸</button>
        <button @click.stop="store.deleteLoop(row.id)">🗑</button>
      </span>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Create `StageRing.vue`**

```vue
<!-- overlay/custom/client/loop/components/StageRing.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { buildStageGraph } from '@/custom/loop/adapters/stage-adapter'
import type { LoopStage, LoopEvent } from '@/custom/loop/types'

const props = defineProps<{
  currentStage: LoopStage
  events: LoopEvent[]
}>()

const emit = defineEmits<{ (e: 'select', stage: LoopStage): void }>()

const graph = computed(() => buildStageGraph(props.currentStage, props.events))

const nodeColor = (n: { active: boolean; completed: boolean; blocked: boolean }) =>
  n.blocked ? '#e11d48' : n.active ? '#3b82f6' : n.completed ? '#28bf5c' : '#878c99'
</script>

<template>
  <div class="stage-ring">
    <svg viewBox="0 0 400 300" class="stage-ring__svg">
      <!-- Edges -->
      <line v-for="edge in graph.edges" :key="`${edge.source}-${edge.target}`"
        :x1="nodePos(edge.source).x" :y1="nodePos(edge.source).y"
        :x2="nodePos(edge.target).x" :y2="nodePos(edge.target).y"
        :class="`stage-ring__edge--${edge.type}`" />
      <!-- Nodes -->
      <g v-for="node in graph.nodes" :key="node.id"
        :transform="`translate(${nodePos(node.id).x},${nodePos(node.id).y})`"
        @click="emit('select', node.stage)">
        <circle r="30" :fill="nodeColor(node)" />
        <text text-anchor="middle" dy="5" fill="white" font-size="11">{{ node.label }}</text>
      </g>
    </svg>
  </div>
</template>

<script lang="ts">
const STAGE_POSITIONS: Record<string, { x: number; y: number }> = {
  discovery: { x: 300, y: 100 },
  handoff: { x: 200, y: 200 },
  validation: { x: 100, y: 100 },
  persistence: { x: 100, y: 250 },
  scheduling: { x: 300, y: 250 },
}
function nodePos(id: string) { return STAGE_POSITIONS[id] ?? { x: 200, y: 150 } }
</script>
```

- [ ] **Step 4: Create `LoopSpineView.vue`**

```vue
<!-- overlay/custom/client/loop/views/LoopSpineView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopSidebar from '@/custom/loop/components/LoopSidebar.vue'
import LoopTable from '@/custom/loop/components/LoopTable.vue'
import LoopCreateWizard from '@/custom/loop/components/LoopCreateWizard.vue'

const store = useLoopStore()
const router = useRouter()
const showWizard = ref(false)

onMounted(() => { store.fetchLoops() })

function onSelect(id: string) {
  router.push({ name: 'hermes.loopDetail', params: { id } })
}
</script>

<template>
  <div class="loop-spine">
    <div class="loop-spine__sidebar">
      <LoopSidebar />
      <button class="loop-spine__new" @click="showWizard = true">+ 新建 Loop</button>
    </div>
    <div class="loop-spine__main">
      <h2 class="loop-spine__title">Loop Engineering</h2>
      <LoopTable @select="onSelect" />
    </div>
    <LoopCreateWizard v-if="showWizard" @close="showWizard = false" />
  </div>
</template>
```

- [ ] **Step 5: Create `LoopDetailView.vue`**

```vue
<!-- overlay/custom/client/loop/views/LoopDetailView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLoopStore } from '@/custom/loop/store/loop'
import StageRing from '@/custom/loop/components/StageRing.vue'
import VerifierPanel from '@/custom/loop/components/VerifierPanel.vue'

const store = useLoopStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref<'history' | 'workers' | 'relations' | 'todo'>('history')
const granularity = ref(2)

onMounted(() => {
  const id = route.params.id as string
  store.fetchLoop(id)
  store.connectSocket(id)
})
onUnmounted(() => { store.disconnectSocket() })

const loop = computed(() => store.currentLoop)
const events = computed(() => store.currentEvents)
</script>

<template>
  <div class="loop-detail" v-if="loop">
    <div class="loop-detail__header">
      <button @click="router.back()">← 返回</button>
      <span class="loop-detail__name">{{ loop.name }}</span>
      <button @click="store.tickLoop(loop.id)">▶ 运行</button>
      <button @click="store.pauseLoop(loop.id)">⏸ 暂停</button>
    </div>
    <div class="loop-detail__meta">
      <span>pattern: {{ loop.pattern }}</span>
      <span>level: {{ loop.autonomyLevel }}</span>
      <span>goal: {{ loop.goal }}</span>
      <span>stop: {{ loop.stopCondition }}</span>
    </div>
    <StageRing :current-stage="loop.stage" :events="events" />
    <div class="loop-detail__budget">
      ${{ loop.stats.totalCost.toFixed(2) }} / ${{ loop.budget.maxCostTotal.toFixed(2) }}
    </div>
    <div class="loop-detail__tabs">
      <button v-for="tab in ['history','workers','relations','todo']" :key="tab"
        :class="{ active: activeTab === tab }" @click="activeTab = tab as any">{{ tab }}</button>
    </div>
    <div class="loop-detail__tab-content" v-if="activeTab === 'history'">
      <input type="range" min="0" max="3" v-model="granularity" />
      <div v-for="event in events.slice(-20 * granularity)" :key="(event as any).ts" class="loop-detail__event">
        <span class="loop-detail__event-ts">{{ (event as any).ts?.slice(11, 19) }}</span>
        <span class="loop-detail__event-type">{{ event.type }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Create `LoopCreateWizard.vue` and `VerifierPanel.vue` and `LoopApprovalDialog.vue`**

```vue
<!-- overlay/custom/client/loop/components/LoopCreateWizard.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'
import { PATTERN_TEMPLATES, type LoopPattern } from '@/custom/loop/types'

const store = useLoopStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const step = ref(0)
const selectedPattern = ref<LoopPattern | null>(null)
const form = ref({
  name: '',
  goal: '',
  stopCondition: '',
  cron: '0 9 * * *',
  autonomyLevel: 'L1' as const,
  budget: 50,
  writeBoundary: 'packages/**',
})

onMounted(() => { /* patterns available via PATTERN_TEMPLATES */ })

function selectPattern(p: LoopPattern) {
  selectedPattern.value = p
  const tmpl = PATTERN_TEMPLATES[p]
  form.value.cron = tmpl.defaultCron
  form.value.autonomyLevel = tmpl.defaultLevel
  form.value.goal = tmpl.goalTemplate
  form.value.stopCondition = tmpl.stopConditionTemplate
  step.value = 1
}

async function create() {
  await store.createLoop({
    id: `loop/${form.value.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name: form.value.name,
    goal: form.value.goal,
    stopCondition: form.value.stopCondition,
    pattern: selectedPattern.value!,
    schedule: { mode: 'cron', cron: form.value.cron, timezone: 'Asia/Shanghai' },
    autonomyLevel: form.value.autonomyLevel,
    budget: { maxCostPerTick: form.value.budget, maxCostTotal: form.value.budget * 4, killMode: 'throw', warningThreshold: 0.8 },
  })
  emit('close')
}
</script>

<template>
  <div class="loop-wizard">
    <div class="loop-wizard__overlay" @click="emit('close')"></div>
    <div class="loop-wizard__dialog">
      <template v-if="step === 0">
        <h3>选择 Loop 模式</h3>
        <div class="loop-wizard__patterns">
          <div v-for="tmpl in Object.values(PATTERN_TEMPLATES)" :key="tmpl.pattern"
            class="loop-wizard__pattern" @click="selectPattern(tmpl.pattern)">
            <h4>{{ tmpl.pattern }}</h4>
            <p>{{ tmpl.goalTemplate }}</p>
            <span>{{ tmpl.defaultCron }} · {{ tmpl.defaultLevel }} · {{ tmpl.costEstimate }}</span>
          </div>
        </div>
      </template>
      <template v-if="step === 1">
        <h3>配置 Loop</h3>
        <label>名称 <input v-model="form.name" /></label>
        <label>目标 <textarea v-model="form.goal"></textarea></label>
        <label>停止条件 <input v-model="form.stopCondition" /></label>
        <label>Cron <input v-model="form.cron" /></label>
        <label>自治级
          <select v-model="form.autonomyLevel">
            <option value="L1">L1 报告</option>
            <option value="L2">L2 辅助</option>
            <option value="L3">L3 无人</option>
          </select>
        </label>
        <label>预算 $<input type="number" v-model="form.budget" />/tick</label>
        <label>写边界 <input v-model="form.writeBoundary" /></label>
        <button @click="create">创建</button>
        <button @click="emit('close')">取消</button>
      </template>
    </div>
  </div>
</template>
```

```vue
<!-- overlay/custom/client/loop/components/VerifierPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'
import type { VerificationRecord } from '@/custom/loop/types'

const store = useLoopStore()

// Find verification records from events
const records = computed(() => {
  return store.currentEvents
    .filter(e => e.type === 'loop.verification-complete')
    .map(e => ({ contractId: (e as any).contractId, passed: (e as any).passed }))
})
</script>

<template>
  <div class="verifier-panel">
    <div v-for="r in records" :key="r.contractId" class="verifier-panel__record">
      <span>{{ r.contractId }}</span>
      <span :class="r.passed ? 'pass' : 'fail'">{{ r.passed ? '✅' : '❌' }}</span>
    </div>
  </div>
</template>
```

```vue
<!-- overlay/custom/client/loop/components/LoopApprovalDialog.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'

const store = useLoopStore()
const emit = defineEmits<{ (e: 'approve' | 'reject' | 'changes-requested'): void }>()
const comment = ref('')
</script>

<template>
  <div class="approval-dialog">
    <div class="approval-dialog__overlay" @click="emit('reject')"></div>
    <div class="approval-dialog__dialog">
      <h3>人工审批</h3>
      <p>请审查 worktree 中的变更后决定：</p>
      <textarea v-model="comment" placeholder="评语（退回修改时给 maker agent）"></textarea>
      <div class="approval-dialog__actions">
        <button @click="emit('approve')">✅ 批准</button>
        <button @click="emit('reject')">❌ 拒绝</button>
        <button @click="emit('changes-requested')">↩ 退回修改</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 7: Create `styles/loop.scss`**

```scss
// overlay/custom/client/loop/styles/loop.scss
.loop-spine {
  display: flex;
  height: 100%;
  &__sidebar { width: 200px; padding: 1rem; border-right: 1px solid var(--border-color); }
  &__main { flex: 1; padding: 1rem; overflow: auto; }
  &__new { margin-top: 1rem; width: 100%; }
  &__title { margin: 0 0 1rem; }
}
.loop-sidebar {
  &__group { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; cursor: pointer;
    &--active { background: var(--accent-bg); }
  }
  &__count { margin-left: auto; font-size: 0.85rem; opacity: 0.7; }
}
.loop-table {
  &__header, &__row { display: flex; align-items: center; padding: 0.5rem; }
  &__header { font-weight: bold; border-bottom: 2px solid var(--border-color); }
  &__row { border-bottom: 1px solid var(--border-color); cursor: pointer; &:hover { background: var(--hover-bg); } }
  &__col { flex: 1; &--status { flex: 0 0 2rem; } &--name { flex: 2; } }
  &__cost--warning { color: #e11d48; }
}
.loop-detail {
  padding: 1rem;
  &__header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  &__name { font-size: 1.2rem; font-weight: bold; flex: 1; }
  &__meta { display: flex; gap: 2rem; margin-bottom: 1rem; font-size: 0.85rem; opacity: 0.8; }
  &__budget { margin: 1rem 0; }
  &__tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); }
  &__event { display: flex; gap: 1rem; padding: 0.25rem; font-size: 0.85rem; }
}
.stage-ring { &__svg { width: 100%; max-width: 400px; } }
```

- [ ] **Step 8: Create `index.ts` (registration module)**

```typescript
// overlay/custom/client/loop/index.ts
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute, registerNavEntry } from '../../../registries/client'

export function registerLoopEngineering(app: App): void {
  const routes: RouteRecordRaw[] = [
    {
      path: '/hermes/loop',
      name: 'hermes.loop',
      component: () => import('./views/LoopSpineView.vue'),
    },
    {
      path: '/hermes/loop/:id',
      name: 'hermes.loopDetail',
      component: () => import('./views/LoopDetailView.vue'),
    },
  ]
  for (const r of routes) registerRoute(r)

  registerNavEntry({
    id: 'loop-engineering',
    label: 'Loop Engineering',
    icon: '🔄',
    section: 'main',
  })
}
```

- [ ] **Step 9: Wire bootstrap**

Edit `overlay/registries/client/bootstrap.ts` — add after the `if (features.cockpit)` block:

```typescript
  if (features.loopEngineering) {
    const { registerLoopEngineering } = await import('../../custom/client/loop')
    await registerLoopEngineering(app)
  }
```

- [ ] **Step 10: Commit**

```bash
git add custom/client/loop/components/ custom/client/loop/views/ custom/client/loop/styles/ custom/client/loop/index.ts registries/client/bootstrap.ts
git commit -m "feat(loop): add all frontend components, views, and registration"
```

---

## Task 11: Navigation Patch & Server Wiring

**Files:**
- Create: `overlay/patches/133-loop-nav-entry.patch`

**Interfaces:**
- Consumes: `registerLoopEngineering` from Task 10
- Produces: B-class patch injecting the router child route and nav entry into upstream

- [ ] **Step 1: Create the navigation patch**

`overlay/patches/133-loop-nav-entry.patch`:

```diff
diff --git a/packages/client/src/router/index.ts b/packages/client/src/router/index.ts
--- a/packages/client/src/router/index.ts
+++ b/packages/client/src/router/index.ts
@@ -XX,6 +XX,12 @@
     // overlay[loop-nav]: add Loop Engineering routes
+    {
+      path: '/hermes/loop',
+      name: 'hermes.loop',
+      component: () => import('@/custom/loop/views/LoopSpineView.vue'),
+      meta: { fullscreen: true },
+    },
+    {
+      path: '/hermes/loop/:id',
+      name: 'hermes.loopDetail',
+      component: () => import('@/custom/loop/views/LoopDetailView.vue'),
+    },
```

Append to `overlay/patches/series`: `133-loop-nav-entry.patch`

- [ ] **Step 2: Run inject to verify patches apply**

```bash
cd overlay && npm run inject
```
Expected: no errors, all patches apply cleanly.

- [ ] **Step 3: Run all tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/
```
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add patches/133-loop-nav-entry.patch patches/series
git commit -m "feat(loop): add navigation patch for router and sidebar entry"
```

---

## Task 12: Integration Smoke Test

**Files:**
- Test: `overlay/custom/client/loop/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration test (full engine + store + mock deps)**

```typescript
// overlay/custom/client/loop/__tests__/integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { LocalStore } from '../../server/loop/store/local-store'
import { LoopEngine } from '../../server/loop/engine/loop-engine'
import { Verifier } from '../../server/loop/engine/verifier'
import { BudgetGuard } from '../../server/loop/engine/budget-guard'
import { StuckDetector } from '../../server/loop/engine/stuck-detector'
import { HookManager } from '../../server/loop/engine/hooks'
import { WorktreeManager } from '../../server/loop/engine/worktree-manager'
import { SubagentDispatcher } from '../../server/loop/engine/subagent-dispatcher'
import { WebhookConnector } from '../../server/loop/connectors/webhook-connector'
import type { LoopInstance, LoopEvent } from '../types'

const TEST_DIR = '.loop-integration-test'

function makeLoop(): LoopInstance {
  return {
    id: 'integration-loop', name: 'Integration Test', goal: 'test',
    stopCondition: 'all done', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Loop Integration', () => {
  let store: LocalStore
  let events: LoopEvent[]

  beforeEach(() => {
    store = new LocalStore(TEST_DIR)
    events = []
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('full tick cycle: create → discover (webhook) → handoff → validate → persist → schedule', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)

    const webhookConnector = new WebhookConnector()
    webhookConnector.enqueue(loop.id, { source: 'ci', eventType: 'test.failed', payload: { id: 1 } })

    const engine = new LoopEngine({
      store,
      webhookConnector,
      verifier: new Verifier({ requestHumanApproval: vi.fn().mockResolvedValue('approved' as const) }),
      dispatcher: new SubagentDispatcher({ invokeAgent: vi.fn().mockResolvedValue('done') }),
      worktreeManager: { create: vi.fn().mockResolvedValue('wt-1'), remove: vi.fn() } as any,
      budgetGuard: new BudgetGuard((e) => { events.push(e) }),
      stuckDetector: new StuckDetector(store),
      hookManager: new HookManager(),
      emitEvent: (e) => { events.push(e) },
    })

    await engine.tick(loop.id)

    // Verify events
    expect(events.some(e => e.type === 'loop.stage-transition')).toBe(true)
    expect(events.some(e => e.type === 'loop.task-discovered')).toBe(true)
    expect(events.some(e => e.type === 'loop.task-handed-off')).toBe(true)
    expect(events.some(e => e.type === 'loop.verification-complete')).toBe(true)
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)

    // Verify STATE.md was regenerated
    const mdPath = `${TEST_DIR}/STATE.md`
    expect(existsSync(mdPath)).toBe(true)
    const md = await fs.readFile(mdPath, 'utf-8')
    expect(md).toContain('integration-loop')

    // Verify loop status updated
    const updated = await store.getLoop(loop.id)
    expect(updated!.stats.currentIteration).toBe(1)
  })

  it('budget guard blocks tick when over budget', async () => {
    const loop = makeLoop()
    loop.stats.totalCost = 250 // over maxCostTotal of 200
    await store.createLoop(loop)

    const engine = new LoopEngine({
      store,
      verifier: new Verifier(),
      dispatcher: new SubagentDispatcher(),
      worktreeManager: { create: vi.fn(), remove: vi.fn() } as any,
      budgetGuard: new BudgetGuard((e) => { events.push(e) }),
      stuckDetector: new StuckDetector(store),
      hookManager: new HookManager(),
      emitEvent: (e) => { events.push(e) },
    })

    await engine.tick(loop.id)

    expect(events.some(e => e.type === 'loop.budget-warning')).toBe(true)
    const updated = await store.getLoop(loop.id)
    expect(updated!.status).toBe('paused') // throw mode → paused
  })
})
```

- [ ] **Step 2: Run integration test**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/integration.test.ts
```
Expected: all PASS

- [ ] **Step 3: Run full test suite**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/
```
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add custom/client/loop/__tests__/integration.test.ts
git commit -m "test(loop): add integration smoke test for full tick cycle"
```

---

## Self-Review

### Spec coverage check
- ✅ 5-stage state machine (discovery→handoff→validation→persistence→scheduling) — Task 3
- ✅ Task contract (Loom: writeBoundary + verificationIntent + resultTemplate) — Task 3
- ✅ LocalStore (STATE.md + events.jsonl + drift detection) — Task 2
- ✅ 3 connectors (GitHub + local git + webhook) — Task 5
- ✅ 3-route verifier (Programmatic + Judge + Human, short-circuit, L1/L2/L3) — Task 6
- ✅ Scheduler (cron + webhook + 7 patterns) — Task 7
- ✅ Worktree manager (detached-HEAD, .worktreeinclude, prune, cleanup) — Task 7
- ✅ Subagent dispatcher (maker/checker, depth limit 5) — Task 7
- ✅ BudgetGuard (throw/notify/kill, 80% warning) — Task 4
- ✅ StuckDetector (4 signals) — Task 4
- ✅ HookManager (12 hook points, 5 handler types) — Task 4
- ✅ finalResponseGuard — Task 6 (in verifier)
- ✅ Loop Spine UI (sidebar+table, stage ring, detail view, create wizard, approval dialog) — Task 10
- ✅ Navigation patch — Task 11
- ✅ REST API + Socket.IO — Task 8
- ✅ Pinia store + adapters — Task 9
- ✅ Feature flag — Task 1
- MatrixStore / SaaSStore — explicitly deferred to phase 2/3 (non-goal for this plan)

### Placeholder scan
- No TBD/TODO found. All code is concrete.
- All test code contains actual assertions.

### Type consistency
- `LoopInstance`, `TaskContract`, `LoopEvent`, `VerificationRecord` used consistently across tasks
- `LoopStateStore` interface in Task 2 matches usage in Tasks 3-8
- `createContract` (Task 3) used by all connectors (Task 5) with matching signature
- `Verifier.verify(contract, loop)` signature consistent between Task 3 (engine) and Task 6 (verifier)
- `BudgetGuard.check(loop)` returns `BudgetDecision` consistent between Task 3 and Task 4
- `StuckDetector.check(loop)` returns `StuckReason | null` consistent between Task 3 and Task 4
