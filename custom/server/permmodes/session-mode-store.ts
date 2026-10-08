// overlay/permmodes 会话权限档存储（v4 通道轮，2026-10-08）：per-profile 会话档——
// 与自治阶梯同键语义（"这个 agent 的这轮会话权限边界"）。
// 引擎面实证（upstream/zcode packages/shared/src/zcode-protocol-v4/command.ts）：
//   createSession.config.mode 已收字符串档位；switchCollaborationMode 命令可切
//   build/edit/plan/yolo（auto 档引擎面不可切）。执法不依赖引擎——enforce-gate
//   服务端瀑布拦截已生效，本存储补的是"档位从哪来、谁能切"。
// 存储：env HERMES_SESSION_MODES_DIR 下 JSON（原子写，autonomyladder 同范式）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PermissionMode } from './permission-modes'

export const SESSION_PERMISSION_MODES: readonly PermissionMode[] = [
  'readonly', 'plan', 'default', 'acceptEdits', 'dontAsk', 'auto', 'bypassPermissions',
]

type StoreShape = Record<string, PermissionMode>

function storeDir(): string {
  const env = process.env.HERMES_SESSION_MODES_DIR?.trim()
  if (env) return env
  return join(tmpdir(), 'hermes-session-modes')
}

function storeFile(): string {
  return join(storeDir(), 'session-modes.json')
}

function readStore(): StoreShape {
  try {
    const file = storeFile()
    if (!existsSync(file)) return {}
    return JSON.parse(readFileSync(file, 'utf-8')) as StoreShape
  } catch {
    return {} // 损坏视同未配置（fail-open，执法链退到全局档）
  }
}

function writeStore(s: StoreShape): void {
  const dir = storeDir()
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.session-modes.${process.pid}.tmp`)
  writeFileSync(tmp, JSON.stringify(s, null, 2))
  renameSync(tmp, storeFile())
}

export function isSessionPermissionMode(v: unknown): v is PermissionMode {
  return typeof v === 'string' && (SESSION_PERMISSION_MODES as readonly string[]).includes(v)
}

/** 该 profile 的会话档（未配置返回 null——执法链退到全局档，不装已治理）。 */
export function sessionModeOf(profileId: string): PermissionMode | null {
  if (!profileId) return null
  const s = readStore()
  const m = s[profileId]
  return isSessionPermissionMode(m) ? m : null
}

export function setSessionMode(profileId: string, mode: PermissionMode): void {
  if (!profileId) throw new Error('profileId 不能为空')
  const s = readStore()
  s[profileId] = mode
  writeStore(s)
}

export function clearSessionMode(profileId: string): boolean {
  const s = readStore()
  if (!(profileId in s)) return false
  delete s[profileId]
  writeStore(s)
  return true
}

export interface ModeChain {
  ladderConfigured: boolean
  sessionMode: PermissionMode | null
  globalMode: PermissionMode | null
  /** 生效档与出处：阶梯在位则阶梯胜（更具体的 per-profile 约束优先）；否则会话档＞全局档。 */
  winner: { source: 'ladder' | 'session' | 'global' | 'none'; mode: PermissionMode | null }
}

export function effectiveModeChain(profileId: string, globalMode?: PermissionMode | null): ModeChain {
  const g = globalMode !== undefined ? globalMode
    : ((process.env.HERMES_TOOL_ENFORCE_MODE as PermissionMode | undefined) ?? null)
  const sess = sessionModeOf(profileId)
  // ladder 在位与否由调用方域判定（这里只报档位链；enforce-gate 内阶梯优先裁决）
  const winner: ModeChain['winner'] = sess
    ? { source: 'session', mode: sess }
    : g
      ? { source: 'global', mode: g }
      : { source: 'none', mode: null }
  return { ladderConfigured: false, sessionMode: sess, globalMode: g, winner }
}
