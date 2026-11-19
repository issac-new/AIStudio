// 能力池真实数据走查（批二点五）：读仓内真实能力台账/能力图/profiles，配临时看板库。
// 与 controller.test.ts 的分工：那个用全夹具锁契约；这个用真实事实源证明“能力供需表
// 在真实数据上不是空转”，并验证候选准入的三种决策。临时 HERMES_HOME 隔离，不碰宿主库。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { DatabaseSync } from 'node:sqlite'

import { collectCapabilityPoolReport } from '../collect'
import { assessTaskCapabilityReadiness } from '../readiness'

let root = ''
let server: Server | undefined
let base = ''

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'capability-real-'))
  const home = join(root, 'hermes')
  mkdirSync(home, { recursive: true })
  const db = new DatabaseSync(join(home, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, skills TEXT)')
  db.exec('CREATE TABLE task_runs (task_id TEXT NOT NULL, started_at INTEGER NOT NULL)')
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?)').run('real-t1', 'ready', 1, '["coding","review"]')
  db.prepare('INSERT INTO task_runs VALUES (?,?)').run('real-t1', 2)
  db.close()

  process.env.HERMES_HOME = home
  process.env.HERMES_WEB_UI_HOME = join(root, 'webui')
  // 技能清单读仓内真实文件；舰队上报隔离到空目录，避免读宿主运行态。
  process.env.SKILL_PROVISION_MANIFEST = join(process.cwd(), 'team/profiles/_shared/skill-provisioning.json')
  process.env.SKILL_PROVISION_FLEET_DIR = join(root, 'fleet')
  delete process.env.GOVERNANCE_DIR
  delete process.env.OVERLAY_REPO_ROOT

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
  delete process.env.HERMES_HOME
  delete process.env.HERMES_WEB_UI_HOME
  delete process.env.SKILL_PROVISION_MANIFEST
  delete process.env.SKILL_PROVISION_FLEET_DIR
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('真实事实源走查', () => {
  it('供需投影读到仓内真实能力台账与能力图，且任务需求进入行', async () => {
    const report = await collectCapabilityPoolReport()
    expect(report.sources['capability-ledger'].available).toBe(true)
    expect(report.sources['capability-graph'].available).toBe(true)
    const coding = report.rows.find((row) => row.tag === 'coding')
    expect(coding).toBeDefined()
    expect(coding!.demand).toBeGreaterThanOrEqual(1)
    expect(coding!.supplyUnits + coding!.supplyAgents + coding!.supplySkills).toBeGreaterThan(0)
    expect(coding!.evidenceRefs).toContain('task:real-t1')
  })

  it('真实能力图下 worker-coder 覆盖 coding；未声明的 review 只警告；未知能力阻断', () => {
    expect(assessTaskCapabilityReadiness({ requiredTags: ['coding'], assignee: 'worker-coder' }).decision).toBe('pass')
    const review = assessTaskCapabilityReadiness({ requiredTags: ['review'], assignee: 'worker-coder' })
    expect(review.decision).not.toBe('block')
    if (review.decision === 'warn') expect(review.reasons.join()).toContain('review')
    expect(assessTaskCapabilityReadiness({ requiredTags: ['nonexistent-capability-xyz'], assignee: null }).decision).toBe('block')
  })

  it('真实 HTTP 面：供需端点与候选端点可读', async () => {
    const supply = await (await fetch(`${base}/supply-demand`)).json() as {
      ok: boolean
      report: { rows: Array<{ tag: string }>; sources: Record<string, { available: boolean }> }
    }
    expect(supply.ok).toBe(true)
    expect(supply.report.rows.length).toBeGreaterThan(0)
    expect(supply.report.sources['capability-graph'].available).toBe(true)

    const candidates = await (await fetch(`${base}/candidates?tags=coding&assignee=worker-coder`)).json() as {
      ok: boolean
      readiness: { decision: string; candidates: Array<{ agentId: string }> }
    }
    expect(candidates.ok).toBe(true)
    expect(candidates.readiness.decision).toBe('pass')
  })
})
