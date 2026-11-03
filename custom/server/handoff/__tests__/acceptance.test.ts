// 确定性验收断言测试：语法解析、逐条判定、不可判定不放行、探针路径守卫。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkAcceptance, looksLikePassingTestSummary, parseCriterion, probeArtifacts } from '../acceptance'

describe('断言语法', () => {
  it('六种家族解析；参数缺失或未知家族 → null（不可判定）', () => {
    expect(parseCriterion('file_exists: out/report.md')).toEqual({ family: 'file_exists', path: 'out/report.md' })
    expect(parseCriterion('file_min_bytes: out/a.txt 128')).toEqual({ family: 'file_min_bytes', path: 'out/a.txt', bytes: 128 })
    expect(parseCriterion('file_contains: out/a.txt PASS')).toEqual({ family: 'file_contains', path: 'out/a.txt', text: 'PASS' })
    expect(parseCriterion('command_ok: npm test')).toEqual({ family: 'command_ok', command: 'npm test' })
    expect(parseCriterion('test_passed: npm test')).toEqual({ family: 'test_passed', command: 'npm test' })
    expect(parseCriterion('file_min_bytes: out/a.txt abc')).toBeNull()
    expect(parseCriterion('random_thing: x')).toBeNull()
    expect(parseCriterion('file_exists:')).toBeNull()
  })

  it('测试摘要识别：N passed / PASS / ok / SUCCESS', () => {
    expect(looksLikePassingTestSummary('Tests 12 passed (12)')).toBe(true)
    expect(looksLikePassingTestSummary('ok  \tgithub.com/x/y\t0.2s')).toBe(true)
    expect(looksLikePassingTestSummary('PASS src/a.test.ts')).toBe(true)
    expect(looksLikePassingTestSummary('SUCCESS')).toBe(true)
    expect(looksLikePassingTestSummary('no output')).toBe(false)
    expect(looksLikePassingTestSummary(undefined)).toBe(false)
  })
})

describe('逐条判定', () => {
  const evidence = {
    artifacts: [
      { path: 'out/report.md', exists: true, readable: true, size: 4096, contentTail: '# 报告\n结论：PASS' },
      { path: 'out/empty.txt', exists: true, readable: true, size: 0, contentTail: '' },
    ],
    commands: [
      { command: 'npm test', exitCode: 0, stdoutTail: 'Tests 42 passed (42)' },
      { command: 'npm run build', exitCode: 2, stdoutTail: 'error TS1005' },
      { command: 'echo hi', exitCode: 0, stdoutTail: 'hi' },
    ],
  }

  it('文件类断言：存在/可读/大小/内容', () => {
    const v = checkAcceptance(
      ['file_exists: out/report.md', 'file_readable: out/report.md', 'file_min_bytes: out/report.md 1024', 'file_contains: out/report.md PASS'],
      evidence,
    )
    expect(v.applicable).toBe(true)
    expect(v.allHold).toBe(true)
    expect(v.unchecked).toEqual([])
    expect(v.leaves.every((l) => l.checked && l.holds)).toBe(true)

    const fail = checkAcceptance(['file_min_bytes: out/report.md 999999'], evidence)
    expect(fail.allHold).toBe(false)
    expect(fail.leaves[0].holds).toBe(false)
  })

  it('命令类：command_ok 看退出码；test_passed 还要摘要命中', () => {
    const ok = checkAcceptance(['command_ok: npm test'], evidence)
    expect(ok.allHold).toBe(true)
    const bad = checkAcceptance(['command_ok: npm run build'], evidence)
    expect(bad.allHold).toBe(false)
    expect(bad.leaves[0].detail).toContain('exit=2')
    // 退出 0 但没有测试摘要 → test_passed 不成立
    const noSummary = checkAcceptance(['test_passed: echo hi'], evidence)
    expect(noSummary.allHold).toBe(false)
    expect(noSummary.leaves[0].detail).toContain('摘要未命中')
  })

  it('不可判定：语法错/缺证据 → unchecked 且整体不放行（不可判定≠通过）', () => {
    const v = checkAcceptance(['file_exists: out/missing.md', '随便写一条'], evidence)
    expect(v.allHold).toBe(false)
    expect(v.unchecked).toHaveLength(2)
    expect(v.note).toContain('不可判定不等于通过')
  })

  it('空断言列表：applicable=false，不盖章', () => {
    const v = checkAcceptance([], evidence)
    expect(v.applicable).toBe(false)
    expect(v.allHold).toBe(false)
    expect(v.note).toContain('不猜通过')
  })
})

describe('探针（IO 层）', () => {
  let root: string
  let outside: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'accept-root-'))
    outside = mkdtempSync(join(tmpdir(), 'accept-out-'))
    mkdirSync(join(root, 'out'), { recursive: true })
    writeFileSync(join(root, 'out', 'report.md'), '# 报告\nTests 3 passed\n')
    writeFileSync(join(outside, 'secret.txt'), 'secret')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('实测存在/大小/尾部；缺失文件按 exists=false 如实记录', () => {
    const r = probeArtifacts(root, ['out/report.md', 'out/nope.md'], { allowedRoots: [root] })
    expect(r.problems).toEqual([])
    const hit = r.artifacts.find((a) => a.path === 'out/report.md')!
    expect(hit.exists).toBe(true)
    expect(hit.readable).toBe(true)
    expect(hit.size).toBeGreaterThan(0)
    expect(hit.contentTail).toContain('3 passed')
    expect(r.artifacts.find((a) => a.path === 'out/nope.md')!.exists).toBe(false)
  })

  it('路径守卫：.. 与绝对路径拒绝；root 不在允许根内直接拒', () => {
    const traversal = probeArtifacts(root, ['../etc/passwd', '/etc/passwd'], { allowedRoots: [root] })
    expect(traversal.problems.length).toBe(2)
    expect(traversal.artifacts.every((a) => a.exists === false)).toBe(true)

    const badRoot = probeArtifacts(outside, ['secret.txt'], { allowedRoots: [root] })
    expect(badRoot.problems[0]).toContain('不在允许根内')
  })

  it('符号链接逃逸：指向 root 外的链接判逃逸', () => {
    symlinkSync(join(outside, 'secret.txt'), join(root, 'out', 'link.txt'))
    const r = probeArtifacts(root, ['out/link.txt'], { allowedRoots: [root] })
    expect(r.problems.join()).toContain('符号链接逃出 root')
  })

  it('探针结果直接喂判定：文件+测试摘要组合成立', () => {
    const probed = probeArtifacts(root, ['out/report.md'], { allowedRoots: [root] })
    const v = checkAcceptance(
      ['file_exists: out/report.md', 'file_contains: out/report.md 3 passed'],
      { artifacts: probed.artifacts },
    )
    expect(v.allHold).toBe(true)
  })
})
