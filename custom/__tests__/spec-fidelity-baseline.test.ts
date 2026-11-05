// spec 保真度四维基线棘轮（只许减）——2026-11-05 AI Native 吸收批 T1。
// 范式与 l2-kit-parity.test.ts 的四段/任务卡基线段同源：
//  ① 基线内条目必须仍然不达标（达标即删，禁永久豁免墙）；
//  ② 相对 main 不得新增基线条目（棘轮只许减）；
//  ③ 基线条目不得指向不存在的 spec；
//  ④ 基线必须精确覆盖当前仍违规的存量 spec（新违规不清理=门在无人处置的状态下反复 warn）。
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const BASELINE = resolve(ROOT, '.swarm-yuan/spec-fidelity-baseline.txt')
const KIT_LIB = resolve(ROOT, '.swarm-yuan/hooks/spec-first-lib.sh')
const SPECS_DIR = resolve(ROOT, 'docs/superpowers/specs')

function baselineEntries(): string[] {
  if (!existsSync(BASELINE)) return []
  return readFileSync(BASELINE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

/** 批量跑 spf_spec_fidelity_check，返回仍违规（=应留在基线）的仓库相对路径。 */
function fidelityViolating(relFiles: string[]): string[] {
  if (relFiles.length === 0) return []
  const script = `
set -uo pipefail
lib="$1"; root="$2"; shift 2
. "$lib"
for f in "$@"; do
  v=$(spf_spec_fidelity_check "$root" < "$root/$f")
  [ -n "$v" ] && printf '%s\\n' "$f"
done
`
  const out = execFileSync('bash', ['-c', script, 'bash', KIT_LIB, ROOT, ...relFiles], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return out.split('\n').filter(Boolean)
}

/** specs 根目录直接 Markdown（与 A.1 同口径：不递归 archive/assets）。 */
function rootSpecs(): string[] {
  return readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/superpowers/specs/${f}`)
}

describe('spec 保真度四维基线棘轮（只许减；2026-11-05 AI Native T1）', () => {
  const entries = baselineEntries()

  it('基线必须存在且非空（存量豁免面显式落盘，新 spec 不进基线=被机检）', () => {
    expect(entries.length, '保真度基线缺席或为空——存量豁免必须显式落盘').toBeGreaterThan(0)
  })

  it('基线内条目必须仍然不达标（达标后须删条目，禁永久豁免墙）', () => {
    const existing = entries.filter((p) => existsSync(resolve(ROOT, p)))
    const stillViolating = new Set(fidelityViolating(existing))
    const nowCompliant = existing.filter((p) => !stillViolating.has(p))
    expect(
      nowCompliant,
      `以下 spec 已四维达标，须从 .swarm-yuan/spec-fidelity-baseline.txt 删除：\n${nowCompliant.join('\n')}`,
    ).toEqual([])
  })

  it('基线必须精确覆盖当前仍违规的存量 spec（无漏网违规，基线无僵尸外溢由上一条保证）', () => {
    const violating = new Set(fidelityViolating(rootSpecs()))
    const unlisted = [...violating].filter((p) => !entries.includes(p))
    expect(
      unlisted,
      `以下 spec 当前违规但不在基线——要么修复达标，要么显式入基线（禁无人处置的 warn 常亮）：\n${unlisted.join('\n')}`,
    ).toEqual([])
  })

  it('相对 main 不得新增基线条目', () => {
    let mainBaseline: string[] = []
    try {
      const raw = execFileSync('git', ['show', 'main:.swarm-yuan/spec-fidelity-baseline.txt'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      mainBaseline = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    } catch {
      return // main 尚无基线（本批首次建立）——棘轮自下批起生效
    }
    const added = entries.filter((p) => !mainBaseline.includes(p))
    expect(added, `相对 main 新增了豁免条目（棘轮只许减）：\n${added.join('\n')}`).toEqual([])
  })

  it('基线条目不得指向不存在的 spec', () => {
    const missing = entries.filter((p) => !existsSync(resolve(ROOT, p)))
    expect(missing, `基线里有过期路径（spec 已删/改名，须同步清理）：\n${missing.join('\n')}`).toEqual([])
  })
})

describe('spf_spec_fidelity_check 四维判据（单元）', () => {
  /** 迷你仓：不落盘 JSON 时用内嵌兜底表，与线上 node 路径分开验证 awk 判据。 */
  const run = (body: string): string => {
    const script = `
set -uo pipefail
. "$1"
printf '%s' "$2" | spf_spec_fidelity_check "$PWD"
`
    return execFileSync('bash', ['-c', script, 'bash', KIT_LIB, body], {
      cwd: ROOT,
      encoding: 'utf8',
    })
  }

  it('模糊词命中（正文裸词），围栏与行内 code 不算', () => {
    expect(run('# T\n\n## 变更\n系统性能良好\n\n## 决策记录\n- D-1 采用 A\n\n## 验证\nx\n')).toMatch(/^fuzzy:1/)
    const fenced = '# T\n\n## 变更\n- 验收：`npm test` 全绿\n```\n性能良好\n```\n行内 `快速` 引用\n\n## 决策记录\n- D-1 采用 A\n\n## 验证\nx\n'
    expect(run(fenced)).toBe('')
  })

  it('决策记录零决策行 / 表头与分隔行不算决策', () => {
    expect(run('# T\n\n## 变更\n验收：x\n\n## 决策记录\n| 编号 | 决策 |\n|---|---|\n\n## 验证\nx\n')).toContain('decisions:0')
  })

  it('变更段无可验证验收（GWT/当…那么/验收 关键词全缺）', () => {
    expect(run('# T\n\n## 变更\n- 新增模块 X\n\n## 决策记录\n- D-1 采用 A\n\n## 验证\nx\n')).toContain('acceptance:0')
  })

  it('TBD/待定占位命中', () => {
    expect(run('# T\n\n## 变更\n验收：x\n\n## 决策记录\n- D-1 待定\n\n## 验证\nx\n')).toMatch(/tbd:1/)
  })

  it('GWT 骨架与合格表格决策均通过', () => {
    const ok = '# T\n\n## 变更\n- GIVEN 重复请求 WHEN 同 key THEN 返回首次结果\n\n## 决策记录\n| D-1 | 采用幂等 token | 文章判据 |\n\n## 验证\nvitest\n'
    expect(run(ok)).toBe('')
  })
})
