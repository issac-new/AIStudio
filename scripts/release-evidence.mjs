#!/usr/bin/env node
// 发布证据（v0.4 治理可信度修复）。
//
// 背景：发布链此前只对版本载体做静态对账（release:check），不证明「这份包里带的
// 测试证据对应当前 HEAD」。本脚本把 版本 / tag / HEAD / treeHash / junit 计数 /
// engineering.basic-check 判定 绑成一份 RELEASE-EVIDENCE.json，缺证据或证据陈旧即失败。
//
// 用法：
//   node scripts/release-evidence.mjs [--check] [--write] [--json]
// 退出码：0=证据齐全；1=证据缺失/陈旧/判定非 PASS；2=环境错误。

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const JUNIT = '.qgate/junit-report.xml'
const STATE = '.qgate/state.json'
const OUT = 'dist/release/RELEASE-EVIDENCE.json'

function git(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  return res.status === 0 ? res.stdout.trim() : undefined
}

/** 源码最新 mtime：证据必须比它新，否则「改完代码没重跑」也能过。 */
export function newestSourceMtime(dirs = ['custom', 'scripts', 'patches']) {
  let newest = 0
  const visit = (rel) => {
    let entries
    try {
      entries = readdirSync(join(ROOT, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name.startsWith('.')) continue
      const child = `${rel}/${e.name}`
      if (e.isDirectory()) visit(child)
      else {
        try {
          const m = statSync(join(ROOT, child)).mtimeMs
          if (m > newest) newest = m
        } catch {
          /* 读不了的文件不影响证据新鲜度判定 */
        }
      }
    }
  }
  for (const d of dirs) visit(d)
  return newest
}

export function buildEvidence({ now, junitText, junitMtime, state, version, tag, head, tree, runStartedAt, sourceNewestMtime }) {
  const problems = []
  const maxAgeMs = 24 * 3600 * 1000
  let junit = null
  if (!junitText) problems.push(`${JUNIT} missing`)
  else if (!Number.isFinite(junitMtime) || now - junitMtime > maxAgeMs) problems.push(`${JUNIT} stale >24h`)
  else {
    const tests = Number((/tests="(\d+)"/.exec(junitText) ?? [])[1])
    const failures = Number((/failures="(\d+)"/.exec(junitText) ?? [])[1])
    junit = { tests, failures }
    if (!Number.isFinite(tests) || tests === 0) problems.push('junit tests=0/unparseable')
    if (Number.isFinite(failures) && failures > 0) problems.push(`junit failures=${failures}`)
  }
  const entry = state?.['engineering.basic-check']
  if (!entry) problems.push('engineering.basic-check no run recorded')
  else if (entry.verdict !== 'PASS') problems.push(`engineering.basic-check verdict=${entry.verdict}`)
  if (Number.isFinite(runStartedAt) && Number.isFinite(sourceNewestMtime) && runStartedAt < sourceNewestMtime) {
    problems.push('source newer than test evidence: 先重跑 engineering.basic-check 再发版')
  }
  return {
    evidenceVersion: 1,
    at: new Date(now).toISOString(),
    version,
    tag,
    head,
    treeHash: tree,
    junit,
    runStartedAt,
    sourceNewestMtime,
    engineeringBasicCheck: entry ? { runId: entry.runId, verdict: entry.verdict, startedAt: entry.startedAt } : null,
    problems,
    pass: problems.length === 0,
  }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/release-evidence.mjs [--check] [--write] [--json]\n')
    return 0
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const manifest = JSON.parse(readFileSync(join(ROOT, 'RELEASE-MANIFEST.json'), 'utf8'))
  const junitPath = join(ROOT, JUNIT)
  const junitText = existsSync(junitPath) ? readFileSync(junitPath, 'utf8') : null
  const junitMtime = existsSync(junitPath) ? statSync(junitPath).mtimeMs : NaN
  const state = existsSync(join(ROOT, STATE)) ? JSON.parse(readFileSync(join(ROOT, STATE), 'utf8')) : null
  // 证据必须比源码新：读 engineering.basic-check 的 runStartedAt，和 custom/scripts/patches 的最新 mtime 比。
  const entry = state?.['engineering.basic-check']
  const runFile = entry?.runId ? join(ROOT, '.qgate', 'runs', `${entry.runId}.json`) : null
  let runStartedAt
  if (runFile && existsSync(runFile)) {
    try {
      runStartedAt = JSON.parse(readFileSync(runFile, 'utf8')).startedAt
    } catch {
      runStartedAt = undefined
    }
  }
  const evidence = buildEvidence({
    now: Date.now(),
    junitText,
    junitMtime,
    state,
    version: pkg.version,
    tag: manifest.packaging?.fullPackage?.tag,
    head: git(['rev-parse', 'HEAD']),
    tree: git(['rev-parse', 'HEAD^{tree}']),
    runStartedAt,
    sourceNewestMtime: newestSourceMtime(),
  })
  if (argv.includes('--write')) {
    if (!evidence.pass) {
      err.write(`release-evidence: 证据不齐，拒绝写发布证据：\n${evidence.problems.map((p) => `  - ${p}`).join('\n')}\n`)
      return 1
    }
    mkdirSync(join(ROOT, 'dist/release'), { recursive: true })
    writeFileSync(join(ROOT, OUT), JSON.stringify(evidence, null, 2) + '\n')
  }
  if (argv.includes('--json')) out.write(JSON.stringify(evidence, null, 2) + '\n')
  else {
    out.write(`release-evidence: ${evidence.pass ? 'PASS' : 'FAIL'} version=${evidence.version} head=${evidence.head?.slice(0, 8)} junit=${evidence.junit ? `${evidence.junit.tests} tests/${evidence.junit.failures} failures` : 'missing'}\n`)
    for (const p of evidence.problems) out.write(`  - ${p}\n`)
  }
  return evidence.pass ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
