// 长程任务可信执行层的守门测试：纯函数 + 业务流 + HTTP 投影三层。
// fixture 全部落 tmpdir；HERMES_TRUST_ROOTS 指向 fixture，避免扫到真仓。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

let dir: string
let ws: string
let server: import('node:http').Server
let port: number

const ENV_KEYS = ['HERMES_TRUST_DIR', 'HERMES_TRUST_ROOTS'] as const

async function startHttp(): Promise<void> {
  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const trustRoutes = (await import('../controller')).default
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
  app.use(trustRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
}

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

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'trust-'))
  ws = join(dir, 'ws')
  mkdirSync(join(ws, 'src'), { recursive: true })
  writeFileSync(join(ws, 'src', 'login.ts'), 'export const login = 1\n')
  writeFileSync(join(ws, 'README.md'), '# demo\n')
  process.env.HERMES_TRUST_DIR = join(dir, 'store')
  process.env.HERMES_TRUST_ROOTS = dir
  await startHttp()
})

afterEach(() => {
  server.close()
  for (const k of ENV_KEYS) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

/** 造一个"两条主张、两条 verified"的已审计案件，返回案件编号。 */
async function auditedCase(): Promise<string> {
  const svc = await import('../service')
  const c = svc.openCase({
    title: '登录改造',
    workspaceRoot: ws,
    actor: 'manager',
    claims: [
      { id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'], claimedBy: 'dev' },
      { id: 'c2', statement: '说明已更新', evidenceRefs: ['file:README.md'], claimedBy: 'dev' },
    ],
  })
  svc.beginAudit(c.id, 'auditor-lead')
  svc.recordAudits(c.id, [
    { claimId: 'c1', verdict: 'verified', auditor: 'auditor-a', observations: ['读取 src/login.ts 并核对摘要'] },
    { claimId: 'c2', verdict: 'verified', auditor: 'auditor-b', observations: ['读取 README.md 并核对摘要'] },
  ], 'auditor-lead')
  return c.id
}

describe('完整性栅栏', () => {
  it('同一工作区两次采集摘要一致；改内容判 modified，只 touch 不改内容不算违规', async () => {
    const { buildManifest, diffManifests } = await import('../integrity')
    const m1 = buildManifest(ws)
    const m2 = buildManifest(ws)
    expect(m1.digest).toBe(m2.digest)
    expect(m1.fileCount).toBe(2)

    const file = join(ws, 'src', 'login.ts')
    utimesSync(file, new Date(), new Date(Date.now() + 5_000))
    const touched = buildManifest(ws)
    expect(touched.digest).toBe(m1.digest)

    writeFileSync(file, 'export const login = 2\n')
    const m3 = buildManifest(ws)
    expect(m3.digest).not.toBe(m2.digest)
    expect(diffManifests(m2, m3)).toEqual([{ path: 'src/login.ts', kind: 'modified' }])
  })

  it('新增与删除都能定位；大文件退化为大小+修改时间', async () => {
    const { buildManifest, diffManifests } = await import('../integrity')
    const before = buildManifest(ws)
    writeFileSync(join(ws, 'new.txt'), 'x')
    rmSync(join(ws, 'README.md'))
    const after = buildManifest(ws)
    const changes = diffManifests(before, after)
    expect(changes).toEqual([
      { path: 'README.md', kind: 'removed' },
      { path: 'new.txt', kind: 'added' },
    ])

    const big = join(ws, 'blob.bin')
    writeFileSync(big, Buffer.alloc(64, 1))
    const m = buildManifest(ws, { bigFileBytes: 8 })
    expect(m.entries.find((e) => e.path === 'blob.bin')?.mode).toBe('size_mtime')
  })

  it('trust 存储目录位于工作区内时被排除，自身写入不触发违规', async () => {
    process.env.HERMES_TRUST_DIR = join(ws, '.trust-store')
    const svc = await import('../service')
    const c = svc.openCase({
      title: '存档同工作区',
      workspaceRoot: ws,
      actor: 'manager',
      claims: [{ id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'], claimedBy: 'dev' }],
    })
    svc.beginAudit(c.id, 'auditor-lead')
    svc.recordAudits(c.id, [
      { claimId: 'c1', verdict: 'verified', auditor: 'auditor-a', observations: ['核对文件'] },
    ], 'auditor-lead')
    const res = svc.admit(c.id, 'manager')
    expect(res.decision.result).toBe('admitted')
    expect(res.decision.integrity.state).toBe('clean')
  })

  it('工作区根越界拒绝', async () => {
    const other = join(dir, 'other')
    mkdirSync(other)
    process.env.HERMES_TRUST_ROOTS = ws
    const svc = await import('../service')
    expect(() => svc.openCase({ title: '越界', workspaceRoot: other, actor: 'manager' }))
      .toThrow(/允许范围/)
  })
})

describe('角色工具面', () => {
  it('内置三角色满足 0 < 10 < 17 且审计者无写入工具', async () => {
    const { checkSurfaceChain } = await import('../surfaces')
    const r = checkSurfaceChain()
    expect(r.valid).toBe(true)
    expect(r.sizes).toEqual({ manager: 0, auditor: 10, executor: 17 })
  })

  it('审计者持有写入/执行工具即判违规', async () => {
    const { checkSurfaceChain } = await import('../surfaces')
    const r = checkSurfaceChain([
      { role: 'manager', tools: [], allowWrite: false },
      { role: 'auditor', tools: ['fs.read', 'shell.exec'], allowWrite: false },
      { role: 'executor', tools: ['fs.read', 'shell.exec', 'fs.write'], allowWrite: true },
    ])
    expect(r.valid).toBe(false)
    expect(r.violations.join('；')).toContain('auditor 持有写入/执行工具 shell.exec')
  })
})

describe('逐条审计与双准入', () => {
  it('主张全部 verified 且工作区干净 → admitted，伪造尝试为 0', async () => {
    const svc = await import('../service')
    const id = await auditedCase()
    const res = svc.admit(id, 'manager')
    expect(res.decision.result).toBe('admitted')
    expect(res.decision.blockers).toEqual([])
    expect(res.forgeAttempts).toBe(0)
    expect(res.summary.state).toBe('admitted')
    expect(svc.getCase(id).state).toBe('admitted')
  })

  it('审计阶段工作区被改 → untrusted；自报 clean 被框架观察覆盖，伪造尝试累加', async () => {
    const svc = await import('../service')
    const id = await auditedCase()
    writeFileSync(join(ws, 'src', 'login.ts'), 'tampered\n')

    const first = svc.admit(id, 'manager', { auditorReportedIntegrity: 'clean' })
    expect(first.decision.result).toBe('untrusted')
    expect(first.decision.integrity.state).toBe('violated')
    expect(first.decision.integrity.overridden).toBe(true)
    expect(first.decision.blockers.map((b) => b.code)).toContain('integrity_violated')
    expect(first.forgeAttempts).toBe(1)

    const second = svc.admit(id, 'manager')
    expect(second.forgeAttempts).toBe(2)
  })

  it('缺少审计 → untrusted；请求体夹带 state 不生效', async () => {
    const svc = await import('../service')
    const c = svc.openCase({
      title: '未审计',
      workspaceRoot: ws,
      actor: 'manager',
      claims: [{ id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'], claimedBy: 'dev' }],
    })
    svc.beginAudit(c.id, 'auditor-lead')
    const res = svc.admit(c.id, 'manager', { state: 'admitted', result: 'admitted' } as any)
    expect(res.decision.result).toBe('untrusted')
    expect(res.decision.blockers.map((b) => b.code)).toContain('claim_unverified')
  })

  it('审计者与主张人相同 → 400', async () => {
    const svc = await import('../service')
    const c = svc.openCase({
      title: '自审',
      workspaceRoot: ws,
      actor: 'manager',
      claims: [{ id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'], claimedBy: 'dev' }],
    })
    svc.beginAudit(c.id, 'lead')
    let err: any
    try {
      svc.recordAudits(c.id, [
        { claimId: 'c1', verdict: 'verified', auditor: 'dev', observations: ['自己看了一遍'] },
      ], 'lead')
    } catch (e) {
      err = e
    }
    expect(err?.status).toBe(400)
    expect(err?.message).toContain('auditor 不能与主张人相同')
  })

  it('只有自然语言说明不能判 verified；file 锚必须在基线清单里', async () => {
    const svc = await import('../service')
    const c = svc.openCase({
      title: '证据不足',
      workspaceRoot: ws,
      actor: 'manager',
      claims: [
        { id: 'note', statement: '我完成了', evidenceRefs: ['note:我说完成就完成了'], claimedBy: 'dev' },
        { id: 'ghost', statement: '文件存在', evidenceRefs: ['file:src/ghost.ts'], claimedBy: 'dev' },
      ],
    })
    svc.beginAudit(c.id, 'lead')
    let noteErr: any
    try {
      svc.recordAudits(c.id, [{ claimId: 'note', verdict: 'verified', auditor: 'auditor-a', observations: ['看了'] }], 'lead')
    } catch (e) {
      noteErr = e
    }
    expect(noteErr?.status).toBe(400)
    expect(noteErr?.message).toContain('机器可核验')

    let ghostErr: any
    try {
      svc.recordAudits(c.id, [{ claimId: 'ghost', verdict: 'verified', auditor: 'auditor-a', observations: ['看了'] }], 'lead')
    } catch (e) {
      ghostErr = e
    }
    expect(ghostErr?.status).toBe(400)
    expect(ghostErr?.detail?.path).toBe('src/ghost.ts')
  })

  it('sha256 证据锚必须与基线文件摘要一致', async () => {
    const svc = await import('../service')
    const good = sha256('export const login = 1\n')
    const c = svc.openCase({
      title: '摘要核验',
      workspaceRoot: ws,
      actor: 'manager',
      claims: [
        {
          id: 'wrong', statement: '摘要对不上',
          evidenceRefs: ['file:src/login.ts', `sha256:${'0'.repeat(64)}`], claimedBy: 'dev',
        },
        {
          id: 'good', statement: '摘要对得上',
          evidenceRefs: ['file:src/login.ts', `sha256:${good}`], claimedBy: 'dev',
        },
      ],
    })
    svc.beginAudit(c.id, 'lead')

    let wrongErr: any
    try {
      svc.recordAudits(c.id, [
        { claimId: 'wrong', verdict: 'verified', auditor: 'auditor-a', observations: ['算了 sha256'] },
      ], 'lead')
    } catch (e) {
      wrongErr = e
    }
    expect(wrongErr?.status).toBe(400)
    expect(wrongErr?.message).toContain('摘要不一致')

    const added = svc.recordAudits(c.id, [
      { claimId: 'good', verdict: 'verified', auditor: 'auditor-a', observations: ['算了 sha256'] },
    ], 'lead')
    expect(added[0].verdict).toBe('verified')
  })

  it('refuted 阻断准入；proposal 必须覆盖全部主张', async () => {
    const svc = await import('../service')
    const c = svc.openCase({
      title: '被驳回',
      workspaceRoot: ws,
      actor: 'manager',
      claims: [
        { id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'], claimedBy: 'dev' },
        { id: 'c2', statement: '说明已更新', evidenceRefs: ['file:README.md'], claimedBy: 'dev' },
      ],
    })
    svc.beginAudit(c.id, 'lead')
    svc.recordAudits(c.id, [
      { claimId: 'c1', verdict: 'refuted', auditor: 'auditor-a', observations: ['文件内容与声称不符'], counterEvidence: '文件里没有登录入口' },
      { claimId: 'c2', verdict: 'verified', auditor: 'auditor-b', observations: ['核对说明'] },
    ], 'lead')
    const res = svc.admit(c.id, 'manager')
    expect(res.decision.result).toBe('untrusted')
    expect(res.decision.blockers).toContainEqual({ code: 'claim_refuted', claimId: 'c1', detail: '审计观察到反证' })

    let err: any
    try {
      svc.admit(c.id, 'manager', { proposal: ['c1'] })
    } catch (e) {
      err = e
    }
    expect(err?.status).toBe(400)
    expect(err?.message).toContain('必须覆盖全部主张')
  })

  it('新增主张会让已准入案件回到待裁决', async () => {
    const svc = await import('../service')
    const id = await auditedCase()
    expect(svc.admit(id, 'manager').decision.result).toBe('admitted')
    svc.addClaims(id, [{ id: 'c3', statement: '补充事项', evidenceRefs: ['file:README.md'], claimedBy: 'dev' }], 'manager')
    expect(svc.getCase(id).state).toBe('open')
  })
})

describe('原子断点与事件账', () => {
  it('断点核对：未改动 consistent，改动后 diverged；新增审计置 caseChanged', async () => {
    const svc = await import('../service')
    const id = await auditedCase()
    const cp = svc.writeCheckpoint(id, 'manager', { round: 1 })
    const v1 = svc.verifyCheckpoint(id, cp.id)
    expect(v1.status).toBe('consistent')
    expect(v1.caseChanged).toBe(false)

    writeFileSync(join(ws, 'README.md'), '# changed\n')
    const v2 = svc.verifyCheckpoint(id, cp.id)
    expect(v2.status).toBe('diverged')
    expect(v2.changes).toContainEqual({ path: 'README.md', kind: 'modified' })

    svc.recordAudits(id, [
      { claimId: 'c1', verdict: 'unverified', auditor: 'auditor-c', observations: ['需要补充'] },
    ], 'lead')
    expect(svc.verifyCheckpoint(id, cp.id).caseChanged).toBe(true)
  })

  it('事件账前向链可验证；改写记录后 hash_mismatch 现形', async () => {
    const svc = await import('../service')
    const id = await auditedCase()
    const v = svc.ledgerVerification()
    expect(v.intact).toBe(true)
    expect(v.total).toBeGreaterThanOrEqual(3)

    const file = join(process.env.HERMES_TRUST_DIR as string, 'ledger.json')
    const data = JSON.parse(readFileSync(file, 'utf8'))
    data.events[0].actor = 'attacker'
    writeFileSync(file, JSON.stringify(data))
    const broken = svc.ledgerVerification()
    expect(broken.intact).toBe(false)
    expect(broken.checks.some((x) => x.status === 'hash_mismatch')).toBe(true)
    expect(id).toBeTruthy()
  })

  it('事件账文件损坏时拒绝读取与继续追加，不静默重开链', async () => {
    const svc = await import('../service')
    await auditedCase()
    writeFileSync(join(process.env.HERMES_TRUST_DIR as string, 'ledger.json'), '{broken')
    expect(() => svc.ledgerVerification()).toThrow(/损坏/)
  })
})

describe('HTTP 投影', () => {
  it('overview/surfaces 可读，完整流程 201/200 且 admit 返回 admitted', async () => {
    const ov = await get('/overview')
    expect(ov.status).toBe(200)
    expect(ov.body.ok).toBe(true)
    expect(ov.body.surfaceValid).toBe(true)

    const surfaces = await get('/surfaces')
    expect(surfaces.body.valid).toBe(true)
    expect(surfaces.body.sizes).toEqual({ manager: 0, auditor: 10, executor: 17 })

    const created = await post('/cases', {
      title: 'HTTP 案件',
      workspaceRoot: ws,
      actor: 'manager',
      claims: [{ id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'], claimedBy: 'dev' }],
    })
    expect(created.status).toBe(201)
    const caseId = created.body.case.id

    expect((await post(`/cases/${caseId}/begin-audit`, { actor: 'lead' })).status).toBe(200)
    expect((await post(`/cases/${caseId}/audits`, {
      actor: 'lead',
      audits: [{ claimId: 'c1', verdict: 'verified', auditor: 'auditor-a', observations: ['核对文件'] }],
    })).status).toBe(201)

    const admitted = await post(`/cases/${caseId}/admit`, { actor: 'manager', state: 'admitted' })
    expect(admitted.status).toBe(200)
    expect(admitted.body.decision.result).toBe('admitted')

    const detail = await get(`/cases/${caseId}`)
    expect(detail.body.case.state).toBe('admitted')
  })

  it('未知案件返回 404', async () => {
    const r = await post('/cases/not-exist/admit', { actor: 'manager' })
    expect(r.status).toBe(404)
    expect(r.body.ok).toBe(false)
  })

  it('挂在既有 /api/harness 之下，路径 /api/harness/trust/* 可达', async () => {
    const { createServer } = await import('node:http')
    const Koa = (await import('koa')).default
    const { harnessRoutes } = await import('../../harness/harness-controller')
    const app = new Koa()
    app.use(harnessRoutes.routes())
    const nested = createServer(app.callback())
    await new Promise<void>((r) => nested.listen(0, '127.0.0.1', r))
    const p = (nested.address() as { port: number }).port
    try {
      const res = await fetch(`http://127.0.0.1:${p}/api/harness/trust/overview`)
      expect(res.status).toBe(200)
      const body = await res.json() as any
      expect(body.ok).toBe(true)
      expect(body.surfaceValid).toBe(true)
    } finally {
      nested.close()
    }
  })
})
