// 能力池只读面契约：供需派生、候选准入、非法标签、源缺席降级。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { DatabaseSync } from 'node:sqlite'

let root = ''
let server: Server | undefined
let base = ''

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'capability-pool-'))
  const repo = join(root, 'repo')
  const home = join(root, 'hermes')
  const webui = join(root, 'webui')
  const gov = join(root, 'governance')
  const fleet = join(root, 'fleet')
  mkdirSync(join(repo, 'team', 'shared'), { recursive: true })
  mkdirSync(join(repo, 'team', 'profiles', '_shared'), { recursive: true })
  mkdirSync(home, { recursive: true })
  mkdirSync(webui, { recursive: true })
  mkdirSync(gov, { recursive: true })
  mkdirSync(fleet, { recursive: true })

  writeFileSync(join(repo, 'team', 'shared', 'profiles.yaml'), [
    'profiles:',
    '  worker:',
    '    skills_enabled: [coding]',
    '    skills_pinned: [review]',
  ].join('\n'))
  writeFileSync(join(repo, 'team', 'shared', 'capability-graph.yaml'), [
    'nodes:',
    '  agents:',
    '    - name: worker',
    '      capabilities: [coding, review]',
    '      reliability: 0.8',
    '    - name: bare',
    '      capabilities: []',
    '      reliability: null',
  ].join('\n'))
  writeFileSync(join(repo, 'team', 'profiles', '_shared', 'skill-provisioning.json'), JSON.stringify({
    version: 1,
    roles: [{ match: 'worker', skills: ['coding', 'deploy'] }],
  }))
  writeFileSync(join(fleet, 'm1.json'), JSON.stringify({
    machine: 'm1',
    generatedAt: Date.now(),
    profiles: [{ profile: 'worker', role: 'coder', skillCount: 1, skills: ['deploy'] }],
  }))
  writeFileSync(join(gov, 'capability-ledger.yaml'), [
    'version: 1',
    'reviewedAt: "2026-11-19"',
    'domains: [{id: engineering, name: 工程, owner: test}]',
    'capabilities:',
    '  - id: eng.implement',
    '    domain: engineering',
    '    name: 实现',
    '    object: 任务',
    '    action: 实现',
    '    importance: core',
    '    maturity: high',
    'units:',
    '  - id: worker',
    '    capability: eng.implement',
    '    primary: true',
    '    kind: roster-role',
    '    owner: test',
    '    lifecycle: active',
    '    sloTier: important',
    '    skills: [coding, review]',
    '    refs: { file: team/profiles/worker/config.yaml }',
    '    reviewedAt: "2026-11-19"',
  ].join('\n'))

  const db = new DatabaseSync(join(home, 'kanban.db'))
  db.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT, status TEXT,
    created_at INTEGER, started_at INTEGER, completed_at INTEGER, skills TEXT
  )`)
  db.exec('CREATE TABLE task_runs (task_id TEXT NOT NULL, started_at INTEGER NOT NULL)')
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?)').run('t1', '实现', '', 'worker', 'ready', 1, null, null, '["coding","review"]')
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?)').run('t2', '缺供给', '', null, 'todo', 3, null, null, '["missing"]')
  db.prepare('INSERT INTO task_runs VALUES (?,?)').run('t1', 2)
  db.close()

  process.env.OVERLAY_REPO_ROOT = repo
  process.env.HERMES_HOME = home
  process.env.HERMES_WEB_UI_HOME = webui
  process.env.GOVERNANCE_DIR = gov
  process.env.SKILL_PROVISION_MANIFEST = join(repo, 'team', 'profiles', '_shared', 'skill-provisioning.json')
  process.env.SKILL_PROVISION_FLEET_DIR = fleet

  const Koa = (await import('koa')).default
  const { capabilityPoolRoutes } = await import('../controller')
  const app = new Koa()
  app.use(capabilityPoolRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterAll(() => {
  server?.close()
  delete process.env.OVERLAY_REPO_ROOT
  delete process.env.HERMES_HOME
  delete process.env.HERMES_WEB_UI_HOME
  delete process.env.GOVERNANCE_DIR
  delete process.env.SKILL_PROVISION_MANIFEST
  delete process.env.SKILL_PROVISION_FLEET_DIR
  if (root) rmSync(root, { recursive: true, force: true })
})

interface ReportRow {
  tag: string
  demand: number
  supplyUnits: number
  supplyAgents: number
  supplySkills: number
  gap: number
  distinctBoards: number
  supplyLeadTimeMedianMs: number | null
  evidenceRefs: string[]
}

describe('GET /supply-demand', () => {
  it('聚合需求/供给/缺口/供给时效，并保留证据引用', async () => {
    const body = await (await fetch(`${base}/supply-demand`)).json() as {
      ok: boolean
      report: { rows: ReportRow[]; sources: Record<string, { available: boolean }>; unknowns: string[] }
    }
    expect(body.ok).toBe(true)
    const rows = new Map(body.report.rows.map((row) => [row.tag, row]))

    const coding = rows.get('coding')
    expect(coding?.demand).toBe(1)
    expect(coding?.supplyUnits).toBe(1)
    expect(coding?.supplyAgents).toBe(1)
    expect(coding?.supplySkills).toBe(1)
    expect(coding?.gap).toBe(0)
    expect(coding?.supplyLeadTimeMedianMs).toBe(1_000)
    expect(coding?.evidenceRefs).toContain('task:t1')
    expect(coding?.evidenceRefs).toContain('ledger:worker')
    expect(coding?.evidenceRefs).toContain('graph:worker')

    const missing = rows.get('missing')
    expect(missing?.demand).toBe(1)
    expect(missing?.supplyUnits).toBe(0)
    expect(missing?.gap).toBe(1)
    expect(missing?.supplyLeadTimeMedianMs).toBeNull()

    expect(body.report.sources['capability-ledger'].available).toBe(true)
    expect(body.report.sources['capability-graph'].available).toBe(true)
    expect(body.report.unknowns.some((note) => note.includes('capability-graph:bare 未声明能力'))).toBe(true)
  })
})

describe('GET /candidates', () => {
  it('无 assignee 时警告并给出候选；缺供给时阻断；assignee 覆盖时放行', async () => {
    const noAssignee = await (await fetch(`${base}/candidates?tags=coding,review`)).json() as {
      ok: boolean
      readiness: { decision: string; reasons: string[]; candidates: Array<{ agentId: string }> }
    }
    expect(noAssignee.ok).toBe(true)
    expect(noAssignee.readiness.decision).toBe('warn')
    expect(noAssignee.readiness.reasons).toContain('no_assignee')
    expect(noAssignee.readiness.candidates.map((c) => c.agentId)).toContain('worker')

    const blocked = await (await fetch(`${base}/candidates?tags=missing`)).json() as {
      ok: boolean
      readiness: { decision: string; reasons: string[] }
    }
    expect(blocked.readiness.decision).toBe('block')
    expect(blocked.readiness.reasons).toContain('capability_not_supplied:missing')

    const covered = await (await fetch(`${base}/candidates?tags=coding,review&assignee=worker`)).json() as {
      readiness: { decision: string; reasons: string[] }
    }
    expect(covered.readiness.decision).toBe('pass')
    expect(covered.readiness.reasons).toContain('assignee_covers')

    const undeclared = await (await fetch(`${base}/candidates?tags=coding,review&assignee=other`)).json() as {
      readiness: { decision: string; reasons: string[] }
    }
    expect(undeclared.readiness.decision).toBe('warn')
    expect(undeclared.readiness.reasons).toContain('assignee_undeclared:coding')
  })

  it('非法标签 422、空标签 400', async () => {
    const bad = await fetch(`${base}/candidates?tags=Bad`)
    expect(bad.status).toBe(422)
    const badBody = await bad.json() as { code: string }
    expect(badBody.code).toBe('invalid_capability_tags')

    const empty = await fetch(`${base}/candidates`)
    expect(empty.status).toBe(400)
  })
})
