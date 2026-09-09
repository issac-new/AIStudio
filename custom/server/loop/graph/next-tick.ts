// overlay/custom/server/loop/graph/next-tick.ts
// 共享的 cron/manual nextTick 计算（提取自 scheduler.ts / centralized-scheduler.ts，
// 两处实现逐字相同；RunSpawner 与 legacy 调度器统一走这一份）

import * as cronParserModule from 'cron-parser'
import type { LoopInstance } from '../types'

// cron-parser 5.x ESM 下 default import 的形状不稳定（vitest ESM interop 时
// default.CronExpressionParser 为 undefined）——双形状兼容取 parse
const parseCron: (expr: string, opts: { tz: string }) => { next: () => { toISOString(): string } } =
  (cronParserModule as { CronExpressionParser?: { parse: typeof parseCron } }).CronExpressionParser?.parse
  ?? (cronParserModule as { default?: { CronExpressionParser?: { parse: typeof parseCron } } }).default!.CronExpressionParser!.parse

const FALLBACK_MS = 3600_000

export function computeNextTick(loop: LoopInstance, now: Date = new Date()): string {
  if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
    try {
      const interval = parseCron(loop.schedule.cron, { tz: loop.schedule.timezone })
      return interval.next().toISOString()
    } catch {
      return new Date(now.getTime() + FALLBACK_MS).toISOString()
    }
  }
  return new Date(now.getTime() + FALLBACK_MS).toISOString()
}
