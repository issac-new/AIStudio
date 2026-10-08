/**
 * 六文调研轮 H2：自治阶梯配置面（BCG《Agentic AI 价值公式》"按流程定义自治级别
 * 和决策边界"——洞察→辅助→自动执行的阶梯，逐流程/逐 profile 写清人工确认点）。
 *
 * 定位：**配置与呈现面**（理论自治度的持久化事实源）。执行面（引擎拦截/审批触发）
 * 是 H3，涉 ekko patch 565/566 面按纪律单独开轮——本域不越界假装能拦。
 *
 * 与既有域的关系：
 *   - goalautonomy（autonomous/checkin/assistive 纯函数停点判定）：本域是其配置
 *     持久化 + 阶梯语义映射（assistive≈洞察/辅助、checkin≈辅助、autonomous≈自动执行）；
 *   - incident 域 B 对账：theoretical_autonomy 要素优先消费本域配置（真实配置源），
 *     无配置时按原逻辑降级为身份白名单+审批历史拼合；
 *   - govbus：配置变更发 autonomy 域事件（审计面）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** BCG 阶梯：insight=只出洞察（人决策）；assist=辅助执行（人确认关键步）；auto=流程内端到端。 */
export type LadderLevel = 'insight' | 'assist' | 'auto'

export const LADDER_LEVELS: readonly LadderLevel[] = ['insight', 'assist', 'auto']

export const LADDER_LEVEL_TITLES: Record<LadderLevel, string> = {
  insight: '洞察（只出分析和建议，人决策人执行）',
  assist: '辅助（Agent 执行，关键步人工确认）',
  auto: '自动执行（流程内端到端，例外与预算触顶才停）',
}

export interface AutonomyLadderEntry {
  /** 配置对象：profile 名（如 coding-agent）或 workflow:节点（如 workflow:build:deploy）。 */
  target: string
  level: LadderLevel
  /** 人工确认点清单（业务语言，如"生产环境部署""删除类文件操作"）。 */
  approvalPoints: string[]
  /** 允许的最高风险档（对接 approvals risk-tier：low/medium/high；auto 档才有 high）。 */
  maxRiskTier: 'low' | 'medium' | 'high'
  updatedAt: number
  updatedBy?: string
  note?: string
}

interface StoreShape { entries: AutonomyLadderEntry[] }

function storeDir(): string {
  const env = process.env.HERMES_AUTONOMY_LADDER_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'autonomy-ladder')
}

function storePath(): string {
  return join(storeDir(), 'ladder.json')
}

function load(): StoreShape {
  const file = storePath()
  if (!existsSync(file)) return { entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as StoreShape
    if (parsed && Array.isArray(parsed.entries)) {
      return { entries: parsed.entries.filter((e) => e && typeof e.target === 'string' && (LADDER_LEVELS as readonly string[]).includes(e.level)) }
    }
  } catch { /* 坏档：隔离留档再从空起步（对齐 review-store 先例） */ }
  try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 隔离失败不阻断 */ }
  return { entries: [] }
}

function save(s: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const tmp = `${storePath()}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(s, null, 2))
  renameSync(tmp, storePath())
}

export function listLadder(): AutonomyLadderEntry[] {
  return load().entries.slice().sort((a, b) => a.target.localeCompare(b.target))
}

export function getLadder(target: string): AutonomyLadderEntry | null {
  return load().entries.find((e) => e.target === target) ?? null
}

export function validateLadderInput(v: {
  target?: unknown
  level?: unknown
  approvalPoints?: unknown
  maxRiskTier?: unknown
}): string[] {
  const problems: string[] = []
  if (typeof v.target !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(v.target)) {
    problems.push('target 须为 1-120 位安全字符（profile 名或 workflow:节点标识）')
  }
  if (typeof v.level !== 'string' || !(LADDER_LEVELS as readonly string[]).includes(v.level)) {
    problems.push(`level 须为 ${LADDER_LEVELS.join('/')}`)
  }
  if (v.approvalPoints !== undefined) {
    if (!Array.isArray(v.approvalPoints) || v.approvalPoints.some((p) => typeof p !== 'string' || !p.trim())) {
      problems.push('approvalPoints 须为非空字符串数组')
    } else if (v.approvalPoints.length > 20) {
      problems.push('approvalPoints 至多 20 条')
    }
  }
  if (v.maxRiskTier !== undefined && !['low', 'medium', 'high'].includes(v.maxRiskTier as string)) {
    problems.push('maxRiskTier 须为 low/medium/high')
  }
  // auto 档不该配人工确认点（配了即语义矛盾——如实报错不静默丢弃）
  if (v.level === 'auto' && Array.isArray(v.approvalPoints) && v.approvalPoints.length > 0) {
    problems.push('level=auto（端到端）与 approvalPoints（人工确认点）语义矛盾——需确认点请用 assist 档')
  }
  return problems
}

/** upsert 一条（幂等按 target）。govbus 事件由控制器层发（域内不 import 总线，保持单向依赖）。 */
export function upsertLadder(input: Omit<AutonomyLadderEntry, 'updatedAt'> & { updatedBy?: string }): AutonomyLadderEntry {
  const problems = validateLadderInput(input)
  if (problems.length > 0) throw new Error(problems.join('；'))
  const s = load()
  const entry: AutonomyLadderEntry = {
    target: input.target,
    level: input.level,
    approvalPoints: Array.isArray(input.approvalPoints) ? input.approvalPoints : [],
    maxRiskTier: input.maxRiskTier ?? (input.level === 'auto' ? 'medium' : 'low'),
    updatedAt: Date.now(),
    ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
    ...(input.note ? { note: input.note } : {}),
  }
  const idx = s.entries.findIndex((e) => e.target === input.target)
  if (idx >= 0) s.entries[idx] = entry
  else s.entries.push(entry)
  save(s)
  return entry
}

export function removeLadder(target: string): boolean {
  const s = load()
  const idx = s.entries.findIndex((e) => e.target === target)
  if (idx < 0) return false
  s.entries.splice(idx, 1)
  save(s)
  return true
}

/** incident 域 B 对账消费面：按 profile 名（及 workflow: 前缀匹配）取适用配置。 */
export function ladderForProfile(profile: string): AutonomyLadderEntry | null {
  const entries = load().entries
  return entries.find((e) => e.target === profile)
    ?? entries.find((e) => e.target.startsWith(`workflow:${profile}:`))
    ?? null
}

/** 测试隔离。 */
export function _useLadderDirForTests(dir: string): void {
  process.env.HERMES_AUTONOMY_LADDER_DIR = dir
}

export function _resetLadderDirForTests(): void {
  delete process.env.HERMES_AUTONOMY_LADDER_DIR
}
