// 回归（2026-10-14 24h 风险审查轮）：symlink 逃逸判定必须带路径分隔符——
// 兄弟目录名前缀（skills/foo 的链接指向 skills/foo-bar）不能被裸 startsWith
// 判成界内；旧实现会把这条 high 级逃逸从 verdict 里消掉。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanSkillDir } from '../skill-scan'

describe('skill-scan symlink 前缀逃逸', () => {
  it('链接指向兄弟前缀目录（foo → foo-bar）必须报 symlink-escape', () => {
    const base = mkdtempSync(join(tmpdir(), 'sgp-'))
    try {
      const root = join(base, 'skills')
      const dir = join(root, 'foo')
      mkdirSync(dir, { recursive: true })
      mkdirSync(join(root, 'foo-bar'), { recursive: true })
      writeFileSync(join(root, 'foo-bar', 'secret.md'), '# outside\n')
      symlinkSync(join(root, 'foo-bar'), join(dir, 'link-out'))
      const r = scanSkillDir(dir)
      expect(r.findings.some((f) => f.rule === 'symlink-escape')).toBe(true)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
