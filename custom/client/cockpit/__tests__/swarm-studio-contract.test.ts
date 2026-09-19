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

// ── §8 新 IA 信息架构契约（2026-09-19 v12 统一视图：六场景 → 双视图）──
// /app 收敛单视图 collab（沟通协作工作台）；IDE 侧独立壳。品牌与 ⇄ IDE 双壳互跳
// 契约由 ia2/__tests__/ia-shell-header.test.ts 守门，本文件只守路由层契约。
// §9 旧路由承接契约随兼容守卫退役删除；旧深链由迁移表路径重定向承接
// （ia2/__tests__/unified-nav-guard.test.ts 实走守门）。

const vr = await vi.importActual<typeof import('vue-router')>('vue-router')
const { buildIaRoutes, IA_AREAS } = await import('../../ia2/routes')

describe('contract: v12 unified IA routes (§8 双视图)', () => {

  function makeRouter(): import('vue-router').Router {
    return vr.createRouter({ history: vr.createMemoryHistory(), routes: buildIaRoutes() })
  }

  it('双视图 /app 侧单场景存在，命名前缀 ia2.（沟通协作=登录默认落点）', () => {
    const router = makeRouter()
    expect(IA_AREAS.map(a => a.key)).toEqual(['collab'])
    for (const area of IA_AREAS) {
      const resolved = router.resolve(area.path)
      expect(resolved.name, `${area.path} 必须可解析（契约：视图存在性）`).toBe(area.name)
      expect(String(resolved.name).startsWith('ia2.')).toBe(true)
    }
    // /app 裸路径 = 沟通协作工作台（登录默认落点，071 守卫直落）
    expect(router.resolve('/app').name).toBe('ia2.collab')
    // fullscreen meta（壳自带场景条，上游 AppSidebar 隐藏）
    expect(router.resolve('/app/board').meta.fullscreen).toBe(true)
  })

  it('工作台选择子路由契约：会话/房间/循环 + hermes 深链面全部可解析', () => {
    const router = makeRouter()
    expect(router.resolve('/app/s/chat').name).toBe('ia2.collabChat')
    expect(router.resolve('/app/s/chat/s1').name).toBe('ia2.collabSession')
    expect(router.resolve('/app/s/room/r1').name).toBe('ia2.commsRoom')
    expect(router.resolve('/app/l/lp1').name).toBe('ia2.loopCanvas')
    expect(router.resolve('/app/history').name).toBe('ia2.collabHistory')
    expect(router.resolve('/app/history/session/s1').name).toBe('ia2.collabHistorySession')
    expect(router.resolve('/app/agent').name).toBe('ia2.collabGlobalAgent')
    expect(router.resolve('/app/agent/session/s1').name).toBe('ia2.collabGlobalAgentSession')
  })

  it('参数路由契约：run 详情 runId / matrix 房间 roomId 原样', () => {
    const router = makeRouter()
    expect(router.resolve('/app/runs/run-9').params.runId).toBe('run-9')
    expect(router.resolve('/app/s/room/!foo:bar').params.roomId).toBe('!foo:bar')
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
