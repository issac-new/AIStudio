// overlay[benchmarkforge] CLI 入口（阿里调研轮 C）：node scripts/forge-benchmark.mjs 薄壳调本函数。
// 产题后直接走 eval store createSet 导入（无需 server 在跑）；同名集幂等拒绝由
// eval store 保证（同名即报错退出，防重复导入撞题）。
import { forgeTasks, readExpertCommits, selectExpertCommits } from './forge.ts'
import { createSet } from '../eval/store.ts'

export interface ForgeCliArgs {
  repo: string
  setName: string
  since?: string
  limit?: number
  track?: 'e2e' | 'process'
}

export async function runForgeCli(args: ForgeCliArgs): Promise<{ ok: boolean; problems?: string[]; set?: unknown; tasks?: number }> {
  const since = args.since ?? '3.months.ago'
  const limit = Math.max(1, Math.min(50, args.limit ?? 20))
  const commits = readExpertCommits(args.repo, since, limit)
  if (!commits.length) return { ok: false, problems: [`窗口（${since}）内无可选提交`] }
  const experts = selectExpertCommits(commits, limit)
  const tasks = forgeTasks(experts, args.repo)
  const result = createSet(
    {
      name: args.setName,
      track: args.track ?? 'e2e',
      tasks,
    },
    'benchmarkforge',
  )
  if (!result.ok) return { ok: false, problems: result.problems }
  return { ok: true, set: result.set, tasks: tasks.length }
}
