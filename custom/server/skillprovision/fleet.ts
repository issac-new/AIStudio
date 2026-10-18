// overlay/skillprovision：能力发现面（fleet 聚合）。
//
// 数据源=中央仓 capability-reports/<machine>.json（provision-pull.sh 每日生成推送，
// 与 tri-node"跨机零新增服务"纪律一致：不加服务，只加中央仓里的一个文件）。
// 本层=只读聚合：机器清单+新鲜度（>48h 标 stale）+每机 profile×角色×技能数。
// 完整技能清单随响应返回（发现面搜索用；本地 localhost 量级可承受）。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { defaultHostRoot } from './reconcile'

export interface FleetProfileSummary {
  profile: string
  role: string | null
  skillCount: number
  skills: string[]
}

export interface FleetMachine {
  machine: string
  file: string
  generatedAt: number
  ageMinutes: number
  stale: boolean
  profiles: FleetProfileSummary[]
  totalSkills: number
}

export interface FleetReport {
  ok: true
  dir: string
  available: boolean
  note?: string
  machines: FleetMachine[]
  generatedAt: number
  bad: string[]
}

const STALE_MINUTES = 48 * 60
const MAX_MACHINES = 32
const MAX_PROFILES_PER_MACHINE = 200

export function fleetDir(hostRoot?: string): string {
  const env = process.env.SKILL_PROVISION_FLEET_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(hostRoot ?? defaultHostRoot(), 'profiles', '_shared', 'capability-reports')
}

interface RawReport {
  machine?: unknown
  generatedAt?: unknown
  profiles?: unknown
}

function parseReport(file: string, now: number): FleetMachine | string {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as RawReport
    const machine = typeof raw.machine === 'string' && raw.machine.trim() ? raw.machine.trim().slice(0, 64) : null
    if (!machine) return file
    const generatedAt = typeof raw.generatedAt === 'number' ? raw.generatedAt : 0
    const ageMinutes = generatedAt > 0 ? Math.max(0, Math.round((now - generatedAt) / 60000)) : Number.MAX_SAFE_INTEGER
    const profiles: FleetProfileSummary[] = []
    if (Array.isArray(raw.profiles)) {
      for (const p of raw.profiles.slice(0, MAX_PROFILES_PER_MACHINE)) {
        if (!p || typeof p !== 'object') continue
        const row = p as { profile?: unknown; role?: unknown; skillCount?: unknown; skills?: unknown }
        if (typeof row.profile !== 'string') continue
        profiles.push({
          profile: row.profile.slice(0, 64),
          role: typeof row.role === 'string' ? row.role.slice(0, 128) : null,
          skillCount: typeof row.skillCount === 'number' ? row.skillCount : 0,
          skills: Array.isArray(row.skills)
            ? row.skills.filter((s): s is string => typeof s === 'string').slice(0, 2000)
            : [],
        })
      }
    }
    return {
      machine,
      file,
      generatedAt,
      ageMinutes: Number.isFinite(ageMinutes) ? ageMinutes : -1,
      stale: !generatedAt || ageMinutes > STALE_MINUTES,
      profiles,
      totalSkills: profiles.reduce((n, p) => n + p.skillCount, 0),
    }
  } catch {
    return file
  }
}

/** 聚合中央仓能力上报（读面 fail-soft：坏文件记名跳过，绝不抛）。 */
export function readFleetReport(dir: string = fleetDir()): FleetReport {
  const now = Date.now()
  if (!existsSync(dir)) {
    return { ok: true, dir, available: false, note: `能力上报目录不存在：${dir}`, machines: [], generatedAt: 0, bad: [] }
  }
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().slice(0, MAX_MACHINES)
  } catch (e) {
    return { ok: true, dir, available: false, note: (e as Error).message, machines: [], generatedAt: 0, bad: [] }
  }
  const machines: FleetMachine[] = []
  const bad: string[] = []
  for (const f of files) {
    const parsed = parseReport(join(dir, f), now)
    if (typeof parsed === 'string') bad.push(f)
    else machines.push(parsed)
  }
  machines.sort((a, b) => b.generatedAt - a.generatedAt)
  return {
    ok: true,
    dir,
    available: true,
    note: bad.length > 0 ? `跳过坏文件 ${bad.length} 个` : undefined,
    machines,
    generatedAt: machines.reduce((m, x) => Math.max(m, x.generatedAt), 0),
    bad,
  }
}
