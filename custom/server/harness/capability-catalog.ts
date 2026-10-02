/**
 * 驾驭工程 B1：统一能力目录（读模型 + 四要素缺口报告）。
 *
 * 信通院《驾驭工程》报告落地建议第一条：先做能力目录——每个工具/数据源/模型
 * 都要有 登记/权限/版本/审计 四要素。本模块聚合既有三系为统一只读目录：
 *   - mcpcatalog：MCP 工具级（数据面=mcpconfig 配置目录，工具级条目取配置 JSON
 *     可选 tools 字段；现行 mcpconfig schema 不落 tools 时如实只出 server 级条目）
 *   - extmarket：skill/plugin 条目（数据面=~/.hermes/skills/* 已装技能，
 *     HERMES_SKILLS_DIR 可覆写；版本取 SKILL.md frontmatter version 字段，多缺席）
 *   - registry-admin：roster/app-registry/org 三注册表（git 提交史可回溯，
 *     registeredAt/auditTrail 取 git log 实查，不猜）
 *
 * 明确不做（本轮边界）：统一写通道、三系数据迁移、目录代管。三系事实源不动，
 * 本模块是单一事实源之上的**只读聚合投影**——缺口先暴露，治理动作留待后续。
 *
 * 只 import 读被聚合域（mcpconfig/registry-admin/governance-controller），不改其代码。
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { mcpConfigDir } from '../mcpconfig/mcp-config'
import { REGISTRY_KINDS, readRegistry, type RegistryKind } from '../governance/registry-admin'
import { repoRoot } from '../governance/governance-controller'

const exec = promisify(execFile)

// ── 类型（纯函数层） ────────────────────────────────────────────────

export type CapabilitySourceId = 'mcpcatalog' | 'extmarket' | 'registry-admin'

export const CAPABILITY_SOURCES: readonly CapabilitySourceId[] = ['mcpcatalog', 'extmarket', 'registry-admin']

/** 四要素（报告口径：登记/权限/版本/审计） */
export type FactorKey = 'registered' | 'permission' | 'version' | 'audit'
export const FACTOR_KEYS: readonly FactorKey[] = ['registered', 'permission', 'version', 'audit']
export const FACTOR_LABELS: Record<FactorKey, string> = {
  registered: '登记', permission: '权限', version: '版本', audit: '审计',
}

/** 归一前原始记录（三系收集器产出；字段可缺席——缺口判定即看这些字段） */
export interface RawCapabilityRecord {
  source: CapabilitySourceId
  kind: string
  id: string
  name: string
  version?: string | null
  registeredAt?: number | null
  /** 审计追溯锚（git commit / 台账路径等）；缺席=审计缺口 */
  auditTrail?: string | null
  /** 权限绑定在档（授权态/角色列/禁用开关等，按各系口径） */
  permissionBound?: boolean | null
  note?: string
}

export interface CapabilityEntry extends RawCapabilityRecord {
  /** 四要素判定结果（true=有 / false=缺） */
  factors: Record<FactorKey, boolean>
  /** 缺口要素列表（四要素中为 false 的键，供 UI 徽标直读） */
  gaps: FactorKey[]
}

export interface SourceGapStat {
  source: CapabilitySourceId
  total: number
  /** 各要素缺口条数 */
  byFactor: Record<FactorKey, number>
  /** 缺口率 = 缺口要素数 / (条目数×4) */
  gapRate: number
  /** 至少缺一要素的条目数 */
  entriesWithAnyGap: number
}

export interface GapSummary {
  totalEntries: number
  bySource: Record<CapabilitySourceId, SourceGapStat>
  overall: {
    factorSlots: number
    gapFactorCount: number
    gapRate: number
    entriesWithAnyGap: number
  }
}

export interface CatalogSourceInfo {
  id: CapabilitySourceId
  available: boolean
  note?: string
  count: number
}

// ── 纯函数：归一 + 四要素判定 + 缺口汇总 ───────────────────────────

/**
 * 单条四要素判定（口径写在判定处，可对账）：
 *   - 登记：id+name 可解析（条目本身来自某事实源在档记录，故恒真；该要素
 *     暴露的是"目录里有无此条"，登记缺口的反面=影子能力不在册，本轮不可探测）
 *   - 权限：permissionBound === true（各系口径见收集器注释）
 *   - 版本：version 非空字符串
 *   - 审计：auditTrail 非空字符串（git commit / 台账锚）
 */
export function assessEntry(raw: RawCapabilityRecord): CapabilityEntry {
  const factors: Record<FactorKey, boolean> = {
    registered: Boolean(raw.id && raw.name),
    permission: raw.permissionBound === true,
    version: typeof raw.version === 'string' && raw.version.trim() !== '',
    audit: typeof raw.auditTrail === 'string' && raw.auditTrail.trim() !== '',
  }
  return { ...raw, factors, gaps: FACTOR_KEYS.filter((k) => !factors[k]) }
}

function emptySourceStat(source: CapabilitySourceId): SourceGapStat {
  return {
    source,
    total: 0,
    byFactor: { registered: 0, permission: 0, version: 0, audit: 0 },
    gapRate: 0,
    entriesWithAnyGap: 0,
  }
}

/** 目录构建：归一批量判定 + 分系/总体缺口汇总。sourceFilter 只影响 entries，gapSummary 恒按全集算（口径单一）。 */
export function buildCapabilityCatalog(
  raws: readonly RawCapabilityRecord[],
  sourceFilter?: CapabilitySourceId,
): { entries: CapabilityEntry[]; gapSummary: GapSummary } {
  const assessed = raws.map(assessEntry)
  const bySource = {} as Record<CapabilitySourceId, SourceGapStat>
  for (const s of CAPABILITY_SOURCES) bySource[s] = emptySourceStat(s)
  let total = 0
  let gapFactorCount = 0
  let entriesWithAnyGap = 0
  for (const e of assessed) {
    const st = bySource[e.source]
    st.total += 1
    total += 1
    if (e.gaps.length > 0) {
      st.entriesWithAnyGap += 1
      entriesWithAnyGap += 1
    }
    for (const g of e.gaps) {
      st.byFactor[g] += 1
      gapFactorCount += 1
    }
  }
  for (const s of CAPABILITY_SOURCES) {
    const st = bySource[s]
    const gapCount = FACTOR_KEYS.reduce((acc, k) => acc + st.byFactor[k], 0)
    st.gapRate = st.total > 0 ? gapCount / (st.total * 4) : 0
  }
  const factorSlots = total * 4
  const entries = (sourceFilter ? assessed.filter((e) => e.source === sourceFilter) : assessed)
    .slice()
    .sort((a, b) => a.source.localeCompare(b.source) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
  return {
    entries,
    gapSummary: {
      totalEntries: total,
      bySource,
      overall: { factorSlots, gapFactorCount, gapRate: factorSlots > 0 ? gapFactorCount / factorSlots : 0, entriesWithAnyGap },
    },
  }
}

// ── 收集器（fail-soft，逐系独立降级） ──────────────────────────────

function isSourceId(v: string): v is CapabilitySourceId {
  return (CAPABILITY_SOURCES as readonly string[]).includes(v)
}

export function parseCapabilitySource(v: string | undefined): CapabilitySourceId | undefined {
  return typeof v === 'string' && isSourceId(v.trim()) ? (v.trim() as CapabilitySourceId) : undefined
}

/** git 单次实查（timeout 防对象库锁拖死；失败返 null 不猜） */
async function gitOnce(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec('git', args, { timeout: 8000, maxBuffer: 4 * 1024 * 1024 })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * mcpcatalog 系收集（MCP 工具级）。
 * 口径：mcpconfig 目录每个 server JSON = 一条 server 级条目；
 *   - registeredAt = updatedAt（配置落盘时间）
 *   - permissionBound = authState==='authorized'（needs-auth/dismissed 均未建立授权绑定）
 *   - version = 配置 JSON 的 version 字段（现行 schema 无 → 如实缺口）
 *   - auditTrail = null（mcpconfig 无变更留痕 → 如实缺口）
 * 工具级：配置 JSON 若带 tools 数组（schema 外可选字段），按 mcpcatalog 域
 * disabledTools 语义逐工具出条目（permissionBound=!disabled）。
 */
export function collectMcpRecords(): { records: RawCapabilityRecord[]; info: CatalogSourceInfo } {
  const out: RawCapabilityRecord[] = []
  try {
    const dir = mcpConfigDir()
    if (!existsSync(dir)) return { records: [], info: { id: 'mcpcatalog', available: false, note: `配置目录缺席：${dir}`, count: 0 } }
    let bad = 0
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const cfg = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
          name?: string; scope?: string; authState?: string; updatedAt?: number
          version?: string; tools?: string[]; disabledTools?: string[]
        }
        if (!cfg || typeof cfg.name !== 'string' || !cfg.name) { bad += 1; continue }
        out.push({
          source: 'mcpcatalog',
          kind: 'mcp-server',
          id: cfg.name,
          name: cfg.name,
          version: typeof cfg.version === 'string' ? cfg.version : null,
          registeredAt: typeof cfg.updatedAt === 'number' ? cfg.updatedAt : null,
          auditTrail: null,
          permissionBound: cfg.authState === 'authorized',
          note: `scope=${cfg.scope ?? '?'} authState=${cfg.authState ?? '?'}`,
        })
        if (Array.isArray(cfg.tools)) {
          const disabled = new Set(Array.isArray(cfg.disabledTools) ? cfg.disabledTools : [])
          for (const tool of cfg.tools) {
            if (typeof tool !== 'string' || !tool) continue
            out.push({
              source: 'mcpcatalog',
              kind: 'mcp-tool',
              id: `${cfg.name}:${tool}`,
              name: tool,
              version: null,
              registeredAt: typeof cfg.updatedAt === 'number' ? cfg.updatedAt : null,
              auditTrail: null,
              permissionBound: !disabled.has(tool),
              note: `server=${cfg.name}`,
            })
          }
        }
      } catch {
        bad += 1 // 坏 JSON 跳过，计数如实入 note
      }
    }
    return {
      records: out,
      info: {
        id: 'mcpcatalog', available: true, count: out.length,
        note: out.length === 0 ? `目录空（${dir}，坏文件 ${bad} 个）` : (bad > 0 ? `跳过坏文件 ${bad} 个` : undefined),
      },
    }
  } catch (e) {
    return { records: [], info: { id: 'mcpcatalog', available: false, note: (e as Error).message, count: 0 } }
  }
}

export function skillsDir(): string {
  const env = process.env.HERMES_SKILLS_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes', 'skills')
}

/** SKILL.md frontmatter 的 version 字段（yaml 头内 /^version:/；缺席返 null） */
function skillVersion(mdPath: string): string | null {
  try {
    const head = readFileSync(mdPath, 'utf8').split('---')[1] ?? ''
    const m = head.match(/^version:\s*(\S+)\s*$/m)
    return m ? m[1] ?? null : null
  } catch {
    return null
  }
}

/**
 * extmarket 系收集（skill/plugin 条目）。
 * 口径：~/.hermes/skills/*（HERMES_SKILLS_DIR 可覆写）每个含 SKILL.md 的目录 = 一条
 * skill 条目（plugin 形态当前无独立事实源，不出假条目）；
 *   - registeredAt = SKILL.md mtime（近似登记时间，口径如实标注）
 *   - version = SKILL.md frontmatter version（多数技能无此字段 → 如实缺口）
 *   - permissionBound = false（技能面无权限绑定机制 → 如实缺口）
 *   - auditTrail = 技能目录若在 git 仓内，取该路径最后一次 commit 短 sha；否则 null
 */
export async function collectExtMarketRecords(): Promise<{ records: RawCapabilityRecord[]; info: CatalogSourceInfo }> {
  const dir = skillsDir()
  const out: RawCapabilityRecord[] = []
  try {
    if (!existsSync(dir)) return { records: [], info: { id: 'extmarket', available: false, note: `技能目录缺席：${dir}`, count: 0 } }
    // git 仓判定一次（不在仓内则全部 audit=null，不逐条起子进程）
    const inGit = (await gitOnce(['-C', dir, 'rev-parse', '--is-inside-work-tree'])) === 'true'
    const slugs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort()
    for (const slug of slugs.slice(0, 200)) { // 上界防目录爆炸（口径：单目录最多 200 条）
      const md = join(dir, slug, 'SKILL.md')
      if (!existsSync(md)) continue
      let registeredAt: number | null = null
      try {
        registeredAt = Math.round(statSync(md).mtimeMs)
      } catch { /* mtime 取不到如实 null */ }
      let auditTrail: string | null = null
      if (inGit) {
        const sha = await gitOnce(['-C', dir, 'log', '-1', '--format=%h', '--', slug])
        auditTrail = sha ? `git:${sha}` : null
      }
      out.push({
        source: 'extmarket',
        kind: 'skill',
        id: slug,
        name: slug,
        version: skillVersion(md),
        registeredAt,
        auditTrail,
        permissionBound: false,
        note: '技能面无权限绑定机制',
      })
    }
    return {
      records: out,
      info: {
        id: 'extmarket', available: true, count: out.length,
        note: out.length === 0 ? `无 SKILL.md 条目（${dir}）` : (inGit ? '审计取 git 提交史' : '目录不在 git 仓内，审计缺口如实呈现'),
      },
    }
  } catch (e) {
    return { records: [], info: { id: 'extmarket', available: false, note: (e as Error).message, count: 0 } }
  }
}

/** markdown 表数据行解析（跳过 |---| 分隔行；首个数据行视为表头剔除） */
export function parseMarkdownTableRows(markdown: string): string[][] {
  const rows: string[][] = []
  for (const line of markdown.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|') || !t.endsWith('|')) continue
    const cells = t.slice(1, -1).split('|').map((c) => c.trim())
    if (cells.every((c) => /^[-: ]*$/.test(c))) continue // 分隔行
    rows.push(cells)
  }
  return rows.length > 0 ? rows.slice(1) : []
}

/**
 * registry-admin 系收集（roster/app-registry/org 三注册表）。
 * 口径（复用 readRegistry 单一读取面，git 提交史实查）：
 *   - 每表数据行一条；id/name = 首列（roster 首列为 matrix 账号）
 *   - registeredAt/auditTrail = 该注册表文件最后一次 git commit（%ct/%h 实查）
 *   - permissionBound = 末列非空（roster 末列为角色；app-registry/org 同为
 *     归属/角色列——近似口径，note 里写明）
 *   - version = null（注册表行无版本字段 → 如实缺口）
 */
export async function collectRegistryRecords(): Promise<{ records: RawCapabilityRecord[]; infos: CatalogSourceInfo[] }> {
  const out: RawCapabilityRecord[] = []
  const infos: CatalogSourceInfo[] = []
  for (const kind of Object.keys(REGISTRY_KINDS) as RegistryKind[]) {
    try {
      const { markdown, commit } = await readRegistry(kind)
      const rel = REGISTRY_KINDS[kind]
      const ctRaw = await gitOnce(['-C', repoRoot(), 'log', '-1', '--format=%ct', '--', rel])
      const registeredAt = ctRaw ? Number(ctRaw) * 1000 : null
      const rows = parseMarkdownTableRows(markdown)
      for (const cells of rows) {
        const id = cells[0] ?? ''
        if (!id) continue
        const last = cells[cells.length - 1] ?? ''
        out.push({
          source: 'registry-admin',
          kind: `registry:${kind}`,
          id,
          name: cells[1] && !cells[1].startsWith('@') ? cells[1] : id,
          version: null,
          registeredAt,
          auditTrail: commit ? `git:${commit}@${rel}` : null,
          permissionBound: last !== '' && last !== '—',
          note: '权限口径=末列（角色/归属）非空',
        })
      }
      infos.push({ id: 'registry-admin', available: true, count: rows.length, note: `${kind}：${rows.length} 行（${commit || '无 commit'}）` })
    } catch (e) {
      infos.push({ id: 'registry-admin', available: false, count: 0, note: `${kind}：${(e as Error).message}` })
    }
  }
  return { records: out, infos }
}

/** 三系聚合入口（控制器用）。gapSummary 恒按三系全集；entries 可按 source 过滤。 */
export async function collectCapabilityCatalog(sourceFilter?: CapabilitySourceId): Promise<{
  ok: true
  entries: CapabilityEntry[]
  gapSummary: GapSummary
  sources: CatalogSourceInfo[]
  meta: { scope: string; notDoing: string }
}> {
  const mcp = collectMcpRecords()
  const ext = await collectExtMarketRecords()
  const reg = await collectRegistryRecords()
  const records = [...mcp.records, ...ext.records, ...reg.records]
  const { entries, gapSummary } = buildCapabilityCatalog(records, sourceFilter)
  const regAvailable = reg.infos.some((i) => i.available)
  const sources: CatalogSourceInfo[] = [
    mcp.info,
    ext.info,
    { id: 'registry-admin', available: regAvailable, count: reg.infos.reduce((s, i) => s + i.count, 0), note: reg.infos.map((i) => i.note ?? `${i.id}:${i.available}`).join('；') || undefined },
  ]
  return {
    ok: true,
    entries,
    gapSummary,
    sources,
    meta: {
      scope: '三系只读聚合读模型 + 四要素缺口报告',
      notDoing: '统一写通道 / 三系迁移 / 目录代管不在本轮——单一事实源读模型，缺口先暴露',
    },
  }
}
