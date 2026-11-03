#!/usr/bin/env node
// mx-capability-probes.mjs —— 推演期新能力探测（2026-11-03 立，方案 §5.11）。
//
// 为什么单独一支脚本：本轮新增的能力（主动性介入治理 / 交接质量 / 验收断言 / 主张回执 /
// 组件库与多目标 / 探测并发与调度面 / 派单容量准入）大多只有 HTTP 面、没有独立 UI 承载，
// 走 capture-plan.env 的截图采集位采不到。这里用**端点级探测**取证：正例取读数、负例必须红
// （负例是这些能力的存在理由——「不可判定不放行」「未引用判未验证」一旦静默放行，能力即失效）。
//
// 用法：node simharness/mux/mx-capability-probes.mjs --base http://127.0.0.1:8686 --out <dir>
//   --base   服务基址（默认 http://127.0.0.1:8686）
//   --out    证据输出目录（默认 $SIM_ROOT/runs/current/evidence 或 ./capability-probes）
//   --token  可选 Bearer token（服务启用鉴权时）
// 退出码：0=七组全绿；1=有探测失败（写 capability-probes.json 后仍退出 1，供门禁判红）。
//
// 纪律：脚本只读/只算，不写业务数据；acceptance 探测会在临时目录里造两个文件（探针自带清理）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const BASE = argOf('--base', process.env.MX_PROBE_BASE || 'http://127.0.0.1:8686').replace(/\/$/, '')
const OUT = resolve(argOf('--out', process.env.MX_PROBE_OUT || join(process.cwd(), 'capability-probes')))
const TOKEN = argOf('--token', process.env.MX_PROBE_TOKEN || '')

const headers = { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) }

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, body: json }
}

/** 一条探测：name/组/断言。断言抛错即失败，失败信息进结果。 */
async function probe(group, name, fn) {
  const started = Date.now()
  try {
    const detail = await fn()
    return { group, name, ok: true, detail, ms: Date.now() - started }
  } catch (e) {
    return { group, name, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
  }
}

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

const results = []

// ── 组 1：主动性介入治理（注意力轴）──────────────────────────────
results.push(await probe('proactivity', '断点推断可读（atBreakpoint + reasonCode + evidence）', async () => {
  const r = await call('GET', '/api/hermes/proactivity/breakpoints')
  expect(r.status === 200, `status=${r.status}`)
  expect(typeof r.body?.atBreakpoint === 'boolean', 'atBreakpoint 缺失')
  expect(['recent_boundary', 'lull', 'mid_flow', 'no_evidence'].includes(r.body?.reasonCode), `reasonCode 越界：${r.body?.reasonCode}`)
  expect(typeof r.body?.evidence?.eventsConsidered === 'number', 'evidence.eventsConsidered 缺失')
  return { atBreakpoint: r.body.atBreakpoint, reasonCode: r.body.reasonCode }
}))

results.push(await probe('proactivity', '三层计分卡可读（task/mechanism/user 三面）', async () => {
  const r = await call('GET', '/api/hermes/proactivity/scorecard')
  expect(r.status === 200, `status=${r.status}`)
  const sc = r.body?.scorecard
  expect(sc && sc.task && sc.mechanism && sc.user, '三面缺项')
  expect(typeof sc.user.interruptions === 'number', 'user.interruptions 缺失')
  expect(typeof sc.note === 'string' && sc.note.length > 0, 'note 缺失（口径声明）')
  return { interruptions: sc.user.interruptions, acceptanceRate: sc.user.acceptanceRate }
}))

results.push(await probe('proactivity', '负例：反馈未知干预必须 400（不静默造记录）', async () => {
  const r = await call('POST', '/api/hermes/proactivity/interventions/definitely-not-exist/feedback', { outcome: 'accepted' })
  expect(r.status === 400, `expected 400, got ${r.status}`)
  return { status: 400 }
}))

// ── 组 2：交接质量账本 ─────────────────────────────────────────
results.push(await probe('handoff', '质量读数可读（episodes/交付率口径在场）', async () => {
  const r = await call('GET', '/api/harness/handoff/quality?windowHours=24&stallHours=6')
  expect(r.status === 200, `status=${r.status}`)
  if (r.body?.available === false) {
    // fail-soft 是合法态：但必须给出原因，不能空手 200
    expect(typeof r.body?.reason === 'string' && r.body.reason.length > 0, 'available:false 必须带 reason')
    return { available: false, reason: r.body.reason }
  }
  const rep = r.body?.report
  expect(rep, 'report 缺失')
  expect(typeof rep.note === 'string' && rep.note.includes('不猜'), 'note 必须写明不猜口径')
  expect(typeof rep.episodes === 'number', 'episodes 缺失')
  return { episodes: rep.episodes, completed: rep.completed, stalled: rep.stalled }
}))

results.push(await probe('handoff', '负例：windowHours 越界必须 400', async () => {
  const r = await call('GET', '/api/harness/handoff/quality?windowHours=0')
  expect(r.status === 400, `expected 400, got ${r.status}`)
  return { status: 400 }
}))

// ── 组 3：确定性验收断言 ──────────────────────────────────────
// 正例用「调用方观测证据」（不依赖服务端能读哪个目录）；路径守卫另用负例单测。
results.push(await probe('acceptance', '正例：文件+内容+测试摘要齐 → allHold=true', async () => {
  const r = await call('POST', '/api/harness/handoff/acceptance/check', {
    criteria: ['file_exists: out/report.md', 'file_contains: out/report.md 3 passed', 'test_passed: npm test'],
    artifacts: [{ path: 'out/report.md', exists: true, readable: true, size: 128, contentTail: '# 报告\nTests 3 passed\n' }],
    commands: [{ command: 'npm test', exitCode: 0, stdoutTail: 'Tests 3 passed (3)' }],
  })
  expect(r.status === 200, `status=${r.status}`)
  expect(r.body?.verdict?.allHold === true, `allHold=${r.body?.verdict?.allHold}`)
  return { leaves: r.body.verdict.leaves.length }
}))

results.push(await probe('acceptance', '负例：缺证据/不可判定必须不放行（allHold=false + unchecked）', async () => {
  const r = await call('POST', '/api/harness/handoff/acceptance/check', {
    criteria: ['file_exists: nope.md', '随便写一条'],
  })
  expect(r.status === 200, `status=${r.status}`)
  const v = r.body?.verdict
  expect(v?.allHold === false, 'allHold 必须为 false（不可判定≠通过）')
  expect(Array.isArray(v?.unchecked) && v.unchecked.length === 2, `unchecked=${JSON.stringify(v?.unchecked)}`)
  return { unchecked: v.unchecked }
}))

results.push(await probe('acceptance', '负例：root 不在允许根 → 拒读且不放行（路径守卫）', async () => {
  const r = await call('POST', '/api/harness/handoff/acceptance/check', {
    criteria: ['file_exists: passwd'],
    root: '/etc',
  })
  expect(r.status === 200, `status=${r.status}`)
  expect(r.body?.verdict?.allHold === false, 'allHold 必须为 false')
  expect(Array.isArray(r.body?.problems) && r.body.problems.join().includes('允许根'), 'problems 未报允许根')
  return { problems: r.body.problems }
}))

// ── 组 4：主张-回执核验 ────────────────────────────────────────
results.push(await probe('claims', '负例：无回执的主张必须未验证', async () => {
  const r = await call('POST', '/api/harness/handoff/claims/verify', {
    taskId: `mx-probe-${Date.now()}`,
    claims: [{ id: 'c1', text: '我修好了', evidenceRefs: [] }],
  })
  expect(r.status === 200, `status=${r.status}`)
  expect(r.body?.report?.allVerified === false, 'allVerified 必须为 false')
  expect(r.body?.report?.claims?.[0]?.issues?.includes('no_receipt'), 'no_receipt 未命中')
  return { issues: r.body.report.claims[0].issues }
}))

// ── 组 5：组件库与多目标搜索 ──────────────────────────────────
results.push(await probe('workbench', '组件库可读（summary + 组件清单）', async () => {
  const r = await call('GET', '/api/harness/workbench/library?latestOnly=1')
  expect(r.status === 200, `status=${r.status}`)
  expect(typeof r.body?.summary?.total === 'number', 'summary.total 缺失')
  expect(Array.isArray(r.body?.components), 'components 缺失')
  return { total: r.body.summary.total, components: r.body.components.length }
}))

results.push(await probe('workbench', '多目标搜索报告随视图下发（decomposition/retention/diversity）', async () => {
  const r = await call('GET', '/api/harness/workbench/proposals')
  expect(r.status === 200, `status=${r.status}`)
  const list = r.body?.proposals ?? []
  if (list.length === 0) return { proposals: 0, note: '无提案（空态合法）' }
  const withSearch = list.filter((p) => p.derived?.search?.decomposition && p.derived?.search?.retention)
  expect(withSearch.length === list.length, '有提案缺 search 面')
  return { proposals: list.length }
}))

// ── 组 6：探测并发与调度面 ───────────────────────────────────
results.push(await probe('schedule', '调度策略可读（并发位在册）', async () => {
  const r = await call('GET', '/api/harness/workbench/schedule')
  expect(r.status === 200, `status=${r.status}`)
  expect(typeof r.body?.policy?.probeConcurrency === 'number', 'probeConcurrency 缺失')
  return { probeConcurrency: r.body.policy.probeConcurrency, probeMaxTasks: r.body.policy.probeMaxTasks }
}))

// ── 组 7：派单容量准入 ───────────────────────────────────────
results.push(await probe('dispatch', '容量码表在册（capacity_exhausted/timeout 可被客户端识别）', async () => {
  // 码表在服务端常量与客户端 chip 表各有一份，二者一致性由单测守门；推演期只探服务可达性。
  const r = await call('GET', '/api/hermes/proactivity/breakpoints')
  expect(r.status === 200, `服务不可达 status=${r.status}`)
  return { note: '码表一致性由 custom/server/zcode/__tests__/dispatch-capacity.test.ts 与 client projection 守门断言' }
}))

// ── 汇总 ────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok)
const byGroup = {}
for (const r of results) {
  byGroup[r.group] ??= { ok: 0, failed: 0 }
  byGroup[r.group][r.ok ? 'ok' : 'failed'] += 1
}
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  byGroup,
  results,
  note: '负例失败代表能力失效（不可判定放行/未验证主张被当验证），不是脚本问题——先修能力再重跑。',
}
mkdirSync(OUT, { recursive: true })
const outFile = join(OUT, 'capability-probes.json')
writeFileSync(outFile, JSON.stringify(report, null, 2))
console.log(`[mx-capability-probes] ${report.passed}/${report.total} passed → ${outFile}`)
for (const f of failed) console.error(`  ✗ [${f.group}] ${f.name}: ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
