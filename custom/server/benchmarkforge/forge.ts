// overlay[benchmarkforge] 专家基线考卷生成器（2026-10-14 阿里调研轮 C 项）。
//
// 语义：第三来源题库——从真实代码库的人类专家 Commit 反生成需求题（含验收
// 条件），导入 Eval 用例集；改技能/配置后必跑该集（回归守门）。判分走既有
// runner/judge/compare，本模块只产题不判题。
//
// 考性边界（如实声明）：同仓历史对被测 agent 可见时考卷失效（照抄专家提交即
// 满分）——须配密封集（sealed，逐题对错不出库）或镜像仓使用；本题库默认建议
// 导入为密封集。
import { execFileSync } from 'node:child_process'

export interface ExpertCommit {
  sha: string
  subject: string
  body: string
  filesChanged: string[]
  testFiles: string[]
}

/** 需求题（EvalTask 形状对齐 custom/server/eval/types.ts，避免跨包 import 类型依赖）。 */
export interface ForgedTask {
  id: string
  problem: string
  expectedBehavior: string
  rubric: Array<{ id: string; text: string; expect: 'yes' | 'no'; kind: 'result' | 'trajectory' | 'risk' }>
  origin: string
}

const TEST_FILE_RE = /(^|\/)(tests?|__tests__)\//i
const SHA_RE = /^[0-9a-f]{40}$/
const NUMSTAT_RE = /^(\d+|-)\t(\d+|-)\t(.+)$/

/**
 * 解析 `git log --numstat --pretty=format:%H%n%s%n%b` 原始输出（真实顺序：
 * 每提交块 = sha 行 / subject 行 / body 行们（含空行）/ numstat 行们 / 空行）。
 * 段落边界=下一个 40 位 sha 行。
 */
export function parseGitLog(raw: string): ExpertCommit[] {
  const lines = raw.split('\n')
  const out: ExpertCommit[] = []
  let i = 0
  while (i < lines.length) {
    if (!SHA_RE.test(lines[i].trim())) { i += 1; continue }
    const sha = lines[i].trim()
    i += 1
    if (i >= lines.length || !lines[i].trim()) { continue }
    const subject = lines[i].trim()
    i += 1
    const bodyLines: string[] = []
    const filesChanged: string[] = []
    // 先吃 body 直到遇到 numstat 行或下一个 sha
    while (i < lines.length && !SHA_RE.test(lines[i].trim()) && !NUMSTAT_RE.test(lines[i])) {
      bodyLines.push(lines[i])
      i += 1
    }
    // 再吃连续 numstat 行
    while (i < lines.length && NUMSTAT_RE.test(lines[i])) {
      filesChanged.push((lines[i].match(NUMSTAT_RE) as RegExpMatchArray)[3].trim())
      i += 1
    }
    const body = bodyLines.join('\n').trim()
    out.push({ sha, subject, body, filesChanged, testFiles: filesChanged.filter((f) => TEST_FILE_RE.test(f)) })
  }
  return out.filter((c) => c.subject.length > 0)
}

/** 选专家提交：带测试的优先（验证充分才配当基线）；无测试的须多文件改动。 */
export function selectExpertCommits(commits: ExpertCommit[], limit: number): ExpertCommit[] {
  const withTests = commits.filter((c) => c.testFiles.length > 0)
  const without = commits.filter((c) => c.testFiles.length === 0 && c.filesChanged.length >= 2)
  return [...withTests, ...without].slice(0, Math.max(1, limit))
}

/** 反生成需求题：问题文本不含 sha（防泄漏），出处只进 origin 元数据。 */
export function forgeTasks(commits: ExpertCommit[], repoLabel: string): ForgedTask[] {
  return commits.map((c) => {
    const sha7 = c.sha.slice(0, 7)
    const goal = c.body ? `${c.subject}（要点：${c.body.split('\n')[0].slice(0, 120)}）` : c.subject
    const rubric: ForgedTask['rubric'] = [
      { id: 'r1', text: `实现目标达成：${c.subject}`, expect: 'yes', kind: 'result' },
      { id: 'r2', text: '既有测试通过且无新增失败', expect: 'yes', kind: 'result' },
    ]
    if (c.testFiles.length) {
      rubric.push({ id: 'r3', text: `含测试更新（专家改了 ${c.testFiles.length} 个测试文件，实现方须给出等效或更优的测试覆盖）`, expect: 'yes', kind: 'result' })
    }
    return {
      id: `bf-${sha7}`,
      problem: `实现以下需求并交付验证：${goal}。验收以测试与守门结果为准。`,
      expectedBehavior: `完成「${c.subject}」，相关测试与守门全绿，不引入回归。`,
      rubric,
      origin: `benchmarkforge:${repoLabel}@${sha7}`,
    }
  })
}

/** 读真实 git 仓（只读操作）。 */
export function readExpertCommits(repoPath: string, since: string, limit: number): ExpertCommit[] {
  const raw = execFileSync(
    'git', ['-C', repoPath, 'log', '--no-merges', `--since=${since}`, `-n`, String(Math.max(limit * 3, 30)), '--numstat', '--pretty=format:%H%n%s%n%b'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  return parseGitLog(raw)
}
