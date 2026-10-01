// v0.3 内核加固守门（上游 v1.24 本地方言）：rawOutput 交叉核验 / 输入快照新鲜度 / 元门缓存排除。
// 每特性配负例：退出码与报告矛盾、静默空跑、快照漂移、元门被缓存——都不得 PASS。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseTAP, parseJUnit, parseRawOutput } from '../src/core/raw-evidence.js'
import { parseGateSpec, parseRun } from '../src/core/parse.js'
import { runCommandExecutor } from '../src/executors/command.js'
import { snapshotForGlobs, snapshotsEqual, inputGlobsOf } from '../src/core/snapshot.js'
import { isFresh, saveRun, loadRun, storePaths } from '../src/core/store.js'
import { isInside } from '../src/core/safe-path.js'
import { runGate } from '../src/core/run.js'
import type { ExecutorSpec, GateRun, GateSpec } from '../src/core/types.js'

const TAP_OK = `TAP version 13
1..2
ok 1 - first
ok 2 - second
# tests 2
# pass 2
# fail 0
`

const TAP_ONE_FAIL = `TAP version 13
1..2
ok 1 - first
not ok 2 - second
`

const JUNIT_OK = `<?xml version="1.0"?>
<testsuite tests="2" failures="0" errors="0" skipped="0">
<testcase classname="calc" name="adds"/><testcase classname="calc" name="subs"/>
</testsuite>
`

const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-v03-'))

describe('safe-path 路径围栏（回归：resolve(rel) 恒绝对路径致真子目录全被误判）', () => {
  it('真子目录在根内；逃逸与绝对路径在根外', () => {
    expect(isInside('/a/b', '/a/b/c/d')).toBe(true)
    expect(isInside('/a/b', '/a/b')).toBe(true)
    expect(isInside('/a/b', '/a/other')).toBe(false)
    expect(isInside('/a/b', '/etc/passwd')).toBe(false)
  })
})

describe('raw-evidence TAP 解析（fail-closed）', () => {
  it('合法 TAP：计数与摘要互核通过', () => {
    const c = parseTAP(TAP_OK)
    expect(c).toMatchObject({ total: 2, passed: 2, failed: 0, skipped: 0, parser: 'tap' })
  })

  it('plan 与点数矛盾 → 拒收', () => {
    expect(() => parseTAP('1..3\nok 1 - a\nok 2 - b\n')).toThrow(/plan 1\.\.3/)
  })

  it('摘要注释与逐点计数矛盾 → 拒收', () => {
    expect(() => parseTAP(`${TAP_ONE_FAIL}# fail 0\n`)).toThrow(/# fail 0.*disagrees/)
  })

  it('Bail out! → 拒收；空文本 → 拒收；零测试点 → 拒收', () => {
    expect(() => parseTAP('1..1\nok 1 - a\nBail out!\n')).toThrow(/Bail out!/)
    expect(() => parseTAP('')).toThrow(/empty/)
    expect(() => parseTAP('TAP version 13\n')).toThrow(/no test points/)
  })

  it('suite 容器点不计入测试数；SKIP/TODO 指令计 skipped', () => {
    const tap = `TAP version 13
1..3
ok 1 - suite
    ---
    type: 'suite'
    ...
ok 2 - real
ok 3 - skipped one # SKIP
`
    const c = parseTAP(tap)
    expect(c).toMatchObject({ total: 2, passed: 1, skipped: 1 })
  })
})

describe('raw-evidence JUnit 解析（fail-closed）', () => {
  it('合法 JUnit：属性求和与逐 testcase 互核通过', () => {
    const c = parseJUnit(JUNIT_OK)
    expect(c).toMatchObject({ total: 2, passed: 2, failed: 0, parser: 'junit' })
    expect(c.cases[0].name).toBe('calc.adds')
  })

  it('tests 属性与 testcase 数矛盾 → 拒收', () => {
    expect(() => parseJUnit(JUNIT_OK.replace('tests="2"', 'tests="3"'))).toThrow(/declares tests=3/)
  })

  it('failures 属性与失败用例数矛盾 → 拒收', () => {
    const xml = `<testsuite tests="1" failures="1" errors="0" skipped="0"><testcase name="t"/></testsuite>`
    expect(() => parseJUnit(xml)).toThrow(/failures\+errors=1 but 0/)
  })

  it('无 testsuite / 无 testcase / 空文本 → 拒收；未知格式 → 拒收', () => {
    expect(() => parseJUnit('<xml/>')).toThrow(/no <testsuite>/)
    expect(() => parseJUnit('<testsuite tests="0"/>')).toThrow(/valid tests attribute|no <testcase>/)
    expect(() => parseJUnit('')).toThrow(/empty/)
    expect(() => parseRawOutput('tapx' as never, 'x')).toThrow(/Unknown rawOutput format/)
  })
})

describe('command executor rawOutput 交叉核验', () => {
  const exec = (rawOutput: ExecutorSpec['rawOutput'], code: string, ws: string) =>
    runCommandExecutor(
      { id: 't', type: 'command', command: [process.execPath, '-e', code], evidenceType: 'unit-test-result', rawOutput },
      { runId: 'run-t', gateId: 'g.t', workspace: ws },
    )

  it('exit 0 + 报告全过 → pass，计数入证据', async () => {
    const ws = tmp()
    writeFileSync(join(ws, 'report.tap'), TAP_OK)
    const out = await exec({ format: 'tap', file: 'report.tap' }, '', ws)
    expect(out.evidence.result).toBe('pass')
    expect(out.evidence.summary).toContain('kernel cross-checked tap: 2 total/2 passed/0 failed')
    expect(out.evidence.artifacts).toEqual(['report.tap'])
  })

  it('exit 0 但报告含失败 → error（退出码一面之词不成立）', async () => {
    const ws = tmp()
    writeFileSync(join(ws, 'report.tap'), TAP_ONE_FAIL)
    const out = await exec({ format: 'tap', file: 'report.tap' }, '', ws)
    expect(out.evidence.result).toBe('error')
    expect(out.evidence.summary).toContain('exit 0 but report has 1 failed')
  })

  it('exit 0 但 total < minTotal → error（静默空跑不是 PASS）', async () => {
    const ws = tmp()
    writeFileSync(join(ws, 'report.tap'), TAP_OK)
    const out = await exec({ format: 'tap', file: 'report.tap', minTotal: 3 }, '', ws)
    expect(out.evidence.result).toBe('error')
    expect(out.evidence.summary).toContain('silent no-op')
  })

  it('报告缺失 / 报告畸形 → error（INCONCLUSIVE 方向）', async () => {
    const ws = tmp()
    const missing = await exec({ format: 'tap', file: 'nope.tap' }, '', ws)
    expect(missing.evidence.result).toBe('error')
    expect(missing.evidence.summary).toContain('report missing')
    writeFileSync(join(ws, 'bad.tap'), '1..5\nok 1 - a\n')
    const bad = await exec({ format: 'tap', file: 'bad.tap' }, '', ws)
    expect(bad.evidence.result).toBe('error')
    expect(bad.evidence.summary).toContain('cross-check rejected')
  })

  it('exit 非 0 + 报告可读 → fail 且附内核重算计数', async () => {
    const ws = tmp()
    writeFileSync(join(ws, 'report.tap'), TAP_ONE_FAIL)
    const out = await exec({ format: 'tap', file: 'report.tap' }, 'process.exit(1)', ws)
    expect(out.evidence.result).toBe('fail')
    expect(out.evidence.summary).toContain('kernel recomputed tap: 2 total/1 passed/1 failed')
  })
})

describe('parse：rawOutput / meta / run 快照回读', () => {
  const baseSpec = {
    apiVersion: 'qgate/v1alpha1', kind: 'Gate',
    metadata: { id: 'g.t', version: '0.1.0' },
    spec: {
      domain: 'L1', claims: ['c'], triggers: ['task_close'],
      executors: [{ id: 't', type: 'command', command: ['true'], evidenceType: 'x' }],
      evidence: { required: ['x'] },
      policy: { failure: 'block', inconclusive: 'block' },
    },
  }

  it('rawOutput 合法解析；坏 format / 空 file / minTotal≤0 拒收', () => {
    const ok = parseGateSpec({
      ...baseSpec,
      spec: {
        ...baseSpec.spec,
        executors: [{ id: 't', type: 'command', command: ['npm', 'test'], evidenceType: 'x', rawOutput: { format: 'junit', file: 'r.xml', minTotal: 1 } }],
      },
    })
    expect(ok!.spec.executors[0].rawOutput).toEqual({ format: 'junit', file: 'r.xml', minTotal: 1 })
    for (const bad of [
      { format: 'csv', file: 'r.xml' },
      { format: 'tap', file: '' },
      { format: 'tap', file: 'r.tap', minTotal: 0 },
    ]) {
      expect(parseGateSpec({
        ...baseSpec,
        spec: { ...baseSpec.spec, executors: [{ id: 't', type: 'command', command: ['true'], evidenceType: 'x', rawOutput: bad }] },
      })).toBeNull()
    }
  })

  it('meta: true 解析；缺省不置位', () => {
    expect(parseGateSpec({ ...baseSpec, spec: { ...baseSpec.spec, meta: true } })!.spec.meta).toBe(true)
    expect(parseGateSpec(baseSpec)!.spec.meta).toBeUndefined()
  })

  it('run 的 inputSnapshot/inputsStable 落盘回读', () => {
    const ws = tmp()
    const paths = storePaths(ws)
    const run: GateRun = {
      runId: 'run-snap', gateId: 'g.t', gateVersion: '0.1.0', trigger: 'task_close', workspace: ws,
      startedAt: 1, verdict: 'PASS', evidenceIds: [],
      inputSnapshot: { 'src/a.ts': 'abc' }, inputsStable: true,
    }
    saveRun(paths, run, [])
    const back = loadRun(paths, 'run-snap')
    expect(back!.inputSnapshot).toEqual({ 'src/a.ts': 'abc' })
    expect(back!.inputsStable).toBe(true)
    expect(parseRun({})).toBeNull()
  })
})

describe('输入快照与新鲜度（v0.3 §3.2）', () => {
  it('快照随内容漂移；glob 面外改动不影响', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'src', 'a.ts'), 'one')
    writeFileSync(join(ws, 'other.txt'), 'x')
    const s1 = snapshotForGlobs(ws, ['src/**'])
    expect(Object.keys(s1)).toEqual(['src/a.ts'])
    appendFileSync(join(ws, 'src', 'a.ts'), 'two')
    const s2 = snapshotForGlobs(ws, ['src/**'])
    expect(snapshotsEqual(s1, s2)).toBe(false)
    appendFileSync(join(ws, 'other.txt'), 'y')
    expect(snapshotsEqual(s2, snapshotForGlobs(ws, ['src/**']))).toBe(true)
  })

  it('isFresh：快照一致即新鲜；不一致即陈（即使 treeHash 相同——快照是权威）', () => {
    const run = {
      runId: 'r', gateId: 'g', gateVersion: '1', trigger: 'task_close', workspace: '/w',
      startedAt: Date.now(), verdict: 'PASS', evidenceIds: [],
      treeHash: 'th', commit: 'c', inputSnapshot: { 'src/a.ts': 'h1' },
    } as GateRun
    const base = { commit: 'c', treeHash: 'th', changedPaths: [] }
    expect(isFresh(run, Date.now(), { ...base, inputSnapshot: { 'src/a.ts': 'h1' } })).toBe(true)
    expect(isFresh(run, Date.now(), { ...base, inputSnapshot: { 'src/a.ts': 'h2' } })).toBe(false)
    expect(isFresh(run, Date.now(), { ...base, inputSnapshot: {} })).toBe(false)
  })

  it('无快照时回退原三锚（treeHash 相同即新鲜）', () => {
    const run = {
      runId: 'r', gateId: 'g', gateVersion: '1', trigger: 'task_close', workspace: '/w',
      startedAt: Date.now(), verdict: 'PASS', evidenceIds: [], treeHash: 'th', commit: 'c',
    } as GateRun
    expect(isFresh(run, Date.now(), { commit: 'c', treeHash: 'th', changedPaths: [] })).toBe(true)
  })
})

describe('runGate 集成：inputsStable 与元门缓存排除', () => {
  const specOf = (over: Partial<GateSpec['spec']>, command: string[]): GateSpec => ({
    apiVersion: 'qgate/v1alpha1',
    kind: 'Gate',
    metadata: { id: 'g.snap', version: '0.1.0' },
    spec: {
      domain: 'L1', claims: ['c'], triggers: ['task_close'],
      appliesWhen: { changed: { any: ['src/**'] } },
      executors: [{ id: 'e', type: 'command', command, evidenceType: 'x' }],
      evidence: { required: ['x'] },
      policy: { failure: 'block', inconclusive: 'block' },
      ...over,
    },
  })

  it('只读命令：inputSnapshot 落档且 inputsStable=true；inputGlobsOf 取并集', async () => {
    const ws = tmp()
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'src', 'a.ts'), 'const x = 1')
    const spec = specOf({}, [process.execPath, '-e', ''])
    expect(inputGlobsOf(spec)).toEqual(['src/**'])
    const { run } = await runGate({ spec, trigger: 'task_close', workspace: ws, qgateDir: join(ws, '.qgate'), changedPaths: [] })
    expect(run.verdict).toBe('PASS')
    expect(run.inputsStable).toBe(true)
    expect(Object.keys(run.inputSnapshot!)).toEqual(['src/a.ts'])
  })

  it('命令改写自身输入：inputsStable=false（门改动自己的输入面被逮住）', async () => {
    const ws = tmp()
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'src', 'a.ts'), 'const x = 1')
    const spec = specOf({}, [process.execPath, '-e', "require('fs').appendFileSync('src/a.ts','//x')"])
    const { run } = await runGate({ spec, trigger: 'task_close', workspace: ws, qgateDir: join(ws, '.qgate'), changedPaths: [] })
    expect(run.inputsStable).toBe(false)
  })

  it('元门不参与 §49 缓存：连跑两次都是 exercised（普通 command 门第二次为 cached）', async () => {
    const ws = tmp()
    const plain = specOf({}, [process.execPath, '-e', ''])
    const meta = specOf({ meta: true }, [process.execPath, '-e', ''])
    const qgateDir = join(ws, '.qgate')
    const p1 = await runGate({ spec: plain, trigger: 'task_close', workspace: ws, qgateDir, changedPaths: [] })
    const p2 = await runGate({ spec: plain, trigger: 'task_close', workspace: ws, qgateDir, changedPaths: [] })
    expect(p1.evidence[0].execution).toBe('exercised')
    expect(p2.evidence[0].execution).toBe('cached')
    const m1 = await runGate({ spec: meta, trigger: 'task_close', workspace: ws, qgateDir, changedPaths: [] })
    const m2 = await runGate({ spec: meta, trigger: 'task_close', workspace: ws, qgateDir, changedPaths: [] })
    expect(m1.evidence[0].execution).toBe('exercised')
    expect(m2.evidence[0].execution).toBe('exercised')
  })
})
