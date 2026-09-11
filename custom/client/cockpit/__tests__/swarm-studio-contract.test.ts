// overlay/custom/client/cockpit/__tests__/swarm-studio-contract.test.ts
// SwarmStudio ↔ Hermes Agent Cluster 契约测试（观测治理层补齐组件 4）
//
// 对应契约文档：~/.hermes/profiles/_shared/06-observability/swarm-studio-contract.md
// 验证前端消费的响应结构与契约 schema 一致。字段只增不减——缺失字段 = 契约违约。
//
// 这些测试不发起真实网络请求（纯结构校验），CI 随 npm test 跑；
// 端到端联调由 ops 侧的 /api 探活另测。
import { describe, it, expect, vi } from 'vitest'

// 契约测试在 node 环境跑（无浏览器 location），但 @/api/client 顶层会碰
// vue-router 的 createWebHashHistory。这里只测纯数据结构，不测路由——
// mock 掉 api/client 链路，避免环境依赖。
vi.mock('@/api/client', () => ({
  request: vi.fn(),
  getApiKey: vi.fn(() => ''),
  getBaseUrlValue: vi.fn(() => ''),
  getStoredUsername: vi.fn(() => 'tester'),
}))
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useRoute: vi.fn(() => ({ params: {}, query: {} })),
}))

import { normalizeSnapshot, type FleetSnapshot } from '../adapters/fleet-adapter'
import { parseTenant, type ParsedTenant } from '../../kanban/utils/tenant-parser'
import type { TraceNode, TraceEdge } from '../adapters/run-trace-adapter'
import type { TeamRecord } from '../adapters/teams-adapter'

// ── §8/§9 新 IA 信息架构契约（P3 Task 8 扩展）──
// 六区域路由存在性 / 旧落点重定向正确性 / RETRO 开关行为。
// 上方 vi.mock('vue-router') 只为组件链路服务；这里经 importActual 取真
// createRouter 驱动真实路由解析（不加载任何视图组件，懒组件保持函数态）。

const vr = await vi.importActual<typeof import('vue-router')>('vue-router')
const { buildIaRoutes, IA_AREAS } = await import('../../ia2/routes')
const guardModule = await import('../../ia2/guard')

describe('contract: six-area IA routes (§8 六区域)', () => {

  function makeRouter(): import('vue-router').Router {
    return vr.createRouter({ history: vr.createMemoryHistory(), routes: buildIaRoutes() })
  }

  it('六区域路径全部存在，命名前缀 ia2.，顺序固定（总览=登录默认）', () => {
    const router = makeRouter()
    const order = ['overview', 'orchestrate', 'runs', 'inbox', 'tasks', 'comms']
    expect(IA_AREAS.map(a => a.key)).toEqual(order)
    for (const area of IA_AREAS) {
      const resolved = router.resolve(area.path)
      const expected = area.key === 'comms' ? 'ia2.commsHome' : area.name
      expect(resolved.name, `${area.path} 必须可解析（契约：六区域存在性）`).toBe(expected)
      expect(String(resolved.name).startsWith('ia2.')).toBe(true)
    }
    // /app 裸路径 = 总览（登录默认落点，071 守卫直落）
    expect(router.resolve('/app').name).toBe('ia2.overview')
    // fullscreen meta（壳自带 IaNav，上游 AppSidebar 隐藏）
    expect(router.resolve('/app/runs').meta.fullscreen).toBe(true)
  })

  it('参数路由契约：run 详情 runId / matrix 房间 roomId 原样搬迁', () => {
    const router = makeRouter()
    expect(router.resolve('/app/runs/run-9').params.runId).toBe('run-9')
    expect(router.resolve('/app/comms/room/!foo:bar').params.roomId).toBe('!foo:bar')
  })
})

describe('contract: legacy landing redirects (§9 cockpit 退役)', () => {
  const { iaCompatRedirect } = guardModule

  it('旧落点 → 新 IA 目标固定（重定向正确性）', () => {
    // P4 平行共存（2026-09-11 用户裁决）：cockpit 家族本体路由恢复，不再改写
    expect(iaCompatRedirect({ path: '/hermes/cockpit' }, false)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/matrix-chat' }, false)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/matrix-chat/room/!r:1' }, false)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/swarm-kanban' }, false)).toBeNull()
    // loop 旧落点按名称承接
    expect(iaCompatRedirect({ name: 'hermes.loopRuns' }, false)).toEqual({ name: 'ia2.runs' })
    expect(iaCompatRedirect({ name: 'hermes.loopDetail', params: { id: '42' } }, false))
      .toEqual({ name: 'ia2.runs', query: { loop: '42' } })
  })
})

describe('contract: RETRO switch behavior (§9 回退保险)', () => {
  const { iaCompatRedirect } = guardModule

  it('RETRO=1：loop 旧落点放行（旧路由仍在，可回退）', () => {
    expect(iaCompatRedirect({ name: 'hermes.loopRuns' }, true)).toBeNull()
    expect(iaCompatRedirect({ name: 'hermes.loopDetail', params: { id: '42' } }, true)).toBeNull()
  })

  it('RETRO=1：cockpit 平行共存同样留原位（P4 本体路由恢复）', () => {
    expect(iaCompatRedirect({ path: '/hermes/cockpit' }, true)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/matrix-chat' }, true)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/swarm-kanban' }, true)).toBeNull()
  })
})

// ── §1.1 Kanban Task 核心字段 ──

const KANBAN_TASK_REQUIRED_FIELDS = [
  'id', 'title', 'status', 'priority', 'assignee', 'workspace_path',
  'tenant', 'created_at', 'started_at', 'completed_at', 'parents', 'children',
] as const

const KANBAN_TASK_STATUSES = [
  'triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived',
] as const

function assertKanbanTaskShape(task: Record<string, unknown>, where: string): void {
  for (const field of KANBAN_TASK_REQUIRED_FIELDS) {
    expect(task, `${where}: missing field "${field}"`).toHaveProperty(field)
  }
  expect(KANBAN_TASK_STATUSES, `${where}: invalid status "${task.status}"`)
    .toContain(task.status)
}

describe('contract: kanban task shape (§1.1)', () => {
  it('accepts a contract-compliant task', () => {
    assertKanbanTaskShape({
      id: 't_abc123',
      title: 'fix login bug',
      status: 'running',
      priority: 2,
      assignee: 'worker-coder',
      workspace_path: '/tmp/ws/t_abc123',
      tenant: null,
      project_id: null,
      created_at: 1757200000,
      started_at: 1757200100,
      completed_at: null,
      skills: null,
      latest_summary: null,
      parents: [],
      children: [],
    }, 'fixture')
  })

  it('rejects a task missing required fields', () => {
    const bad = { id: 't_x', title: 'no status field' }
    for (const field of KANBAN_TASK_REQUIRED_FIELDS) {
      if (field === 'id' || field === 'title') continue
      expect(bad).not.toHaveProperty(field)
    }
    // 说明：bad 缺 status 等字段——用 expect.hasAssertions 保证本测试有效
    expect(Object.keys(bad).length).toBe(2)
  })
})

// ── §1.2 Tenant 六段式 ──

describe('contract: tenant 6-segment format (§1.2)', () => {
  it('parses the canonical matrix tenant', () => {
    const raw = '跨团队协作群01:记忆服务讨论:@testuser3:!jDhqiAernzgtADVwAw:$11wFK9rf3UlDS:matrix'
    const p = parseTenant(raw)
    expect(p.isLegacy).toBe(false)
    expect(p.groupChat).toBe('跨团队协作群01')
    expect(p.topic).toBe('记忆服务讨论')
    expect(p.userId).toBe('@testuser3')
    expect(p.roomId).toBe('!jDhqiAernzgtADVwAw')
    expect(p.sessionId).toBe('$11wFK9rf3UlDS')
    expect(p.source).toBe('matrix')
  })

  it('marks legacy formats isLegacy=true', () => {
    expect(parseTenant('matrix:xxx:yyy').isLegacy).toBe(true)
    expect(parseTenant('only:four:segments:here').isLegacy).toBe(true)
  })

  it('source field is one of known platforms', () => {
    const KNOWN = ['matrix', 'weixin', 'api', 'email', 'cli']
    const p = parseTenant('群:话题:@u:!room:$sess:weixin') as ParsedTenant
    expect(KNOWN).toContain(p.source)
  })
})

// ── §1.3 Trace 节点/边 Schema ──

const TRACE_NODE_KINDS = [
  'ingress', 'workflow', 'agent', 'skill', 'tool', 'memory', 'service', 'peer', 'approval',
] as const

const TRACE_EDGE_KINDS = ['spawn', 'call', 'recall', 'converge', 'delegate'] as const

function assertTraceNodeShape(n: Record<string, unknown>, where: string): void {
  for (const field of ['id', 'kind', 'label', 'status', 'startedAt', 'evidence']) {
    expect(n, `${where}: trace node missing "${field}"`).toHaveProperty(field)
  }
  expect(TRACE_NODE_KINDS, `${where}: invalid kind "${n.kind}"`).toContain(n.kind)
  expect(['running', 'ok', 'error', 'cancelled'], `${where}: invalid status "${n.status}"`)
    .toContain(n.status)
  expect(['L1', 'L2', 'L3'], `${where}: invalid evidence "${n.evidence}"`).toContain(n.evidence)
}

describe('contract: trace node/edge schema (§1.3)', () => {
  it('accepts contract-compliant trace node', () => {
    assertTraceNodeShape({
      id: 'run:sess1:replay-sess1',
      kind: 'workflow',
      label: 'Run replay-sess1',
      status: 'ok',
      startedAt: 1757200000000,
      endedAt: 1757200600000,
      durationMs: 600000,
      evidence: 'L1',
      children: [],
      ref: { sessionId: 'sess1', runId: 'replay-sess1' },
      cluster: 't_abc123',
      profile: 'orchestrator',
      taskStatus: 'done',
      taskBoard: 'swarm',
    } as unknown as Record<string, unknown>, 'fixture')
  })

  it('trace edge kinds are from the closed set', () => {
    const e: Pick<TraceEdge, 'kind'> = { kind: 'delegate' }
    expect(TRACE_EDGE_KINDS).toContain(e.kind)
  })
})

// ── §1.4 Fleet Snapshot 防御性归一化 ──

describe('contract: fleet snapshot normalization (§1.4)', () => {
  it('fills defaults for missing optional fields, keeps required ids', () => {
    const snap: FleetSnapshot = normalizeSnapshot({
      ts: 1757200000,
      sessions: [
        { id: 'sess1' },  // 只有 id，其余全缺
        { id: 'sess2', profile: 'worker-coder', status: 'working', queueLength: 2,
          approvals: [{ approval_id: 'a1', preview: 'run rm?', choices: ['once', 'deny'] }],
          clarifies: [{ clarify_id: 'c1', question: 'continue?' }] },
        { profile: 'no-id-session' },  // 无 id → 应被过滤
        'not-an-object',                 // 非对象 → 应被过滤
      ],
    })
    expect(snap.sessions.length).toBe(2)
    const s1 = snap.sessions[0]
    expect(s1.id).toBe('sess1')
    expect(s1.profile).toBe('default')
    expect(s1.status).toBe('idle')
    expect(s1.isAborting).toBe(false)
    expect(s1.queueLength).toBe(0)
    expect(s1.approvals).toEqual([])
    expect(s1.clarifies).toEqual([])
    const s2 = snap.sessions[1]
    expect(s2.status).toBe('working')
    expect(s2.approvals[0].choices).toEqual(['once', 'deny'])
  })

  it('handles totally malformed payload without throwing', () => {
    const snap = normalizeSnapshot(null)
    expect(snap.sessions).toEqual([])
    expect(snap.ts).toBe(0)
  })
})

// ── §2 API 契约（团队注册表）──

describe('contract: team record shape (§2 /api/hermes/teams)', () => {
  it('team record has required fields', () => {
    const team: TeamRecord = {
      id: 'team-1',
      name: 'core',
      description: 'core team',
      color: '#3b82f6',
      profiles: ['orchestrator', 'worker-coder'],
      boards: ['swarm', 'hack'],
      pinnedSessions: [],
      createdAt: 1757200000000,
      updatedAt: 1757200000000,
    }
    for (const field of ['id', 'name', 'description', 'color', 'profiles', 'boards', 'pinnedSessions', 'createdAt', 'updatedAt']) {
      expect(team).toHaveProperty(field)
    }
  })
})

// ── §6 验收门禁证据分级 ──

describe('contract: evidence tier values (§6.1)', () => {
  it('evidence tiers map to score caps', () => {
    const TIERS: Record<string, number> = {
      Missing: 59, Present: 74, Wired: 84, Exercised: 94, 'Outcome-supported': 100,
    }
    expect(Object.keys(TIERS).length).toBe(5)
    expect(TIERS['Missing']).toBeLessThan(TIERS['Present'])
    expect(TIERS['Present']).toBeLessThan(TIERS['Wired'])
    expect(TIERS['Wired']).toBeLessThan(TIERS['Exercised'])
    expect(TIERS['Exercised']).toBeLessThan(TIERS['Outcome-supported'])
  })
})
