// inbox-adapter.ts —— 统一注意力收件箱（纯函数合并 + 排序）
//
// 四套分散的"需要我"信号（治 E5）合并为一条按权重排序的收件箱：
//   approval(0) > blocked(1) > clarify(2) > review(3) > triage(4)
//   > chat 未读(5) > matrix 未读(6) > 待办提醒(7)
// 同级按 ts 降序。纯函数、无 IO —— 供 cockpit store 与单测直接使用。

import type { RouteLocationRaw } from 'vue-router'
import type { AttentionItem } from './attention-adapter'
import type { NotifyItem } from './notify-adapter'
import type { FleetSession } from './fleet-adapter'

export type InboxKind =
  | 'approval' | 'blocked' | 'clarify' | 'review' | 'triage'
  | 'chat' | 'matrix' | 'group' | 'reminder'

export interface InboxItem {
  id: string
  kind: InboxKind
  /** 展示权重（越小越靠前） */
  weight: number
  severity: 'high' | 'medium' | 'low'
  title: string
  preview: string
  count: number
  ts: number
  routeTarget: RouteLocationRaw
  /** 点击后需要选中的看板任务（attention 类） */
  taskId?: string
  /** 可就地批准的审批（fleet 类） */
  approval?: { sessionId: string; approvalId: string; choices: string[] }
  /** 可就地应答的澄清（fleet 类） */
  clarify?: { sessionId: string; clarifyId: string; question: string }
}

export const INBOX_KIND_WEIGHT: Record<InboxKind, number> = {
  approval: 0,
  blocked: 1,
  clarify: 2,
  review: 3,
  triage: 4,
  chat: 5,
  matrix: 6,
  group: 6,
  reminder: 7,
}

export interface InboxSources {
  attention: AttentionItem[]
  fleet: FleetSession[]
  /** 已经是 NotifyItem 形状的会话未读（notifyAdapter.fromChatSession 产物） */
  chatUnreads: NotifyItem[]
  /** 既有通知项（matrix 未读 + 待办提醒等） */
  notifyItems: NotifyItem[]
}

export interface InboxFilter {
  /** 团队过滤：profile 白名单（null = 不过滤） */
  profiles?: string[] | null
  /** 团队过滤：board 白名单（null = 不过滤） */
  boards?: string[] | null
}

function fromAttention(item: AttentionItem): InboxItem {
  const kind: InboxKind = item.status === 'blocked'
    ? 'blocked'
    : item.status === 'review'
      ? 'review'
      : 'triage'
  return {
    id: `att:${item.taskId}`,
    kind,
    weight: INBOX_KIND_WEIGHT[kind],
    severity: item.severity,
    title: item.title,
    preview: '',
    count: 1,
    ts: item.createdAt || 0,
    routeTarget: { name: 'hermes.cockpit' },
    taskId: item.taskId,
  }
}

/** 从舰队快照提取待审批/待澄清项 */
export function fleetAttentionToInbox(fleet: FleetSession[]): InboxItem[] {
  const items: InboxItem[] = []
  for (const session of fleet) {
    for (const approval of session.approvals || []) {
      items.push({
        id: `approval:${session.id}:${approval.approval_id}`,
        kind: 'approval',
        weight: INBOX_KIND_WEIGHT.approval,
        severity: 'high',
        title: `审批 · ${session.title || session.id}`,
        preview: approval.preview || approval.approval_id,
        count: 1,
        ts: session.lastActiveAt || 0,
        routeTarget: {
          name: 'hermes.session',
          params: { sessionId: session.id },
          query: session.profile ? { profile: session.profile } : {},
        },
        approval: { sessionId: session.id, approvalId: approval.approval_id, choices: approval.choices },
      })
    }
    for (const clarify of session.clarifies || []) {
      items.push({
        id: `clarify:${session.id}:${clarify.clarify_id}`,
        kind: 'clarify',
        weight: INBOX_KIND_WEIGHT.clarify,
        severity: 'high',
        title: `澄清 · ${session.title || session.id}`,
        preview: clarify.question || clarify.clarify_id,
        count: 1,
        ts: session.lastActiveAt || 0,
        routeTarget: {
          name: 'hermes.session',
          params: { sessionId: session.id },
          query: session.profile ? { profile: session.profile } : {},
        },
        clarify: { sessionId: session.id, clarifyId: clarify.clarify_id, question: clarify.question },
      })
    }
  }
  return items
}

function fromNotifyItem(item: NotifyItem): InboxItem {
  const kind: InboxKind = item.kind === 'chat'
    ? 'chat'
    : item.kind === 'group'
      ? 'group'
      : item.kind === 'reminder'
        ? 'reminder'
        : 'matrix'
  return {
    id: `notify:${item.id}`,
    kind,
    weight: INBOX_KIND_WEIGHT[kind],
    severity: kind === 'chat' || kind === 'group' ? 'medium' : 'low',
    title: item.title,
    preview: item.preview,
    count: item.count,
    ts: item.ts,
    routeTarget: item.routeTarget,
  }
}

/** 合并全部来源 → 统一收件箱（权重升序，同级 ts 降序） */
export function buildInboxItems(sources: InboxSources, filter?: InboxFilter): InboxItem[] {
  const profiles = filter?.profiles ?? null
  const boards = filter?.boards ?? null
  const items: InboxItem[] = []

  for (const item of sources.attention || []) {
    // attention 无 board 信息，board 过滤由调用方在任务侧处理，这里只做 profile 无关透传
    items.push(fromAttention(item))
  }

  const fleetFiltered = profiles
    ? (sources.fleet || []).filter(session => profiles.includes(session.profile || 'default'))
    : sources.fleet || []
  items.push(...fleetAttentionToInbox(fleetFiltered))

  for (const item of sources.chatUnreads || []) {
    if (profiles) {
      const profile = (item.routeTarget as any)?.query?.profile
      if (typeof profile === 'string' && profile && !profiles.includes(profile)) continue
    }
    items.push(fromNotifyItem(item))
  }

  for (const item of sources.notifyItems || []) {
    if (item.kind === 'reminder') {
      items.push(fromNotifyItem(item))
      continue
    }
    // matrix/group 的 board/profile 维度不可判，团队过滤时不丢弃（宁多勿漏）
    items.push(fromNotifyItem(item))
  }

  return items.sort((a, b) => (a.weight - b.weight) || (b.ts - a.ts))
}
