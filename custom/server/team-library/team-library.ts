// overlay[team-library] 团队库加载/校验/建议选择（EvoTeam 吸收，2026-11-08）。
//
// 正本＝team/shared/team-library.yaml（env TEAM_LIBRARY_PATH 可覆盖，测试/推演隔离用）。
// 纪律：
//   - fail-soft：正本缺席/解析失败/结构不符 → available:false + reason，不猜数；
//   - 四维身份：工作类型/改动范围/必需角色/验证策略；域名与文件名不参与身份判定；
//   - 选择器确定性：只做关键词与角色命中预筛，不调模型；最终选队由派单方裁决。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type {
  TeamEvidence,
  TeamFamily,
  TeamIdentity,
  TeamLibrary,
  TeamLibraryReport,
  TeamScore,
  TeamSelection,
  TeamSelectionInput,
  TeamVersionSnapshot,
} from './types'

/** family_id 形状：小写 kebab-case，3-64 字符。 */
export const TEAM_FAMILY_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/
/** 关键词预筛默认阈值：低于此分判 cold_start（宁缺勿错配）。 */
export const DEFAULT_SELECTION_THRESHOLD = 0.34

/** 正本路径：env 覆盖 ＞ 仓内 team/shared/team-library.yaml（board-ownership 同款解析法）。 */
export function teamLibraryPath(): string {
  const env = process.env.TEAM_LIBRARY_PATH?.trim()
  if (env) return env
  const here = typeof __dirname !== 'undefined' ? __dirname : resolve(process.cwd(), 'custom/server/team-library')
  return resolve(here, '../../..', 'team/shared/team-library.yaml')
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()))]
}

function normalizeIdentity(raw: unknown): TeamIdentity {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    workType: str(o.work_type),
    changeScope: str(o.change_scope),
    requiredRoles: strList(o.required_roles),
    verificationStrategy: str(o.verification_strategy),
  }
}

function normalizeEvidence(raw: unknown): TeamEvidence {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    taskIds: strList(o.task_ids),
    successful: strList(o.successful),
    failed: strList(o.failed),
  }
}

function normalizeHistory(raw: unknown): TeamVersionSnapshot[] {
  if (!Array.isArray(raw)) return []
  const out: TeamVersionSnapshot[] = []
  for (const item of raw) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const version = Number(o.version)
    out.push({
      version: Number.isInteger(version) && version > 0 ? version : 0,
      changedAt: str(o.changed_at),
      reason: str(o.reason) ?? '',
      members: strList(o.members),
    })
  }
  return out
}

/**
 * 纯解析＋校验：yaml 文本 → 团队库。
 * 任一家族违规即整体拒绝（配置表按批发布，半坏表上路比缺席更危险）。
 */
export function parseTeamLibrary(text: string): { ok: true; library: TeamLibrary } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    const { parse } = require('yaml') as typeof import('yaml')
    parsed = parse(text)
  } catch (e) {
    return { ok: false, reason: `team-library.yaml 解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'team-library.yaml 根节点不是对象' }
  const root = parsed as Record<string, unknown>
  if (!Array.isArray(root.families)) return { ok: false, reason: 'team-library.yaml 缺 families 数组（结构不符）' }

  const problems: string[] = []
  const seen = new Set<string>()
  const families: TeamFamily[] = []
  for (const [index, raw] of root.families.entries()) {
    const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
    if (!o) {
      problems.push(`families[${index}] 不是对象`)
      continue
    }
    const familyId = str(o.family_id) ?? ''
    if (!TEAM_FAMILY_ID_RE.test(familyId)) {
      problems.push(`families[${index}].family_id 非法：${familyId || '(空)'}（须小写 kebab-case 3-64 字符）`)
      continue
    }
    if (seen.has(familyId)) {
      problems.push(`family_id 重复：${familyId}`)
      continue
    }
    seen.add(familyId)
    const description = str(o.description) ?? ''
    if (!description) problems.push(`${familyId}.description 必填`)
    const roster = strList(o.candidate_roster)
    if (roster.length === 0) problems.push(`${familyId}.candidate_roster 至少一名候选成员`)
    const identity = normalizeIdentity(o.identity)
    if (identity.requiredRoles.length === 0) problems.push(`${familyId}.identity.required_roles 至少一项`)
    const version = Number(o.version)
    if (!Number.isInteger(version) || version < 1) problems.push(`${familyId}.version 须为正整数`)
    const status = str(o.status) ?? 'active'
    if (status !== 'active' && status !== 'retired') problems.push(`${familyId}.status 须为 active|retired`)
    const evidence = normalizeEvidence(o.evidence)
    const overlap = evidence.successful.filter((id) => evidence.failed.includes(id))
    if (overlap.length > 0) problems.push(`${familyId}.evidence 成败证据冲突：${overlap.join(',')}`)
    const versionHistory = normalizeHistory(o.version_history)
    if (versionHistory.some((h) => !Number.isInteger(h.version) || h.version < 1)) {
      problems.push(`${familyId}.version_history.version 须为正整数`)
    }
    families.push({
      familyId,
      description,
      identity,
      keywords: strList(o.keywords),
      candidateRoster: roster,
      handoffFamilyId: str(o.handoff_family_id),
      version: Number.isInteger(version) ? version : 0,
      status: status as TeamFamily['status'],
      evidence,
      versionHistory,
    })
  }

  if (problems.length > 0) return { ok: false, reason: problems.join('；') }
  const libVersion = Number(root.version)
  return {
    ok: true,
    library: {
      version: Number.isInteger(libVersion) && libVersion > 0 ? libVersion : 1,
      updated: str(root.updated),
      families,
    },
  }
}

/** 读模型入口：正本不在/坏表返回 available:false（不造假）。 */
export function loadTeamLibrary(): TeamLibraryReport {
  const path = teamLibraryPath()
  if (!existsSync(path)) {
    return { available: false, reason: `团队库正本缺席：${path}（TEAM_LIBRARY_PATH 可覆盖）`, source: path, updated: null, families: [] }
  }
  try {
    const parsed = parseTeamLibrary(readFileSync(path, 'utf8'))
    // strict:false 下布尔判别不窄化（与 board-ownership 同款先例）——显式取 reason。
    if (!parsed.ok) return { available: false, reason: (parsed as { reason?: string }).reason ?? '团队库解析失败', source: path, updated: null, families: [] }
    return {
      available: true,
      source: path,
      updated: parsed.library.updated,
      families: parsed.library.families,
    }
  } catch (e) {
    return {
      available: false,
      reason: `团队库读取失败：${e instanceof Error ? e.message : String(e)}`,
      source: path,
      updated: null,
      families: [],
    }
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ')
}

/**
 * 确定性预筛：关键词命中为主，角色命中加权。
 * score = min(1, 关键词命中数 / min(4, 关键词总数)) + 角色命中数 * 0.25（上限 0.5）。
 * 不含描述文本匹配——描述是给人读的，拿来做模糊匹配会把「类似主题」误判成「同一协作模式」。
 */
export function scoreTeamFamily(family: TeamFamily, taskText: string): TeamScore {
  const norm = normalizeText(taskText)
  const hits: string[] = []
  let keywordHits = 0
  for (const kw of family.keywords) {
    if (kw && norm.includes(kw.toLowerCase())) {
      keywordHits += 1
      hits.push(kw)
    }
  }
  const keywordDenominator = Math.max(1, Math.min(4, family.keywords.length))
  const base = Math.min(1, keywordHits / keywordDenominator)
  const roleHits = family.identity.requiredRoles.filter((role) => norm.includes(role.toLowerCase()))
  for (const role of roleHits) hits.push(`role:${role}`)
  const score = Math.min(1, base + Math.min(0.5, roleHits.length * 0.25))
  return { familyId: family.familyId, score: Number(score.toFixed(2)), hits }
}

/** 建议选择：显式家族优先；否则按分数取最高，低于阈值判 cold_start。 */
export function selectTeamFamily(families: TeamFamily[], input: TeamSelectionInput): TeamSelection {
  const taskText = String(input.taskText ?? '').trim()
  const active = families.filter((f) => f.status === 'active')
  if (!taskText) {
    return { action: 'cold_start', familyId: null, version: null, candidateRoster: [], scores: [], reason: '任务描述为空，无法预筛（需派单方按任务临建）' }
  }

  const explicitId = String(input.familyId ?? '').trim()
  if (explicitId) {
    const found = active.find((f) => f.familyId === explicitId)
    if (!found) {
      return {
        action: 'cold_start',
        familyId: null,
        version: null,
        candidateRoster: [],
        scores: [],
        reason: `显式家族不存在或已退役：${explicitId}`,
      }
    }
    return {
      action: 'reuse',
      familyId: found.familyId,
      version: found.version,
      candidateRoster: found.candidateRoster,
      scores: [{ familyId: found.familyId, score: 1, hits: ['explicit'] }],
      reason: '显式指定家族',
    }
  }

  const scores = active
    .map((f) => scoreTeamFamily(f, taskText))
    .sort((a, b) => b.score - a.score || a.familyId.localeCompare(b.familyId))
  const best = scores[0]
  const threshold = typeof input.threshold === 'number' && Number.isFinite(input.threshold)
    ? Math.min(1, Math.max(0, input.threshold))
    : DEFAULT_SELECTION_THRESHOLD
  if (!best || best.score < threshold) {
    return {
      action: 'cold_start',
      familyId: null,
      version: null,
      candidateRoster: [],
      scores,
      reason: best
        ? `无匹配家族（最高分 ${best.score} < 阈值 ${threshold}），需按任务临建`
        : '团队库无 active 家族，需按任务临建',
    }
  }
  const family = active.find((f) => f.familyId === best.familyId) as TeamFamily
  return {
    action: 'reuse',
    familyId: family.familyId,
    version: family.version,
    candidateRoster: family.candidateRoster,
    scores,
    reason: `关键词/角色预筛命中（${best.hits.join('、')}）`,
  }
}
