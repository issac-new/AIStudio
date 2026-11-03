// overlay/harness/workbench：组件库（PluginRSI 吸收轮 2026-11-03）。
//
// 论文《PluginRSI》（arXiv 2609.32423，中科大/美团/武大/NUS）的核心判断：整机重写式自进化有三个硬伤——
//   ① 归因不清（一次改一堆机制，涨跌分不清是谁的功）；
//   ② 好机制被下轮重写顺手删掉；
//   ③ 经验不沉淀（每轮推倒重来，反复收敛到相似方案）。
// 对策是把 harness 拆成**标准接口的插件**：每次只变异一个插件、单独验证，验证有效就存进
// 共享插件库；再由工作流从库里挑零件重组。论文实测插件库 75→132 个，Workflow 始终 <300 行，
// 且把长好的库直接喂给新 Agent，两轮就到 69%（从零 65%）。
//
// 本仓的改进实验台此前只有「整份提案 → 冠军 → 回滚」：冠军保住了，但**验证有效的零件没有被
// 单独存下来复用**。本模块补这一层：晋级成功即把选中变体作为一个**组件**入库（带证据与版本），
// 供后续提案引用/重组。纪律：
//   · append-only + 幂等（同 digest 不重复入库）；
//   · 同 (kind,name) 递增版本，旧版本保留（论文：好零件不许被后续覆盖）；
//   · 入库是「已验证」的记号，不改变晋级裁决本身（裁决仍由 gate 决定）。

import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { atomicWriteJson } from '../../lib/fs-store'
import { underWebUi } from '../../lib/paths'
import type { Proposal, SurfaceKey, Variant } from './types'

export interface ComponentEvidence {
  proposalId: string
  variantId: string
  evalRunId?: string
  passAt1: number | null
  /** 相对基线的通过率增量（有对比才有）。 */
  delta: number | null
  verificationTier?: 'command' | 'heldout' | 'regression' | 'judge' | 'none'
}

export interface ComponentEntry {
  /** `<kind>:<name>@<digest 前 8 位>`——同组件不同版本可共存。 */
  id: string
  /** 组件类别：默认取可编辑面 key（memory/skills/tool_guidance…）。 */
  kind: string
  /** 组件名：目标文件名或候选标签（同 (kind,name) 递增版本）。 */
  name: string
  surfaceKey: SurfaceKey
  digest: string
  /** 单文件候选的正文；树候选为空字符串（正文在 files）。 */
  content: string
  files?: Array<{ path: string; content: string }>
  evidence: ComponentEvidence
  version: number
  promotedAt: string
  promotedBy: string
  label?: string
}

export interface ComponentLibrary {
  version: 1
  entries: ComponentEntry[]
}

export function libraryFile(): string {
  const env = process.env.HARNESS2_COMPONENT_LIBRARY?.trim()
  if (env) return resolve(env)
  return underWebUi('harness-workbench/components.json')
}

function emptyLibrary(): ComponentLibrary {
  return { version: 1, entries: [] }
}

function sanitize(raw: unknown): ComponentLibrary {
  const obj = (raw ?? {}) as Partial<ComponentLibrary>
  return { version: 1, entries: Array.isArray(obj.entries) ? (obj.entries as ComponentEntry[]) : [] }
}

/** 读库：坏档改名隔离（`.corrupt-<ts>`），按空库继续，不静默覆写。 */
export function readLibrary(): ComponentLibrary {
  const file = libraryFile()
  if (!existsSync(file)) return emptyLibrary()
  try {
    return sanitize(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    try {
      renameSync(file, `${file}.corrupt-${Date.now()}`)
    } catch {
      /* 隔离失败也不覆写 */
    }
    return emptyLibrary()
  }
}

function writeLibrary(lib: ComponentLibrary): void {
  const file = libraryFile()
  mkdirSync(dirname(file), { recursive: true })
  const MAX = 500
  const trimmed = lib.entries.length > MAX ? { ...lib, entries: lib.entries.slice(-MAX) } : lib
  atomicWriteJson(file, trimmed, { mode: 0o600 })
}

/** 组件名推导：目标文件 basename → 候选标签 → 面 key。 */
export function componentIdentityOf(proposal: Proposal, variant: Variant): { kind: string; name: string } {
  const kind = String(proposal.surfaceKey)
  const base = (proposal.targetPath ?? '').split('/').pop()
  const name = (base && base.trim()) || (variant.label ?? '').trim() || kind
  return { kind, name: name.slice(0, 80) }
}

/** 该组件已有多少版本（用于递增 version）。 */
export function versionsOf(lib: ComponentLibrary, kind: string, name: string): number {
  return lib.entries.filter((e) => e.kind === kind && e.name === name).length
}

export interface RecordResult {
  recorded: boolean
  reason?: 'duplicate' | 'no_content'
  entry?: ComponentEntry
}

/**
 * 晋级成功后入库（幂等：同 digest 已存在即跳过）。
 * 只在**有内容**时入库（空内容不造条目）；树候选存 files，单文件存 content。
 */
export function recordComponent(
  proposal: Proposal,
  variant: Variant,
  evidence: ComponentEvidence,
  opts: { actor?: string; at?: string } = {},
): RecordResult {
  const content = String(variant.content ?? '')
  const files = variant.files ?? []
  if (!content.trim() && files.length === 0) return { recorded: false, reason: 'no_content' }
  const lib = readLibrary()
  const dup = lib.entries.find((e) => e.digest === variant.digest && e.surfaceKey === proposal.surfaceKey)
  if (dup) return { recorded: false, reason: 'duplicate', entry: dup }
  const { kind, name } = componentIdentityOf(proposal, variant)
  const entry: ComponentEntry = {
    id: `${kind}:${name}@${String(variant.digest).slice(0, 8)}`,
    kind,
    name,
    surfaceKey: proposal.surfaceKey,
    digest: variant.digest,
    content: files.length > 0 ? '' : content,
    ...(files.length > 0 ? { files: files.map((f) => ({ path: f.path, content: f.content })) } : {}),
    evidence,
    version: versionsOf(lib, kind, name) + 1,
    promotedAt: opts.at ?? new Date().toISOString(),
    promotedBy: String(opts.actor ?? 'operator'),
    ...(variant.label ? { label: variant.label } : {}),
  }
  lib.entries.push(entry)
  writeLibrary(lib)
  return { recorded: true, entry }
}

export interface LibraryQuery {
  kind?: string
  surfaceKey?: string
  /** 只要每个 (kind,name) 的最新版本。 */
  latestOnly?: boolean
  limit?: number
}

/** 列出组件（按入库时间倒序；latestOnly 时每个组件只留最新版本）。 */
export function listComponents(query: LibraryQuery = {}): ComponentEntry[] {
  const lib = readLibrary()
  let rows = lib.entries
  if (query.kind) rows = rows.filter((e) => e.kind === query.kind)
  if (query.surfaceKey) rows = rows.filter((e) => e.surfaceKey === query.surfaceKey)
  if (query.latestOnly) {
    const latest = new Map<string, ComponentEntry>()
    for (const e of rows) {
      const key = `${e.kind}::${e.name}`
      const cur = latest.get(key)
      if (!cur || e.version > cur.version) latest.set(key, e)
    }
    rows = [...latest.values()]
  }
  const sorted = [...rows].sort((a, b) => (a.promotedAt < b.promotedAt ? 1 : -1))
  return sorted.slice(0, Math.max(1, Math.min(200, query.limit ?? 50)))
}

/** 组件库概览（面板/提案引用用）：按 kind 计数 + 组件名清单。 */
export function librarySummary(): {
  total: number
  byKind: Array<{ kind: string; components: number; versions: number }>
  names: Array<{ kind: string; name: string; latestVersion: number; surfaceKey: SurfaceKey }>
} {
  const lib = readLibrary()
  const byKind = new Map<string, { components: Set<string>; versions: number }>()
  for (const e of lib.entries) {
    const slot = byKind.get(e.kind) ?? { components: new Set<string>(), versions: 0 }
    slot.components.add(e.name)
    slot.versions += 1
    byKind.set(e.kind, slot)
  }
  const latest = new Map<string, ComponentEntry>()
  for (const e of lib.entries) {
    const key = `${e.kind}::${e.name}`
    const cur = latest.get(key)
    if (!cur || e.version > cur.version) latest.set(key, e)
  }
  return {
    total: lib.entries.length,
    byKind: [...byKind.entries()].map(([kind, v]) => ({ kind, components: v.components.size, versions: v.versions })).sort((a, b) => b.versions - a.versions),
    names: [...latest.values()]
      .map((e) => ({ kind: e.kind, name: e.name, latestVersion: e.version, surfaceKey: e.surfaceKey }))
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind))),
  }
}

/** 测试钩子：清空库。 */
export function _resetLibraryForTests(): void {
  writeLibrary(emptyLibrary())
}
