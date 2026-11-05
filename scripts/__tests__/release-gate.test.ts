// @vitest-environment node
// Task 9 负例（stub 命令注入）：release:gate 编排语义。
// ①任一步 stub 非零→gate 非零且不执行后续步；②stub 测试报告含 1 failed 但 exit 0
// →gate 拦（编排层 JUnit 复析）；③全绿→exit 0、receipt complete、每步九字段证据
// 行携带当前 HEAD 真值（I1 锚定：恰好九键、commit 非 null）。
// 另锚定 {START_TS} 替换（严格报告步的 --since 与 gate 起点一致）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const gateScript = resolve(repoRoot, 'scripts/platform/release/release-gate.mjs')

let tmp: string
let stepsFile: string
let receiptFile: string
let evidenceFile: string
let junitFile: string

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
    },
  })
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

function evidenceLines(): Array<Record<string, unknown>> {
  if (!existsSync(evidenceFile)) return []
  return readFileSync(evidenceFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'release-gate-'))
  stepsFile = join(tmp, 'steps.json')
  receiptFile = join(tmp, 'release-gate.json')
  evidenceFile = join(tmp, 'evidence.jsonl')
  junitFile = join(tmp, 'junit-report.xml')
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
    expect(lines).toHaveLength(2)
    const NINE = ['evidenceId', 'subjectId', 'status', 'producer', 'commit', 'startedAt', 'endedAt', 'sourceDigest', 'artifactRefs']
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual([...NINE].sort())
      expect(line.commit).toBe(head)
      expect(line.producer).toBe('release-gate')
      expect(line.status).toBe('pass')
      expect(line.evidenceId).toMatch(/^release-gate\/\d+\/step-[ab]$/)
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
