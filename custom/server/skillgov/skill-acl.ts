/**
 * 技能四层授权的调用面（SoduWork 治理闭环吸收，2026-11-19）。
 *
 * 四层语义（与 skillprovision / profiles.yaml 分工）：
 *   - audience：谁能发现/安装——由 skillprovision 的 profile ACL 与 profiles.yaml 负责；
 *   - install：能否装进某 profile——安装面（本模块提供纯函数，供供给面复用）；
 *   - invoke：能否装载（skill_view）——本模块的运行时执法点；
 *   - edit：能否改写（skill_manage）——本模块的运行时执法点。
 *
 * 策略文件（JSON，缺省 `<webUi>/skillgov/skill-acl.json`，可用 SKILLGOV_ACL_PATH 覆盖）：
 *   {
 *     "version": 1,
 *     "default": "allow" | "deny",
 *     "profiles": { "<profile>": { "invoke": {"allow": ["github-*"], "deny": ["prod-*"]}, "edit": {...} } },
 *     "users":    { "<userId>":  { "invoke": {...}, "edit": {...} } }
 *   }
 *
 * 纪律：
 * - 没有策略文件 = 不改变现状（allow），避免部署即锁死。
 * - 策略文件存在但解析失败 = fail-closed（deny，source=acl_invalid），不静默放行。
 * - 命中规则集时 deny 优先；allow 列表为空视为「显式禁止」；
 *   未列出 allow 的技能 = 拒绝（关闭式清单）。
 * - 未命中任何规则集时回落到 default（缺省 allow，可配 deny 做全局关闭）。
 * - 用户规则与 profile 规则同时存在时：任一 deny 即 deny；至少一个 allow 才放行。
 *
 * 本模块只做纯判定，不读工具上下文之外的任何状态；文件读取按 mtime 缓存。
 */
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { underWebUi } from '../lib/paths'

export type SkillAclAction = 'install' | 'invoke' | 'edit'
export type AclDefault = 'allow' | 'deny'

export interface SkillAclRules {
  allow?: string[]
  deny?: string[]
}

export interface SkillPrincipalPolicy {
  install?: SkillAclRules
  invoke?: SkillAclRules
  edit?: SkillAclRules
}

export interface SkillAclPolicy {
  version: 1
  default?: AclDefault
  profiles?: Record<string, SkillPrincipalPolicy>
  users?: Record<string, SkillPrincipalPolicy>
}

export interface SkillAclContext {
  userId?: string
  profileId?: string
}

export interface SkillAclDecision {
  allowed: boolean
  reason: string
  source: 'profile' | 'user' | 'default' | 'none' | 'acl_invalid'
  /** 命中的规则摘要（如 `profile:worker deny:prod-*`）。 */
  rule?: string
}

interface CachedPolicy {
  path: string
  mtimeMs: number
  policy: SkillAclPolicy | null
  invalid?: string
}

let cached: CachedPolicy | null = null

export function skillAclPath(): string {
  const env = process.env.SKILLGOV_ACL_PATH?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return underWebUi('skillgov', 'skill-acl.json')
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

function normalizeRules(raw: unknown): SkillAclRules | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const allow = asStringArray(obj.allow)
  const deny = asStringArray(obj.deny)
  if (allow === undefined && deny === undefined) return undefined
  return { ...(allow ? { allow } : {}), ...(deny ? { deny } : {}) }
}

function normalizePrincipal(raw: unknown): SkillPrincipalPolicy | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const out: SkillPrincipalPolicy = {}
  for (const action of ['install', 'invoke', 'edit'] as SkillAclAction[]) {
    const rules = normalizeRules(obj[action])
    if (rules) out[action] = rules
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizePolicy(raw: unknown): SkillAclPolicy | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.version !== 1) return null
  const out: SkillAclPolicy = { version: 1 }
  if (obj.default === 'allow' || obj.default === 'deny') out.default = obj.default
  for (const bucket of ['profiles', 'users'] as const) {
    const src = obj[bucket]
    if (!src || typeof src !== 'object') continue
    const map: Record<string, SkillPrincipalPolicy> = {}
    for (const [key, value] of Object.entries(src as Record<string, unknown>)) {
      const principal = normalizePrincipal(value)
      if (principal) map[key] = principal
    }
    if (Object.keys(map).length > 0) out[bucket] = map
  }
  return out
}

function loadPolicy(): CachedPolicy {
  const path = skillAclPath()
  let mtimeMs = -1
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch {
    cached = { path, mtimeMs: -1, policy: null }
    return cached
  }
  if (cached && cached.path === path && cached.mtimeMs === mtimeMs) return cached
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const policy = normalizePolicy(raw)
    cached = policy
      ? { path, mtimeMs, policy }
      : { path, mtimeMs, policy: null, invalid: '策略结构无效（version=1 且 profiles/users/规则形状）' }
  } catch (err) {
    cached = { path, mtimeMs, policy: null, invalid: `策略解析失败：${err instanceof Error ? err.message : String(err)}` }
  }
  return cached
}

/** 技能名匹配：`*` 通配（大小写不敏感），其余按精确名。 */
export function matchSkill(pattern: string, skill: string): boolean {
  const p = pattern.trim()
  if (!p) return false
  if (p === '*') return true
  if (!p.includes('*')) return p.toLowerCase() === skill.toLowerCase()
  const escaped = p
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`, 'i').test(skill)
}

function evaluateRules(
  rules: SkillAclRules | undefined,
  skill: string,
  label: string,
): SkillAclDecision | null {
  if (!rules) return null
  const deny = (rules.deny ?? []).find((pattern) => matchSkill(pattern, skill))
  if (deny) {
    return {
      allowed: false,
      source: label.startsWith('user:') ? 'user' : 'profile',
      rule: `${label} deny:${deny}`,
      reason: `${label} 显式拒绝 ${skill}（deny ${deny}）`,
    }
  }
  const allow = rules.allow ?? []
  if (allow.length === 0) {
    return {
      allowed: false,
      source: label.startsWith('user:') ? 'user' : 'profile',
      rule: `${label} allow:[]`,
      reason: `${label} 的 allow 列表为空，按关闭式清单拒绝 ${skill}`,
    }
  }
  const hit = allow.find((pattern) => matchSkill(pattern, skill))
  if (hit) {
    return {
      allowed: true,
      source: label.startsWith('user:') ? 'user' : 'profile',
      rule: `${label} allow:${hit}`,
      reason: `${label} 允许 ${skill}（allow ${hit}）`,
    }
  }
  return {
    allowed: false,
    source: label.startsWith('user:') ? 'user' : 'profile',
    rule: `${label} allow:[${allow.join(',')}]`,
    reason: `${label} 的 allow 列表未包含 ${skill}`,
  }
}

export function evaluateSkillAcl(input: {
  skill: string
  action: SkillAclAction
  context?: SkillAclContext
}): SkillAclDecision {
  const skill = String(input.skill || '').trim()
  if (!skill) {
    return { allowed: false, source: 'none', reason: '技能名为空，无法授权' }
  }
  const loaded = loadPolicy()
  if (loaded.invalid) {
    return { allowed: false, source: 'acl_invalid', reason: loaded.invalid }
  }
  const policy = loaded.policy
  if (!policy) {
    return { allowed: true, source: 'none', reason: '未配置技能 ACL，保持现状放行' }
  }
  const userId = input.context?.userId?.trim()
  const profileId = input.context?.profileId?.trim()
  const userRules = userId ? policy.users?.[userId]?.[input.action] : undefined
  const profileRules = profileId ? policy.profiles?.[profileId]?.[input.action] : undefined
  const userDecision = evaluateRules(userRules, skill, `user:${userId ?? '?'}`)
  const profileDecision = evaluateRules(profileRules, skill, `profile:${profileId ?? '?'}`)
  const explicit = [userDecision, profileDecision].filter((d): d is SkillAclDecision => d !== null)
  const denied = explicit.find((d) => !d.allowed)
  if (denied) return denied
  const allowed = explicit.find((d) => d.allowed)
  if (allowed) return allowed
  const fallback = policy.default ?? 'allow'
  return {
    allowed: fallback === 'allow',
    source: 'default',
    rule: `default:${fallback}`,
    reason: fallback === 'allow'
      ? '未命中 principal 规则，按 default=allow 放行'
      : '未命中 principal 规则，按 default=deny 拒绝',
  }
}

/** 测试隔离：清空按 mtime 的缓存。 */
export function _resetSkillAclCacheForTests(): void {
  cached = null
}
