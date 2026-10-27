// A2A 看板归属读模型（a2a-board-harness-alignment 挂账清偿，2026-10-27）。
//
// 数据源＝team/shared/domain-registry.yaml（板归属正本：每块看板 = 一个领域团队 +
// 一位本机人类负责人，2026-10-26 校正批立）。产品面读模型：板→团队 profiles→
// 负责人岗位标签＋账号环境变量名。板级团队键口径与 runtime/hermes_cli/
// board_team_keys.py 同源（profiles 优先、profile_scope 回落）——registry 的
// profiles 即围栏契约键，本读模型只读它，不再造第二口径。
//
// fail-soft：正本缺席/解析失败返回 available:false（reason 如实），不猜数。
// 脱敏：owner_account_env 只报环境变量名与「已配置与否」，账号原值绝不透出。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface BoardOwnershipEntry {
  domain: string
  board: string
  profiles: string[]
  ownerOfDomain?: string | null
  ownerLabel?: string | null
  ownerAccountEnv?: string | null
  /** 负责人账号环境变量在本服务进程是否已配置（true/false；不透值）。 */
  ownerAccountConfigured: boolean | null
}

export type BoardOwnershipReport =
  | { available: true; source: string; updated?: string | null; entries: BoardOwnershipEntry[] }
  | { available: false; reason: string; source: string }

/** 正本路径：env 覆盖 ＞ 仓内 team/shared/domain-registry.yaml（sim-launch 同款解析法）。 */
export function domainRegistryPath(): string {
  const env = process.env.DOMAIN_REGISTRY_PATH?.trim()
  if (env) return env
  const here = typeof __dirname !== 'undefined' ? __dirname : resolve(process.cwd(), 'custom/server/a2a')
  return resolve(here, '../../..', 'team/shared/domain-registry.yaml')
}

interface RegistryDomain {
  domain?: unknown
  board?: unknown
  profiles?: unknown
  owner_of_domain?: unknown
  owner_label?: unknown
  owner_account_env?: unknown
}

/** 纯解析：yaml 文本 → 归属条目（fields 宽容缺省；domains 非数组＝解析失败）。返回型走推断（判别联合窄化与 taskledger-store 同款）。 */
export function parseBoardOwnership(text: string) {
  let parsed: { updated?: unknown; domains?: unknown }
  try {
    // require('yaml') 惰性加载——与 governance-ledger/squad-protocol 同款先例
    const { parse } = require('yaml') as typeof import('yaml')
    parsed = parse(text) as { updated?: unknown; domains?: unknown }
  } catch (e) {
    return { ok: false, reason: `domain-registry.yaml 解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!parsed || !Array.isArray(parsed.domains)) {
    return { ok: false, reason: 'domain-registry.yaml 缺 domains 数组（结构不符）' }
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const entries: BoardOwnershipEntry[] = []
  for (const raw of parsed.domains as RegistryDomain[]) {
    const domain = str(raw?.domain)
    const board = str(raw?.board)
    if (!domain || !board) continue // 行残缺如实跳过（fail-soft），不猜
    const profiles = Array.isArray(raw?.profiles) ? raw.profiles.filter((p): p is string => typeof p === 'string' && !!p.trim()).map((p) => p.trim()) : []
    const ownerAccountEnv = str(raw?.owner_account_env)
    entries.push({
      domain,
      board,
      profiles,
      ownerOfDomain: str(raw?.owner_of_domain),
      ownerLabel: str(raw?.owner_label),
      ownerAccountEnv,
      ownerAccountConfigured: ownerAccountEnv ? process.env[ownerAccountEnv] !== undefined : null,
    })
  }
  return { ok: true, entries, updated: str(parsed.updated) }
}

/** 读模型入口：正本在则投影，不在则 available:false（不造假）。 */
export function loadBoardOwnership(): BoardOwnershipReport {
  const path = domainRegistryPath()
  if (!existsSync(path)) {
    return { available: false, reason: `板归属正本缺席：${path}（DOMAIN_REGISTRY_PATH 可覆盖）`, source: path }
  }
  try {
    const parsed = parseBoardOwnership(readFileSync(path, 'utf8'))
    if (parsed.ok) {
      const ok = parsed as { ok: true; entries: BoardOwnershipEntry[]; updated?: string | null }
      return { available: true, source: path, updated: ok.updated ?? null, entries: ok.entries }
    }
    return { available: false, reason: parsed.reason ?? 'domain-registry.yaml 结构不符', source: path }
  } catch (e) {
    return { available: false, reason: `正本读取失败：${e instanceof Error ? e.message : String(e)}`, source: path }
  }
}
