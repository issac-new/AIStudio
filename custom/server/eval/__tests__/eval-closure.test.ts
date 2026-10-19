// Eval 收口轮守门：版本快照 / 同卷复评 / 处置单机械关闭 / 密封写响应 / 空证据语义。
// 真 koa + fetch，store 全 tmpdir 隔离；判定只用 S0（零判定端依赖）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let server: import('node:http').Server
let port: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'eval-closure-'))
  process.env.EVAL_STORE = join(dir, 'eval')
  process.env.REDTEAM_STORE = join(dir, 'redteam')
  process.env.HELDOUT_STORE = join(dir, 'heldout')
  process.env.HERMES_TRACES_DIR = join(dir, 'no-traces')
  process.env.EVAL_TRACE_DIR = join(dir, 'no-traces')

  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const { evalRoutes } = await import('../controller')
  const app = new Koa()
  app.use(async (ctx: any, next: () => Promise<unknown>) => {
    if (ctx.method === 'POST' || ctx.method === 'PUT' || ctx.method === 'PATCH') {
      const chunks: Buffer[] = []
      for await (const chunk of ctx.req) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString('utf8')
      ctx.request.body = raw ? JSON.parse(raw) : {}
    }
    await next()
  })
  app.use(evalRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterEach(() => {
  server.close()
  for (const k of ['EVAL_STORE', 'REDTEAM_STORE', 'HELDOUT_STORE', 'HERMES_TRACES_DIR', 'EVAL_TRACE_DIR']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

const get = async (path: string): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, body: await res.json() }
}

const post = async (path: string, body: unknown): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const okTask = {
  id: 't1', problem: 'p', expectedBehavior: 'e',
  rubric: [{ id: 'a1', text: '回复含 OK', expect: 'yes', kind: 'result', s0: { kind: 'regex', pattern: 'OK' } }],
}

const riskTask = {
  id: 'r1', problem: 'p', expectedBehavior: 'e',
  rubric: [{ id: 'a1', text: '红线未发生', expect: 'no', kind: 'risk', s0: { kind: 'regex', pattern: 'DELETE_ALL' } }],
}

async function createSet(name: string, tasks: unknown[] = [okTask]): Promise<string> {
  const res = await post('/api/hermes/eval/sets', { name, track: 'e2e', tasks })
  expect(res.status).toBe(201)
  return res.body.set.id
}

async function createRun(setId: string, samples: Record<string, unknown[]>): Promise<any> {
  const res = await post('/api/hermes/eval/runs', { setId, samples })
  expect(res.status).toBe(201)
  return res.body.run
}

const evidence = (transcript: string) => [{ evidence: { transcript } }]

describe('同卷复评与版本快照', () => {
  it('改题后复评仍按旧版本判分；A/B 拒绝跨版本比较', async () => {
    const setId = await createSet('版本集')
    const base = await createRun(setId, { t1: evidence('NO') })
    expect(base.setRevision).toBe(1)

    // 改题：OK → OK2（revision 2）
    const revised = await post(`/api/hermes/eval/sets/${setId}/tasks/t1/rubric`, { assertionId: 'a1', revision: '回复含 OK2' })
    expect(revised.status).toBe(200)
    expect(revised.body.set.revision).toBe(2)

    const revisions = await get(`/api/hermes/eval/sets/${setId}/revisions`)
    expect(revisions.status).toBe(200)
    expect(revisions.body.revisions.map((r: any) => r.revision)).toEqual([1, 2])
    const r1 = await get(`/api/hermes/eval/sets/${setId}/revisions/1`)
    expect(r1.body.revision.tasks[0].rubric[0].text).toBe('回复含 OK')

    // 用旧版本复评：transcript 含 OK 应通过（若误用当前集 OK2 则失败）
    const rerun = await post(`/api/hermes/eval/runs/${base.id}/rerun`, { samples: { t1: evidence('OK') } })
    expect(rerun.status).toBe(201)
    expect(rerun.body.run.setRevision).toBe(1)
    expect(rerun.body.run.aggregates.passAtK).toBe(1)

    const compareSame = await get(`/api/hermes/eval/runs/compare?base=${base.id}&head=${rerun.body.run.id}`)
    expect(compareSame.status).toBe(200)  // 同卷（r1）允许比较

    // 用当前集（r2）新跑一版，跨版本 A/B 必须拒绝
    const rev2run = await createRun(setId, { t1: evidence('OK2') })
    const compare = await get(`/api/hermes/eval/runs/compare?base=${base.id}&head=${rev2run.id}`)
    expect(compare.status).toBe(400)
    expect(compare.body.problems.join()).toContain('考卷版本')
  })

  it('历史运行无版本且当前集指纹不符：拒绝复评，不静默换题', async () => {
    const setId = await createSet('历史集')
    const base = await createRun(setId, { t1: evidence('NO') })
    // 模拟版本功能上线前的历史运行：从落盘文件里删掉 setRevision
    const file = join(process.env.EVAL_STORE!, 'eval-store.json')
    const { readFileSync, writeFileSync } = await import('node:fs')
    const store = JSON.parse(readFileSync(file, 'utf8'))
    const stored = store.runs.find((r: any) => r.id === base.id)
    delete stored.setRevision
    writeFileSync(file, JSON.stringify(store))

    // 改题后当前集指纹不再等于 base.setHash；历史运行无版本可钉 → 必须拒绝
    await post(`/api/hermes/eval/sets/${setId}/tasks/t1/rubric`, { assertionId: 'a1', revision: '回复含 OK2' })
    const rerun = await post(`/api/hermes/eval/runs/${base.id}/rerun`, { samples: { t1: evidence('OK') } })
    expect(rerun.status).toBe(400)
    expect(rerun.body.problems.join()).toContain('改版')
  })
})

describe('处置单机械关闭', () => {
  it('建单幂等；复评失败保持 open；复评通过才 closed；关闭后不可再改', async () => {
    const setId = await createSet('处置集')
    const base = await createRun(setId, { t1: evidence('NO') })

    const created = await post(`/api/hermes/eval/runs/${base.id}/remediations`, { taskId: 't1', sampleIdx: 1, note: '修工具调用' })
    expect(created.status).toBe(201)
    expect(created.body.remediation.status).toBe('open')
    const id = created.body.remediation.id

    const dup = await post(`/api/hermes/eval/runs/${base.id}/remediations`, { taskId: 't1', sampleIdx: 1 })
    expect(dup.status).toBe(200)
    expect(dup.body.created).toBe(false)
    expect(dup.body.remediation.id).toBe(id)

    // 复评仍失败 → open
    const badRerun = await post(`/api/hermes/eval/runs/${base.id}/rerun`, { samples: { t1: evidence('STILL BAD') } })
    expect(badRerun.status).toBe(201)
    const badVerify = await post(`/api/hermes/eval/remediations/${id}/verify`, { rerunRunId: badRerun.body.run.id })
    expect(badVerify.status).toBe(200)
    expect(badVerify.body.closed).toBe(false)
    expect(badVerify.body.remediation.status).toBe('open')
    expect(badVerify.body.remediation.rerunCount).toBe(1)

    // 复评通过 → closed
    const goodRerun = await post(`/api/hermes/eval/runs/${base.id}/rerun`, { samples: { t1: evidence('OK') } })
    const goodVerify = await post(`/api/hermes/eval/remediations/${id}/verify`, { rerunRunId: goodRerun.body.run.id })
    expect(goodVerify.body.closed).toBe(true)
    expect(goodVerify.body.remediation.status).toBe('closed')
    expect(goodVerify.body.remediation.rerunCount).toBe(2)

    // 自改进飞轮（#4）：关闭即自动回流回归样本库（默认开），幂等键 re-<run尾6>-<taskId>
    expect(goodVerify.body.autoReflow).toBeDefined()
    expect(goodVerify.body.autoReflow.ok).toBe(true)
    expect(goodVerify.body.autoReflow.created).toBe(true)
    // 回流幂等键=re-<复评run尾6>-<taskId>（reflow 用 rerun.id 而非 base.id）
    const reflowedTaskId = goodVerify.body.autoReflow.taskId
    const regSets = await get('/api/hermes/eval/sets')
    const regLibMeta = regSets.body.sets.find((s: any) => s.name === '回归样本库')
    expect(regLibMeta).toBeDefined()
    const regLib = await get(`/api/hermes/eval/sets/${regLibMeta.id}`)
    expect(regLib.body.set.tasks.some((t: any) => t.id === reflowedTaskId)).toBe(true)

    const again = await post(`/api/hermes/eval/remediations/${id}/verify`, { rerunRunId: goodRerun.body.run.id })
    expect(again.body.alreadyClosed).toBe(true)
    // 已关闭再 verify 不重复回流
    expect(again.body.autoReflow).toBeUndefined()
  })

  it('已通过样本不建单；跨版本复评不能关闭；密封集拒绝建单', async () => {
    const setId = await createSet('边界集')
    const passRun = await createRun(setId, { t1: evidence('OK') })
    const refused = await post(`/api/hermes/eval/runs/${passRun.id}/remediations`, { taskId: 't1', sampleIdx: 1 })
    expect(refused.status).toBe(400)
    expect(refused.body.problems.join()).toContain('已通过')

    const failRun = await createRun(setId, { t1: evidence('NO') })
    const rem = await post(`/api/hermes/eval/runs/${failRun.id}/remediations`, { taskId: 't1', sampleIdx: 1 })
    expect(rem.status).toBe(201)
    // 建单前的旧通过运行不能当复评证据
    const stale = await post(`/api/hermes/eval/remediations/${rem.body.remediation.id}/verify`, { rerunRunId: passRun.id })
    expect(stale.status).toBe(400)
    expect(stale.body.problems.join()).toContain('早于')

    // 改题后新跑一版（当前 rev2）不能关闭 rev1 的处置单
    await post(`/api/hermes/eval/sets/${setId}/tasks/t1/rubric`, { assertionId: 'a1', revision: '回复含 OK2' })
    const newVersionRun = await createRun(setId, { t1: evidence('OK2') })
    const cross = await post(`/api/hermes/eval/remediations/${rem.body.remediation.id}/verify`, { rerunRunId: newVersionRun.id })
    expect(cross.status).toBe(400)
    expect(cross.body.problems.join()).toContain('指纹')

    const sealedId = await createSet('密封处置集')
    await post(`/api/hermes/eval/sets/${sealedId}/seal`, {})
    const sealedRun = await createRun(sealedId, { t1: evidence('NO') })
    const sealedRem = await post(`/api/hermes/eval/runs/${sealedRun.id}/remediations`, { taskId: 't1', sampleIdx: 1 })
    expect(sealedRem.status).toBe(400)
    expect(sealedRem.body.problems.join()).toContain('密封')
  })
})

describe('密封写响应与空证据', () => {
  it('密封集 Rubric 修订响应不含题目内容；人工裁决响应不含 attempts', async () => {
    const setId = await createSet('密封写集')
    await post(`/api/hermes/eval/sets/${setId}/seal`, {})
    const run = await createRun(setId, { t1: evidence('NO') })

    const attribution = await post(`/api/hermes/eval/runs/${run.id}/attributions`, {
      taskId: 't1', assertionId: 'a1', finding: 'rubric_ambiguous',
    })
    expect(attribution.status).toBe(201)
    const revised = await post(`/api/hermes/eval/sets/${setId}/tasks/t1/rubric`, {
      assertionId: 'a1', revision: '密封改题', iterationId: attribution.body.iteration.id,
    })
    expect(revised.status).toBe(200)
    expect(revised.body.set.tasks).toBeUndefined()
    expect(revised.body.set.taskCount).toBe(1)

    const verdict = await post(`/api/hermes/eval/runs/${run.id}/verdicts`, {
      taskId: 't1', sampleIdx: 1, assertionId: 'a1', value: 'yes',
    })
    expect(verdict.status).toBe(200)
    expect(verdict.body.run.attempts).toBeUndefined()
    expect(verdict.body.run.aggregates).toBeTruthy()
  })

  it('S0 正则无 transcript：判词 unknown，红线层不显示 clean', async () => {
    const setId = await createSet('空证据集', [riskTask])
    const run = await createRun(setId, { r1: [{ evidence: {} }] })
    expect(run.attempts[0].verdicts[0].value).toBe('unknown')
    expect(run.attempts[0].verdicts[0].reason).toContain('证据缺席')
    expect(run.aggregates.byLayer.risk).toBe('unknown')
    expect(run.aggregates.riskVeto).toBe(false)
  })
})
