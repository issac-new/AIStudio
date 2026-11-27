// 吸收总账守门（规格 2026-11-27-absorption-regime-unify §2，仓规第 15 条）：
// 五条断言 A 到 E 读真实的总账与规格目录；解析与判定写成纯函数，边角用例用内联文本喂。
// 本测只读，不改任何文件。总账路径与列名的单一事实源是 team/shared/research/absorption-ledger.md 的抬头。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const LEDGER = 'team/shared/research/absorption-ledger.md'
const SPECS = 'docs/superpowers/specs'
/** 文件名可识别的吸收规格，从这个日期起必须入账（回填起点） */
const SINCE_NAME = '2026-10-24'
/** 从这个日期起，规格抬头声明的「吸收总账：编号」必须与总账互相指向 */
const SINCE_DECL = '2026-11-28'
const NAME_RE = /^(\d{4}-\d{2}-\d{2})-.*(absorption|absorb|research|survey)[^/]*\.md$/
/** 历史规格没写的事实、没有外来材料可裁的轮次，各列允许这两个字面量 */
const LITERAL = new Set(['未声明', '不适用'])
const DEPTH = new Set(['源码级', '全文级', '摘要级'])
const VERDICT = new Set(['吸收', '收缩吸收', '等效印证', '记档待定', '不吸收'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Row = Record<string, string>

// 剥掉单元格首尾的反引号：总账里的路径与编号都写在反引号里。
const cell = (raw: string | undefined): string => (raw ?? '').trim().replace(/^`|`$/g, '').trim()

// 取「## <title>」节的 Markdown 表：首行是表头，次行是分隔行，其余是数据。
export function parseTable(md: string, title: string): Row[] {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`))
  if (start < 0) return []
  const grid: string[][] = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break
    if (!line.startsWith('|')) continue
    grid.push(line.split('|').slice(1, -1).map(cell))
  }
  if (grid.length < 2) return []
  const head = grid[0] ?? []
  return grid.slice(2).map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])))
}

// 规格抬头里「吸收总账：」后面的记号。只认三种：轮次编号（L 加三位数字）、待定编号（P 加三位数字）、
// 以「不适用」开头；全角半角冒号都收，后面的句号与括号说明不截走。没写或写得不合格式都返回 null。
export function declaredId(head: string): string | null {
  const m = /吸收总账[：:]\s*`?(L\d{3}|P\d{3}|不适用)/.exec(head)
  return m?.[1] ?? null
}

// 规格抬头是否写明「不适用」（本规格不是吸收轮，或没有外来材料）。
export function declaredNotApplicable(head: string): boolean {
  const id = declaredId(head)
  return !!id && id.startsWith('不适用')
}

// 「规格声明了编号，总账必须认这个账」：返回毛病描述；没有毛病返回 null。
// 声明的编号要在表一，且那一行的来源档必须就是这份规格。
export function brokenDeclaration(declared: string | null, specDoc: string, rounds: Row[]): string | null {
  if (!declared || declared.startsWith('不适用')) return null
  const row = rounds.find((r) => r['编号'] === declared)
  if (!row) return `声明的 ${declared} 不在表一`
  const doc = row['来源档'] ?? ''
  if (LITERAL.has(doc) || !doc) return `声明的 ${declared} 那一行没有来源档`
  return doc === specDoc ? null : `声明的 ${declared} 指向 ${doc}，不是本规格`
}

// 表二的「提出处」是不是一个真实存在的地方：轮次编号、仓内路径，或只写了规格文件名。
export function missingOrigin(from: string, pathExists: (p: string) => boolean): boolean {
  return !pathExists(from) && !pathExists(join(SPECS, from))
}

// 来源档这一格要不要做存在性检查：空格与两个字面量都不查。
export function needsDocCheck(doc: string): boolean {
  return !!doc && !LITERAL.has(doc)
}

// 规格目录直接子文件里，日期达标且文件名含关键词的 Markdown。
export function matchingSpecs(names: string[], since: string): string[] {
  return names.filter((name) => {
    const m = NAME_RE.exec(name)
    return !!m && (m[1] ?? '') >= since
  })
}

// 表二一行的毛病；没有毛病返回 null。
export function badDeferRow(row: Row, roundIds: Set<string>, pathExists: (p: string) => boolean): string | null {
  const from = row['提出处'] ?? ''
  if (!from || !DATE_RE.test(row['回看日'] ?? '')) return '缺提出处或回看日'
  if (/^L\d{3}$/.test(from)) return roundIds.has(from) ? null : `轮次 ${from} 不在表一`
  return missingOrigin(from, pathExists) ? `提出处 ${from} 不是轮次编号，也不是存在的文件` : null
}

// 取值词表检查；kind 区分表一与表二。
export function vocabError(row: Row, kind: 'round' | 'defer'): string | null {
  if (kind === 'defer') return VERDICT.has(row['处置'] ?? '') ? null : `处置取值越界：${row['处置']}`
  const depth = row['深度'] ?? ''
  const five = row['裁决计数'] ?? ''
  const three = row['成色计数'] ?? ''
  const behavior = row['默认行为变更'] ?? ''
  if (!DEPTH.has(depth) && !LITERAL.has(depth)) return `深度取值越界：${depth}`
  if (!/^\d+(\/\d+){4}$/.test(five) && !LITERAL.has(five)) return `裁决计数格式错：${five}`
  if (!/^\d+(\/\d+){2}$/.test(three) && !LITERAL.has(three)) return `成色计数格式错：${three}`
  if (!['有', '无'].includes(behavior) && !LITERAL.has(behavior)) return `默认行为变更取值越界：${behavior}`
  return null
}

const ledger = (): string => readFileSync(join(ROOT, LEDGER), 'utf8')
const specNames = (): string[] =>
  readdirSync(join(ROOT, SPECS), { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name)
// 抬头取前 15 行：状态、来源与「吸收总账：」声明都写在这里。
const headOf = (name: string): string => readFileSync(join(ROOT, SPECS, name), 'utf8').split('\n').slice(0, 15).join('\n')

describe('吸收总账', () => {
  it('A 来源档真实', () => {
    for (const row of parseTable(ledger(), '一、轮次')) {
      const doc = row['来源档'] ?? ''
      if (!needsDocCheck(doc)) continue
      expect(existsSync(join(ROOT, doc)), `${row['编号']} 的来源档不存在：${doc}`).toBe(true)
    }
  })

  it('B 文件名可识别的吸收规格全部入账', () => {
    const referenced = new Set(
      parseTable(ledger(), '一、轮次')
        .map((r) => r['来源档'] ?? '')
        .filter((d) => !LITERAL.has(d))
        .map((d) => d.split('/').pop()),
    )
    for (const name of matchingSpecs(specNames(), SINCE_NAME)) {
      expect(
        referenced.has(name) || declaredNotApplicable(headOf(name)),
        `${name} 没有入账，抬头也没写不适用`,
      ).toBe(true)
    }
  })

  it('C 新规格声明的行不悬空', () => {
    const rounds = parseTable(ledger(), '一、轮次')
    for (const name of specNames().filter((n) => n.slice(0, 10) >= SINCE_DECL)) {
      const problem = brokenDeclaration(declaredId(headOf(name)), `${SPECS}/${name}`, rounds)
      expect(problem, name).toBeNull()
    }
  })

  it('D 待定行字段齐', () => {
    const roundIds = new Set(parseTable(ledger(), '一、轮次').map((r) => r['编号'] ?? ''))
    for (const row of parseTable(ledger(), '二、记档待定')) {
      expect(badDeferRow(row, roundIds, (p) => existsSync(join(ROOT, p))), row['编号']).toBeNull()
    }
  })

  it('E 用词不漂移', () => {
    const md = ledger()
    for (const row of parseTable(md, '一、轮次')) expect(vocabError(row, 'round'), row['编号']).toBeNull()
    for (const row of parseTable(md, '二、记档待定')) expect(vocabError(row, 'defer'), row['编号']).toBeNull()
  })
})

describe('总账解析与判定（边角用例）', () => {
  const md = [
    '## 一、轮次',
    '',
    '| 编号 | 来源档 |',
    '|---|---|',
    '| L001 | `docs/a.md` |',
    '| L002 | 未声明 |',
    '',
    '## 二、记档待定',
    '',
    '| 编号 | 提出处 | 事项 | 回看日 | 处置 |',
    '|---|---|---|---|---|',
    '| P001 | L001 | 甲 | 2027-01-01 | 记档待定 |',
    '',
  ].join('\n')

  it('单元格里的路径剥掉反引号，字面量原样保留', () => {
    const rounds = parseTable(md, '一、轮次')
    expect(rounds[0]?.['来源档']).toBe('docs/a.md')
    expect(rounds[1]?.['来源档']).toBe('未声明')
  })

  it('来源档为空或两个字面量时不做存在性检查，其余都要查', () => {
    expect(needsDocCheck('')).toBe(false)
    expect(needsDocCheck('未声明')).toBe(false)
    expect(needsDocCheck('不适用')).toBe(false)
    expect(needsDocCheck('docs/a.md')).toBe(true)
  })

  it('抬头声明：全角半角冒号都收，后面的句号与括号说明不截走', () => {
    expect(declaredId('> 吸收总账：L023。')).toBe('L023')
    expect(declaredId('> 吸收总账：L023（接 L007）')).toBe('L023')
    expect(declaredId('> 吸收总账: `L023`')).toBe('L023')
    expect(declaredId('> 吸收总账：P004')).toBe('P004')
    expect(declaredId('> 吸收总账：不适用（治理整顿）')).toBe('不适用')
    expect(declaredNotApplicable('> 吸收总账：不适用（治理整顿，无外来材料）')).toBe(true)
    expect(declaredNotApplicable('> 吸收总账：L023')).toBe(false)
  })

  it('抬头声明：不合格式的记号不认，免得把别处的文字当成编号', () => {
    expect(declaredId('> 状态：已实施')).toBeNull()
    expect(declaredId('> 吸收总账：待定')).toBeNull()
    expect(declaredId('> 吸收总账：L23')).toBeNull()
    expect(declaredId('> 吸收总账：l023')).toBeNull()
    expect(declaredId('')).toBeNull()
  })

  it('互相指向：编号不在表一、来源档指向别的规格、来源档是字面量，都判为毛病', () => {
    const rounds = parseTable(md, '一、轮次')
    expect(brokenDeclaration('L001', 'docs/a.md', rounds)).toBeNull()
    expect(brokenDeclaration('L001', `${SPECS}/2026-12-01-other-research.md`, rounds)).toContain('不是本规格')
    expect(brokenDeclaration('L009', 'docs/a.md', rounds)).toContain('不在表一')
    expect(brokenDeclaration('L002', 'docs/a.md', rounds)).toContain('没有来源档')
    expect(brokenDeclaration(null, 'docs/a.md', rounds)).toBeNull()
    expect(brokenDeclaration('不适用（治理整顿）', 'docs/a.md', rounds)).toBeNull()
  })

  it('提出处写成 l001 或 L1 判红，不在表一的编号判红，存在的文件路径放行', () => {
    const ids = new Set(['L001'])
    const never = (): boolean => false
    expect(badDeferRow({ 提出处: 'l001', 回看日: '2027-01-01' }, ids, never)).toContain('不是轮次编号')
    expect(badDeferRow({ 提出处: 'L1', 回看日: '2027-01-01' }, ids, never)).toContain('不是轮次编号')
    expect(badDeferRow({ 提出处: 'L009', 回看日: '2027-01-01' }, ids, never)).toContain('不在表一')
    expect(badDeferRow({ 提出处: 'docs/x.md', 回看日: '2027-01-01' }, ids, () => true)).toBeNull()
    expect(badDeferRow({ 提出处: 'L001', 回看日: '2027/01/01' }, ids, never)).toBe('缺提出处或回看日')
  })

  it('提出处只写规格文件名时，回退到规格目录去找', () => {
    const never = (): boolean => false
    const onlySpecDir = (p: string): boolean => p === `${SPECS}/2026-11-27-absorption-regime-unify.md`
    expect(missingOrigin('2026-11-27-absorption-regime-unify.md', onlySpecDir)).toBe(false)
    expect(missingOrigin('2026-11-27-absorption-regime-unify.md', never)).toBe(true)
    expect(missingOrigin('docs/superpowers/specs/2026-11-27-absorption-regime-unify.md', onlySpecDir)).toBe(false)
  })

  it('只认直接子文件里日期达标的 Markdown；含关键词但不是文件、或不是 .md 的都不算', () => {
    const names = [
      '2026-11-20-foo-research',
      '2026-11-20-bar-research.md',
      '2026-11-20-baz-absorb.txt',
      '2026-09-01-x-absorption.md',
      '2026-11-20-plain.md',
    ]
    expect(matchingSpecs(names, SINCE_NAME)).toEqual(['2026-11-20-bar-research.md'])
  })

  it('未声明与不适用放行，词表外的写法判红', () => {
    const base: Row = { 深度: '源码级', 裁决计数: '1/0/2/0/3', 成色计数: '2/1/0', 默认行为变更: '有' }
    expect(vocabError({ ...base, 深度: '未声明', 裁决计数: '不适用' }, 'round')).toBeNull()
    expect(vocabError({ ...base, 深度: '读了一部分' }, 'round')).toContain('深度')
    expect(vocabError({ ...base, 裁决计数: '3/2' }, 'round')).toContain('裁决计数')
    expect(vocabError({ ...base, 默认行为变更: '也许' }, 'round')).toContain('默认行为变更')
    expect(vocabError({ 处置: '再议' }, 'defer')).toContain('处置')
  })
})
