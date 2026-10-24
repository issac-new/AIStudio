# Matrix Teams 与 Hermes Agent Teams 分布式管理 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SwarmStudio 中实现以 Matrix 房间事件为单一事实源的 Teams 管理（账号树、群聊值守、任务指派投递）。

**Architecture:** 全部管理数据（账号层级 / leader 名单 / 值守关系 / 指派与回执）存为一个私密「团队注册房间」的自定义 Matrix 事件，经 homeserver 同步到所有成员节点；渲染进程复用现有 MatrixClient 单例读写；指派任务在成员节点落地为本机 kanban 卡片由现有 dispatcher 执行并回执。

**Tech Stack:** Vue 3 `<script setup>` + Pinia（overlay custom A 类）、matrix-js-sdk（已有依赖，零新增）、vitest + @vue/test-utils、i18n 走 B 类 patch 注入上游 locale。

**Spec:** `docs/superpowers/specs/2026-09-17-matrix-teams-management-design.md`（本计划从 spec 推导，执行者须同时读 spec）

## Global Constraints

- 只改 `overlay/`；`upstream/` 严格只读，唯一通路 = B 类 patch 五步法（临时改 upstream → `git diff > patches/NNN-desc.patch` → `git checkout -- .` 还原 → series 登记 → `npm run inject` 验证）。
- 本功能唯一 B 类改动 = i18n zh/en 成对 patch（编号开工时 `ls overlay/patches/ | grep ^NN` 查重顺延；当前 series 尾部为 287，预期 288/289）。其余全部 A 类落 `overlay/custom/client/matrix-teams/`。
- i18n 新键 zh/en 全键对称；禁止运行时 merge、禁止 custom 放 locale 文件。
- 零新增 npm 依赖。
- 收口门禁（每阶段末）：`cd overlay && npm test` 全绿 → `npm run clean && npm run inject` 重放 → `npm run build:full`。
- 分支：P1 = `feat/matrix-teams-p1-registry`、P2 = `feat/matrix-teams-p2-duty`、P3 = `feat/matrix-teams-p3-dispatch`；各自从 overlay main 起，门禁过后合回 main（`git merge --no-ff`）。
- 事件类型字符串只准出现在 `protocol.ts` 与其测试（守门测试强制）；其余代码一律引用常量。
- 所有命令在 `/Volumes/nvme2230/lab/ncwk/overlay` 下执行（除非另注明）。

---

## Phase 1 — 管理面（注册房间 + 账号树 + leader）

### Task 1: 协议层 protocol.ts

**Files:**
- Create: `custom/client/matrix-teams/protocol.ts`
- Test: `custom/client/matrix-teams/__tests__/protocol.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖）:
  - `TEAM_EVENT_TYPES = { account: 'com.swarmstudio.team.account'; leaders: 'com.swarmstudio.team.leaders'; duty: 'com.swarmstudio.team.duty' }`（`as const`）
  - `TASK_EVENT_TYPES = { assign: 'com.swarmstudio.task.assign'; receipt: 'com.swarmstudio.task.receipt' }`（`as const`）
  - `REGISTRY_ACCOUNT_DATA_TYPE = 'com.swarmstudio.registry'`
  - `REGISTRY_ROOM_POWER_LEVELS = { events_default: 0; state_default: 50; events: { account: 0; receipt: 0; leaders: 50; duty: 50; assign: 50 } }`
  - 类型：`AgentTeam { slug; name; profiles: string[]; defaultProfile? }`、`AccountContent { displayName; agentTeams: AgentTeam[]; updatedAt: number }`、`LeadersContent { leaders: string[] }`、`DutyContent { assigneeKind: 'account'|'agentTeam'; assigneeId; roomName?; updatedBy; updatedAt }`、`AssignContent { taskId; title; body?; priority?; dueAt?; target: { account; agentTeam?; profile? }; issuedBy; issuedAt }`、`ReceiptStatus = 'created'|'running'|'done'|'failed'`、`ReceiptContent { taskId; status: ReceiptStatus; localTaskId?; reason?; reportedBy; reportedAt }`
  - `isSwarmStudioEventType(type: string): boolean`、`agentTeamGlobalId(ownerUserId: string, slug: string): string`、`slugify(name: string): string`
  - 解析器（非法输入返回 `null` 不抛）：`parseAccountContent`、`parseLeadersContent`、`parseDutyContent`、`parseAssignContent`、`parseReceiptContent`

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/protocol.test.ts`：

```ts
// overlay/custom/client/matrix-teams/__tests__/protocol.test.ts
// 协议守门：事件类型常量 + content schema 解析（容错返回 null）+ 防内联漂移。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  TEAM_EVENT_TYPES, TASK_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, REGISTRY_ROOM_POWER_LEVELS,
  isSwarmStudioEventType, agentTeamGlobalId, slugify,
  parseAccountContent, parseLeadersContent, parseDutyContent, parseAssignContent, parseReceiptContent,
} from '../protocol'

describe('事件类型常量', () => {
  it('五个事件类型 + account data 类型符合 spec §4.2', () => {
    expect(TEAM_EVENT_TYPES.account).toBe('com.swarmstudio.team.account')
    expect(TEAM_EVENT_TYPES.leaders).toBe('com.swarmstudio.team.leaders')
    expect(TEAM_EVENT_TYPES.duty).toBe('com.swarmstudio.team.duty')
    expect(TASK_EVENT_TYPES.assign).toBe('com.swarmstudio.task.assign')
    expect(TASK_EVENT_TYPES.receipt).toBe('com.swarmstudio.task.receipt')
    expect(REGISTRY_ACCOUNT_DATA_TYPE).toBe('com.swarmstudio.registry')
  })
  it('PL 矩阵符合 spec §4.2（account/receipt=0，leaders/duty/assign=50）', () => {
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TEAM_EVENT_TYPES.account]).toBe(0)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TASK_EVENT_TYPES.receipt]).toBe(0)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TEAM_EVENT_TYPES.leaders]).toBe(50)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TEAM_EVENT_TYPES.duty]).toBe(50)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TASK_EVENT_TYPES.assign]).toBe(50)
  })
  it('isSwarmStudioEventType 按前缀识别', () => {
    expect(isSwarmStudioEventType('com.swarmstudio.team.duty')).toBe(true)
    expect(isSwarmStudioEventType('m.room.message')).toBe(false)
  })
})

describe('id 与 slug', () => {
  it('agentTeamGlobalId = <ownerUserId>/<slug>', () => {
    expect(agentTeamGlobalId('@alice:sv', 'backend')).toBe('@alice:sv/backend')
  })
  it('slugify 小写化并压缩非法字符，空名兜底 team', () => {
    expect(slugify('Back End!')).toBe('back-end')
    expect(slugify('  ')).toBe('team')
  })
})

describe('parseAccountContent', () => {
  const ok = { displayName: 'Alice', agentTeams: [{ slug: 'backend', name: '后端组', profiles: ['alice', 'alice-2'], defaultProfile: 'alice' }], updatedAt: 1 }
  it('合法 content 原样解析', () => {
    expect(parseAccountContent(ok)).toEqual(ok)
  })
  it('缺 displayName / updatedAt / agentTeams 非数组 → null', () => {
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1 })).toBeNull()
    expect(parseAccountContent({ displayName: 'x', agentTeams: [], updatedAt: 't' })).toBeNull()
    expect(parseAccountContent(null)).toBeNull()
    expect(parseAccountContent('str')).toBeNull()
  })
  it('team 内 profiles 混入非字符串 → null（整体拒绝，不静默截断）', () => {
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1, agentTeams: [{ slug: 'a', name: 'a', profiles: ['p', 1] }] })).toBeNull()
  })
  it('超过限幅（>20 teams 或某 team >20 profiles）→ null', () => {
    const teams = Array.from({ length: 21 }, (_, i) => ({ slug: `t${i}`, name: `t${i}`, profiles: ['p'] }))
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1, agentTeams: teams })).toBeNull()
    const wide = { slug: 'a', name: 'a', profiles: Array.from({ length: 21 }, (_, i) => `p${i}`) }
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1, agentTeams: [wide] })).toBeNull()
  })
})

describe('parseLeadersContent / parseDutyContent', () => {
  it('leaders 合法解析，非字符串成员 → null', () => {
    expect(parseLeadersContent({ leaders: ['@a:sv'] })).toEqual({ leaders: ['@a:sv'] })
    expect(parseLeadersContent({ leaders: ['@a:sv', 1] })).toBeNull()
    expect(parseLeadersContent({})).toBeNull()
  })
  it('duty 合法解析；assigneeKind 非法 → null', () => {
    const ok = { assigneeKind: 'agentTeam', assigneeId: '@a:sv/backend', updatedBy: '@l:sv', updatedAt: 2 }
    expect(parseDutyContent(ok)).toEqual(ok)
    expect(parseDutyContent({ ...ok, assigneeKind: 'nope' })).toBeNull()
    expect(parseDutyContent({ ...ok, assigneeId: 5 })).toBeNull()
  })
})

describe('parseAssignContent / parseReceiptContent', () => {
  const assign = { taskId: 'u1', title: 'T', target: { account: '@a:sv', agentTeam: 'backend' }, issuedBy: '@l:sv', issuedAt: 3 }
  it('assign 合法解析（可选项缺省容忍）', () => {
    expect(parseAssignContent(assign)).toEqual(assign)
    expect(parseAssignContent({ ...assign, target: {} })).toBeNull()
    expect(parseAssignContent({ ...assign, taskId: 1 })).toBeNull()
  })
  it('receipt 合法解析；status 非法 → null', () => {
    const ok = { taskId: 'u1', status: 'created', reportedBy: '@a:sv', reportedAt: 4 }
    expect(parseReceiptContent(ok)).toEqual(ok)
    expect(parseReceiptContent({ ...ok, status: 'nope' })).toBeNull()
    expect(parseReceiptContent({ ...ok, taskId: null })).toBeNull()
  })
})

describe('协议守门：matrix-teams 模块内禁止内联事件类型字符串', () => {
  function collect(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...collect(p))
      else if (p.endsWith('.ts') || p.endsWith('.vue')) out.push(p)
    }
    return out
  }
  it('除 protocol.ts 与本测试外，不得出现 com.swarmstudio. 字面量', () => {
    const root = join(__dirname, '..')
    const offenders = collect(root).filter(
      p => !p.endsWith('protocol.ts') && !p.endsWith('__tests__')
        && readFileSync(p, 'utf8').includes('com.swarmstudio.')
    )
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/protocol.test.ts`
Expected: FAIL（找不到 `../protocol` 模块）

- [ ] **Step 3: 实现 protocol.ts**

`custom/client/matrix-teams/protocol.ts`：

```ts
// overlay/custom/client/matrix-teams/protocol.ts
// 团队注册房间事件协议（spec §4.2 单一事实源）。
// 事件类型字符串只准在本文件出现（守门测试强制），读写两端一律引用常量。
export const TEAM_EVENT_TYPES = {
  account: 'com.swarmstudio.team.account',
  leaders: 'com.swarmstudio.team.leaders',
  duty: 'com.swarmstudio.team.duty',
} as const

export const TASK_EVENT_TYPES = {
  assign: 'com.swarmstudio.task.assign',
  receipt: 'com.swarmstudio.task.receipt',
} as const

export const REGISTRY_ACCOUNT_DATA_TYPE = 'com.swarmstudio.registry'

const TEAM_EVENT_PREFIX = 'com.swarmstudio.'

export function isSwarmStudioEventType(type: string): boolean {
  return type.startsWith(TEAM_EVENT_PREFIX)
}

/** 建注册房间时的 power level 覆盖（spec §4.2 PL 矩阵）。
 *  events_default/state_default 补齐默认语义：未列出的消息事件 PL=0、state 事件 PL=50，
 *  显式列出的按矩阵覆盖。 */
export const REGISTRY_ROOM_POWER_LEVELS = {
  events_default: 0,
  state_default: 50,
  events: {
    [TEAM_EVENT_TYPES.account]: 0,
    [TASK_EVENT_TYPES.receipt]: 0,
    [TEAM_EVENT_TYPES.leaders]: 50,
    [TEAM_EVENT_TYPES.duty]: 50,
    [TASK_EVENT_TYPES.assign]: 50,
  },
} as const

export interface AgentTeam {
  slug: string
  name: string
  profiles: string[]
  defaultProfile?: string
}
export interface AccountContent {
  displayName: string
  agentTeams: AgentTeam[]
  updatedAt: number
}
export interface LeadersContent { leaders: string[] }
export interface DutyContent {
  assigneeKind: 'account' | 'agentTeam'
  assigneeId: string
  roomName?: string
  updatedBy: string
  updatedAt: number
}
export interface AssignContent {
  taskId: string
  title: string
  body?: string
  priority?: string
  dueAt?: number
  target: { account: string; agentTeam?: string; profile?: string }
  issuedBy: string
  issuedAt: number
}
export type ReceiptStatus = 'created' | 'running' | 'done' | 'failed'
export interface ReceiptContent {
  taskId: string
  status: ReceiptStatus
  localTaskId?: string
  reason?: string
  reportedBy: string
  reportedAt: number
}

export function agentTeamGlobalId(ownerUserId: string, slug: string): string {
  return `${ownerUserId}/${slug}`
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'team'
}

// ── 解析器：非法输入一律返回 null（spec §5 容错），不抛 ──
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined }
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

const MAX_TEAMS = 20
const MAX_PROFILES = 20

export function parseAccountContent(raw: unknown): AccountContent | null {
  if (!isRecord(raw)) return null
  const displayName = str(raw.displayName)
  const updatedAt = num(raw.updatedAt)
  if (!displayName || updatedAt === undefined || !Array.isArray(raw.agentTeams)) return null
  if (raw.agentTeams.length > MAX_TEAMS) return null
  const agentTeams: AgentTeam[] = []
  for (const t of raw.agentTeams) {
    if (!isRecord(t)) return null
    const slug = str(t.slug)
    const name = str(t.name)
    if (!slug || !name || !Array.isArray(t.profiles) || t.profiles.length > MAX_PROFILES) return null
    const profiles: string[] = []
    for (const p of t.profiles) {
      if (typeof p !== 'string') return null
      profiles.push(p)
    }
    agentTeams.push({ slug, name, profiles, defaultProfile: str(t.defaultProfile) })
  }
  return { displayName, agentTeams, updatedAt }
}

export function parseLeadersContent(raw: unknown): LeadersContent | null {
  if (!isRecord(raw) || !Array.isArray(raw.leaders)) return null
  const leaders: string[] = []
  for (const l of raw.leaders) {
    if (typeof l !== 'string') return null
    leaders.push(l)
  }
  return { leaders }
}

export function parseDutyContent(raw: unknown): DutyContent | null {
  if (!isRecord(raw)) return null
  const kind = str(raw.assigneeKind)
  const assigneeId = str(raw.assigneeId)
  const updatedBy = str(raw.updatedBy)
  const updatedAt = num(raw.updatedAt)
  if (!assigneeId || !updatedBy || updatedAt === undefined) return null
  if (kind !== 'account' && kind !== 'agentTeam') return null
  return { assigneeKind: kind, assigneeId, roomName: str(raw.roomName), updatedBy, updatedAt }
}

export function parseAssignContent(raw: unknown): AssignContent | null {
  if (!isRecord(raw)) return null
  const taskId = str(raw.taskId)
  const title = str(raw.title)
  const issuedBy = str(raw.issuedBy)
  const issuedAt = num(raw.issuedAt)
  if (!taskId || !title || !issuedBy || issuedAt === undefined) return null
  if (!isRecord(raw.target)) return null
  const account = str(raw.target.account)
  if (!account) return null
  return {
    taskId, title,
    body: str(raw.body), priority: str(raw.priority), dueAt: num(raw.dueAt),
    target: { account, agentTeam: str(raw.target.agentTeam), profile: str(raw.target.profile) },
    issuedBy, issuedAt,
  }
}

export function parseReceiptContent(raw: unknown): ReceiptContent | null {
  if (!isRecord(raw)) return null
  const taskId = str(raw.taskId)
  const reportedBy = str(raw.reportedBy)
  const reportedAt = num(raw.reportedAt)
  const status = str(raw.status)
  if (!taskId || !reportedBy || reportedAt === undefined) return null
  if (status !== 'created' && status !== 'running' && status !== 'done' && status !== 'failed') return null
  return {
    taskId, status,
    localTaskId: str(raw.localTaskId), reason: str(raw.reason),
    reportedBy, reportedAt,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/protocol.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main && git pull origin main 2>/dev/null; git checkout -b feat/matrix-teams-p1-registry
git add custom/client/matrix-teams/
git commit -m "feat(matrix-teams): team registry event protocol with parser gate tests"
```

---

### Task 2: 账号树投影 adapter（纯函数）

**Files:**
- Create: `custom/client/matrix-teams/adapters/accounts.ts`
- Test: `custom/client/matrix-teams/__tests__/accounts-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `AgentTeam`、`AccountContent`、`DutyContent`、`parseAccountContent`、`parseLeadersContent`、`agentTeamGlobalId`
- Produces:
  - `RawStateEvent { type: string; stateKey: string; sender: string; content: unknown }`（store 层从 SDK MatrixEvent 提取的原始记录）
  - `TeamAccountView { userId: string; displayName: string; agentTeams: AgentTeam[]; isLeader: boolean; declared: true }`
  - `projectAccounts(events: RawStateEvent[], leaders: string[]): TeamAccountView[]`（按 userId 排序；丢弃 `sender !== stateKey` 与解析失败条目——spec §4.2 应用层归属校验）
  - `undeclaredMembers(events: RawStateEvent[], leaders: string[], memberIds: string[]): string[]`（房间成员/leader 中未声明 account 的 userId，排序）
  - `dutyAppliesToUser(duty: DutyContent, userId: string, accounts: TeamAccountView[]): boolean`（P2 复用：`assigneeKind==='account'` 直配 userId，或 `assigneeId` 等于该 userId 名下某 team 的全局 id）

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/accounts-adapter.test.ts`：

```ts
// overlay/custom/client/matrix-teams/__tests__/accounts-adapter.test.ts
// 账号树投影守门：sender≠stateKey 丢弃、解析失败丢弃、leader 标记、未声明成员、值守归属判定。
import { describe, it, expect } from 'vitest'
import { TEAM_EVENT_TYPES } from '../protocol'
import {
  projectAccounts, undeclaredMembers, dutyAppliesToUser, type RawStateEvent,
} from '../adapters/accounts'

const acc = (userId: string, sender = userId, teams: Array<{ slug: string; profiles: string[] }> = [{ slug: 'main', profiles: ['p1'] }]): RawStateEvent => ({
  type: TEAM_EVENT_TYPES.account,
  stateKey: userId,
  sender,
  content: { displayName: userId.split(':')[0].slice(1), agentTeams: teams.map(t => ({ slug: t.slug, name: t.slug, profiles: t.profiles, defaultProfile: t.profiles[0] })), updatedAt: 1 },
})

describe('projectAccounts', () => {
  it('合法事件投影为 TeamAccountView，标记 isLeader，按 userId 排序', () => {
    const views = projectAccounts([acc('@bob:sv'), acc('@alice:sv')], ['@alice:sv'])
    expect(views.map(v => v.userId)).toEqual(['@alice:sv', '@bob:sv'])
    expect(views[0].isLeader).toBe(true)
    expect(views[1].isLeader).toBe(false)
    expect(views[0].agentTeams[0]).toMatchObject({ slug: 'main', profiles: ['p1'], defaultProfile: 'p1' })
  })
  it('sender≠stateKey（伪造他人条目）与解析失败（缺字段）→ 丢弃', () => {
    const forged = acc('@alice:sv', '@mallory:sv')
    const broken: RawStateEvent = { type: TEAM_EVENT_TYPES.account, stateKey: '@x:sv', sender: '@x:sv', content: { displayName: 'x' } }
    expect(projectAccounts([forged, broken], [])).toEqual([])
  })
  it('非 account 类型事件不参与投影', () => {
    const ev: RawStateEvent = { type: TEAM_EVENT_TYPES.duty, stateKey: '!r:sv', sender: '@l:sv', content: {} }
    expect(projectAccounts([ev], [])).toEqual([])
  })
  it('同 stateKey 多条事件取最后一条（防御，正常由 state 语义保证唯一）', () => {
    const v1 = acc('@a:sv', '@a:sv', [{ slug: 'one', profiles: ['p'] }])
    const v2 = acc('@a:sv', '@a:sv', [{ slug: 'two', profiles: ['p'] }])
    const views = projectAccounts([v1, v2], [])
    expect(views).toHaveLength(1)
    expect(views[0].agentTeams[0].slug).toBe('two')
  })
})

describe('undeclaredMembers', () => {
  it('成员∪leader 减去已声明者，排序去重', () => {
    expect(undeclaredMembers([acc('@alice:sv')], ['@lead:sv'], ['@alice:sv', '@bob:sv', '@lead:sv']))
      .toEqual(['@bob:sv', '@lead:sv'])
  })
})

describe('dutyAppliesToUser', () => {
  const accounts = projectAccounts([acc('@alice:sv', '@alice:sv', [{ slug: 'backend', profiles: ['pa'] }])], [])
  it('account 直配命中', () => {
    expect(dutyAppliesToUser({ assigneeKind: 'account', assigneeId: '@alice:sv', updatedBy: '@l:sv', updatedAt: 1 }, '@alice:sv', accounts)).toBe(true)
    expect(dutyAppliesToUser({ assigneeKind: 'account', assigneeId: '@bob:sv', updatedBy: '@l:sv', updatedAt: 1 }, '@alice:sv', accounts)).toBe(false)
  })
  it('agentTeam 全局 id = <userId>/<slug> 命中该 userId', () => {
    expect(dutyAppliesToUser({ assigneeKind: 'agentTeam', assigneeId: '@alice:sv/backend', updatedBy: '@l:sv', updatedAt: 1 }, '@alice:sv', accounts)).toBe(true)
    expect(dutyAppliesToUser({ assigneeKind: 'agentTeam', assigneeId: '@alice:sv/backend', updatedBy: '@l:sv', updatedAt: 1 }, '@bob:sv', accounts)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/accounts-adapter.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 adapters/accounts.ts**

```ts
// overlay/custom/client/matrix-teams/adapters/accounts.ts
// 账号树纯函数投影：视图不自算（先例 ia2/adapters/manage.ts）。
import {
  TEAM_EVENT_TYPES, parseAccountContent, agentTeamGlobalId,
  type AgentTeam, type DutyContent,
} from '../protocol'

export interface RawStateEvent {
  type: string
  stateKey: string
  sender: string
  content: unknown
}

export interface TeamAccountView {
  userId: string
  displayName: string
  agentTeams: AgentTeam[]
  isLeader: boolean
  declared: true
}

export function projectAccounts(events: RawStateEvent[], leaders: string[]): TeamAccountView[] {
  const byUser = new Map<string, TeamAccountView>()
  for (const ev of events) {
    if (ev.type !== TEAM_EVENT_TYPES.account) continue
    if (ev.sender !== ev.stateKey) continue // 应用层归属校验（spec §4.2）
    const parsed = parseAccountContent(ev.content)
    if (!parsed) continue
    byUser.set(ev.stateKey, {
      userId: ev.stateKey,
      displayName: parsed.displayName,
      agentTeams: parsed.agentTeams,
      isLeader: leaders.includes(ev.stateKey),
      declared: true,
    })
  }
  return [...byUser.values()].sort((a, b) => a.userId.localeCompare(b.userId))
}

export function undeclaredMembers(events: RawStateEvent[], leaders: string[], memberIds: string[]): string[] {
  const declared = new Set(
    events
      .filter(e => e.type === TEAM_EVENT_TYPES.account && e.sender === e.stateKey && parseAccountContent(e.content))
      .map(e => e.stateKey),
  )
  return [...new Set([...memberIds, ...leaders])].filter(id => !declared.has(id)).sort()
}

export function dutyAppliesToUser(duty: DutyContent, userId: string, accounts: TeamAccountView[]): boolean {
  if (duty.assigneeKind === 'account') return duty.assigneeId === userId
  const own = accounts.find(a => a.userId === userId)
  if (!own) return false
  return own.agentTeams.some(t => agentTeamGlobalId(userId, t.slug) === duty.assigneeId)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/accounts-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add custom/client/matrix-teams/
git commit -m "feat(matrix-teams): account tree projection adapter with ownership guard"
```

---

### Task 3: team-registry store（发现 / 建房 / 写 / 监听投影）

**Files:**
- Create: `custom/client/matrix-teams/stores/team-registry.ts`
- Test: `custom/client/matrix-teams/__tests__/team-registry-store.test.ts`

**Interfaces:**
- Consumes: Task 1 协议常量与类型、Task 2 `projectAccounts`/`undeclaredMembers`/`RawStateEvent`；`useMatrixClientStore`（`@/custom/matrix-chat/stores/matrix-client`，字段 `client: Ref<MatrixClient|null>`、`userId: ComputedRef<string|null>`）
- Produces: `useTeamRegistryStore()`（pinia id `matrix-team-registry`）：
  - state：`registryRoomId: Ref<string|null>`、`accounts: Ref<TeamAccountView[]>`、`leaders: Ref<string[]>`、`undeclared: Ref<string[]>`、`duties: Ref<Record<string, DutyContent>>`（P2 填充，本任务先建投影骨架）、`ready: Ref<boolean>`、`lastError: Ref<string|null>`
  - computed：`isLeader: ComputedRef<boolean>`（当前登录账号 ∈ leaders）
  - actions：`ensureListening(): void`（幂等；watch matrix-client 的 `client`，非空时挂 `RoomEvent.Timeline` 监听并 `rebuild()`）、`rebuild(): Promise<void>`、`detectRegistry(): Promise<void>`、`registryCandidateRooms(): Array<{ roomId: string; name: string }>`、`setRegistryRoom(roomId: string): Promise<void>`、`createRegistryRoom(name: string, invitees: string[]): Promise<string|null>`、`writeSelfAccount(agentTeams: AgentTeam[]): Promise<boolean>`、`writeLeaders(list: string[]): Promise<boolean>`、`inviteMember(userId: string): Promise<boolean>`
  - SDK 交互方式（供 mock 测试对齐）：`client.createRoom({ visibility: 'private', name, invite, power_level_content_override: REGISTRY_ROOM_POWER_LEVELS })`；`client.sendStateEvent(roomId, TEAM_EVENT_TYPES.account, content, selfUserId)`；`client.setAccountData(REGISTRY_ACCOUNT_DATA_TYPE, { roomId })`；`client.getAccountData(REGISTRY_ACCOUNT_DATA_TYPE)?.content`；`client.getRoom(roomId)?.currentState.getStateEvents(type)` 返回 SDK MatrixEvent 数组（store 提取 `{ type: ev.getType(), stateKey: ev.getStateKey(), sender: ev.getStateKey() === undefined ? null : (ev.sender?.userId ?? null), content: ev.getContent() }`——注意 sender 取 `ev.sender?.userId`）；`client.invite(roomId, userId)`

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/team-registry-store.test.ts`：

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/team-registry-store.test.ts
// 注册房间 store 守门：发现/建房 PL/写 account 归属校验/rebuild 投影/幂等监听。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, REGISTRY_ROOM_POWER_LEVELS } from '../protocol'

type Listener = (event: unknown, room: unknown) => void

function makeSdkClient(roomStates: Record<string, Array<{ type: string; stateKey: string; sender: string; content: unknown }>> = {}) {
  const listeners = new Map<string, Listener[]>()
  const accountData = new Map<string, unknown>()
  const sent = { stateEvents: [] as Array<{ roomId: string; type: string; stateKey: string; content: unknown }>, accountData: [] as string[] }
  const client = {
    on: (ev: string, fn: Listener) => { listeners.set(ev, [...(listeners.get(ev) ?? []), fn]) },
    off: () => {},
    getAccountData: (type: string) => accountData.get(type) !== undefined ? { content: accountData.get(type) } : undefined,
    setAccountData: async (type: string, content: unknown) => { accountData.set(type, content); sent.accountData.push(type) },
    getRoom: (roomId: string) => {
      const states = roomStates[roomId] ?? []
      return {
        roomId,
        name: roomId,
        getJoinedMembers: () => (roomStates[roomId] ?? []).map(s => ({ userId: s.sender, membership: 'join' })),
        currentState: {
          getStateEvents: (type?: string) => type === undefined ? states : states.filter(s => s.type === type),
        },
      }
    },
    getRooms: () => Object.keys(roomStates).map(id => client.getRoom(id)),
    createRoom: vi.fn(async () => ({ room_id: '!new:sv' })),
    sendStateEvent: async (roomId: string, type: string, content: unknown, stateKey: string) => {
      sent.stateEvents.push({ roomId, type, stateKey, content })
      roomStates[roomId] = [...(roomStates[roomId] ?? []), { type, stateKey, sender: stateKey, content }]
    },
    invite: vi.fn(async () => ({})),
    sendEvent: vi.fn(async () => ({})),
    userId: '@alice:sv',
  }
  return {
    client,
    emit: (ev: string, event: unknown, room: unknown) => (listeners.get(ev) ?? []).forEach(fn => fn(event, room)),
    accountData, sent, listeners,
    sdkEvent: (roomId: string, s: { type: string; stateKey: string; sender: string; content: unknown }) => ({
      getType: () => s.type, getStateKey: () => s.stateKey,
      sender: { userId: s.sender }, getContent: () => s.content,
      isState: () => true, getRoomId: () => roomId,
    }),
  }
}

const sdk = makeSdkClient({
  '!reg:sv': [
    { type: TEAM_EVENT_TYPES.leaders, stateKey: '', sender: '@lead:sv', content: { leaders: ['@lead:sv'] } },
    { type: TEAM_EVENT_TYPES.account, stateKey: '@bob:sv', sender: '@bob:sv', content: { displayName: 'Bob', agentTeams: [{ slug: 'main', name: 'Main', profiles: ['pb'] }], updatedAt: 9 } },
  ],
  '!plain:sv': [
    { type: 'm.room.name', stateKey: '', sender: '@x:sv', content: { name: 'plain' } },
  ],
})

vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdk.client }, userId: { value: '@alice:sv' } }),
}))

import { useTeamRegistryStore } from '../stores/team-registry'

beforeEach(() => { setActivePinia(createPinia()) })

describe('发现', () => {
  it('account data 已记 roomId 且房间可见 → registryRoomId 命中', async () => {
    sdk.accountData.set(REGISTRY_ACCOUNT_DATA_TYPE, { roomId: '!reg:sv' })
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.registryRoomId).toBe('!reg:sv')
  })
  it('account data 指向不存在房间 → 置空（可走候选兜底）', async () => {
    sdk.accountData.set(REGISTRY_ACCOUNT_DATA_TYPE, { roomId: '!gone:sv' })
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.registryRoomId).toBeNull()
  })
  it('候选兜底 = 含 team.* state 的已加入房间', () => {
    const store = useTeamRegistryStore()
    const cands = store.registryCandidateRooms()
    expect(cands.map(c => c.roomId)).toContain('!reg:sv')
    expect(cands.map(c => c.roomId)).not.toContain('!plain:sv')
  })
})

describe('rebuild 投影', () => {
  it('leaders + accounts 投影，伪造条目（sender≠stateKey）丢弃', async () => {
    sdk.client.getRoom('!reg:sv').currentState.getStateEvents().push(
      { type: TEAM_EVENT_TYPES.account, stateKey: '@fake:sv', sender: '@mallory:sv', content: { displayName: 'F', agentTeams: [], updatedAt: 1 } },
    )
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    await store.rebuild()
    expect(store.leaders).toEqual(['@lead:sv'])
    expect(store.accounts.map(a => a.userId)).toEqual(['@bob:sv'])
    expect(store.ready).toBe(true)
  })
})

describe('建房（leader）', () => {
  it('createRoom 带 PL 覆盖 + 写 account data + 写 leaders state', async () => {
    const store = useTeamRegistryStore()
    const roomId = await store.createRegistryRoom('Swarm Teams', ['@bob:sv'])
    expect(roomId).toBe('!new:sv')
    expect(sdk.client.createRoom).toHaveBeenCalledWith(expect.objectContaining({
      visibility: 'private',
      name: 'Swarm Teams',
      invite: ['@bob:sv'],
      power_level_content_override: REGISTRY_ROOM_POWER_LEVELS,
    }))
    expect(sdk.sent.accountData).toContain(REGISTRY_ACCOUNT_DATA_TYPE)
    const leadersWrite = sdk.sent.stateEvents.find(s => s.type === TEAM_EVENT_TYPES.leaders)
    expect(leadersWrite?.content).toEqual({ leaders: ['@alice:sv'] })
    expect(store.registryRoomId).toBe('!new:sv')
  })
})

describe('写 account（成员自声明）', () => {
  it('sendStateEvent 到注册房间，stateKey=自己 userId', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    const ok = await store.writeSelfAccount([{ slug: 'dev', name: 'Dev', profiles: ['pa'], defaultProfile: 'pa' }])
    expect(ok).toBe(true)
    const w = sdk.sent.stateEvents.find(s => s.type === TEAM_EVENT_TYPES.account && s.stateKey === '@alice:sv')
    expect(w).toBeTruthy()
    expect((w!.content as { agentTeams: unknown[] }).agentTeams).toHaveLength(1)
  })
  it('未配置注册房间 → false 且不动 SDK', async () => {
    const store = useTeamRegistryStore()
    expect(await store.writeSelfAccount([])).toBe(false)
    expect(sdk.sent.stateEvents.filter(s => s.type === TEAM_EVENT_TYPES.account)).toHaveLength(0)
  })
})

describe('ensureListening 幂等 + 增量触发 rebuild', () => {
  it('两次 ensureListening 只挂一次监听；Timeline 相关事件触发投影刷新', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    store.ensureListening()
    store.ensureListening()
    await nextTick()
    expect((sdk.listeners.get('Room.timeline') ?? [])).toHaveLength(1)
    const before = store.accounts.length
    sdk.emit('Room.timeline', sdk.sdkEvent('!reg:sv', { type: TEAM_EVENT_TYPES.account, stateKey: '@carol:sv', sender: '@carol:sv', content: { displayName: 'Carol', agentTeams: [], updatedAt: 2 } }), sdk.client.getRoom('!reg:sv'))
    await nextTick()
    await Promise.resolve()
    expect(store.accounts.length).toBe(before + 1)
    sdk.emit('Room.timeline', sdk.sdkEvent('!reg:sv', { type: 'm.room.message', stateKey: '', sender: '@x:sv', content: {} }), sdk.client.getRoom('!reg:sv'))
    await nextTick()
    expect(store.accounts.length).toBe(before + 1) // 无关事件不触发
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/team-registry-store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 stores/team-registry.ts**

```ts
// overlay/custom/client/matrix-teams/stores/team-registry.ts
// 注册房间 store：发现（account data + 候选兜底）、建房（PL 矩阵）、写 account/leaders、
// Timeline 监听 → 全量 rebuild（房间事件低频，整房重投影换取无增量一致性漏洞）。
// 注意：不占用 matrixEventBus（单槽 ref，属 matrix-chat 模块内部），自挂 SDK 监听。
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { RoomEvent } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import {
  TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, REGISTRY_ROOM_POWER_LEVELS,
  isSwarmStudioEventType, parseLeadersContent, parseDutyContent,
  type AgentTeam, type DutyContent,
} from '../protocol'
import { projectAccounts, undeclaredMembers, type TeamAccountView, type RawStateEvent } from '../adapters/accounts'

function extractStateEvents(room: { currentState: { getStateEvents(type?: string): unknown[] } }): RawStateEvent[] {
  const out: RawStateEvent[] = []
  for (const ev of room.currentState.getStateEvents() as Array<Record<string, unknown>>) {
    const getType = ev.getType as (() => string) | undefined
    const getStateKey = ev.getStateKey as (() => string | undefined) | undefined
    const getContent = ev.getContent as (() => unknown) | undefined
    if (!getType || !getStateKey || !getContent) continue
    const stateKey = getStateKey()
    const sender = (ev.sender as { userId?: string } | undefined)?.userId ?? null
    if (stateKey === undefined || sender === null) continue
    out.push({ type: getType(), stateKey, sender, content: getContent() })
  }
  return out
}

export const useTeamRegistryStore = defineStore('matrix-team-registry', () => {
  const matrixClientStore = useMatrixClientStore()
  const registryRoomId = ref<string | null>(null)
  const accounts = ref<TeamAccountView[]>([])
  const leaders = ref<string[]>([])
  const undeclared = ref<string[]>([])
  const duties = ref<Record<string, DutyContent>>({})
  const ready = ref(false)
  const lastError = ref<string | null>(null)

  const isLeader = computed(() => !!matrixClientStore.userId && leaders.value.includes(matrixClientStore.userId))

  function currentRoom(): ReturnType<typeof matrixClientStore.client.value.getRoom> | null {
    const client = matrixClientStore.client
    if (!client || !registryRoomId.value) return null
    return client.getRoom(registryRoomId.value) ?? null
  }

  async function rebuild(): Promise<void> {
    const room = currentRoom()
    const client = matrixClientStore.client
    if (!room || !client) { ready.value = false; return }
    const events = extractStateEvents(room)
    const leadersEv = events.find(e => e.type === TEAM_EVENT_TYPES.leaders && e.stateKey === '')
    const parsedLeaders = parseLeadersContent(leadersEv?.content)?.leaders ?? []
    leaders.value = parsedLeaders
    accounts.value = projectAccounts(events, parsedLeaders)
    const members = (room.getJoinedMembers?.() as Array<{ userId: string }> | undefined)?.map(m => m.userId) ?? []
    undeclared.value = undeclaredMembers(events, parsedLeaders, members)
    const dutyMap: Record<string, DutyContent> = {}
    for (const ev of events) {
      if (ev.type !== TEAM_EVENT_TYPES.duty) continue
      const duty = parseDutyContent(ev.content)
      if (duty) dutyMap[ev.stateKey] = duty
    }
    duties.value = dutyMap
    ready.value = true
  }

  // ── 发现 ──
  async function detectRegistry(): Promise<void> {
    const client = matrixClientStore.client
    if (!client) return
    const content = client.getAccountData(REGISTRY_ACCOUNT_DATA_TYPE)?.content as { roomId?: unknown } | undefined
    const rid = content && typeof content.roomId === 'string' ? content.roomId : null
    registryRoomId.value = rid && client.getRoom(rid) ? rid : null
    if (registryRoomId.value) await rebuild()
  }

  function registryCandidateRooms(): Array<{ roomId: string; name: string }> {
    const client = matrixClientStore.client
    if (!client) return []
    const out: Array<{ roomId: string; name: string }> = []
    for (const room of client.getRooms() as Array<{ roomId: string; name?: string }>) {
      const full = client.getRoom(room.roomId)
      if (!full) continue
      if (extractStateEvents(full).some(e => e.type === TEAM_EVENT_TYPES.account || e.type === TEAM_EVENT_TYPES.leaders)) {
        out.push({ roomId: room.roomId, name: room.name ?? room.roomId })
      }
    }
    return out
  }

  async function setRegistryRoom(roomId: string): Promise<void> {
    const client = matrixClientStore.client
    if (!client) return
    registryRoomId.value = roomId
    await client.setAccountData(REGISTRY_ACCOUNT_DATA_TYPE, { roomId })
    await rebuild()
  }

  // ── 建房（leader）──
  async function createRegistryRoom(name: string, invitees: string[]): Promise<string | null> {
    const client = matrixClientStore.client
    if (!client) { lastError.value = 'matrix offline'; return null }
    try {
      const result = await client.createRoom({
        visibility: 'private',
        name,
        invite: invitees,
        power_level_content_override: REGISTRY_ROOM_POWER_LEVELS,
      } as Parameters<typeof client.createRoom>[0])
      registryRoomId.value = result.room_id
      await client.setAccountData(REGISTRY_ACCOUNT_DATA_TYPE, { roomId: result.room_id })
      const selfId = matrixClientStore.userId ?? client.getUserId() ?? ''
      await client.sendStateEvent(result.room_id, TEAM_EVENT_TYPES.leaders, { leaders: [selfId] }, '')
      await rebuild()
      return result.room_id
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  // ── 写 ──
  async function writeSelfAccount(agentTeams: AgentTeam[]): Promise<boolean> {
    const client = matrixClientStore.client
    const selfId = matrixClientStore.userId
    if (!client || !selfId || !registryRoomId.value) return false
    const displayName = selfId.split(':')[0].replace(/^@/, '')
    try {
      await client.sendStateEvent(
        registryRoomId.value, TEAM_EVENT_TYPES.account,
        { displayName, agentTeams, updatedAt: Date.now() }, selfId,
      )
      await rebuild()
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  async function writeLeaders(list: string[]): Promise<boolean> {
    const client = matrixClientStore.client
    if (!client || !registryRoomId.value) return false
    try {
      await client.sendStateEvent(registryRoomId.value, TEAM_EVENT_TYPES.leaders, { leaders: list }, '')
      await rebuild()
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  async function inviteMember(userId: string): Promise<boolean> {
    const client = matrixClientStore.client
    if (!client || !registryRoomId.value) return false
    try {
      await client.invite(registryRoomId.value, userId)
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  // ── 监听 ──
  let listening = false
  /** 测试钩子：直接指定房间（绕过 account data 发现）。 */
  function attachRoom(roomId: string): void { registryRoomId.value = roomId }

  function ensureListening(): void {
    if (listening) return
    listening = true
    watch(() => matrixClientStore.client, (client, prev) => {
      if (prev) prev.off(RoomEvent.Timeline, onTimeline)
      if (!client) return
      client.on(RoomEvent.Timeline, onTimeline)
      void detectRegistry()
    }, { immediate: true })
  }

  async function onTimeline(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string }
    const r = room as { roomId?: string } | undefined
    if (!ev.getType || !r?.roomId) return
    if (r.roomId !== registryRoomId.value) return
    if (!isSwarmStudioEventType(ev.getType())) return
    await rebuild()
  }

  return {
    registryRoomId, accounts, leaders, undeclared, duties, ready, lastError, isLeader,
    ensureListening, rebuild, detectRegistry, registryCandidateRooms, setRegistryRoom,
    createRegistryRoom, writeSelfAccount, writeLeaders, inviteMember, attachRoom,
  }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/team-registry-store.test.ts`
Expected: PASS。若 mock 的 `getJoinedMembers` 路径报错，按报错补 mock 字段（SDK Room 接口面较大，以测试实际触达为准）。

- [ ] **Step 5: Commit**

```bash
git add custom/client/matrix-teams/
git commit -m "feat(matrix-teams): team registry store (discovery/create/write/listen)"
```

---

### Task 4: AgentTeamEditor + TeamsManagePanel UI

**Files:**
- Create: `custom/client/matrix-teams/components/AgentTeamEditor.vue`
- Create: `custom/client/matrix-teams/views/TeamsManagePanel.vue`
- Test: `custom/client/matrix-teams/__tests__/teams-panel.test.ts`

**Interfaces:**
- Consumes: Task 3 `useTeamRegistryStore` 全部导出；`useProfilesStore`（`@/stores/hermes/profiles`，字段 `profiles: Ref<HermesProfile[]>`，`HermesProfile.name` 为本地 profile 名）；Task 1 `slugify`/`AgentTeam`
- Produces: `TeamsManagePanel.vue`（默认导出 SFC，无 props；`data-testid="teams-panel"`；内部三区：未配置注册房间时的创建/候选区 `data-testid="teams-setup"`、账号树 `data-testid="teams-accounts"`、自己条目的编辑器 `data-testid="teams-editor"`、leader 的邀请/leader 管理区 `data-testid="teams-admin"`）。i18n 键 `teams.*`（Task 5 patch 注入，本任务组件先引用键，测试断言键字符串而非译文）。

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/teams-panel.test.ts`：

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/teams-panel.test.ts
// Teams 管理面板守门：未配置态（创建+候选）、账号树渲染、自己可编辑、leader 管理区显隐。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'

const registryState = vi.hoisted(() => ({
  registryRoomId: { value: null as string | null },
  accounts: { value: [] as Array<Record<string, unknown>> },
  leaders: { value: [] as string[] },
  undeclared: { value: [] as string[] },
  ready: { value: false },
  lastError: { value: null },
  isLeader: { value: false },
  ensureListening: vi.fn(),
  detectRegistry: vi.fn(async () => {}),
  registryCandidateRooms: vi.fn(() => [{ roomId: '!reg:sv', name: 'Swarm Teams' }]),
  setRegistryRoom: vi.fn(async () => {}),
  createRegistryRoom: vi.fn(async () => '!new:sv'),
  writeSelfAccount: vi.fn(async () => true),
  writeLeaders: vi.fn(async () => true),
  inviteMember: vi.fn(async () => true),
  attachRoom: vi.fn(),
  rebuild: vi.fn(async () => {}),
}))
vi.mock('../stores/team-registry', () => ({ useTeamRegistryStore: () => registryState }))
vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => ({ profiles: { value: [{ name: 'alice' }, { name: 'alice-2' }] } }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: {} }, userId: { value: '@alice:sv' }, authenticated: { value: true } }),
}))

import TeamsManagePanel from '../views/TeamsManagePanel.vue'

const i18n = createI18n({
  legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
  messages: { en: { teams: {
    title: 'Teams', 'registry.none': 'No registry', 'registry.create': 'Create', 'registry.setName': 'Name',
    'registry.inviteIds': 'Invite', 'registry.candidates': 'Candidates', 'registry.useThis': 'Use',
    accounts: 'Accounts', 'accounts.empty': 'Empty', 'leader.badge': 'leader', 'leader.manage': 'Leaders',
    'leader.add': 'Add', 'invite.button': 'Invite', 'self.hint': 'Edit', matrixOffline: 'offline',
    agentTeams: 'Agent Teams', 'agentTeams.add': 'Add team', 'agentTeams.name': 'Name',
    'agentTeams.profiles': 'Profiles', 'agentTeams.defaultProfile': 'Default', 'agentTeams.save': 'Save',
  } } },
})

beforeEach(() => { setActivePinia(createPinia()) })

function mountPanel() {
  return mount(TeamsManagePanel, { global: { plugins: [i18n], stubs: { teleport: true } } })
}

describe('未配置注册房间', () => {
  it('渲染创建区与候选房间；候选可设定', async () => {
    registryState.registryRoomId.value = null
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-setup"]').exists()).toBe(true)
    const cand = w.find('[data-testid="teams-candidate-!reg:sv"]')
    expect(cand.exists()).toBe(true)
    await cand.trigger('click')
    expect(registryState.setRegistryRoom).toHaveBeenCalledWith('!reg:sv')
  })
  it('填写名称点创建 → createRegistryRoom（邀请框留空传 []）', async () => {
    registryState.createRegistryRoom.mockClear()
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="teams-create-name"]').setValue('Swarm Teams')
    await w.find('[data-testid="teams-create-submit"]').trigger('click')
    await flushPromises()
    expect(registryState.createRegistryRoom).toHaveBeenCalledWith('Swarm Teams', [])
  })
})

describe('已配置注册房间', () => {
  beforeEach(() => {
    registryState.registryRoomId.value = '!reg:sv'
    registryState.accounts.value = [
      { userId: '@alice:sv', displayName: 'alice', agentTeams: [{ slug: 'dev', name: 'Dev', profiles: ['alice'], defaultProfile: 'alice' }], isLeader: false, declared: true },
      { userId: '@bob:sv', displayName: 'bob', agentTeams: [], isLeader: true, declared: true },
    ]
    registryState.leaders.value = ['@bob:sv']
    registryState.isLeader.value = true
    registryState.undeclared.value = ['@carol:sv']
  })
  it('账号树渲染成员条目 + agentTeams + leader 徽标', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-account-@alice:sv"]').exists()).toBe(true)
    expect(w.find('[data-testid="teams-account-@bob:sv"]').exists()).toBe(true)
    expect(w.find('[data-testid="teams-account-@bob:sv"] [data-testid="teams-leader-badge"]').exists()).toBe(true)
    expect(w.text()).toContain('@alice:sv/dev')
  })
  it('当前登录账号显示编辑器；保存调 writeSelfAccount', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-editor"]').exists()).toBe(true)
    await w.find('[data-testid="teams-editor-save"]').trigger('click')
    await flushPromises()
    expect(registryState.writeSelfAccount).toHaveBeenCalled()
  })
  it('isLeader=true 显示邀请与 leader 管理；false 隐藏', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="teams-admin"]').exists()).toBe(true)
    registryState.isLeader.value = false
    await flushPromises()
    expect(w.find('[data-testid="teams-admin"]').exists()).toBe(false)
  })
  it('邀请输入 + 点击 → inviteMember(userId)', async () => {
    registryState.inviteMember.mockClear()
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="teams-invite-input"]').setValue('@carol:sv')
    await w.find('[data-testid="teams-invite-submit"]').trigger('click')
    expect(registryState.inviteMember).toHaveBeenCalledWith('@carol:sv')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/teams-panel.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 AgentTeamEditor.vue 与 TeamsManagePanel.vue**

`custom/client/matrix-teams/components/AgentTeamEditor.vue`（编辑当前登录账号的 agent teams 草稿，保存整体提交）：

```vue
<!-- overlay/custom/client/matrix-teams/components/AgentTeamEditor.vue -->
<!-- 编辑本账号 agent teams：增删行、profiles 多选（本机 profiles）、默认 profile 单选。 -->
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProfilesStore } from '@/stores/hermes/profiles'
import { slugify, type AgentTeam } from '../protocol'

const props = defineProps<{ initial: AgentTeam[] }>()
const emit = defineEmits<{ (e: 'save', teams: AgentTeam[]): void }>()
const { t } = useI18n()
const profilesStore = useProfilesStore()
const localProfiles = ref<string[]>(profilesStore.profiles.map(p => p.name))

const rows = ref<Array<{ slug: string; name: string; profiles: string[]; defaultProfile: string }>>(
  props.initial.map(tm => ({ ...tm, defaultProfile: tm.defaultProfile ?? tm.profiles[0] ?? '' })),
)

function addRow(): void {
  if (rows.value.length >= 20) return // spec §10 限幅
  rows.value.push({ slug: slugify(`team-${rows.value.length + 1}`), name: '', profiles: [], defaultProfile: '' })
}
function removeRow(i: number): void { rows.value.splice(i, 1) }
function syncSlug(i: number): void { rows.value[i].slug = slugify(rows.value[i].name || `team-${i + 1}`) }
function toggleProfile(i: number, p: string): void {
  const row = rows.value[i]
  const at = row.profiles.indexOf(p)
  if (at >= 0) {
    row.profiles.splice(at, 1)
    if (row.defaultProfile === p) row.defaultProfile = row.profiles[0] ?? ''
  } else if (row.profiles.length < 20) {
    row.profiles.push(p)
    if (!row.defaultProfile) row.defaultProfile = p
  }
}
function submit(): void {
  emit('save', rows.value
    .filter(r => r.name.trim() !== '' && r.profiles.length > 0)
    .map(r => ({ slug: slugify(r.name), name: r.name.trim(), profiles: r.profiles, defaultProfile: r.defaultProfile || r.profiles[0] })))
}
</script>

<template>
  <div class="ate" data-testid="teams-editor">
    <div v-for="(row, i) in rows" :key="i" class="ate__row" :data-testid="`teams-editor-row-${i}`">
      <input class="ate__name" :data-testid="`teams-editor-name-${i}`" v-model="row.name"
        :placeholder="t('teams.agentTeams.name')" @change="syncSlug(i)" />
      <span class="ate__slug">{{ row.slug }}</span>
      <div class="ate__profiles">
        <button v-for="p in localProfiles" :key="p" type="button"
          class="ate__profile" :class="{ 'ate__profile--on': row.profiles.includes(p) }"
          :data-testid="`teams-editor-profile-${i}-${p}`" @click="toggleProfile(i, p)">{{ p }}</button>
      </div>
      <select class="ate__default" v-model="row.defaultProfile" :data-testid="`teams-editor-default-${i}`"
        :aria-label="t('teams.agentTeams.defaultProfile')">
        <option value="">{{ t('teams.agentTeams.defaultProfile') }}</option>
        <option v-for="p in row.profiles" :key="p" :value="p">{{ p }}</option>
      </select>
      <button type="button" class="ate__remove" :data-testid="`teams-editor-remove-${i}`"
        @click="removeRow(i)">✕</button>
    </div>
    <div class="ate__actions">
      <button type="button" data-testid="teams-editor-add" @click="addRow">{{ t('teams.agentTeams.add') }}</button>
      <button type="button" class="ate__save" data-testid="teams-editor-save" @click="submit">
        {{ t('teams.agentTeams.save') }}</button>
    </div>
  </div>
</template>

<style scoped>
.ate { display: flex; flex-direction: column; gap: 8px; }
.ate__row { display: grid; grid-template-columns: 120px 90px 1fr 110px 24px; gap: 6px; align-items: center; }
.ate__name, .ate__default { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 3px 6px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); }
.ate__slug { font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; }
.ate__profiles { display: flex; flex-wrap: wrap; gap: 4px; }
.ate__profile { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: 999px; padding: 1px 8px; font-size: 11px; cursor: pointer; font-family: inherit; }
.ate__profile--on { border-color: var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); }
.ate__actions { display: flex; gap: 8px; }
.ate__remove { border: none; background: none; color: var(--color-danger, #e11d48); cursor: pointer; }
.ate__save { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 3px 12px; cursor: pointer; }
</style>
```

`custom/client/matrix-teams/views/TeamsManagePanel.vue`：

```vue
<!-- overlay/custom/client/matrix-teams/views/TeamsManagePanel.vue -->
<!-- Teams 管理：注册房间建立/候选兜底 + 账号树（自声明 agent teams）+ leader 管理（邀请/leaders）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamRegistryStore } from '../stores/team-registry'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { agentTeamGlobalId, type AgentTeam } from '../protocol'
import AgentTeamEditor from '../components/AgentTeamEditor.vue'

const { t } = useI18n()
const registry = useTeamRegistryStore()
const matrixClientStore = useMatrixClientStore()

const matrixOnline = computed(() => matrixClientStore.authenticated && !!matrixClientStore.client)

// ── 建房/候选 ──
const roomName = ref('')
const inviteIds = ref('')
async function submitCreate(): Promise<void> {
  const ids = inviteIds.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
  const ok = await registry.createRegistryRoom(roomName.value.trim() || 'Swarm Teams', ids)
  if (ok) { roomName.value = ''; inviteIds.value = '' }
}

// ── 账号树 ──
const editing = ref(false)
const selfUserId = computed(() => matrixClientStore.userId)
const selfAccount = computed(() => registry.accounts.find(a => a.userId === selfUserId.value) ?? null)
const selfTeams = computed<AgentTeam[]>(() => selfAccount.value?.agentTeams ?? [])
async function saveSelfTeams(teams: AgentTeam[]): Promise<void> {
  if (await registry.writeSelfAccount(teams)) editing.value = false
}

// ── leader 管理 ──
const inviteInput = ref('')
async function submitInvite(): Promise<void> {
  const id = inviteInput.value.trim()
  if (!id) return
  if (await registry.inviteMember(id)) inviteInput.value = ''
}
const leaderAddInput = ref('')
async function addLeader(): Promise<void> {
  const id = leaderAddInput.value.trim()
  if (!id || registry.leaders.includes(id)) return
  if (await registry.writeLeaders([...registry.leaders, id])) leaderAddInput.value = ''
}
async function removeLeader(id: string): Promise<void> {
  await registry.writeLeaders(registry.leaders.filter(l => l !== id))
}

onMounted(() => {
  registry.ensureListening()
  void registry.detectRegistry()
})
</script>

<template>
  <div class="tmp" data-testid="teams-panel">
    <div v-if="!matrixOnline" class="tmp__offline">{{ t('teams.matrixOffline') }}</div>

    <div v-else-if="!registry.registryRoomId" class="tmp__setup" data-testid="teams-setup">
      <div class="tmp__hint">{{ t('teams.registry.none') }}</div>
      <input v-model="roomName" class="tmp__input" data-testid="teams-create-name"
        :placeholder="t('teams.registry.setName')" />
      <input v-model="inviteIds" class="tmp__input" data-testid="teams-create-invite"
        :placeholder="t('teams.registry.inviteIds')" />
      <button type="button" class="tmp__primary" data-testid="teams-create-submit"
        @click="submitCreate">{{ t('teams.registry.create') }}</button>

      <div v-if="registry.registryCandidateRooms().length" class="tmp__cands">
        <div class="tmp__hint">{{ t('teams.registry.candidates') }}</div>
        <button v-for="c in registry.registryCandidateRooms()" :key="c.roomId" type="button"
          class="tmp__cand" :data-testid="`teams-candidate-${c.roomId}`"
          @click="registry.setRegistryRoom(c.roomId)">
          {{ c.name }} · {{ t('teams.registry.useThis') }}</button>
      </div>
    </div>

    <template v-else>
      <header class="tmp__head">
        <span class="tmp__title">{{ t('teams.title') }}</span>
        <span class="tmp__room" :title="registry.registryRoomId">{{ t('teams.registry.room') }}: {{ registry.registryRoomId }}</span>
      </header>

      <div class="tmp__body">
        <section class="tmp__accounts" data-testid="teams-accounts">
          <div class="tmp__sec">{{ t('teams.accounts') }}</div>
          <div v-if="registry.accounts.length === 0" class="tmp__empty">{{ t('teams.accounts.empty') }}</div>
          <div v-for="a in registry.accounts" :key="a.userId" class="tmp__account"
            :data-testid="`teams-account-${a.userId}`">
            <div class="tmp__account-line1">
              <span class="tmp__account-name">{{ a.displayName }}</span>
              <span class="tmp__account-id">{{ a.userId }}</span>
              <span v-if="a.isLeader" class="tmp__leader" data-testid="teams-leader-badge">
                {{ t('teams.leader.badge') }}</span>
            </div>
            <div v-for="tm in a.agentTeams" :key="tm.slug" class="tmp__team">
              <span class="tmp__team-id">{{ a.userId }}/{{ tm.slug }}</span>
              <span class="tmp__team-name">{{ tm.name }}</span>
              <span class="tmp__team-profiles">{{ tm.profiles.join(', ') }}</span>
            </div>
          </div>
          <div v-for="u in registry.undeclared" :key="u" class="tmp__undeclared"
            :data-testid="`teams-undeclared-${u}`">{{ u }}</div>
        </section>

        <aside class="tmp__side">
          <section class="tmp__self">
            <div class="tmp__sec">{{ t('teams.self.hint') }}</div>
            <button v-if="!editing" type="button" data-testid="teams-editor-open"
              @click="editing = true">{{ t('teams.self.hint') }}</button>
            <AgentTeamEditor v-else :initial="selfTeams" @save="saveSelfTeams" />
          </section>

          <section v-if="registry.isLeader" class="tmp__admin" data-testid="teams-admin">
            <div class="tmp__sec">{{ t('teams.leader.manage') }}</div>
            <div class="tmp__invite-row">
              <input v-model="inviteInput" class="tmp__input" data-testid="teams-invite-input"
                placeholder="@user:server" />
              <button type="button" data-testid="teams-invite-submit"
                @click="submitInvite">{{ t('teams.invite.button') }}</button>
            </div>
            <div class="tmp__leaders">
              <span v-for="l in registry.leaders" :key="l" class="tmp__leader-chip">
                {{ l }}
                <button v-if="registry.leaders.length > 1" type="button" class="tmp__leader-x"
                  :data-testid="`teams-leader-remove-${l}`" @click="removeLeader(l)">✕</button>
              </span>
            </div>
            <div class="tmp__invite-row">
              <input v-model="leaderAddInput" class="tmp__input" data-testid="teams-leader-add-input"
                placeholder="@user:server" />
              <button type="button" data-testid="teams-leader-add"
                @click="addLeader">{{ t('teams.leader.add') }}</button>
            </div>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tmp { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.tmp__offline, .tmp__empty { font-size: 12px; color: var(--text-secondary); padding: 8px; }
.tmp__setup { display: flex; flex-direction: column; gap: 8px; max-width: 420px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-standard); }
.tmp__hint { font-size: 12px; color: var(--text-secondary); }
.tmp__input { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 4px 8px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); }
.tmp__primary { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 4px 14px; cursor: pointer; font-family: inherit; }
.tmp__cands { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.tmp__cand { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: var(--radius-standard); padding: 4px 10px; cursor: pointer; font-family: inherit; text-align: left; }
.tmp__head { display: flex; align-items: baseline; gap: 10px; }
.tmp__title { font-size: 14px; font-weight: 600; }
.tmp__room { font-size: 11px; color: var(--text-secondary); }
.tmp__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.tmp__accounts { flex: 1 1 auto; min-width: 0; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.tmp__side { flex: 0 0 360px; display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
.tmp__self, .tmp__admin { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.tmp__sec { font-size: 12px; font-weight: 600; }
.tmp__account { display: flex; flex-direction: column; gap: 3px; }
.tmp__account-line1 { display: flex; align-items: center; gap: 8px; }
.tmp__account-name { font-weight: 600; font-size: 13px; }
.tmp__account-id { font-size: 11px; color: var(--text-secondary); }
.tmp__leader { font-size: 10px; border: 1px solid var(--color-warning, #f59e0b); color: var(--color-warning, #f59e0b); border-radius: 999px; padding: 0 6px; }
.tmp__team { display: flex; gap: 8px; font-size: 12px; padding-left: 10px; }
.tmp__team-id { color: var(--color-primary, #3b82f6); font-size: 11px; }
.tmp__team-profiles { color: var(--text-secondary); font-size: 11px; }
.tmp__undeclared { font-size: 11px; color: var(--text-secondary); opacity: 0.7; }
.tmp__invite-row { display: flex; gap: 6px; }
.tmp__leaders { display: flex; flex-wrap: wrap; gap: 4px; }
.tmp__leader-chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.tmp__leader-x { border: none; background: none; color: var(--color-danger, #e11d48); cursor: pointer; padding: 0; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/teams-panel.test.ts`
Expected: PASS（若选择器命中失败，以 data-testid 为准调整测试与实现的匹配，不许删断言迁就实现）

- [ ] **Step 5: Commit**

```bash
git add custom/client/matrix-teams/
git commit -m "feat(matrix-teams): teams manage panel with agent team editor"
```

---

### Task 5: ManageScene 二级 tab 挂载 + i18n patch + P1 收口

**Files:**
- Modify: `custom/client/ia2/views/scenes/ManageScene.vue`（顶部加 tab 条；现有内容归「任务与值守」tab，新 tab 挂 TeamsManagePanel）
- Modify (test): `custom/client/ia2/__tests__/manage-scene.test.ts`（追加 tab 守门用例）
- Create (patch, 经五步法): `patches/288-client-i18n-matrix-teams-zh.patch`、`patches/289-client-i18n-matrix-teams-en.patch`（编号开工时查重顺延）
- Modify: `patches/series`（追加两行）

**Interfaces:**
- Consumes: Task 4 `TeamsManagePanel.vue`
- Produces: ManageScene 新增 `data-testid="mscene-tabs"`、`mscene-tab-duty`、`mscene-tab-teams`；i18n 键 `loopScenes.manage.tabDuty` / `loopScenes.manage.tabTeams` 与 `teams.*` 全量（zh/en）

- [ ] **Step 1: 扩展 manage-scene.test.ts（先失败）**

在 `custom/client/ia2/__tests__/manage-scene.test.ts` 顶部 mock 区追加（与既有 `vi.mock` 并列）：

```ts
vi.mock('@/custom/matrix-teams/views/TeamsManagePanel.vue', () => ({
  default: { name: 'TeamsPanelStub', template: '<div data-testid="teams-panel-stub" />' },
}))
```

并在文件尾部 `describe` 内追加用例（沿用该文件既有的 mount 辅助；若其结构为每用例独立 mount，则按同构方式追加）：

```ts
it('二级 tab：默认任务与值守视图，切换后挂 TeamsManagePanel', async () => {
  const w = mountScene() // 该文件既有的挂载辅助（router+pinia+i18n stub），无则按首个用例的 mount 方式复制
  expect(w.find('[data-testid="mscene-tab-duty"]').exists()).toBe(true)
  expect(w.find('[data-testid="mscene-tab-teams"]').exists()).toBe(true)
  expect(w.find('[data-testid="teams-panel-stub"]').exists()).toBe(false)
  await w.find('[data-testid="mscene-tab-teams"]').trigger('click')
  expect(w.find('[data-testid="teams-panel-stub"]').exists()).toBe(true)
  expect(w.find('[data-testid="mscene-people"]').exists()).toBe(false)
  await w.find('[data-testid="mscene-tab-duty"]').trigger('click')
  expect(w.find('[data-testid="mscene-people"]').exists()).toBe(true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/ia2/__tests__/manage-scene.test.ts`
Expected: FAIL（找不到 `mscene-tab-*`）

- [ ] **Step 3: 改 ManageScene.vue**

script 区追加：

```ts
import { defineAsyncComponent } from 'vue'
const TeamsManagePanel = defineAsyncComponent(() =>
  import('@/custom/matrix-teams/views/TeamsManagePanel.vue'))
const sceneTab = ref<'duty' | 'teams'>('duty')
```

（`ref` 已在文件 import 列表中。）template 区包裹：`<section class="mscene" ...>` 内最前插入 tab 条，原「人员聚合条 + body」与 TeamsManagePanel 按 `sceneTab` 切换：

```vue
<div class="mscene__tabs" data-testid="mscene-tabs">
  <button type="button" class="mscene__tab" :class="{ 'mscene__tab--on': sceneTab === 'duty' }"
    data-testid="mscene-tab-duty" @click="sceneTab = 'duty'">{{ t('loopScenes.manage.tabDuty') }}</button>
  <button type="button" class="mscene__tab" :class="{ 'mscene__tab--on': sceneTab === 'teams' }"
    data-testid="mscene-tab-teams" @click="sceneTab = 'teams'">{{ t('loopScenes.manage.tabTeams') }}</button>
</div>
<template v-if="sceneTab === 'duty'">
  <!-- 原人员聚合条 + mscene__body 整块原样移入 -->
</template>
<TeamsManagePanel v-else />
```

style 区追加：

```css
.mscene__tabs { flex: 0 0 auto; display: flex; gap: 6px; }
.mscene__tab { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: var(--radius-standard); padding: 3px 14px; cursor: pointer; font-size: 12px; font-family: inherit; }
.mscene__tab--on { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); font-weight: 600; }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/ia2/__tests__/manage-scene.test.ts`
Expected: PASS（新旧用例全绿）

- [ ] **Step 5: i18n patch（五步法）**

键值清单（`zh.ts` 与 `en.ts` 的 `export default {` 顶层各加一个 `teams: {...}` 块；`loopScenes.manage` 块内加 2 键）：

zh（`loopScenes.manage` 内）：`tabDuty: '任务与值守'`、`tabTeams: 'Teams 管理'`
zh（顶层 `teams` 块）：

```ts
teams: {
  title: 'Teams 管理',
  matrixOffline: 'Matrix 未连接，Teams 管理不可用',
  registry: {
    none: '尚未配置团队注册房间',
    create: '创建注册房间',
    setName: '注册房间名称',
    inviteIds: '邀请成员（Matrix ID，逗号分隔，可留空）',
    candidates: '检测到含团队数据的已加入房间',
    useThis: '设为注册房间',
    room: '注册房间',
  },
  accounts: '成员账号',
  'accounts.empty': '暂无成员声明 agent teams',
  'leader.badge': 'leader',
  'leader.manage': 'leader 管理',
  'leader.add': '添加 leader',
  'leader.remove': '移除',
  invite: { placeholder: '@user:server', button: '邀请' },
  self: { hint: '编辑本账号的 agent teams' },
  agentTeams: 'Agent Teams',
  'agentTeams.add': '新增 team',
  'agentTeams.name': '名称',
  'agentTeams.profiles': 'Profiles',
  'agentTeams.defaultProfile': '默认 profile',
  'agentTeams.save': '保存声明',
},
```

en（`loopScenes.manage` 内）：`tabDuty: 'Duties'`、`tabTeams: 'Teams'`
en（顶层 `teams` 块）：

```ts
teams: {
  title: 'Teams Management',
  matrixOffline: 'Matrix offline; teams management unavailable',
  registry: {
    none: 'No team registry room configured',
    create: 'Create registry room',
    setName: 'Registry room name',
    inviteIds: 'Invite members (Matrix IDs, comma separated, optional)',
    candidates: 'Joined rooms with team data detected',
    useThis: 'Use as registry',
    room: 'Registry room',
  },
  accounts: 'Member accounts',
  'accounts.empty': 'No member has declared agent teams yet',
  'leader.badge': 'leader',
  'leader.manage': 'Manage leaders',
  'leader.add': 'Add leader',
  'leader.remove': 'Remove',
  invite: { placeholder: '@user:server', button: 'Invite' },
  self: { hint: 'Edit agent teams of this account' },
  agentTeams: 'Agent Teams',
  'agentTeams.add': 'Add team',
  'agentTeams.name': 'Name',
  'agentTeams.profiles': 'Profiles',
  'agentTeams.defaultProfile': 'Default profile',
  'agentTeams.save': 'Save declaration',
},
```

五步法操作（编号若 288/289 被并行占用则顺延并写 series 段注）：

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
# 1) 临时改上游 locale（zh.ts 与 en.ts 按上方键值插入；插到 loopScenes 块之后、顶层合适缩进）
# 2) 产出 patch（各出一个）
git diff packages/client/src/i18n/locales/zh.ts > ../../overlay/patches/288-client-i18n-matrix-teams-zh.patch
git diff packages/client/src/i18n/locales/en.ts > ../../overlay/patches/289-client-i18n-matrix-teams-en.patch
# 3) 还原上游
git checkout -- packages/client/src/i18n/locales/
cd ../../overlay
# 4) series 登记（尾部追加两行）
printf '288-client-i18n-matrix-teams-zh.patch\n289-client-i18n-matrix-teams-en.patch\n' >> patches/series
# 5) 重放验证
npm run clean && npm run inject
npx vitest run custom/client/matrix-teams/ custom/client/ia2/__tests__/manage-scene.test.ts
```

- [ ] **Step 6: P1 收口门禁**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm test                                   # 全量全绿
npm run clean && npm run inject            # 重放
npm run build:full                         # 全链构建
```

（i18n coverage 门禁在 upstream `npm test` 内跑；若 overlay 侧无该入口，补跑 `cd upstream/hermes-studio && npx vitest run tests/client/i18n-coverage.test.ts`，须 18/18。）

- [ ] **Step 7: P1 冒烟（人工，双浏览器）**

dev 起两份客户端（或 ncwk-sim 双成员账号）：leader 侧创建注册房间并邀请成员 → 成员侧确认自动加入 → 成员侧声明 agent teams（选本机 profiles）→ leader 侧账号树实时出现该成员条目 → leader 添加第二个 leader 成功。任一步失败如实记录并修复后重跑。

- [ ] **Step 8: 合入 main**

```bash
git add -A && git commit -m "feat(matrix-teams): manage scene tab + i18n zh/en patches"
git checkout main && git merge --no-ff feat/matrix-teams-p1-registry
```

---

## Phase 2 — 群聊值守

### Task 6: duty 写入 + DutyAssignPanel

**Files:**
- Modify: `custom/client/matrix-teams/stores/team-registry.ts`（追加 `writeDuty`）
- Create: `custom/client/matrix-teams/components/DutyAssignPanel.vue`
- Test: `custom/client/matrix-teams/__tests__/duty-panel.test.ts`

**Interfaces:**
- Consumes: Task 3 store（`duties: Ref<Record<string, DutyContent>>` 已在 rebuild 填充）；`useMatrixRoomStore().sortedRooms`（`@/custom/matrix-chat/stores/matrix-room`，元素含 `roomId`/`name`）
- Produces:
  - `writeDuty(roomId: string, duty: { assigneeKind: 'account' | 'agentTeam'; assigneeId: string; roomName?: string }): Promise<boolean>`（覆盖写 state_key=roomId，附 `updatedBy`/`updatedAt`；`registry.isLeader` 为 false 时直接返回 false）
  - `clearDuty(roomId: string): Promise<boolean>`（`client.sendStateEvent(roomId, TEAM_EVENT_TYPES.duty, {}, roomId)` 空内容覆盖；读端解析失败即视为无值守）
  - DutyAssignPanel：`data-testid="duty-panel"`，房间下拉 `duty-room-select` + 目标下拉 `duty-target-select`（选项= 各账号 + 各 agentTeam 全局 id）+ 指派按钮 `duty-assign` + 清除按钮 `duty-clear` + 当前值守表 `duty-list`

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/duty-panel.test.ts`：

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/duty-panel.test.ts
// 值守守门：leader 才能写 duty；覆盖写带 updatedBy/updatedAt；非 leader 拒绝。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE } from '../protocol'

const sentState: Array<{ roomId: string; type: string; stateKey: string; content: unknown }> = []
const sdk = {
  client: {
    on: () => {}, off: () => {},
    getAccountData: (t: string) => t === REGISTRY_ACCOUNT_DATA_TYPE ? { content: { roomId: '!reg:sv' } } : undefined,
    setAccountData: async () => {},
    getRoom: () => ({
      getJoinedMembers: () => [{ userId: '@alice:sv' }, { userId: '@bob:sv' }],
      currentState: { getStateEvents: () => [
        { getType: () => TEAM_EVENT_TYPES.leaders, getStateKey: () => '', sender: { userId: '@alice:sv' }, getContent: () => ({ leaders: ['@alice:sv'] }) },
        { getType: () => TEAM_EVENT_TYPES.account, getStateKey: () => '@bob:sv', sender: { userId: '@bob:sv' }, getContent: () => ({ displayName: 'bob', agentTeams: [{ slug: 'ops', name: 'Ops', profiles: ['pb'] }], updatedAt: 1 }) },
        { getType: () => TEAM_EVENT_TYPES.duty, getStateKey: () => '!room1:sv', sender: { userId: '@alice:sv' }, getContent: () => ({ assigneeKind: 'account', assigneeId: '@bob:sv', updatedBy: '@alice:sv', updatedAt: 5 }) },
      ] },
    }),
    getRooms: () => [],
    sendStateEvent: async (roomId: string, type: string, content: unknown, stateKey: string) => {
      sentState.push({ roomId, type, stateKey, content })
    },
  },
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdk.client }, userId: { value: '@alice:sv' } }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ sortedRooms: { value: [
    { roomId: '!room1:sv', name: '客户一群' }, { roomId: '!room2:sv', name: '客户二群' },
  ] } }),
}))

import { useTeamRegistryStore } from '../stores/team-registry'

beforeEach(() => { setActivePinia(createPinia()); sentState.length = 0 })

describe('writeDuty / clearDuty', () => {
  it('leader 写 duty：state_key=房间 id，content 含 updatedBy/updatedAt', async () => {
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.isLeader).toBe(true)
    const ok = await store.writeDuty('!room2:sv', { assigneeKind: 'agentTeam', assigneeId: '@bob:sv/ops', roomName: '客户二群' })
    expect(ok).toBe(true)
    const w = sentState.find(s => s.type === TEAM_EVENT_TYPES.duty && s.stateKey === '!room2:sv')
    expect(w).toBeTruthy()
    expect(w!.content).toMatchObject({ assigneeKind: 'agentTeam', assigneeId: '@bob:sv/ops', updatedBy: '@alice:sv' })
    expect(typeof (w!.content as { updatedAt: number }).updatedAt).toBe('number')
  })
  it('rebuild 后 duties 含既有值守；clearDuty 用空 content 覆盖', async () => {
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.duties['!room1:sv']).toMatchObject({ assigneeKind: 'account', assigneeId: '@bob:sv' })
    expect(await store.clearDuty('!room1:sv')).toBe(true)
    expect(sentState.find(s => s.stateKey === '!room1:sv')!.content).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/duty-panel.test.ts`
Expected: FAIL（`writeDuty` 不存在）

- [ ] **Step 3: 实现 writeDuty/clearDuty（team-registry.ts 追加）**

在 store 定义内追加并加入 return 导出：

```ts
async function writeDuty(roomId: string, duty: { assigneeKind: 'account' | 'agentTeam'; assigneeId: string; roomName?: string }): Promise<boolean> {
  const client = matrixClientStore.client
  if (!client || !registryRoomId.value || !isLeader.value) return false
  const selfId = matrixClientStore.userId ?? ''
  try {
    await client.sendStateEvent(registryRoomId.value, TEAM_EVENT_TYPES.duty, {
      assigneeKind: duty.assigneeKind, assigneeId: duty.assigneeId, roomName: duty.roomName,
      updatedBy: selfId, updatedAt: Date.now(),
    }, roomId)
    await rebuild()
    return true
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : String(err)
    return false
  }
}

async function clearDuty(roomId: string): Promise<boolean> {
  const client = matrixClientStore.client
  if (!client || !registryRoomId.value || !isLeader.value) return false
  try {
    await client.sendStateEvent(registryRoomId.value, TEAM_EVENT_TYPES.duty, {}, roomId)
    await rebuild()
    return true
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : String(err)
    return false
  }
}
```

（return 列表追加 `writeDuty, clearDuty`。）

`DutyAssignPanel.vue`（值守面板，挂在 TeamsManagePanel 右栏或独立区块均可，本任务作为组件交付并在 Task 7 接线）：

```vue
<!-- overlay/custom/client/matrix-teams/components/DutyAssignPanel.vue -->
<!-- 群聊值守：leader 选房间 + 目标（账号或 agent team）→ 覆盖写 duty state；列表可清除。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamRegistryStore } from '../stores/team-registry'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { agentTeamGlobalId } from '../protocol'

const { t } = useI18n()
const registry = useTeamRegistryStore()
const roomStore = useMatrixRoomStore()

const selectedRoom = ref('')
const selectedTarget = ref('')
const rooms = computed(() => roomStore.sortedRooms.map(r => ({ roomId: r.roomId, name: r.name ?? r.roomId })))
const targets = computed(() => registry.accounts.flatMap(a => [
  { id: a.userId, label: a.displayName },
  ...a.agentTeams.map(tm => ({ id: agentTeamGlobalId(a.userId, tm.slug), label: `${a.displayName}/${tm.slug}` })),
]))
const dutyRows = computed(() => Object.entries(registry.duties)
  .map(([roomId, d]) => ({ roomId, ...d }))

async function assign(): Promise<void> {
  if (!selectedRoom.value || !selectedTarget.value) return
  const target = targets.value.find(t2 => t2.id === selectedTarget.value)!
  const isTeam = selectedTarget.value.includes('/')
  const room = rooms.value.find(r => r.roomId === selectedRoom.value)
  if (await registry.writeDuty(selectedRoom.value, {
    assigneeKind: isTeam ? 'agentTeam' : 'account',
    assigneeId: selectedTarget.value,
    roomName: room?.name,
  })) { selectedRoom.value = ''; selectedTarget.value = '' }
}

onMounted(() => { void registry.detectRegistry() })
</script>

<template>
  <div class="dap" data-testid="duty-panel">
    <div class="dap__sec">{{ t('teams.duty.title') }}</div>
    <div v-if="registry.isLeader" class="dap__form">
      <select v-model="selectedRoom" class="dap__select" data-testid="duty-room-select"
        :aria-label="t('teams.duty.chooseRoom')">
        <option value="">{{ t('teams.duty.chooseRoom') }}</option>
        <option v-for="r in rooms" :key="r.roomId" :value="r.roomId">{{ r.name }}</option>
      </select>
      <select v-model="selectedTarget" class="dap__select" data-testid="duty-target-select"
        :aria-label="t('teams.duty.to')">
        <option value="">{{ t('teams.duty.to') }}</option>
        <option v-for="tg in targets" :key="tg.id" :value="tg.id">{{ tg.label }}</option>
      </select>
      <button type="button" class="dap__primary" data-testid="duty-assign"
        @click="assign">{{ t('teams.duty.assign') }}</button>
    </div>
    <div class="dap__list" data-testid="duty-list">
      <div v-for="row in dutyRows" :key="row.roomId" class="dap__row">
        <span class="dap__room">{{ row.roomName ?? row.roomId }}</span>
        <span class="dap__assignee">{{ row.assigneeId }}</span>
        <span class="dap__by">{{ row.updatedBy }}</span>
        <button v-if="registry.isLeader" type="button" class="dap__clear" data-testid="duty-clear"
          @click="registry.clearDuty(row.roomId)">{{ t('teams.duty.clear') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dap { display: flex; flex-direction: column; gap: 8px; }
.dap__sec { font-size: 12px; font-weight: 600; }
.dap__form { display: flex; gap: 6px; flex-wrap: wrap; }
.dap__select { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 3px 6px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); max-width: 180px; }
.dap__primary { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 3px 12px; cursor: pointer; font-family: inherit; }
.dap__list { display: flex; flex-direction: column; gap: 4px; }
.dap__row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dap__room { font-weight: 600; }
.dap__assignee { color: var(--color-primary, #3b82f6); }
.dap__by { color: var(--text-secondary); font-size: 11px; }
.dap__clear { border: none; background: none; color: var(--color-danger, #e11d48); cursor: pointer; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/duty-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/matrix-teams-p2-duty  # 自 overlay main（P1 已合入）
git add custom/client/matrix-teams/
git commit -m "feat(matrix-teams): room duty assignment panel and store writes"
```

---

### Task 7: 房间列表值守徽标 + P2 收口

**Files:**
- Modify: `custom/client/matrix-chat/components/MatrixRoomList.vue`（房间条目追加值守徽标）
- Modify: `custom/client/matrix-teams/views/TeamsManagePanel.vue`（右栏挂 DutyAssignPanel）
- Test: `custom/client/matrix-teams/__tests__/duty-badge.test.ts`

**Interfaces:**
- Consumes: Task 2 `dutyAppliesToUser`；Task 3 store 的 `duties`/`accounts`；Task 6 `DutyAssignPanel`
- Produces: MatrixRoomList 房间条目在值守命中时渲染 `<span data-testid="room-duty-badge">`（文案 `t('teams.duty.mine')`）；新增纯函数 `onDutyRoomIds(duties: Record<string, DutyContent>, userId: string | null, accounts: TeamAccountView[]): Set<string>`（放 `adapters/accounts.ts`，徽标与后续值班台复用）

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/duty-badge.test.ts`：

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/duty-badge.test.ts
// 值守徽标守门：归属判定命中房间集合；MatrixRoomList 渲染徽标。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import type { DutyContent } from '../protocol'
import { onDutyRoomIds } from '../adapters/accounts'
import type { TeamAccountView } from '../adapters/accounts'

const accounts: TeamAccountView[] = [
  { userId: '@alice:sv', displayName: 'alice', isLeader: false, declared: true,
    agentTeams: [{ slug: 'ops', name: 'Ops', profiles: ['pa'] }] },
]
const duties: Record<string, DutyContent> = {
  '!r1:sv': { assigneeKind: 'account', assigneeId: '@alice:sv', updatedBy: '@l:sv', updatedAt: 1 },
  '!r2:sv': { assigneeKind: 'agentTeam', assigneeId: '@bob:sv/dev', updatedBy: '@l:sv', updatedAt: 2 },
}

describe('onDutyRoomIds', () => {
  it('account 直配与自有 agentTeam 都命中；他人不命中', () => {
    expect(onDutyRoomIds(duties, '@alice:sv', accounts)).toEqual(new Set(['!r1:sv']))
    expect(onDutyRoomIds(duties, '@bob:sv', [])).toEqual(new Set(['!r2:sv']))
    expect(onDutyRoomIds(duties, '@carol:sv', [])).toEqual(new Set())
  })
})

// ── MatrixRoomList 徽标渲染 ──
const registryState = vi.hoisted(() => ({
  registryRoomId: { value: '!reg:sv' }, accounts: { value: accounts }, leaders: { value: [] as string[] },
  undeclared: { value: [] as string[] }, duties: { value: duties }, ready: { value: true },
  lastError: { value: null }, isLeader: { value: false },
  ensureListening: vi.fn(), detectRegistry: vi.fn(async () => {}), registryCandidateRooms: vi.fn(() => []),
  setRegistryRoom: vi.fn(async () => {}), createRegistryRoom: vi.fn(async () => null),
  writeSelfAccount: vi.fn(async () => false), writeLeaders: vi.fn(async () => false),
  writeDuty: vi.fn(async () => false), clearDuty: vi.fn(async () => false),
  inviteMember: vi.fn(async () => false), attachRoom: vi.fn(), rebuild: vi.fn(async () => {}),
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({ useTeamRegistryStore: () => registryState }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: {} }, userId: { value: '@alice:sv' } }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
  messages: { en: { teams: { duty: { mine: 'On duty' } } } } })

import MatrixRoomList from '@/custom/matrix-chat/components/MatrixRoomList.vue'

beforeEach(() => { setActivePinia(createPinia()) })

it('MatrixRoomList 对本账号值守房间渲染徽标，非值守房间不渲染', async () => {
  // 按 MatrixRoomList 实际 props/store 依赖 mount；若其自取 roomStore，则补
  // vi.mock('@/custom/matrix-chat/stores/matrix-room') 提供 sortedRooms=[!r1,!r3]。
  const roomStoreState = { sortedRooms: { value: [
    { roomId: '!r1:sv', name: '值守群', notificationCount: 0 },
    { roomId: '!r3:sv', name: '普通群', notificationCount: 0 },
  ] }, selectedRoomId: { value: '' }, selectRoom: vi.fn() }
  vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => roomStoreState }))
  const w = mount(MatrixRoomList as unknown as { new (): never }, { global: { plugins: [i18n] } })
  expect(w.find('[data-testid="room-!r1:sv"] [data-testid="room-duty-badge"]').exists()).toBe(true)
  expect(w.find('[data-testid="room-!r3:sv"] [data-testid="room-duty-badge"]').exists()).toBe(false)
})
```

（注：MatrixRoomList 的实际 props/store 契约以读源码为准——执行本步前先 `sed -n '1,60p' custom/client/matrix-chat/components/MatrixRoomList.vue` 对齐 mock 面与房间条目 testid 命名；若其房间条目已有别的 testid 约定，改测试匹配既有约定，徽标断言不变。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/duty-badge.test.ts`
Expected: FAIL（`onDutyRoomIds` 不存在；徽标不存在）

- [ ] **Step 3: 实现**

`adapters/accounts.ts` 追加：

```ts
export function onDutyRoomIds(
  duties: Record<string, import('../protocol').DutyContent>,
  userId: string | null,
  accounts: TeamAccountView[],
): Set<string> {
  const out = new Set<string>()
  if (!userId) return out
  for (const [roomId, duty] of Object.entries(duties)) {
    if (dutyAppliesToUser(duty, userId, accounts)) out.add(roomId)
  }
  return out
}
```

MatrixRoomList.vue：script 追加（import 与 computed）：

```ts
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { onDutyRoomIds } from '@/custom/matrix-teams/adapters/accounts'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

const teamRegistry = useTeamRegistryStore()
const matrixClientStore = useMatrixClientStore()
const onDuty = computed(() => onDutyRoomIds(teamRegistry.duties, matrixClientStore.userId, teamRegistry.accounts))
```

template 的房间条目内追加：

```vue
<span v-if="onDuty.has(room.roomId)" class="room-duty-badge" data-testid="room-duty-badge">
  {{ t('teams.duty.mine') }}</span>
```

样式类按该文件既有徽标样式惯例追加（小圆角 pill，warning 色）。

TeamsManagePanel.vue 右栏 `tmp__side` 内追加：

```vue
import DutyAssignPanel from '../components/DutyAssignPanel.vue'
...
<section class="tmp__duty">
  <DutyAssignPanel />
</section>
```

i18n 键补（沿用 Task 5 的 patch 流程追加到既有 288/289 patch——因 P1 已合入，本阶段以**新 patch** 290/291 追加 zh/en 的 `teams.duty.*`：`title: '群聊值守' / 'Room duties'`、`chooseRoom: '选择房间' / 'Choose room'`、`to: '指派给' / 'Assign to'`、`assign: '指派' / 'Assign'`、`clear: '取消值守' / 'Clear'`、`mine: '值守' / 'On duty'`）。

- [ ] **Step 4: 跑测试确认通过 + P2 收口门禁**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npx vitest run custom/client/matrix-teams/ custom/client/matrix-chat/__tests__/ 2>/dev/null || npx vitest run custom/client/matrix-teams/
npm test
npm run clean && npm run inject
npm run build:full
```

冒烟（人工）：leader 指派房间给成员 → 成员侧 matrix-chat 房间列表出现值守徽标 → leader 改派 → 徽标迁移 → 清除 → 徽标消失。

- [ ] **Step 5: 合入 main**

```bash
git add -A && git commit -m "feat(matrix-teams): duty badges in room list + duty panel wiring"
git checkout main && git merge --no-ff feat/matrix-teams-p2-duty
```

---

## Phase 3 — 任务指派投递

### Task 8: dispatch-kv + task-dispatch store（发送端 + 外派视图）

**Files:**
- Create: `custom/client/matrix-teams/store/dispatch-kv.ts`
- Create: `custom/client/matrix-teams/stores/task-dispatch.ts`
- Test: `custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts`

**Interfaces:**
- Consumes: Task 1 `TASK_EVENT_TYPES`/`parseAssignContent`/`parseReceiptContent`/`uuid 生成`；Task 3 `useTeamRegistryStore().registryRoomId`/`accounts`；`useMatrixClientStore`
- Produces:
  - `DispatchView { assign: AssignContent; receipt: ReceiptContent | null }`
  - dispatch-kv：`interface DispatchIndexEntry { localTaskId: string; lastStatus: ReceiptStatus; lastSyncedAt: number }`；`loadDispatchIndex(): Record<string, DispatchIndexEntry>`、`saveDispatchIndex(map): void`、`DISPATCH_INDEX_KEY = 'matrix-teams.dispatchIndex'`（localStorage，safeGet/safeSet 模式同 cockpit-kv）
  - store `useTaskDispatchStore()`（pinia id `matrix-task-dispatch`）：
    - `dispatches: Ref<DispatchView[]>`（assign 按 taskId 去重；receipt 以 reportedAt 最新幂等合并）
    - `sendAssignment(input: { title: string; body?: string; priority?: string; target: { account: string; agentTeam?: string; profile?: string } }): Promise<boolean>`（uuid 用 `crypto.randomUUID()`；`client.sendEvent(registryRoomId, TASK_EVENT_TYPES.assign, content)`）
    - `handleTimelineEvent(event, room): Promise<void>`（供监听分发：assign → upsert 视图且若 `target.account === 本机账号` 触发接收流程（Task 9 填充接收，本任务先留接口位 `receiveAssign` 为空实现）；receipt → 合并）
    - `ensureListening(): void`（幂等，自挂 Timeline，过滤 `room.roomId === registryRoomId` 且 `isSwarmStudioEventType`）

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts`：

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts
// 投递守门：发送带 uuid+issuedBy；外派视图 assign∪receipt 幂等合并（最新 reportedAt 胜）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { TASK_EVENT_TYPES, TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, type AssignContent, type ReceiptContent } from '../protocol'

const sentEvents: Array<{ roomId: string; type: string; content: unknown }> = []
const listeners = new Map<string, Array<(e: unknown, r: unknown) => void>>()
const sdkClient = {
  on: (ev: string, fn: (e: unknown, r: unknown) => void) => { listeners.set(ev, [...(listeners.get(ev) ?? []), fn]) },
  off: () => {},
  sendEvent: async (roomId: string, type: string, content: unknown) => { sentEvents.push({ roomId, type, content }) },
  getAccountData: (t: string) => t === REGISTRY_ACCOUNT_DATA_TYPE ? { content: { roomId: '!reg:sv' } } : undefined,
  getRoom: () => ({ getJoinedMembers: () => [], currentState: { getStateEvents: () => [] } }),
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@alice:sv' } }),
}))
vi.mock('../stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ registryRoomId: { value: '!reg:sv' }, accounts: { value: [] }, isLeader: { value: true } }),
}))

import { useTaskDispatchStore } from '../stores/task-dispatch'

beforeEach(() => { setActivePinia(createPinia()); sentEvents.length = 0; localStorage.clear() })

const assignOf = (over: Partial<AssignContent>): AssignContent => ({
  taskId: 't1', title: 'T', target: { account: '@bob:sv' }, issuedBy: '@alice:sv', issuedAt: 10, ...over,
})
const receiptOf = (over: Partial<ReceiptContent>): ReceiptContent => ({
  taskId: 't1', status: 'created', reportedBy: '@bob:sv', reportedAt: 20, ...over,
})
const sdkEv = (type: string, content: unknown) => ({
  getType: () => type, isState: () => false, sender: { userId: '@x:sv' }, getContent: () => content,
})
const roomStub = { roomId: '!reg:sv' }

describe('sendAssignment', () => {
  it('生成 uuid taskId 并 sendEvent assign（含 issuedBy/issuedAt）', async () => {
    const store = useTaskDispatchStore()
    const ok = await store.sendAssignment({ title: '做蛋糕', target: { account: '@bob:sv', agentTeam: 'ops' } })
    expect(ok).toBe(true)
    expect(sentEvents).toHaveLength(1)
    expect(sentEvents[0]).toMatchObject({ roomId: '!reg:sv', type: TASK_EVENT_TYPES.assign })
    const c = sentEvents[0].content as AssignContent
    expect(c.taskId).toMatch(/^[0-9a-f-]{36}$/)
    expect(c.title).toBe('做蛋糕')
    expect(c.target).toEqual({ account: '@bob:sv', agentTeam: 'ops', profile: undefined })
    expect(c.issuedBy).toBe('@alice:sv')
  })
  it('未配置注册房间 → false 不发送', async () => {
    vi.doMock('../stores/team-registry', () => ({
      useTeamRegistryStore: () => ({ registryRoomId: { value: null }, accounts: { value: [] }, isLeader: { value: true } }),
    }))
    vi.resetModules()
    const { useTaskDispatchStore: fresh } = await import('../stores/task-dispatch')
    setActivePinia(createPinia())
    expect(await fresh().sendAssignment({ title: 'x', target: { account: '@b:sv' } })).toBe(false)
    expect(sentEvents).toHaveLength(0)
    vi.resetModules()
  })
})

describe('外派视图聚合', () => {
  it('assign 入视图；receipt 按 taskId 合并，旧 reportedAt 不覆盖新', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assignOf({})), roomStub)
    expect(store.dispatches).toHaveLength(1)
    expect(store.dispatches[0].receipt).toBeNull()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({ status: 'created', reportedAt: 20 })), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({ status: 'running', reportedAt: 30 })), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({ status: 'created', reportedAt: 25 })), roomStub) // 迟到旧回执
    expect(store.dispatches[0].receipt?.status).toBe('running')
    expect(store.dispatches).toHaveLength(1)
  })
  it('非法 content（解析失败）与外房间事件不进视图', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, { taskId: 1 }), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({})), { roomId: '!other:sv' })
    expect(store.dispatches).toHaveLength(0)
  })
  it('同 taskId 重复 assign（重复投递）视图不重复', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assignOf({})), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assignOf({})), roomStub)
    expect(store.dispatches).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 dispatch-kv.ts 与 task-dispatch.ts**

`custom/client/matrix-teams/store/dispatch-kv.ts`：

```ts
// overlay/custom/client/matrix-teams/store/dispatch-kv.ts
// 外派任务防重索引：taskId → 本地落地信息（localStorage，模式同 cockpit-kv）。
import type { ReceiptStatus } from '../protocol'

export const DISPATCH_INDEX_KEY = 'matrix-teams.dispatchIndex'

export interface DispatchIndexEntry {
  localTaskId: string
  lastStatus: ReceiptStatus
  lastSyncedAt: number
}

export function loadDispatchIndex(): Record<string, DispatchIndexEntry> {
  try {
    const raw = localStorage.getItem(DISPATCH_INDEX_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, DispatchIndexEntry> : {}
  } catch { return {} }
}

export function saveDispatchIndex(map: Record<string, DispatchIndexEntry>): void {
  try { localStorage.setItem(DISPATCH_INDEX_KEY, JSON.stringify(map)) } catch { /* quota 静默 */ }
}
```

`custom/client/matrix-teams/stores/task-dispatch.ts`：

```ts
// overlay/custom/client/matrix-teams/stores/task-dispatch.ts
// 任务投递：leader 发 assign 消息；外派视图 = assign ∪ 最新 receipt（leader 不做本地 kanban 镜像，
// 单一事实源在 Matrix，spec §6.2）。成员侧接收落地在 receiveAssign（Task 9 实现）。
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { RoomEvent } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useTeamRegistryStore } from './team-registry'
import {
  TASK_EVENT_TYPES, isSwarmStudioEventType,
  parseAssignContent, parseReceiptContent,
  type AssignContent, type ReceiptContent, type ReceiptStatus,
} from '../protocol'

export interface DispatchView {
  assign: AssignContent
  receipt: ReceiptContent | null
}

export const useTaskDispatchStore = defineStore('matrix-task-dispatch', () => {
  const matrixClientStore = useMatrixClientStore()
  const registry = useTeamRegistryStore()
  const dispatches = ref<DispatchView[]>([])

  async function sendAssignment(input: {
    title: string
    body?: string
    priority?: string
    target: { account: string; agentTeam?: string; profile?: string }
  }): Promise<boolean> {
    const client = matrixClientStore.client
    if (!client || !registry.registryRoomId) return false
    const selfId = matrixClientStore.userId ?? ''
    try {
      await client.sendEvent(registry.registryRoomId, TASK_EVENT_TYPES.assign, {
        taskId: crypto.randomUUID(),
        title: input.title,
        body: input.body,
        priority: input.priority,
        target: { account: input.target.account, agentTeam: input.target.agentTeam, profile: input.target.profile },
        issuedBy: selfId,
        issuedAt: Date.now(),
      } as AssignContent)
      return true
    } catch {
      return false
    }
  }

  function upsertAssign(assign: AssignContent): void {
    if (!dispatches.value.some(d => d.assign.taskId === assign.taskId)) {
      dispatches.value = [...dispatches.value, { assign, receipt: null }]
    }
  }

  function mergeReceipt(receipt: ReceiptContent): void {
    const view = dispatches.value.find(d => d.assign.taskId === receipt.taskId)
    if (!view) return
    if (view.receipt && view.receipt.reportedAt >= receipt.reportedAt) return
    dispatches.value = dispatches.value.map(d =>
      d.assign.taskId === receipt.taskId ? { ...d, receipt } : d)
  }

  /** 成员侧接收：Task 9 实现（resolveProfile → kanban 建卡 → kv → created 回执）。 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function receiveAssign(_assign: AssignContent): Promise<void> { /* Task 9 填充 */ }

  async function handleTimelineEvent(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string; isState?: () => boolean; getContent?: () => unknown }
    const r = room as { roomId?: string } | undefined
    if (!ev.getType || !ev.isState || !ev.getContent || !r?.roomId) return
    if (r.roomId !== registry.registryRoomId) return
    const type = ev.getType()
    if (type === TASK_EVENT_TYPES.assign) {
      const assign = parseAssignContent(ev.getContent())
      if (!assign) return
      upsertAssign(assign)
      if (matrixClientStore.userId && assign.target.account === matrixClientStore.userId) {
        await receiveAssign(assign)
      }
    } else if (type === TASK_EVENT_TYPES.receipt) {
      const receipt = parseReceiptContent(ev.getContent())
      if (receipt) mergeReceipt(receipt)
    }
  }

  let listening = false
  function ensureListening(): void {
    if (listening) return
    listening = true
    watch(() => matrixClientStore.client, (client, prev) => {
      if (prev) prev.off(RoomEvent.Timeline, onTimeline)
      if (!client) return
      client.on(RoomEvent.Timeline, onTimeline)
    }, { immediate: true })
  }

  async function onTimeline(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string }
    if (!ev.getType || !isSwarmStudioEventType(ev.getType())) return
    await handleTimelineEvent(event, room)
  }

  return { dispatches, sendAssignment, handleTimelineEvent, receiveAssign, ensureListening }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/matrix-teams-p3-dispatch  # 自 overlay main（P2 已合入）
git add custom/client/matrix-teams/
git commit -m "feat(matrix-teams): task dispatch store with aggregated dispatch views"
```

---

### Task 9: 成员侧接收落地（解析回退 + kanban 建卡 + 回执）

**Files:**
- Create: `custom/client/matrix-teams/adapters/dispatch-target.ts`
- Modify: `custom/client/matrix-teams/stores/task-dispatch.ts`（实现 `receiveAssign` + `sendReceipt`）
- Test: `custom/client/matrix-teams/__tests__/dispatch-receive.test.ts`

**Interfaces:**
- Consumes: Task 8 store/kv；`createTask(data: KanbanCreateRequest, opts?): Promise<KanbanTask>`（`@/api/hermes/kanban`，`KanbanCreateRequest { title; body?; assignee?; priority? }`，返回 `KanbanTask { id; status; ... }`）；Task 3 `registry.accounts`
- Produces:
  - `resolveTargetProfile(target: { account: string; agentTeam?: string; profile?: string }, accounts: TeamAccountView[]): string | null`（显式 profile > team.defaultProfile > team.profiles[0]；账号或 team 找不到 → null）
  - `mapKanbanStatusToReceipt(status: string): ReceiptStatus`（`triage|todo|scheduled|ready → 'created'`、`running|review → 'running'`、`done|archived → 'done'`、`blocked → 'failed'`、未知 → `'running'` 兜底）
  - store 内：`sendReceipt(taskId: string, status: ReceiptStatus, extra?: { localTaskId?: string; reason?: string }): Promise<boolean>`；`receiveAssign` 完整实现（kv 防重 → resolve → createTask（title 前缀 `[外派-<taskId 前 6 位>] `）→ kv 记录 → created 回执；任何失败 → failed 回执带 reason，不抛）

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/dispatch-receive.test.ts`：

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/dispatch-receive.test.ts
// 接收落地守门：目标三级回退、kv 防重、建卡参数、created/failed 回执路径。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { TASK_EVENT_TYPES, type AssignContent } from '../protocol'
import { resolveTargetProfile, mapKanbanStatusToReceipt } from '../adapters/dispatch-target'
import type { TeamAccountView } from '../adapters/accounts'

const accounts: TeamAccountView[] = [
  { userId: '@bob:sv', displayName: 'bob', isLeader: false, declared: true, agentTeams: [
    { slug: 'ops', name: 'Ops', profiles: ['pb1', 'pb2'], defaultProfile: 'pb2' },
    { slug: 'dev', name: 'Dev', profiles: ['pb3'] },
  ] },
]

describe('resolveTargetProfile（三级回退）', () => {
  it('显式 profile 最优先', () => {
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'ops', profile: 'pb1' }, accounts)).toBe('pb1')
  })
  it('其次 team.defaultProfile，再次 profiles[0]', () => {
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'ops' }, accounts)).toBe('pb2')
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'dev' }, accounts)).toBe('pb3')
  })
  it('无 team 时取账号首个 team 的 defaultProfile', () => {
    expect(resolveTargetProfile({ account: '@bob:sv' }, accounts)).toBe('pb2')
  })
  it('账号不存在 / team 不存在 / 账号无 team → null', () => {
    expect(resolveTargetProfile({ account: '@nobody:sv' }, accounts)).toBeNull()
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'nope' }, accounts)).toBeNull()
    expect(resolveTargetProfile({ account: '@bob:sv' }, [{ ...accounts[0], agentTeams: [] }])).toBeNull()
  })
})

describe('mapKanbanStatusToReceipt', () => {
  it('四桶映射 + 未知兜底 running', () => {
    expect(mapKanbanStatusToReceipt('todo')).toBe('created')
    expect(mapKanbanStatusToReceipt('running')).toBe('running')
    expect(mapKanbanStatusToReceipt('done')).toBe('done')
    expect(mapKanbanStatusToReceipt('blocked')).toBe('failed')
    expect(mapKanbanStatusToReceipt('weird')).toBe('running')
  })
})

// ── receiveAssign 落地路径 ──
const created: Array<Record<string, unknown>> = []
const sentEvents: Array<{ type: string; content: Record<string, unknown> }> = []
const kanbanApi = vi.hoisted(() => ({
  createTask: vi.fn(async (data: Record<string, unknown>) => {
    created.push(data)
    return { id: 'kb-1', status: 'ready', title: String(data.title) }
  }),
}))
vi.mock('@/api/hermes/kanban', () => kanbanApi)
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (_roomId: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ type, content }) },
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@bob:sv' } }),
}))
vi.mock('../stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ registryRoomId: { value: '!reg:sv' }, accounts: { value: accounts }, isLeader: { value: false } }),
}))

import { useTaskDispatchStore } from '../stores/task-dispatch'
import { loadDispatchIndex } from '../store/dispatch-kv'

beforeEach(() => {
  setActivePinia(createPinia())
  created.length = 0; sentEvents.length = 0; localStorage.clear()
})

const assign = (over: Partial<AssignContent> = {}): AssignContent => ({
  taskId: '11111111-2222-3333-4444-555555555555', title: '做蛋糕', body: '香草味',
  target: { account: '@bob:sv', agentTeam: 'ops' }, issuedBy: '@alice:sv', issuedAt: 1, ...over,
})

describe('receiveAssign', () => {
  it('解析 team 默认 profile → 建卡（前缀+assignee）→ kv 记录 → created 回执', async () => {
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign())
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      title: '[外派-111111] 做蛋糕',
      assignee: 'pb2',
      body: '香草味',
    })
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ localTaskId: 'kb-1', lastStatus: 'created' })
    const receipt = sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(receipt?.content).toMatchObject({ taskId: '11111111-2222-3333-4444-555555555555', status: 'created', localTaskId: 'kb-1', reportedBy: '@bob:sv' })
  })
  it('kv 已记录（重复投递）→ 不建卡不回执', async () => {
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      '11111111-2222-3333-4444-555555555555': { localTaskId: 'kb-0', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign())
    expect(created).toHaveLength(0)
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(0)
  })
  it('目标解析失败 → failed 回执带 reason，不建卡', async () => {
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign({ target: { account: '@nobody:sv' } }))
    expect(created).toHaveLength(0)
    const receipt = sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(receipt?.content).toMatchObject({ status: 'failed', reason: 'no-such-profile' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/dispatch-receive.test.ts`
Expected: FAIL（`resolveTargetProfile` 不存在）

- [ ] **Step 3: 实现 adapters/dispatch-target.ts 并填充 receiveAssign**

`custom/client/matrix-teams/adapters/dispatch-target.ts`：

```ts
// overlay/custom/client/matrix-teams/adapters/dispatch-target.ts
// 指派目标解析（spec §6.2 三级回退）与 kanban→receipt 状态映射。
import type { ReceiptStatus } from '../protocol'
import type { TeamAccountView } from './accounts'

export function resolveTargetProfile(
  target: { account: string; agentTeam?: string; profile?: string },
  accounts: TeamAccountView[],
): string | null {
  const account = accounts.find(a => a.userId === target.account)
  if (!account) return null
  const team = target.agentTeam
    ? account.agentTeams.find(t => t.slug === target.agentTeam)
    : account.agentTeams[0]
  if (!team) return null
  return target.profile ?? team.defaultProfile ?? team.profiles[0] ?? null
}

export function mapKanbanStatusToReceipt(status: string): ReceiptStatus {
  if (status === 'done' || status === 'archived') return 'done'
  if (status === 'blocked') return 'failed'
  if (status === 'running' || status === 'review') return 'running'
  return 'created'
}
```

`stores/task-dispatch.ts` 的 `receiveAssign` 占位替换为：

```ts
import { createTask } from '@/api/hermes/kanban'
import { resolveTargetProfile, mapKanbanStatusToReceipt } from '../adapters/dispatch-target'
import { loadDispatchIndex, saveDispatchIndex, type DispatchIndexEntry } from '../store/dispatch-kv'

  async function sendReceipt(taskId: string, status: ReceiptStatus, extra?: { localTaskId?: string; reason?: string }): Promise<boolean> {
    const client = matrixClientStore.client
    if (!client || !registry.registryRoomId) return false
    const selfId = matrixClientStore.userId ?? ''
    try {
      await client.sendEvent(registry.registryRoomId, TASK_EVENT_TYPES.receipt, {
        taskId, status, localTaskId: extra?.localTaskId, reason: extra?.reason,
        reportedBy: selfId, reportedAt: Date.now(),
      } as ReceiptContent)
      return true
    } catch { return false }
  }

  async function receiveAssign(assign: AssignContent): Promise<void> {
    const index = loadDispatchIndex()
    if (index[assign.taskId]) return // kv 防重（spec §6.2）
    const profile = resolveTargetProfile(assign.target, registry.accounts)
    if (!profile) {
      await sendReceipt(assign.taskId, 'failed', { reason: 'no-such-profile' })
      return
    }
    try {
      const task = await createTask({
        title: `[外派-${assign.taskId.slice(0, 6)}] ${assign.title}`,
        body: assign.body,
        assignee: profile,
      })
      const entry: DispatchIndexEntry = { localTaskId: task.id, lastStatus: 'created', lastSyncedAt: Date.now() }
      saveDispatchIndex({ ...index, [assign.taskId]: entry })
      await sendReceipt(assign.taskId, 'created', { localTaskId: task.id })
    } catch (err) {
      await sendReceipt(assign.taskId, 'failed', { reason: err instanceof Error ? err.message.slice(0, 200) : 'create-task-failed' })
    }
  }
```

（return 导出列表追加 `sendReceipt`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/dispatch-receive.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add custom/client/matrix-teams/
git commit -m "feat(matrix-teams): member-side assign landing with kv dedup and receipts"
```

---

### Task 10: 轮询回执上报 + DispatchList UI + P3 收口

**Files:**
- Modify: `custom/client/matrix-teams/stores/task-dispatch.ts`（追加 `pollAndReport`）
- Create: `custom/client/matrix-teams/components/DispatchList.vue`
- Modify: `custom/client/matrix-teams/views/TeamsManagePanel.vue`（挂 DispatchList）
- Test: `custom/client/matrix-teams/__tests__/dispatch-list.test.ts`

**Interfaces:**
- Consumes: `getTask(id: string, opts?): Promise<KanbanTask>`（`@/api/hermes/kanban`）；Task 8/9 全部
- Produces:
  - `pollAndReport(): Promise<void>`（遍历 kv 索引 → `getTask(localTaskId)` → `mapKanbanStatusToReceipt` 与 `lastStatus` 比较，变化才 `sendReceipt` 并更新 kv；单次失败静默下轮重试）
  - DispatchList：`data-testid="dispatch-list"`，表单区（title `dispatch-title-input`、body `dispatch-body-input`、目标下拉 `dispatch-target-select`、profile 下拉 `dispatch-profile-select`、发送 `dispatch-send`，仅 leader）+ 列表（每条 `dispatch-item-<taskId 前 6 位>`，状态徽标 `dispatch-status`）
  - i18n 新键（新 patch 292/293 zh/en）：`teams.dispatch.title: '外派任务' / 'Dispatched tasks'`、`teams.dispatch.new: '指派任务' / 'Dispatch task'`、`teams.dispatch.titleField: '标题' / 'Title'`、`teams.dispatch.body: '描述' / 'Description'`、`teams.dispatch.target: '目标账号' / 'Target account'`、`teams.dispatch.profile: '指定 profile（可选）' / 'Profile (optional)'`、`teams.dispatch.send: '发出' / 'Send'`、`teams.dispatch.empty: '暂无外派任务' / 'No dispatched tasks'`、`teams.dispatch.status.created: '已建卡' / 'Created'`、`teams.dispatch.status.running: '执行中' / 'Running'`、`teams.dispatch.status.done: '已完成' / 'Done'`、`teams.dispatch.status.failed: '失败' / 'Failed'`、`teams.dispatch.issuedBy: '指派人' / 'Issued by'`

- [ ] **Step 1: 写失败测试**

`custom/client/matrix-teams/__tests__/dispatch-list.test.ts`：

```ts
// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/dispatch-list.test.ts
// 轮询回执守门 + 外派列表渲染。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { TASK_EVENT_TYPES, type AssignContent } from '../protocol'

// ── 轮询回执 ──
const sentEvents: Array<{ type: string; content: Record<string, unknown> }> = []
let taskRow: { id: string; status: string } | null = null
const kanbanApi = vi.hoisted(() => ({
  createTask: vi.fn(),
  getTask: vi.fn(async () => taskRow),
}))
vi.mock('@/api/hermes/kanban', () => kanbanApi)
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (_r: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ type, content }) },
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@bob:sv' } }),
}))
const registryState = vi.hoisted(() => ({
  registryRoomId: { value: '!reg:sv' }, leaders: { value: [] as string[] }, isLeader: { value: false },
  undeclared: { value: [] as string[] }, duties: { value: {} }, ready: { value: true }, lastError: { value: null },
  accounts: { value: [{ userId: '@bob:sv', displayName: 'bob', isLeader: false, declared: true,
    agentTeams: [{ slug: 'ops', name: 'Ops', profiles: ['pb'], defaultProfile: 'pb' }] }] },
  ensureListening: vi.fn(), detectRegistry: vi.fn(async () => {}), registryCandidateRooms: vi.fn(() => []),
  setRegistryRoom: vi.fn(async () => {}), createRegistryRoom: vi.fn(async () => null),
  writeSelfAccount: vi.fn(async () => false), writeLeaders: vi.fn(async () => false),
  writeDuty: vi.fn(async () => false), clearDuty: vi.fn(async () => false),
  inviteMember: vi.fn(async () => false), attachRoom: vi.fn(), rebuild: vi.fn(async () => {}),
}))
vi.mock('../stores/team-registry', () => ({ useTeamRegistryStore: () => registryState }))

import { useTaskDispatchStore } from '../stores/task-dispatch'

beforeEach(() => { setActivePinia(createPinia()); sentEvents.length = 0; localStorage.clear() })

describe('pollAndReport', () => {
  it('状态变化才回执；无变化不重复发', async () => {
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      t1: { localTaskId: 'kb-1', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    const store = useTaskDispatchStore()
    taskRow = { id: 'kb-1', status: 'running' }
    await store.pollAndReport()
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(1)
    expect(sentEvents[0].content).toMatchObject({ taskId: 't1', status: 'running', localTaskId: 'kb-1' })
    await store.pollAndReport() // 同状态重跑 → 不再发
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(1)
    taskRow = { id: 'kb-1', status: 'done' }
    await store.pollAndReport()
    const rs = sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(rs).toHaveLength(2)
    expect(rs[1].content).toMatchObject({ status: 'done' })
  })
  it('getTask 抛错 → 静默（不崩、不发），下轮重试', async () => {
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      t1: { localTaskId: 'kb-1', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    kanbanApi.getTask.mockRejectedValueOnce(new Error('net'))
    const store = useTaskDispatchStore()
    await expect(store.pollAndReport()).resolves.toBeUndefined()
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(0)
  })
})

// ── DispatchList UI ──
const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
  messages: { en: { teams: { dispatch: {
    title: 'Dispatched', new: 'Dispatch', titleField: 'Title', body: 'Desc', target: 'Target',
    profile: 'Profile', send: 'Send', empty: 'Empty', issuedBy: 'By',
    status: { created: 'Created', running: 'Running', done: 'Done', failed: 'Failed' },
  } } } } })

import DispatchList from '../components/DispatchList.vue'

const assignFixture: AssignContent = {
  taskId: '11111111-2222-3333-4444-555555555555', title: '做蛋糕',
  target: { account: '@bob:sv' }, issuedBy: '@alice:sv', issuedAt: 1,
}

describe('DispatchList', () => {
  it('渲染外派条目与状态徽标；leader 才有表单', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(
      { getType: () => TASK_EVENT_TYPES.assign, isState: () => false, getContent: () => assignFixture },
      { roomId: '!reg:sv' })
    registryState.isLeader.value = false
    const w = mount(DispatchList, { global: { plugins: [i18n] } })
    expect(w.find('[data-testid="dispatch-item-111111"]').exists()).toBe(true)
    expect(w.find('[data-testid="dispatch-send"]').exists()).toBe(false)
    registryState.isLeader.value = true
    await flushPromises()
    expect(w.find('[data-testid="dispatch-send"]').exists()).toBe(true)
  })
  it('leader 填表发送 → sendAssignment 带表单值', async () => {
    const store = useTaskDispatchStore()
    const spy = vi.spyOn(store, 'sendAssignment').mockResolvedValue(true)
    registryState.isLeader.value = true
    const w = mount(DispatchList, { global: { plugins: [i18n] } })
    await w.find('[data-testid="dispatch-title-input"]').setValue('写周报')
    await w.find('[data-testid="dispatch-target-select"]').setValue('@bob:sv')
    await w.find('[data-testid="dispatch-profile-select"]').setValue('pb')
    await w.find('[data-testid="dispatch-send"]').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      title: '写周报', target: { account: '@bob:sv', profile: 'pb' },
    }))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/matrix-teams/__tests__/dispatch-list.test.ts`
Expected: FAIL（`pollAndReport`/组件不存在）

- [ ] **Step 3: 实现 pollAndReport 与 DispatchList.vue**

`stores/task-dispatch.ts` 追加（import 区补 `getTask`）：

```ts
  async function pollAndReport(): Promise<void> {
    const index = loadDispatchIndex()
    for (const [taskId, entry] of Object.entries(index)) {
      let status: string
      try {
        const task = await getTask(entry.localTaskId)
        status = task.status
      } catch { continue } // 单条失败静默，下轮重试
      const mapped = mapKanbanStatusToReceipt(status)
      if (mapped === entry.lastStatus) continue
      const ok = await sendReceipt(taskId, mapped, { localTaskId: entry.localTaskId })
      if (ok) {
        saveDispatchIndex({ ...loadDispatchIndex(), [taskId]: { ...entry, lastStatus: mapped, lastSyncedAt: Date.now() } })
      }
    }
  }
```

（return 列表追加 `pollAndReport`。）

`custom/client/matrix-teams/components/DispatchList.vue`：

```vue
<!-- overlay/custom/client/matrix-teams/components/DispatchList.vue -->
<!-- 外派任务：leader 表单（标题/描述/目标账号/profile 可选）+ assign∪receipt 聚合列表。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskDispatchStore } from '../stores/task-dispatch'
import { useTeamRegistryStore } from '../stores/team-registry'

const { t } = useI18n()
const dispatch = useTaskDispatchStore()
const registry = useTeamRegistryStore()

const title = ref('')
const body = ref('')
const targetAccount = ref('')
const targetProfile = ref('')
const accounts = computed(() => registry.accounts.map(a => ({ userId: a.userId, label: a.displayName, profiles: a.agentTeams.flatMap(tm => tm.profiles) })))
const profileOptions = computed(() => accounts.value.find(a => a.userId === targetAccount.value)?.profiles ?? [])

async function send(): Promise<void> {
  if (!title.value.trim() || !targetAccount.value) return
  if (await dispatch.sendAssignment({
    title: title.value.trim(),
    body: body.value.trim() || undefined,
    target: { account: targetAccount.value, profile: targetProfile.value || undefined },
  })) { title.value = ''; body.value = ''; targetProfile.value = '' }
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  dispatch.ensureListening()
  timer = setInterval(() => { void dispatch.pollAndReport() }, 30_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="dl" data-testid="dispatch-list">
    <div class="dl__sec">{{ t('teams.dispatch.title') }}</div>

    <form v-if="registry.isLeader" class="dl__form" @submit.prevent="send">
      <input v-model="title" class="dl__input dl__input--wide" data-testid="dispatch-title-input"
        :placeholder="t('teams.dispatch.titleField')" />
      <input v-model="body" class="dl__input dl__input--wide" data-testid="dispatch-body-input"
        :placeholder="t('teams.dispatch.body')" />
      <select v-model="targetAccount" class="dl__select" data-testid="dispatch-target-select"
        :aria-label="t('teams.dispatch.target')">
        <option value="">{{ t('teams.dispatch.target') }}</option>
        <option v-for="a in accounts" :key="a.userId" :value="a.userId">{{ a.label }}（{{ a.userId }}）</option>
      </select>
      <select v-model="targetProfile" class="dl__select" data-testid="dispatch-profile-select"
        :aria-label="t('teams.dispatch.profile')" :disabled="!targetAccount">
        <option value="">{{ t('teams.dispatch.profile') }}</option>
        <option v-for="p in profileOptions" :key="p" :value="p">{{ p }}</option>
      </select>
      <button type="submit" class="dl__primary" data-testid="dispatch-send">
        {{ t('teams.dispatch.send') }}</button>
    </form>

    <div v-if="dispatch.dispatches.length === 0" class="dl__empty">{{ t('teams.dispatch.empty') }}</div>
    <div v-for="d in dispatch.dispatches" :key="d.assign.taskId"
      class="dl__row" :data-testid="`dispatch-item-${d.assign.taskId.slice(0, 6)}`">
      <span class="dl__task-title">{{ d.assign.title }}</span>
      <span class="dl__target">{{ d.assign.target.account }}</span>
      <span class="dl__issuer">{{ t('teams.dispatch.issuedBy') }}: {{ d.assign.issuedBy }}</span>
      <span class="dl__status" :class="`dl__status--${d.receipt?.status ?? 'pending'}`"
        data-testid="dispatch-status">{{ t(`teams.dispatch.status.${d.receipt?.status ?? 'created'}`) }}</span>
    </div>
  </div>
</template>

<style scoped>
.dl { display: flex; flex-direction: column; gap: 8px; }
.dl__sec { font-size: 12px; font-weight: 600; }
.dl__form { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dl__input, .dl__select { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 3px 8px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); }
.dl__input--wide { grid-column: 1 / -1; }
.dl__primary { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 3px 12px; cursor: pointer; font-family: inherit; }
.dl__empty { font-size: 12px; color: var(--text-secondary); }
.dl__row { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap; }
.dl__task-title { font-weight: 600; }
.dl__target { color: var(--color-primary, #3b82f6); }
.dl__issuer { color: var(--text-secondary); font-size: 11px; }
.dl__status { font-size: 11px; border-radius: 999px; border: 1px solid var(--border-color); padding: 0 8px; }
.dl__status--done { border-color: var(--color-success, #22c55e); color: var(--color-success, #22c55e); }
.dl__status--failed { border-color: var(--color-danger, #e11d48); color: var(--color-danger, #e11d48); }
.dl__status--running { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
</style>
```

TeamsManagePanel.vue 右栏追加 `<section class="tmp__dispatch"><DispatchList /></section>`（import 同 DutyAssignPanel 模式）。

i18n patch 292/293（zh/en）按 Task 5 五步法追加 `teams.dispatch.*` 键（清单见本任务 Interfaces）。

- [ ] **Step 4: P3 收口门禁（全量）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npx vitest run custom/client/matrix-teams/
npm test                                   # 全量全绿（1600+ 用例）
npm run clean && npm run inject            # 重放
npm run build:full                         # 全链构建
cd ../upstream/hermes-studio && npx vitest run tests/client/i18n-coverage.test.ts   # 18/18
```

- [ ] **Step 5: 端到端冒烟（人工，ncwk-sim 或 dev 双端）**

leader 侧 DispatchList 填表发送 → 成员侧 30s 内本机 kanban 出现 `[外派-xxxxxx]` 卡片且 assignee=目标 profile → dispatcher 执行（或手动流转）→ leader 侧外派列表状态变为 Running → Done。改派场景：leader 再发一单指定不同 profile，验证三级回退与显式覆盖。失败路径：把成员声明改成不存在的 profile 后发单，验证 failed 回执与 leader 侧 Failed 状态。

- [ ] **Step 6: 合入 main**

```bash
git add -A && git commit -m "feat(matrix-teams): dispatch list UI, poll-based receipts, full gates"
git checkout main && git merge --no-ff feat/matrix-teams-p3-dispatch
```

---

## 自检记录（writing-plans Self-Review）

1. **Spec 覆盖**：§4.2 事件协议 → Task 1；§4.3 发现 → Task 3；§5 模块结构 → Task 1-4/6/8-10（`protocol.ts`/`adapters/`/`stores/`/`views/`/`components/` 齐全，`custom/server` 零改动达成）；§6.1 建立 → Task 3/4；§6.2 指派 → Task 8/9/10；§6.3 值守 → Task 6/7；§7 权限 → Task 1（PL 矩阵）+ Task 3（isLeader 门禁）+ Task 2（sender 归属校验）；§8 测试 → 各任务守门 + i18n coverage；§9 阶段 → P1=Task 1-5、P2=Task 6-7、P3=Task 8-10；§10 风险（限幅/防重/迟到回执）→ Task 1/8/9 测试覆盖。P4 不在范围（spec 已注明）。
2. **占位符扫描**：无 TBD/TODO；Task 9 的 `receiveAssign` 在 Task 8 留空是显式的接口位，Task 9 给出完整实现；Task 7 对 MatrixRoomList 的 mock 面标注了"以读源码为准对齐"并给出对齐方法（该文件房间条目 testid 属既有事实，执行时核对，不算占位）。
3. **类型一致性**：`RawStateEvent`/`TeamAccountView`（Task 2 定义，3/6/7/9 消费）；`DispatchView`/`DispatchIndexEntry`（Task 8 定义，9/10 消费）；`sendReceipt(taskId, status, extra?)` 签名 Task 9 定义、Task 10 `pollAndReport` 调用一致；`writeDuty/clearDuty` Task 6 定义、Task 7 面板调用一致。
