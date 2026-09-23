// 配置发现与加载：.qgate/（项目）+ 内置 gate-packs（随包分发）。
// YAML/JSON 双格式（JSON 为 YAML 子集）；yaml 包缺失时 YAML 文件 → 诊断而非 crash（设计 §9）。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import type { Claim, GateSpec, Profile } from './types.js'
import { parseClaim, parseGateSpec, parseProfile, type Diagnostic } from './parse.js'

export interface QGateProjectConfig {
  profile?: string
  claims: Claim[]
  /** 项目自定义门（同 id 覆盖 pack 门）。 */
  gates: GateSpec[]
  evidenceCommit?: boolean
}

export interface LoadResult {
  config: QGateProjectConfig
  gates: GateSpec[]
  profiles: Profile[]
  diagnostics: Diagnostic[]
  projectRoot: string
  qgateDir: string
}

// 静态 import yaml：qgate 唯一运行时依赖（package.json 已声明；JSON 是 YAML 子集，天然双格式）。

function readStructured(file: string): { value: unknown } | { error: string } {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    return { error: `read failed: ${(e as Error).message}` }
  }
  try {
    return { value: parseYaml(text) }
  } catch (e) {
    return { error: `parse failed: ${(e as Error).message}` }
  }
}

function loadYamlDir<T>(
  dir: string,
  parseOne: (raw: unknown) => T | null,
  diagnostics: Diagnostic[],
): T[] {
  const out: T[] = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    if (!/\.(ya?ml|json)$/i.test(name)) continue
    const file = join(dir, name)
    const res = readStructured(file)
    if ('error' in res) {
      diagnostics.push({ path: file, message: res.error })
      continue
    }
    const parsed = parseOne(res.value)
    if (!parsed) {
      diagnostics.push({ path: file, message: 'schema invalid (tolerant parse returned null)' })
      continue
    }
    out.push(parsed)
  }
  return out
}

/** 内置 gate-packs 根：dist/../gate-packs（源内运行时 src/../gate-packs）。 */
export function builtinPacksRoot(): string {
  const here = fileURLToPath(import.meta.url)
  // dist/core/loader.js → dist → ..；开发态 src/core/loader.js → src → ..
  const root = resolve(here, '../../..')
  const viaDist = join(root, 'gate-packs')
  if (existsSync(viaDist)) return viaDist
  return join(root, '..', 'gate-packs')
}

function loadBuiltinGates(diagnostics: Diagnostic[]): GateSpec[] {
  const root = builtinPacksRoot()
  const out: GateSpec[] = []
  if (!existsSync(root)) return out
  for (const pack of readdirSync(root).sort()) {
    const gatesDir = join(root, pack, 'gates')
    if (!existsSync(gatesDir)) continue
    for (const g of loadYamlDir<GateSpec>(gatesDir, parseGateSpec, diagnostics)) {
      out.push({
        ...g,
        metadata: { ...g.metadata, pack },
        spec: { ...g.spec, executors: g.spec.executors.map((e) => ({ ...e, packHint: pack })) },
      })
    }
  }
  return out
}

function parseProjectConfig(raw: unknown): QGateProjectConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (Object.keys(rec).length === 0) return { claims: [], gates: [] }
  const profile = typeof rec.profile === 'string' ? rec.profile : undefined
  const evidenceCommit = rec.evidenceCommit === true
  let claims: Claim[] = []
  if (rec.claims !== undefined) {
    if (!Array.isArray(rec.claims)) return null
    const parsed = rec.claims.map(parseClaim)
    if (parsed.some((c) => c === null)) return null
    claims = parsed as Claim[]
  }
  return { profile, claims, gates: [], evidenceCommit }
}

/** 加载项目 QGate 世界：未采纳（无 .qgate/）返回 null。 */
export function loadProject(projectRoot: string): LoadResult | null {
  const qgateDir = join(projectRoot, '.qgate')
  if (!existsSync(qgateDir)) return null
  const diagnostics: Diagnostic[] = []

  let config: QGateProjectConfig = { claims: [], gates: [] }
  const configFile = join(qgateDir, 'qgate.yaml')
  if (existsSync(configFile)) {
    const res = readStructured(configFile)
    if ('error' in res) diagnostics.push({ path: configFile, message: res.error })
    else {
      const parsed = parseProjectConfig(res.value)
      if (!parsed) diagnostics.push({ path: configFile, message: 'qgate.yaml schema invalid' })
      else config = parsed
    }
  }

  const projectGates = loadYamlDir<GateSpec>(join(qgateDir, 'gates'), parseGateSpec, diagnostics)
  const builtinGates = loadBuiltinGates(diagnostics)
  // 项目门覆盖内置门（同 id）
  const byId = new Map<string, GateSpec>()
  for (const g of builtinGates) byId.set(g.metadata.id, g)
  for (const g of projectGates) byId.set(g.metadata.id, g)
  const gates = [...byId.values()]

  const profiles = [
    ...builtinProfiles(diagnostics),
    ...loadYamlDir<Profile>(join(qgateDir, 'profiles'), parseProfile, diagnostics),
  ]

  return { config, gates, profiles, diagnostics, projectRoot, qgateDir }
}

function builtinProfiles(diagnostics: Diagnostic[]): Profile[] {
  return loadYamlDir<Profile>(join(builtinPacksRoot(), '_profiles'), parseProfile, diagnostics)
}
