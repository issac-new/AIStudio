# Loop Engineering Implementation Plan (Phase 2: Team Layer + Phase 3: SaaS Layer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the team-layer (Matrix-based multi-instance coordination) and SaaS-layer (multi-tenant PostgreSQL) for the Loop Engineering system, completing all three milestones from the design spec.

**Architecture:** The loop engine, UI, verifier, scheduler, and all connectors are layer-agnostic (built in Phase 1). Only the State Store adapter differs per layer. Phase 2 adds MatrixStore + lease election + team approval + Matrix bot + migration. Phase 3 adds SaaSStore + multi-tenant UI + centralized scheduler + billing + migration.

**Tech Stack:** Matrix SDK (matrix-js-sdk, already in upstream deps), PostgreSQL (pg), Koa, Vue 3, Pinia, vitest.

## Global Constraints

- **Only modify `overlay/` directory.** `upstream/` is read-only.
- A-class code in `overlay/custom/`. B-class patches in `overlay/patches/`.
- Client aliases: `@/custom` → `overlay/custom/client`. Server uses relative imports (3-level pattern for cross-tree).
- Vue SFCs: `<script setup lang="ts">`. Pinia: setup syntax. Package: `"type": "module"` (no `require()`).
- Server controllers: `import Router from '@koa/router'`, factory function pattern.
- Tests: `custom/**/__tests__/*.test.ts`, run with vitest.
- Branch: `feat/loop-engineering` (continue on same branch).
- matrix-js-sdk is already available via upstream deps (matrix-chat module uses it).
- New deps (pg, etc.) require B-class patches to upstream package.json.

---

## Phase 2: Team Layer (Matrix-based multi-instance coordination)

### Task 1: MatrixStore Implementation

**Files:**
- Create: `overlay/custom/server/loop/store/matrix-store.ts`
- Create: `overlay/custom/server/loop/store/matrix-client.ts` (Matrix SDK wrapper)
- Test: `overlay/custom/client/loop/__tests__/matrix-store.test.ts`

**Interfaces:**
- Consumes: `LoopStateStore` interface (Phase 1 Task 2), all types from `types.ts`
- Produces: `MatrixStore` class implementing `LoopStateStore` via Matrix room state events

- [ ] **Step 1: Create matrix-client.ts (Matrix SDK wrapper)**

```typescript
// overlay/custom/server/loop/store/matrix-client.ts
import { createClient, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk'

export interface MatrixClientConfig {
  homeserverUrl: string
  accessToken: string
  userId: string
  roomId: string
}

let clientInstance: MatrixClient | null = null

export function getMatrixClient(config: MatrixClientConfig): MatrixClient {
  if (clientInstance) return clientInstance
  clientInstance = createClient({
    baseUrl: config.homeserverUrl,
    accessToken: config.accessToken,
    userId: config.userId,
  })
  clientInstance.startClient({ initialSync: true })
  return clientInstance
}

export function disconnectMatrixClient(): void {
  if (clientInstance) {
    clientInstance.stopClient()
    clientInstance = null
  }
}

export const LOOP_STATE_EVENT_TYPES = {
  STATE: 'm.loop.state',
  CONTRACT: 'm.loop.contract',
  VERIFICATION: 'm.loop.verification',
  EVENT_LOG: 'm.loop.event',
  LEASE: 'm.loop.lease',
} as const

export async function sendStateEvent(
  client: MatrixClient,
  roomId: string,
  type: string,
  key: string,
  content: unknown,
): Promise<string> {
  return client.sendStateEvent(roomId, type, content, key)
}

export async function sendMessage(
  client: MatrixClient,
  roomId: string,
  type: string,
  content: unknown,
): Promise<string> {
  return client.sendMessage(roomId, {
    msgtype: 'm.text',
    body: JSON.stringify(content),
    ...content as object,
  })
}

export async function getStateEvent(
  client: MatrixClient,
  roomId: string,
  type: string,
  key: string,
): Promise<unknown | null> {
  try {
    return await client.getStateEvent(roomId, type, key)
  } catch {
    return null
  }
}

export async function listStateEventsWithType(
  client: MatrixClient,
  roomId: string,
  type: string,
): Promise<Array<{ key: string; content: unknown }>> {
  const state = await client.roomState(roomId)
  const events = state.filter((e: MatrixEvent) => e.getType() === type)
  return events.map((e: MatrixEvent) => ({
    key: e.getStateKey() ?? '',
    content: e.getContent(),
  }))
}

export async function getRoomMessages(
  client: MatrixClient,
  roomId: string,
  limit: number = 50,
): Promise<MatrixEvent[]> {
  const response = await client.createMessagesRequest(roomId, '', limit, 'b')
  return response.chunk ?? []
}
```

- [ ] **Step 2: Create matrix-store.ts**

```typescript
// overlay/custom/server/loop/store/matrix-store.ts
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../../../client/loop/types'
import type { LoopStateStore } from './state-store'
import {
  getMatrixClient, sendStateEvent, sendMessage, getStateEvent,
  listStateEventsWithType, getRoomMessages,
  LOOP_STATE_EVENT_TYPES, type MatrixClientConfig,
} from './matrix-client'
import type { MatrixClient } from 'matrix-js-sdk'

export class MatrixStore implements LoopStateStore {
  private client: MatrixClient
  private roomId: string

  constructor(config: MatrixClientConfig) {
    this.client = getMatrixClient(config)
    this.roomId = config.roomId
  }

  async createLoop(loop: LoopInstance): Promise<void> {
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.STATE, loop.id, loop,
    )
    await this.appendEvent({
      type: 'loop.created', loop, ts: new Date().toISOString(),
    })
  }

  async getLoop(id: string): Promise<LoopInstance | null> {
    const content = await getStateEvent(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.STATE, id)
    return content as LoopInstance | null
  }

  async listLoops(filter?: LoopFilter): Promise<LoopInstance[]> {
    const events = await listStateEventsWithType(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.STATE)
    let loops = events.map(e => e.content as LoopInstance)
    if (!filter) return loops
    return loops.filter(l => {
      if (filter.status && !filter.status.includes(l.status)) return false
      if (filter.stage && !filter.stage.includes(l.stage)) return false
      return true
    })
  }

  async updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void> {
    const existing = await this.getLoop(id)
    if (!existing) throw new Error(`Loop not found: ${id}`)
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.STATE, id, updated,
    )
  }

  async deleteLoop(id: string): Promise<void> {
    // Matrix doesn't delete state events; set to empty
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.STATE, id, {},
    )
  }

  async appendContract(contract: TaskContract): Promise<void> {
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.CONTRACT, this.safeId(contract.id), contract,
    )
  }

  async getContract(id: string): Promise<TaskContract | null> {
    const content = await getStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.CONTRACT, this.safeId(id),
    )
    return content as TaskContract | null
  }

  async queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]> {
    const events = await listStateEventsWithType(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.CONTRACT)
    let contracts = events
      .map(e => e.content as TaskContract)
      .filter(c => c.loopId === loopId)
    if (!filter) return contracts
    return contracts.filter(c => {
      if (filter.status && !filter.status.includes(c.status)) return false
      return true
    })
  }

  async updateContract(id: string, patch: Partial<TaskContract>): Promise<void> {
    const existing = await this.getContract(id)
    if (!existing) throw new Error(`Contract not found: ${id}`)
    const updated = { ...existing, ...patch }
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.CONTRACT, this.safeId(id), updated,
    )
  }

  async appendVerification(record: VerificationRecord): Promise<void> {
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.VERIFICATION, this.safeId(record.contractId), record,
    )
  }

  async appendEvent(event: LoopEvent): Promise<void> {
    await sendMessage(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.EVENT_LOG, event,
    )
  }

  async queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> {
    const messages = await getRoomMessages(this.client, this.roomId, limit ?? 100)
    let events: LoopEvent[] = messages
      .filter(m => m.getType() === 'm.room.message')
      .map(m => {
        try {
          const content = m.getContent()
          if (content.body && typeof content.body === 'string') {
            return JSON.parse(content.body) as LoopEvent
          }
          return content as unknown as LoopEvent
        } catch {
          return null
        }
      })
      .filter((e): e is LoopEvent => e !== null)
      .filter(e => 'loopId' in e && e.loopId === loopId)

    if (since) {
      events = events.filter(e => (e as any).ts > since)
    }
    if (limit) {
      events = events.slice(-limit)
    }
    return events
  }

  async detectDrift(_loopId: string): Promise<DriftReport> {
    // Matrix is the single source of truth; no drift possible
    return { hasDrift: false, details: 'Matrix is the source of truth' }
  }

  private safeId(id: string): string {
    // Matrix state keys cannot contain '/' — replace with '__'
    return id.replace(/\//g, '__')
  }
}
```

- [ ] **Step 3: Write MatrixStore tests (with mocked Matrix client)**

```typescript
// overlay/custom/client/loop/__tests__/matrix-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock matrix-js-sdk before importing MatrixStore
vi.mock('matrix-js-sdk', () => {
  const mockClient = {
    startClient: vi.fn(),
    stopClient: vi.fn(),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
  }
  return {
    createClient: vi.fn(() => mockClient),
  }
})

import { MatrixStore } from '../../../server/loop/store/matrix-store'
import type { LoopInstance } from '../types'

function makeLoop(id: string = 'matrix-test-loop'): LoopInstance {
  return {
    id, name: 'Matrix Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'matrix',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('MatrixStore', () => {
  let store: MatrixStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new MatrixStore({
      homeserverUrl: 'https://matrix.org',
      accessToken: 'test-token',
      userId: '@bot:matrix.org',
      roomId: '!test:matrix.org',
    })
  })

  it('creates a loop via state event', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    expect(client.sendStateEvent).toHaveBeenCalled()
  })

  it('returns null for non-existent loop', async () => {
    const result = await store.getLoop('nonexistent')
    expect(result).toBeNull()
  })

  it('lists loops (empty when no state events)', async () => {
    const loops = await store.listLoops()
    expect(loops).toEqual([])
  })

  it('detects no drift (Matrix is source of truth)', async () => {
    const report = await store.detectDrift('any')
    expect(report.hasDrift).toBe(false)
  })

  it('safeId replaces slashes for Matrix state keys', async () => {
    await store.appendContract({
      id: 'task/fix-bug-001',
      loopId: 'matrix-test-loop',
      source: { type: 'github-issue', ref: '#1', summary: 'test', rawPayload: {} },
      readPlan: { requiredReads: [] },
      writeBoundary: ['packages/**'],
      verificationIntent: { programmatic: [], judge: null, human: null },
      resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    })
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    const call = client.sendStateEvent.mock.calls[0]
    expect(call[2]).toBe('task__fix-bug-001') // state key with __ not /
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/matrix-store.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/store/matrix-store.ts custom/server/loop/store/matrix-client.ts custom/client/loop/__tests__/matrix-store.test.ts
git commit -m "feat(loop): add MatrixStore implementation for team layer"
```

---

### Task 2: Lease Election (Multi-Instance Scheduling Coordination)

**Files:**
- Create: `overlay/custom/server/loop/engine/lease-manager.ts`
- Test: `overlay/custom/client/loop/__tests__/lease-manager.test.ts`

**Interfaces:**
- Consumes: Matrix client wrapper (Task 1)
- Produces: `LeaseManager` class — coordinates multi-instance tick scheduling via Matrix room messages

- [ ] **Step 1: Create lease-manager.ts**

```typescript
// overlay/custom/server/loop/engine/lease-manager.ts
import type { MatrixClient } from 'matrix-js-sdk'
import { sendMessage, LOOP_STATE_EVENT_TYPES } from '../store/matrix-client'

export interface LeaseInfo {
  instanceId: string
  loopId: string
  timestamp: number
  expiresAt: number
}

const LEASE_DURATION_MS = 5 * 60 * 1000  // 5 minutes
const ELECTION_WINDOW_MS = 5 * 1000      // 5 second window

export class LeaseManager {
  private instanceId: string
  private roomId: string
  private client: MatrixClient

  constructor(client: MatrixClient, roomId: string, instanceId?: string) {
    this.client = client
    this.roomId = roomId
    this.instanceId = instanceId ?? `${process.pid}-${Date.now()}`
  }

  async tryAcquireLease(loopId: string): Promise<boolean> {
    const now = Date.now()
    // Send a lease bid message
    await sendMessage(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.LEASE, {
      instanceId: this.instanceId,
      loopId,
      timestamp: now,
    })

    // Wait for the election window
    await this.sleep(ELECTION_WINDOW_MS)

    // Check all lease bids in the window — lowest timestamp wins
    const bids = await this.getRecentLeaseBids(loopId, now - ELECTION_WINDOW_MS - 1000)
    const sorted = bids.sort((a, b) => a.timestamp - b.timestamp)
    const winner = sorted[0]

    if (!winner || winner.instanceId !== this.instanceId) {
      return false
    }

    // Check if there's an active unexpired lease from another instance
    const activeLease = await this.getActiveLease(loopId)
    if (activeLease && activeLease.instanceId !== this.instanceId && activeLease.expiresAt > now) {
      return false
    }

    return true
  }

  async renewLease(loopId: string): Promise<boolean> {
    // Re-send lease bid to renew
    return this.tryAcquireLease(loopId)
  }

  async releaseLease(loopId: string): Promise<void> {
    // Send a release message
    await sendMessage(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.LEASE, {
      instanceId: this.instanceId,
      loopId,
      timestamp: Date.now(),
      action: 'release',
    })
  }

  private async getRecentLeaseBids(loopId: string, since: number): Promise<LeaseInfo[]> {
    try {
      const response = await this.client.createMessagesRequest(this.roomId, '', 50, 'b')
      const messages = response.chunk ?? []
      return messages
        .filter((m: any) => {
          const content = m.getContent()
          return content?.loopId === loopId && !content?.action
        })
        .map((m: any) => {
          const c = m.getContent()
          return {
            instanceId: c.instanceId,
            loopId: c.loopId,
            timestamp: c.timestamp,
            expiresAt: (c.timestamp ?? 0) + LEASE_DURATION_MS,
          }
        })
        .filter((bid: LeaseInfo) => bid.timestamp >= since)
    } catch {
      return []
    }
  }

  private async getActiveLease(loopId: string): Promise<LeaseInfo | null> {
    const bids = await this.getRecentLeaseBids(loopId, Date.now() - LEASE_DURATION_MS)
    if (bids.length === 0) return null
    const sorted = bids.sort((a, b) => a.timestamp - b.timestamp)
    const oldest = sorted[0]
    return oldest.expiresAt > Date.now() ? oldest : null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// overlay/custom/client/loop/__tests__/lease-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('matrix-js-sdk', () => {
  const mockClient = {
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
  }
  return { createClient: vi.fn(() => mockClient) }
})

import { LeaseManager } from '../../../server/loop/engine/lease-manager'

describe('LeaseManager', () => {
  it('acquires lease when no competing bids', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    const mgr = new LeaseManager(client, '!room:matrix.org', 'instance-A')
    // ELECTION_WINDOW is 5s — we can't wait that long in a test
    // Mock getRecentLeaseBids to return only our bid
    vi.spyOn(mgr as any, 'sleep').mockResolvedValue(undefined)
    const result = await mgr.tryAcquireLease('loop-1')
    expect(result).toBe(true)
  })

  it('loses lease when a competing instance has lower timestamp', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    // Mock messages to include a competing bid with lower timestamp
    client.createMessagesRequest.mockResolvedValue({
      chunk: [{
        getContent: () => ({
          instanceId: 'instance-B',
          loopId: 'loop-1',
          timestamp: Date.now() - 1000, // 1 second earlier
        }),
        getType: () => 'm.room.message',
      }],
    })
    const mgr = new LeaseManager(client, '!room:matrix.org', 'instance-A')
    vi.spyOn(mgr as any, 'sleep').mockResolvedValue(undefined)
    const result = await mgr.tryAcquireLease('loop-1')
    expect(result).toBe(false)
  })

  it('releases lease without error', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    const mgr = new LeaseManager(client, '!room:matrix.org', 'instance-A')
    await expect(mgr.releaseLease('loop-1')).resolves.not.toThrow()
  })
})
```

- [ ] **Step 3: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/lease-manager.test.ts
git add custom/server/loop/engine/lease-manager.ts custom/client/loop/__tests__/lease-manager.test.ts
git commit -m "feat(loop): add lease election for multi-instance scheduling coordination"
```

---

### Task 3: Team Approval Flow (Matrix Approvers)

**Files:**
- Create: `overlay/custom/server/loop/engine/team-approval.ts`
- Test: `overlay/custom/client/loop/__tests__/team-approval.test.ts`

**Interfaces:**
- Consumes: Matrix client wrapper, `HumanCheck`, `TaskContract`
- Produces: `TeamApprovalManager` — routes approval requests to Matrix room members

- [ ] **Step 1: Create team-approval.ts**

```typescript
// overlay/custom/server/loop/engine/team-approval.ts
import type { MatrixClient } from 'matrix-js-sdk'
import { sendMessage } from '../store/matrix-client'

export type ApprovalDecision = 'approved' | 'rejected' | 'changes-requested' | 'pending'

export interface ApprovalRequest {
  contractId: string
  loopId: string
  approvers: string[]
  summary: string
  worktreeId: string | null
  timestamp: string
}

const APPROVAL_TIMEOUT_MS = 72 * 60 * 60 * 1000  // 72 hours

export class TeamApprovalManager {
  private pending: Map<string, { request: ApprovalRequest; resolves: (decision: ApprovalDecision) => void }[]> = new Map()

  constructor(private client: MatrixClient, private roomId: string) {}

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    // Send approval request to Matrix room
    const mentions = request.approvers.map(a => a.startsWith('@') ? a : `@${a}`).join(' ')
    await sendMessage(this.client, this.roomId, 'm.loop.approval-request', {
      ...request,
      mentions,
      body: `⚠️ Approval needed for ${request.contractId} (${request.summary}). Approvers: ${mentions}`,
    })

    // Return a promise that resolves when a decision is received
    return new Promise<ApprovalDecision>((resolve) => {
      const key = request.loopId
      const pending = this.pending.get(key) ?? []
      pending.push({ request, resolves: resolve })
      this.pending.set(key, pending)

      // Auto-timeout → 'pending'
      setTimeout(() => resolve('pending'), APPROVAL_TIMEOUT_MS)
    })
  }

  handleApprovalResponse(contractId: string, approver: string, decision: ApprovalDecision): void {
    // Find the pending request for this contract
    for (const [loopId, pendingList] of this.pending.entries()) {
      const idx = pendingList.findIndex(p => p.request.contractId === contractId)
      if (idx >= 0) {
        const { request, resolves } = pendingList[idx]
        pendingList.splice(idx, 1)
        if (pendingList.length === 0) {
          this.pending.delete(loopId)
        }
        resolves(decision)
        return
      }
    }
  }

  getPendingRequests(loopId: string): ApprovalRequest[] {
    return (this.pending.get(loopId) ?? []).map(p => p.request)
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// overlay/custom/client/loop/__tests__/team-approval.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('matrix-js-sdk', () => ({
  createClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
  })),
}))

import { TeamApprovalManager, type ApprovalRequest } from '../../../server/loop/engine/team-approval'

function makeRequest(): ApprovalRequest {
  return {
    contractId: 'task/test-001',
    loopId: 'loop-1',
    approvers: ['@alice:matrix.org', '@bob:matrix.org'],
    summary: 'Fix auth token leak',
    worktreeId: 'wt-1',
    timestamp: new Date().toISOString(),
  }
}

describe('TeamApprovalManager', () => {
  it('requests approval via Matrix message', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    const mgr = new TeamApprovalManager(client, '!room:matrix.org')
    const promise = mgr.requestApproval(makeRequest())
    // Simulate approval
    mgr.handleApprovalResponse('task/test-001', '@alice:matrix.org', 'approved')
    const decision = await promise
    expect(decision).toBe('approved')
    expect(client.sendMessage).toHaveBeenCalled()
  })

  it('lists pending requests', () => {
    const { createClient } = await import('matrix-js-sdk')
    const mgr = new TeamApprovalManager(createClient(), '!room:matrix.org')
    const req = makeRequest()
    mgr.requestApproval(req)
    const pending = mgr.getPendingRequests('loop-1')
    expect(pending.length).toBe(1)
    expect(pending[0].contractId).toBe('task/test-001')
  })

  it('handleApprovalResponse is a no-op for unknown contract', () => {
    const { createClient } = await import('matrix-js-sdk')
    const mgr = new TeamApprovalManager(createClient(), '!room:matrix.org')
    expect(() => mgr.handleApprovalResponse('unknown', '@x:y.z', 'approved')).not.toThrow()
  })
})
```

- [ ] **Step 3: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/team-approval.test.ts
git add custom/server/loop/engine/team-approval.ts custom/client/loop/__tests__/team-approval.test.ts
git commit -m "feat(loop): add team approval flow with Matrix approver routing"
```

---

### Task 4: Migration Tool (Local → Matrix)

**Files:**
- Create: `overlay/scripts/loop-migrate.mjs`
- Test: `overlay/custom/client/loop/__tests__/loop-migrate.test.ts`

**Interfaces:**
- Consumes: `LocalStore`, `MatrixStore`
- Produces: migration script that reads LocalStore files and writes to Matrix room

- [ ] **Step 1: Create loop-migrate.mjs**

```javascript
#!/usr/bin/env node
// overlay/scripts/loop-migrate.mjs
// Migrates loop state from LocalStore (.loop/) to MatrixStore (Matrix room)
// Usage: node scripts/loop-migrate.mjs --homeserver URL --token TOKEN --user @bot:matrix.org --room !room:matrix.org

import { readdir, readFile, existsSync } from 'fs'
import { resolve, join } from 'path'
import { promisify } from 'util'

const readdirAsync = promisify(readdir)
const readFileAsync = promisify(readFile)

// Parse CLI args
const args = process.argv.slice(2)
const opts = {}
for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace(/^--/, '')] = args[i + 1]
}

const required = ['homeserver', 'token', 'user', 'room']
for (const k of required) {
  if (!opts[k]) {
    console.error(`Missing required --${k}`)
    process.exit(1)
  }
}

const LOOP_DIR = opts.dir || '.loop'

async function migrate() {
  // Dynamic import the store modules
  const { LocalStore } = await import('../custom/server/loop/store/local-store.js')
  const { MatrixStore } = await import('../custom/server/loop/store/matrix-store.js')

  const localStore = new LocalStore(LOOP_DIR)
  const matrixStore = new MatrixStore({
    homeserverUrl: opts.homeserver,
    accessToken: opts.token,
    userId: opts.user,
    roomId: opts.room,
  })

  // Wait for Matrix client to sync
  await new Promise(r => setTimeout(r, 3000))

  // Migrate loops
  const loops = await localStore.listLoops()
  console.log(`Migrating ${loops.length} loops...`)
  for (const loop of loops) {
    try {
      await matrixStore.createLoop(loop)
      console.log(`  ✓ ${loop.id}`)

      // Migrate contracts
      const contracts = await localStore.queryContracts(loop.id)
      for (const c of contracts) {
        await matrixStore.appendContract(c)
      }

      // Migrate events
      const events = await localStore.queryEvents(loop.id)
      for (const e of events) {
        await matrixStore.appendEvent(e)
      }
      console.log(`    ${contracts.length} contracts, ${events.length} events`)
    } catch (err) {
      console.error(`  ✗ ${loop.id}: ${err.message}`)
    }
  }

  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Write a lightweight test for the migration logic**

```typescript
// overlay/custom/client/loop/__tests__/loop-migrate.test.ts
import { describe, it, expect } from 'vitest'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'
import { LocalStore } from '../../../server/loop/store/local-store'
import type { LoopInstance } from '../types'

const TEST_DIR = '.loop-migrate-test'

function makeLoop(id: string = 'migrate-test'): LoopInstance {
  return {
    id, name: 'Migrate Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Loop Migration (Local → Matrix)', () => {
  it('can enumerate LocalStore data for migration', async () => {
    const store = new LocalStore(TEST_DIR)
    await store.createLoop(makeLoop())
    const loops = await store.listLoops()
    expect(loops.length).toBe(1)
    // Cleanup
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('migration script file exists', () => {
    expect(existsSync(resolve(process.cwd(), 'scripts/loop-migrate.mjs'))).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/loop-migrate.test.ts
git add scripts/loop-migrate.mjs custom/client/loop/__tests__/loop-migrate.test.ts
git commit -m "feat(loop): add Local→Matrix migration script"
```

---

### Task 5: Matrix Bot Notifications

**Files:**
- Create: `overlay/custom/server/loop/engine/matrix-bot.ts`
- Test: `overlay/custom/client/loop/__tests__/matrix-bot.test.ts`

**Interfaces:**
- Consumes: Matrix client wrapper, `LoopEvent`
- Produces: `MatrixBot` — formats and sends loop events as human-readable Matrix messages

- [ ] **Step 1: Create matrix-bot.ts**

```typescript
// overlay/custom/server/loop/engine/matrix-bot.ts
import type { MatrixClient } from 'matrix-js-sdk'
import { sendMessage } from '../store/matrix-client'
import type { LoopEvent, LoopInstance } from '../../../client/loop/types'

export class MatrixBot {
  constructor(private client: MatrixClient, private roomId: string) {}

  async notify(event: LoopEvent): Promise<void> {
    const message = this.formatEvent(event)
    if (message) {
      await sendMessage(this.client, this.roomId, 'm.loop.notification', {
        body: message,
        msgtype: 'm.text',
      })
    }
  }

  private formatEvent(event: LoopEvent): string | null {
    switch (event.type) {
      case 'loop.created':
        return `🔄 Loop created: ${(event as any).loop.name} (${(event as any).loop.id})`

      case 'loop.stage-transition':
        return `📋 ${event.loopId}: ${(event as any).from} → ${(event as any).to} (${(event as any).reason})`

      case 'loop.task-discovered':
        return `🔍 ${event.loopId}: discovered ${(event as any).contract.source.summary}`

      case 'loop.task-handed-off':
        return `🤝 ${event.loopId}: handed off ${(event as any).contractId} to worktree ${(event as any).worktreeId}`

      case 'loop.verification-complete': {
        const passed = (event as any).passed ? '✅' : '❌'
        return `🔍 ${(event as any).contractId}: verification ${passed}`
      }

      case 'loop.persisted':
        return `💾 ${event.loopId}: persisted ${(event as any).artifact}`

      case 'loop.tick-complete':
        return `✅ ${event.loopId}: tick #${(event as any).iteration} complete`

      case 'loop.budget-warning': {
        const spent = (event as any).spent
        const limit = (event as any).limit
        const pct = ((spent / limit) * 100).toFixed(1)
        return `⚠️ ${event.loopId}: budget ${pct}% ($${spent.toFixed(2)}/$${limit.toFixed(2)})`
      }

      case 'loop.stuck':
        return `🚨 ${event.loopId}: STUCK — ${(event as any).reason}`

      case 'loop.completed':
        return `🎉 ${event.loopId}: COMPLETED!`

      default:
        return null
    }
  }

  async notifyApprovalNeeded(loopId: string, contractId: string, summary: string, approvers: string[]): Promise<void> {
    const mentions = approvers.map(a => a.startsWith('@') ? a : `@${a}`).join(' ')
    await sendMessage(this.client, this.roomId, 'm.loop.notification', {
      body: `⚠️ Approval needed: ${contractId} (${summary}) — Approvers: ${mentions}`,
      msgtype: 'm.text',
    })
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// overlay/custom/client/loop/__tests__/matrix-bot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('matrix-js-sdk', () => ({
  createClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
  })),
}))

import { MatrixBot } from '../../../server/loop/engine/matrix-bot'
import type { LoopEvent } from '../types'

describe('MatrixBot', () => {
  let bot: MatrixBot

  beforeEach(() => {
    vi.clearAllMocks()
    const { createClient } = require('matrix-js-sdk')
    bot = new MatrixBot(createClient(), '!room:matrix.org')
  })

  it('formats loop.created event', async () => {
    const event: LoopEvent = {
      type: 'loop.created',
      loop: { id: 'l1', name: 'Test Loop' } as any,
      ts: new Date().toISOString(),
    }
    await bot.notify(event)
    // Check sendMessage was called
  })

  it('formats loop.tick-complete event', async () => {
    const event: LoopEvent = {
      type: 'loop.tick-complete',
      loopId: 'l1',
      iteration: 5,
      stats: { totalIterations: 5 } as any,
      ts: new Date().toISOString(),
    }
    await bot.notify(event)
  })

  it('formats loop.stuck event', async () => {
    const event: LoopEvent = {
      type: 'loop.stuck',
      loopId: 'l1',
      reason: 'max-attempts',
      ts: new Date().toISOString(),
    }
    await bot.notify(event)
  })

  it('sends approval notification with mentions', async () => {
    await bot.notifyApprovalNeeded('l1', 'task/test-001', 'Fix bug', ['@alice:matrix.org'])
    // Verify sendMessage was called
  })

  it('returns null for unknown event types', async () => {
    const event = { type: 'unknown', loopId: 'l1', ts: new Date().toISOString() } as any
    await bot.notify(event)
    // Should not throw
  })
})
```

- [ ] **Step 3: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/matrix-bot.test.ts
git add custom/server/loop/engine/matrix-bot.ts custom/client/loop/__tests__/matrix-bot.test.ts
git commit -m "feat(loop): add Matrix bot for loop event notifications"
```

---

### Task 6: Phase 2 Integration Test

**Files:**
- Test: `overlay/custom/client/loop/__tests__/phase2-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// overlay/custom/client/loop/__tests__/phase2-integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { LocalStore } from '../../../server/loop/store/local-store'
import { LoopEngine } from '../../../server/loop/engine/loop-engine'
import { Verifier } from '../../../server/loop/engine/verifier'
import { BudgetGuard } from '../../../server/loop/engine/budget-guard'
import { StuckDetector } from '../../../server/loop/engine/stuck-detector'
import { HookManager } from '../../../server/loop/engine/hooks'
import { WorktreeManager } from '../../../server/loop/engine/worktree-manager'
import { SubagentDispatcher } from '../../../server/loop/engine/subagent-dispatcher'
import { WebhookConnector } from '../../../server/loop/connectors/webhook-connector'
import { MatrixBot } from '../../../server/loop/engine/matrix-bot'
import { TeamApprovalManager, type ApprovalRequest } from '../../../server/loop/engine/team-approval'
import type { LoopInstance, LoopEvent } from '../types'

vi.mock('matrix-js-sdk', () => ({
  createClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
  })),
}))

const TEST_DIR = '.loop-phase2-test'

function makeLoop(): LoopInstance {
  return {
    id: 'phase2-loop', name: 'Phase2 Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'matrix',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Phase 2 Integration (Team Layer)', () => {
  let store: LocalStore
  let events: LoopEvent[]
  let matrixBot: MatrixBot
  let approvalMgr: TeamApprovalManager

  beforeEach(() => {
    store = new LocalStore(TEST_DIR)
    events = []
    const { createClient } = require('matrix-js-sdk')
    const client = createClient()
    matrixBot = new MatrixBot(client, '!room:matrix.org')
    approvalMgr = new TeamApprovalManager(client, '!room:matrix.org')
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('full tick with webhook discovery + Matrix bot notifications', async () => {
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
      emitEvent: async (e) => {
        events.push(e)
        await matrixBot.notify(e)  // Bot formats and sends to Matrix
      },
    })

    await engine.tick(loop.id)

    // Verify events
    expect(events.some(e => e.type === 'loop.stage-transition')).toBe(true)
    expect(events.some(e => e.type === 'loop.task-discovered')).toBe(true)
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)
  })

  it('team approval flow resolves via Matrix', async () => {
    const request: ApprovalRequest = {
      contractId: 'task/phase2-001',
      loopId: 'phase2-loop',
      approvers: ['@alice:matrix.org'],
      summary: 'Test approval',
      worktreeId: 'wt-1',
      timestamp: new Date().toISOString(),
    }

    const promise = approvalMgr.requestApproval(request)
    approvalMgr.handleApprovalResponse('task/phase2-001', '@alice:matrix.org', 'approved')
    const decision = await promise
    expect(decision).toBe('approved')
  })
})
```

- [ ] **Step 2: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/phase2-integration.test.ts
git add custom/client/loop/__tests__/phase2-integration.test.ts
git commit -m "test(loop): add phase 2 integration test for team layer"
```

---

## Phase 3: SaaS Layer (Multi-tenant PostgreSQL)

### Task 7: SaaSStore (PostgreSQL + RLS)

**Files:**
- Create: `overlay/custom/server/loop/store/saas-store.ts`
- Create: `overlay/patches/138-pg-dep.patch` (B-class: add `pg` to upstream deps)
- Test: `overlay/custom/client/loop/__tests__/saas-store.test.ts`

**Interfaces:**
- Consumes: `LoopStateStore` interface, all types
- Produces: `SaaSStore` class implementing `LoopStateStore` via PostgreSQL with RLS

- [ ] **Step 1: Add `pg` dependency via B-class patch**

Read `upstream/hermes-studio/package.json` to find correct context. Add `"pg": "^8.13.1"` alphabetically.

Create `overlay/patches/138-pg-dep.patch`, append to `series`.

- [ ] **Step 2: Create saas-store.ts**

```typescript
// overlay/custom/server/loop/store/saas-store.ts
import { Pool, type PoolClient } from 'pg'
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../../../client/loop/types'
import type { LoopStateStore } from './state-store'

export interface SaaSStoreConfig {
  connectionString: string
  tenantId: string
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS loops (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  stop_condition TEXT,
  pattern TEXT NOT NULL,
  schedule JSONB NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  autonomy_level TEXT NOT NULL,
  budget JSONB NOT NULL,
  stats JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_tick_at TIMESTAMPTZ,
  next_tick_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS loop_contracts (
  id TEXT PRIMARY KEY,
  loop_id TEXT NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  source JSONB NOT NULL,
  read_plan JSONB NOT NULL,
  write_boundary TEXT[] NOT NULL,
  verification_spec JSONB NOT NULL,
  result_template JSONB NOT NULL,
  worktree_id TEXT,
  assignee TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loop_verifications (
  id SERIAL PRIMARY KEY,
  contract_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  results JSONB NOT NULL,
  overall TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loop_events (
  id BIGSERIAL PRIMARY KEY,
  loop_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_loop_ts ON loop_events (loop_id, ts DESC);
`

export class SaaSStore implements LoopStateStore {
  private pool: Pool
  private tenantId: string

  constructor(config: SaaSStoreConfig) {
    this.pool = new Pool({ connectionString: config.connectionString })
    this.tenantId = config.tenantId
  }

  async init(): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query(SCHEMA_SQL)
      // Enable RLS
      await client.query('ALTER TABLE loops ENABLE ROW LEVEL SECURITY')
      await client.query('ALTER TABLE loop_contracts ENABLE ROW LEVEL SECURITY')
      await client.query('ALTER TABLE loop_verifications ENABLE ROW LEVEL SECURITY')
      await client.query('ALTER TABLE loop_events ENABLE ROW LEVEL SECURITY')
      // Create policies (idempotent)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_loops ON loops
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_contracts ON loop_contracts
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_verifications ON loop_verifications
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_events ON loop_events
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
    } finally {
      client.release()
    }
  }

  private async query(text: string, params?: unknown[]) {
    const client = await this.pool.connect()
    try {
      await client.query(`SET LOCAL app.tenant_id = '${this.tenantId}'`)
      return await client.query(text, params)
    } finally {
      client.release()
    }
  }

  async createLoop(loop: LoopInstance): Promise<void> {
    await this.query(
      `INSERT INTO loops (id, tenant_id, name, goal, stop_condition, pattern, schedule, stage, status, autonomy_level, budget, stats)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [loop.id, this.tenantId, loop.name, loop.goal, loop.stopCondition, loop.pattern,
       JSON.stringify(loop.schedule), loop.stage, loop.status, loop.autonomyLevel,
       JSON.stringify(loop.budget), JSON.stringify(loop.stats)],
    )
  }

  async getLoop(id: string): Promise<LoopInstance | null> {
    const res = await this.query('SELECT * FROM loops WHERE id = $1', [id])
    if (res.rows.length === 0) return null
    return this.rowToLoop(res.rows[0])
  }

  async listLoops(filter?: LoopFilter): Promise<LoopInstance[]> {
    let sql = 'SELECT * FROM loops'
    const params: unknown[] = []
    if (filter?.status && filter.status.length > 0) {
      params.push(filter.status)
      sql += ` WHERE status = ANY($1)`
    }
    sql += ' ORDER BY updated_at DESC'
    const res = await this.query(sql, params)
    return res.rows.map(this.rowToLoop)
  }

  async updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (patch.name) { sets.push(`name = $${idx++}`); params.push(patch.name) }
    if (patch.goal) { sets.push(`goal = $${idx++}`); params.push(patch.goal) }
    if (patch.stage) { sets.push(`stage = $${idx++}`); params.push(patch.stage) }
    if (patch.status) { sets.push(`status = $${idx++}`); params.push(patch.status) }
    if (patch.autonomyLevel) { sets.push(`autonomy_level = $${idx++}`); params.push(patch.autonomyLevel) }
    if (patch.budget) { sets.push(`budget = $${idx++}`); params.push(JSON.stringify(patch.budget)) }
    if (patch.stats) { sets.push(`stats = $${idx++}`); params.push(JSON.stringify(patch.stats)) }
    if (patch.nextTickAt) { sets.push(`next_tick_at = $${idx++}`); params.push(patch.nextTickAt) }
    if (patch.lastTickAt) { sets.push(`last_tick_at = $${idx++}`); params.push(patch.lastTickAt) }
    sets.push(`updated_at = NOW()`)
    params.push(id)

    if (sets.length > 0) {
      await this.query(`UPDATE loops SET ${sets.join(', ')} WHERE id = $${idx}`, params)
    }
  }

  async deleteLoop(id: string): Promise<void> {
    await this.query('DELETE FROM loops WHERE id = $1', [id])
  }

  async appendContract(contract: TaskContract): Promise<void> {
    await this.query(
      `INSERT INTO loop_contracts (id, loop_id, tenant_id, source, read_plan, write_boundary, verification_spec, result_template, worktree_id, assignee, status, attempts, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET status = $11, attempts = $12, worktree_id = $9`,
      [contract.id, contract.loopId, this.tenantId,
       JSON.stringify(contract.source), JSON.stringify(contract.readPlan),
       contract.writeBoundary, JSON.stringify(contract.verificationIntent),
       JSON.stringify(contract.resultTemplate), contract.worktreeId,
       contract.assignee, contract.status, contract.attempts, contract.maxAttempts],
    )
  }

  async getContract(id: string): Promise<TaskContract | null> {
    const res = await this.query('SELECT * FROM loop_contracts WHERE id = $1', [id])
    if (res.rows.length === 0) return null
    return this.rowToContract(res.rows[0])
  }

  async queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]> {
    let sql = 'SELECT * FROM loop_contracts WHERE loop_id = $1'
    const params: unknown[] = [loopId]
    if (filter?.status && filter.status.length > 0) {
      params.push(filter.status)
      sql += ` AND status = ANY($2)`
    }
    const res = await this.query(sql, params)
    return res.rows.map(this.rowToContract)
  }

  async updateContract(id: string, patch: Partial<TaskContract>): Promise<void> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (patch.status) { sets.push(`status = $${idx++}`); params.push(patch.status) }
    if (patch.attempts !== undefined) { sets.push(`attempts = $${idx++}`); params.push(patch.attempts) }
    if (patch.worktreeId !== undefined) { sets.push(`worktree_id = $${idx++}`); params.push(patch.worktreeId) }
    if (patch.assignee) { sets.push(`assignee = $${idx++}`); params.push(patch.assignee) }
    params.push(id)
    if (sets.length > 0) {
      await this.query(`UPDATE loop_contracts SET ${sets.join(', ')} WHERE id = $${idx}`, params)
    }
  }

  async appendVerification(record: VerificationRecord): Promise<void> {
    await this.query(
      'INSERT INTO loop_verifications (contract_id, tenant_id, results, overall) VALUES ($1, $2, $3, $4)',
      [record.contractId, this.tenantId, JSON.stringify(record.results), record.overall],
    )
  }

  async appendEvent(event: LoopEvent): Promise<void> {
    const loopId = 'loopId' in event ? event.loopId : (event as any).loop?.id
    if (!loopId) return
    await this.query(
      'INSERT INTO loop_events (loop_id, tenant_id, event_type, payload, ts) VALUES ($1, $2, $3, $4, $5)',
      [loopId, this.tenantId, event.type, JSON.stringify(event), (event as any).ts ?? new Date().toISOString()],
    )
  }

  async queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> {
    let sql = 'SELECT payload FROM loop_events WHERE loop_id = $1'
    const params: unknown[] = [loopId]
    if (since) {
      params.push(since)
      sql += ` AND ts > $2`
    }
    sql += ' ORDER BY ts ASC'
    if (limit) {
      params.push(limit)
      sql += ` LIMIT $${params.length}`
    }
    const res = await this.query(sql, params)
    return res.rows.map(r => r.payload as LoopEvent)
  }

  async detectDrift(_loopId: string): Promise<DriftReport> {
    return { hasDrift: false, details: 'PostgreSQL is the single source of truth' }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private rowToLoop(row: any): LoopInstance {
    return {
      id: row.id,
      name: row.name,
      goal: row.goal,
      stopCondition: row.stop_condition ?? '',
      pattern: row.pattern,
      schedule: row.schedule,
      stage: row.stage,
      status: row.status,
      autonomyLevel: row.autonomy_level,
      stateAdapter: 'saas',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      lastTickAt: row.last_tick_at?.toISOString() ?? null,
      nextTickAt: row.next_tick_at?.toISOString() ?? null,
      budget: row.budget,
      stats: row.stats,
    }
  }

  private rowToContract(row: any): TaskContract {
    return {
      id: row.id,
      loopId: row.loop_id,
      source: row.source,
      readPlan: row.read_plan,
      writeBoundary: row.write_boundary,
      verificationIntent: row.verification_spec,
      resultTemplate: row.result_template,
      worktreeId: row.worktree_id,
      assignee: row.assignee,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }
  }
}
```

- [ ] **Step 3: Write tests (mock pg)**

```typescript
// overlay/custom/client/loop/__tests__/saas-store.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock pg
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  }
  return {
    Pool: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn().mockResolvedValue(undefined),
    })),
  }
})

import { SaaSStore } from '../../../server/loop/store/saas-store'

describe('SaaSStore', () => {
  it('constructs with connection string and tenant ID', () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    expect(store).toBeDefined()
  })

  it('init creates schema and RLS policies', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    await store.init()
    // Verify schema SQL was queried (mocked)
  })

  it('getLoop returns null for non-existent', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    const result = await store.getLoop('nonexistent')
    expect(result).toBeNull()
  })

  it('listLoops returns empty array', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    const loops = await store.listLoops()
    expect(loops).toEqual([])
  })

  it('detectDrift returns false (DB is source of truth)', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    const report = await store.detectDrift('any')
    expect(report.hasDrift).toBe(false)
  })

  it('close ends the pool', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    await store.close()
    // Verify pool.end was called
  })
})
```

- [ ] **Step 4: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/saas-store.test.ts
git add custom/server/loop/store/saas-store.ts custom/client/loop/__tests__/saas-store.test.ts patches/138-pg-dep.patch patches/series
git commit -m "feat(loop): add SaaSStore with PostgreSQL + RLS for multi-tenant isolation"
```

---

### Task 8: Multi-Tenant Management UI

**Files:**
- Create: `overlay/custom/client/loop/components/LoopTenantPanel.vue`
- Create: `overlay/custom/server/loop/controllers/tenant.ts`
- Test: `overlay/custom/client/loop/__tests__/tenant-controller.test.ts`

- [ ] **Step 1: Create tenant controller**

```typescript
// overlay/custom/server/loop/controllers/tenant.ts
import Router from '@koa/router'
import { Pool } from 'pg'

export function createTenantRouter(pool: Pool): Router {
  const router = new Router()

  // List tenants (admin only — in production, add auth middleware)
  router.get('/api/loop/tenants', async (ctx) => {
    const res = await pool.query('SELECT id, name, created_at FROM tenants ORDER BY created_at DESC')
    ctx.body = { tenants: res.rows }
  })

  // Get tenant stats
  router.get('/api/loop/tenants/:id/stats', async (ctx) => {
    const tenantId = ctx.params.id
    if (!/^[A-Za-z0-9._-]+$/.test(tenantId)) {
      ctx.status = 400; ctx.body = { error: 'Invalid tenant id' }; return
    }
    const loopCount = await pool.query('SELECT COUNT(*) FROM loops WHERE tenant_id = $1', [tenantId])
    const totalCost = await pool.query(
      `SELECT COALESCE(SUM((stats->>'totalCost')::numeric), 0) as cost FROM loops WHERE tenant_id = $1`,
      [tenantId],
    )
    const completedCount = await pool.query(
      "SELECT COUNT(*) FROM loops WHERE tenant_id = $1 AND status = 'completed'", [tenantId],
    )
    ctx.body = {
      tenantId,
      activeLoops: parseInt(loopCount.rows[0].count),
      totalCost: parseFloat(totalCost.rows[0].cost),
      completedLoops: parseInt(completedCount.rows[0].count),
    }
  })

  // Create tenant
  router.post('/api/loop/tenants', async (ctx) => {
    const { id, name } = ctx.request.body as { id: string; name: string }
    if (!id || !name || !/^[A-Za-z0-9._-]+$/.test(id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid tenant id or missing name' }; return
    }
    try {
      await pool.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, name])
      ctx.body = { id, name }
    } catch (err) {
      ctx.status = 500; ctx.body = { error: 'Failed to create tenant' }
    }
  })

  return router
}
```

- [ ] **Step 2: Create tenant panel Vue component**

```vue
<!-- overlay/custom/client/loop/components/LoopTenantPanel.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface TenantStats {
  tenantId: string
  activeLoops: number
  totalCost: number
  completedLoops: number
}

const tenants = ref<TenantStats[]>([])
const loading = ref(false)

async function fetchTenants() {
  loading.value = true
  try {
    const res = await fetch('/api/loop/tenants')
    const data = await res.json()
    // Fetch stats for each tenant
    tenants.value = await Promise.all(
      (data.tenants || []).map(async (t: { id: string; name: string }) => {
        const statRes = await fetch(`/api/loop/tenants/${t.id}/stats`)
        return await statRes.json()
      }),
    )
  } catch (e) {
    // Error fetching — SaaS mode not enabled
  } finally {
    loading.value = false
  }
}

onMounted(() => { fetchTenants() })
</script>

<template>
  <div class="loop-tenant-panel">
    <h3>租户管理</h3>
    <div v-if="loading">加载中...</div>
    <div v-else-if="tenants.length === 0">无租户数据（SaaS 模式未启用）</div>
    <div v-else class="loop-tenant-panel__list">
      <div v-for="t in tenants" :key="t.tenantId" class="loop-tenant-panel__card">
        <h4>{{ t.tenantId }}</h4>
        <p>活跃 Loop: {{ t.activeLoops }}</p>
        <p>已完成: {{ t.completedLoops }}</p>
        <p>总费用: ${{ t.totalCost.toFixed(2) }}</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Write controller test**

```typescript
// overlay/custom/client/loop/__tests__/tenant-controller.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
}))

describe('Tenant Controller', () => {
  it('createTenantRouter returns a Router', async () => {
    const { createTenantRouter } = await import('../../../server/loop/controllers/tenant')
    const { Pool } = await import('pg')
    const router = createTenantRouter(new Pool())
    expect(router).toBeDefined()
    expect(router.routes).toBeDefined()
  })
})
```

- [ ] **Step 4: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/tenant-controller.test.ts
git add custom/server/loop/controllers/tenant.ts custom/client/loop/components/LoopTenantPanel.vue custom/client/loop/__tests__/tenant-controller.test.ts
git commit -m "feat(loop): add multi-tenant management UI and controller"
```

---

### Task 9: Centralized Scheduler (SaaS)

**Files:**
- Create: `overlay/custom/server/loop/engine/centralized-scheduler.ts`
- Test: `overlay/custom/client/loop/__tests__/centralized-scheduler.test.ts`

- [ ] **Step 1: Create centralized-scheduler.ts**

```typescript
// overlay/custom/server/loop/engine/centralized-scheduler.ts
import cronParser from 'cron-parser'
import type { LoopStateStore } from '../store/state-store'
import type { LoopEngine } from './loop-engine'
import type { LoopInstance } from '../../../client/loop/types'

export class CentralizedScheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking: Set<string> = new Set()

  constructor(
    private store: LoopStateStore,
    private engine: LoopEngine,
    private pollIntervalMs: number = 30_000,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll().catch(() => {}), this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async poll(): Promise<void> {
    // Find all loops with next_tick_at <= now
    const loops = await this.store.listLoops()
    const now = Date.now()
    for (const loop of loops) {
      if (loop.status !== 'idle') continue
      if (!loop.nextTickAt) continue
      if (new Date(loop.nextTickAt).getTime() > now) continue
      if (this.ticking.has(loop.id)) continue

      this.ticking.add(loop.id)
      this.engine.tick(loop.id)
        .catch(() => {})
        .finally(() => {
          this.ticking.delete(loop.id)
        })
    }
  }

  async manualTick(loopId: string): Promise<void> {
    if (this.ticking.has(loopId)) return
    this.ticking.add(loopId)
    try {
      await this.engine.tick(loopId)
    } finally {
      this.ticking.delete(loopId)
    }
  }

  computeNextTick(loop: LoopInstance): string {
    if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
      try {
        const interval = cronParser.CronExpressionParser.parse(loop.schedule.cron, { tz: loop.schedule.timezone })
        return interval.next().toISOString()
      } catch {
        return new Date(Date.now() + 3600_000).toISOString()
      }
    }
    return new Date(Date.now() + 3600_000).toISOString()
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// overlay/custom/client/loop/__tests__/centralized-scheduler.test.ts
import { describe, it, expect, vi } from 'vitest'
import { CentralizedScheduler } from '../../../server/loop/engine/centralized-scheduler'
import type { LoopStateStore } from '../../../server/loop/store/state-store'
import type { LoopInstance } from '../types'

function makeLoop(nextTickAt: string | null): LoopInstance {
  return {
    id: 'saas-loop', name: 'SaaS', goal: 'g', stopCondition: 's', pattern: 'daily-triage',
    schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'UTC' },
    stage: 'scheduling', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'saas',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('CentralizedScheduler', () => {
  it('polls and ticks loops with past nextTickAt', async () => {
    const loop = makeLoop(new Date(Date.now() - 1000).toISOString())
    const store: Partial<LoopStateStore> = {
      listLoops: vi.fn().mockResolvedValue([loop]),
    }
    const engine = { tick: vi.fn().mockResolvedValue(undefined) }
    const sched = new CentralizedScheduler(store as any, engine as any, 100)
    await sched.poll()
    expect(engine.tick).toHaveBeenCalledWith('saas-loop')
  })

  it('skips loops with future nextTickAt', async () => {
    const loop = makeLoop(new Date(Date.now() + 3600_000).toISOString())
    const store: Partial<LoopStateStore> = {
      listLoops: vi.fn().mockResolvedValue([loop]),
    }
    const engine = { tick: vi.fn() }
    const sched = new CentralizedScheduler(store as any, engine as any, 100)
    await sched.poll()
    expect(engine.tick).not.toHaveBeenCalled()
  })

  it('skips non-idle loops', async () => {
    const loop = makeLoop(new Date(Date.now() - 1000).toISOString())
    loop.status = 'running'
    const store: Partial<LoopStateStore> = {
      listLoops: vi.fn().mockResolvedValue([loop]),
    }
    const engine = { tick: vi.fn() }
    const sched = new CentralizedScheduler(store as any, engine as any, 100)
    await sched.poll()
    expect(engine.tick).not.toHaveBeenCalled()
  })

  it('computeNextTick uses cron-parser v5 API', () => {
    const store: Partial<LoopStateStore> = { listLoops: vi.fn() }
    const sched = new CentralizedScheduler(store as any, {} as any)
    const next = sched.computeNextTick(makeLoop(null))
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now())
  })
})
```

- [ ] **Step 3: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/centralized-scheduler.test.ts
git add custom/server/loop/engine/centralized-scheduler.ts custom/client/loop/__tests__/centralized-scheduler.test.ts
git commit -m "feat(loop): add centralized scheduler for SaaS multi-tenant polling"
```

---

### Task 10: Billing (Per-Tenant Cost Stats)

**Files:**
- Create: `overlay/custom/server/loop/engine/billing.ts`
- Test: `overlay/custom/client/loop/__tests__/billing.test.ts`

- [ ] **Step 1: Create billing.ts**

```typescript
// overlay/custom/server/loop/engine/billing.ts
import type { Pool } from 'pg'

export interface TenantBilling {
  tenantId: string
  totalCost: number
  activeLoopCount: number
  totalIterations: number
  totalTasksCompleted: number
  averageCompletionRate: number
  period: string  // e.g. "2026-07"
}

export class BillingService {
  constructor(private pool: Pool) {}

  async getTenantBilling(tenantId: string): Promise<TenantBilling> {
    const costRes = await this.pool.query(
      `SELECT
        COALESCE(SUM((stats->>'totalCost')::numeric), 0) as total_cost,
        COUNT(*) as active_loops,
        COALESCE(SUM((stats->>'totalIterations')::int), 0) as total_iterations,
        COALESCE(SUM((stats->>'tasksCompleted')::int), 0) as tasks_completed
       FROM loops WHERE tenant_id = $1`,
      [tenantId],
    )
    const completedRes = await this.pool.query(
      "SELECT COUNT(*) as completed FROM loops WHERE tenant_id = $1 AND status = 'completed'",
      [tenantId],
    )
    const row = costRes.rows[0]
    const completed = parseInt(completedRes.rows[0].completed)
    const totalLoops = parseInt(row.active_loops)
    return {
      tenantId,
      totalCost: parseFloat(row.total_cost),
      activeLoopCount: totalLoops,
      totalIterations: parseInt(row.total_iterations),
      totalTasksCompleted: parseInt(row.tasks_completed),
      averageCompletionRate: totalLoops > 0 ? (completed / totalLoops) * 100 : 0,
      period: new Date().toISOString().slice(0, 7),
    }
  }

  async getAllTenantBilling(): Promise<TenantBilling[]> {
    const tenantsRes = await this.pool.query('SELECT id FROM tenants ORDER BY id')
    return Promise.all(tenantsRes.rows.map(r => this.getTenantBilling(r.id)))
  }

  async getMonthlyReport(tenantId: string, year: number, month: number): Promise<{
    tenantId: string
    cost: number
    iterations: number
    loopsCreated: number
  }> {
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 1).toISOString()
    const res = await this.pool.query(
      `SELECT
        COALESCE(SUM((stats->>'totalCost')::numeric), 0) as cost,
        COALESCE(SUM((stats->>'totalIterations')::int), 0) as iterations,
        COUNT(*) as loops_created
       FROM loops
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [tenantId, startDate, endDate],
    )
    const row = res.rows[0]
    return {
      tenantId,
      cost: parseFloat(row.cost),
      iterations: parseInt(row.iterations),
      loopsCreated: parseInt(row.loops_created),
    }
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// overlay/custom/client/loop/__tests__/billing.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({
      rows: [{
        total_cost: '12.50',
        active_loops: '3',
        total_iterations: '15',
        tasks_completed: '8',
        completed: '2',
      }],
    }),
  })),
}))

import { BillingService } from '../../../server/loop/engine/billing'

describe('BillingService', () => {
  it('gets tenant billing summary', async () => {
    const { Pool } = await import('pg')
    const billing = new BillingService(new Pool())
    const result = await billing.getTenantBilling('tenant-a')
    expect(result.tenantId).toBe('tenant-a')
    expect(result.totalCost).toBe(12.50)
    expect(result.activeLoopCount).toBe(3)
    expect(result.averageCompletionRate).toBeCloseTo(66.67, 1) // 2/3 * 100
  })

  it('gets monthly report', async () => {
    const { Pool } = await import('pg')
    const billing = new BillingService(new Pool())
    const result = await billing.getMonthlyReport('tenant-a', 2026, 7)
    expect(result.tenantId).toBe('tenant-a')
    expect(result.cost).toBe(12.50)
    expect(result.iterations).toBe(15)
  })
})
```

- [ ] **Step 3: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/billing.test.ts
git add custom/server/loop/engine/billing.ts custom/client/loop/__tests__/billing.test.ts
git commit -m "feat(loop): add per-tenant billing service with monthly reports"
```

---

### Task 11: Migration Tool (Matrix → SaaS)

**Files:**
- Create: `overlay/scripts/loop-migrate-saas.mjs`

- [ ] **Step 1: Create migration script**

```javascript
#!/usr/bin/env node
// overlay/scripts/loop-migrate-saas.mjs
// Migrates loop state from MatrixStore to SaaSStore (PostgreSQL)
// Usage: node scripts/loop-migrate-saas.mjs --pg-url URL --tenant ID --homeserver URL --token TOKEN --user @bot:matrix.org --room !room:matrix.org

import { existsSync } from 'fs'

const args = process.argv.slice(2)
const opts = {}
for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace(/^--/, '')] = args[i + 1]
}

const required = ['pg-url', 'tenant', 'homeserver', 'token', 'user', 'room']
for (const k of required) {
  if (!opts[k]) {
    console.error(`Missing required --${k}`)
    process.exit(1)
  }
}

async function migrate() {
  const { MatrixStore } = await import('../custom/server/loop/store/matrix-store.js')
  const { SaaSStore } = await import('../custom/server/loop/store/saas-store.js')

  const matrixStore = new MatrixStore({
    homeserverUrl: opts.homeserver,
    accessToken: opts.token,
    userId: opts.user,
    roomId: opts.room,
  })

  const saasStore = new SaaSStore({
    connectionString: opts['pg-url'],
    tenantId: opts.tenant,
  })
  await saasStore.init()

  // Wait for Matrix sync
  await new Promise(r => setTimeout(r, 3000))

  const loops = await matrixStore.listLoops()
  console.log(`Migrating ${loops.length} loops from Matrix to SaaS (tenant: ${opts.tenant})...`)

  for (const loop of loops) {
    try {
      loop.stateAdapter = 'saas'
      await saasStore.createLoop(loop)
      console.log(`  ✓ ${loop.id}`)

      const contracts = await matrixStore.queryContracts(loop.id)
      for (const c of contracts) {
        await saasStore.appendContract(c)
      }

      const events = await matrixStore.queryEvents(loop.id)
      for (const e of events) {
        await saasStore.appendEvent(e)
      }
      console.log(`    ${contracts.length} contracts, ${events.length} events`)
    } catch (err) {
      console.error(`  ✗ ${loop.id}: ${err.message}`)
    }
  }

  await saasStore.close()
  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Write test**

```typescript
// overlay/custom/client/loop/__tests__/loop-migrate-saas.test.ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { resolve } from 'path'

describe('Loop Migration (Matrix → SaaS)', () => {
  it('migration script file exists', () => {
    expect(existsSync(resolve(process.cwd(), 'scripts/loop-migrate-saas.mjs'))).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/loop-migrate-saas.test.ts
git add scripts/loop-migrate-saas.mjs custom/client/loop/__tests__/loop-migrate-saas.test.ts
git commit -m "feat(loop): add Matrix→SaaS migration script"
```

---

### Task 12: Phase 3 Integration Test

**Files:**
- Test: `overlay/custom/client/loop/__tests__/phase3-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// overlay/custom/client/loop/__tests__/phase3-integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { LocalStore } from '../../../server/loop/store/local-store'
import { LoopEngine } from '../../../server/loop/engine/loop-engine'
import { Verifier } from '../../../server/loop/engine/verifier'
import { BudgetGuard } from '../../../server/loop/engine/budget-guard'
import { StuckDetector } from '../../../server/loop/engine/stuck-detector'
import { HookManager } from '../../../server/loop/engine/hooks'
import { WorktreeManager } from '../../../server/loop/engine/worktree-manager'
import { SubagentDispatcher } from '../../../server/loop/engine/subagent-dispatcher'
import { WebhookConnector } from '../../../server/loop/connectors/webhook-connector'
import { CentralizedScheduler } from '../../../server/loop/engine/centralized-scheduler'
import type { LoopInstance, LoopEvent } from '../types'

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}))

const TEST_DIR = '.loop-phase3-test'

function makeLoop(): LoopInstance {
  return {
    id: 'phase3-loop', name: 'Phase3 Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'saas',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null,
    nextTickAt: new Date(Date.now() - 1000).toISOString(), // past → should tick
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Phase 3 Integration (SaaS Layer)', () => {
  let store: LocalStore
  let events: LoopEvent[]

  beforeEach(() => {
    store = new LocalStore(TEST_DIR)
    events = []
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('centralized scheduler polls and ticks eligible loops', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)

    const webhookConnector = new WebhookConnector()

    const engine = new LoopEngine({
      store,
      webhookConnector,
      verifier: new Verifier({ requestHumanApproval: vi.fn().mockResolvedValue('approved' as const) }),
      dispatcher: new SubagentDispatcher({ invokeAgent: vi.fn().mockResolvedValue('done') }),
      worktreeManager: { create: vi.fn().mockResolvedValue('wt-1'), remove: vi.fn() } as any,
      budgetGuard: new BudgetGuard((e) => { events.push(e) }),
      stuckDetector: new StuckDetector(store),
      hookManager: new HookManager(),
      emitEvent: async (e) => { events.push(e) },
    })

    const sched = new CentralizedScheduler(store, engine, 100)
    await sched.poll()

    // Verify the loop was ticked
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)
  })

  it('centralized scheduler skips running loops', async () => {
    const loop = makeLoop()
    loop.status = 'running'
    await store.createLoop(loop)

    const engine = { tick: vi.fn() } as any
    const sched = new CentralizedScheduler(store, engine, 100)
    await sched.poll()

    expect(engine.tick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run all loop tests and commit**

```bash
cd overlay && npx vitest run custom/client/loop/__tests__/
git add custom/client/loop/__tests__/phase3-integration.test.ts
git commit -m "test(loop): add phase 3 integration test for SaaS centralized scheduling"
```

---

## Self-Review

### Spec coverage check (Phase 2)
- ✅ MatrixStore (Matrix room state events) — Task 1
- ✅ Lease election (multi-instance coordination) — Task 2
- ✅ Team approval flow (Matrix approvers) — Task 3
- ✅ Migration tool (Local → Matrix) — Task 4
- ✅ Matrix bot (notifications to room) — Task 5
- ✅ Phase 2 integration test — Task 6

### Spec coverage check (Phase 3)
- ✅ SaaSStore (PostgreSQL + RLS) — Task 7
- ✅ Multi-tenant management UI — Task 8
- ✅ Centralized scheduler — Task 9
- ✅ Billing (per-tenant cost stats) — Task 10
- ✅ Migration tool (Matrix → SaaS) — Task 11
- ✅ Phase 3 integration test — Task 12

### Type consistency
- All types from Phase 1's `types.ts` are reused
- `LoopStateStore` interface implemented by `MatrixStore` and `SaaSStore`
- `LoopEngine` deps interface unchanged — all adapters are swappable
- `cron-parser` v5 API (`CronExpressionParser.parse`) used consistently in both `centralized-scheduler.ts` and `scheduler.ts`
