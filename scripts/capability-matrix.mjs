#!/usr/bin/env node
// capability-matrix.mjs — 能力验收矩阵的评估器与发布门检查（2026-11-12 设计复盘 P0-5）。
//
// 背景：「六闸全过」是流程判定，不是能力判定——run29 六闸全过的同时 director 派发
// 成功率只有 9.8%。本脚本把能力声明变成可机检的单一事实源：
//   - static 检查（fileExists/fileContains/routeRegistered）当场评估；
//   - runtime 声明必须带证据路径＋采集日期，超过 staleDays 即 UNVERIFIED（不是 PASS）；
//   - claim=available 的能力若任一 static 失败或 runtime 无新鲜证据 → --check 失败。
// experimental/retired 状态的能力不拦发布，但必须给 claimNote 说明依据。
//
// 用法：node scripts/capability-matrix.mjs [--check] [--json] [--write]
//   --check：发布门模式（默认）；--json：机读输出；--write：落 dist/release/CAPABILITY-MATRIX.json
// 退出码：0=矩阵自洽；1=声明与证据不符；2=配置错误。
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MATRIX = join(ROOT, 'config/capability-acceptance.json')

export function evaluateCheck(check, root = ROOT) {
  const p = join(root, check.path ?? '')
  if (check.type === 'fileExists') {
    return existsSync(p) ? { ok: true } : { ok: false, reason: `路径不存在：${check.path}` }
  }
  if (check.type === 'fileContains') {
    if (!existsSync(p)) return { ok: false, reason: `路径不存在：${check.path}` }
    const text = readFileSync(p, 'utf8')
    return text.includes(check.pattern ?? '')
      ? { ok: true }
      : { ok: false, reason: `${check.path} 不含「${check.pattern}」` }
  }
  return { ok: false, reason: `未知检查类型：${check.type}` }
}

export function isStale(collectedAt, staleDays, now = new Date()) {
  const t = Date.parse(`${collectedAt}T23:59:59Z`)
  if (!Number.isFinite(t)) return true // 日期不可解析=不可信=过期
  return now.getTime() - t > staleDays * 86400_000
}

export function evaluateMatrix(matrix, { now = new Date(), root = ROOT } = {}) {
  const staleDays = Number(matrix.staleDays ?? 30)
  const results = []
  for (const cap of matrix.capabilities ?? []) {
    const checks = (cap.checks ?? []).map((c) => ({ type: c.type, path: c.path, ...evaluateCheck(c, root) }))
    const failed = checks.filter((c) => !c.ok)
    let runtime = null
    if (cap.runtimeEvidence) {
      const ev = cap.runtimeEvidence
      const evidenceOk = existsSync(join(root, ev.evidencePath))
      const stale = !evidenceOk || isStale(ev.collectedAt, staleDays, now)
      runtime = { metric: ev.metric, value: ev.value, evidencePath: ev.evidencePath, collectedAt: ev.collectedAt, evidenceExists: evidenceOk, stale }
    }
    const claimed = cap.status === 'available'
    // 判定：available 需 static 全绿；带 runtime 声明的还需证据在档且未过期。
    let verdict
    if (!claimed) verdict = cap.status === 'experimental' || cap.status === 'retired' ? cap.status : 'invalid-status'
    else if (failed.length > 0) verdict = 'FAIL'
    else if (runtime && (runtime.stale || !runtime.evidenceExists)) verdict = 'UNVERIFIED'
    else verdict = 'PASS'
    const blocking = claimed && verdict !== 'PASS'
    const noteRequired = !claimed && !cap.claimNote
    results.push({ id: cap.id, claim: cap.claim, status: cap.status, verdict, blocking, checks, runtime, noteRequired, claimNote: cap.claimNote ?? null })
  }
  const problems = [
    ...results.filter((r) => r.blocking).map((r) => `能力 ${r.id} 声明 available 但判定为 ${r.verdict}（${r.verdict === 'FAIL' ? (r.checks.find((c) => !c.ok)?.reason ?? 'static 失败') : 'runtime 证据缺失/过期'}）——降级声明为 experimental 或补证据`),
    ...results.filter((r) => r.noteRequired).map((r) => `能力 ${r.id} 状态为 ${r.status} 但缺 claimNote（非 available 必须给依据）`),
    ...results.filter((r) => r.verdict === 'invalid-status').map((r) => `能力 ${r.id} 的 status 不是 available/experimental/retired`),
  ]
  return { staleDays, evaluatedAt: now.toISOString(), results, problems, pass: problems.length === 0 }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/capability-matrix.mjs [--check] [--json] [--write]\n')
    return 0
  }
  if (!existsSync(MATRIX)) {
    err.write(`capability-matrix: 配置缺失 config/capability-acceptance.json\n`)
    return 2
  }
  let matrix
  try {
    matrix = JSON.parse(readFileSync(MATRIX, 'utf8'))
  } catch (e) {
    err.write(`capability-matrix: 配置解析失败：${e.message}\n`)
    return 2
  }
  const report = evaluateMatrix(matrix)
  if (argv.includes('--write') && report.pass) {
    mkdirSync(join(ROOT, 'dist/release'), { recursive: true })
    writeFileSync(join(ROOT, 'dist/release/CAPABILITY-MATRIX.json'), JSON.stringify(report, null, 2) + '\n')
  }
  if (argv.includes('--json')) {
    out.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    out.write(`capability-matrix: ${report.pass ? 'PASS' : 'FAIL'}（staleDays=${report.staleDays}）\n`)
    for (const r of report.results) {
      const mark = r.verdict === 'PASS' ? '✓' : r.blocking ? '✗' : '△'
      out.write(`  ${mark} ${r.id} [${r.status}] → ${r.verdict}${r.runtime ? `（${r.runtime.metric}=${r.runtime.value} @${r.runtime.collectedAt}${r.runtime.stale ? ',已过期' : ''}）` : ''}\n`)
    }
    for (const p of report.problems) out.write(`  - ${p}\n`)
  }
  return report.pass ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
export { main }
