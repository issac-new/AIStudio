// overlay/skillprovision：技能供给对账与主机供给的类型面。
//
// 口径来源：2026-10-18 teamai-cli 调研第四轮实测——host 49 profile 真实技能
// 中位 6 个（仅数 SKILL.md，不数分类目录），sim 42 profile 每个 130–141 个；
// 角色→技能映射散落三处（catalog 文档 / skillgov 死 UI / mx-lib 硬编码）。
// 本域只做两件事：只读对账（P1）与只增不改的主机供给（P2）。

export interface SkillEntry {
  /** 技能名 = 含 SKILL.md 的目录 basename。 */
  name: string
  /** 扫描时命中的目录路径（可能是符号链接路径）。 */
  dir: string
  /** 解析符号链接后的真实目录。 */
  realDir: string
  /** 路径是否经过符号链接。 */
  viaLink: boolean
}

export interface SkillRootScan {
  root: string
  available: boolean
  note?: string
  skills: SkillEntry[]
  /** 同根下同名但真实目录不同的技能名（供给时判 ambiguous）。 */
  ambiguous: string[]
}

export interface ManifestRole {
  /** 精确名，或 `*suffix` / `prefix*` / `*`。 */
  match: string
  skills: string[]
  note?: string
}

export interface ProvisionManifest {
  version: 1
  roles: ManifestRole[]
}

export interface ManifestLoad {
  path: string
  exists: boolean
  source: 'file' | 'builtin'
  manifest: ProvisionManifest
  errors: string[]
}

export interface CatalogRow {
  /** 技能名（分组行按 `/` 拆分后逐项展开）。 */
  skill: string
  /** 原始“适用 profile”单元格。 */
  appliesTo: string
  status: string
  line: number
}

export interface CatalogLoad {
  available: boolean
  path: string
  note?: string
  rows: CatalogRow[]
}

export interface ProfileReconcileRow {
  profile: string
  /** manifest 命中的角色模式（未命中为 null）。 */
  matchedRole: string | null
  /** catalog 文档按启发式命中的技能。 */
  catalogDeclared: string[]
  /** manifest 期望技能（已去重）。 */
  expected: string[]
  hostActual: string[]
  /** 实得中经符号链接看到的数量（hermes 扫描跟随链接，有效集含链接）。 */
  hostLinked: number
  /** 目录在位但 config.yaml `skills.disabled` 关闭的技能。 */
  hostDisabled: string[]
  /** 期望技能中已装但被禁用的。 */
  disabledExpected: string[]
  /** 期望技能在 host 全局库找不到来源。 */
  sourceMissing: string[]
  missingInHost: string[]
  extraInHost: string[]
  simActual: string[]
  simLinked: number
  /** 推演树是否有同名 profile；false 时 sim 列不可比，missingInSim 必须为空。 */
  simComparable: boolean
  missingInSim: string[]
  /** catalog 声明但 host 未装（文档与现实的差）。 */
  catalogGapsInHost: string[]
}

export interface ReportSummary {
  profiles: number
  hostMissing: number
  simMissing: number
  sourceMissing: number
  disabledExpected: number
  catalogRows: number
  catalogGaps: number
}

export interface ProvisionReport {
  ok: true
  generatedAt: number
  hostRoot: string
  simRoot: string
  sim: { available: boolean; note?: string; profiles: number }
  manifest: {
    path: string
    source: 'file' | 'builtin'
    exists: boolean
    roles: number
    errors: string[]
  }
  catalog: { available: boolean; path: string; note?: string; rows: number }
  globalSkills: { hostAvailable: boolean; hostCount: number; simAvailable: boolean; simCount: number }
  profiles: ProfileReconcileRow[]
  simOnlyProfiles: string[]
  summary: ReportSummary
}

export interface ApplyAction {
  skill: string
  reason?: string
  source?: string
}

export interface ApplyProfileResult {
  profile: string
  planned: ApplyAction[]
  copied: ApplyAction[]
  skipped: ApplyAction[]
  failed: ApplyAction[]
}

export interface ApplyResult {
  ok: boolean
  dryRun: boolean
  reason?: string
  profiles: ApplyProfileResult[]
  summary: { profiles: number; planned: number; copied: number; skipped: number; failed: number }
}

export interface RollbackProfileResult {
  profile: string
  planned: string[]
  removed: string[]
  skipped: ApplyAction[]
  failed: ApplyAction[]
}

export interface RollbackResult {
  ok: boolean
  dryRun: boolean
  reason?: string
  profiles: RollbackProfileResult[]
  summary: { profiles: number; planned: number; removed: number; skipped: number; failed: number }
}
