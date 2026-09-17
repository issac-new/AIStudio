// IDE Git 控制器守门测试：解析纯函数 + 临时目录真实 git e2e（本机 git 为
// 零外部依赖的本地工具，与 terminal-tools.test.ts 的真实探测同口径）。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import {
  parseGitStatus,
  isSafeRelativeFile,
  type GitStatus,
} from '../git'

describe('parseGitStatus', () => {
  it('parses branch header with ahead/behind and upstream', () => {
    const status = parseGitStatus('/repo', [
      '## feat/x...origin/feat/x [ahead 2, behind 1]',
      ' M packages/a.ts',
      'A  packages/b.ts',
    ].join('\n'))
    expect(status.branch).toBe('feat/x')
    expect(status.upstream).toBe('origin/feat/x')
    expect(status.ahead).toBe(2)
    expect(status.behind).toBe(1)
    expect(status.changes).toHaveLength(2)
  })

  it('classifies untracked/renamed/conflicted/deleted kinds', () => {
    const status = parseGitStatus('/repo', [
      '## main',
      '?? new-file.txt',
      'R  old-name.ts -> new-name.ts',
      'UU both-edited.ts',
      ' D gone.ts',
    ].join('\n'))
    const kinds = Object.fromEntries(status.changes.map((c) => [c.file, c.kind]))
    expect(kinds['new-file.txt']).toBe('untracked')
    expect(kinds['new-name.ts']).toBe('renamed')
    const renamed = status.changes.find((c) => c.file === 'new-name.ts')
    expect(renamed?.renamedFrom).toBe('old-name.ts')
    expect(kinds['both-edited.ts']).toBe('conflicted')
    expect(kinds['gone.ts']).toBe('deleted')
  })

  it('marks detached HEAD', () => {
    const status = parseGitStatus('/repo', '## HEAD (no branch)')
    expect(status.detached).toBe(true)
    expect(status.branch).toBe('HEAD')
  })

  it('unquotes C-style octal paths back to UTF-8 (core.quotepath 默认开启)', () => {
    // "中文.txt" 的 UTF-8 字节：中=E4B8AD 文=E69687 → git 输出 \344\270\255\346\226\207
    const status = parseGitStatus('/repo', [
      '## main',
      '?? "\\344\\270\\255\\346\\226\\207.txt"',
    ].join('\n'))
    expect(status.changes).toHaveLength(1)
    expect(status.changes[0].file).toBe('中文.txt')
  })

  it('unquotes escaped quote/backslash inside quoted path', () => {
    const status = parseGitStatus('/repo', [
      '## main',
      ' M "a\\"b\\\\c\\344\\270\\255.ts"',
    ].join('\n'))
    // \344\270\255 即「中」的 UTF-8 三字节
    expect(status.changes[0].file).toBe('a"b\\c中.ts')
  })

  it('decodes rename source and target both sides', () => {
    const status = parseGitStatus('/repo', [
      '## main',
      'R  "old\\344\\270\\255.ts" -> "new\\346\\226\\207.ts"',
    ].join('\n'))
    expect(status.changes[0].file).toBe('new文.ts')
    expect(status.changes[0].renamedFrom).toBe('old中.ts')
  })
})

describe('isSafeRelativeFile', () => {
  it('accepts plain relative paths', () => {
    expect(isSafeRelativeFile('src/a.ts')).toBe(true)
    expect(isSafeRelativeFile('deep/nested/dir/file.md')).toBe(true)
  })

  it('rejects absolute, traversal, windows-drive and empty', () => {
    expect(isSafeRelativeFile('/etc/passwd')).toBe(false)
    expect(isSafeRelativeFile('../outside.ts')).toBe(false)
    expect(isSafeRelativeFile('a/../../b.ts')).toBe(false)
    expect(isSafeRelativeFile('C:\\repo\\file')).toBe(false)
    expect(isSafeRelativeFile('')).toBe(false)
    expect(isSafeRelativeFile('.')).toBe(false)
  })
})

describe('git e2e (real git in temp dir)', () => {
  function makeRepo(): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'ide-git-'))
    const git = (args: string[]) => execFileSync('git', args, { cwd: dir })
    git(['init', '-b', 'main'])
    git(['config', 'user.email', 'ide@test'])
    git(['config', 'user.name', 'ide-test'])
    writeFileSync(join(dir, 'base.txt'), 'base\n')
    git(['add', 'base.txt'])
    git(['commit', '-m', 'init'])
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
  }

  it('status reflects staged/unstaged/untracked after real operations', () => {
    const repo = makeRepo()
    try {
      writeFileSync(join(repo.dir, 'base.txt'), 'base\nedited\n')
      writeFileSync(join(repo.dir, 'added.txt'), 'new\n')
      mkdirSync(join(repo.dir, 'sub'))
      writeFileSync(join(repo.dir, 'sub', 'u.ts'), 'x\n')
      const git = (args: string[]) => execFileSync('git', args, { cwd: repo.dir })
      git(['add', 'added.txt'])
      // 与控制器同参数（-uall 展开未跟踪目录）
      const out = git(['status', '--porcelain=v1', '-b', '-uall']).toString()
      const status: GitStatus = parseGitStatus(repo.dir, out)
      expect(status.branch).toBe('main')
      const byFile = Object.fromEntries(status.changes.map((c) => [c.file, c]))
      expect(byFile['base.txt'].indexStatus).toBe(' ')
      expect(byFile['base.txt'].worktreeStatus).toBe('M')
      expect(byFile['added.txt'].indexStatus).toBe('A')
      expect(byFile['sub/u.ts'].kind).toBe('untracked')
    } finally {
      repo.cleanup()
    }
  })

  it('non-ASCII filename: status 输出还原为 UTF-8 且还原路径可直接 stage（面板闭环）', () => {
    const repo = makeRepo()
    try {
      const name = '中文文件.txt'
      writeFileSync(join(repo.dir, name), '内容\n')
      const git = (args: string[]) => execFileSync('git', args, { cwd: repo.dir })
      const out = git(['status', '--porcelain=v1', '-b', '-uall']).toString()
      expect(out).toContain('"\\344') // git 默认 quotepath 引用八进制转义
      const status: GitStatus = parseGitStatus(repo.dir, out)
      const decoded = status.changes.find((c) => c.file === name)
      expect(decoded?.kind).toBe('untracked')
      // 面板 stage 即用还原路径回传 git：还原错误时这里 pathspec 失配抛错
      git(['add', '--', name])
      const out2 = git(['status', '--porcelain=v1', '-b', '-uall']).toString()
      expect(parseGitStatus(repo.dir, out2).changes[0].indexStatus).toBe('A')
    } finally {
      repo.cleanup()
    }
  })
})
