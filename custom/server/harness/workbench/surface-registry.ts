// overlay/custom/server/harness/workbench/surface-registry.ts
// 八类可编辑面的统一登记（Harness² "8 editable components" 的本仓映射）。
//
// 纪律：
//   1. 只扫描真实产物；路径不存在 → available=false + expected 说明，不补假条目。
//   2. revision 是「路径+大小+mtime」摘要，用于发现漂移，不冒充内容哈希。
//   3. 只有 system_prompt / skills 标 managed（可在双闸下写盘）；其余六面
//      已有各自管理面或风险过高，只出建议（advisory），避免绕过既有审计。
import { createHash } from 'crypto'
import { existsSync, readdirSync, realpathSync, statSync, type Dirent } from 'fs'
import { homedir } from 'os'
import { relative, resolve, sep } from 'path'
import type { ApplyMode, EditableSurface, RiskTier, SurfaceKey, SurfaceSource } from './types'

const MAX_ARTIFACTS = 400
const MAX_SAMPLES = 5

export function hermesHome(): string {
  return process.env.HERMES_HOME?.trim() || joinHome('.hermes')
}

function joinHome(p: string): string {
  return resolve(homedir(), p)
}

interface ScanSpec {
  /** 允许写入的相对根（仅 managed 面）；null=不可写。 */
  writableRoots: string[] | null
  /** 允许写入的相对路径正则（在 writableRoots 之内再收窄）。 */
  writablePattern?: RegExp
  /** 扫描器：返回相对 HERMES_HOME 的文件路径。 */
  scan: (home: string) => string[]
}

interface SurfaceDef {
  key: SurfaceKey
  nameZh: string
  nameEn: string
  source: SurfaceSource
  applyMode: ApplyMode
  risk: RiskTier
  managedBy: string
  expected: string
  note: string
  spec: ScanSpec
}

/** 按目录列举直接子项（不存在返回空，权限错误吞掉）。 */
function listDir(abs: string): Dirent[] {
  try {
    return readdirSync(abs, { withFileTypes: true })
  } catch {
    return []
  }
}

function isSkipped(name: string): boolean {
  return name === 'node_modules' || name === '.git' || name === 'cache' || name === '.cache' || name.startsWith('.git')
}

/**
 * 递归收集文件；depth=相对根向下最多几层（1=只看直接文件）。
 * 单面最多 MAX_ARTIFACTS 个，避免大 profile 拖慢治理页。
 */
function walk(home: string, relRoot: string, depth: number, match: (rel: string, name: string) => boolean, out: string[]): void {
  if (out.length >= MAX_ARTIFACTS) return
  const absRoot = resolve(home, relRoot)
  const step = (absDir: string, relDir: string, left: number): void => {
    if (left < 0 || out.length >= MAX_ARTIFACTS) return
    for (const ent of listDir(absDir)) {
      if (out.length >= MAX_ARTIFACTS) return
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name
      if (ent.isDirectory()) {
        if (isSkipped(ent.name)) continue
        step(resolve(absDir, ent.name), rel, left - 1)
      } else if (ent.isFile() && match(rel, ent.name)) {
        out.push(rel)
      }
    }
  }
  step(absRoot, relRoot, depth)
}

function scanProfilesFile(home: string, fileName: string): string[] {
  const out: string[] = []
  for (const ent of listDir(resolve(home, 'profiles'))) {
    if (!ent.isDirectory() || isSkipped(ent.name)) continue
    const rel = `profiles/${ent.name}/${fileName}`
    if (existsSync(resolve(home, rel))) out.push(rel)
  }
  return out
}

function scanProfilesNested(home: string, subDir: string, ext: string, depth: number): string[] {
  const out: string[] = []
  for (const ent of listDir(resolve(home, 'profiles'))) {
    if (!ent.isDirectory() || isSkipped(ent.name)) continue
    walk(home, `profiles/${ent.name}/${subDir}`, depth, (_rel, name) => name.endsWith(ext), out)
  }
  return out
}

const SURFACES: SurfaceDef[] = [
  {
    key: 'system_prompt',
    nameZh: '系统提示词',
    nameEn: 'System prompt',
    source: { components: ['c1'], context: 'always_on', opencode: 'systemprompt.md', codex: 'AGENTS.md' },
    applyMode: 'managed',
    risk: 'medium',
    managedBy: '本工作台（快照+回滚）',
    expected: '$HERMES_HOME/profiles/<profile>/SOUL.md',
    note: '单档案人格与行为约束；写盘须人工批准且 HARNESS2_APPLY=1。',
    spec: {
      writableRoots: ['profiles'],
      writablePattern: /^profiles\/[^/]+\/SOUL\.md$/,
      scan: (home) => scanProfilesFile(home, 'SOUL.md'),
    },
  },
  {
    key: 'guardrails',
    nameZh: '护栏',
    nameEn: 'Guardrails',
    source: { components: ['c6'], context: 'always_on', opencode: 'guardrails.md', codex: 'AGENTS.md' },
    applyMode: 'advisory',
    risk: 'high',
    managedBy: 'constraints / approval / qgate',
    expected: '$HERMES_HOME/profiles/<profile>/config.yaml、_shared/constraint-policy.md',
    note: '权限模式、审批规则、质量门与约束卡分散在既有管理面；本台只给目标锚点，不直接改。',
    spec: {
      writableRoots: null,
      scan: (home) => {
        const out: string[] = []
        for (const rel of scanProfilesFile(home, 'config.yaml')) out.push(rel)
        const shared = 'profiles/_shared/constraint-policy.md'
        if (existsSync(resolve(home, shared))) out.push(shared)
        return out
      },
    },
  },
  {
    key: 'memory',
    nameZh: '记忆',
    nameEn: 'Memory',
    source: { components: ['c3'], context: 'always_on', opencode: 'LongTermMEMORY.md', codex: 'AGENTS.md' },
    applyMode: 'advisory',
    risk: 'medium',
    managedBy: 'memories 目录 / 记忆治理',
    expected: '$HERMES_HOME/memories/**/*.md',
    note: '长期记忆影响跨任务行为；改动走记忆治理流程，本台只登记。',
    spec: {
      writableRoots: null,
      scan: (home) => {
        const out: string[] = []
        walk(home, 'memories', 2, (_rel, name) => name.endsWith('.md') && !name.endsWith('.lock'), out)
        return out
      },
    },
  },
  {
    key: 'tool_guidance',
    nameZh: '工具指导',
    nameEn: 'Tool guidance',
    source: { components: ['c4'], context: 'always_on', opencode: 'tool_descriptions/tool_guidance.md', codex: 'AGENTS.md' },
    applyMode: 'advisory',
    risk: 'medium',
    managedBy: 'tool contract / 工具描述覆盖',
    expected: '$HERMES_HOME/tool-desc-overrides.json 或档案配置内的工具说明',
    note: '工具描述与使用边界；本台扫描真实覆盖文件，缺席如实标注。',
    spec: {
      writableRoots: null,
      scan: (home) => {
        const out: string[] = []
        for (const rel of ['tool-desc-overrides.json', 'config/tool-descriptions.json', 'profiles/_shared/tool-guidance.md']) {
          if (existsSync(resolve(home, rel))) out.push(rel)
        }
        return out
      },
    },
  },
  {
    key: 'subagents',
    nameZh: '子智能体',
    nameEn: 'Subagents',
    source: { components: ['c5'], context: 'on_demand', opencode: 'sub_agents/<name>/AGENT.md', codex: 'sub_agents/<name>/AGENT.md' },
    applyMode: 'advisory',
    risk: 'high',
    managedBy: '档案/编排层',
    expected: '$HERMES_HOME/profiles/<profile>/subagents/**、$HERMES_HOME/agents/**',
    note: '子智能体定义影响委派边界；改动须走编排与权限评审。',
    spec: {
      writableRoots: null,
      scan: (home) => {
        const out = scanProfilesNested(home, 'subagents', '.md', 2)
        walk(home, 'agents', 2, (_rel, name) => name.endsWith('.md'), out)
        return out
      },
    },
  },
  {
    key: 'skills',
    nameZh: 'Skills',
    nameEn: 'Skills',
    source: { components: ['c6'], context: 'on_demand', opencode: 'skills/<name>/SKILL.md', codex: '.agents/skills/<name>/SKILL.md' },
    applyMode: 'managed',
    risk: 'medium',
    managedBy: '本工作台 + skillprovision 对账',
    expected: '$HERMES_HOME/skills/<skill>/SKILL.md',
    note: '技能正文决定可复用流程；写盘须人工批准且 HARNESS2_APPLY=1，供给对账仍走 skillprovision。',
    spec: {
      writableRoots: ['skills', 'profiles'],
      writablePattern: /^(skills\/[^/]+\/SKILL\.md|profiles\/[^/]+\/skills\/[^/]+\/SKILL\.md)$/,
      scan: (home) => {
        const out: string[] = []
        walk(home, 'skills', 1, (_rel, name) => name === 'SKILL.md', out)
        out.push(...scanProfilesNested(home, 'skills', 'SKILL.md', 2))
        return out
      },
    },
  },
  {
    key: 'scripts',
    nameZh: '脚本',
    nameEn: 'Scripts',
    source: { components: ['c7'], context: 'on_demand', opencode: 'scripts/<name>.py', codex: 'scripts/<name>.py' },
    applyMode: 'advisory',
    risk: 'high',
    managedBy: 'automations / cron',
    expected: '$HERMES_HOME/scripts/**、$HERMES_HOME/cron/**',
    note: '可执行逻辑风险最高；本台只给候选锚点，执行与权限由运行时闸门管。',
    spec: {
      writableRoots: null,
      scan: (home) => {
        const out: string[] = []
        const exts = ['.sh', '.py', '.js', '.mjs', '.ts']
        walk(home, 'scripts', 2, (_rel, name) => exts.some((e) => name.endsWith(e)), out)
        walk(home, 'cron', 2, (_rel, name) => exts.some((e) => name.endsWith(e)) || name.endsWith('.json'), out)
        return out
      },
    },
  },
  {
    key: 'plugins',
    nameZh: '插件',
    nameEn: 'Plugins',
    source: { components: ['c8'], context: 'tool_loop', opencode: 'plugin/<name>.ts', codex: '.codex/hooks.json' },
    applyMode: 'advisory',
    risk: 'high',
    managedBy: 'mcpconfig / extmarket',
    expected: '$HERMES_HOME/plugins/**、$HERMES_HOME/mcp/*.json',
    note: '插件可扩大工具面与网络面；本台只登记，变更走插件目录与权限评审。',
    spec: {
      writableRoots: null,
      scan: (home) => {
        const out: string[] = []
        const exts = ['.json', '.js', '.mjs', '.ts']
        walk(home, 'plugins', 2, (_rel, name) => exts.some((e) => name.endsWith(e)), out)
        walk(home, 'mcp', 1, (_rel, name) => name.endsWith('.json'), out)
        return out
      },
    },
  },
]

function statDigest(rel: string, size: number, mtimeMs: number): string {
  return createHash('sha256').update(`${rel}:${size}:${Math.round(mtimeMs)}`).digest('hex')
}

function buildSurface(home: string, def: SurfaceDef): EditableSurface {
  let files: string[] = []
  try {
    files = Array.from(new Set(def.spec.scan(home))).sort().slice(0, MAX_ARTIFACTS)
  } catch {
    files = []
  }
  const rows = files.map((rel) => {
    let size = 0
    let mtimeMs = 0
    try {
      const st = statSync(resolve(home, rel))
      size = st.size
      mtimeMs = st.mtimeMs
    } catch { /* 扫描后消失：按 0 处理，下一轮会自动消失 */ }
    return { rel, size, mtimeMs }
  })
  const revision = rows.length === 0
    ? null
    : createHash('sha256').update(rows.map((r) => statDigest(r.rel, r.size, r.mtimeMs)).sort().join('\n')).digest('hex').slice(0, 16)
  return {
    key: def.key,
    nameZh: def.nameZh,
    nameEn: def.nameEn,
    source: def.source,
    applyMode: def.applyMode,
    risk: def.risk,
    editable: def.applyMode === 'managed',
    available: rows.length > 0,
    artifacts: { count: rows.length, samples: rows.slice(0, MAX_SAMPLES).map((r) => r.rel) },
    revision,
    writableRoots: def.spec.writableRoots,
    expected: def.expected,
    managedBy: def.managedBy,
    note: def.note,
  }
}

export function collectSurfaces(home = hermesHome()): EditableSurface[] {
  return SURFACES.map((def) => buildSurface(home, def))
}

export function surfaceDef(key: SurfaceKey): SurfaceDef | null {
  return SURFACES.find((s) => s.key === key) ?? null
}

export interface ResolvedTarget {
  ok: boolean
  rel?: string
  abs?: string
  error?: string
}

/**
 * managed 面目标路径解析：只接受 writableRoots 内、命中 writablePattern、且真实存在
 * 的文件。绝对路径会转成相对 HERMES_HOME；`..` 一律拒绝；符号链接逃出 HOME 也拒绝。
 */
export function resolveManagedTarget(key: SurfaceKey, input: string, home = hermesHome(), opts: { requireExists?: boolean; relaxPattern?: boolean } = {}): ResolvedTarget {
  const def = surfaceDef(key)
  if (!def) return { ok: false, error: `未知可编辑面：${key}` }
  if (def.applyMode !== 'managed' || !def.spec.writableRoots) {
    return { ok: false, error: `该面为建议模式（${def.applyMode}），不支持直接写盘` }
  }
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: '目标路径不能为空' }
  const homeAbs = resolve(home)
  let rel = raw
  if (raw.startsWith('/')) {
    const r = relative(homeAbs, resolve(raw))
    if (r.startsWith('..') || r === '') return { ok: false, error: '目标路径必须在 HERMES_HOME 内' }
    rel = r.split(sep).join('/')
  }
  rel = rel.split(sep).join('/').replace(/^\/+/, '')
  if (rel.split('/').includes('..')) return { ok: false, error: '目标路径不允许包含 ..' }
  if (!def.spec.writableRoots.some((root) => rel === root || rel.startsWith(`${root}/`))) {
    return { ok: false, error: `目标路径必须位于 ${def.spec.writableRoots.join(' / ')} 下` }
  }
  if (!opts.relaxPattern && def.spec.writablePattern && !def.spec.writablePattern.test(rel)) {
    return { ok: false, error: '目标文件名不符合该面的可写格式' }
  }
  const abs = resolve(homeAbs, rel)
  const inside = relative(homeAbs, abs)
  if (inside.startsWith('..') || inside === '') return { ok: false, error: '目标路径越出 HERMES_HOME' }
  if (opts.requireExists !== false && !existsSync(abs)) return { ok: false, error: '目标文件不存在（单文件写盘不创建新文件；树候选走 applyProposalTree）' }
  if (existsSync(abs)) {
    try {
      const real = realpathSync(abs)
      const realHome = realpathSync(homeAbs)
      const realRel = relative(realHome, real)
      if (realRel.startsWith('..')) return { ok: false, error: '目标文件经符号链接逃出 HERMES_HOME' }
    } catch (e) {
      return { ok: false, error: `目标文件不可解析：${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return { ok: true, rel, abs }
}
