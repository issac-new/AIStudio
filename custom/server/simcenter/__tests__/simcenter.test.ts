/**
 * simcenter 控制器族单测（三中心重构·波 1，X1 配套守门）。
 * 覆盖：11 端点 HTTP 面（mkdtemp 临时 SIM_ROOT 夹具，不碰真实卷）——env fail-closed
 * 503（631 同款断言）/run 强校验 400/路径穿越 400/run-state 与 631 同构/只读聚合/
 * 唯一写端点 append；及全部导出纯函数契约（journal 尾解析/拓扑端点/交付物匹配/
 * 分支新鲜度三态/锚识别/trace 四列/issues 解析/mark 校验）。
 * 端点挂载走 B 类 patch 638（部署窗口），此处直挂 koa app 守路由+语义。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { Server } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  classifyAnchorId, classifyBranchFresh, DELIVERABLE_PATTERNS, extractAcList, extractCaseResults,
  extractVerdicts, assembleTrace, isValidRun, matchDeliverables, parseForEachRef, parseGraceMs,
  parseIssuesLog, parseJournalTail, parseTopologyEndpoints, safeRunDir, validateEvidenceMark,
} from '../simcenter-controller'

// ── HTTP 测试台（真 koa app + 临时 SIM_ROOT；不依赖上游注入树） ──
import { simcenterRouter } from '../simcenter-controller'

let server: Server
let base = ''
let simRoot = ''
const savedEnv: Record<string, string | undefined> = {}

function seedRunFixture(): void {
  const run1 = resolve(simRoot, 'runs', 'run1')
  const evid = resolve(run1, 'evidence')
  mkdirSync(evid, { recursive: true })
  writeFileSync(resolve(run1, 'state.env'), [
    'posture=standard',
    'g5_release_pass=1792000000',
    'humangate_g5=',
    'analysis_done=1',
    'report_done=',
    'dlv_room=!roomA:matrix.test',
    'room_analysis=!roomB:matrix.test',
    '',
  ].join('\n'), 'utf-8')
  writeFileSync(resolve(run1, 'workflow-journal.ndjson'), [
    '{"t":"situation_brief","w":1,"ts":"2026-10-16T01:00:00Z"}',
    '{"t":"stall_verdict","w":1,"ts":"2026-10-16T01:05:00Z"}',
    'not-json-bad-line',
    '{"t":"gate_verdict","w":2,"ts":"2026-10-16T01:10:00Z"}',
  ].join('\n'), 'utf-8')
  writeFileSync(resolve(evid, 'compensation-ledger.tsv'), [
    'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
    'c1\tt1\tnudge\tPR-3\ta\topen\t',
    'c2\tt2\tnudge\tPR-3\tb\tresolve\tfix',
    '',
  ].join('\n'), 'utf-8')
  writeFileSync(resolve(evid, '需求冻结单.md'), [
    '# 冻结单',
    'AC-1 支付核心下单链路金额单位为分（int64）',
    'AC 2 退款单 72 小时内自动对账闭环',
    'AC-3 台账字段与冻结单一致',
    '',
  ].join('\n'), 'utf-8')
  writeFileSync(resolve(evid, '测试报告.md'), [
    'AC-1 用例 Q1 通过',
    'AC-2 用例 Q2 失败',
    'AC-3 用例 Q3 阻塞',
    '',
  ].join('\n'), 'utf-8')
  writeFileSync(resolve(evid, '验收书.md'), [
    'AC-1 判词：通过',
    'AC-2 判词：不通过',
    'AC-3 判词：有条件通过',
    '',
  ].join('\n'), 'utf-8')
  writeFileSync(resolve(evid, 'app-registry.md'), '# 资产表\n', 'utf-8')
  writeFileSync(resolve(evid, 'issues.log'), [
    'ISSUE|raci-missing|fanfan-agent|RACI 双 @ 群通知未见',
    'ISSUE|anexec-missing|AN-MP-|分析文档未入库',
    'DISP|raci-missing|fanfan-agent|已修 终态闭环：回执已在房间可见',
    '',
  ].join('\n'), 'utf-8')
  // run2：issues.log 落 run 根（两处兼容面）
  const run2 = resolve(simRoot, 'runs', 'run2')
  mkdirSync(run2, { recursive: true })
  writeFileSync(resolve(run2, 'issues.log'), 'ISSUE|x|y|z\n', 'utf-8')
}

beforeAll(async () => {
  for (const k of ['OBS_SIM_ROOT', 'SIM_TOPOLOGY_ENDPOINTS', 'SIM_DISPATCHER_HEALTH_CLI', 'SIM_SLEEPING_WORKERS_CLI', 'SIM_BRANCHES_REPO', 'SIM_BRANCH_GRACE_MS', 'SIM_ANCHOR_REPO', 'SIM_KANBAN_API']) {
    savedEnv[k] = process.env[k]
  }
  simRoot = mkdtempSync(join(tmpdir(), 'wp1-sim-'))
  seedRunFixture()
  process.env.OBS_SIM_ROOT = simRoot
  const app = new Koa()
  app.use(bodyParser())
  app.use(simcenterRouter.routes())
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>(r => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterAll(() => {
  server?.close()
  rmSync(simRoot, { recursive: true, force: true })
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

describe('simcenter 纯函数', () => {
  it('run 校验与路径穿越二道闸', () => {
    expect(isValidRun('run-1.2_x')).toBe(true)
    expect(isValidRun('../escape')).toBe(false) // 含 / 不过字符集
    expect(isValidRun('')).toBe(false)
    expect(isValidRun('a'.repeat(65))).toBe(false)
    // '..' 能过字符集——由 safeRunDir resolve+startsWith 拦
    expect(isValidRun('..')).toBe(true)
    expect(safeRunDir(simRoot, '..')).toBeNull()
    expect(safeRunDir(simRoot, '.')).toBeNull()
    expect(safeRunDir(simRoot, 'run1')).toBe(resolve(simRoot, 'runs', 'run1'))
    expect(safeRunDir(simRoot, '../escape')).toBeNull()
  })
  it('journal 尾解析：坏行跳过并计数', () => {
    const { lines, skipped } = parseJournalTail('{"a":1}\nbad\n{"b":2}\n\n', 10)
    expect(lines).toEqual([{ a: 1 }, { b: 2 }])
    expect(skipped).toBe(1)
    expect(parseJournalTail('{"a":1}\n{"b":2}\n{"c":3}\n', 2).lines).toEqual([{ b: 2 }, { c: 3 }])
  })
  it('拓扑端点解析：默认四服务/env 覆盖/畸形跳过', () => {
    expect(Object.keys(parseTopologyEndpoints(undefined))).toEqual(['gateway', 'studio', 'synapse', 'hindsight'])
    const over = parseTopologyEndpoints('gateway=http://10.0.0.1:9001, bogus, synapse=not-a-url')
    expect(over.gateway).toBe('http://10.0.0.1:9001')
    expect(over.synapse).toBe('http://127.0.0.1:8008')
  })
  it('交付物匹配：13 类清单+present/absent+file 锚', () => {
    expect(DELIVERABLE_PATTERNS).toHaveLength(13)
    const out = matchDeliverables(['需求冻结单.md', 'app-registry.md', 'compensation-ledger.tsv'])
    const freeze = out.find(d => d.name === 'freeze')!
    expect(freeze.status).toBe('present')
    expect(freeze.file).toBe('需求冻结单.md')
    // 代偿 TSV 不得误命中工作台账
    expect(out.find(d => d.name === 'work-report')!.status).toBe('absent')
    expect(out.find(d => d.name === 'test-report')!.status).toBe('absent')
    expect(out.filter(d => d.status === 'present')).toHaveLength(2)
  })
  it('分支新鲜度三态（唯一实现语义）', () => {
    const now = 1_000_000_000
    const grace = 3_600_000
    expect(classifyBranchFresh(now - 60_000, now - 60_000, now, grace)).toBe('fresh')
    expect(classifyBranchFresh(now - 60_000, null, now, grace)).toBe('stale') // 从未推送
    expect(classifyBranchFresh(now - 120_000, now - 600_000, now, grace)).toBe('stale') // 本地领先
    expect(classifyBranchFresh(now - 2 * grace, now - 2 * grace, now, grace)).toBe('old') // 出窗
    expect(classifyBranchFresh(now - 2 * grace, now - 60_000, now, grace)).toBe('fresh') // 远端有新活动
  })
  it('宽限窗解析与 for-each-ref 解析', () => {
    expect(parseGraceMs(undefined)).toBe(3_600_000)
    expect(parseGraceMs('7200000')).toBe(7_200_000)
    expect(parseGraceMs('-1')).toBe(3_600_000)
    expect(parseForEachRef('feat/a\t1792000000\nbad-line\nfeat/b\t1792000001\n'))
      .toEqual([{ name: 'feat/a', ts: 1792000000 }, { name: 'feat/b', ts: 1792000001 }])
  })
  it('锚类型识别四类+拒绝', () => {
    expect(classifyAnchorId('$Abc123_event')).toBe('event')
    expect(classifyAnchorId('1a2b3c4d5e6f7')).toBe('commit')
    expect(classifyAnchorId('1a2b3c')).toBeNull() // 6 位不足
    expect(classifyAnchorId('1A2B3C4D5E6F7')).toBeNull() // 大写拒
    expect(classifyAnchorId('t_task-1_x')).toBe('card')
    expect(classifyAnchorId('!roomA:matrix.test')).toBe('room')
    expect(classifyAnchorId('plain garbage!')).toBeNull()
  })
  it('trace 三源提取与四列组装（缺席列 null+meta）', () => {
    const frozen = 'AC-1 金额单位为分\nAC 2 退款闭环\n'
    const report = 'AC-1 通过\nAC-2 失败\n'
    const { rows, meta } = assembleTrace(frozen, report, null)
    expect(meta).toEqual({ frozenPresent: true, testReportPresent: true, acceptancePresent: false })
    expect(rows).toEqual([
      { ac: 'AC-1', criterion: '金额单位为分', caseResult: '通过', uatVerdict: null },
      { ac: 'AC-2', criterion: '退款闭环', caseResult: '失败', uatVerdict: null },
    ])
    expect(extractAcList('AC-1 a\nAC-1 dup\n')[0].criterion).toBe('a') // 重复编号取首行
    expect(extractVerdicts('AC-3 判词：不通过\n')['AC-3']).toBe('不通过') // 长词优先
  })
  it('issues 解析：ISSUE/DISP 结构化+处置率', () => {
    const { lines, stats } = parseIssuesLog('ISSUE|a|x|A 问题\nDISP|a|x|已修闭环\nISSUE|b|y|B 问题\nnoise\n')
    expect(lines).toHaveLength(3)
    expect(stats).toEqual({ totalLines: 4, totalIssue: 2, totalDisp: 1, disposed: 1, open: 1, rate: 0.5 })
    expect(parseIssuesLog('').stats.rate).toBeNull()
  })
  it('mark 入参强校验', () => {
    const ok = { run: 'run1', room: '!roomA', event_id: '$Ab12cd34', summary: 'G5 批准：通过' }
    expect(validateEvidenceMark(ok).ok).toBe(true)
    expect(validateEvidenceMark({ ...ok, room: 'roomA' }).ok).toBe(false) // 缺 !
    expect(validateEvidenceMark({ ...ok, room: '!a b/c' }).ok).toBe(false)
    expect(validateEvidenceMark({ ...ok, event_id: 'Ab12cd34' }).ok).toBe(false) // 缺 $
    expect(validateEvidenceMark({ ...ok, event_id: '$' + 'x'.repeat(25) }).ok).toBe(false) // 超 24
    expect(validateEvidenceMark({ ...ok, summary: 'x'.repeat(201) }).ok).toBe(false)
    expect(validateEvidenceMark({ ...ok, summary: '  ' }).ok).toBe(false)
    expect(validateEvidenceMark({ ...ok, run: '../escape' }).ok).toBe(false)
  })
})

describe('simcenter HTTP 面', () => {
  it('env fail-closed：OBS_SIM_ROOT 缺席=503（631 同款断言）', async () => {
    const saved = process.env.OBS_SIM_ROOT
    delete process.env.OBS_SIM_ROOT
    const r = await get('/api/hermes/sim/run-state?run=run1')
    expect(r.status).toBe(503)
    expect(r.body.error).toContain('fail-closed')
    process.env.OBS_SIM_ROOT = saved
  })
  it('run-state：透传 631 同构输出', async () => {
    const r = await get('/api/hermes/sim/run-state?run=run1')
    expect(r.status).toBe(200)
    expect(r.body.posture).toBe('standard')
    expect(r.body.gates.g5_release_pass).toBe('1792000000')
    expect(r.body.gates.humangate_g5).toBe('')
    expect(r.body.steps.analysis_done).toBe('1')
    expect(r.body.ledger).toEqual({ total: 2, open: 1, byType: { nudge: 2 } })
    expect(r.body.source.ledgerPresent).toBe(true)
  })
  it('run-state：非法 run 400/不存在 404/路径穿越 400', async () => {
    expect((await get('/api/hermes/sim/run-state?run=bad/run')).status).toBe(400)
    expect((await get('/api/hermes/sim/run-state?run=nope')).status).toBe(404)
    expect((await get('/api/hermes/sim/run-state?run=..')).status).toBe(400)
  })
  it('journal：尾部读取+坏行计数；tail 非法 400；缺席 404；穿越 400', async () => {
    const r = await get('/api/hermes/sim/journal?run=run1&tail=3')
    expect(r.status).toBe(200)
    expect(r.body.count).toBe(2)
    expect(r.body.skippedBadLines).toBe(1)
    expect((await get('/api/hermes/sim/journal?run=run1&tail=abc')).status).toBe(400)
    expect((await get('/api/hermes/sim/journal?run=run1&tail=0')).status).toBe(400)
    expect((await get('/api/hermes/sim/journal?run=nope')).status).toBe(404)
    expect((await get('/api/hermes/sim/journal?run=..')).status).toBe(400)
  })
  it('topology：逐服务 fail-soft（不可达=ok:false+错误摘要）', async () => {
    process.env.SIM_TOPOLOGY_ENDPOINTS = 'gateway=http://127.0.0.1:1,studio=http://127.0.0.1:1,synapse=http://127.0.0.1:1,hindsight=http://127.0.0.1:1'
    const r = await get('/api/hermes/sim/topology')
    expect(r.status).toBe(200)
    for (const name of ['gateway', 'studio', 'synapse', 'hindsight']) {
      expect(r.body.services[name].ok).toBe(false)
      expect(typeof r.body.services[name].error).toBe('string')
      expect((r.body.services[name].error as string).length).toBeLessThanOrEqual(201)
    }
  })
  it('topology：健康服务 ok:true+延迟', async () => {
    const { createServer } = await import('node:http')
    const probe = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}') })
    await new Promise<void>(r => probe.listen(0, '127.0.0.1', r))
    const port = (probe.address() as { port: number }).port
    process.env.SIM_TOPOLOGY_ENDPOINTS = `gateway=http://127.0.0.1:${port},synapse=http://127.0.0.1:1`
    const r = await get('/api/hermes/sim/topology')
    expect(r.body.services.gateway.ok).toBe(true)
    expect(r.body.services.gateway.latency_ms).toBeGreaterThanOrEqual(0)
    expect(r.body.services.synapse.ok).toBe(false)
    probe.close()
  })
  it('dispatcher-health：CLI env 缺席=503 fail-closed', async () => {
    const saved = process.env.SIM_DISPATCHER_HEALTH_CLI
    delete process.env.SIM_DISPATCHER_HEALTH_CLI
    const r = await get('/api/hermes/sim/dispatcher-health')
    expect(r.status).toBe(503)
    expect(r.body.error).toContain('SIM_DISPATCHER_HEALTH_CLI')
    process.env.SIM_DISPATCHER_HEALTH_CLI = saved
  })
  it('dispatcher-health：CLI 成功 JSON/失败 ok:false 摘要≤200', async () => {
    const okCli = join(simRoot, 'cli-ok.sh')
    writeFileSync(okCli, '#!/bin/sh\necho \'{"ready":["default"],"stall_ticks":3}\'\n', 'utf-8')
    chmodSync(okCli, 0o755)
    process.env.SIM_DISPATCHER_HEALTH_CLI = okCli
    let r = await get('/api/hermes/sim/dispatcher-health')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.data.ready).toEqual(['default'])
    const badCli = join(simRoot, 'cli-bad.sh')
    writeFileSync(badCli, `#!/bin/sh\necho '${'E'.repeat(500)}' >&2\nexit 1\n`, 'utf-8')
    chmodSync(badCli, 0o755)
    process.env.SIM_DISPATCHER_HEALTH_CLI = badCli
    r = await get('/api/hermes/sim/dispatcher-health')
    expect(r.body.ok).toBe(false)
    expect((r.body.error as string).length).toBeLessThanOrEqual(201) // 摘要截断，不外泄整段 stderr
  })
  it('sleeping-workers：同构门（env 缺席 503；非 JSON 输出 raw 摘要）', async () => {
    const saved = process.env.SIM_SLEEPING_WORKERS_CLI
    delete process.env.SIM_SLEEPING_WORKERS_CLI
    expect((await get('/api/hermes/sim/sleeping-workers')).status).toBe(503)
    const cli = join(simRoot, 'cli-sleep.sh')
    writeFileSync(cli, '#!/bin/sh\nprintf "chen 1234s t_x\\n"\n', 'utf-8')
    chmodSync(cli, 0o755)
    process.env.SIM_SLEEPING_WORKERS_CLI = cli
    const r = await get('/api/hermes/sim/sleeping-workers')
    expect(r.body.ok).toBe(true)
    expect(r.body.data.raw).toContain('chen')
    process.env.SIM_SLEEPING_WORKERS_CLI = saved
  })
  it('deliverables：13 件核对+present/absent；非法 run 400', async () => {
    const r = await get('/api/hermes/sim/deliverables?run=run1')
    expect(r.status).toBe(200)
    expect(r.body.deliverables).toHaveLength(13)
    const names = new Set(r.body.deliverables.map((d: any) => d.name))
    expect(names.has('freeze')).toBe(true)
    expect(names.has('retrospective')).toBe(true)
    expect(r.body.deliverables.find((d: any) => d.name === 'freeze').status).toBe('present')
    expect(r.body.deliverables.find((d: any) => d.name === 'retrospective').status).toBe('absent')
    expect((await get('/api/hermes/sim/deliverables?run=bad*run')).status).toBe(400)
  })
  it('branches：env 缺席=503；真仓三态（stale 未推/old 出窗）', async () => {
    const savedRepo = process.env.SIM_BRANCHES_REPO
    delete process.env.SIM_BRANCHES_REPO
    expect((await get('/api/hermes/sim/branches?run=run1')).status).toBe(503)
    expect((await get('/api/hermes/sim/branches?run=..')).status).toBe(400) // 穿越 400 先于 env 门
    const repo = mkdtempSync(join(tmpdir(), 'wp1-git-'))
    const git = (args: string[], env: Record<string, string> = {}) =>
      execFileSync('git', args, { cwd: repo, env: { ...process.env, ...env }, encoding: 'utf-8' })
    git(['init', '-q'])
    git(['config', 'user.email', 't@t'])
    git(['config', 'user.name', 't'])
    writeFileSync(join(repo, 'a.txt'), 'x\n', 'utf-8')
    git(['add', '.'])
    git(['commit', '-qm', 'base'])
    git(['checkout', '-qb', 'feat/wp1-fresh'])
    writeFileSync(join(repo, 'b.txt'), 'y\n', 'utf-8')
    git(['add', '.'])
    git(['commit', '-qm', 'fresh work']) // 未推送→stale（窗内）
    git(['checkout', '-qb', 'feat/wp1-old'])
    writeFileSync(join(repo, 'c.txt'), 'z\n', 'utf-8')
    git(['add', '.'])
    const oldDate = new Date(Date.now() - 10 * 3_600_000).toISOString()
    git(['commit', '-qm', 'old work'], { GIT_COMMITTER_DATE: oldDate, GIT_AUTHOR_DATE: oldDate }) // 出窗→old
    process.env.SIM_BRANCHES_REPO = repo
    const r = await get('/api/hermes/sim/branches?run=run1')
    expect(r.status).toBe(200)
    const byName: Record<string, any> = Object.fromEntries(r.body.branches.map((b: any) => [b.name, b]))
    expect(byName['feat/wp1-fresh'].freshness).toBe('stale')
    expect(byName['feat/wp1-fresh'].pushed).toBe(false)
    expect(byName['feat/wp1-old'].freshness).toBe('old')
    rmSync(repo, { recursive: true, force: true })
    process.env.SIM_BRANCHES_REPO = savedRepo
  })
  it('anchor：房间号扫描命中/未识别 400/查不到 404', async () => {
    const r = await get(`/api/hermes/sim/anchor?id=${encodeURIComponent('!roomA:matrix.test')}`)
    expect(r.status).toBe(200)
    expect(r.body.type).toBe('room')
    expect(r.body.matches).toEqual([{ run: 'run1', key: 'dlv_room', value: '!roomA:matrix.test' }])
    expect((await get('/api/hermes/sim/anchor?id=garbage')).status).toBe(400)
    // 识别为房间号但任何 state.env 都没有→404 带类型
    const miss = await get(`/api/hermes/sim/anchor?id=${encodeURIComponent('!nobody:matrix.test')}`)
    expect(miss.status).toBe(404)
    expect(miss.body.type).toBe('room')
    // commit 锚：SIM_ANCHOR_REPO 缺席=503
    expect((await get('/api/hermes/sim/anchor?id=1a2b3c4d5e6f7')).status).toBe(503)
  })
  it('anchor：commit 锚 git show 摘要', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'wp1-git2-'))
    const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })
    git(['init', '-q']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't'])
    writeFileSync(join(repo, 'a.txt'), 'x\n', 'utf-8')
    git(['add', '.']); git(['commit', '-qm', 'anchor me'])
    const sha = git(['rev-parse', 'HEAD']).trim()
    process.env.SIM_ANCHOR_REPO = repo
    const r = await get(`/api/hermes/sim/anchor?id=${sha.slice(0, 10)}`)
    expect(r.status).toBe(200)
    expect(r.body.type).toBe('commit')
    expect(r.body.data.stat).toContain('anchor me')
    expect(r.body.data.stat).toContain('a.txt')
    rmSync(repo, { recursive: true, force: true })
    delete process.env.SIM_ANCHOR_REPO
  })
  it('trace：四列聚合+源缺席列 null', async () => {
    const r = await get('/api/hermes/sim/trace?run=run1')
    expect(r.status).toBe(200)
    const byAc: Record<string, any> = Object.fromEntries(r.body.rows.map((row: any) => [row.ac, row]))
    expect(byAc['AC-1']).toEqual({ ac: 'AC-1', criterion: '支付核心下单链路金额单位为分（int64）', caseResult: '通过', uatVerdict: '通过' })
    expect(byAc['AC-2'].uatVerdict).toBe('不通过')
    // run2 无任何源文件：全列 null+meta 全缺席（如实呈现，不硬凑）
    const r2 = await get('/api/hermes/sim/trace?run=run2')
    expect(r2.body.meta).toEqual({ frozenPresent: false, testReportPresent: false, acceptancePresent: false })
    expect(r2.body.rows).toEqual([])
    expect((await get('/api/hermes/sim/trace?run=..')).status).toBe(400)
  })
  it('evidence/mark：合法写 append；全部强校验负例；路径穿越 400', async () => {
    const ok = { run: 'run1', room: '!roomA', event_id: '$Ab12cd34', summary: 'G5 批准：通过' }
    const r = await post('/api/hermes/sim/evidence/mark', ok)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    const file = resolve(simRoot, 'runs', 'run1', 'evidence', 'message-marks.jsonl')
    expect(existsSync(file)).toBe(true)
    const line = JSON.parse(readFileSync(file, 'utf-8').trim().split('\n').pop()!)
    expect(line).toMatchObject({ source: 'server', run: 'run1', room: '!roomA', event_id: '$Ab12cd34', summary: 'G5 批准：通过' })
    expect(typeof line.ts).toBe('string')
    // 负例（每个强校验维度一条 400 路）
    expect((await post('/api/hermes/sim/evidence/mark', { ...ok, room: 'roomA' })).status).toBe(400)
    expect((await post('/api/hermes/sim/evidence/mark', { ...ok, event_id: 'Ab12cd34' })).status).toBe(400)
    expect((await post('/api/hermes/sim/evidence/mark', { ...ok, summary: 'x'.repeat(201) })).status).toBe(400)
    expect((await post('/api/hermes/sim/evidence/mark', { ...ok, summary: '' })).status).toBe(400)
    expect((await post('/api/hermes/sim/evidence/mark', { ...ok, run: 'no-such-run' })).status).toBe(400)
    expect((await post('/api/hermes/sim/evidence/mark', { ...ok, run: '..' })).status).toBe(400) // 穿越负例
  })
  it('issues：evidence/ 与 run 根两处都试；统计计数；非法 run 400', async () => {
    const r = await get('/api/hermes/sim/issues?run=run1')
    expect(r.status).toBe(200)
    expect(r.body.stats).toEqual({ totalLines: 3, totalIssue: 2, totalDisp: 1, disposed: 1, open: 1, rate: 0.5 })
    const r2 = await get('/api/hermes/sim/issues?run=run2') // run 根 issues.log 兜底命中
    expect(r2.status).toBe(200)
    expect(r2.body.stats.totalIssue).toBe(1)
    expect((await get('/api/hermes/sim/issues?run=nope')).status).toBe(404)
    expect((await get('/api/hermes/sim/issues?run=..')).status).toBe(400)
  })
})
