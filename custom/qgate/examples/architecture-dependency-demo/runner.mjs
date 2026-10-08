// architecture-dependency-demo——依赖图真实测量 runner（上游 v1.29 W3 + v1.30 F05 +
// v1.31.1 正则语境守卫本地方言）：扫描 src/ 真实 .mjs 静态 import 说明符构建模块图，
// 按 layers.json 声明计算违规方向数（forbiddenDependencies）与环数（cycles，DFS 三色标记）。
// 注释/字符串/模板字面量里的 import 不误计（逐字符状态机分类代码/注释/字符串/正则）；
// 副作用 import 与 export-from 不漏计（副作用边参与环检测）；正则字面量语境守卫
//（return/typeof/in/case 等关键字后的 / 是正则起始——正则内引号不吞后续真实 import）。
// QGATE_SCENARIO=violation/cycle 注入真实违规源文件（检出即非零退出），finally 清理。
// 测量边界＝静态 ESM 相对 import（动态 import()/外部裸包不计，报告性指标 unresolvedImports）。
// 观察协议 stdin {schemaVersion,runId} → stdout JSON（判定字段由 ops topology/architecture 消费；
// runner 只观察：forbiddenDependencies/cycles 是内核可重算的观察事实）。
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = process.env.QGATE_SCENARIO ?? 'clean'

function readStdin() {
  return new Promise((r) => {
    let d = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { d += c })
    process.stdin.on('end', () => r(d))
    setTimeout(() => { process.stdin.destroy(); r(d) }, 300)
    process.stdin.resume()
  })
}
let stdinRaw = ''
try { stdinRaw = await readStdin() } catch { /* 空输入容错 */ }
let input = {}
try { input = JSON.parse(stdinRaw || '{}') } catch { /* 协议输入尽力而为 */ }

/** 场景注入：violation=core→ui 方向违例；cycle=a↔b 互引（真实源文件，finally 删除）。 */
function injectScenario() {
  const src = join(here, 'src')
  if (scenario === 'violation') {
    writeFileSync(join(src, 'core', 'violation.mjs'), "import { dash } from '../ui/dashboard.mjs'\nexport const v = dash\n")
  } else if (scenario === 'cycle') {
    writeFileSync(join(src, 'core', 'cyc-a.mjs'), "import { b } from './cyc-b.mjs'\nexport const a = 1\n")
    writeFileSync(join(src, 'core', 'cyc-b.mjs'), "import { a } from './cyc-a.mjs'\nexport const b = 1\n")
  }
}
function cleanupScenario() {
  // 注入文件落在 src/core/（与 injectScenario 同目录基准）
  for (const f of ['violation.mjs', 'cyc-a.mjs', 'cyc-b.mjs']) {
    const p = join(here, 'src', 'core', f)
    if (existsSync(p)) rmSync(p)
  }
}

/** 逐字符状态机分类源码（代码/行注释/块注释/单双字符串/模板字面量含 ${} 嵌套/正则字面量）。
    只在代码区域识别 import——注释与字符串里的 from '…' 不误计（F05 ARCH-COMMENT）；
    正则语境守卫：return/typeof/in/case/of 等关键字后的 / 视为正则起始（v1.31.1 收严）。 */
function classify(source) {
  const code = []
  /** 原文 offset → 是否 code 区（字符串内容也算"非语句区"——import 说明符的引号字符
      本身由语句正则消费，不影响；这里给语句起点校验用）。 */
  const codeAt = new Array(source.length).fill(false)
  let i = 0
  let mode = 'code' // code | line | block | single | double | template(depth) | regex
  let templateDepth = 0
  const prevSignificant = () => {
    for (let j = code.length - 1; j >= 0; j--) {
      const ch = code[j]
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return ch
    }
    return ''
  }
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (mode === 'code') {
      if (ch === '/' && next === '/') { mode = 'line'; i += 2; continue }
      if (ch === '/' && next === '*') { mode = 'block'; i += 2; continue }
      if (ch === "'") { mode = 'single'; i++; continue }
      if (ch === '"') { mode = 'double'; i++; continue }
      if (ch === '`') { mode = 'template'; templateDepth = 0; i++; continue }
      if (ch === '/') {
        // 除法 vs 正则：前一显著字符是标识符/数字/)/]/}/引号闭合 → 除法；
        // 关键字语境（return/typeof/in/case/of 等）→ 正则起始（v1.31.1 正则语境守卫）
        const p = prevSignificant()
        const tail = code.join('').split(/\s+/).pop() ?? ''
        const keywordCtx = /^(return|typeof|in|of|case|do|else|instanceof|void|delete|yield|await|new|,|\(|&&|\|\||!|\?|:)$/.test(tail)
        const divCtx = /[A-Za-z0-9_$)\]}'"]$/.test(p) && !keywordCtx
        if (!divCtx) { mode = 'regex'; i++; continue }
      }
      code.push(ch); codeAt[i] = true; i++; continue
    }
    if (mode === 'line') { if (ch === '\n') { mode = 'code'; code.push('\n') } i++; continue }
    if (mode === 'block') { if (ch === '*' && next === '/') { mode = 'code'; i += 2; continue } i++; continue }
    // 字符串字面量保留进 code（连同引号）——import 说明符本身在字符串里，提取正则需要
    // 引号边界；误计风险由"只在 import/export 语法结构内取说明符"的正则形态承担
    //（孤立字符串里的 from '…' 不是 import 语句——正则要求 (import|export) 前缀）。
    if (mode === 'single') { if (ch === '\\') { code.push(ch, source[i + 1] ?? ''); i += 2; continue } code.push(ch); if (ch === "'") mode = 'code'; i++; continue }
    if (mode === 'double') { if (ch === '\\') { code.push(ch, source[i + 1] ?? ''); i += 2; continue } code.push(ch); if (ch === '"') mode = 'code'; i++; continue }
    if (mode === 'template') {
      if (ch === '\\') { i += 2; continue }
      if (ch === '`' && templateDepth === 0) { mode = 'code'; i++; continue }
      if (ch === '$' && next === '{') { templateDepth++; i += 2; code.push(' '); continue }
      if (ch === '}' && templateDepth > 0) { templateDepth--; i++; continue }
      i++; continue
    }
    if (mode === 'regex') {
      if (ch === '\\') { i += 2; continue }
      if (ch === '[') { mode = 'regexClass'; i++; continue }
      if (ch === '/') { mode = 'code'; i++; continue }
      if (ch === '\n') { mode = 'code'; i++; continue }
      i++; continue
    }
    // regexClass
    if (ch === '\\') { i += 2; continue }
    if (ch === ']') { mode = 'regex'; i++; continue }
    i++
  }
  return { text: code.join(''), codeAt }
}

/** 从原文提取静态引用（语句锚定 + 分类校验双闸，F05 双向防误/防漏）：
    ① 语句级正则在原文上找候选：行首/;/{}/语句边界后的 import/export 关键字，
       后随合法子句（default / 名字列表 / type 修饰 / side-effect 形态）直至 from 'spec'
       或副作用形态 'spec' 直接结尾；
    ② 候选语句起点必须在分类后的 code 区（注释/字符串/模板内的 import 文本过不了②）。 */
function extractImports(source, codeAt, fromFile, root) {
  const out = []
  const re = /(?:^|(?<=[\n;}]))[ \t]*(import|export)(?:[ \t]+type)?[ \t]*(?:[A-Za-z_$][\w$]*[ \t]*)?(?:\{[^}]*\}[ \t]*)?(?:[A-Za-z_$][\w$]*[ \t]*)?(?:,[ \t]*[A-Za-z_$][\w$]*[ \t]*)?(?:from[ \t]*)?['"]([^'"]+)['"]/gm
  let m
  while ((m = re.exec(source)) !== null) {
    const stmtStart = m.index
    if (!codeAt[stmtStart]) continue
    const spec = m[2]
    if (!spec.startsWith('.')) continue // 测量边界＝相对 import（外部裸包不计）
    const target = relative(root, resolve(root, dirname(fromFile), spec))
    out.push(target.replace(/\\/g, '/'))
  }
  return out
}

let exitCode = 0
try {
  injectScenario()
  const root = here
  const srcRoot = join(root, 'src')
  const layers = JSON.parse(readFileSync(join(root, 'layers.json'), 'utf8')) // {layer: ['src/子目录/**']}

  // 1) 收集模块与层归属
  const modules = new Map() // rel path → layer | null
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.mjs')) {
        const rel = relative(root, p).replace(/\\/g, '/')
        let layer = null
        for (const [name, globs] of Object.entries(layers)) {
          if (globs.some((g) => rel.startsWith(g.replace(/\/\*\*$/, '')))) { layer = name; break }
        }
        modules.set(rel, layer)
      }
    }
  }
  walk(srcRoot)

  // 2) 边提取（真实源码 → 分类 → 三类静态引用）
  const edges = [] // {from, to}
  const unresolvedImports = []
  for (const rel of modules.keys()) {
    const source = readFileSync(join(root, rel), 'utf8')
    const { text: classified, codeAt } = classify(source)
    void classified
    for (const target of extractImports(source, codeAt, rel, root)) {
      const resolved = [...modules.keys()].find((k) => k === target || k === `${target}.mjs`)
      if (resolved) edges.push({ from: rel, to: resolved })
      else unresolvedImports.push(`${rel} → ${target}`)
    }
  }

  // 3) 违规方向（layers.json 的 forbidden 声明）
  const forbidden = []
  for (const [fromLayer, toLayers] of Object.entries(JSON.parse(readFileSync(join(root, 'layers.json'), 'utf8')).forbidden ?? {})) {
    for (const e of edges) {
      const lf = modules.get(e.from)
      const lt = modules.get(e.to)
      if (lf === fromLayer && toLayers.includes(lt)) forbidden.push(`${e.from} → ${e.to} (${lf}→${lt})`)
    }
  }

  // 4) 环检测（DFS 三色标记）
  const adj = new Map()
  for (const e of edges) {
    const list = adj.get(e.from) ?? []
    list.push(e.to)
    adj.set(e.from, list)
  }
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map([...modules.keys()].map((k) => [k, WHITE]))
  const cycles = []
  const dfs = (node, stack) => {
    color.set(node, GRAY)
    stack.push(node)
    for (const next of adj.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        const start = stack.indexOf(next)
        cycles.push([...stack.slice(start), next].join(' → '))
      } else if (color.get(next) === WHITE) dfs(next, stack)
    }
    stack.pop()
    color.set(node, BLACK)
  }
  for (const m of modules.keys()) if (color.get(m) === WHITE) dfs(m, [])

  const observation = {
    schemaVersion: '0.1',
    runId: input.runId ?? 'unknown',
    kind: 'architecture-dependency',
    scenario,
    modules: modules.size,
    edges: edges.length,
    forbiddenDependencies: forbidden,
    cycles,
    unresolvedImports,
    measuredBy: 'static ESM relative imports over classified source (comments/strings/templates/regex excluded; side-effect imports and export-from included)',
  }
  process.stdout.write(JSON.stringify(observation))
  // 违规场景以非零退出供 command 门直判（observation 仍全量输出——观察与判定双通道）。
  // process.exit 不跑 finally——退出码延后到 finally 清理之后（注入文件必须清理，F05 场景纪律）。
  exitCode = forbidden.length > 0 || cycles.length > 0 ? 1 : 0
} finally {
  cleanupScenario()
}
process.exit(exitCode)
