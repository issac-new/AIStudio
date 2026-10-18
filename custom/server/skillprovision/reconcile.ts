// overlay/skillprovision：三列对账（catalog 声明 / manifest 期望 / host 与 sim 实得）。
//
// 诚实口径：sim 根不存在时 sim 列标不可用且 missingInSim 保持空数组——不能把
// “没检测到”伪装成“零缺口”。host 的 `skills.disabled` 单独成列，避免把“已装但
// 被禁用”误报成“目录缺失”。
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { catalogAppliesTo, defaultCatalogPath, parseCatalog } from './catalog'
import { loadManifest, manifestPath, matchRole } from './manifest'
import { indexSkills, listProfiles, scanProfileSkills, scanSkillRoot, skillNames } from './scan'
import type { ProfileReconcileRow, ProvisionReport } from './types'

export interface BuildReportOptions {
  hostRoot?: string
  simRoot?: string
  manifestPath?: string
  catalogPath?: string
}

export function defaultHostRoot(): string {
  const profiles = process.env.HERMES_PROFILES_ROOT?.trim()
  if (profiles) return resolve(profiles.replace(/^~/, homedir()), '..')
  return join(homedir(), '.hermes')
}

export function defaultSimRoot(): string {
  const env = process.env.SKILL_PROVISION_SIM_ROOT?.trim()
    || process.env.SIM_ROOT?.trim()
    || process.env.MX_SIM_ROOT?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), 'lab', 'ncwk-sim-mux')
}

function simHomeDir(simRoot: string): string {
  return existsSync(join(simRoot, 'hermes')) ? join(simRoot, 'hermes') : simRoot
}

/**
 * 解析 profile config.yaml 的 `skills.disabled`。不引入 YAML 依赖，按缩进做有界
 * 解析；支持块列表与行内 `[a, b]`。读失败返回空数组（fail-soft）。
 */
export function readDisabledSkills(configPath: string): string[] {
  if (!existsSync(configPath)) return []
  let lines: string[]
  try { lines = readFileSync(configPath, 'utf8').split('\n') } catch { return [] }
  const out: string[] = []
  let inSkills = false
  let skillsIndent = -1
  let inDisabled = false
  let disabledIndent = -1
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const indent = (/^\s*/.exec(line) ?? [''])[0].length
    const skillsHead = /^(\s*)skills:\s*$/.exec(line)
    if (skillsHead) {
      inSkills = true
      skillsIndent = skillsHead[1].length
      inDisabled = false
      continue
    }
    if (!inSkills) continue
    if (indent <= skillsIndent) { inSkills = false; inDisabled = false; continue }
    const disabledHead = /^(\s*)disabled:\s*(.*)$/.exec(line)
    if (disabledHead) {
      inDisabled = true
      disabledIndent = disabledHead[1].length
      const inline = disabledHead[2].trim()
      const inlineList = /^\[(.*)\]$/.exec(inline)
      if (inlineList) {
        for (const item of inlineList[1].split(',')) {
          const v = item.trim().replace(/^["']|["']$/g, '')
          if (v) out.push(v)
        }
      }
      continue
    }
    if (inDisabled) {
      const item = /^(\s*)-\s*(.+?)\s*$/.exec(line)
      if (item && item[1].length > disabledIndent) {
        const v = item[2].replace(/^["']|["']$/g, '')
        if (v) out.push(v)
        continue
      }
      if (indent <= disabledIndent) inDisabled = false
    }
  }
  return [...new Set(out)]
}

export function buildReport(options: BuildReportOptions = {}): ProvisionReport {
  const hostRoot = resolve(options.hostRoot ?? defaultHostRoot())
  const simRoot = resolve(options.simRoot ?? defaultSimRoot())
  const profilesRoot = join(hostRoot, 'profiles')
  const manifest = loadManifest(options.manifestPath ?? manifestPath())
  const catalog = parseCatalog(options.catalogPath ?? defaultCatalogPath(hostRoot))
  const hostGlobal = scanSkillRoot(join(hostRoot, 'skills'))
  const hostGlobalIndex = indexSkills(hostGlobal)

  const simHome = simHomeDir(simRoot)
  const simProfilesRoot = join(simHome, 'profiles')
  const simAvailable = existsSync(simProfilesRoot)
  const simProfileNames = new Set(simAvailable ? listProfiles(simProfilesRoot) : [])
  const simGlobal = simAvailable ? scanSkillRoot(join(simHome, 'skills')) : null

  const hostProfiles = listProfiles(profilesRoot)
  const rows: ProfileReconcileRow[] = hostProfiles.map((profile) => {
    const hostScan = scanProfileSkills(profilesRoot, profile)
    const hostActual = skillNames(hostScan)
    const hostLinked = hostScan.skills.filter((s) => s.viaLink).length
    const hostDisabled = readDisabledSkills(join(profilesRoot, profile, 'config.yaml'))
    const simComparable = simAvailable && simProfileNames.has(profile)
    const simScan = simComparable ? scanProfileSkills(simProfilesRoot, profile) : null
    const simActual = simScan ? skillNames(simScan) : []
    const simLinked = simScan ? simScan.skills.filter((s) => s.viaLink).length : 0
    const matched = matchRole(profile, manifest.manifest.roles)
    const expected = matched?.skills ?? []
    const catalogDeclared = catalog.available
      ? [...new Set(catalog.rows.filter((r) => catalogAppliesTo(r.appliesTo, profile)).map((r) => r.skill))].sort()
      : []
    const missingInHost = expected.filter((s) => !hostActual.includes(s))
    // 只在“装了没有”的缺口里判来源：已装技能不需要全局源（用户自有技能也合法）。
    const sourceMissing = missingInHost.filter((s) => !hostGlobalIndex.has(s))
    const disabledExpected = expected.filter((s) => hostDisabled.includes(s) && hostActual.includes(s))
    const extraInHost = hostActual.filter((s) => !expected.includes(s))
    const missingInSim = simComparable ? expected.filter((s) => !simActual.includes(s)) : []
    const catalogGapsInHost = catalogDeclared.filter((s) => !hostActual.includes(s))
    return {
      profile,
      matchedRole: matched?.match ?? null,
      catalogDeclared,
      expected,
      hostActual,
      hostLinked,
      hostDisabled,
      disabledExpected,
      sourceMissing,
      missingInHost,
      extraInHost,
      simActual,
      simLinked,
      simComparable,
      missingInSim,
      catalogGapsInHost,
    }
  })

  const simOnlyProfiles = [...simProfileNames].filter((p) => !hostProfiles.includes(p)).sort()
  const sum = (pick: (r: ProfileReconcileRow) => string[]): number => rows.reduce((n, r) => n + pick(r).length, 0)

  return {
    ok: true,
    generatedAt: Date.now(),
    hostRoot,
    simRoot,
    sim: { available: simAvailable, note: simAvailable ? undefined : `推演树 profile 目录不存在：${simProfilesRoot}`, profiles: simProfileNames.size },
    manifest: {
      path: manifest.path,
      source: manifest.source,
      exists: manifest.exists,
      roles: manifest.manifest.roles.length,
      errors: manifest.errors,
    },
    catalog: { available: catalog.available, path: catalog.path, note: catalog.note, rows: catalog.rows.length },
    globalSkills: {
      hostAvailable: hostGlobal.available,
      hostCount: hostGlobal.skills.length,
      simAvailable: simGlobal?.available ?? false,
      simCount: simGlobal?.skills.length ?? 0,
    },
    profiles: rows,
    simOnlyProfiles,
    summary: {
      profiles: rows.length,
      hostMissing: sum((r) => r.missingInHost),
      simMissing: sum((r) => r.missingInSim),
      sourceMissing: sum((r) => r.sourceMissing),
      disabledExpected: sum((r) => r.disabledExpected),
      catalogRows: catalog.rows.length,
      catalogGaps: sum((r) => r.catalogGapsInHost),
    },
  }
}
