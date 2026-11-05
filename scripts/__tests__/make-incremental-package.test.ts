// 守门:增量补丁包打包器纯函数——name-status 解析/统计聚合/版本清洗/参数计划。
// spec: docs/superpowers/specs/2026-11-05-release-v1.0.12-overlay.md（D3 增量补丁通道）
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseNameStatus, summarize, cleanVersion, planFromArgv } from '../make-incremental-package.mjs'

const overlayRoot = process.cwd()

describe('parseNameStatus（git diff --name-status -z 解析）', () => {
  it('普通状态两段一组，NUL 分隔', () => {
    const entries = parseNameStatus('M\0custom/a.ts\0A\0custom/b.ts\0D\0custom/c.ts\0')
    expect(entries).toEqual([
      { status: 'M', newPath: 'custom/a.ts' },
      { status: 'A', newPath: 'custom/b.ts' },
      { status: 'D', newPath: 'custom/c.ts' },
    ])
  })
  it('改名/拷贝三段一组（R100/C75 old new），不与普通组错位', () => {
    const entries = parseNameStatus('R100\0old/x.ts\0new/x.ts\0M\0z.ts\0')
    expect(entries).toEqual([
      { status: 'R100', oldPath: 'old/x.ts', newPath: 'new/x.ts' },
      { status: 'M', newPath: 'z.ts' },
    ])
  })
  it('空输入返回空数组（不产幽灵条目）', () => {
    expect(parseNameStatus('')).toEqual([])
    expect(parseNameStatus('\0\0')).toEqual([])
  })
})

describe('summarize（四桶统计）', () => {
  it('A/M/D/R 各归其桶，改名计 renamed 不重复计 deleted', () => {
    const s = summarize([
      { status: 'A', newPath: 'a' },
      { status: 'M', newPath: 'b' },
      { status: 'D', newPath: 'c' },
      { status: 'R100', oldPath: 'd', newPath: 'e' },
      { status: 'T', newPath: 'f' }, // 罕见态并入 modified，不静默丢
    ])
    expect(s).toEqual({ added: 1, modified: 2, deleted: 1, renamed: 1 })
  })
})

describe('cleanVersion（资产名版本清洗）', () => {
  it('tag 去 v 前缀；纯版本串不动', () => {
    expect(cleanVersion('v1.0.10-overlay')).toBe('1.0.10-overlay')
    expect(cleanVersion('1.0.12-overlay')).toBe('1.0.12-overlay')
    expect(cleanVersion('HEAD')).toBe('HEAD')
  })
})

describe('planFromArgv（参数计划）', () => {
  it('base 必填，head 缺省 HEAD，dry-run/out 可选', () => {
    expect(planFromArgv(['v1.0.10-overlay'])).toMatchObject({ base: 'v1.0.10-overlay', head: 'HEAD', dryRun: false })
    expect(planFromArgv(['v1.0.10-overlay', '--head', 'v1.0.11-overlay', '--dry-run'])).toMatchObject({ head: 'v1.0.11-overlay', dryRun: true })
    expect(planFromArgv(['--dry-run'])).toBeNull() // 缺 base
    expect(planFromArgv(['a', 'b'])).toBeNull() // 多于一个位置参数
    expect(planFromArgv([])).toBeNull()
  })
})

describe('仓库实况集成（dry-run，全量 tag 在位时）', () => {
  it('v1.0.10 基线 dry-run 报告真实变更规模（vendor 换血窗口 >4000 项）', () => {
    const tag = 'v1.0.10-overlay'
    let tagOk = false
    try { execFileSync('git', ['rev-parse', '--verify', `${tag}^{commit}`], { cwd: overlayRoot }); tagOk = true } catch { tagOk = false }
    if (!tagOk) return // 浅克隆/缺 tag 环境跳过——纯函数面已覆盖
    const r = execFileSync('node', [resolve(overlayRoot, 'scripts/make-incremental-package.mjs'), tag, '--dry-run'], { encoding: 'utf8' })
    expect(r).toContain('变更')
    const m = /变更 (\d+) 项/.exec(r)
    expect(Number(m?.[1])).toBeGreaterThan(4000)
    expect(r).toContain('aistudio-incremental-1.0.10-to-HEAD-overlay.patch.gz')
  })
})
