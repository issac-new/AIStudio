// overlay/managedsettings 域：组织级托管配置（2026-11-05 AI Native D1 权限最小化批）。
//
// 对齐 Claude Code managed-settings 语义：组织下发的锁定面优先于一切用户/项目级
// 配置，Agent 与环境变量都改不了。v1 锁定面=工具执法总闸（toolEnforceLocked）；
// extraDeniedTools 作为策略链最前的动态 deny（与仓内默认策略包叠加）。
//
// 加载序（先命中先用，均 fail-soft）：
//   1. ~/.hermes-web-ui/managed-settings.json（部署侧组织下发）
//   2. <repoRoot>/config/managed-settings.json（仓内基线，随 git 治理）
//   3. null（未托管）
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { repoRoot } from '../lib/upstream'

export interface ManagedSettings {
  version: 1
  /** 锁定工具执法总闸：true 时 env HERMES_TOOL_ENFORCE 失效 */
  toolEnforceLocked?: boolean
  /** 总闸锁定值（toolEnforceLocked 才生效） */
  toolEnforce?: 0 | 1
  /** 组织级额外禁用工具（并入策略链最前 deny） */
  extraDeniedTools?: string[]
  note?: string
  /** 来源路径（展示面用） */
  _source?: string
}

let cache: { at: number; value: ManagedSettings | null } | null = null
const TTL_MS = 5_000

function parseAndValidate(text: string, source: string): ManagedSettings | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    if (raw.version !== 1) return null
    const out: ManagedSettings = { version: 1, _source: source }
    if (typeof raw.toolEnforceLocked === 'boolean') out.toolEnforceLocked = raw.toolEnforceLocked
    if (raw.toolEnforce === 0 || raw.toolEnforce === 1) out.toolEnforce = raw.toolEnforce
    if (Array.isArray(raw.extraDeniedTools) && raw.extraDeniedTools.every((t) => typeof t === 'string')) {
      out.extraDeniedTools = raw.extraDeniedTools as string[]
    }
    if (typeof raw.note === 'string') out.note = raw.note
    return out
  } catch {
    return null // 坏文件=未托管（fail-soft，不猜数不阻断启动）
  }
}

/** 读取托管配置（5s 缓存；两处都不在=未托管）。 */
export function loadManagedSettings(): ManagedSettings | null {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const deploy = join(homedir(), '.hermes-web-ui', 'managed-settings.json')
  let value: ManagedSettings | null = null
  if (existsSync(deploy)) {
    value = parseAndValidate(readFileSync(deploy, 'utf8'), deploy)
  }
  if (!value) {
    const inRepo = join(repoRoot(), 'config/managed-settings.json')
    if (existsSync(inRepo)) {
      value = parseAndValidate(readFileSync(inRepo, 'utf8'), inRepo)
    }
  }
  cache = { at: Date.now(), value }
  return value
}

/** 测试注入清缓存。 */
export function resetManagedSettingsCache(): void {
  cache = null
}
