// 原始测试报告内核解析（v0.3 §3.1，上游 ADR-0007 本地方言）：TAP 与 JUnit XML 的
// 无第三方依赖解析器。口径逐函数对照上游 lazyzhsh/quality-gate v1.24.0
// plugins/quality-gate/lib/raw-evidence.mjs:30-134（TAP 30-90，JUnit 100-134）。
// 目的：测试计数不再信任退出码一面之词——command executor 声明 rawOutput 后，内核
// 独立重解析、重算 total/passed/failed/skipped，与退出码交叉核验。
// 纪律：fail-closed。空文本、格式不识别、plan/属性与点数矛盾、摘要与逐点计数不一致，
// 一律抛错，由调用方转为 error 证据（INCONCLUSIVE，永不转 PASS）。

export interface RawTestCounts {
  total: number
  passed: number
  failed: number
  skipped: number
  parser: 'tap' | 'junit'
  cases: Array<{ name: string; status: 'passed' | 'failed' | 'skipped' }>
}

export const RAW_OUTPUT_FORMATS = ['tap', 'junit'] as const
export type RawOutputFormat = (typeof RAW_OUTPUT_FORMATS)[number]

// ── TAP（面向 node --test --test-reporter=tap 与 vitest tap reporter 的真实输出） ──
// - 测试点 `ok|not ok [N] - description`，任一缩进层级均为点；# SKIP / # TODO 计 skipped；
// - 容器点（suite）后随 YAML 块标注 type: 'suite' 者不计入测试数；
// - plan `1..N` 按缩进层级与点数互核；顶层摘要注释（# tests/pass/fail/skipped/todo）
//   存在时与逐点计数互核，不一致即拒收；Bail out! 或零测试点即拒收。

function directiveOf(description: string): { name: string; directive: string | null } {
  const match = /^(.*?)\s#\s*(SKIP|TODO)\b/i.exec(description)
  if (!match) return { name: description.trim(), directive: null }
  return { name: (match[1] || '').trim(), directive: match[2].toUpperCase() }
}

export function parseTAP(text: string): RawTestCounts {
  if (typeof text !== 'string' || text.trim().length === 0) throw new Error('rawOutput TAP text is empty')
  const lines = text.split(/\r?\n/)
  const pointRe = /^(\s*)(not )?ok\b(?:\s+\d+)?(?:\s+-)?\s*(.*)$/
  const yamlTypeRe = /type:\s*['"]suite['"]/
  let bailed = false
  const points: Array<{ indent: number; status: 'passed' | 'failed' | 'skipped'; isSuite: boolean; name: string }> = []
  const plans = new Map<number, number>()
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^Bail out!/i.test(line.trim())) { bailed = true; continue }
    if (/^TAP version/.test(line.trim())) continue
    const planMatch = /^(\s*)1\.\.(\d+)\s*$/.exec(line)
    if (planMatch) { plans.set(planMatch[1].length, Number(planMatch[2])); continue }
    const match = pointRe.exec(line)
    if (!match) continue
    const indent = match[1].length
    const description = match[3] ?? ''
    const { name, directive } = directiveOf(description)
    let isSuite = false
    let cursor = index + 1
    if (cursor < lines.length && /^\s+---\s*$/.test(lines[cursor])) {
      while (cursor < lines.length && !/^\s+\.\.\.\s*$/.test(lines[cursor])) {
        if (yamlTypeRe.test(lines[cursor])) isSuite = true
        cursor++
      }
      index = cursor
    }
    const status: 'passed' | 'failed' | 'skipped' = directive ? 'skipped' : match[2] ? 'failed' : 'passed'
    points.push({ indent, status, isSuite, name })
  }
  if (bailed) throw new Error('rawOutput TAP declares Bail out!')
  const tests = points.filter((p) => !p.isSuite)
  if (tests.length === 0) throw new Error('rawOutput TAP has no test points')
  for (const [indent, planned] of plans) {
    const atLevel = points.filter((p) => p.indent === indent).length
    if (atLevel !== planned) {
      throw new Error(`rawOutput TAP plan 1..${planned} at indent ${indent} does not match ${atLevel} test points`)
    }
  }
  const counts = { total: tests.length, passed: 0, failed: 0, skipped: 0 }
  for (const p of tests) counts[p.status]++
  const summary = (key: string): number | null => {
    const m = new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)
    return m === null ? null : Number(m[1])
  }
  const declaredSkipped = summary('skipped')
  const declaredTodo = summary('todo')
  for (const [key, actual] of [['tests', counts.total], ['pass', counts.passed], ['fail', counts.failed]] as const) {
    const declared = summary(key)
    if (declared !== null && declared !== actual) {
      throw new Error(`rawOutput TAP summary "# ${key} ${declared}" disagrees with parsed ${actual}`)
    }
  }
  if (declaredSkipped !== null && declaredSkipped !== counts.skipped) {
    throw new Error(`rawOutput TAP summary "# skipped ${declaredSkipped}" disagrees with parsed ${counts.skipped}`)
  }
  if (declaredTodo !== null && declaredSkipped === null && declaredTodo !== counts.skipped) {
    throw new Error(`rawOutput TAP summary "# todo ${declaredTodo}" disagrees with parsed skipped ${counts.skipped}`)
  }
  return { ...counts, parser: 'tap', cases: tests.map((p) => ({ name: p.name || '(test point)', status: p.status })) }
}

// ── JUnit XML（面向 pytest --junitxml / surefire / gradle / vitest junit reporter） ──
// - <testsuite> 属性 tests/failures/errors/skipped 求和后与逐 testcase 计数互核；
// - testcase 状态由子元素判定：<failure> 或 <error> → failed，<skipped> → skipped；
// - 边界（如实声明，与上游一致）：非流式正则解析，不做完整 XML 校验——CDATA/system-out
//   内含字面 "</testcase>" 或伪造标签会大概率被属性互核拦下（fail-closed）。

function attributesOf(tag: string): Record<string, string> {
  const map: Record<string, string> = {}
  const re = /([A-Za-z_][-\w.]*)\s*=\s*"([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(tag))) map[match[1]] = match[2]
  return map
}

export function parseJUnit(text: string): RawTestCounts {
  if (typeof text !== 'string' || text.trim().length === 0) throw new Error('rawOutput JUnit XML is empty')
  const suiteTags = text.match(/<testsuite\b[^>]*>/g) ?? []
  if (suiteTags.length === 0) throw new Error('rawOutput JUnit XML has no <testsuite>')
  const declared = { tests: 0, failures: 0, errors: 0, skipped: 0 }
  for (const tag of suiteTags) {
    const attrs = attributesOf(tag)
    const tests = Number(attrs.tests)
    if (!Number.isInteger(tests) || tests < 0) {
      throw new Error('rawOutput JUnit XML <testsuite> lacks a valid tests attribute')
    }
    declared.tests += tests
    declared.failures += Number(attrs.failures ?? 0)
    declared.errors += Number(attrs.errors ?? 0)
    declared.skipped += Number(attrs.skipped ?? 0)
  }
  const caseBlocks = text.match(/<testcase\b[^>]*\/>|<testcase\b[^>]*>[\s\S]*?<\/testcase>/g) ?? []
  const cases: Array<{ name: string; status: 'passed' | 'failed' | 'skipped' }> = []
  for (const block of caseBlocks) {
    const openTag = /<testcase\b[^>]*>/.exec(block)![0]
    const attrs = attributesOf(openTag)
    const rawName = attrs.name ?? '(testcase)'
    const name = attrs.classname ? `${attrs.classname}.${rawName}` : rawName
    let status: 'passed' | 'failed' | 'skipped' = 'passed'
    if (/<failure\b/.test(block) || /<error\b/.test(block)) status = 'failed'
    else if (/<skipped\b/.test(block)) status = 'skipped'
    cases.push({ name, status })
  }
  if (cases.length === 0) throw new Error('rawOutput JUnit XML has no <testcase>')
  const counts = { total: cases.length, passed: 0, failed: 0, skipped: 0 }
  for (const c of cases) counts[c.status]++
  const declaredFailed = declared.failures + declared.errors
  if (declared.tests !== counts.total) {
    throw new Error(`rawOutput JUnit XML declares tests=${declared.tests} but has ${counts.total} testcases`)
  }
  if (declaredFailed !== counts.failed) {
    throw new Error(`rawOutput JUnit XML declares failures+errors=${declaredFailed} but ${counts.failed} testcases failed`)
  }
  if (declared.skipped !== counts.skipped) {
    throw new Error(`rawOutput JUnit XML declares skipped=${declared.skipped} but ${counts.skipped} testcases skipped`)
  }
  return { ...counts, parser: 'junit', cases }
}

export function parseRawOutput(format: RawOutputFormat, text: string): RawTestCounts {
  if (format === 'tap') return parseTAP(text)
  if (format === 'junit') return parseJUnit(text)
  throw new Error(`Unknown rawOutput format: ${String(format)}`)
}
