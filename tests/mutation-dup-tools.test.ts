/**
 * E/F 工具合同测试（2026-10-16 三篇调研轮）：
 *  - mx-mutation-score.mjs：掩码纯函数（字符串/箭头/连写跳过）；强测试夹具杀变异体
 *    得分过线 exit 0；弱断言夹具存活 exit 1；基线已红 exit 2 中止不产假得分；
 *    零增量 exit 0 no-mutants；跑后仓干净（逐变异体恢复）。
 *  - mx-dup-ratio.mjs：行规范化纯函数；窗口比对纯函数；CLI 夹具=复制块超阈 fail /
 *    全新代码 0% pass / 增量太小 unmeasured；产物 schema 供 overlay /quality 端点消费。
 * 夹具=临时 git 仓（mkdtemp，node --test 内建跑器零依赖），跑完即删。
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it, afterAll } from 'vitest'
import { maskSource, findMutants } from '../mux/mx-mutation-score.mjs'
import { normalizeLine, effectiveLines, duplicateAnalysis } from '../mux/mx-dup-ratio.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MUT = join(HERE, '..', 'mux', 'mx-mutation-score.mjs')
const DUP = join(HERE, '..', 'mux', 'mx-dup-ratio.mjs')
const tmpDirs: string[] = []
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

function mkRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mx-ef-'))
  tmpDirs.push(dir)
  const g = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf-8' })
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main'], { encoding: 'utf-8' })
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
  return dir
}
function commit(dir: string, msg: string): void {
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf-8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf-8' })
}
/** 跑 CLI 并收 {code, json}：execFileSync 非零退出抛错，status 即退出码。 */
function runCli(script: string, args: string[]): { code: number; json: Record<string, any>; stdout: string } {
  try {
    const stdout = execFileSync('node', [script, ...args], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 })
    return { code: 0, json: JSON.parse(stdout), stdout }
  } catch (e: any) {
    const stdout = String(e.stdout ?? '')
    return { code: e.status as number, json: stdout ? JSON.parse(stdout) : {}, stdout }
  }
}

// ── 纯函数层 ──

describe('maskSource/findMutants — 掩码与算子选择', () => {
  it('字符串/模板/注释内的算子不变异', () => {
    expect(findMutants(maskSource(`const s = 'a > b && c'`))).toHaveLength(0)
    expect(findMutants(maskSource('const t = `x >= ${y}`'))).toHaveLength(0)
    expect(findMutants(maskSource('// a > b\n/* c < d */'))).toHaveLength(0)
  })
  it('箭头函数与 ++/-- 连写跳过；比较/逻辑/算术算子命中', () => {
    const m = findMutants(maskSource('const f = (a) => a >= 1 && a <= 9 || a === 5; let i = 0; i++; let j = a + b - c;'))
    const froms = m.map(x => x.from)
    expect(froms).toContain('>='); expect(froms).toContain('&&'); expect(froms).toContain('===')
    expect(froms).toContain('+'); expect(froms).toContain('-')
    expect(froms).not.toContain('>') // '=>' 的 > 已跳过，'>=' 优先命中
  })
  it('变异替换等长语义：>= 变 > 后重跑掩码可再命中', () => {
    const src = 'if (a >= 2) {}'
    const hit = findMutants(maskSource(src))[0]
    expect(hit).toMatchObject({ from: '>=', to: '>' })
    const mutated = src.slice(0, hit.start) + hit.to + src.slice(hit.start + 2)
    expect(mutated).toBe('if (a > 2) {}')
  })
})

describe('normalizeLine/effectiveLines/duplicateAnalysis — 重复检测核心', () => {
  it('空行与注释行无效；空白压缩', () => {
    expect(normalizeLine('  const  a = 1  ')).toBe('const a = 1')
    expect(normalizeLine('')).toBeNull()
    expect(normalizeLine('// note')).toBeNull()
    expect(normalizeLine('   # py comment')).toBeNull()
    expect(effectiveLines('a\n\n // c \nb\n').map(l => l.text)).toEqual(['a', 'b'])
  })
  it('窗口比对：跨文件重复块标记增量侧行；独有块不标', () => {
    const block = Array.from({ length: 8 }, (_, i) => `line${i} of shared`)
    const corpus = [
      { file: 'src/old.js', lines: block.map((text, i) => ({ text, line: i + 1 })) },
      { file: 'src/new.js', lines: [...block.map((text, i) => ({ text, line: i + 1 })), { text: 'unique tail', line: 9 }] },
    ]
    const { perFile, blocks } = duplicateAnalysis(corpus, new Set(['src/new.js']), 8, 5)
    expect(perFile.get('src/old.js')).toBeUndefined() // 非增量文件不计行
    expect(perFile.get('src/new.js')!.size).toBe(8) // 增量侧 8 行全落重复窗口
    expect(blocks).toHaveLength(1)
    expect(blocks[0].occurrences.some(o => o.startsWith('src/old.js:'))).toBe(true)
  })
})

// ── CLI 合同（夹具=临时 git 仓 + node --test 内建跑器） ──

const CALC_JS = `export function add(a, b) { return a + b }
export function sub(a, b) { return a - b }
export function isAdult(age) { return age >= 18 }
export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
export function both(a, b) { return a > 0 && b > 0 }
`
const STRONG_TEST = `import test from 'node:test'
import assert from 'node:assert/strict'
import { add, sub, isAdult, clamp, both } from '../src/calc.js'
test('add/sub', () => { assert.equal(add(2, 3), 5); assert.equal(sub(5, 2), 3) })
test('isAdult', () => { assert.equal(isAdult(18), true); assert.equal(isAdult(17), false) })
test('clamp', () => { assert.equal(clamp(0, 1, 10), 1); assert.equal(clamp(99, 1, 10), 10); assert.equal(clamp(5, 1, 10), 5) })
test('both', () => { assert.equal(both(1, 1), true); assert.equal(both(0, 1), false); assert.equal(both(1, -1), false) })
`
const WEAK_TEST = `import test from 'node:test'
import assert from 'node:assert/strict'
import { add } from '../src/calc.js'
test('tautology', () => { assert.equal(typeof add, 'function') })
`
const RED_TEST = `import test from 'node:test'
import assert from 'node:assert/strict'
test('always red', () => { assert.fail('基线就是红的') })
`

function setupCalcRepo(testFile: string): string {
  const dir = mkRepo()
  mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'test'))
  // 基座=占位实现+冒烟测试（基线必须绿——变异得分的前提是改动前测试可过）
  writeFileSync(join(dir, 'src', 'calc.js'), 'export const one = 1\n')
  writeFileSync(join(dir, 'test', 'smoke.test.js'), "import test from 'node:test'\ntest('smoke', () => {})\n")
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', type: 'module', private: true }, null, 1))
  commit(dir, 'base')
  // 增量=实现+测试同落（跑变异的目标就是这段增量）
  writeFileSync(join(dir, 'src', 'calc.js'), CALC_JS)
  writeFileSync(join(dir, 'test', 'calc.test.js'), testFile)
  commit(dir, 'impl')
  return dir
}

describe('mx-mutation-score CLI — 变异得分合同', () => {
  it('强测试：杀变异体得分过线 exit 0；产物 schema 齐；跑后仓干净', () => {
    const dir = setupCalcRepo(STRONG_TEST)
    const r = runCli(MUT, ['--repo', dir, '--base', 'HEAD~1', '--test', 'node --test', '--threshold', '50'])
    expect(r.code).toBe(0)
    expect(r.json.status).toBe('scored')
    expect(r.json.verdict).toBe('pass')
    expect(r.json.score).toBeGreaterThanOrEqual(50)
    expect(r.json.total).toBeGreaterThan(0)
    expect(r.json.killed + r.json.survived + r.json.timeout).toBe(r.json.total)
    for (const m of r.json.mutants) expect(['killed', 'survived', 'timeout']).toContain(m.status)
    // 杀伤真实性：add 的 +→- 变异必须被杀（断言值的测试拦得住算术变异）
    const addMut = r.json.mutants.find((m: any) => m.from === '+' && m.status === 'killed')
    expect(addMut).toBeDefined()
    const clean = execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf-8' })
    expect(clean.trim()).toBe('')
  }, 180_000)

  it('弱断言：变异体存活得分不过线 exit 1', () => {
    const dir = setupCalcRepo(WEAK_TEST)
    const r = runCli(MUT, ['--repo', dir, '--base', 'HEAD~1', '--test', 'node --test', '--threshold', '50'])
    expect(r.code).toBe(1)
    expect(r.json.status).toBe('scored')
    expect(r.json.verdict).toBe('fail')
    expect(r.json.score).toBeLessThan(50)
  }, 180_000)

  it('基线已红：exit 2 中止，不产假得分', () => {
    const dir = setupCalcRepo(RED_TEST)
    const r = runCli(MUT, ['--repo', dir, '--base', 'HEAD~1', '--test', 'node --test'])
    expect(r.code).toBe(2)
    expect(r.json.status).toBe('baseline-fail')
    expect(r.json.score).toBeNull()
  }, 60_000)

  it('零增量：exit 0 no-mutants 如实不计分', () => {
    const dir = setupCalcRepo(STRONG_TEST)
    const r = runCli(MUT, ['--repo', dir, '--base', 'HEAD', '--test', 'node --test'])
    expect(r.code).toBe(0)
    expect(r.json.status).toBe('no-mutants')
    expect(r.json.score).toBeNull()
  })

  it('用法错误：缺必填参 exit 3', () => {
    const r = runCli(MUT, ['--repo', '/tmp'])
    expect(r.code).toBe(3)
  })
})

describe('mx-dup-ratio CLI — 增量重复率合同', () => {
  function setupDupRepo(newFile: string): string {
    const dir = mkRepo()
    mkdirSync(join(dir, 'src'))
    const shared = Array.from({ length: 10 }, (_, i) => `export function part${i}() { return ${i} + ${i * 2} }`)
    writeFileSync(join(dir, 'src', 'old.js'), `${shared.join('\n')}\n`)
    commit(dir, 'base')
    writeFileSync(join(dir, 'src', 'new.js'), newFile)
    commit(dir, 'add')
    return dir
  }
  it('复制既有实现：重复率超阈 exit 1，样本块带双定位', () => {
    // 复制块故意加空格/注释差异——规范化后仍应命中
    const copied = Array.from({ length: 10 }, (_, i) => `export function  part${i}() {  return ${i}  + ${i * 2} }`)
    const unique = Array.from({ length: 30 }, (_, i) => `export function fresh${i}(x) { return x * ${i + 7} + ${i} }`)
    const dir = setupDupRepo(`${copied.join('\n')}\n${unique.join('\n')}\n`)
    const r = runCli(DUP, ['--repo', dir, '--base', 'HEAD~1', '--window', '6'])
    expect(r.code).toBe(1)
    expect(r.json.status).toBe('scored')
    expect(r.json.verdict).toBe('fail')
    expect(r.json.ratio).toBeGreaterThan(3)
    expect(r.json.blocks.length).toBeGreaterThan(0)
    expect(r.json.blocks[0].occurrences).toHaveLength(2)
    expect(r.json.duplicateLines).toBeGreaterThan(0)
  })

  it('全新实现：重复率 0% exit 0', () => {
    const unique = Array.from({ length: 40 }, (_, i) => `export function novel${i}(x) { return x ^ ${i + 3} }`)
    const dir = setupDupRepo(`${unique.join('\n')}\n`)
    const r = runCli(DUP, ['--repo', dir, '--base', 'HEAD~1', '--window', '6'])
    expect(r.code).toBe(0)
    expect(r.json.status).toBe('scored')
    expect(r.json.ratio).toBe(0)
    expect(r.json.verdict).toBe('pass')
  })

  it('增量太小：unmeasured 如实不计比率 exit 0', () => {
    const dir = setupDupRepo('export const tiny = 1\nexport const tiny2 = 2\n')
    const r = runCli(DUP, ['--repo', dir, '--base', 'HEAD~1', '--window', '6'])
    expect(r.code).toBe(0)
    expect(r.json.status).toBe('unmeasured')
    expect(r.json.ratio).toBeNull()
  })

  it('--out 落盘与 stdout 同构（overlay /quality 端点消费面）', () => {
    const unique = Array.from({ length: 40 }, (_, i) => `export function out${i}(x) { return x % ${i + 2} }`)
    const dir = setupDupRepo(`${unique.join('\n')}\n`)
    const out = join(dir, 'evidence', 'dup-ratio.json')
    const r = runCli(DUP, ['--repo', dir, '--base', 'HEAD~1', '--window', '6', '--out', out])
    expect(r.code).toBe(0)
    expect(existsSync(out)).toBe(true)
    expect(JSON.parse(readFileSync(out, 'utf-8'))).toEqual(r.json)
  })
})
