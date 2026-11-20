// capabilitypool/collect.ts —— 能力供需快照采集（只读）
//
// 只读五源：kanban 任务（需求）、能力台账、能力图、技能供给清单、profiles/舰队上报（供给）。
// 每个源独立 fail-soft：文件/库缺席返回 available:false 与 note，不抛、不猜数。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadCapabilityLedger } from '../governance/governance-ledger'
import { collectAssigneeStats, openReadonly } from '../governance/governance-analytics'
import { allBoardDbsOf } from '../services/hermes/kanban-layout'
import { loadManifest } from '../skillprovision/manifest'
import { readFleetReport } from '../skillprovision/fleet'
import { repoRoot } from '../lib/upstream'
import { hermesHome } from '../lib/paths'
import { deriveSupplyDemand } from './derive'
import type {
  CapabilityDemandTask,
  CapabilityGraphSnapshot,
  CapabilityLedgerSnapshot,
  ProfileCapabilitySnapshot,
  ProfilesSnapshot,
  SkillProvisioningSnapshot,
  SupplyDemandReport,
  FleetSnapshot,
} from './types'

interface KanbanTaskSkillsRow {
  id: string
  status: string
  created_at: number
  skills: string | null
  /** Task 8 落地后新列；旧库（无该列）经 fallback 查询为 undefined */
  required_capabilities?: string | null
}

function parseSkills(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

/**
 * 需求侧：读所有看板库中声明了能力需求的任务。
 * Task 8 后：`required_capabilities`（declared 口径）优先；旧库无该列时回落
 * `skills`（skills-fallback 口径）。返回 `declared` 标记供 derive 的 demandSource 切换。
 */
export async function collectDemands(homeDir?: string): Promise<CapabilityDemandTask[]> {
  const home = homeDir?.trim() || hermesHome()
  const out: CapabilityDemandTask[] = []
  for (const entry of allBoardDbsOf(home)) {
    let db
    try {
      db = await openReadonly(entry.dbPath)
    } catch {
      continue
    }
    try {
      let rows: KanbanTaskSkillsRow[]
      let declared = true
      try {
        rows = db.prepare(
          "SELECT id, status, created_at, skills, required_capabilities FROM tasks "
          + "WHERE (required_capabilities IS NOT NULL AND required_capabilities != '' AND required_capabilities != '[]') "
          + "   OR (skills IS NOT NULL AND skills != '' AND skills != '[]')",
        ).all() as unknown as KanbanTaskSkillsRow[]
      } catch {
        // 旧库无 required_capabilities 列：回落 skills-only（过渡口径）
        rows = db.prepare(
          "SELECT id, status, created_at, skills FROM tasks WHERE skills IS NOT NULL AND skills != '' AND skills != '[]'",
        ).all() as unknown as KanbanTaskSkillsRow[]
        declared = false
      }
      for (const row of rows) {
        const rcTags = declared ? parseSkills(row.required_capabilities ?? null) : []
        const skillTags = parseSkills(row.skills)
        // declared 口径优先：有能力需求列声明的任务按 declared；仅 skills 的按 fallback
        const tags = rcTags.length > 0 ? rcTags : skillTags
        if (tags.length === 0) continue
        let firstRunStartedAt: number | null = null
        try {
          const run = db.prepare(
            'SELECT MIN(started_at) AS first FROM task_runs WHERE task_id = ?',
          ).get(row.id) as { first?: number | null } | undefined
          if (run?.first != null) firstRunStartedAt = run.first * 1000
        } catch {
          firstRunStartedAt = null
        }
        out.push({
          taskId: row.id,
          board: entry.slug,
          tags,
          status: row.status,
          createdAt: (row.created_at ?? 0) * 1000,
          firstRunStartedAt,
        })
      }
    } catch {
      // 单板读失败跳过；其余板照常（诚实降级）
    } finally {
      try { db.close() } catch { /* 已关 */ }
    }
  }
  return out
}

/** 供给侧：能力台账 L3 单元快照（不读运行实耗；供派单期轻量准入）。 */
export function collectLedgerSnapshot(): CapabilityLedgerSnapshot {
  const res = loadCapabilityLedger()
  if (!res.exists || !res.doc) {
    return { available: false, units: [], note: res.problems.join('；') || '能力台账缺席' }
  }
  return {
    available: true,
    units: res.doc.units.map((unit) => ({
      id: unit.id,
      skills: unit.skills ?? [],
      lifecycle: unit.lifecycle,
      lastUsedAt: null,
    })),
  }
}

/** 供给侧：能力台账 L3 单元；最近使用时间取既有 assignee 实耗面，不另造口径。 */
export async function collectLedger(): Promise<CapabilityLedgerSnapshot> {
  const base = collectLedgerSnapshot()
  if (!base.available) return base
  let stats: Awaited<ReturnType<typeof collectAssigneeStats>>
  try {
    stats = await collectAssigneeStats()
  } catch {
    stats = new Map()
  }
  return {
    ...base,
    units: base.units.map((unit) => ({
      ...unit,
      lastUsedAt: stats.get(unit.id)?.lastActiveAt ?? null,
    })),
  }
}

function parseYamlText(text: string): unknown {
  // 与 governance-ledger.ts 同款动态 require：yaml 是既有传递依赖，避免新增路径。
  const { parse } = require('yaml') as typeof import('yaml')
  return parse(text)
}

function teamFile(name: string): string {
  return join(repoRoot(), 'team', 'shared', name)
}

/** 供给侧：能力图（手工声明区）。生成器不在仓内，缺失/坏档如实 unavailable。 */
export function collectGraph(): CapabilityGraphSnapshot {
  const file = teamFile('capability-graph.yaml')
  if (!existsSync(file)) return { available: false, agents: [], note: `能力图缺席：${file}` }
  try {
    const doc = parseYamlText(readFileSync(file, 'utf8')) as {
      nodes?: { agents?: Array<{ name?: unknown; capabilities?: unknown; reliability?: unknown }> }
    }
    const agents = (doc.nodes?.agents ?? [])
      .filter((agent) => typeof agent.name === 'string' && agent.name.trim() !== '')
      .map((agent) => ({
        name: String(agent.name).trim(),
        capabilities: Array.isArray(agent.capabilities)
          ? agent.capabilities.filter((tag): tag is string => typeof tag === 'string')
          : [],
        reliability: typeof agent.reliability === 'number' && Number.isFinite(agent.reliability)
          ? agent.reliability
          : null,
      }))
    return { available: true, agents }
  } catch (e) {
    return { available: false, agents: [], note: `能力图解析失败：${(e as Error).message}` }
  }
}

/** 供给侧：profile 技能声明（skills_enabled / skills_pinned）。 */
export function collectProfiles(): ProfilesSnapshot {
  const file = teamFile('profiles.yaml')
  if (!existsSync(file)) return { available: false, profiles: [], note: `profiles.yaml 缺席：${file}` }
  try {
    const doc = parseYamlText(readFileSync(file, 'utf8')) as {
      profiles?: Record<string, { skills_enabled?: unknown; skills_pinned?: unknown }>
    }
    const profiles: ProfileCapabilitySnapshot[] = Object.entries(doc.profiles ?? {}).map(([name, value]) => ({
      name,
      skillsEnabled: Array.isArray(value?.skills_enabled)
        ? value.skills_enabled.filter((s): s is string => typeof s === 'string')
        : [],
      skillsPinned: Array.isArray(value?.skills_pinned)
        ? value.skills_pinned.filter((s): s is string => typeof s === 'string')
        : [],
    }))
    return { available: true, profiles }
  } catch (e) {
    return { available: false, profiles: [], note: `profiles.yaml 解析失败：${(e as Error).message}` }
  }
}

/** 供给侧：角色到技能清单。内置示例只用于报告，不作为真实供给。 */
export function collectSkillProvisioning(): SkillProvisioningSnapshot {
  const load = loadManifest()
  if (!load.exists || load.source !== 'file') {
    return {
      available: false,
      roles: [],
      note: load.errors.join('；') || '技能供给清单缺席；内置示例不作为真实供给',
    }
  }
  return {
    available: true,
    roles: load.manifest.roles.map((role) => ({ match: role.match, skills: role.skills })),
  }
}

/** 供给侧：舰队能力上报（每机 profile×角色×技能名）。 */
export function collectFleet(): FleetSnapshot {
  const report = readFleetReport()
  if (!report.available) return { available: false, entries: [], ...(report.note ? { note: report.note } : {}) }
  const entries = report.machines.flatMap((machine) =>
    machine.profiles.map((profile) => ({
      machineId: machine.machine,
      profile: profile.profile,
      roles: profile.role ? [profile.role] : [],
      skillCount: profile.skillCount,
      skills: profile.skills,
    })),
  )
  return {
    available: true,
    entries,
    ...(report.bad.length > 0 ? { note: `坏上报文件：${report.bad.join(', ')}` } : {}),
  }
}

/** 轻量供给快照：四文件源，不读任何看板库（派单期准入用）。 */
export function collectSupplySnapshot() {
  return {
    ledger: collectLedgerSnapshot(),
    graph: collectGraph(),
    skillProvisioning: collectSkillProvisioning(),
    profiles: collectProfiles(),
    fleet: collectFleet(),
  }
}

/** 采集并派生完整供需报告（只读；各源独立降级）。 */
export async function collectCapabilityPoolReport(homeDir?: string): Promise<SupplyDemandReport> {
  const home = homeDir?.trim() || hermesHome()
  const [demands, ledger] = await Promise.all([collectDemands(homeDir), collectLedger()])
  const graph = collectGraph()
  const skillProvisioning = collectSkillProvisioning()
  const profiles = collectProfiles()
  const fleet = collectFleet()
  // Task 8：任一库带 required_capabilities 列即 declared 口径；全旧库保持 skills-fallback
  const demandSource = await hasRequiredCapabilitiesColumn(home) ? 'declared' : 'skills-fallback'
  return deriveSupplyDemand({ demands, ledger, graph, skillProvisioning, profiles, fleet, demandSource })
}

/** 能力列在位探测：任一板库 tasks 表含 required_capabilities 列即视为已迁移。 */
async function hasRequiredCapabilitiesColumn(home: string): Promise<boolean> {
  for (const entry of allBoardDbsOf(home)) {
    let db
    try {
      db = await openReadonly(entry.dbPath)
    } catch {
      continue
    }
    try {
      const cols = db.prepare("PRAGMA table_info(tasks)").all() as unknown as Array<{ name: string }>
      if (cols.some((col) => col.name === 'required_capabilities')) return true
    } catch {
      // 读失败按未迁移处理（保守回落 skills-fallback）
    } finally {
      try { db.close() } catch { /* 已关 */ }
    }
  }
  return false
}

/** 候选查询的当前负载：按 assignee 统计在途卡（running/review/blocked）。 */
export async function collectAgentLoads(homeDir?: string): Promise<Map<string, number>> {
  const home = homeDir?.trim() || hermesHome()
  const loads = new Map<string, number>()
  for (const entry of allBoardDbsOf(home)) {
    let db
    try {
      db = await openReadonly(entry.dbPath)
    } catch {
      continue
    }
    try {
      const rows = db.prepare(
        "SELECT assignee, COUNT(*) AS n FROM tasks WHERE status IN ('running','review','blocked') AND assignee IS NOT NULL AND assignee != '' GROUP BY assignee",
      ).all() as unknown as Array<{ assignee: string; n: number }>
      for (const row of rows) loads.set(row.assignee, (loads.get(row.assignee) ?? 0) + row.n)
    } catch {
      // 单板读失败跳过
    } finally {
      try { db.close() } catch { /* 已关 */ }
    }
  }
  return loads
}
