// overlay/custom/server/loop/engine/execution-lease.ts
// 执行租约 daemon 形态（R6，routa execution-backend.ts:54-61 + runner-routing 语义）：
// 会话运行归属实例 + 300s 租约——重启后按租约接管（owner 失联租约到期 → 其他实例可接管）。
// 最小充分机制：session 表 owner_instance_id + lease_expires_at（patch 357），
// 本模块是纯判定/接管逻辑，存储由调用方注入（syncTable 已加列）。
// 与 loop/engine/lease-manager.ts（matrix 状态租约）不同语义，并存不冲突。
export interface LeaseSession {
  id: string
  owner_instance_id: string
  lease_expires_at: number
}

export const LEASE_TTL_MS = 300_000 // 300s（routa 同款）

/** 当前实例 id（daemon 持久身份；进程级单例，重启后由调用方按 env/pid 生成） */
export function currentInstanceId(): string {
  return process.env.HERMES_INSTANCE_ID || `inst-${process.pid}`
}

/** 租约是否可接管（owner 失联/租约到期 → 任何实例可接管；自己持有 → 可续租） */
export function canTakeOver(session: LeaseSession, instanceId: string, nowMs: number): boolean {
  if (!session.owner_instance_id) return true // 无归属 → 可接管
  if (session.owner_instance_id === instanceId) return true // 自己持有 → 可续
  return session.lease_expires_at <= nowMs // owner 失联（租约到期）→ 可接管
}

/** 接管/续租后的新租约字段（写库值） */
export function nextLease(instanceId: string, nowMs: number): { owner_instance_id: string; lease_expires_at: number } {
  return { owner_instance_id: instanceId, lease_expires_at: nowMs + LEASE_TTL_MS }
}

/** 租约是否仍有效（展示/续租判定面） */
export function leaseAlive(session: LeaseSession, nowMs: number): boolean {
  return session.lease_expires_at > nowMs
}
