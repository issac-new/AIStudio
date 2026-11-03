// overlay[delivery]: 看板数据根解析（从 delivery-controller 抽出，2026-11-03 介入治理接线共用）。
// 单一事实源：两个消费方（delivery digest、proactivity 介入同步）用同一解析序。
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { observerSimRootOrNull } from '../simcenter/observer-root'

/** 看板数据根候选：显式 env 优先（测试/日常侧），否则 SIM 根 hermes/（推演侧）。 */
export function kanbanHomeCandidates(env: NodeJS.ProcessEnv, simRoot: string | null): string[] {
  const explicit = [env.DELIVERY_KANBAN_HOME, env.HERMES_KANBAN_HOME, env.HERMES_HOME]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
  const sim = simRoot ? [resolve(simRoot, 'hermes')] : []
  return [...new Set([...explicit, ...sim])]
}

export function resolveKanbanHome(env: NodeJS.ProcessEnv = process.env): { home: string | null; tried: string[] } {
  const simRoot = observerSimRootOrNull()
  for (const p of kanbanHomeCandidates(env, simRoot)) {
    try {
      if (
        existsSync(resolve(p, 'kanban', 'boards')) ||
        existsSync(resolve(p, 'boards')) ||
        existsSync(resolve(p, 'kanban.db')) ||
        existsSync(resolve(p, 'kanban', 'kanban.db'))
      ) {
        return { home: p, tried: [] }
      }
    } catch {
      /* 候选缺席继续 */
    }
  }
  return { home: null, tried: kanbanHomeCandidates(env, simRoot) }
}
