// governance-rsi-walkthrough 探针纯函数层的用例（2026-11-26 可信 RSI 后续批）。
// 主探针 governance-rsi-walkthrough.mjs 负责编排；本文件只锁纯函数：
// 台账退出码、WCAG 对比度、种入数据的自洽性四件。
import { describe, expect, it } from 'vitest'
import { checkAppliedFiles, checkChampion, checkSingleFileSeed, checkTreeSeed, contrastRatio, summarize } from './governance-rsi-walkthrough-lib.mjs'

describe('走查台账退出码', () => {
  it('全部通过 → 退出 0；任一失败 → 退出 1', () => {
    expect(summarize('s', [{ name: 'a', ok: true }, { name: 'b', ok: true }])).toEqual({ passed: 2, failed: 0, skipped: 0, exitCode: 0 })
    expect(summarize('s', [{ name: 'a', ok: true }, { name: 'b', ok: false, note: 'x' }])).toMatchObject({ failed: 1, exitCode: 1 })
  })

  it('skip 是环境条件项：如实出现在台账里但不计入失败', () => {
    const r = summarize('s', [{ name: 'a', ok: false, skip: true, note: '环境条件' }, { name: 'b', ok: true }])
    expect(r).toEqual({ passed: 1, failed: 0, skipped: 1, exitCode: 0 })
  })

  it('空台账按失败计（走查一条没跑不是通过）', () => {
    expect(summarize('s', []).exitCode).toBe(1)
  })
})

describe('WCAG 对比度', () => {
  it('黑对白 21:1；同色 1:1', () => {
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(21, 0)
    expect(contrastRatio('rgb(26, 26, 26)', 'rgb(26, 26, 26)')).toBeCloseTo(1, 5)
  })

  it('真实主题变量：暗色 success(102,182,106) 对暗色底(26,26,26) 与亮色 success(46,125,50) 对亮色底(250,250,250) 都要过 4.5', () => {
    // 变量值锚：vendor/hermes-studio/packages/client/src/styles/variables.scss（暗 :92/:124、亮 :13/:52）
    expect(contrastRatio('rgb(102, 182, 106)', 'rgb(26, 26, 26)')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('rgb(46, 125, 50)', 'rgb(250, 250, 250)')).toBeGreaterThanOrEqual(4.5)
  })

  it('亮度接近的组合判不过；无法解析的输入返回 null（调用方按失败计）', () => {
    expect(contrastRatio('rgb(120, 120, 120)', 'rgb(140, 140, 140)')).toBeLessThan(4.5)
    expect(contrastRatio('not-a-color', 'rgb(0,0,0)')).toBeNull()
    expect(contrastRatio('rgba(0, 0, 0, 0.3)', 'rgb(255, 255, 255)')).toBeLessThan(4.5)
  })
})

describe('种入数据的自洽性', () => {
  it('单文件种子：摘要与内容对应；内容与基线相同则拒绝（演练无从观察）', () => {
    const good = checkSingleFileSeed({ proposalId: 'hw-1', oldContent: 'old', newContent: 'new', promotionDigest: seedSha('new'), baseDigest: seedSha('old') })
    expect(good).toEqual([])
    expect(checkSingleFileSeed({ proposalId: 'hw-1', oldContent: 'old', newContent: 'new', promotionDigest: 'wrong', baseDigest: seedSha('old') })[0]).toContain('冠军摘要')
    const same = checkSingleFileSeed({ proposalId: 'hw-1', oldContent: 'same', newContent: 'same', promotionDigest: seedSha('same'), baseDigest: seedSha('same') })
    expect(same[0]).toContain('写盘演练无从观察')
  })

  it('多文件种子：逐文件内容摘要对应；树摘要按「路径:摘要」排序拼接', () => {
    const files = [
      { path: 'profiles/p1/SOUL.md', content: 'soul-new', digest: seedSha('soul-new') },
      { path: 'skills/s1/SKILL.md', content: 'skill-new', digest: seedSha('skill-new') },
    ]
    const rows = files.map((f) => `${f.path}:${f.digest}`).sort().join('\n')
    expect(checkTreeSeed({ proposalId: 'hw-tree', files, promotionDigest: treeSha(rows) })).toEqual([])
    expect(checkTreeSeed({ proposalId: 'hw-tree', files, promotionDigest: 'wrong' })[0]).toContain('树摘要')
    const badFile = [{ path: 'profiles/p1/SOUL.md', content: 'soul-new', digest: seedSha('other') }]
    expect(checkTreeSeed({ proposalId: 'hw-tree', files: badFile, promotionDigest: 'x' })[0]).toContain('摘要与内容不符')
  })

  it('已写盘冠军：磁盘与晋级内容一致才过；冠军摘要按单文件或多文件各自口径核对', () => {
    const files = [{ path: 'profiles/p1/SOUL.md', nextContent: 'new persona', oldContent: 'old persona', existed: true }]
    const disk = { 'profiles/p1/SOUL.md': 'new persona' }
    const champ = { proposalId: 'hw-1', digest: seedSha('new persona'), targetPath: 'profiles/p1/SOUL.md', backupPath: '/tmp/x.bak', applied: true }
    expect(checkAppliedFiles({ diskContents: disk, files, proposalId: 'hw-1' })).toEqual([])
    expect(checkChampion({ champion: champ, files })).toEqual([])
    const drifted = checkAppliedFiles({ diskContents: { 'profiles/p1/SOUL.md': 'drifted' }, files, proposalId: 'hw-1' })
    expect(drifted[0]).toContain('写盘未生效或被改动')
    expect(checkChampion({ champion: { ...champ, applied: false }, files })[0]).toContain('已写盘')
    expect(checkChampion({ champion: { ...champ, digest: 'wrong' }, files })[0]).toContain('冠军摘要与种子内容不对应')
  })
})

// ---------------------------------------------------------------------------
// 供断言用的 sha 口径——与 loop-core.ts 的 sha256/treeDigest 同源（种子构造方也用它）。
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto'
function seedSha(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
function treeSha(rows: string): string {
  return createHash('sha256').update(rows).digest('hex')
}
