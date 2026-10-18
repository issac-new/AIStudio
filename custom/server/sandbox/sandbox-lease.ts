// overlay/sandbox 域：运行租约与任务后清扫（2026-10-18 残余项⑥）。
//
// 只做“自己管的目录”：清扫根由 HERMES_SANDBOX_WORKSPACES_ROOT 显式配置，
// 未配置时拒绝清扫；租约登记的 workspace 必须在根内、且不是根本身；
// 符号链接不跟随（lstat 判定），避免借链接删到根外。
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join, relative, resolve } from 'path'

export interface SandboxLease {
  id: string
  runId: string
  sessionId?: string
  workspace: string
  createdAt: number
  expiresAt: number
  sweptAt?: number
}

interface LeaseFile { version: 1; leases: SandboxLease[] }

export interface SweepResult {
  root: string | null
  checked: number
  swept: string[]
  skipped: Array<{ id: string; reason: string }>
}

function leasePath(): string {
  const env = process.env.SANDBOX_LEASE_FILE?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes-web-ui', 'sandbox-leases.json')
}

export function sandboxRoot(): string | null {
  const env = process.env.HERMES_SANDBOX_WORKSPACES_ROOT?.trim()
  return env ? resolve(env.replace(/^~/, homedir())) : null
}

function readLeases(): SandboxLease[] {
  try {
    if (!existsSync(leasePath())) return []
    const parsed = JSON.parse(readFileSync(leasePath(), 'utf8')) as Partial<LeaseFile>
    return Array.isArray(parsed.leases) ? parsed.leases.filter((l) => l && typeof l.workspace === 'string') : []
  } catch {
    return []
  }
}

function writeLeases(leases: SandboxLease[]): void {
  const file = leasePath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify({ version: 1, leases } satisfies LeaseFile, null, 2), 'utf8')
  renameSync(tmp, file)
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

/** 登记租约：配置了根时 workspace 必须在根内（根本身不允许）。 */
export function registerLease(input: {
  runId: string
  sessionId?: string
  workspace: string
  ttlMs?: number
  now?: number
}): { ok: true; lease: SandboxLease } | { ok: false; problems: string[] } {
  if (!input.runId?.trim()) return { ok: false, problems: ['runId 必填'] }
  const workspace = resolve(input.workspace)
  const root = sandboxRoot()
  if (root) {
    if (!within(root, workspace)) return { ok: false, problems: [`workspace 不在沙箱根内：${workspace}`] }
    if (workspace === root) return { ok: false, problems: ['不允许把沙箱根本身登记为租约'] }
  }
  const now = input.now ?? Date.now()
  const ttl = Math.max(60_000, input.ttlMs ?? 24 * 3_600_000)
  const lease: SandboxLease = {
    id: `lease-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    runId: input.runId.trim(),
    sessionId: input.sessionId,
    workspace,
    createdAt: now,
    expiresAt: now + ttl,
  }
  const leases = readLeases().filter((l) => l.runId !== lease.runId)
  leases.push(lease)
  writeLeases(leases)
  return { ok: true, lease }
}

export function listLeases(now = Date.now()): SandboxLease[] {
  return readLeases().map((l) => ({ ...l, expired: l.expiresAt <= now } as SandboxLease & { expired: boolean }))
}

/**
 * 清扫过期租约：只删沙箱根内、非符号链接的 workspace 目录。
 * 未配置根 → 拒绝清扫（返回 root:null，不删任何东西）。
 */
export function sweepExpiredLeases(opts: { now?: number; dryRun?: boolean } = {}): SweepResult {
  const now = opts.now ?? Date.now()
  const root = sandboxRoot()
  const leases = readLeases()
  const expired = leases.filter((l) => l.expiresAt <= now && !l.sweptAt)
  if (!root) return { root: null, checked: expired.length, swept: [], skipped: expired.map((l) => ({ id: l.id, reason: '未配置 HERMES_SANDBOX_WORKSPACES_ROOT' })) }

  const swept: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  for (const lease of expired) {
    const workspace = resolve(lease.workspace)
    if (!within(root, workspace) || workspace === root) {
      skipped.push({ id: lease.id, reason: 'workspace 不在沙箱根内' })
      continue
    }
    if (!existsSync(workspace)) {
      swept.push(lease.id)
      lease.sweptAt = now
      continue
    }
    try {
      if (lstatSync(workspace).isSymbolicLink()) {
        skipped.push({ id: lease.id, reason: 'workspace 是符号链接（不跟随）' })
        continue
      }
      if (!opts.dryRun) rmSync(workspace, { recursive: true, force: true })
      swept.push(lease.id)
      lease.sweptAt = now
    } catch (e) {
      skipped.push({ id: lease.id, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  if (!opts.dryRun && swept.length > 0) writeLeases(leases)
  return { root, checked: expired.length, swept, skipped }
}

/** 启动 janitor：显式配置根与间隔才运行（unref 不阻塞进程退出）。 */
export function startSandboxJanitorIfEnabled(): (() => void) | null {
  if (process.env.NODE_ENV === 'test') return null
  if (!sandboxRoot()) return null
  const raw = Number(process.env.HERMES_SANDBOX_SWEEP_INTERVAL_MS)
  if (!Number.isFinite(raw) || raw < 60_000) return null
  const timer = setInterval(() => { try { sweepExpiredLeases() } catch { /* fail-soft */ } }, raw)
  timer.unref?.()
  return () => clearInterval(timer)
}

/** 测试隔离。 */
export function _useLeaseFileForTests(file: string): void {
  process.env.SANDBOX_LEASE_FILE = file
}

export function _resetLeaseFileForTests(): void {
  delete process.env.SANDBOX_LEASE_FILE
}
