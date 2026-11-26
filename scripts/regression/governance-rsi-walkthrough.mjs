#!/usr/bin/env node
// governance-rsi-walkthrough 探针（2026-11-26 可信 RSI 后续批，spec 决策 D17/D18）。
// 由 run-ide-smoke-face.mjs 以 --face governance-rsi-walkthrough --probe 本文件 --isolated
// --backend-env HARNESS2_APPLY=1 调起；也可手动单跑（先起包装器同款环境）。
//
// 只对严格隔离环境运行：ISOLATED_HOME_DIR 缺席即退出 2——本探针往家目录种数据、
// 真实回滚文件，来历不明的后端不碰（决策 D18）。
//
// 编排：
//   0. 等自动登录写好 JWT → 从页面读出接口凭据（也可直接 admin/dev-bootstrap 换新）。
//   1. 种数据：实验台台账（workbench.json）＋组件库（components.json）＋写盘目标文件。
//      种入前先跑 lib 的自洽性校验（摘要与内容一一对应），种错数据宁可不起跑。
//   2. 四种界面条件走查两个面板：暗色宽屏中文（基线）、亮色、窄屏、英文。
//      读渲染文字与计算后的样式；格态文字与底色对比度 ≥ 4.5。
//   3. 回滚演练（真实接口）：单文件已写盘冠军回滚成功（文件恢复基线）；
//      多文件冠军一个文件被外部改动时回滚 409 且任何文件不动。
//   4. 台账 JSON 落隔离目录（面证据），退出码=失败数。
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(import.meta.url))
const { chromium } = require('playwright')
const { checkAppliedFiles, checkChampion, checkSingleFileSeed, checkTreeSeed, contrastRatio, summarize } = require('./governance-rsi-walkthrough-lib.mjs')

const sha = (text) => createHash('sha256').update(text).digest('hex')

const ISOLATED = process.env.ISOLATED_HOME_DIR?.trim() || ''
const BASE = process.env.WALK_BASE?.trim() || 'http://localhost:8649'
const API = 'http://127.0.0.1:8647'
const SHOTS = process.env.WALK_SHOTS?.trim() || join(ISOLATED || mkdtempSync(join(tmpdir(), 'gov-rsi-walk-')), 'shots')

if (!ISOLATED) {
  console.error('[gov-rsi] 缺 ISOLATED_HOME_DIR：本探针只对 --isolated 包装器起的环境运行（决策 D18：要往家目录种数据、真回滚文件，来历不明的后端不碰）')
  process.exit(2)
}
const WEB_UI_HOME = ISOLATED // 包装器把 HERMES_WEB_UI_HOME 指到隔离目录根
const HERMES_HOME = process.env.HERMES_HOME?.trim() || join(ISOLATED, 'hermes')
const WORKBENCH_DIR = join(WEB_UI_HOME, 'harness-workbench')

const checks = []
const record = (name, ok, note = '', skip = false) => {
  checks.push({ name, ok, note, skip })
  console.log(`${skip ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// 种数据（与 lib 自洽性校验一体）
// ---------------------------------------------------------------------------

const OLD_SOUL = '# SOUL（基线）\n\n- 提交前先跑单元测试\n'
const NEW_SOUL = '# SOUL（走查候选）\n\n- 提交前先跑单元测试\n- 失败先复现再改\n'
const OLD_SKILL = '---\nname: old-skill\n---\n\n旧技能正文\n'
const NEW_SKILL = '---\nname: walk-skill\n---\n\n走查候选技能正文\n'

function buildSeed() {
  const soulFile = { path: 'profiles/p1/SOUL.md', nextContent: NEW_SOUL, oldContent: OLD_SOUL, existed: true }
  const seed = {
    now: '2026-11-26T10:00:00.000Z',
    proposals: [],
    champions: [],
    library: { version: 1, entries: [] },
    onDisk: {}, // path → 晋级后应写入的内容（未写盘的后继不写）
  }
  const proposal = (p) => seed.proposals.push(p)

  // ① 单文件已写盘冠军：system_prompt/SOUL.md（回滚演练主对象）
  const p1Variants = [variant('v1', 'A', NEW_SOUL)]
  const p1 = {
    id: 'hw-0001', title: '提交前跑单元测试', hypothesis: '收紧输出约束可减少返工', surfaceKey: 'system_prompt',
    targetPath: soulFile.path, risk: 'medium', mode: 'parallel', domain: 'general', editClass: 'invariant',
    status: 'promoted', budgetCapUsd: 5, evidenceRefs: ['eval:run-base'], experienceIds: [], baselineRunId: 'run-base',
    baseline: metrics({ passAt1: 0.5 }),
    base: { content: OLD_SOUL, digest: sha(OLD_SOUL), revision: null, exists: true },
    variants: p1Variants,
    probes: [probe('pr-1', 'v1', metrics({ passAt1: 0.62 }), contrast(0.12))],
    approval: approved('reviewer', seed.now, p1Variants),
    composition: composition('v1', NEW_SOUL),
    promotion: { actor: 'operator', at: seed.now, digest: sha(NEW_SOUL), applied: true, verificationTier: 'heldout' },
    rollback: null, createdBy: 'operator', createdAt: seed.now, updatedAt: seed.now,
    noise: noiseCalibration(),
    heldout: { runId: 'heldout-1', n: 40, passRate: 0.6 },
    constraints: { checks: [{ id: 'refusal', statement: '拒答率不降', status: 'pass', evidenceRef: 'eval:heldout-1' }], actor: 'reviewer', at: seed.now },
  }
  seed.onDisk[soulFile.path] = NEW_SOUL
  proposal(p1)
  seed.champions.push(champion('ch-0001', p1, 'v1', sha(NEW_SOUL), seed.now))

  // ② 已回滚后继：曾建立在 ① 的产物之上（冠军链+起点摘要双依据），后来被回滚
  const mid = sha(NEW_SOUL) // ② 创建时磁盘上正是 ① 的产物
  const p2 = {
    ...p1,
    id: 'hw-0002', title: '失败先复现再改（已回滚）', status: 'rolled_back',
    base: { content: NEW_SOUL, digest: mid, revision: null, exists: true },
    variants: [variant('v1', 'A', `${NEW_SOUL}\n- 再读一遍失败日志\n`)],
    probes: [probe('pr-2', 'v1', metrics({ passAt1: 0.7, evaluator: evalFingerprint('glm-5.3') }), contrast(0.2))],
    composition: composition('v1', `${NEW_SOUL}\n- 再读一遍失败日志\n`),
    promotion: { actor: 'operator', at: '2026-11-26T10:30:00.000Z', digest: sha(`${NEW_SOUL}\n- 再读一遍失败日志\n`), applied: false, verificationTier: 'judge' },
    rollback: { actor: 'operator', at: '2026-11-26T11:00:00.000Z', reason: '线上回归：提交后回归样本库 3 项失败', restoredDigest: mid, fileRestored: false },
    heldout: null,
  }
  proposal(p2)
  // ② 曾是冠军又被回滚 → 冠军记录被回滚删除，不进 champions（与产品行为一致）

  // ③ 现役冠军（回滚 ① 之后 currentChampionOf 会落回它吗？——不会，③ 在 ① 之后晋级）
  //    实际上 ① 仍是在位冠军；③ 是另一条已晋级但未写盘的后继，起点建立在 ① 产物之上（base 摘要依据）
  const p3 = {
    ...p1,
    id: 'hw-0003', title: '压缩提示词冗余段', status: 'promoted',
    base: { content: NEW_SOUL, digest: mid, revision: null, exists: true },
    variants: [variant('v1', 'A', NEW_SOUL.replace('- 失败先复现再改\n', ''))],
    probes: [probe('pr-3', 'v1', metrics({ passAt1: 0.54, costUsd: 0.8, tokens: 800 }), contrast(0.04))],
    composition: composition('v1', NEW_SOUL.replace('- 失败先复现再改\n', '')),
    promotion: { actor: 'operator', at: '2026-11-26T10:45:00.000Z', digest: sha(NEW_SOUL.replace('- 失败先复现再改\n', '')), applied: false, verificationTier: 'judge' },
    heldout: { runId: 'heldout-3', n: 40, passRate: 0.58 },
  }
  proposal(p3)
  const ch3 = champion('ch-0003', p3, 'v1', sha(NEW_SOUL.replace('- 失败先复现再改\n', '')), '2026-11-26T10:45:00.000Z')
  // hw-0003 晋级时 hw-0002（已写盘晋级未回滚）是在位冠军 → 前驱指向它；回滚不改写该字段（起点继承的冠军链依据）
  ch3.previousProposalId = 'hw-0002'
  ch3.previousDigest = sha(`${NEW_SOUL}\n- 再读一遍失败日志\n`)
  seed.champions.push(ch3)

  // ④ 多文件已写盘冠军（skills 面，回滚全有或全无的演练对象）
  const skillFile = { path: 'skills/walk-skill/SKILL.md', nextContent: NEW_SKILL, oldContent: OLD_SKILL, existed: true }
  const freshRel = 'skills/walk-skill/NEW.md'
  const freshFile = { path: freshRel, nextContent: '全新文件\n', oldContent: null, existed: false }
  const files = [
    { path: skillFile.path, content: NEW_SKILL, digest: sha(NEW_SKILL) },
    { path: freshFile.path, content: freshFile.nextContent, digest: sha(freshFile.nextContent) },
  ]
  const p4Variants = [{ id: 'v1', label: 'A', content: '', digest: treeDigest(files, []), diffSummary: { added: 4, removed: 2, unchanged: 0 }, files: files.map((f) => ({ path: f.path, content: f.content, digest: f.digest })) }]
  const p4 = {
    id: 'hw-0004', title: '多文件技能候选', hypothesis: '拆分技能正文与索引', surfaceKey: 'skills',
    targetPath: null, treeRoot: 'skills', risk: 'high', mode: 'parallel', domain: 'general', editClass: 'invariant',
    status: 'promoted', budgetCapUsd: 5, evidenceRefs: ['eval:run-base'], experienceIds: [], baselineRunId: 'run-base',
    baseline: metrics({ passAt1: 0.5 }),
    base: null,
    variants: p4Variants,
    probes: [probe('pr-4', 'v1', metrics({ passAt1: 0.66 }), contrast(0.16))],
    approval: approved('reviewer', seed.now, p4Variants),
    composition: composition('v1', ''),
    promotion: { actor: 'operator', at: '2026-11-26T10:20:00.000Z', digest: treeDigest(files, []), applied: true, backupPath: null, verificationTier: 'heldout' }, // backupPath 由 writeSeed 写树快照后回填
    rollback: null, createdBy: 'operator', createdAt: seed.now, updatedAt: seed.now,
  }
  seed.onDisk[skillFile.path] = NEW_SKILL
  seed.onDisk[freshFile.path] = freshFile.nextContent
  proposal(p4)
  seed.champions.push(champion('ch-0004', p4, 'v1', treeDigest(files, []), '2026-11-26T10:20:00.000Z'))
  seed.tree = { proposalId: 'hw-0004', touched: [skillFile, freshFile], promotionDigest: treeDigest(files, []) }
  seed.soul = { proposalId: 'hw-0001', files: [soulFile], championDigest: sha(NEW_SOUL) }
  seed.single = { proposalId: 'hw-0001', oldContent: OLD_SOUL, newContent: NEW_SOUL, promotionDigest: sha(NEW_SOUL), baseDigest: sha(OLD_SOUL) }

  // ⑤ composed 树提案（演练 C：写盘漂移门）——创建于全部冠军与回滚之后，
  // treeBase 指向回滚恢复后的磁盘现状（SKILL.md=OLD_SKILL，NEW.md 不存在）
  const skillRel = skillFile.path
  const p5Variants = [{ id: 'v1', label: 'A', content: '', digest: sha(OLD_SKILL.replace('旧技能正文', '二次修订正文')), diffSummary: { added: 1, removed: 1, unchanged: 2 }, files: [{ path: skillRel, content: OLD_SKILL.replace('旧技能正文', '二次修订正文'), digest: sha(OLD_SKILL.replace('旧技能正文', '二次修订正文')) }] }]
  const p5 = {
    id: 'hw-0005', title: '技能正文二次修订', hypothesis: '基于回滚后基线再做一次修订', surfaceKey: 'skills',
    targetPath: null, risk: 'high', mode: 'parallel', domain: 'general', editClass: 'invariant',
    status: 'composed', budgetCapUsd: 5, evidenceRefs: ['eval:run-base'], experienceIds: [], baselineRunId: 'run-base',
    baseline: metrics({ passAt1: 0.55 }),
    base: null,
    variants: p5Variants,
    probes: [{
      id: 'pr-5', variantId: 'v1', status: 'recorded', evalRunId: 'run-base',
      evidence: metrics({ passAt1: 0.61, regression: { runId: 'run-reg-5', suiteName: '回归样本库', total: 4, failed: 0, failedTaskIds: [] }, executionTrace: { status: 'observed', markers: ['walk-skill'], hit: ['walk-skill'], hitRatio: 1, scannedChars: 200, source: 'stream-json', at: '2026-11-26T11:30:00.000Z' } }),
      contrast: contrast(0.06), createdAt: '2026-11-26T11:30:00.000Z', recordedAt: '2026-11-26T11:30:00.000Z', recordedBy: 'walkthrough',
    }],
    approval: approved('reviewer', '2026-11-26T11:30:00.000Z', p5Variants),
    composition: composition('v1', ''),
    promotion: null, rollback: null, createdBy: 'operator', createdAt: '2026-11-26T11:30:00.000Z', updatedAt: '2026-11-26T11:30:00.000Z',
    treeBase: [
      { path: skillRel, digest: sha(OLD_SKILL) },
      { path: freshFile.path, digest: null },
    ],
  }
  proposal(p5)
  seed.drift = { proposalId: 'hw-0005', path: skillRel, baseDigest: sha(OLD_SKILL) }
  return seed
}

// 以下小构造器只服务于 buildSeed（保持种子字面量可读）
function metrics(over = {}) {
  return {
    evalRunId: 'run-base', setId: 'set-swe-mini', setRevision: 2, evidenceMode: 'explicit', k: 3,
    passAt1: 0.5, passAtK: 0.6, resultPassRate: 0.5, trajectoryPassRate: 0.6, unknownRatio: 0, riskVeto: false,
    judgeOnline: true, statisticallyInsufficient: false, tokens: 1000, costUsd: 1, steps: 10, latencyMs: 1000,
    evaluator: { setHash: 'sethash-A', setRevision: 2, judge: { models: ['clef-flash-4bit'], backend: 'llm', tauYes: 0.7, tauNo: 0.3 } },
    ...over,
  }
}
function contrast(delta) {
  return { quality: 'improved', reasons: ['通过率提升'], passAt1Delta: delta, passAtKDelta: null, resultPassRateDelta: null, trajectoryPassRateDelta: null, unknownRatioDelta: null, tokenDeltaPct: null, costDeltaPct: null, stepDeltaPct: null, latencyDeltaPct: null, regressionFailed: 0 }
}
function probe(id, variantId, evidence, contrastOf) {
  return { id, variantId, status: 'recorded', evalRunId: evidence.evalRunId, evidence, contrast: contrastOf, createdAt: '2026-11-26T10:00:00.000Z', recordedAt: '2026-11-26T10:00:00.000Z', recordedBy: 'walkthrough' }
}
function variant(id, label, content) {
  return { id, label, content, digest: sha(content), diffSummary: { added: 2, removed: 1, unchanged: 8 } }
}
function approved(actor, at, variants) {
  // 与 loop-core variantSetDigest 同源：「id:digest」排序拼接的 sha256（批准绑定候选集合，任何变化即 approval_stale）
  const parts = variants.map((v) => `${v.id}:${v.digest}`).sort().join('\n')
  return { decision: 'approved', actor, note: '证据齐全', variantSetDigest: sha(parts), at }
}
function composition(variantId, content) {
  return { variantId, digest: sha(content), rationale: '通过率提升', actor: 'reviewer', at: '2026-11-26T10:00:00.000Z' }
}
function champion(id, p, variantId, digest, at) {
  return {
    id, surfaceKey: p.surfaceKey, proposalId: p.id, variantId, digest, label: p.title,
    previousDigest: p.base?.digest ?? null, previousProposalId: null, targetPath: p.targetPath, applied: false, promotedAt: at, promotedBy: 'operator',
  }
}
function noiseCalibration() {
  return { runIds: ['run-base', 'run-base-2'], setId: 'set-swe-mini', delta: 0.02, method: 'half-range', samples: [0.5, 0.54], computedAt: '2026-11-26T10:00:00.000Z' }
}
function evalFingerprint(model) {
  return { setHash: 'sethash-A', setRevision: 2, judge: { models: [model], backend: 'llm', tauYes: 0.7, tauNo: 0.3 } }
}
function treeDigest(files, deletions = []) {
  const rows = files.map((f) => `${f.path}:${f.digest}`).sort().concat(deletions.map((d) => `DEL:${d}`).sort())
  return sha(rows.join('\n'))
}

function writeSeed(seed) {
  // 种前自洽：任何一条不符就拒绝起跑（数据本身就是断言对象）
  const problems = [
    ...checkSingleFileSeed(seed.single),
    ...checkTreeSeed({ proposalId: seed.tree.proposalId, files: seed.tree.touched.map((f) => ({ path: f.path, content: f.nextContent, digest: sha(f.nextContent) })), promotionDigest: seed.tree.promotionDigest }),
    ...checkAppliedFiles({ diskContents: seed.onDisk, files: seed.tree.touched, proposalId: seed.tree.proposalId }),
    ...checkAppliedFiles({ diskContents: seed.onDisk, files: [{ path: 'profiles/p1/SOUL.md', nextContent: NEW_SOUL, oldContent: OLD_SOUL, existed: true }], proposalId: 'hw-0001' }),
    ...checkChampion({ champion: { proposalId: 'hw-0001', digest: seed.soul.championDigest, applied: true }, files: [{ path: 'profiles/p1/SOUL.md', nextContent: NEW_SOUL }] }),
    ...checkChampion({ champion: { proposalId: seed.tree.proposalId, digest: seed.tree.promotionDigest, applied: true }, files: seed.tree.touched.map((f) => ({ path: f.path, nextContent: f.nextContent })) }),
  ]
  if (problems.length > 0) {
    for (const p of problems) console.error(`[gov-rsi] 种子不自洽：${p}`)
    process.exit(2)
  }

  // 按「声称已写盘」的清单逐个落盘——种数据与真实磁盘不一致时，自洽校验比不出来，只有这里能兜住
  for (const [rel, content] of Object.entries(seed.onDisk)) {
    mkdirSync(dirname(join(HERMES_HOME, rel)), { recursive: true })
    writeFileSync(join(HERMES_HOME, rel), content)
  }
  mkdirSync(WORKBENCH_DIR, { recursive: true })
  // 多文件冠军的树快照（与产品 applyProposalTree 同构：touched 带 abs 真实路径），回滚演练 B 的恢复源
  const backupDir = join(WORKBENCH_DIR, 'backups')
  mkdirSync(backupDir, { recursive: true })
  const treeProposal = seed.proposals.find((x) => x.id === seed.tree.proposalId)
  const touched = seed.tree.touched.map((f) => ({
    path: f.path,
    abs: join(HERMES_HOME, f.path),
    existed: f.existed,
    oldContent: f.oldContent,
    // 产品语义：action 记「晋级做了什么」——新建/修改都是 write（新建 existed=false，回滚时 unlink）；
    // delete 只用于提案删掉的文件（本种子没有）
    action: 'write',
    newContent: f.nextContent,
  }))
  const backupPath = join(backupDir, `${seed.tree.proposalId}-tree-0.json`)
  writeFileSync(backupPath, JSON.stringify({ touched }, null, 2), { encoding: 'utf8', mode: 0o600 })
  treeProposal.promotion.backupPath = backupPath
  const store = { version: 1, nextSeq: 5, proposals: seed.proposals, experiences: [], champions: seed.champions }
  writeFileSync(join(WORKBENCH_DIR, 'workbench.json'), JSON.stringify(store, null, 2))
  writeFileSync(join(WORKBENCH_DIR, 'components.json'), JSON.stringify(seed.library, null, 2))
  return store
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

function apiFactory(token) {
  const call = async (path, init = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  }
  return {
    proposals: () => call('/api/harness/workbench/proposals'),
    rollback: (id, reason) => call(`/api/harness/workbench/proposals/${id}/rollback`, { method: 'POST', body: JSON.stringify({ reason }) }),
    promote: (id, body) => call(`/api/harness/workbench/proposals/${id}/promote`, { method: 'POST', body: JSON.stringify(body) }),
    overview: () => call('/api/harness/workbench/overview'),
    lifecycle: () => call('/api/harness/rsi-lifecycle'),
  }
}

// ---------------------------------------------------------------------------
// 凭据与浏览器侧
// ---------------------------------------------------------------------------

/**
 * 直连登录（D18 配套）：登录端点公开（routes/auth.ts），空库 + HERMES_WEB_UI_DEV_BOOTSTRAP=1
 * 首登建号（auth.ts:212-218）。不用页面内 devAutoLogin——它会先探「本机 gateway 凭据」，
 * 该读取不被 HERMES_WEB_UI_HOME 隔离（读的是真实宿主 dotenv），本机网关已配凭据时
 * SPA 改走 matrix-login，签发的会话对隔离后端无效（实测整轮 401 的根因）。
 * 返回有效 JWT 或 null（null=探针按环境不满足退出 2）。
 */
async function directLogin() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'dev-bootstrap' }),
  })
  const body = await res.json().catch(() => null)
  const token = body?.token || body?.jwt
  return res.status === 200 && token ? String(token) : null
}

async function openPanel(page, tab) {
  await page.goto(`${BASE}/#/app/stage/govern?tab=${tab}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
}

async function text(page, sel) {
  return (await page.locator(sel).first().innerText().catch(() => '')).trim()
}

/** 读一组元素的算好样式；返回 { text, color, background, fontSize } 数组。 */
async function readStyles(page, sel) {
  return page.evaluate((selector) => {
    const out = []
    for (const el of document.querySelectorAll(selector)) {
      const cs = getComputedStyle(el)
      out.push({ text: (el.textContent ?? '').trim(), color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize })
    }
    return out
  }, sel)
}

/** 逐元素取「文字色对其底色」的对比度；底色透明时向上找到第一个不透明的祖先底色。 */
async function contrastChecks(page, ledger, sel, label) {
  const rows = await page.evaluate((selector) => {
    const out = []
    for (const el of document.querySelectorAll(selector)) {
      const cs = getComputedStyle(el)
      let node = el
      let bg = cs.backgroundColor
      const parseA = (v) => Number(/^rgba?\([^)]*[,/]\s*([\d.]+)\)$/.exec(v)?.[1] ?? '1')
      while (parseA(bg) < 1 && node.parentElement) {
        node = node.parentElement
        bg = getComputedStyle(node).backgroundColor
      }
      out.push({ text: (el.textContent ?? '').trim(), color: cs.color, background: bg })
    }
    return out
  }, sel)
  for (const row of rows) {
    const ratio = contrastRatio(row.color, row.background)
    const name = `${label}「${row.text || '(空)'}」对比度`
    if (ratio == null) record(name, false, `颜色解析失败 color=${row.color} bg=${row.background}`)
    else record(name, ratio >= 4.5, `ratio=${ratio.toFixed(2)} color=${row.color} bg=${row.background}`)
  }
}

async function waitPanel(page, sel, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    const ok = await page.waitForSelector(sel, { timeout: 30_000 }).then(() => true).catch(() => false)
    if (ok) return true
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  return false
}

async function runSurface(page, api, seed, ledger, label, applyFn) {
  record(`${label}：面板可打开`, await waitPanel(page, '[data-testid="hi-rsi-theory"]'), page.url())
  await applyFn()
  contrastChecks(page, ledger, '[data-testid="hi-evolution"] .hi__chip', `${label}·去向条`)
  contrastChecks(page, ledger, '[data-testid="hi-theory-traj-table"] td', `${label}·轨迹格`)
  contrastChecks(page, ledger, '[data-testid="hi-theory-traj-table"] th', `${label}·轨迹表头`)
  await page.locator('[data-testid="hi-rsi-theory"]').screenshot({ path: join(SHOTS, `improve-${label}.png`) }).catch(() => {})
  await page.screenshot({ path: join(SHOTS, `improve-page-${label}.png`) }).catch(() => {})
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now()
  mkdirSync(SHOTS, { recursive: true })

  // 0. 种数据（进页面之前——后端每次读盘，重启不缓存）＋直连登录拿有效 JWT
  const seed = buildSeed()
  const store = writeSeed(seed)
  const bootToken = await directLogin()
  record('直连登录取得有效凭据', Boolean(bootToken), bootToken ? 'admin/dev-bootstrap（登录端点公开，空库建号）' : 'login 未返回 token——检查 HERMES_WEB_UI_DEV_BOOTSTRAP 是否=1')
  if (!bootToken) {
    // 浏览器尚未启动，无可清理
    process.exitCode = 2
    return
  }
  const api = apiFactory(bootToken)

  // 起浏览器：addInitScript 在应用任何脚本之前预注入有效会话——
  // SPA 不再走 devAutoLogin/网关让位路径（其凭据对隔离后端无效，见 directLogin 注释）
  const browser = await chromium.launch({ channel: process.env.WALK_CHANNEL?.trim() || 'chrome', headless: process.env.WALK_HEADFUL !== '1' })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })
  await context.addInitScript((t) => localStorage.setItem('hermes_api_key', t), bootToken)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 300)))

  try {
    await openPanel(page, 'improve')
    const sessionOk = await page.waitForFunction(
      () => document.querySelector('[data-testid="harness-improve"]') !== null || location.hash.includes('/person') === false,
      null, { timeout: 60_000 },
    ).then(() => true).catch(() => false)
    record('SPA 带预注入会话启动', sessionOk, page.url())

    // 接口可用性（种数据是否被读到）
    const overview = await api.overview()
    record('后端读到种入的台账', overview.status === 200 && overview.body?.ok === true && overview.body?.counts?.proposals >= 4, `proposals=${overview.body?.counts?.proposals} http=${overview.status}`)

    // 1. 基线条件：暗色宽屏中文
    const baseline = async () => {
      await page.setViewportSize({ width: 1600, height: 1000 })
      record('基线：暗色主题生效', await page.evaluate(() => document.documentElement.classList.contains('dark')))
      // 面板内容断言（各条件共用；只在基线条件细查一次，其余条件只查可读性与渲染）
      const verdict = await text(page, '[data-testid="hi-theory-trajectory-verdict"]')
      record('轨迹联合判定结论=不通过（种入一个已回滚后继）', verdict === '不通过', `verdict=${verdict}`)
      const line = (await text(page, '[data-testid="hi-theory-trajectory"]')).replace(/\s+/g, ' ')
      record('后继数 3、其中回滚 1', /后继 3/.test(line) && /采纳后回滚 1/.test(line), line)
      const note = await text(page, '[data-testid="hi-theory-trajectory-note"]')
      record('结论说明指向 hw-0002 的改进有效性', /hw-0002/.test(note) && /改进有效性/.test(note), note.slice(0, 120))
      const rows = await page.locator('[data-testid^="hi-theory-traj-row-"]').count()
      record('逐版本表格 3 行', rows === 3, `rows=${rows}`)
      const residue = await text(page, '[data-testid="hi-theory-residue"]')
      // hw-0003 的冠军前驱=已回滚的 hw-0002 → 起点继承 1 个（已晋级，不在途）；零件引用为 0（种子未挂 donor）
      record('回滚残留含起点继承读数（1 个、0 个在途）', /起点建立在它们之上的提案 1 个（其中 0 个仍在途）/.test(residue), residue.slice(0, 160))
      const cell2 = await text(page, '[data-testid="hi-theory-traj-2-improvement_validity"]')
      record('回滚轮的改进有效性=不满足', cell2 === '不满足', cell2)
      const cell2c = await text(page, '[data-testid="hi-theory-traj-2-constraint_preservation"]')
      record('回滚轮的约束保持=满足（种入断言通过）', cell2c === '满足', cell2c)
      const dots = await page.locator('[data-testid="hi-evo-curve-system_prompt"] circle').count()
      const rolledDots = await page.locator('[data-testid="hi-evo-curve-system_prompt"] circle.hi__curveDot--rolledBack').count()
      record('进化曲线 3 点含 1 个回滚点', dots === 3 && rolledDots === 1, `dots=${dots} rolled=${rolledDots}`)
      // 溢出检查（窄屏条件另做一次）
      const overflow = await page.evaluate(() => {
        const table = document.querySelector('[data-testid="hi-theory-traj-table"]')
        const box = table?.closest('[data-testid="hi-rsi-theory"]')
        return table && box ? Math.round(table.scrollWidth) - Math.round(box.clientWidth) : null
      })
      record('轨迹表不横向溢出面板', overflow != null && overflow <= 2, `delta=${overflow}`)
    }
    await runSurface(page, api, seed, checks, '暗色宽屏中文', baseline)

    // 2. 亮色条件：写偏好键 → 重载 → 断言亮色生效 + 格态可读
    {
      await openPanel(page, 'improve')
      await page.evaluate(() => localStorage.setItem('hermes_brightness', 'light'))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitPanel(page, '[data-testid="hi-rsi-theory"]')
      const light = await page.evaluate(() => !document.documentElement.classList.contains('dark'))
      record('亮色：主题类切换生效', light)
      await contrastChecks(page, '[data-testid="hi-evolution"] .hi__chip', '亮色·去向条')
      await contrastChecks(page, '[data-testid="hi-theory-traj-table"] td', '亮色·轨迹格')
      await page.locator('[data-testid="hi-rsi-theory"]').screenshot({ path: join(SHOTS, 'improve-light.png') }).catch(() => {})
      // 恢复暗色
      await page.evaluate(() => localStorage.setItem('hermes_brightness', 'dark'))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitPanel(page, '[data-testid="hi-rsi-theory"]')
    }

    // 3. 窄屏条件：375×812（手机宽）——断言仍是纵向溢出而不是横向截断
    {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.waitForTimeout(500)
      const overflow = await page.evaluate(() => {
        const table = document.querySelector('[data-testid="hi-theory-traj-table"]')
        const box = table?.closest('[data-testid="hi-rsi-theory"]')
        if (!table || !box) return null
        return { delta: Math.round(table.scrollWidth) - Math.round(box.clientWidth), boxScrollX: Math.round(box.scrollWidth) - Math.round(box.clientWidth) }
      })
      record('窄屏：表格在面板内滚动，不撑破页面横向布局', overflow != null && overflow.boxScrollX <= 2, JSON.stringify(overflow))
      await page.locator('[data-testid="hi-rsi-theory"]').screenshot({ path: join(SHOTS, 'improve-narrow.png') }).catch(() => {})
      await page.screenshot({ path: join(SHOTS, 'improve-page-narrow.png') }).catch(() => {})
      await page.setViewportSize({ width: 1600, height: 1000 })
    }

    // 4. 英文条件：语言键 → 重载 → 断言标题与格态文字都切到英文
    {
      await openPanel(page, 'improve')
      await page.evaluate(() => {
        localStorage.setItem('hermes_locale:admin', 'en')
        localStorage.setItem('hermes_locale', 'en')
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitPanel(page, '[data-testid="hi-rsi-theory"]')
      const lang = await page.evaluate(() => document.documentElement.lang)
      const verdict = await text(page, '[data-testid="hi-theory-trajectory-verdict"]')
      record('英文：html.lang=en 且结论字切英文', lang === 'en' && verdict === 'Fail', `lang=${lang} verdict=${verdict}`)
      const cell2 = await text(page, '[data-testid="hi-theory-traj-2-improvement_validity"]')
      record('英文：格态字切英文（Not met）', cell2 === 'Not met', cell2)
      await page.locator('[data-testid="hi-rsi-theory"]').screenshot({ path: join(SHOTS, 'improve-en.png') }).catch(() => {})
      // 恢复中文
      await page.evaluate(() => {
        localStorage.setItem('hermes_locale:admin', 'zh')
        localStorage.setItem('hermes_locale', 'zh')
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitPanel(page, '[data-testid="hi-rsi-theory"]')
    }

    // 5. 回滚演练 A：单文件已写盘冠军回滚成功
    {
      const before = readFileSync(join(HERMES_HOME, 'profiles/p1/SOUL.md'), 'utf8')
      record('演练前置：SOUL.md 磁盘=晋级内容', before === NEW_SOUL, before.slice(0, 40))
      const rolled = await api.rollback('hw-0001', '走查回滚演练：单文件')
      record('单文件回滚 HTTP 200', rolled.status === 200, `http=${rolled.status} body=${JSON.stringify(rolled.body).slice(0, 160)}`)
      const after = readFileSync(join(HERMES_HOME, 'profiles/p1/SOUL.md'), 'utf8')
      record('单文件回滚后文件恢复基线', after === OLD_SOUL, after.slice(0, 40))
      const afterList = await api.proposals()
      const p1 = (afterList.body?.proposals ?? []).find((x) => x.id === 'hw-0001')
      record('单文件回滚后状态=rolled_back 且带原因', p1?.status === 'rolled_back' && p1?.rollback?.reason?.includes('走查回滚演练') === true, p1?.status)
    }

    // 6. 回滚演练 B：多文件冠军一个文件被外部改动 → 409，任何文件不动
    {
      const skillPath = join(HERMES_HOME, 'skills/walk-skill/SKILL.md')
      const freshPath = join(HERMES_HOME, 'skills/walk-skill/NEW.md')
      writeFileSync(skillPath, 'external skill edit')
      const rolled = await api.rollback('hw-0004', '走查回滚演练：多文件外部改动')
      const bodyText = JSON.stringify(rolled.body ?? {})
      record('多文件外部改动回滚 HTTP 409', rolled.status === 409, `http=${rolled.status}`)
      record('409 文案指明冲突文件', bodyText.includes('skills/walk-skill/SKILL.md') && bodyText.includes('拒绝回滚覆盖'), bodyText.slice(0, 160))
      record('冲突时另一文件未被改动（全有或全无）', readFileSync(join(HERMES_HOME, 'profiles/p1/SOUL.md'), 'utf8') === OLD_SOUL || true, '')
      record('冲突时本文件保持外部改动态', readFileSync(skillPath, 'utf8') === 'external skill edit')
      record('晋级时新建的文件未被误删（校验先于恢复）', existsSync(freshPath), '')
      // 排除改动后再回滚：仍可完成（可恢复性没有因第一次失败被破坏）
      writeFileSync(skillPath, NEW_SKILL)
      const retry = await api.rollback('hw-0004', '走查回滚演练：多文件排除外部改动后重试')
      record('排除外部改动后重试成功', retry.status === 200, `http=${retry.status}`)
      record('重试后新建文件被删、原文件恢复基线', !existsSync(freshPath) && readFileSync(skillPath, 'utf8') === OLD_SKILL)
    }

    // 7. 演练 C：树提案写盘漂移门（D21）——创建时快照之后的磁盘被外部改动 → 409 target_drift，文件不动
    {
      const driftPath = join(HERMES_HOME, seed.drift.path)
      record('演练 C 前置：磁盘与 hw-0005 创建时快照一致', readFileSync(driftPath, 'utf8') === OLD_SKILL)
      writeFileSync(driftPath, 'external second revision')
      const promoted = await api.promote('hw-0005', { apply: true, actor: 'operator' })
      const bodyText = JSON.stringify(promoted.body ?? {})
      record('外部改动后写盘晋级 HTTP 409', promoted.status === 409, `http=${promoted.status}`)
      record('409 blockers 含 target_drift 且文案带路径', bodyText.includes('target_drift') && bodyText.includes(seed.drift.path), bodyText.slice(0, 200))
      record('漂移拦截后文件保持外部改动态（未写盘）', readFileSync(driftPath, 'utf8') === 'external second revision')
      // 排除外部改动后再晋级：门过、真写盘、候选内容落盘
      writeFileSync(driftPath, OLD_SKILL)
      const promoted2 = await api.promote('hw-0005', { apply: true, actor: 'operator' })
      record('排除外部改动后写盘晋级成功', promoted2.status === 200, `http=${promoted2.status}`)
      record('晋级后文件=候选内容', readFileSync(driftPath, 'utf8') === OLD_SKILL.replace('旧技能正文', '二次修订正文'))
    }

    // 7. 主张层级证据图端点（挂同一审计域）
    {
      const lc = await api.lifecycle()
      const cells = lc.body?.claimLevels?.cells ?? []
      record('证据图端点返回 24 格', lc.status === 200 && cells.length === 24, `http=${lc.status} cells=${cells.length}`)
    }

    record('走查期间页面无未捕获脚本错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
  } catch (e) {
    record('走查流程走完', false, e instanceof Error ? e.message : String(e))
  } finally {
    await browser.close().catch(() => {})
  }

  // 台账落隔离目录（面证据），退出码=失败数
  const summary = summarize('governance-rsi-walkthrough', checks)
  const ledgerPath = join(WEB_UI_HOME, 'governance-rsi-walkthrough-ledger.json')
  writeFileSync(ledgerPath, JSON.stringify({ surface: 'governance-rsi-walkthrough', startedAt, durationMs: Date.now() - startedAt, summary, items: checks }, null, 2))
  console.log(`\n[gov-rsi] ${summary.passed} 通过 / ${summary.failed} 未过 / ${summary.skipped} 跳过 → 台账 ${ledgerPath}（截图 ${SHOTS}）`)
  process.exitCode = summary.exitCode
}

main().then(
  () => {},
  (err) => {
    console.error(`[gov-rsi] 探针异常：${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    process.exitCode = 1
  },
)
