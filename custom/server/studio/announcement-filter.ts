// overlay/custom/server/studio/announcement-filter.ts
// 版本感知公告过滤（根治 2026-09-22 实锤）：厂商公告接口（api.ekkostudio.xyz）
// 无结构化版本字段，客户端对未读公告逢新必弹——0.7.23 机器被弹「0.7.20新增
// DeepSeek Harness Agent，如需使用，请更新至0.7.20」。
//
// 规则（对 list 逐条判定）：
//   - 公告 title+content 引用的全部 x.y.z 版本号 ≤ 本机版本 → 过期，丢弃；
//   - 任一引用版本 > 本机 → 保留（确有新版可升，正是用户该看的）；
//   - 无版本号 → 保留（维护通知/活动公告无法推断，不误杀）；
//   - 本机版本无法解析 → 全部保留（fail-open，过滤不可用时不影响厂商通道）。

export interface AnnouncementEntry {
  title?: unknown
  content?: unknown
  [key: string]: unknown
}

export type Semver = [number, number, number]

const VERSION_RE = /(\d+)\.(\d+)\.(\d+)/g

/** 提取文本中的全部 x.y.z 版本号 */
export function referencedVersions(text: string): Semver[] {
  const out: Semver[] = []
  for (const m of text.matchAll(VERSION_RE)) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3])])
  }
  return out
}

/** 元组比较：a<b → -1；a=b → 0；a>b → 1 */
export function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return 0
}

/** 解析 "x.y.z"；非法返回 null */
export function parseSemver(text: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/**
 * 单条公告是否过期：引用的全部版本号 ≤ 本机。
 * 无版本引用或本机版本非法 → false（保留）。
 */
export function isStaleAnnouncement(item: AnnouncementEntry, currentVersion: string): boolean {
  const current = parseSemver(currentVersion)
  if (!current) return false
  const text = `${typeof item?.title === 'string' ? item.title : ''}\n${typeof item?.content === 'string' ? item.content : ''}`
  const refs = referencedVersions(text)
  if (refs.length === 0) return false
  return refs.every((v) => compareSemver(v, current) <= 0)
}

/**
 * 过滤公告 payload 的 list（其它字段原样透传；list 非数组原样返回）。
 */
export function filterStaleAnnouncementPayload(payload: unknown, currentVersion: string): unknown {
  if (!payload || typeof payload !== 'object') return payload
  const obj = payload as { list?: unknown }
  if (!Array.isArray(obj.list)) return payload
  return {
    ...(payload as Record<string, unknown>),
    list: obj.list.filter((item) => !isStaleAnnouncement(item as AnnouncementEntry, currentVersion)),
  }
}
