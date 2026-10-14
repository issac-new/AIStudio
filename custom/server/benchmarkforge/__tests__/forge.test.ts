// overlay[benchmarkforge] 生成器测试：解析/选题/产题纯函数 + 真实 git 仓端到端
// （mkdtemp 建仓→两次提交→readExpertCommits→forgeTasks→eval createSet 落库）。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { forgeTasks, parseGitLog, selectExpertCommits, readExpertCommits } from '../forge'
import { _useStoreDirForTests } from '../../eval/store'

const storeDir = mkdtempSync(join(tmpdir(), 'forge-store-'))
_useStoreDirForTests(storeDir)

const repoDir = mkdtempSync(join(tmpdir(), 'forge-repo-'))
afterAll(() => {
  rmSync(storeDir, { recursive: true, force: true })
  rmSync(repoDir, { recursive: true, force: true })
})

function git(args: string[]): void {
  execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' })
}

beforeEach(() => {
  rmSync(join(storeDir, 'eval-store.json'), { force: true })
})

const SHA = 'a'.repeat(40)
const SHA2 = 'b'.repeat(40)

describe('纯函数', () => {
  it('parseGitLog：真实顺序（sha/subject/body/numstat）分段解析，测试文件归类', () => {
    const raw = [
      SHA, 'fix: 修复支付回调签名校验', '', '根因：时间戳未参与签名。', '',
      '3\t1\tsrc/pay/callback.ts', '12\t0\ttests/callback.test.ts', '',
      SHA2, 'chore: 文案清理', '',
      '1\t1\tREADME.md', '',
    ].join('\n')
    const commits = parseGitLog(raw)
    expect(commits).toHaveLength(2)
    expect(commits[0].subject).toContain('支付回调')
    expect(commits[0].body).toContain('根因')
    expect(commits[0].filesChanged).toEqual(['src/pay/callback.ts', 'tests/callback.test.ts'])
    expect(commits[0].testFiles).toEqual(['tests/callback.test.ts'])
    expect(commits[1].testFiles).toEqual([])
  })

  it('selectExpertCommits：带测试优先；forgeTasks 模板齐备且不泄 sha', () => {
    const withTest = { sha: SHA, subject: 's1', body: '', filesChanged: ['a.ts', 'tests/a.test.ts'], testFiles: ['tests/a.test.ts'] }
    const noTest = { sha: SHA2, subject: 's2', body: '', filesChanged: ['a.ts'], testFiles: [] }
    const picked = selectExpertCommits([noTest, withTest], 2)
    expect(picked[0].sha).toBe(SHA)
    const tasks = forgeTasks([withTest], '/repo')
    expect(tasks[0].id).toBe(`bf-${SHA.slice(0, 7)}`)
    expect(tasks[0].problem).not.toContain(SHA)
    expect(tasks[0].rubric.length).toBeGreaterThanOrEqual(2)
    expect(tasks[0].rubric.every((r) => r.expect === 'yes' && r.kind === 'result')).toBe(true)
    expect(tasks[0].origin).toBe(`benchmarkforge:/repo@${SHA.slice(0, 7)}`)
  })
})

describe('真实 git 仓端到端', () => {
  it('建仓两次提交→读取→产题→导入 eval 用例集', async () => {
    git(['init', '-q'])
    git(['config', 'user.email', 't@t'])
    git(['config', 'user.name', 't'])
    mkdirSync(join(repoDir, 'tests'), { recursive: true })
    writeFileSync(join(repoDir, 'src.ts'), 'export const a = 1\n')
    git(['add', '.'])
    git(['commit', '-q', '-m', 'feat: 首个功能（含测试）'])
    writeFileSync(join(repoDir, 'tests', 'src.test.ts'), 'test("a", () => {})\n')
    writeFileSync(join(repoDir, 'src.ts'), 'export const a = 2\n')
    git(['add', '.'])
    git(['commit', '-q', '-m', 'fix: 修正 a 值', '-m', '回归由测试兜底。'])
    const commits = readExpertCommits(repoDir, '1.day.ago', 10)
    expect(commits.length).toBeGreaterThanOrEqual(2)
    const experts = selectExpertCommits(commits, 2)
    expect(experts.some((c) => c.testFiles.length > 0)).toBe(true)
    const tasks = forgeTasks(experts, repoDir)
    const { createSet } = await import('../../eval/store')
    const result = createSet({ name: '专家基线集-测试', track: 'e2e', tasks }, 'benchmarkforge')
    expect(result.ok).toBe(true)
    expect(result.set?.tasks.length).toBe(tasks.length)
    // 同名集幂等拒绝（防重复导入撞题）
    const again = createSet({ name: '专家基线集-测试', track: 'e2e', tasks }, 'benchmarkforge')
    expect(again.ok).toBe(false)
  })
})
