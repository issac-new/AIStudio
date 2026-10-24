#!/usr/bin/env node
// mx-dup-ratio.mjs — 增量代码重复率检测器（2026-10-16 三篇调研轮 F 件，方案正本 V8.35 §5.8.2 编码环节准出）。
// 作用：把「新增代码重复行 ≤3%」（SonarQube 新增代码口径，§5.8.2 既有判据）从口头
// 声明变成机器度量——窗口法：连续 N 行规范化指纹跨全仓比对，增量文件里落在重复
// 窗口内的有效行占比。动机=AI 不收敛重复实现（行业自报：AI 编码普及后重复率
// 8.3%→12.3%），架构评审只靠人判复用不够。
// 用法：
//   node mx-dup-ratio.mjs --repo <path> --base <git-ref> [--window 8] [--threshold 3] \
//        [--min-lines 10] [--top-blocks 10] [--out <file>]
// 退出码：0=pass 或 unmeasured（增量太小）；1=fail（超阈值）；3=用法/环境错误。
// 口径如实声明（输出 meta.notes）：
//   - 窗口法近似 SonarQube 重复块检测（其算法为 token 块比对）；行级规范化=去空白/
//     去注释行/压缩行内空白，跨文件与同文件重复都算；
//   - 增量侧计数：增量文件中落在「出现 ≥2 次窗口」内的行数 / 增量文件有效行数；
//   - 未跟踪文件不参与（只看 git 已跟踪文件的 base..HEAD 增量）。
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TOOL = 'mx-dup-ratio'
const CODE_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.py'])

function usage(msg) {
  if (msg) process.stderr.write(`[${TOOL}] ${msg}\n`)
  process.stderr.write(`用法：node ${TOOL}.mjs --repo <path> --base <git-ref> [--window 8] [--threshold 3] [--min-lines 10] [--top-blocks 10] [--out <file>]\n`)
  process.exit(3)
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8', timeout: 30_000 })
}

function extOf(f) { const i = f.lastIndexOf('.'); return i < 0 ? '' : f.slice(i) }

/** 行规范化（纯函数，测试面）：trim+压缩行内空白；空行与纯注释行=无效行（null）。 */
export function normalizeLine(raw) {
  let s = String(raw ?? '').trim()
  if (s === '') return null
  s = s.replace(/\s+/g, ' ')
  if (s.startsWith('//') || s.startsWith('#') || s.startsWith('*') || s.startsWith('/*') || s.startsWith('*/') || s.startsWith('<!--')) return null
  return s
}

/** 文件→有效行序列（保留原始行号，供重复定位）。 */
export function effectiveLines(text) {
  const out = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const norm = normalizeLine(lines[i])
    if (norm !== null) out.push({ text: norm, line: i + 1 })
  }
  return out
}

const windowKey = (texts) => texts.join('\x00')

/**
 * 窗口比对核心（纯函数，测试面）。
 * corpus: [{file, lines: [{text,line}]}]（全仓已跟踪文件，字典序）；
 * changedSet: 增量文件名集合。
 * 返回每文件重复行号集合 + 重复块样本（≥2 次出现的窗口，优先增量涉及的）。
 */
export function duplicateAnalysis(corpus, changedSet, windowSize, topBlocks) {
  const counts = new Map() // key → { count, first: 'file:line' }
  for (const { file, lines } of corpus) {
    for (let i = 0; i + windowSize <= lines.length; i++) {
      const key = windowKey(lines.slice(i, i + windowSize).map(l => l.text))
      const cur = counts.get(key)
      if (cur) cur.count += 1
      else counts.set(key, { count: 1, first: `${file}:${lines[i].line}` })
    }
  }
  const perFile = new Map() // file → Set<lineNo>
  const dupWindows = [] // 样本（增量侧出现的重复窗口）
  for (const { file, lines } of corpus) {
    const changed = changedSet.has(file)
    for (let i = 0; i + windowSize <= lines.length; i++) {
      const key = windowKey(lines.slice(i, i + windowSize).map(l => l.text))
      const info = counts.get(key)
      if (!info || info.count < 2) continue
      const range = lines.slice(i, i + windowSize)
      if (changed) {
        const set = perFile.get(file) ?? new Set()
        for (const l of range) set.add(l.line)
        perFile.set(file, set)
        if (dupWindows.length < 200) {
          dupWindows.push({ key, preview: range.slice(0, 2).map(l => l.text), lines: windowSize, occurrences: [info.first, `${file}:${range[0].line}`] })
        }
      }
    }
  }
  // 样本去重（同 key 只留一条）并截断
  const seen = new Set()
  const blocks = []
  for (const w of dupWindows) {
    if (seen.has(w.key)) continue
    seen.add(w.key)
    blocks.push({ preview: w.preview, lines: w.lines, occurrences: w.occurrences })
    if (blocks.length >= topBlocks) break
  }
  return { perFile, blocks }
}

function parseCli(argv) {
  let p
  try {
    p = parseArgs({
      args: argv, options: {
        repo: { type: 'string' }, base: { type: 'string' }, window: { type: 'string' },
        threshold: { type: 'string' }, 'min-lines': { type: 'string' }, 'top-blocks': { type: 'string' }, out: { type: 'string' },
      },
    })
  } catch (e) { usage(e.message) }
  if (!p.values.repo || !p.values.base) usage('--repo/--base 必填')
  const num = (v, dflt, min, max, name) => {
    if (v === undefined) return dflt
    const n = Number(v)
    if (!Number.isInteger(n) || n < min || n > max) usage(`--${name} 须为 ${min}-${max} 整数`)
    return n
  }
  return {
    repo: p.values.repo, base: p.values.base, out: p.values.out,
    window: num(p.values.window, 8, 4, 30, 'window'),
    threshold: num(p.values.threshold, 3, 0, 100, 'threshold'),
    minLines: num(p.values['min-lines'], 10, 1, 10_000, 'min-lines'),
    topBlocks: num(p.values['top-blocks'], 10, 1, 50, 'top-blocks'),
  }
}

export function main(argv = process.argv.slice(2)) {
  const cfg = parseCli(argv)
  const repo = resolve(cfg.repo)
  const ts = new Date().toISOString()

  let changed, allFiles
  try {
    execFileSync('git', ['-C', repo, 'rev-parse', '--verify', `${cfg.base}^{commit}`], { stdio: 'pipe', timeout: 15_000 })
    changed = git(repo, ['diff', '--name-only', `${cfg.base}..HEAD`]).split('\n').map(s => s.trim()).filter(Boolean)
    allFiles = git(repo, ['ls-files']).split('\n').map(s => s.trim()).filter(Boolean)
  } catch (e) {
    usage(`git 基座失效（${cfg.base}）：${String(e.message).slice(0, 120)}`)
  }
  const changedSet = new Set(changed)
  const codeAll = allFiles.filter(f => CODE_EXTS.has(extOf(f))).sort()

  // 语料=全仓已跟踪代码文件（跨文件重复的对照面）；读不到的文件如实跳过并记数
  const corpus = []
  let unreadable = 0
  for (const f of codeAll) {
    try {
      corpus.push({ file: f, lines: effectiveLines(readFileSync(resolve(repo, f), 'utf-8')) })
    } catch { unreadable += 1 }
  }
  const { perFile, blocks } = duplicateAnalysis(corpus, changedSet, cfg.window, cfg.topBlocks)

  const fileRows = []
  let incrementLines = 0
  let duplicateLines = 0
  for (const { file, lines } of corpus) {
    if (!changedSet.has(file)) continue
    const dup = perFile.get(file)
    const dupCount = dup ? dup.size : 0
    incrementLines += lines.length
    duplicateLines += dupCount
    if (dupCount > 0 || CODE_EXTS.has(extOf(file))) fileRows.push({ file, effectiveLines: lines.length, duplicateLines: dupCount })
  }

  const ratio = incrementLines >= cfg.minLines
    ? Math.round((duplicateLines / incrementLines) * 1000) / 10
    : null
  const status = ratio === null ? 'unmeasured' : 'scored'
  const verdict = ratio === null ? 'pass' : ratio <= cfg.threshold ? 'pass' : 'fail'

  const payload = {
    tool: TOOL, repo, base: cfg.base, ts, status, verdict,
    threshold: cfg.threshold, window: cfg.window,
    incrementLines, duplicateLines, ratio,
    verdictNote: ratio === null
      ? `增量有效行 ${incrementLines} < ${cfg.minLines}——样本太小不计比率，如实标 unmeasured`
      : `增量重复率 ${ratio}%（阈值 ≤${cfg.threshold}%，SonarQube 新增代码口径的窗口法近似）`,
    changedFiles: changed, fileRows, blocks,
    meta: {
      notes: [
        '窗口法近似 SonarQube 重复块检测（token 块比对）；行级规范化=去空白/去注释行/压缩行内空白',
        '跨文件与同文件重复都计；未跟踪文件不参与（只看 git 已跟踪文件的 base..HEAD 增量）',
        '行业参照（自报口径）：AI 编码普及后代码重复率 8.3%→12.3%（GitClear，腾讯 Harness 文转引）',
      ],
      unreadableFiles: unreadable,
    },
  }
  const body = JSON.stringify(payload, null, 1)
  process.stdout.write(`${body}\n`)
  if (cfg.out) {
    mkdirSync(dirname(resolve(cfg.out)), { recursive: true })
    writeFileSync(resolve(cfg.out), body, 'utf-8')
  }
  process.exit(verdict === 'pass' ? 0 : 1)
}

// CLI 直调才执行（import 纯函数测试不触发）
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
