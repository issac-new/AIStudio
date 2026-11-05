#!/usr/bin/env node
// mx-capability-probes.mjs —— 推演期新能力探测（2026-11-03 立，方案 §5.11；2026-11-04 扩组至十三组；同日 W4 未做项收口扩至十四组——harness 契约面）。
//
// 为什么单独一支脚本：新能力（主动性介入治理 / 交接质量 / 验收断言 / 主张回执 / 组件库与多目标 /
// 探测并发与调度面 / 派单容量准入＋四性四格判据 / 项目状态机与拓扑 / 执行记录 / 环境变量编辑面 /
// 权限变更审计 / 技能导出三道限）大多只有 HTTP 面、没有独立 UI 承载，走 capture-plan.env 的
// 截图采集位采不到。这里用**端点级探测**取证：正例取读数、负例必须红（负例是这些能力的
// 存在理由——「不可判定不放行」「未引用判未验证」一旦静默放行，能力即失效）。
//
// 用法：node simharness/mux/mx-capability-probes.mjs --base http://127.0.0.1:8802 --out <dir>
//   --base    服务基址（默认 http://127.0.0.1:8686）
//   --out     证据输出目录（默认 $SIM_ROOT/runs/current/evidence 或 ./capability-probes）
//   --token   可选 Bearer token（服务启用鉴权时）
//   --profile userenv 组探测的 profile 名（缺省 default；SIM 与测试夹具均有该档）
// 退出码：0=十四组全绿；1=有探测失败（写 capability-probes.json 后仍退出 1，供门禁判红）。
//
// 纪律：脚本只读/只算，不写业务数据；acceptance 探测会在临时目录里造两个文件（探针自带清理）。
// 状态机类端点（projectworkflow complete/pause）只打「不落库的拒绝分支」——成功路径会写
// projects-state.json 且 completed 是终态无 reopen，探测造项目=留永久脏态（spec 2026-11-04 D3）。
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
const PROFILE = argOf('--profile', process.env.MX_PROBE_PROFILE || 'default')

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

/** 纯文本响应（mermaid graph 源）：res.json() 解不出，取 text。 */
async function callText(path) {
  const res = await fetch(`${BASE}${path}`, { headers })
  return { status: res.status, text: await res.text() }
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

// ── 组 8：四性四格判据（姿态准入 / AC 追溯 / 阶段交接键 / 模型指纹）──────
results.push(await probe('fourgap', '姿态准入可读（admits+mode+digest）', async () => {
  const r = await call('GET', '/api/governance/posture-admission')
  expect(r.status === 200, `status=${r.status}`)
  const a = r.body?.admission
  expect(a && typeof a.admits === 'boolean', 'admits 缺失')
  expect(['report', 'require-for-gate', 'strict'].includes(a.mode), `mode 越界：${a.mode}`)
  expect(typeof a.digest === 'string' && a.digest.length > 0, 'digest 缺失')
  return { admits: a.admits, mode: a.mode, blockers: (a.blockers ?? []).length }
}))

results.push(await probe('fourgap', 'AC 追溯：doc+绑定+结果齐 → judgement.ok=true', async () => {
  // 注意：用例标识=测试标题全文（CASE_TITLE_RE 捕获引号内整串，含 @ac 尾巴）
  const r = await call('POST', '/api/governance/lifecycle/ac-trace', {
    doc: '- **AC-1**: 接口返回 200 [auto]\n- **AC-2**: 操作留截图证据 [evidence]',
    sources: [{ file: 'probe.test.ts', content: "it('探测用例一 @ac AC-1', () => {})\nit('探测用例二 @ac AC-1, AC-2', () => {})\n" }],
    results: { '探测用例一 @ac AC-1': 'pass', '探测用例二 @ac AC-1, AC-2': 'pass' },
  })
  expect(r.status === 200, `status=${r.status}`)
  expect(r.body?.acTotal === 2, `acTotal=${r.body?.acTotal}`)
  expect(r.body?.judgement?.ok === true, `judgement=${JSON.stringify(r.body?.judgement)}`)
  return { acTotal: r.body.acTotal, unbound: r.body.judgement.unbound }
}))

results.push(await probe('fourgap', '负例：AC 无绑定 → unbound 点名；无 AC 条目 → 400', async () => {
  const r1 = await call('POST', '/api/governance/lifecycle/ac-trace', {
    doc: '- **AC-1**: 没有任何用例绑我 [auto]',
  })
  expect(r1.status === 200, `status=${r1.status}`)
  expect(r1.body?.judgement?.ok === false, '未绑定必须判不过')
  expect(Array.isArray(r1.body?.judgement?.unbound) && r1.body.judgement.unbound.includes('AC-1'), 'unbound 未点名 AC-1')
  const r2 = await call('POST', '/api/governance/lifecycle/ac-trace', { doc: '本文没有任何验收条目' })
  expect(r2.status === 400, `expected 400, got ${r2.status}`)
  return { unbound: r1.body.judgement.unbound }
}))

results.push(await probe('fourgap', '阶段交接键：结构齐 → chainOk=true（未给 root 须 ioChecked=false）', async () => {
  const key = {
    stage: 'req-frozen', gate: 'G1', verdict: 'pass', actor: 'probe', ts: Date.now(),
    artifacts: [{ path: 'docs/spec.md' }], commitAnchors: [], evidence: ['evidence/spec-freeze.log'], notDone: ['无'],
  }
  const r = await call('POST', '/api/governance/lifecycle/stage-keys/verify', { keys: [key], required: ['req-frozen'] })
  expect(r.status === 200, `status=${r.status}`)
  expect(r.body?.chainOk === true, `chainOk=${r.body?.chainOk}`)
  expect(r.body?.ioChecked === false, '未给 root 必须 ioChecked=false（弱保证不冒充强保证）')
  return { missing: r.body.missing }
}))

results.push(await probe('fourgap', '负例：坏键 → chainOk=false 点名问题；required 缺阶段 → missing 非空', async () => {
  const badKey = { stage: 'req-frozen', gate: 'G1', verdict: 'pass' } // 缺 actor/ts/artifacts/evidence/notDone
  const r1 = await call('POST', '/api/governance/lifecycle/stage-keys/verify', { keys: [badKey], required: ['req-frozen'] })
  expect(r1.status === 200, `status=${r1.status}`)
  expect(r1.body?.chainOk === false, '坏键必须拒入')
  expect(Array.isArray(r1.body?.problems) && r1.body.problems.length > 0, 'problems 未点名')
  const r2 = await call('POST', '/api/governance/lifecycle/stage-keys/verify', {
    keys: [{ stage: 'req-frozen', gate: 'G1', verdict: 'pass', actor: 'probe', ts: Date.now(), artifacts: [{ path: 'a.md' }], commitAnchors: [], evidence: ['e.log'], notDone: ['无'] }],
    required: ['design-approved'],
  })
  expect(r2.body?.chainOk === false && Array.isArray(r2.body?.missing) && r2.body.missing.includes('design-approved'), 'missing 未点名缺阶段')
  return { problems: r1.body.problems.length, missing: r2.body.missing }
}))

results.push(await probe('fourgap', '模型指纹：可读或 fail-soft（available:false 须带 note）', async () => {
  const r = await call('GET', '/api/harness/trust/model-fingerprint')
  expect(r.status === 200, `status=${r.status}`)
  if (r.body?.available === false) {
    expect(typeof r.body?.note === 'string' && r.body.note.length > 0, 'available:false 必须带 note')
    return { available: false, note: r.body.note }
  }
  expect(typeof r.body?.fingerprint === 'string' && /^[0-9a-f]{40}$/.test(r.body.fingerprint), `fingerprint 形态非法：${r.body?.fingerprint}`)
  expect(typeof r.body?.source === 'string', 'source 缺失')
  return { available: true, source: r.body.source }
}))

results.push(await probe('fourgap', '负例：model-fingerprint 非法 profile → 拒绝（不 ok）', async () => {
  const r = await call('GET', `/api/harness/trust/model-fingerprint?profile=${encodeURIComponent('../../etc')}`)
  expect(r.status >= 400, `expected >=400, got ${r.status}`)
  expect(r.body?.ok !== true, '非法 profile 不得回 ok:true')
  return { status: r.status }
}))

// ── 组 9：项目一级状态机与拓扑 ────────────────────────────────
// 只读正例＋条件负例：SIM 板任务不带 project_id 时 projects 空表合法（如实记）；
// 负例只在「存在未终结任务的项目」时执行（422/400 两分支均不落库），否则记 skip 理由。
let _pwFirst = null
results.push(await probe('projectworkflow', '项目清单可读（id/status/taskStats 形状；空表合法）', async () => {
  const r = await call('GET', '/api/projectworkflow/projects')
  expect(r.status === 200, `status=${r.status}`)
  const projects = r.body?.projects
  expect(Array.isArray(projects), 'projects 缺失')
  for (const p of projects) {
    expect(typeof p.id === 'string' && ['active', 'paused', 'completed'].includes(p.status), `项目状态非法：${JSON.stringify(p)}`)
    expect(typeof p.taskStats?.total === 'number', 'taskStats.total 缺失')
  }
  if (projects.length > 0) _pwFirst = projects[0].id
  return { projects: projects.length, note: projects.length === 0 ? 'SIM 板任务未带 project_id，空表合法（方案 §5.11 组 9）' : '' }
}))

results.push(await probe('projectworkflow', '任务拓扑投影：四数组齐＋mermaid 文本', async () => {
  if (!_pwFirst) return { skipped: '无项目可看图（空态，正例由守门测试夹具验证）' }
  const r = await call('GET', `/api/projectworkflow/projects/${encodeURIComponent(_pwFirst)}/graph`)
  expect(r.status === 200, `status=${r.status}`)
  const g = r.body?.graph
  for (const k of ['nodes', 'edges', 'next', 'interrupts']) expect(Array.isArray(g?.[k]), `${k} 缺失`)
  const m = await callText(`/api/projectworkflow/projects/${encodeURIComponent(_pwFirst)}/graph?format=mermaid`)
  expect(m.status === 200 && m.text.includes('graph TD'), 'mermaid 文本形态非法')
  return { nodes: g.nodes.length, edges: g.edges.length, next: g.next.length }
}))

results.push(await probe('projectworkflow', '负例：未清账 complete→422 点名；override 无 reason→400（条件执行）', async () => {
  const r = await call('GET', '/api/projectworkflow/projects')
  const target = (r.body?.projects ?? []).find((p) => (p.taskStats?.total ?? 0) - (p.taskStats?.byStatus?.done ?? 0) - (p.taskStats?.byStatus?.archived ?? 0) > 0)
  if (!target) return { skipped: '本轮无未终结项目，负例无触发条件（全量正负行为由守门测试夹具验证）' }
  // 新鲜取单项目缩小竞态窗：两分支都在「有未终结任务」前提下走拒绝路径，不落库；
  // 若毫秒窗内任务恰好清空则放弃负例（skip 不是 fail——服务无错）
  const d = await call('GET', `/api/projectworkflow/projects/${encodeURIComponent(target.id)}`)
  if (!Array.isArray(d.body?.unfinishedTasks) || d.body.unfinishedTasks.length === 0) {
    return { skipped: '新鲜取数未见未终结任务（竞态窗内清空），放弃负例避免误触发完成写入' }
  }
  const r1 = await call('POST', `/api/projectworkflow/projects/${encodeURIComponent(target.id)}/complete`)
  expect(r1.status === 422, `expected 422, got ${r1.status}`)
  expect(Array.isArray(r1.body?.problems) && r1.body.problems.length > 0, '422 未逐卡点名')
  const r2 = await call('POST', `/api/projectworkflow/projects/${encodeURIComponent(target.id)}/complete?override=true`)
  expect(r2.status === 400, `expected 400, got ${r2.status}`)
  return { project: target.id, problems: r1.body.problems.length }
}))

// ── 组 10：编码执行记录 ──────────────────────────────────────
results.push(await probe('execution-records', '执行记录列表可读（records/total/hasMore；空表合法）', async () => {
  const r = await call('GET', '/api/execution-records?limit=5')
  expect(r.status === 200, `status=${r.status}`)
  expect(Array.isArray(r.body?.records), 'records 缺失')
  expect(typeof r.body?.total === 'number' && typeof r.body?.hasMore === 'boolean', 'total/hasMore 缺失')
  return { total: r.body.total, records: r.body.records.length }
}))

results.push(await probe('execution-records', '负例：未知 kind → 400 invalid_kind', async () => {
  const r = await call('GET', '/api/execution-records?kind=bogus')
  expect(r.status === 400, `expected 400, got ${r.status}`)
  expect(r.body?.code === 'invalid_kind', 'code 非 invalid_kind')
  return { status: 400 }
}))

// ── 组 11：环境变量编辑面（N01）──────────────────────────────
results.push(await probe('userenv', 'profile env 可读（entries 形状；.env 未建=空表不 404）', async () => {
  const r = await call('GET', `/api/userenv/profiles/${encodeURIComponent(PROFILE)}/env`)
  expect(r.status === 200, `status=${r.status}（profile=${PROFILE} 不在档？）`)
  expect(Array.isArray(r.body?.entries), 'entries 缺失')
  for (const e of r.body.entries) {
    expect(typeof e.key === 'string' && typeof e.valueMasked === 'string', `条目形状非法：${JSON.stringify(e)}`)
  }
  expect(typeof r.body?.missing === 'boolean', 'missing 缺失')
  return { profile: PROFILE, entries: r.body.entries.length, missing: r.body.missing }
}))

results.push(await probe('userenv', '负例：路径逃逸 profile → 400（先于 404 判）；敏感键无确认位 → 409 点名', async () => {
  const r1 = await call('GET', `/api/userenv/profiles/${encodeURIComponent('../escape')}/env`)
  expect(r1.status === 400, `expected 400, got ${r1.status}（逃逸不得落成 404/200）`)
  expect(r1.body?.code === 'invalid_profile_name', 'code 非 invalid_profile_name')
  const r2 = await call('PUT', `/api/userenv/profiles/${encodeURIComponent(PROFILE)}/env`, {
    entries: [{ key: 'PROBE_SECRET_TOKEN', value: 'probe-should-not-write' }],
  })
  expect(r2.status === 409, `expected 409, got ${r2.status}`)
  expect(r2.body?.code === 'sensitive_unconfirmed', 'code 非 sensitive_unconfirmed')
  expect(Array.isArray(r2.body?.problems) && r2.body.problems.includes('PROBE_SECRET_TOKEN'), 'problems 未点名键名')
  return { escape: 400, sensitive: 409 }
}))

// ── 组 12：权限变更审计（N02）────────────────────────────────
results.push(await probe('userperms', '审计流可查（entries/total/hasMore；空流合法）', async () => {
  const r = await call('GET', '/api/userperms/audit?limit=5')
  expect(r.status === 200, `status=${r.status}`)
  expect(Array.isArray(r.body?.entries), 'entries 缺失')
  expect(typeof r.body?.total === 'number' && typeof r.body?.hasMore === 'boolean', 'total/hasMore 缺失')
  return { total: r.body.total }
}))

results.push(await probe('userperms', '负例：白名单外 action → 400 invalid_action', async () => {
  const r = await call('GET', '/api/userperms/audit?action=bogus')
  expect(r.status === 400, `expected 400, got ${r.status}`)
  expect(r.body?.code === 'invalid_action', 'code 非 invalid_action')
  return { status: 400 }
}))

// ── 组 13：技能导出三道限（736/737）──────────────────────────
// 413 超限／403 外部源分支由 custom/__tests__/skills-export-contract.test.ts 契约断言把守
// （造 >200MB 目录不可行；组 7 码表先例）——此处探路由可达性与 404 拒绝。
results.push(await probe('skills', '技能清单可读（categories 数组）', async () => {
  const r = await call('GET', '/api/hermes/skills?target=hermes')
  expect(r.status === 200, `status=${r.status}`)
  expect(Array.isArray(r.body?.categories), 'categories 缺失')
  return { categories: r.body.categories.length }
}))

results.push(await probe('skills', '负例：导出不存在的技能 → 404（不得 200/500）', async () => {
  const r = await call('GET', `/api/hermes/skills/general/mx-probe-not-a-skill-${Date.now()}/export`)
  expect(r.status === 404, `expected 404, got ${r.status}`)
  return { status: 404 }
}))

// ── 组 14：Harness 契约面（W1-W4，spec 2026-11-04-harness-w*）──────────────
// 工具契约执法/结果协议/执行归并/任务模型四件只有 HTTP 面。纪律：全部只读——
// fault-seed 建集是写操作不探（由 fault-seed.test.ts 与活体走查把守）；taskmodel
// 正例在空板上如实缺省（组 9 先例），不造假卡。
results.push(await probe('harness-contract', '执行归并单点四源 fail-soft（缺席必须带原因）', async () => {
  const r = await call('GET', '/api/harness/execution-join?runId=mx-probe-no-such-run')
  expect(r.status === 200, `status=${r.status}`)
  expect(r.body?.ok === true, 'ok!=true')
  for (const src of ['executionRecords', 'toolAudit', 'enforceApprovals', 'resultContract']) {
    const face = r.body?.[src]
    expect(face && typeof face === 'object', `${src} 面缺失`)
    if (face.available === false) {
      expect(typeof face.reason === 'string' && face.reason.length > 0, `${src}.available:false 必须带 reason（不猜数）`)
    }
  }
  return { sources: 4, allSoft: true }
}))

results.push(await probe('harness-contract', '负例：execution-join 无 runId/taskId → 400（参数门）', async () => {
  const r = await call('GET', '/api/harness/execution-join')
  expect(r.status === 400, `expected 400, got ${r.status}`)
  return { status: 400 }
}))

results.push(await probe('harness-contract', '负例：taskmodel 不存在的任务 → 404（fail-closed 不猜）', async () => {
  const r = await call('GET', '/api/harness/taskmodel/mx-probe-no-such-task?board=default')
  expect(r.status === 404, `expected 404, got ${r.status}`)
  return { status: 404 }
}))

results.push(await probe('harness-contract', '负例：taskmodel 缺 board → 400（快道按板库直读，板必填）', async () => {
  const r = await call('GET', '/api/harness/taskmodel/whatever')
  expect(r.status === 400, `expected 400, got ${r.status}`)
  return { status: 400 }
}))

results.push(await probe('harness-contract', '工具契约表在册且版本=W1 执法轮版本', async () => {
  const r = await call('GET', '/api/harness/tool-contracts')
  expect(r.status === 200, `status=${r.status}`)
  const list = r.body?.contracts ?? r.body?.entries
  expect(Array.isArray(list) && list.length >= 40, `契约数异常：${Array.isArray(list) ? list.length : '非数组'}`)
  expect(r.body?.version === '2026-11-04.1', `版本未推进到 W1 执法轮：${r.body?.version}`)
  return { contracts: list.length, version: r.body.version }
}))

results.push(await probe('harness-contract', 'taskmodel 正例（有卡则投影 schemaVersion=1；空板如实缺省）', async () => {
  const list = await call('GET', '/api/hermes/kanban?board=default&limit=1')
  const tasks = list.body?.tasks ?? list.body
  const first = Array.isArray(tasks) ? tasks[0] : null
  if (!first?.id) {
    return { skipped: 'default 板无卡——正例由 taskmodel 单测＋活体走查把守（组 9 缺省先例）' }
  }
  const r = await call('GET', `/api/harness/taskmodel/${first.id}?board=default`)
  expect(r.status === 200, `status=${r.status}`)
  const m = r.body?.model
  expect(m?.schemaVersion === 1, `schemaVersion!=1：${m?.schemaVersion}`)
  expect(m && typeof m.available === 'object' && 'inputVersions' in m.available, 'available 细项缺失（fail-soft 透明度面）')
  return { taskId: m.taskId, available: m.available }
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
// 探测分型（run27 实锤根治）：失败明细全为 fetch failed＝基座不可达（网关/studio
// 停摆），非能力失效——exit 2 环境态，调用方不冻结能力判定、等基座恢复重试。
// 本地文件探针（不经 HTTP）在停摆期仍绿属预期，不参与判定；混合失败（语义红与
// fetch failed 同存）仍 exit 1（能力失效 fail-closed 优先）。
const unreachable =
  failed.length > 0 &&
  failed.every((f) => /fetch failed/i.test(String(f.detail ?? '')))
if (unreachable) report.note = '全量 fetch failed＝基座不可达（非能力失效）——exit 2 环境态；基座恢复后重跑。'
mkdirSync(OUT, { recursive: true })
const outFile = join(OUT, 'capability-probes.json')
writeFileSync(outFile, JSON.stringify(report, null, 2))
console.log(`[mx-capability-probes] ${report.passed}/${report.total} passed → ${outFile}`)
for (const f of failed) console.error(`  ✗ [${f.group}] ${f.name}: ${f.detail}`)
if (unreachable) console.error('[mx-capability-probes] 全量 fetch failed＝基座不可达（环境态 exit 2，不判能力失效）')
process.exit(failed.length === 0 ? 0 : unreachable ? 2 : 1)
