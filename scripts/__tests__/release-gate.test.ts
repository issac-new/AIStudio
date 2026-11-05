// @vitest-environment node
// Task 9 负例（stub 命令注入）：release:gate 编排语义。
// ①任一步 stub 非零→gate 非零且不执行后续步；②stub 测试报告含 1 failed 但 exit 0
// →gate 拦（编排层 JUnit 复析）；③全绿→exit 0、receipt complete、每步九字段证据
// 行携带当前 HEAD 真值（I1 锚定：恰好九键、commit 非 null）。
// 另锚定 {START_TS} 替换（严格报告步的 --since 与 gate 起点一致）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { releaseIdentityFromManifests } from '../../custom/server/platform/delivery/bundle-identity-build'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const gateScript = resolve(repoRoot, 'scripts/platform/release/release-gate.mjs')

let tmp: string
let stepsFile: string
let receiptFile: string
let evidenceFile: string
let junitFile: string
let identityFile: string

/** 造一份新鲜 bundle 身份文件（mtime=当下；可指定 bundleId 与回拨时间）。 */
function makeIdentity(bundleId = 'b'.repeat(64), ageMs = 0, commit = 'c'.repeat(40), patchCount = 468, assetCount = 19): void {
  writeFileSync(identityFile, [
    '# bundle-identity',
    `bundleId: ${bundleId}`,
    `commit: ${commit}`,
    'vendorBaseline.hermes-studio: null',
    'vendorBaseline.hermes-agent: null',
    'vendorBaseline.zcode: null',
    `patches: ${patchCount} sha256:${'1'.repeat(64)}`,
    `runtimeManifest: sha256:${'2'.repeat(64)} assets:${assetCount}`,
    `assets: sha256:${'3'.repeat(64)}`,
    '',
  ].join('\n'))
  if (ageMs > 0) {
    const t = new Date(Date.now() - ageMs)
    utimesSync(identityFile, t, t)
  }
}

function stub(name: string, body: string): string {
  const p = join(tmp, `${name}.mjs`)
  writeFileSync(p, body)
  return p
}

/** stub 步：退出码 code；落 marker 文件证明被执行过；junitStub 额外写坏报告。 */
function stubStep(id: string, code = 0, opts: { junitFail?: boolean; echoTs?: boolean } = {}) {
  const lines = [
    `import { writeFileSync, readFileSync } from 'node:fs'`,
    `writeFileSync(${JSON.stringify(join(tmp, `marker-${id}`))}, 'ran')`,
  ]
  if (opts.junitFail) {
    lines.push(`writeFileSync(${JSON.stringify(junitFile)}, '<testsuites><testsuite name="s" tests="3" failures="1" errors="0"></testsuite></testsuites>')`)
  } else if (opts.echoTs) {
    // 把 argv 里替换后的 --since 值落盘（验证 {START_TS} 注入）
    lines.push(`const i = process.argv.indexOf('--since'); writeFileSync(${JSON.stringify(join(tmp, 'since-value'))}, i >= 0 ? process.argv[i + 1] : 'MISSING')`)
  }
  lines.push(`process.exit(${code})`)
  return { id, label: `stub ${id}`, argv: ['node', stub(`stub-${id}`, lines.join('\n'))], junit: opts.junitFail === true }
}

function writeSteps(steps: Array<ReturnType<typeof stubStep>>): void {
  writeFileSync(stepsFile, `${JSON.stringify({ steps }, null, 2)}\n`)
}

function runGate(): { code: number; out: string } {
  const r = spawnSync(process.execPath, [gateScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_GATE_STEPS_FILE: stepsFile,
      RELEASE_GATE_RECEIPT: receiptFile,
      PLATFORM_EVIDENCE_FILE: evidenceFile,
      RELEASE_GATE_JUNIT_FILE: junitFile,
      RELEASE_GATE_BUNDLE_IDENTITY_FILE: identityFile,
    },
  })
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

function evidenceLines(): Array<Record<string, unknown>> {
  if (!existsSync(evidenceFile)) return []
  return readFileSync(evidenceFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

// 复算输入夹具（P2 Task 4）：终检默认开启——注入 manifest+runtime 清单+HEAD 复算
// 期望 bundleId，身份文件必须逐项相符。所有用例共享该基线（覆盖 identityFile 即得负例）。
function recomputeFixtures(): { expected: string; head: string } {
  const inj = join(tmp, 'overlay-injected.json')
  const runManifest = join(tmp, 'runtime-assets.json')
  writeFileSync(inj, JSON.stringify({
    schemaVersion: 2,
    baseline: { treeOids: { 'hermes-studio': 'ts-oid', 'hermes-agent': 'ta-oid', zcode: null } },
    patches: [
      { name: 'p1.patch', sha256: 'a'.repeat(64) },
      { name: 'p2.patch', sha256: 'b'.repeat(64) },
    ],
  }))
  writeFileSync(runManifest, JSON.stringify({
    schemaVersion: 1,
    assets: [{ rel: 'runtime/pricing/models.yaml', sha256: 'e'.repeat(64), bytes: 10 }],
  }))
  process.env.RELEASE_GATE_INJECTION_MANIFEST_FILE = inj
  process.env.RELEASE_GATE_RUNTIME_MANIFEST_FILE = runManifest
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const { bundleId } = releaseIdentityFromManifests({
    commit: head,
    injectionManifest: JSON.parse(readFileSync(inj, 'utf8')),
    runtimeManifest: JSON.parse(readFileSync(runManifest, 'utf8')),
  })
  return { expected: bundleId, head }
}

let fixtures: { expected: string; head: string }

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'release-gate-'))
  stepsFile = join(tmp, 'steps.json')
  receiptFile = join(tmp, 'release-gate.json')
  evidenceFile = join(tmp, 'evidence.jsonl')
  junitFile = join(tmp, 'junit-report.xml')
  identityFile = join(tmp, 'bundle-identity.txt')
  fixtures = recomputeFixtures()
  makeIdentity(fixtures.expected, 0, fixtures.head, 2, 1) // 缺省=复算一致的新鲜身份；负例用例自行覆盖
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('release:gate 编排（stub 命令注入）', () => {
  it('① 任一步 stub 非零 → gate 非零、后续步不执行、receipt 记 failed', () => {
    writeSteps([stubStep('step-a', 1), stubStep('step-b', 0)])
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('step-a 失败')
    // 后续步未执行（marker 缺席）
    expect(existsSync(join(tmp, 'marker-step-b'))).toBe(false)
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.status).toBe('failed')
    expect(receipt.failedStep).toBe('step-a')
    expect(receipt.steps).toHaveLength(1)
    expect(receipt.steps[0].status).toBe('fail')
    // 证据面：step-a 一条 fail 行，无 step-b 行
    const lines = evidenceLines()
    expect(lines).toHaveLength(1)
    expect(lines[0].subjectId).toBe('release-gate/step-a')
    expect(lines[0].status).toBe('fail')
  })

  it('② stub 报告含 1 failed 但 exit 0 → gate 拦（编排层 JUnit 复析）', () => {
    writeSteps([stubStep('gate-basic-check', 0, { junitFail: true })])
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('JUnit 复析拦截')
    expect(r.out).toContain('failures=1')
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.failedStep).toBe('gate-basic-check')
    expect(receipt.steps[0].failure).toContain('JUnit 复析拦截')
    // 该步证据按 fail 落（exit 0 不代表全绿）
    expect(evidenceLines()[0].status).toBe('fail')
  })

  it('JUnit 复析干净（failures=0）且 exit 0 → 步通过', () => {
    const good = stub('stub-junit-good', [
      `import { writeFileSync } from 'node:fs'`,
      `writeFileSync(${JSON.stringify(junitFile)}, '<testsuites><testsuite name="s" tests="8000" failures="0" errors="0"></testsuite></testsuites>')`,
      `process.exit(0)`,
    ].join('\n'))
    writeFileSync(stepsFile, `${JSON.stringify({ steps: [{ id: 'gate-basic-check', label: 'stub', argv: ['node', good], junit: true }] })}\n`)
    const r = runGate()
    expect(r.code).toBe(0)
    expect(r.out).toContain('✓ 准出通过')
  })

  it('③ 全绿：exit 0、receipt complete、每步九字段证据行绑当前 HEAD 真值', () => {
    writeSteps([stubStep('step-a', 0), stubStep('step-b', 0)])
    const r = runGate()
    expect(r.code).toBe(0)
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.status).toBe('complete')
    expect(receipt.failedStep).toBeNull()
    expect(receipt.steps).toHaveLength(2)
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    expect(receipt.commit).toBe(head)
    // I1 锚定：证据行恰好九键、commit=HEAD 真值（非 null）、producer 固定
    const lines = evidenceLines()
    expect(lines).toHaveLength(3) // 2 步 + 1 bundle 身份终检（round-2 起终检也产证）
    const NINE = ['evidenceId', 'subjectId', 'status', 'producer', 'commit', 'startedAt', 'endedAt', 'sourceDigest', 'artifactRefs']
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual([...NINE].sort())
      expect(line.commit).toBe(head)
      expect(line.producer).toBe('release-gate')
      expect(line.status).toBe('pass')
      expect(line.evidenceId).toMatch(/^release-gate\/\d+\/(step-[ab]|bundle-identity)$/)
    }
  })

  it('{START_TS} 注入：报告步 --since 收到 gate 起点时戳', () => {
    writeSteps([stubStep('report-like', 0, { echoTs: true })])
    // 直接在 steps 文件里把 argv 改成带 --since {START_TS}（模拟真实报告步形态）
    const parsed = JSON.parse(readFileSync(stepsFile, 'utf8'))
    parsed.steps[0].argv = [...parsed.steps[0].argv, '--since', '{START_TS}']
    writeFileSync(stepsFile, `${JSON.stringify(parsed)}\n`)
    const r = runGate()
    expect(r.code).toBe(0)
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    const sinceValue = readFileSync(join(tmp, 'since-value'), 'utf8')
    expect(Number(sinceValue)).toBe(receipt.startedAt)
  })
})

describe('内建步序完整性（变异探针③锚定：编排不得静默丢步）', () => {
  it('内建链必含 qgate 构建/测试门/评测门/类型双门/build:full/严格报告，报告步带三旗标', async () => {
    const { resolveSteps } = await import('../platform/release/release-gate.mjs')
    const steps = resolveSteps({ withPool: false })
    const ids = steps.map((s: { id: string }) => s.id)
    for (const required of ['qgate-build', 'gate-basic-check', 'gate-harness-eval', 'typecheck-harness', 'typecheck-client', 'build-full', 'release-report']) {
      expect(ids).toContain(required)
    }
    // 顺序即准出语义：严格报告必须是最后一步（历史证据/缓存/缺席都逃不过 --since）
    expect(ids[ids.length - 1]).toBe('release-report')
    const report = steps.find((s: { id: string }) => s.id === 'release-report')
    const argv = (report as { argv: string[] }).argv.join(' ')
    for (const flag of ['--require-pass', '--no-cache', '--since']) expect(argv).toContain(flag)
    // 测试门必须走 --require-pass --no-cache（真跑真判，不吃缓存/waiver）
    const basic = steps.find((s: { id: string }) => s.id === 'gate-basic-check')
    const basicArgv = (basic as { argv: string[] }).argv.join(' ')
    for (const flag of ['--require-pass', '--no-cache']) expect(basicArgv).toContain(flag)
    // JUnit 复析只挂在真跑测试的门上
    expect((basic as { junit?: boolean }).junit).toBe(true)
  })
})

describe('bundle 身份终检（P1 round-2：发布门不得无 bundle 身份通过）', () => {
  it('身份文件缺席：全步绿仍拦（failedStep=bundle-identity，证据 fail 行）', () => {
    writeSteps([stubStep('step-a', 0)])
    rmSync(identityFile, { force: true })
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('bundle 身份终检未通过')
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.failedStep).toBe('bundle-identity')
    expect(receipt.bundleIdentity.missing).toBe(true)
    const idEv = evidenceLines().filter((l) => l.subjectId === 'release-gate/bundle-identity')
    expect(idEv).toHaveLength(1)
    expect(idEv[0].status).toBe('fail')
    expect(String(idEv[0].sourceDigest)).toContain('missing')
  })

  it('身份文件过期（mtime 早于 gate 起点）：拦（拿上一轮构建身份当本轮证据=脱钩）', () => {
    writeSteps([stubStep('step-a', 0)])
    makeIdentity('d'.repeat(64), 60_000) // 一分钟前——必然早于 gate 起点
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('stale')
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.failedStep).toBe('bundle-identity')
  })

  it('身份畸形（无 bundleId 行）：拦', () => {
    writeSteps([stubStep('step-a', 0)])
    writeFileSync(identityFile, 'not an identity file\n')
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('unparseable')
  })

  it('新鲜身份（复算一致）：通过 + receipt 携带 bundleId + release-report 步证据 sourceDigest 绑身份', () => {
    const bid = fixtures.expected
    makeIdentity(bid, 0, fixtures.head, 2, 1)
    writeSteps([stubStep('release-report', 0)])
    const r = runGate()
    expect(r.code).toBe(0)
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.bundleIdentity.bundleId).toBe(bid)
    expect(receipt.bundleIdentity.patchCount).toBe(2)
    expect(receipt.bundleIdentity.assetCount).toBe(1)
    const reportEv = evidenceLines().find((l) => l.subjectId === 'release-gate/release-report')
    expect(String(reportEv?.sourceDigest)).toContain(`bundleId=${bid}`)
    expect(String(reportEv?.sourceDigest)).toContain('injectPatches=')
    const idEv = evidenceLines().find((l) => l.subjectId === 'release-gate/bundle-identity')
    expect(idEv?.status).toBe('pass')
    expect(idEv?.artifactRefs).toEqual([identityFile])
  })
})

describe('P2 Task 4：中间步失败 + JUnit testsuites 顶层属性 + 身份复算比对', () => {
  it('中间步失败：首步绿、次步红 → 第三步不执行、failedStep=次步、首步证据 pass', () => {
    writeSteps([stubStep('step-a', 0), stubStep('step-b', 1), stubStep('step-c', 0)])
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('step-b 失败')
    expect(existsSync(join(tmp, 'marker-step-a'))).toBe(true)
    expect(existsSync(join(tmp, 'marker-step-b'))).toBe(true)
    expect(existsSync(join(tmp, 'marker-step-c'))).toBe(false)
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.status).toBe('failed')
    expect(receipt.failedStep).toBe('step-b')
    expect(receipt.steps).toHaveLength(2)
    expect(receipt.steps[0].status).toBe('pass')
    expect(receipt.steps[1].status).toBe('fail')
    const lines = evidenceLines().filter(l => l.subjectId.startsWith('release-gate/step-'))
    expect(lines).toHaveLength(2)
    expect(lines[0].status).toBe('pass')
    expect(lines[1].status).toBe('fail')
  })

  it('JUnit 复析：顶层 testsuites 聚合属性承载失败（内层无属性）也拦（报告器方言不失守）', () => {
    const topOnly = stub('stub-junit-top', [
      `import { writeFileSync } from 'node:fs'`,
      // 顶层聚合属性形态：failures 只出现在 <testsuites>，内层 testsuite 不带属性
      `writeFileSync(${JSON.stringify(junitFile)}, '<testsuites name="vitest" tests="8000" failures="2" errors="1"><testsuite name="s1"></testsuite><testsuite name="s2"></testsuite></testsuites>')`,
      `process.exit(0)`,
    ].join('\n'))
    writeFileSync(stepsFile, `${JSON.stringify({ steps: [{ id: 'gate-basic-check', label: 'stub', argv: ['node', topOnly], junit: true }] })}\n`)
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('JUnit 复析拦截')
    expect(r.out).toContain('failures=2')
    expect(r.out).toContain('errors=1')
  })

  it('JUnit 复析：顶层与内层同时携带一致计数（双写聚合形态）不误伤', () => {
    const both = stub('stub-junit-both', [
      `import { writeFileSync } from 'node:fs'`,
      `writeFileSync(${JSON.stringify(junitFile)}, '<testsuites tests="10" failures="0" errors="0"><testsuite name="s" tests="10" failures="0" errors="0"></testsuite></testsuites>')`,
      `process.exit(0)`,
    ].join('\n'))
    writeFileSync(stepsFile, `${JSON.stringify({ steps: [{ id: 'gate-basic-check', label: 'stub', argv: ['node', both], junit: true }] })}\n`)
    makeIdentity(fixtures.expected, 0, fixtures.head, 2, 1)
    const r = runGate()
    expect(r.code, r.out).toBe(0)
  })

  // ── bundle 身份复算比对（复审加固：封 touch/跨树重放面）──
  // mtime 新鲜只证明「有人刚写过」，不证明「写的是本树产物」——touch 旧身份或从
  // 别的树拷来一份新鲜身份都能过旧检。终检必须复算：注入 manifest+runtime 清单
  // +当前 HEAD → 期望 bundleId，与身份文件的 bundleId/commit 逐项比对。

  it('身份复算比对：bundleId 与本树期望不符（touch/跨树重放）→ 拦', () => {
    const { expected, head } = fixtures
    makeIdentity('f'.repeat(64), 0, head) // 新鲜 mtime+正确 commit，但 bundleId 是别树产物
    writeSteps([stubStep('step-a', 0)])
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('复算')
    expect(r.out).toContain(expected.slice(0, 12))
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.failedStep).toBe('bundle-identity')
  })

  it('身份复算比对：commit 行非当前 HEAD（跨树重放）→ 拦', () => {
    makeIdentity('f'.repeat(64), 0, 'd'.repeat(40)) // 新鲜但绑定别的 commit
    writeSteps([stubStep('step-a', 0)])
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('commit')
    expect(r.out).toContain('复算')
  })

  it('身份复算比对：bundleId+commit 与本树复算一致 → 通过（receipt 携带期望值）', () => {
    const { expected, head } = fixtures
    makeIdentity(expected, 0, head)
    writeSteps([stubStep('step-a', 0)])
    const r = runGate()
    expect(r.code, r.out).toBe(0)
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.bundleIdentity.bundleId).toBe(expected)
    expect(receipt.bundleIdentity.recomputedMatch).toBe(true)
  })
})
