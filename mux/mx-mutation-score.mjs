#!/usr/bin/env node
// mx-mutation-score.mjs — 增量变异测试得分器（2026-10-16 三篇调研轮 E 件，方案正本 V8.35 §5.8.2 测试环节准出）。
// 作用：对 git 增量内的源码生成有界变异体（每处只改坏一个算子），逐个跑测试命令，
// 用「测试是否如预期变红」评估测试有效性——覆盖率只说明覆盖到，变异得分说明测得对
// （防 AI 生成定制化断言虚高覆盖率；行业参照：AI 生成测试变异得分自报 20-40、人写 60-80）。
// 产物 JSON 落 run evidence（evidence/mutation-score.json），消费方=推演中心证据链与
// 治理中心度量体检「AI 产出质量」区。
// 用法：
//   node mx-mutation-score.mjs --repo <path> --base <git-ref> --test <command> \
//        [--max-mutants 40] [--max-files 12] [--per-file 8] [--timeout-ms 60000] \
//        [--threshold 50] [--out <file>]
// 退出码：0=pass 或 no-mutants；1=fail（得分低于线）；2=baseline-fail（改动前测试已红，先修基线）；3=用法/环境错误。
// 边界与如实声明（输出 meta.notes）：
//   - 字符串/模板字面量/注释内的算子不变异（掩码扫描保索引）；模板 ${} 内表达式随之掩码（v1 不变异）。
//   - 正则字面量未识别：正则内算子变异多为语法破坏，属廉价击杀，得分可能略偏高。
//   - 语法破坏型变异体（如 TS 泛型尖括号被改）同样计 killed——近似口径，供横向对比与复盘校准。
//   - 只动仓库内 git 已跟踪文件，逐变异体恢复原文，结束时字节级校验全部恢复。
import { parseArgs } from 'node:util'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TOOL = 'mx-mutation-score'
const CODE_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts'])

// 变异算子对（位置贪心最长匹配，OPS 序即优先序：'>=' 先于 '>'、'===' 先于 '=='）
const OPS = [
  ['>=', '>'], ['<=', '<'], ['===', '!=='], ['!==', '==='],
  ['>', '>='], ['<', '<='], ['==', '!='], ['!=', '=='],
  ['&&', '||'], ['||', '&&'], ['+', '-'], ['-', '+'],
]

function usage(msg) {
  if (msg) process.stderr.write(`[${TOOL}] ${msg}\n`)
  process.stderr.write(`用法：node ${TOOL}.mjs --repo <path> --base <git-ref> --test <command> [--max-mutants 40] [--max-files 12] [--per-file 8] [--timeout-ms 60000] [--threshold 50] [--out <file>]\n`)
  process.exit(3)
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8', timeout: 15_000 })
}

/** 掩码器：注释与字符串内容替换为等长空白（保索引），返回掩码文本。 */
export function maskSource(src) {
  const out = src.split('')
  const n = src.length
  const blank = (from, to) => { for (let k = from; k <= to; k++) if (out[k] !== '\n') out[k] = ' ' }
  let i = 0
  while (i < n) {
    const c = src[i], c2 = src[i + 1]
    if (c === '/' && c2 === '/') { const s = i; while (i < n && src[i] !== '\n') i++; blank(s, i - 1); continue }
    if (c === '/' && c2 === '*') { const s = i; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i = Math.min(n, i + 2); blank(s, i - 1); continue }
    if (c === "'") { const s = i; i++; while (i < n && src[i] !== "'" && src[i] !== '\n') { if (src[i] === '\\') i++; i++ } i = Math.min(n, i + 1); blank(s, i - 1); continue }
    if (c === '"') { const s = i; i++; while (i < n && src[i] !== '"' && src[i] !== '\n') { if (src[i] === '\\') i++; i++ } i = Math.min(n, i + 1); blank(s, i - 1); continue }
    if (c === '`') { const s = i; i++; while (i < n && src[i] !== '`') { if (src[i] === '\\') i++; i++ } i = Math.min(n, i + 1); blank(s, i - 1); continue }
    i++
  }
  return out.join('')
}

/** 掩码文本上找变异点（纯函数，测试面）：跳过箭头函数 '=>'、'++'/'--' 连写。 */
export function findMutants(masked) {
  const found = []
  for (let i = 0; i < masked.length; i++) {
    let hit = null
    for (const [from, to] of OPS) {
      if (masked.startsWith(from, i)) { hit = { start: i, from, to }; break }
    }
    if (!hit) continue
    const prev = masked[i - 1] ?? ''
    const next = masked[i + hit.from.length] ?? ''
    if (hit.from === '>' && prev === '=') { i += hit.from.length - 1; continue } // 箭头函数 =>
    if ((hit.from === '+' || hit.from === '-') && (prev === hit.from || next === hit.from)) { i += hit.from.length - 1; continue } // ++/--
    found.push(hit)
    i += hit.from.length - 1
  }
  return found
}

function clip(text, max) {
  const t = String(text ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function runTest(repo, cmd, timeoutMs) {
  const t0 = Date.now()
  let r
  try {
    r = spawnSync(cmd, { cwd: repo, shell: true, timeout: timeoutMs, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 })
  } catch (e) {
    return { code: null, timedOut: false, spawnError: String(e?.message ?? e), ms: Date.now() - t0, tail: '' }
  }
  if (r.error) {
    const timedOut = r.signal === 'SIGTERM' || /TIMED?OUT/i.test(String(r.error.message ?? ''))
    return { code: r.status, timedOut, spawnError: timedOut ? null : String(r.error.message ?? ''), ms: Date.now() - t0, tail: clip(`${r.stdout ?? ''}\n${r.stderr ?? ''}`, 300) }
  }
  return { code: r.status, timedOut: false, spawnError: null, ms: Date.now() - t0, tail: clip(`${r.stdout ?? ''}\n${r.stderr ?? ''}`, 300) }
}

function parseCli(argv) {
  let p
  try {
    p = parseArgs({
      args: argv, options: {
        repo: { type: 'string' }, base: { type: 'string' }, test: { type: 'string' },
        'max-mutants': { type: 'string' }, 'max-files': { type: 'string' }, 'per-file': { type: 'string' },
        'timeout-ms': { type: 'string' }, threshold: { type: 'string' }, out: { type: 'string' },
      },
    })
  } catch (e) { usage(e.message) }
  const repo = p.values.repo, base = p.values.base, test = p.values.test
  if (!repo || !base || !test) usage('--repo/--base/--test 三者必填')
  const num = (v, dflt, min, max, name) => {
    if (v === undefined) return dflt
    const n = Number(v)
    if (!Number.isInteger(n) || n < min || n > max) usage(`--${name} 须为 ${min}-${max} 整数`)
    return n
  }
  return {
    repo, base, test, out: p.values.out,
    maxMutants: num(p.values['max-mutants'], 40, 1, 500, 'max-mutants'),
    maxFiles: num(p.values['max-files'], 12, 1, 100, 'max-files'),
    perFile: num(p.values['per-file'], 8, 1, 50, 'per-file'),
    timeoutMs: num(p.values['timeout-ms'], 60_000, 5_000, 600_000, 'timeout-ms'),
    threshold: num(p.values.threshold, 50, 0, 100, 'threshold'),
  }
}

export function main(argv = process.argv.slice(2)) {
  const cfg = parseCli(argv)
  const repo = resolve(cfg.repo)
  const ts = new Date().toISOString()

  let changed
  try {
    execFileSync('git', ['-C', repo, 'rev-parse', '--verify', `${cfg.base}^{commit}`], { stdio: 'pipe', timeout: 15_000 })
    changed = git(repo, ['diff', '--name-only', `${cfg.base}..HEAD`]).split('\n').map(s => s.trim()).filter(Boolean)
  } catch (e) {
    usage(`git 基座失效（${cfg.base}）：${clip(e.message, 120)}`)
  }
  const codeFiles = changed.filter(f => CODE_EXTS.has(extOf(f)) && !f.endsWith('.d.ts')).sort()

  const emit = (payload, exit) => {
    const body = JSON.stringify(payload, null, 1)
    process.stdout.write(`${body}\n`)
    if (cfg.out) {
      mkdirSync(dirname(resolve(cfg.out)), { recursive: true })
      writeFileSync(resolve(cfg.out), body, 'utf-8')
    }
    process.exit(exit)
  }
  const meta = {
    tool: TOOL, repo, base: cfg.base, test: cfg.test, ts,
    caps: { maxMutants: cfg.maxMutants, maxFiles: cfg.maxFiles, perFile: cfg.perFile, timeoutMs: cfg.timeoutMs, threshold: cfg.threshold },
    notes: [
      '字符串/模板/注释内算子不变异（掩码保索引）；模板 ${} 内表达式随之掩码（v1 不变异）',
      '正则字面量未识别与语法破坏型变异体同计 killed——近似口径，横向对比用，复盘校准',
      '外部参照：AI 生成测试变异得分自报 20-40、人写 60-80（腾讯 Harness 文，2026-10-16）',
    ],
  }

  if (codeFiles.length === 0) {
    emit({ ...meta, status: 'no-mutants', changedFiles: changed, total: 0, killed: 0, survived: 0, timeout: 0, score: null, verdict: 'pass', verdictNote: '增量内无源码文件——零变异体，如实不计分' }, 0)
  }

  // 逐文件取变异点（文件/位置均确定性），按上限截断
  const filePlans = []
  for (const f of codeFiles.slice(0, cfg.maxFiles)) {
    let src
    try { src = readFileSync(resolve(repo, f), 'utf-8') } catch { continue }
    const mutants = findMutants(maskSource(src)).slice(0, cfg.perFile)
    if (mutants.length > 0) filePlans.push({ file: f, src, mutants })
  }
  const plan = []
  outer: for (const fp of filePlans) {
    for (const m of fp.mutants) {
      plan.push({ ...m, file: fp.file })
      if (plan.length >= cfg.maxMutants) break outer
    }
  }
  if (plan.length === 0) {
    emit({ ...meta, status: 'no-mutants', changedFiles: changed, filesConsidered: codeFiles, total: 0, killed: 0, survived: 0, timeout: 0, score: null, verdict: 'pass', verdictNote: '增量源码内未找到可变异算子——零变异体，如实不计分' }, 0)
  }

  // 基线：改动前测试必须全绿，否则先修基线（不制造「基线本来就红」的假得分）
  const baseline = runTest(repo, cfg.test, cfg.timeoutMs)
  if (baseline.code !== 0 || baseline.timedOut) {
    emit({ ...meta, status: 'baseline-fail', baseline, total: 0, killed: 0, survived: 0, timeout: 0, score: null, verdict: 'baseline-fail', verdictNote: '改动前测试已红/超时——先修基线再跑变异（防假得分）' }, 2)
  }

  // 逐变异体：写入→跑测试→恢复（finally），记录 killed/survived/timeout
  const results = []
  const backups = new Map()
  const startedAt = Date.now()
  try {
    for (const m of plan) {
      if (!backups.has(m.file)) backups.set(m.file, readFileSync(resolve(repo, m.file), 'utf-8'))
      const original = backups.get(m.file)
      const mutated = original.slice(0, m.start) + m.to + original.slice(m.start + m.from.length)
      writeFileSync(resolve(repo, m.file), mutated, 'utf-8')
      let run
      try {
        run = runTest(repo, cfg.test, cfg.timeoutMs)
      } finally {
        writeFileSync(resolve(repo, m.file), original, 'utf-8')
      }
      const status = run.timedOut ? 'timeout' : run.code === 0 ? 'survived' : 'killed'
      results.push({ file: m.file, line: lineOf(original, m.start), from: m.from, to: m.to, status, exitCode: run.code, ms: run.ms, tail: run.tail || run.spawnError || '' })
    }
  } finally {
    // 结束恢复校验：任一文件与备份不等→重写并记 warning
    const restoreIssues = []
    for (const [f, content] of backups) {
      try {
        if (readFileSync(resolve(repo, f), 'utf-8') !== content) {
          writeFileSync(resolve(repo, f), content, 'utf-8')
          restoreIssues.push(f)
        }
      } catch { restoreIssues.push(`${f}（读回失败）`) }
    }
    if (restoreIssues.length > 0) process.stderr.write(`[${TOOL}] 恢复校验补救：${restoreIssues.join('、')}\n`)
  }

  const killed = results.filter(r => r.status === 'killed').length
  const timeout = results.filter(r => r.status === 'timeout').length
  const survived = results.filter(r => r.status === 'survived').length
  const total = results.length
  const score = Math.round(((killed + timeout) / total) * 100)
  const verdict = score >= cfg.threshold ? 'pass' : 'fail'
  emit({
    ...meta, status: 'scored', changedFiles: changed, filesConsidered: codeFiles,
    baseline: { code: baseline.code, ms: baseline.ms },
    total, killed, survived, timeout, score, threshold: cfg.threshold, verdict,
    durationMs: Date.now() - startedAt,
    mutants: results,
  }, verdict === 'pass' ? 0 : 1)
}

function extOf(f) { const i = f.lastIndexOf('.'); return i < 0 ? '' : f.slice(i) }
function lineOf(src, pos) { let line = 1; for (let i = 0; i < pos && i < src.length; i++) if (src[i] === '\n') line++; return line }

// CLI 直调才执行（import 纯函数测试不触发）
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
