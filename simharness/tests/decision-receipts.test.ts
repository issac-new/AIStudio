/**
 * 决策回执层守门（2026-11-06 B 批，spec 2026-11-06-decision-receipts.md）。
 * 四面：①闸判词回执落盘/幂等/改判追加；②strict 自派发台账；③mx-lib log 走 stderr；
 * ④HumanGate 批准前版本复核三态（mismatch 拦/unavailable 放/ok 过）。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const MX = join(ROOT, 'simharness/mux')

function bash(script: string): string {
  const r = execFileSync('bash', ['-c', script], { encoding: 'utf8' })
  return r
}

/** 从 lib 源提取单个函数体（mechanism-behavior.test.ts 同款模式）。 */
function extract(fileName: string, name: string): string {
  const src = readFileSync(join(MX, fileName), 'utf8')
  const start = src.indexOf(`${name}()`)
  expect(start, `${name} 不在 ${fileName}`).toBeGreaterThan(-1)
  const rest = src.slice(start)
  const next = rest.slice(1).search(/\n[a-zA-Z_][a-zA-Z0-9_]*\(\) \{/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

const dirs: string[] = []
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('① 闸判词回执 mx_verdict_receipt', () => {
  const run = (evid: string, gate: string, verdict: string, room: string, card: string, source: string) => bash(`
set -u
EVID_DIR=${JSON.stringify(evid)}
RUN_ID=r-test
${extract('mx-scenario-lib.sh', 'mx_verdict_receipt')}
mx_verdict_receipt "${gate}" "${verdict}" "${room}" "${card}" "${source}"
`)

  it('非空判词落一行结构化回执；同键再调零新增（幂等）；改判追加新行', () => {
    const evid = tempDir('verdict-')
    run(evid, 'G2', 'FAIL', '!room1:x', '卡needle-A', 'combined:room=无,card=FAIL')
    const f = join(evid, 'gate-verdicts.jsonl')
    expect(existsSync(f)).toBe(true)
    let lines = readFileSync(f, 'utf8').trim().split('\n')
    expect(lines.length).toBe(1)
    const row = JSON.parse(lines[0])
    expect(row.gate).toBe('G2')
    expect(row.verdict).toBe('FAIL')
    expect(row.id).toContain('|FAIL')
    expect(row.room_sha).toMatch(/^[0-9a-f]{12}$/)
    expect(row.card_sha).toMatch(/^[0-9a-f]{12}$/)

    // 同键二调：幂等，仍 1 行
    run(evid, 'G2', 'FAIL', '!room1:x', '卡needle-A', 'combined:room=无,card=FAIL')
    lines = readFileSync(f, 'utf8').trim().split('\n')
    expect(lines.length).toBe(1)

    // 改判（verdict 变）：追加新行，tail -1 即末判词
    run(evid, 'G2', 'PASS', '!room1:x', '卡needle-A', 'combined:room=PASS,card=无')
    lines = readFileSync(f, 'utf8').trim().split('\n')
    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[1]).verdict).toBe('PASS')
  })

  it('空判词不落盘（无判词≠决策事件）', () => {
    const evid = tempDir('verdict-empty-')
    run(evid, 'G5', '', '!room2:x', '', 'room')
    expect(existsSync(join(evid, 'gate-verdicts.jsonl'))).toBe(false)
  })

  it('EVID_DIR 缺席 fail-soft 静默（绝不影响判词返回）', () => {
    expect(() => bash(`
set -u
RUN_ID=r-x
${extract('mx-scenario-lib.sh', 'mx_verdict_receipt')}
mx_verdict_receipt G6 PASS "!r:x" "" combined
`)).not.toThrow()
  })
})

describe('② strict 自派发台账 self-dispatch.jsonl', () => {
  const stubsFor = (mode: string) => `
posture() { echo ${mode}; }
compensate() { :; }
human_mxid() { echo "@$1:hs.test"; }
sget() { echo '!room1:x'; }
load_token() { echo tok; }
mx_room_members() { echo; }
mx() { return 0; }
mx_join() { return 0; }
mx_send() { echo "\\$ev-1"; }
_verify_dispatch_delivery() { echo "$2"; }
`
  const runDispatch = (evid: string, mode = 'strict') => bash(`
set -u
EVID_DIR=${JSON.stringify(evid)}
RUN_ID=r-strict
${stubsFor(mode)}
${extract('mx-scenario-lib.sh', 'dispatch_in_room')}
dispatch_in_room "fanfan" "【任务】测试需求：完成某功能并回执" "@wei:hs.test" >/dev/null
`)

  it('strict 姿态派单落一行；standard 姿态零行（代偿账走 dispatch-preset）', () => {
    const evid = tempDir('selfdisp-')
    runDispatch(evid)
    const f = join(evid, 'self-dispatch.jsonl')
    expect(existsSync(f)).toBe(true)
    const row = JSON.parse(readFileSync(f, 'utf8').trim())
    expect(row.run).toBe('r-strict')
    expect(row.from).toBe('fanfan')
    // strict 分支 set -- 覆盖派发词：台账记录的是实际发出的「【自主组织】」需求单
    expect(row.requirement).toContain('【自主组织】收到需求派单')

    // standard 姿态：不落 self-dispatch（走代偿账 dispatch-preset）
    const evid2 = tempDir('selfdisp-std-')
    runDispatch(evid2, 'standard')
    expect(existsSync(join(evid2, 'self-dispatch.jsonl'))).toBe(false)
  })

  it('报告生成器消费实算（源码级接线：硬编码 0 条已替换）', () => {
    const gen = readFileSync(join(MX, 'mx-report-gen.py'), 'utf8')
    expect(gen).toContain('self-dispatch.jsonl')
    expect(gen).toContain('组织自派发在案 {n_selfdisp} 条')
    expect(gen).not.toContain('组织自派发在案 0 条（全部为脚本代演）')
    expect(gen).toContain("'selfDispatch': n_selfdisp")
  })
})

describe('③ mx-lib log()/issue_to_run 走 stderr（A 批挂账 3 清偿）', () => {
  it('log 与 FAIL-CONT 进度行均不出现在 stdout；note() 保持 stdout（$() 捕获消费者）', () => {
    const out = bash(`
set -u
${extract('mx-lib.sh', 'log')}
${extract('mx-lib.sh', 'issue_to_run')}
EVID_DIR=$(mktemp -d)
echo "--stdout--"
log "进度行测试"
issue_to_run t1 s1 "描述" 2>/dev/null
echo "--end--"
`)
    const stdoutLines = out.split('\n').filter(l => l.startsWith('[mux'))
    expect(stdoutLines, `stdout 不应含 [mux 行：${out}`).toEqual([])

    // stderr 侧确有内容（单独捕获）
    const r = spawnSync('bash', ['-c', `
set -u
${extract('mx-lib.sh', 'log')}
log "stderr 侧验证" >&2
`], { encoding: 'utf8' })
    expect(r.stderr).toContain('[mux')
    expect(r.stderr).toContain('stderr 侧验证')
  })

  it('源码级：note() 未被改动（保持 stdout+tee 双写）', () => {
    const src = readFileSync(join(MX, 'mx-scenario-lib.sh'), 'utf8')
    expect(src).toContain('note() { log "$*" | tee -a "$SCEN_LOG"; }')
  })
})

describe('④ HumanGate 批准前版本复核 recheckTaskRevision', () => {
  const task = (body: string) => ({
    id: 't_1', board: 'default', title: '任务一', body, assignee: 'wei', status: 'doing',
  })

  afterEach(() => { vi.unstubAllGlobals() })

  async function call(pending: { scope: string; taskId?: string; board?: string; taskRevision?: string }, taskBody: string | null, ok = true) {
    const mod = await import('../custom/server/approval-inbox/human-gate')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok,
      json: async () => (taskBody === null ? {} : { task: task(taskBody) }),
    })))
    return mod.recheckTaskRevision({ get: () => 'tok' }, pending as any)
  }

  it('批准期间任务被改 → mismatch（拦截语义）', async () => {
    const mod = await import('../custom/server/approval-inbox/human-gate')
    const revA = (await import('../custom/server/approval-inbox/decision-grant')).computeTaskRevision(task('版本A正文'))
    const revB = (await import('../custom/server/approval-inbox/decision-grant')).computeTaskRevision(task('版本B正文'))
    expect(revA).not.toBe(revB)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ task: task('版本B正文') }) })))
    const r = await mod.recheckTaskRevision(
      { get: () => 'tok' },
      { scope: 'task', taskId: 't_1', board: 'default', taskRevision: revA } as any,
    )
    expect(r.outcome).toBe('mismatch')
  })

  it('版本一致 → ok；任务不可达 → unavailable（fail-soft，不装作复核过了）', async () => {
    const mod = await import('../custom/server/approval-inbox/human-gate')
    const { computeTaskRevision } = await import('../custom/server/approval-inbox/decision-grant')
    const rev = computeTaskRevision(task('正文一致'))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ task: task('正文一致') }) })))
    expect((await mod.recheckTaskRevision({ get: () => 't' }, { scope: 'task', taskId: 't_1', board: 'default', taskRevision: rev } as any)).outcome).toBe('ok')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    expect((await mod.recheckTaskRevision({ get: () => 't' }, { scope: 'task', taskId: 't_1', board: 'default', taskRevision: rev } as any)).outcome).toBe('unavailable')
  })

  it('非任务类批准单 → skipped（无可比对象）', async () => {
    const mod = await import('../custom/server/approval-inbox/human-gate')
    const r = await mod.recheckTaskRevision({ get: () => 't' }, { scope: 'release' } as any)
    expect(r.outcome).toBe('skipped')
  })

  it('路由接线：mismatch 时 409 revision_mismatch（源码级）', () => {
    const src = readFileSync(join(ROOT, 'custom/server/approval-inbox/human-gate.ts'), 'utf8')
    expect(src).toContain("recheck.outcome === 'mismatch'")
    expect(src).toContain("code: 'revision_mismatch'")
    expect(src).toContain('recheck_unavailable')
  })
})
