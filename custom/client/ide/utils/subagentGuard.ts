// overlay/custom/client/ide/utils/subagentGuard.ts
// 子代理结果展示防护（claude-code 2.1.277 来源标头 + 2.1.210 输出扫描语义）。
// 子代理文本属低信任源：可能被注入伪装成系统指令或用户消息。两条线：
//   ① 渲染侧加来源徽标（见 SubagentOriginBadge 组件用法）
//   ② 展示前扫描注入指纹，命中即在内容区标注「可疑指令已折叠」提示
// 只改展示不改数据（不喂回 LLM 的文本不动），与 CC 的 sanitize 分级一致：
// 展示层告警 ≠ 数据层改写。
export interface InjectionHit {
  pattern: string
  index: number
}

// 注入指纹（小写匹配；宁多勿少——误报只影响提示不丢内容）
const PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ignore (all )?(previous|prior) instructions?/, label: 'ignore-instructions' },
  { pattern: /you are now /, label: 'persona-override' },
  { pattern: /\[system\]/, label: 'fake-system-tag' },
  { pattern: /<\/?system>/, label: 'fake-system-xml' },
  { pattern: /^\s*system\s*:\s/im, label: 'fake-system-prefix' },
  { pattern: /disregard (all )?(previous|prior)/, label: 'disregard-previous' },
  { pattern: /新的系统提示|忽略(之前|以上)指令|你现在是/, label: 'cjk-injection' },
]

/** 扫描文本中的注入指纹，返回全部命中（无则空数组） */
export function scanInjection(text: string): InjectionHit[] {
  if (!text) return []
  const hits: InjectionHit[] = []
  const lower = text.toLowerCase()
  for (const { pattern, label } of PATTERNS) {
    const m = pattern.exec(lower) ?? pattern.exec(text)
    if (m) hits.push({ pattern: label, index: m.index })
  }
  return hits
}

/** 是否有命中（渲染层决定是否展示可疑标注） */
export function hasInjection(text: string): boolean {
  return scanInjection(text).length > 0
}
