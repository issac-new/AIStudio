/**
 * 技能治理域存储面（skillgov）：角色映射（profile 后缀 → 技能来源）与教训库
 * （profile 技能内的 lessons.md 清单）。纯文件面、fail-soft、有界扫描。
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import Router from '@koa/router'

export interface RoleMapping {
  /** profile 名后缀模式（如 "-tester"） */
  suffix: string
  /** 技能来源列表：从哪个主 profile 的技能目录按名拷贝 */
  sources: Array<{ profile: string; skill: string }>
  note?: string
}

const STORE_KEY = 'skillgov:role-mappings'

function storeFile(): string {
  return process.env.SKILLGOV_STORE?.trim()
    ? resolve(process.env.SKILLGOV_STORE.replace(/^~/, homedir()))
    : join(homedir(), '.hermes-web-ui', 'overlay', 'skill-role-mappings.json')
}

export function profilesRoot(): string {
  return process.env.HERMES_PROFILES_ROOT?.trim()
    ? resolve(process.env.HERMES_PROFILES_ROOT.replace(/^~/, homedir()))
    : join(homedir(), '.hermes', 'profiles')
}

export function readRoleMappings(): RoleMapping[] {
  try {
    const raw = JSON.parse(readFileSync(storeFile(), 'utf8')) as { mappings?: RoleMapping[] }
    return Array.isArray(raw.mappings) ? raw.mappings.filter((m) => m && typeof m.suffix === 'string' && Array.isArray(m.sources)) : []
  } catch {
    return []
  }
}

export function writeRoleMappings(mappings: RoleMapping[]): void {
  const file = storeFile()
  const dir = dirname(file)
  if (!existsSync(dir)) {
    writeFileSync(join(dir, '..', 'overlay', '.keep'), '') // 容错占位不必要，直接尝试
  }
  writeFileSync(file, JSON.stringify({ mappings }, null, 2) + '\n', 'utf8')
}

export interface LessonEntry {
  profile: string
  skill: string
  path: string
  lines: number
  /** 最近几条（尾 5 行非空） */
  tail: string[]
}

const LESSON_SCAN_PROFILE_LIMIT = 64
const LESSON_SCAN_SKILL_LIMIT = 64

/** 教训库清单：扫描各 profile 技能目录下的 references/lessons.md（有界 fail-soft）。 */
export function listLessons(rootOverride?: string): LessonEntry[] {
  const root = rootOverride ?? profilesRoot()
  const out: LessonEntry[] = []
  try {
    const profiles = readdirSync(root).filter((d) => !d.startsWith('.')).slice(0, LESSON_SCAN_PROFILE_LIMIT)
    for (const profile of profiles) {
      const skillsDir = join(root, profile, 'skills')
      if (!existsSync(skillsDir)) continue
      try {
        const skills = readdirSync(skillsDir).filter((d) => !d.startsWith('.')).slice(0, LESSON_SCAN_SKILL_LIMIT)
        for (const skill of skills) {
          const p = join(skillsDir, skill, 'references', 'lessons.md')
          try {
            const st = statSync(p)
            if (!st.isFile() || st.size === 0 || st.size > 262_144) continue
            const lines = readFileSync(p, 'utf8').split('\n').filter((l) => l.trim())
            out.push({
              profile, skill, path: p, lines: lines.length,
              tail: lines.slice(-5).map((l) => l.slice(0, 120)),
            })
          } catch { /* 单文件跳过 */ }
        }
      } catch { /* skills 目录扫描失败跳过 */ }
    }
  } catch { /* profiles 根扫描失败返回空 */ }
  return out
}

export const router = new Router({ prefix: '/api/skillgov' })

router.get('/role-mappings', async (ctx) => {
  ctx.body = { ok: true, mappings: readRoleMappings(), store: storeFile(), profilesRoot: profilesRoot() }
})

router.put('/role-mappings', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { mappings?: RoleMapping[] }
  if (!Array.isArray(body.mappings)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'mappings 数组必填' }
    return
  }
  const clean = body.mappings.filter((m) => m && typeof m.suffix === 'string' && m.suffix && Array.isArray(m.sources))
  writeRoleMappings(clean)
  ctx.body = { ok: true, mappings: readRoleMappings() }
})

router.get('/lessons', async (ctx) => {
  ctx.body = { ok: true, lessons: listLessons(typeof ctx.query.root === 'string' && ctx.query.root ? ctx.query.root : undefined) }
})

export default router
