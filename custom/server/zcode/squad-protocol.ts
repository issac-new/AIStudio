// overlay[zcode] P0 批第四项：squad leader 协调协议（multica squad_briefing.go:14-160 语义吸收，矩阵 §3.5 P0）。
//
// 四件语义（multica §2.3/§八表 #3）：
// 1. 选人是 leader 的职责——@squad/<名> 只派给 leader（不广播成员）；leader 决定自己做
//    还是 mention 委托成员（成员委托走既有 @mention 派单链）。
// 2. 每轮必录评估——leader 收到派单后的每轮必须记 action|no_action|failed + reason
//    （no_action 也必录，且禁止为 no_action 再发评论防噪音）。
// 3. 自触发抑制——leader @ 自己所在 squad 且自己刚跑过该 squad 任务 → self_trigger_suppressed。
// 4. 交付边界——agent 只能把任务推到 in_review；done 是人类的动作
//    （squad_briefing 原文 "Leave done to a human reviewer"）。
//
// 名册单一事实源：runtime/roster/squads.yaml（HERMES_SQUADS_FILE 可覆盖）。
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export const SQUAD_EVALUATION_VERDICTS = ['action', 'no_action', 'failed'] as const
export type SquadEvaluationVerdict = (typeof SQUAD_EVALUATION_VERDICTS)[number]

export interface SquadDefinition {
  leader: string
  members: string[]
}

export interface SquadEvaluationRecord {
  squad: string
  leader: string
  verdict: SquadEvaluationVerdict
  reason: string
  /** 关联派单的 sessionId（可追溯）。 */
  sessionId?: string
  at: number
}

export interface SquadBriefing {
  squad: string
  leader: string
  members: string[]
  prompt: string
}

let cachedSquads: Record<string, SquadDefinition> | null = null

export function squadsFilePath(): string {
  const env = process.env.HERMES_SQUADS_FILE?.trim()
  if (env) return resolve(env)
  return resolve(__dirname, '../../../runtime/roster/squads.yaml')
}

export function loadSquads(): Record<string, SquadDefinition> {
  if (cachedSquads) return cachedSquads
  try {
    const p = squadsFilePath()
    if (!existsSync(p)) return (cachedSquads = {})
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    const raw = parse(readFileSync(p, 'utf8')) || {}
    const out: Record<string, SquadDefinition> = {}
    for (const [name, def] of Object.entries(raw.squads ?? {})) {
      const d = def as { leader?: unknown; members?: unknown }
      if (typeof d.leader === 'string' && d.leader && Array.isArray(d.members)) {
        out[name] = { leader: d.leader, members: d.members.map(String).filter(Boolean) }
      }
    }
    cachedSquads = out
  } catch {
    cachedSquads = {}
  }
  return cachedSquads
}

export function resetSquadsCacheForTests(): void {
  cachedSquads = null
}

export function resolveSquad(name: string): SquadDefinition | null {
  return loadSquads()[name] ?? null
}

/** 自触发抑制（multica shouldSuppressSquadLeaderSelfTrigger 语义 v1：leader @ 自己 squad）。 */
export function isSelfTrigger(squad: SquadDefinition, mentionAuthor: string): boolean {
  return squad.leader === mentionAuthor
}

/** 构造 leader 派单简报（四件语义进提示词：选人职责/必录评估/自触发/交付边界）。 */
export function buildSquadBriefing(squadName: string, squad: SquadDefinition, taskText: string): SquadBriefing {
  const prompt = [
    `[squad:${squadName}] 你是本 squad 的 leader（成员：${squad.members.join('、')}）。`,
    `任务：${taskText}`,
    '',
    '规则：',
    '1. 选人与分派是你的职责：自己能做的直接做；需要成员做的用 @成员名 委托（总线会派单并回传结果）。',
    `2. 每轮必录评估：收尾时明确给出 verdict=action|no_action|failed 与一句话 reason（no_action 也要录，且不要再发评论解释）。`,
    '3. 交付边界：你只能把任务推进到待人工复核（in_review）；完成（done）由人类决定，不要自己宣告 done。',
  ].join('\n')
  return { squad: squadName, leader: squad.leader, members: squad.members, prompt }
}

export function isSquadEvaluationVerdict(v: unknown): v is SquadEvaluationVerdict {
  return typeof v === 'string' && (SQUAD_EVALUATION_VERDICTS as readonly string[]).includes(v)
}

/** 评估留痕（进程内台账 + 上限环形；REST 查询面读它）。 */
const MAX_EVALUATIONS = 200
const evaluations: SquadEvaluationRecord[] = []

export function recordEvaluation(rec: SquadEvaluationRecord): SquadEvaluationRecord[] {
  evaluations.push(rec)
  if (evaluations.length > MAX_EVALUATIONS) evaluations.shift()
  return evaluations
}

export function listEvaluations(squad?: string): SquadEvaluationRecord[] {
  return squad ? evaluations.filter((e) => e.squad === squad) : [...evaluations]
}
