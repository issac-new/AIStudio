// rsi-lifecycle 审计器不变量（2026-11-20 综述吸收轮 A）：
// 矩阵结构完整性＋格态纪律＋汇总一致性＋锚点存在性抽查。
import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { buildRsiLifecycleReport, RSI_LIFECYCLE_LOOPS, RSI_LIFECYCLE_STAGES } from '../rsi-lifecycle'

const repoRoot = join(__dirname, '../../../..')

describe('rsi-lifecycle 矩阵不变量', () => {
  const report = buildRsiLifecycleReport()

  it('五条环路×七阶段全覆盖，无缺格无多余', () => {
    expect(RSI_LIFECYCLE_LOOPS).toHaveLength(5)
    for (const loop of report.loops) {
      expect(loop.cells.map((c) => c.stage)).toEqual([...RSI_LIFECYCLE_STAGES])
    }
  })

  it('格态枚举合法；implemented/partial 必带锚点与注记；nr 锚点留空', () => {
    for (const loop of report.loops) {
      for (const cell of loop.cells) {
        expect(['implemented', 'partial', 'nr']).toContain(cell.status)
        if (cell.status === 'nr') {
          expect(cell.anchor).toBe('')
        } else {
          expect(cell.anchor.length).toBeGreaterThan(0)
          expect(cell.note.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('note 定性三分：真缺口/允许省略/在途（nr 格必须显式说明是否允许省略）', () => {
    for (const loop of report.loops) {
      for (const cell of loop.cells) {
        if (cell.status === 'nr') {
          expect(cell.note).toMatch(/允许省略|非缺口/)
        }
      }
    }
  })

  it('汇总计数与格态一致；gapLines 仅出自 partial/nr', () => {
    const cells = report.loops.flatMap((l) => l.cells)
    expect(report.summary.total).toBe(cells.length)
    expect(report.summary.implemented).toBe(cells.filter((c) => c.status === 'implemented').length)
    expect(report.summary.partial).toBe(cells.filter((c) => c.status === 'partial').length)
    expect(report.summary.nr).toBe(cells.filter((c) => c.status === 'nr').length)
    expect(report.gapLines.every((g) => g.status !== 'implemented')).toBe(true)
    expect(report.gapLines).toHaveLength(report.summary.partial + report.summary.nr)
  })

  it('综述实证同构：Memory 侧环路（qgate-fail-exp）Verify 为 partial——ReasoningBank 同款缺口在案', () => {
    const loop = report.loops.find((l) => l.key === 'qgate-fail-exp')
    expect(loop).toBeDefined()
    expect(loop!.cells.find((c) => c.stage === 'Verify')!.status).toBe('partial')
  })

  it('锚点存在性抽查：仓库相对路径锚指向真实文件（抽样五条，防矩阵漂移到悬空锚）', () => {
    const anchors = [
      'custom/server/expcandidates/qgate-ingest.ts',
      'custom/server/harness/workbench/loop-report.ts',
      'skills/swarm-yuan/scripts/project-fingerprint.sh',
      'team/shared/skill-lifecycle.py',
      'scripts/recurrence-report.mjs',
    ]
    for (const a of anchors) {
      expect(existsSync(join(repoRoot, a)), `anchor missing: ${a}`).toBe(true)
    }
  })

  it('meta 携带论文口径与边界声明（fail-soft 纪律：声明式矩阵非运行时探测）', () => {
    expect(report.meta.criteria).toContain('NR')
    expect(report.meta.boundary).toContain('rsi-maturity')
  })
})
