// 断言在位守门（规格 2026-11-28-loopforge-scheduled-tasks-absorption 批 A1）：
// 测试用例的回调里必须有断言，否则「跑了但什么都没验」的用例会以通过收场。
// 吸收自 LoopForge 教程的代码审查清单「新增逻辑缺少单测，或测试没有有效断言」。
//
// 判读口径是词法的，只回答「用例体里有没有断言调用」，不评判断言对不对：
//   算有断言：以 expect 或 assert 开头的调用（expect(…)、assert.ok，以及 expectLocaleKeys 这类
//             函数体在别的文件里的辅助函数——按命名约定采信，不看它的函数体）；
//             一失败就抛错的内置执行函数（execFileSync、execSync，只认退出码）；
//             调用本文件里带断言的辅助函数（函数声明，或 const 赋的箭头函数，会看它的函数体）。
//   不计入：.skip 与 .todo 的用例。.skipIf 的用例运行时同样要有断言。
//   判红：用例体里没有断言调用；没有回调；回调是指向别处的函数引用（跨文件无法判定）；
//         源码括号不配对、或用了本扫描器不认的语法（扫描器判不了的，不静默放过）。
// 扫描面：custom/、scripts/、simharness/、team/ 下的 *.test.* 与 *.spec.*（JS 与 TS）。
//   pytest 文件不在本守门范围。
// 字符串、模板字面量的文字、注释、正则字面量先抹成空白再数括号，所以字符串里写的假用例头、
// 正则里的花括号都不会被当成代码。
// 基线只许减：条目对应的用例消失或补上断言后，本守门要求删掉该条目。
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SCAN_ROOTS = ['custom', 'scripts', 'simharness', 'team']
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'vendor', '__pycache__', '.runtime-deploy-shadow'])
/** 一失败就抛错的内置执行函数：调用它们等于断言了命令退出码为 0 */
const THROWING = new Set(['execFileSync', 'execSync'])

/** 有意不断言的用例。条目格式「仓内相对路径::用例标题」 */
const BASELINE: Array<{ case: string; reason: string }> = [
  {
    case: 'custom/server/toolresultguard/__tests__/s1-calibration.probe.test.ts::dump raw judge answers for gray-zone + benign samples',
    reason: '判定端点校准探针：用途是把模型的原始答案打印给人看，默认跳过，须设 TRG_E2E 才跑',
  },
]

// ── 扫描器（纯函数，内联文本可测）──────────────────────────────────────────
type Tok = { v: string; pos: number }
/** 一个用例；reason 为空串表示通过 */
type CaseHit = { title: string; line: number; reason: string }
/** 本文件里的一个辅助函数：函数体的 token 区间 [from, to) */
type Fn = { body: [number, number] }

const IDENT = /^[A-Za-z_$][\w$]*$/
const TOKEN = /=>|[A-Za-z_$][\w$]*|[0-9][\w$.]*|[^\sA-Za-z0-9_$]/gy
const NO_ASSERT = '用例体里没有断言调用'
const NOT_LITERAL = '回调不是函数字面量，也不是本文件带断言的辅助函数，无法判定'
const NO_CALLBACK = '没有回调'
const UNPARSEABLE = '源码括号不配对，扫描器无法判定'
/** 斜杠前面是这些字符或关键字时，斜杠开一个正则字面量；其余情况是除号 */
const REGEX_AFTER_CHARS = '([{,;=:?!&|~^<>+-*%}'
const REGEX_AFTER_WORDS = new Set(['return', 'case', 'typeof', 'void', 'in', 'of', 'instanceof', 'new', 'delete', 'do', 'else', 'yield', 'await'])
/** 前面是这些 token 的 it / test 不是用例头 */
const NOT_A_HEAD = new Set(['.', 'function', 'new', 'const', 'let', 'var', 'class'])

/** 把字符串、模板字面量的文字、注释、正则字面量抹成空格（保留换行与长度），只留下可做括号配平的代码 */
export function blankOut(src: string): string {
  const out = src.split('')
  const blank = (i: number): void => { if (i < out.length && out[i] !== '\n') out[i] = ' ' }
  /** 进入模板插值 ${ 时的花括号深度：花括号深度回到这个值的 } 就是插值的结尾 */
  const interps: number[] = []
  let braces = 0
  let inTemplate = false
  /** 斜杠前紧挨的标识符，用来认「return /正则/」这类写法 */
  const wordBefore = (i: number): string => /[A-Za-z_$][\w$]*$/.exec(out.slice(Math.max(0, i - 12), i).join('').trimEnd())?.[0] ?? ''
  const lastCode = (i: number): string => {
    for (let j = i - 1; j >= 0; j -= 1) {
      if (out[j] !== ' ' && !/\s/.test(out[j])) return out[j]
    }
    return ''
  }
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (inTemplate) {
      if (c === '\\') { blank(i); blank(i + 1); i += 2; continue }
      if (c === '`') { blank(i); inTemplate = false; i += 1; continue }
      if (c === '$' && src[i + 1] === '{') { blank(i); blank(i + 1); interps.push(braces); inTemplate = false; i += 2; continue }
      blank(i); i += 1
      continue
    }
    if (c === '`') { blank(i); inTemplate = true; i += 1; continue }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { blank(i); i += 1 }
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      blank(i); blank(i + 1); i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { blank(i); i += 1 }
      blank(i); blank(i + 1); i += 2
      continue
    }
    if (c === "'" || c === '"') {
      blank(i); i += 1
      while (i < src.length && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { blank(i); i += 1 }
        blank(i); i += 1
      }
      blank(i); i += 1
      continue
    }
    if (c === '/') {
      const prev = lastCode(i)
      if (prev === '' || REGEX_AFTER_CHARS.includes(prev) || REGEX_AFTER_WORDS.has(wordBefore(i))) {
        let j = i + 1
        let inClass = false
        let closed = false
        while (j < src.length) {
          const d = src[j]
          if (d === '\\') { j += 2; continue }
          if (d === '\n') break // 正则字面量不能跨行：这个斜杠其实是除号
          if (d === '[') inClass = true
          else if (d === ']') inClass = false
          else if (d === '/' && !inClass) { closed = true; break }
          j += 1
        }
        if (closed) {
          for (let k = i; k <= j; k += 1) blank(k)
          i = j + 1
          continue
        }
      }
    }
    if (c === '{') braces += 1
    else if (c === '}') {
      if (interps.length > 0 && braces === interps[interps.length - 1]) { interps.pop(); blank(i); inTemplate = true; i += 1; continue }
      braces -= 1
    }
    i += 1
  }
  return out.join('')
}

/** 抹空后的源码切成 token：标识符、数字（记作 #num）、单字符符号、=> */
function tokenize(blanked: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < blanked.length) {
    TOKEN.lastIndex = i
    const m = TOKEN.exec(blanked)
    if (!m) { i += 1; continue }
    toks.push({ v: m[0] >= '0' && m[0] <= '9' ? '#num' : m[0], pos: m.index })
    i = m.index + m[0].length
  }
  return toks
}

/** 从 toks[open] 的左括号找到配对的右括号下标；配不上返回 -1 */
function matchClose(toks: Tok[], open: number): number {
  const left = toks[open]?.v
  const right = left === '(' ? ')' : left === '[' ? ']' : left === '{' ? '}' : ''
  let depth = 0
  for (let k = open; k < toks.length; k += 1) {
    if (toks[k].v === left) depth += 1
    else if (toks[k].v === right) { depth -= 1; if (depth === 0) return k }
  }
  return -1
}

/** 表达式体箭头函数的结尾：同层的分号，或闭合外层代码块的右括号之前 */
function statementEnd(toks: Tok[], start: number): number {
  let depth = 0
  for (let k = start; k < toks.length; k += 1) {
    const v = toks[k].v
    if (v === '(' || v === '[' || v === '{') depth += 1
    else if (v === ')' || v === ']' || v === '}') { if (depth === 0) return k; depth -= 1 }
    else if (v === ';' && depth === 0) return k
  }
  return toks.length
}

/** 参数表右括号之后跳过返回类型注解，返回函数体开始处（{ 或 =>）的下标 */
function afterReturnType(toks: Tok[], closeParen: number): number {
  let k = closeParen + 1
  if (toks[k]?.v !== ':') return k
  let depth = 0
  for (k += 1; k < toks.length; k += 1) {
    const v = toks[k].v
    if (v === '(' || v === '[' || v === '<') depth += 1
    else if (v === ')' || v === ']' || v === '>') depth -= 1
    else if (v === '{') { if (depth === 0) return k; depth += 1 }
    else if (v === '}') depth -= 1
    else if (v === '=>' && depth === 0) return k
  }
  return k
}

/** token 区间 [from, to) 是不是一个函数字面量；是则返回函数体的 token 区间 */
function fnBody(toks: Tok[], from: number, to: number): [number, number] | null {
  let p = from
  if (toks[p]?.v === 'async') p += 1
  if (toks[p]?.v === 'function') {
    let q = p + 1
    if (IDENT.test(toks[q]?.v ?? '')) q += 1
    if (toks[q]?.v !== '(') return null
    const closeParen = matchClose(toks, q)
    const brace = closeParen < 0 ? -1 : afterReturnType(toks, closeParen)
    if (toks[brace]?.v !== '{') return null
    const closeBrace = matchClose(toks, brace)
    return closeBrace < 0 ? null : [brace + 1, closeBrace]
  }
  let arrow = -1
  if (toks[p]?.v === '(') {
    const closeParen = matchClose(toks, p)
    if (closeParen < 0) return null
    arrow = afterReturnType(toks, closeParen)
  } else if (IDENT.test(toks[p]?.v ?? '') && toks[p + 1]?.v === '=>') {
    arrow = p + 1
  }
  if (toks[arrow]?.v !== '=>') return null
  const start = arrow + 1
  if (toks[start]?.v === '{') {
    const closeBrace = matchClose(toks, start)
    return closeBrace < 0 ? null : [start + 1, closeBrace]
  }
  return [start, to]
}

/** 用例标题：参数表第一个参数是字符串字面量时取其原文；不是则返回空串 */
function titleAt(src: string, openPos: number): string {
  let i = openPos + 1
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i += 1
    if (src[i] === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    if (src[i] === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return ''; i += 2; continue }
    break
  }
  const quote = src[i]
  if (quote !== "'" && quote !== '"') return ''
  let text = ''
  for (let j = i + 1; j < src.length && src[j] !== quote && src[j] !== '\n'; j += 1) {
    if (src[j] === '\\' && j + 1 < src.length) { j += 1; text += src[j]; continue }
    text += src[j]
  }
  return text
}

/** 拆 toks[open]（左圆括号）到 toks[close]（右圆括号）的顶层参数，返回各参数的 token 区间 */
function splitArgs(toks: Tok[], open: number, close: number): Array<[number, number]> {
  const args: Array<[number, number]> = []
  let from = open + 1
  let depth = 0
  for (let k = open + 1; k <= close; k += 1) {
    const v = toks[k]?.v
    if (k === close || (v === ',' && depth === 0)) { if (k > from) args.push([from, k]); from = k + 1; continue }
    if (v === '(' || v === '[' || v === '{') depth += 1
    else if (v === ')' || v === ']' || v === '}') depth -= 1
  }
  return args
}

/** 收集本文件的函数声明与 const 赋的箭头函数，供「调用带断言的辅助函数」判读 */
function collectFunctions(toks: Tok[]): Map<string, Fn[]> {
  const helpers = new Map<string, Fn[]>()
  const add = (name: string | undefined, body: [number, number] | null): void => {
    if (name && body) helpers.set(name, [...(helpers.get(name) ?? []), { body }])
  }
  for (let k = 0; k < toks.length; k += 1) {
    if (toks[k].v === 'function' && IDENT.test(toks[k + 1]?.v ?? '') && toks[k + 2]?.v === '(') {
      const closeParen = matchClose(toks, k + 2)
      const brace = closeParen < 0 ? -1 : afterReturnType(toks, closeParen)
      const closeBrace = toks[brace]?.v === '{' ? matchClose(toks, brace) : -1
      add(toks[k + 1].v, closeBrace < 0 ? null : [brace + 1, closeBrace])
    }
    if ((toks[k].v === 'const' || toks[k].v === 'let') && IDENT.test(toks[k + 1]?.v ?? '') && toks[k + 2]?.v === '=') {
      let p = k + 3
      if (toks[p]?.v === 'async') p += 1
      let arrow = -1
      if (toks[p]?.v === '(') {
        const closeParen = matchClose(toks, p)
        if (closeParen >= 0) arrow = afterReturnType(toks, closeParen)
      } else if (IDENT.test(toks[p]?.v ?? '') && toks[p + 1]?.v === '=>') {
        arrow = p + 1
      }
      if (toks[arrow]?.v !== '=>') continue
      const start = arrow + 1
      if (toks[start]?.v === '{') {
        const closeBrace = matchClose(toks, start)
        add(toks[k + 1].v, closeBrace < 0 ? null : [start + 1, closeBrace])
      } else {
        add(toks[k + 1].v, [start, statementEnd(toks, start)])
      }
    }
  }
  return helpers
}

/** token 区间里有没有断言调用；调用本文件带断言的辅助函数也算（成环靠 seen 截断） */
function hasAssertion(toks: Tok[], from: number, to: number, helpers: Map<string, Fn[]>, seen: Set<string>): boolean {
  for (let k = from; k < to; k += 1) {
    const v = toks[k].v
    const prev = toks[k - 1]?.v ?? ''
    const next = toks[k + 1]?.v
    const isCall = next === '(' && !['.', 'function', 'new'].includes(prev)
    // 以 expect / assert 开头的调用按命名约定采信：含 expectLocaleKeys 这类函数体在别的文件里的辅助函数
    if (/^(expect|assert)/.test(v) && (next === '(' || next === '.') && prev !== 'function' && prev !== 'new') return true
    if (THROWING.has(v) && isCall) return true
    if (isCall && IDENT.test(v) && helpers.has(v) && !seen.has(v)) {
      seen.add(v)
      for (const fn of helpers.get(v) ?? []) {
        if (hasAssertion(toks, fn.body[0], fn.body[1], helpers, seen)) return true
      }
    }
  }
  return false
}

/** 逐个找出 it( 与 test( 用例并判读；返回的只有没通过的用例 */
function scanCases(toks: Tok[], src: string): CaseHit[] {
  const helpers = collectFunctions(toks)
  const hits: CaseHit[] = []
  for (let h = 0; h < toks.length; h += 1) {
    if ((toks[h].v !== 'it' && toks[h].v !== 'test') || NOT_A_HEAD.has(toks[h - 1]?.v ?? '')) continue
    const line = src.slice(0, toks[h].pos).split('\n').length
    const fail = (title: string, reason: string): void => { hits.push({ title, line, reason }) }
    let skipped = false
    let unparseable = false
    let list: [number, number] | null = null
    for (let k = h + 1; k < toks.length;) {
      if (toks[k]?.v === '.') {
        const mod = toks[k + 1]?.v
        if (mod === 'skip' || mod === 'todo') skipped = true
        k += 2
        continue
      }
      if (toks[k]?.v === '(') {
        const close = matchClose(toks, k)
        if (close < 0) { unparseable = true; break }
        list = [k, close]
        k = close + 1
        continue
      }
      // it.each<T>(…) 这类带类型参数的写法本扫描器不认
      if (toks[k]?.v === '<' && toks[k - 1]?.v === '.') unparseable = true
      break
    }
    if (unparseable) {
      fail(toks[h + 1]?.v === '(' ? titleAt(src, toks[h + 1].pos) : '', UNPARSEABLE)
      continue
    }
    // 只是取属性（如 vitest.it）、或右圆括号后面紧跟 { 与 : 的方法与类型声明，都不是用例
    if (!list || ['{', ':'].includes(toks[list[1] + 1]?.v ?? '')) continue
    if (skipped) continue
    const title = titleAt(src, toks[list[0]].pos)
    let callback: [number, number] | null = null
    let reference: [number, number] | null = null
    for (const [from, to] of splitArgs(toks, list[0], list[1])) {
      const body = fnBody(toks, from, to)
      if (body) { callback = body; break }
      reference = [from, to]
    }
    if (callback) {
      if (!hasAssertion(toks, callback[0], callback[1], helpers, new Set<string>())) fail(title, NO_ASSERT)
    } else if (!reference) {
      fail(title, NO_CALLBACK)
    } else {
      const [from, to] = reference
      const name = toks[from].v
      const assertive = to - from === 1 && IDENT.test(name)
        ? (helpers.get(name) ?? []).filter((fn) => hasAssertion(toks, fn.body[0], fn.body[1], helpers, new Set([name])))
        : []
      if (assertive.length === 0) fail(title, NOT_LITERAL)
    }
  }
  return hits
}

/** 一段源码里没通过的用例，写成「标题」原因 */
export function violationsOf(src: string): string[] {
  const toks = tokenize(blankOut(src))
  return scanCases(toks, src).map((hit) => `「${hit.title}」${hit.reason}`)
}

/** 基线里已经不再被判红的条目（对应用例已删除或已补上断言），须删除 */
export function staleBaseline(baseline: string[], flagged: string[]): string[] {
  const still = new Set(flagged)
  return baseline.filter((entry) => !still.has(entry))
}

function walk(dir: string, files: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (entry.isFile() && TEST_FILE.test(entry.name)) files.push(full)
  }
}

/** 全仓扫描；返回值为空表示通过。扫描器自己出错按不通过处理，不静默放过 */
export function scanRepo(root: string = ROOT): string[] {
  const files: string[] = []
  for (const dir of SCAN_ROOTS) walk(join(root, dir), files)
  const allowed = new Set(BASELINE.map((b) => b.case))
  const flagged = new Set<string>()
  const found: string[] = []
  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/')
    try {
      const src = readFileSync(file, 'utf8')
      for (const hit of scanCases(tokenize(blankOut(src)), src)) {
        const key = `${rel}::${hit.title}`
        flagged.add(key)
        if (!allowed.has(key)) found.push(`${rel}:${hit.line} 「${hit.title}」${hit.reason}`)
      }
    } catch (error) {
      found.push(`${rel}: 扫描器出错，按不通过处理：${(error as Error).message}`)
    }
  }
  for (const entry of staleBaseline([...allowed], [...flagged])) {
    found.push(`${entry}：基线条目已失效（对应用例已删除或已补上断言），请删除该条目`)
  }
  return found
}

// ── 扫描器行为 ─────────────────────────────────────────────────────────────
describe('断言在位扫描器（内联文本）', () => {
  const RED = '用例体里没有断言调用'

  it('用例体里没有任何断言 → 判红', () => {
    expect(violationsOf(`it('空壳', () => { const a = 1 })`)).toEqual([`「空壳」${RED}`])
  })

  it('只有注释写着已验证 → 判红', () => {
    expect(violationsOf(`it('只有注释', async () => {\n  await foo()\n  // Verify foo was called\n})`)).toEqual([`「只有注释」${RED}`])
  })

  it('.skip 与 .todo 不计；.skipIf 的用例照常检查', () => {
    expect(violationsOf(`it.skip('跳过', () => {})\nit.todo('待办')\ntest.skip('也跳过', fn)`)).toEqual([])
    expect(violationsOf(`it.skipIf(!process.env.E2E)('条件用例', () => { foo() })`)).toEqual([`「条件用例」${RED}`])
  })

  it('带 { timeout } 选项对象的用例：选项不当成回调体', () => {
    expect(violationsOf(`it('带选项且有断言', { timeout: 30_000 }, () => {\n  expect(1).toBe(1)\n})`)).toEqual([])
    expect(violationsOf(`it('带选项没断言', { timeout: 30_000 }, async () => {\n  await foo()\n})`)).toEqual([`「带选项没断言」${RED}`])
  })

  it('字符串字面量里的假用例头不算用例', () => {
    // 字符串里的空壳若被当成用例，这里会多报一条「内层」
    expect(violationsOf(`it('外层', () => {\n  const src = "it('内层', () => {})"\n  expect(src).toContain('it(')\n})`)).toEqual([])
  })

  it('正则字面量里的花括号与引号不扰乱括号配平', () => {
    expect(violationsOf(`it('正则', () => {\n  const m = /a\\{([^}]*)\\}/.exec('a{x}')\n  expect(m).not.toBeNull()\n})\n    it('正则后无断言', () => {\n  const m = /}&'/.exec(s)\n})`)).toEqual([`「正则后无断言」${RED}`])
  })

  it('表达式体箭头函数', () => {
    expect(violationsOf(`it('表达式体有断言', () => expect(1).toBe(1))`)).toEqual([])
    expect(violationsOf(`it('表达式体无断言', async () => foo())`)).toEqual([`「表达式体无断言」${RED}`])
  })

  it('调用本文件里带断言的辅助函数算有断言；辅助函数自己没断言不算', () => {
    expect(violationsOf(`describe('g', () => {\n  function check(x: unknown): void { expect(x).toBe(1) }\n  it('经函数声明', () => { check(1) })\n  it('经箭头函数', () => { verify(2) })\n})\nconst verify = (n: number): void => { expect(n).toBeGreaterThan(0) }`)).toEqual([])
    expect(violationsOf(`function noop(x: unknown): void { void x }\nit('辅助函数没断言', () => { noop(1) })`)).toEqual([`「辅助函数没断言」${RED}`])
  })

  it('辅助函数互相调用成环不会卡死', () => {
    expect(violationsOf(`function a(): void { b() }\nfunction b(): void { a() }\nit('成环', () => { a() })`)).toEqual([`「成环」${RED}`])
  })

  it('以 expect 开头的跨文件辅助函数按命名约定算有断言（函数体在别的文件，这里看不到）', () => {
    expect(violationsOf(`import { expectLocaleKeys } from './helpers/locale-tree'\nit('词表键齐备', () => { expectLocaleKeys('ide', ['a', 'b']) })`)).toEqual([])
  })

  it('一失败就抛错的内置执行函数算有断言；不抛错的子进程调用不算', () => {
    expect(violationsOf(`it('语法门', () => {\n  execFileSync('bash', ['-n', f])\n  execSync(cmd)\n})`)).toEqual([])
    expect(violationsOf(`it('不抛错的子进程', () => { spawnSync('bash', ['-n', f]) })`)).toEqual([`「不抛错的子进程」${RED}`])
  })

  it('表驱动 .each 取第二个参数表', () => {
    expect(violationsOf(`it.each([[1], [2]])('n=%i', (n) => { expect(n).toBeGreaterThan(0) })`)).toEqual([])
    expect(violationsOf(`it.each([[1], [2]])('n=%i', (n) => { console.log(n) })`)).toEqual([`「n=%i」${RED}`])
  })

  it('回调是别处的函数引用、或没有回调 → 判红', () => {
    expect(violationsOf(`it('外部引用', runMe)`)).toEqual(['「外部引用」回调不是函数字面量，也不是本文件带断言的辅助函数，无法判定'])
    expect(violationsOf(`it('只有标题')`)).toEqual(['「只有标题」没有回调'])
  })

  it('方法调用、函数声明、赋值不被当成用例头', () => {
    expect(violationsOf(`foo.test('x', cb)\nobj?.it('y', cb)\nfunction test(name: string, fn: () => void): void {}\nclass T { test(a: number): void {} }\nconst it = vitest.it\nit('真用例', () => { expect(1).toBe(1) })`)).toEqual([])
  })

  it('模板字面量的文字部分抹掉、插值里的代码保留', () => {
    expect(violationsOf('it(\'模板有断言\', () => { expect(`${x}`).toBe("1") })')).toEqual([])
    expect(violationsOf('it(\'模板无断言\', () => { const s = `a { b } c ${d}` })')).toEqual([`「模板无断言」${RED}`])
  })

  it('括号不配对 → 判红而不是静默放过', () => {
    expect(violationsOf(`it('没写完', () => { foo(`)).toEqual(['「没写完」源码括号不配对，扫描器无法判定'])
  })

  it('基线只许减：条目对应的用例不再被判红就要求删条目', () => {
    expect(staleBaseline(['a.test.ts::还在'], ['a.test.ts::还在'])).toEqual([])
    expect(staleBaseline(['a.test.ts::已补断言'], [])).toEqual(['a.test.ts::已补断言'])
  })
})

// ── 全仓扫描 ───────────────────────────────────────────────────────────────
describe('全仓测试用例断言在位', () => {
  it('custom/、scripts/、simharness/、team/ 下每个测试用例的回调里都有断言调用', () => {
    const found = scanRepo()
    expect(found, [
      '发现没有断言的测试用例（补上真实断言，或确认是有意不断言后加入文件头 BASELINE 并写明理由）：',
      ...found,
    ].join('\n')).toEqual([])
  }, 120_000)
})
