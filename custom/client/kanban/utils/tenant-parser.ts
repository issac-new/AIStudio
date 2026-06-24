// overlay/custom/client/kanban/utils/tenant-parser.ts
// 解析 kanban task 的 tenant 字段。
//
// 完整格式：<群聊名称>:<话题摘要>:<user_id>:<room_id>:<session_id>:matrix
// 示例：跨团队协作群01:记忆服务讨论:@testuser3:!jDhqiAernzgtADVwAw:$11wFK9rf3UlDS:matrix
//
// 旧格式：以 "matrix" 作为第一段的值（如 matrix:xxx:yyy），
// 解析后 isLegacy=true，归类为"其它"。

export interface ParsedTenant {
  raw: string
  groupChat: string
  topic: string
  userId: string
  roomId: string
  sessionId: string
  source: string
  isLegacy: boolean
}

const LEGACY_TAG = '___other___'

export function parseTenant(raw: string): ParsedTenant {
  const parts = raw.split(':')
  const isLegacy = parts[0] === 'matrix' || parts.length < 6

  if (isLegacy) {
    return {
      raw,
      groupChat: '',
      topic: '',
      userId: '',
      roomId: '',
      sessionId: '',
      source: '',
      isLegacy: true,
    }
  }

  return {
    raw,
    groupChat: parts[0] || '',
    topic: parts[1] || '',
    userId: parts[2] || '',
    roomId: parts[3] || '',
    sessionId: parts[4] || '',
    source: parts[5] || '',
    isLegacy: false,
  }
}

/** 可读标签：群聊名称:话题摘要（截断至 30 字符） */
export function tenantDisplayLabel(parsed: ParsedTenant): string {
  if (parsed.isLegacy) return parsed.raw
  const label = `${parsed.groupChat}:${parsed.topic}`
  return label.length > 30 ? label.slice(0, 29) + '…' : label
}

/** 筛选值：按群聊名称筛选；旧格式返回 LEGACY_TAG */
export function tenantFilterValue(parsed: ParsedTenant): string {
  if (parsed.isLegacy) return LEGACY_TAG
  return parsed.groupChat
}

export function isLegacyTag(value: string): boolean {
  return value === LEGACY_TAG
}
