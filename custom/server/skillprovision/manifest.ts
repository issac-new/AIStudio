// overlay/skillprovision：机器可读的角色→技能清单（唯一期望源）。
//
// 位置：~/.hermes-web-ui/overlay/skill-provisioning.json（SKILL_PROVISION_MANIFEST
// 可覆盖）。用 JSON 不用 YAML：overlay 依赖面没有 YAML 解析库，新增依赖会扩散到
// 共享 node_modules。清单缺失时报告用内置示例并标 source=builtin；供给端点拒绝
// 用示例清单执行，避免误装。
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { ManifestLoad, ManifestRole, ProvisionManifest } from './types'

const SAFE_SKILL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** 内置示例清单（仅报告态）。来源=推演树 mx-lib.sh 硬编码角色分支 + catalog 通用项。 */
export function builtinManifest(): ProvisionManifest {
  return {
    version: 1,
    roles: [
      {
        match: 'orchestrator',
        skills: [
          'cognition-lattice', 'memory-consolidation', 'routine-self-reflect', 'kanban-worker',
          'kanban-orchestrator', 'delegation-brief-format', 'committee-review', 'adversarial-review-lens',
        ],
      },
      { match: '*-tester', skills: ['backend-integration-testing', 'test-evidence-verification'] },
      { match: '*-sys-analyst', skills: ['aipaydev-sys-analysis'] },
      { match: '*', skills: ['cognition-lattice', 'memory-consolidation', 'routine-self-reflect'] },
    ],
  }
}

export function manifestPath(): string {
  const env = process.env.SKILL_PROVISION_MANIFEST?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes-web-ui', 'overlay', 'skill-provisioning.json')
}

function validateMatch(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('roles[].match 必须是非空字符串')
  const match = value.trim()
  const stars = (match.match(/\*/g) ?? []).length
  if (stars === 0) {
    if (!SAFE_SKILL.test(match)) throw new Error(`角色名不合法：${match}`)
    return match
  }
  if (stars > 1) throw new Error(`match 最多一个 *：${match}`)
  if (match !== '*' && !match.startsWith('*') && !match.endsWith('*')) {
    throw new Error(`* 只能出现在开头或结尾：${match}`)
  }
  const body = match.replace('*', '')
  if (!body) return '*'
  if (!/^[A-Za-z0-9._-]+$/.test(body)) throw new Error(`角色模式不合法：${match}`)
  return match
}

/** 校验并归一 manifest；非法输入抛错（调用方决定是否降级）。 */
export function normalizeManifest(raw: unknown): ProvisionManifest {
  if (!raw || typeof raw !== 'object') throw new Error('manifest 必须是对象')
  const obj = raw as { version?: unknown; roles?: unknown }
  if (obj.version !== 1) throw new Error('manifest.version 必须为 1')
  if (!Array.isArray(obj.roles) || obj.roles.length === 0) throw new Error('manifest.roles 必须是非空数组')
  const roles: ManifestRole[] = []
  for (const [i, entry] of obj.roles.entries()) {
    if (!entry || typeof entry !== 'object') throw new Error(`roles[${i}] 必须是对象`)
    const e = entry as { match?: unknown; skills?: unknown; note?: unknown }
    const match = validateMatch(e.match)
    if (!Array.isArray(e.skills)) throw new Error(`roles[${i}].skills 必须是数组`)
    const skills: string[] = []
    for (const s of e.skills) {
      if (typeof s !== 'string' || !SAFE_SKILL.test(s.trim())) throw new Error(`roles[${i}] 技能名不合法：${String(s)}`)
      if (!skills.includes(s.trim())) skills.push(s.trim())
    }
    const note = typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 200) : undefined
    roles.push({ match, skills, ...(note ? { note } : {}) })
  }
  return { version: 1, roles }
}

/** 读 manifest；缺失/坏文件降级为内置示例并如实带 errors。 */
export function loadManifest(path: string = manifestPath()): ManifestLoad {
  if (!existsSync(path)) {
    return { path, exists: false, source: 'builtin', manifest: builtinManifest(), errors: [] }
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return { path, exists: true, source: 'file', manifest: normalizeManifest(raw), errors: [] }
  } catch (e) {
    return {
      path, exists: true, source: 'builtin', manifest: builtinManifest(),
      errors: [`manifest 解析失败：${(e as Error).message}`],
    }
  }
}

/** 原子写 manifest；旧文件先备份 `.bak-<ISO>`。 */
export function writeManifest(raw: unknown, path: string = manifestPath()): { path: string; backup?: string; manifest: ProvisionManifest } {
  const manifest = normalizeManifest(raw)
  mkdirSync(dirname(path), { recursive: true })
  let backup: string | undefined
  if (existsSync(path)) {
    backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
    copyFileSync(path, backup)
  }
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
  return { path, backup, manifest }
}

interface MatchedRole {
  match: string
  skills: string[]
}

function specificity(match: string): number {
  if (match === '*') return 0
  if (match.startsWith('*')) return 500 + match.length
  if (match.endsWith('*')) return 400 + match.length
  return 1000 + match.length
}

function roleMatches(match: string, profile: string): boolean {
  if (match === '*') return true
  if (match.startsWith('*')) return profile.endsWith(match.slice(1))
  if (match.endsWith('*')) return profile.startsWith(match.slice(0, -1))
  return profile === match
}

/**
 * 角色匹配：精确 > 最长后缀 > 最长前缀 > `*`。同分多条合并技能集合并把 match
 * 拼成 `a|b` 如实暴露歧义（调用方在报告里能看到不是单一角色）。
 */
export function matchRole(profile: string, roles: readonly ManifestRole[]): MatchedRole | null {
  const hits = roles.filter((r) => roleMatches(r.match, profile))
  if (hits.length === 0) return null
  const best = Math.max(...hits.map((r) => specificity(r.match)))
  const winners = hits.filter((r) => specificity(r.match) === best)
  const skills = [...new Set(winners.flatMap((r) => r.skills))].sort()
  return { match: [...new Set(winners.map((r) => r.match))].join('|'), skills }
}
