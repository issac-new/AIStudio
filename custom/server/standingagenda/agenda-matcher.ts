// overlay/standingagenda：事件流匹配器（纯函数，全矩阵可测）。
// 匹配语义与 automations/automation-rules.matchEvent 同源（file 通配=matchPathPattern 复用；
// git ref 尾段匹配内联同款 5 行——上游 matchRef 未导出，语义锚定 automation-rules.ts:161）。
// 差异：resumeCondition 无 workspacePath 精确匹配（standing agenda 跨工作区跟踪，按源类型过滤即可）。
import { matchPathPattern, type AutomationEvent, type AutomationSourceFilter } from '../automations/automation-rules'
import type { ResumeProposal, StandingAgendaRecord } from './agenda-store'

/** git ref 尾段匹配（语义＝automation-rules.ts matchRef：'main' 匹配 'refs/heads/main'）。 */
function refMatches(ruleRef: string | undefined, eventRef: string): boolean {
  if (!ruleRef) return true
  return eventRef === ruleRef || eventRef.endsWith('/' + ruleRef)
}

/** 单条件×单事件匹配（纯函数）。 */
export function filterMatches(filter: AutomationSourceFilter, event: AutomationEvent): boolean {
  if (filter.type !== event.type) return false
  switch (event.type) {
    case 'file': {
      const f = filter as Extract<AutomationSourceFilter, { type: 'file' }>
      return matchPathPattern(f.pathPattern ?? '', event.path)
    }
    case 'kanban': {
      const f = filter as Extract<AutomationSourceFilter, { type: 'kanban' }>
      return (!f.board || f.board === event.board)
        && (!f.toColumn || f.toColumn === event.to)
    }
    case 'git': {
      const f = filter as Extract<AutomationSourceFilter, { type: 'git' }>
      return refMatches(f.ref, event.ref)
    }
    case 'webhook': {
      const f = filter as Extract<AutomationSourceFilter, { type: 'webhook' }>
      return (!f.source || f.source === event.source)
        && (!f.eventType || f.eventType === event.eventType)
    }
  }
}

/** 事件摘要（恢复建议的证据锚点文本）。 */
export function summarizeEvent(event: AutomationEvent): string {
  switch (event.type) {
    case 'file': return `file:${event.path}`
    case 'kanban': return `kanban:${event.board}/${event.taskId}→${event.to}`
    case 'git': return `git:${event.ref}@${event.commits[0]?.sha?.slice(0, 8) ?? '?'}`
    case 'webhook': return `webhook:${event.source}/${event.eventType}`
  }
}

/**
 * 事件批匹配（纯函数）：仅 parked 状态参与；每条记录命中任一事件即产出一条恢复建议。
 * alignmentNote 由调用方注入（goal-alignment 属 proactivity 域，本域不跨读其存储——
 * controller 层组装，保持 matcher 零 IO）。
 */
export function matchResumes(
  records: StandingAgendaRecord[],
  events: AutomationEvent[],
  opts?: { alignmentNote?: (record: StandingAgendaRecord) => string | undefined; now?: number },
): ResumeProposal[] {
  const now = opts?.now ?? Date.now()
  const proposals: ResumeProposal[] = []
  for (const record of records) {
    if (record.status !== 'parked') continue
    const hit = events.find((e) => filterMatches(record.resumeCondition, e))
    if (!hit) continue
    proposals.push({
      recordId: record.id,
      title: record.title,
      mandateGoal: record.mandateGoal,
      matchedEventSummary: summarizeEvent(hit),
      evidence: record.evidence,
      ...(opts?.alignmentNote ? { alignmentNote: opts.alignmentNote(record) } : {}),
      createdAt: now,
    })
  }
  return proposals
}
