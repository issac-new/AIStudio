// rsi-lifecycle 审计器不变量（2026-11-20 综述吸收轮 A）：
// 矩阵结构完整性＋格态纪律＋汇总一致性＋锚点存在性抽查。
import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  buildRsiClaimLevelMap, buildRsiLifecycleReport, RSI_CLAIM_LEVELS, RSI_LIFECYCLE_LOOPS, RSI_LIFECYCLE_STAGES, RSI_TRUST_REQUIREMENTS,
} from '../rsi-lifecycle'

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

describe('rsi-claim-level 主张层级证据图不变量（2026-11-26 可信 RSI 正文级轮）', () => {
  const map = buildRsiClaimLevelMap()
  const report = buildRsiLifecycleReport()

  it('八组要求 × 更新、后继、元改进三层，每格恰好一条', () => {
    expect(map.cells).toHaveLength(RSI_TRUST_REQUIREMENTS.length * RSI_CLAIM_LEVELS.length)
    const keys = new Set(map.cells.map((c) => `${c.requirement}:${c.level}`))
    expect(keys.size).toBe(map.cells.length)
    for (const requirement of RSI_TRUST_REQUIREMENTS) {
      for (const level of RSI_CLAIM_LEVELS) expect(keys.has(`${requirement.key}:${level}`)).toBe(true)
    }
    expect(report.claimLevels).toEqual(map)
  })

  it('格态枚举合法；已评估与部分格子的锚点指向真实路径；汇总计数一致', () => {
    let examined = 0
    let partial = 0
    let notEvaluated = 0
    for (const cell of map.cells) {
      if (cell.status === 'examined') examined += 1
      else if (cell.status === 'partial') partial += 1
      else if (cell.status === 'not_evaluated') notEvaluated += 1
      else throw new Error(`非法格态：${cell.status}`)
      if (cell.status === 'not_evaluated') {
        expect(cell.note.length).toBeGreaterThan(0)
        if (cell.anchor) expect(existsSync(join(repoRoot, cell.anchor)), `anchor missing: ${cell.anchor}`).toBe(true)
      } else {
        expect(cell.anchor.length).toBeGreaterThan(0)
        expect(existsSync(join(repoRoot, cell.anchor)), `anchor missing: ${cell.anchor}`).toBe(true)
        expect(cell.note.length).toBeGreaterThan(0)
      }
    }
    expect(map.summary).toEqual({ examined, partial, not_evaluated: notEvaluated })
    expect(examined + partial + notEvaluated).toBe(map.cells.length)
  })

  it('元改进层的有效性、行为、公平、安全、隐私五格如实标未评估（递归深度锁 1）；透明、控制、问责三格有机制', () => {
    const meta = Object.fromEntries(map.cells.filter((c) => c.level === 'meta').map((c) => [c.requirement, c.status]))
    expect(meta).toEqual({
      validity: 'not_evaluated',
      behavioral: 'not_evaluated',
      fairness: 'not_evaluated',
      security: 'not_evaluated',
      privacy: 'not_evaluated',
      transparency: 'examined',
      control: 'examined',
      accountability: 'examined',
    })
  })

  it('公平与隐私在更新层和后继层都没有评估——未评估是显式结论，不是缺格', () => {
    for (const level of ['update', 'successor'] as const) {
      expect(map.cells.find((c) => c.level === level && c.requirement === 'fairness')!.status).toBe('not_evaluated')
      expect(map.cells.find((c) => c.level === level && c.requirement === 'privacy')!.status).toBe('not_evaluated')
    }
    expect(map.boundary).toContain('声明式盘点')
  })
})
