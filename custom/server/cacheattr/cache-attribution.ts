// overlay/cacheattr 域：缓存 miss 归因（claude-code §六 P2 吸收，矩阵 §3.7 P2）。
//
// cc 语义（缓存 miss 归因+/context 建议）：prompt cache 命中率低要**归因**——
// 哪类操作打断了缓存（改系统提示/工具 schema 变/历史前缀变/模型切换），归因→
// 建议（怎么少打断）。衔接 409 换窗/400 compact（都动缓存）。
export type MissCause =
  | 'system-prompt-changed'   // 系统提示变化（改 prompt/记忆注入）
  | 'tool-schema-changed'    // 工具 schema 变（开关工具/改定义）
  | 'history-prefix-changed' // 历史前缀变（摘要/剪枝重写前段）
  | 'model-switched'         // 模型切换（缓存跨模型不共享）
  | 'unknown'

export interface CacheMissFacts {
  hitRate: number
  /** 疑似 miss 原因集（调用方从上下文差异给）。 */
  causes: MissCause[]
}

export interface CacheAttribution {
  cause: MissCause
  suggestion: string
  /** 命中率档位（good/low/critical）。 */
  level: 'good' | 'low' | 'critical'
}

/** 缓存 miss 归因（首个已知原因优先；未知→unknown+通用建议）。 */
export function attributeCacheMiss(facts: CacheMissFacts): CacheAttribution {
  const level = facts.hitRate >= 0.7 ? 'good' : facts.hitRate >= 0.3 ? 'low' : 'critical'
  const cause = facts.causes.find((c) => c !== 'unknown') ?? 'unknown'
  const suggestion = SUGGESTIONS[cause]
  return { cause, suggestion, level }
}

const SUGGESTIONS: Record<MissCause, string> = {
  'system-prompt-changed': '系统提示变更会全量失效：记忆/配置改动合并到一次提交（少变=少失效）',
  'tool-schema-changed': '工具开关/定义变更失效 schema 段：稳定工具面（批配置改动，不在中途开关工具）',
  'history-prefix-changed': '历史前缀被重写（摘要/剪枝）：减少前段重写（换窗丢尾保头=409 语义；409 次序化优先剪尾）',
  'model-switched': '缓存跨模型不共享：会话内固定模型（切换前结束会话）',
  'unknown': '未知归因：下次 miss 时记录上下文差异（系统提示/工具/schema/历史四面对比）',
}
