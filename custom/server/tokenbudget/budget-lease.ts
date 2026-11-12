// overlay/tokenbudget：预算租约（2026-11-12 ai-agent-handbook 吸收）。
//
// 手册第 30 章：Budget Lease 把配额与最小权限合成一次授权（资源/操作/期限/撤销），
// 可随子任务派生、可级联撤销。本模块先立账本语义：预留=在途占用，结算=转实际支出，
// 撤销=释放预留。预算判定读「已花费 + 未结算预留」，并发 run 不会在支出可见前全放行。
//
// 结果形状=lease-or-reason（成功带实体、失败带 reason），不引入 ok 布尔联合——
// K19 棘轮要求失败体收敛到统一出口，域内联用实体缺席表达失败。
//
// 边界：本模块是 Studio 侧账本，不拦截 Hermes 的模型请求（硬准入属执行内核统一范围）。
// 默认无租约时行为不变；租约文件缺席=空账。
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, resolve } from 'path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

export interface BudgetLease {
  leaseId: string
  parentLeaseId?: string
  runId?: string
  taskId?: string
  userId?: string
  profileId?: string
  limitUsd: number
  reservedUsd: number
  spentUsd: number
  createdAt: number
  expiresAt: number
  revoked: boolean
}

interface LeaseFile { version: 1; leases: BudgetLease[] }

export interface BudgetLeaseStoreOptions {
  path?: string
  now?: () => number
}

function defaultPath(): string {
  const env = process.env.BUDGET_LEASE_FILE?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return underWebUi('budget-leases.json')
}

export class BudgetLeaseStore {
  private readonly explicitPath?: string
  private readonly now: () => number
  private leases: Map<string, BudgetLease> | null = null
  private loadedPath = ''

  constructor(opts: BudgetLeaseStoreOptions = {}) {
    this.explicitPath = opts.path
    this.now = opts.now ?? Date.now
  }

  private resolvePath(): string {
    return this.explicitPath ?? defaultPath()
  }

  list(includeInactive = false): BudgetLease[] {
    const values = [...this.load().values()]
    const active = values.filter((l) => !l.revoked && l.expiresAt > this.now())
    return (includeInactive ? values : active).map((l) => ({ ...l }))
  }

  get(leaseId: string): BudgetLease | null {
    const lease = this.load().get(leaseId)
    return lease ? { ...lease } : null
  }

  available(leaseId: string): number | null {
    const lease = this.load().get(leaseId)
    if (!lease || lease.revoked) return null
    return Math.max(0, round(lease.limitUsd - lease.reservedUsd - lease.spentUsd))
  }

  /** 根租约或子租约：子租约先从父租约预留，再落自己的额度。 */
  derive(input: {
    leaseId: string
    parentLeaseId?: string
    limitUsd: number
    runId?: string
    taskId?: string
    userId?: string
    profileId?: string
    ttlMs?: number
  }): { lease: BudgetLease | null; reason?: string } {
    if (!(input.limitUsd >= 0)) return { lease: null, reason: 'limitUsd 必须 ≥ 0' }
    const loaded = this.load()
    if (loaded.has(input.leaseId)) return { lease: null, reason: `租约已存在：${input.leaseId}` }
    const now = this.now()
    if (input.parentLeaseId) {
      const parent = loaded.get(input.parentLeaseId)
      if (!parent || parent.revoked) {
        return { lease: null, reason: `父租约不存在或已撤销：${input.parentLeaseId}` }
      }
      const avail = Math.max(0, parent.limitUsd - parent.reservedUsd - parent.spentUsd)
      if (avail < input.limitUsd) {
        return { lease: null, reason: `父租约可用额 ${round(avail)} 不足以派生 ${input.limitUsd}` }
      }
      parent.reservedUsd = round(parent.reservedUsd + input.limitUsd)
    }
    const lease: BudgetLease = {
      leaseId: input.leaseId,
      ...(input.parentLeaseId ? { parentLeaseId: input.parentLeaseId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.profileId ? { profileId: input.profileId } : {}),
      limitUsd: input.limitUsd,
      reservedUsd: 0,
      spentUsd: 0,
      createdAt: now,
      expiresAt: now + Math.max(1_000, input.ttlMs ?? 2 * 60 * 60 * 1000),
      revoked: false,
    }
    loaded.set(lease.leaseId, lease)
    this.persist()
    return { lease: { ...lease } }
  }

  /** 在租约内预留一次调用预算；可用额不足则拒绝（调用方决定降级/等待）。 */
  reserve(leaseId: string, usd: number): { lease: BudgetLease | null; reason?: string } {
    if (!(usd >= 0)) return { lease: null, reason: '预留额必须 ≥ 0' }
    const lease = this.load().get(leaseId)
    if (!lease || lease.revoked) return { lease: null, reason: `租约不存在或已撤销：${leaseId}` }
    const avail = Math.max(0, lease.limitUsd - lease.reservedUsd - lease.spentUsd)
    if (avail < usd) return { lease: null, reason: `租约可用额 ${round(avail)} 不足以预留 ${usd}` }
    lease.reservedUsd = round(lease.reservedUsd + usd)
    this.persist()
    return { lease: { ...lease } }
  }

  /** 结算：预留转实际支出（usd 可小于预留额，差额释放）。 */
  settle(leaseId: string, usd: number): { lease: BudgetLease | null; reason?: string } {
    if (!(usd >= 0)) return { lease: null, reason: '结算额必须 ≥ 0' }
    const lease = this.load().get(leaseId)
    if (!lease) return { lease: null, reason: `租约不存在：${leaseId}` }
    const release = Math.min(lease.reservedUsd, usd)
    lease.reservedUsd = round(lease.reservedUsd - release)
    lease.spentUsd = round(lease.spentUsd + usd)
    this.persist()
    return { lease: { ...lease } }
  }

  /** 撤销：释放自身预留；默认级联撤销子租约。 */
  revoke(leaseId: string, cascade = true): { revoked: string[] | null; reason?: string } {
    const loaded = this.load()
    const lease = loaded.get(leaseId)
    if (!lease) return { revoked: null, reason: `租约不存在：${leaseId}` }
    const revoked: string[] = []
    const visit = (id: string) => {
      const item = loaded.get(id)
      if (!item || item.revoked) return
      item.revoked = true
      item.reservedUsd = 0
      revoked.push(id)
      if (!cascade) return
      for (const child of loaded.values()) {
        if (child.parentLeaseId === id) visit(child.leaseId)
      }
    }
    visit(leaseId)
    this.persist()
    return { revoked }
  }

  /** 活跃租约的未结算预留总额（按用户/档案过滤；预算判定用）。 */
  reservedUsdFor(userId?: string, profileId?: string): number {
    let total = 0
    for (const lease of this.list()) {
      // 未绑定用户/档案的租约按全局计入（宁可少放行，不静默漏算）。
      if (userId && lease.userId && lease.userId !== userId) continue
      if (profileId && lease.profileId && lease.profileId !== profileId) continue
      total += lease.reservedUsd
    }
    return round(total)
  }

  size(): number {
    return this.load().size
  }

  private load(): Map<string, BudgetLease> {
    const path = this.resolvePath()
    if (this.leases && this.loadedPath === path) return this.leases
    const out = new Map<string, BudgetLease>()
    try {
      if (existsSync(path)) {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LeaseFile>
        for (const lease of parsed.leases ?? []) {
          if (lease && typeof lease.leaseId === 'string') out.set(lease.leaseId, lease)
        }
      }
    } catch { /* 损坏账本按空账处理：预算退回只观测，不影响业务 */ }
    this.leases = out
    this.loadedPath = path
    return out
  }

  private persist(): void {
    if (!this.leases) return
    const path = this.resolvePath()
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      const payload: LeaseFile = { version: 1, leases: [...this.leases.values()] }
      atomicWriteJson(path, payload)
    } catch { /* 写失败不阻断业务；调用方看到的是旧账 */ }
  }
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

let sharedStore: BudgetLeaseStore | null = null

export function sharedBudgetLeaseStore(): BudgetLeaseStore {
  if (!sharedStore) sharedStore = new BudgetLeaseStore()
  return sharedStore
}

export function _resetBudgetLeaseStoreForTests(): void {
  sharedStore = null
}
