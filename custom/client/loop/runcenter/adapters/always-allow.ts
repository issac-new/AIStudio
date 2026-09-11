// overlay/custom/client/loop/runcenter/adapters/always-allow.ts
// 「Always allow 按类型记忆」（P4 T9 / spec §7B.5，Junie Action Allowlist 语义收敛版）：
// 同类审批（按 nodeType 粒度）勾选一次后，后续同类 interrupt 自动批准并留痕——
// approver 盖章为 `always-allow:<user>`（服务端 stampApproverIdentity 会以 JWT 主体
// 覆写，本机盖章值仅作为无服务端覆写路径下的兜底标记与测试锚点）。
// 存储仅 localStorage（'loopAlwaysAllow'），纯函数核心 + 薄 IO，畸形存储不炸。

/** nodeType → true（存在即允许） */
export type AlwaysAllowMap = Record<string, true>

const STORAGE_KEY = 'loopAlwaysAllow'

/** 读取规则表；缺失/畸形 JSON/非对象一律回空表（规则可随时重建，不值得报错） */
export function loadAlwaysAllow(): AlwaysAllowMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: AlwaysAllowMap = {}
    for (const k of Object.keys(parsed)) if ((parsed as Record<string, unknown>)[k] === true) map[k] = true
    return map
  } catch {
    return {}
  }
}

/** 持久化规则表（写失败静默——规则丢失只退化回手动审批） */
export function saveAlwaysAllow(map: AlwaysAllowMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* 存储不可用（隐私模式/配额）：跳过 */
  }
}

export function isAlwaysAllowed(map: AlwaysAllowMap, nodeType: string | null | undefined): boolean {
  return nodeType != null && Object.hasOwn(map, nodeType)
}

/** 纯函数增删规则（不落盘；调用方决定持久化时机——审批成功后才沉淀，失败不记） */
export function withRule(map: AlwaysAllowMap, nodeType: string, on: boolean): AlwaysAllowMap {
  if (!on) {
    if (!Object.hasOwn(map, nodeType)) return map
    const next = { ...map }
    delete next[nodeType]
    return next
  }
  return Object.hasOwn(map, nodeType) ? map : { ...map, [nodeType]: true }
}

/** 自动通过的审批人留痕标签（日志/事件流可见「谁」放行：规则 + 操作者） */
export function alwaysAllowApprover(username: string): string {
  return `always-allow:${username}`
}
