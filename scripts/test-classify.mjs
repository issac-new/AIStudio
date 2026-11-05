#!/usr/bin/env node
// 测试三分类（v0.4 治理可信度修复）。
//
// 背景：1059 个测试文件里，243 个用 readFileSync 读源码做字符串断言；这类「源码锚定」
// 能防回归写法，但不证明运行时行为。没有分类时，「7641 个用例」会被当成行为覆盖的证据。
// 本脚本把 behavior / contract / pin 三类算出来，供覆盖率叙事与机制预算使用。
//
// 用法：
//   node scripts/test-classify.mjs [--write] [--json]
// 退出码：0=全部分类；1=有未知目录（未命中 config/test-classes.json 的规则）；2=配置缺失。
// 纪律：清单在 config/test-classes.json；新增测试目录必须显式登记，防止「默认 behavior」掩盖新面。

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONFIG_PATH = 'config/test-classes.json'
const OUT_PATH = '.qgate/test-classes.json'
const SCAN_DIRS = ['custom', 'scripts', 'simharness/tests']

export function loadConfig(root = ROOT) {
  return JSON.parse(readFileSync(join(root, CONFIG_PATH), 'utf8'))
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function classifyFile(rel, content, config) {
  const rule = config.rules.find((r) => rel.startsWith(r.prefix))
  if (!rule) return null
  const name = rel.split('/').pop() ?? ''
  if (name.includes(config.heuristics.contractFilename)) return 'contract'
  // 只把「读源码文件」判为 pin；读 JSON/fixture 的 behavior 测试不误伤。
  const srcReadRe = new RegExp(`${escapeRegExp(config.heuristics.sourceReadPattern)}\\s*\\([^)]*\\.(vue|ts|tsx|js|mjs)\\b`)
  if (rule.class === 'behavior' && srcReadRe.test(content)) return config.heuristics.sourceReadOverridesTo
  return rule.class
}

export function enumerateTests(root = ROOT) {
  const out = []
  const visit = (rel) => {
    let entries
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name.startsWith('.')) continue
      const child = `${rel}/${e.name}`
      if (e.isDirectory()) visit(child)
      else if (e.name.endsWith('.test.ts')) out.push(child)
    }
  }
  for (const d of SCAN_DIRS) visit(d)
  return out.sort()
}

export function buildManifest(root = ROOT, config = loadConfig(root)) {
  const files = enumerateTests(root)
  const classes = {}
  const unclassified = []
  for (const f of files) {
    let content = ''
    try {
      content = readFileSync(join(root, f), 'utf8')
    } catch {
      // 读不了按空内容分类；分类规则仍会命中目录，不会静默漏项
    }
    const cls = classifyFile(f, content, config)
    if (!cls) unclassified.push(f)
    else classes[f] = cls
  }
  const counts = { behavior: 0, contract: 0, pin: 0 }
  for (const c of Object.values(classes)) counts[c] += 1
  return { generatedAt: new Date().toISOString(), total: files.length, counts, unclassified, classes }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/test-classify.mjs [--write] [--json]\n')
    return 0
  }
  if (!existsSync(join(ROOT, CONFIG_PATH))) {
    err.write(`test-classify: ${CONFIG_PATH} missing\n`)
    return 2
  }
  const manifest = buildManifest()
  if (argv.includes('--write')) {
    mkdirSync(join(ROOT, '.qgate'), { recursive: true })
    writeFileSync(join(ROOT, OUT_PATH), JSON.stringify(manifest, null, 2) + '\n')
  }
  if (argv.includes('--json')) {
    out.write(JSON.stringify({ total: manifest.total, counts: manifest.counts, unclassified: manifest.unclassified }, null, 2) + '\n')
  } else {
    out.write(`tests=${manifest.total} behavior=${manifest.counts.behavior} contract=${manifest.counts.contract} pin=${manifest.counts.pin} unclassified=${manifest.unclassified.length}\n`)
    for (const f of manifest.unclassified) out.write(`UNCLASSIFIED ${f}\n`)
  }
  return manifest.unclassified.length > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
