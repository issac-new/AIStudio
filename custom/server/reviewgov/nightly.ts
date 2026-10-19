// overlay/custom/server/reviewgov/nightly.ts
// 夜间存量扫描：把延后队列（存量问题/超预算 nit）按「文件 + bug 类」归并成报告。
// 对齐 Anthropic 文章「老代码问题单独丢给半夜定时跑的审查 Agent」：
// 本模块只负责可复现的账本聚合与报告落盘，不自动改代码；定时执行由
// HERMES_REVIEW_NIGHTLY=on 的服务内定时器或外部 cron 触发。
import { readLatestNightly, saveNightlyReport } from './store'
import type { NightlyGroup, NightlyReport, ReviewCase } from './types'

export function localDate(now = Date.now()): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 纯函数：把延后队列聚合成夜间报告（同文件同 bug 类归并，按量排序）。 */
export function buildNightlyReport(cases: ReviewCase[], now = Date.now()): NightlyReport {
  const map = new Map<string, NightlyGroup>()
  const caseIds = new Set<string>()
  for (const c of cases) {
    for (const f of c.findings) {
      if (!f.deferred || f.state !== 'deferred') continue
      const bugClass = f.bugClass ?? 'unclassified'
      const key = `${f.file}|${bugClass}`
      const g = map.get(key) ?? {
        file: f.file,
        bugClass,
        count: 0,
        oldestAt: f.createdAt,
        findingIds: [],
        caseIds: [],
      }
      g.count += 1
      g.oldestAt = Math.min(g.oldestAt, f.createdAt)
      g.findingIds.push(f.findingId)
      if (!g.caseIds.includes(c.caseId)) g.caseIds.push(c.caseId)
      map.set(key, g)
      caseIds.add(c.caseId)
    }
  }
  const groups = [...map.values()].sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
  return {
    reportId: `n-${now.toString(36)}`,
    date: localDate(now),
    generatedAt: now,
    backlog: groups.reduce((sum, g) => sum + g.count, 0),
    groups,
    caseCount: caseIds.size,
  }
}

export function runNightlyScan(cases: ReviewCase[], now = Date.now()): NightlyReport {
  return saveNightlyReport(buildNightlyReport(cases, now))
}

/** 同一天只自动跑一次；返回 null 表示今天已跑过。 */
export function maybeRunNightly(cases: ReviewCase[], now = Date.now()): NightlyReport | null {
  const latest = readLatestNightly()
  if (latest?.date === localDate(now)) return null
  return runNightlyScan(cases, now)
}
