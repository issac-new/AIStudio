// custom/server/autonomygov/six-questions.ts
// 六问完成判据（研究文档 6.2）：只回答「记录够不够」，不给人或执行单元排序、不出分。
// 无数据源一律 unknown 并写明 gap——把缺席源写成 yes/no 就是造假。
import type { AgentIdentity } from '../agentidentity/agent-identity'
import type { JudgmentRecord } from '../agentidentity/judgments'
import type { Person } from '../agentidentity/people'
import { cardGaps } from '../agentidentity/responsibility'
import type { BridgeDecision } from '../decisiongraph/semantica-client'
import type { EvalRun } from '../eval/types'

export type SixAnswer = 'yes' | 'no' | 'unknown'

export interface SixQuestionAnswer {
  id: 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6'
  question: string
  answer: SixAnswer
  evidence: { source: string; ref: string; value: string | number }[]
  gap?: string
}

export interface SixQuestionDeps {
  decisions?: BridgeDecision[]
  identities?: AgentIdentity[]
  people?: Person[]
  judgments?: JudgmentRecord[]
  evalRuns?: EvalRun[]
}

export function sixQuestions(deps: SixQuestionDeps): SixQuestionAnswer[] {
  const decisions = deps.decisions ?? []
  const identities = deps.identities ?? []
  const people = deps.people ?? []
  const judgments = deps.judgments ?? []
  const evalRuns = deps.evalRuns ?? []
  const active = new Set(people.filter((p) => p.active).map((p) => p.id))

  // Q1 责任链可还原：决策记录同时有 decidedBy 与 stage
  const withActor = decisions.filter((d) => d.decidedBy).length
  const withStage = decisions.filter((d) => d.stage).length
  const complete = decisions.filter((d) => d.decidedBy && d.stage).length
  const q1: SixQuestionAnswer = decisions.length === 0
    ? {
        id: 'q1', question: '重大决定的责任链条能否还原', answer: 'unknown',
        evidence: [], gap: '无决策记录（decisiongraph 为空）',
      }
    : {
        id: 'q1', question: '重大决定的责任链条能否还原',
        answer: complete === decisions.length ? 'yes' : 'no',
        evidence: [
          { source: 'decisiongraph', ref: 'decisions', value: decisions.length },
          { source: 'decisiongraph', ref: 'with-decidedBy', value: withActor },
          { source: 'decisiongraph', ref: 'with-stage', value: withStage },
          { source: 'decisiongraph', ref: 'complete', value: complete },
        ],
        ...(complete === decisions.length ? {} : { gap: `${decisions.length - complete} 条决策缺 decidedBy 或 stage` }),
      }

  // Q2 无无主执行单元：卡无缺口且主责任人是在岗自然人
  const unowned = identities.filter((i) => cardGaps(i.responsibilityCard, people).length > 0)
  const q2: SixQuestionAnswer = identities.length === 0
    ? {
        id: 'q2', question: '责任卡是否签署、台账里是否还有无主执行单元', answer: 'unknown',
        evidence: [], gap: '身份册为空',
      }
    : {
        id: 'q2', question: '责任卡是否签署、台账里是否还有无主执行单元',
        answer: unowned.length === 0 ? 'yes' : 'no',
        evidence: [
          { source: 'agentidentity', ref: 'units', value: identities.length },
          { source: 'agentidentity', ref: 'unowned', value: unowned.length },
        ],
        ...(unowned.length === 0 ? {} : { gap: `无主/缺卡单元：${unowned.slice(0, 10).map((i) => i.name).join('、')}` }),
      }

  // Q3 调用量 vs 资源消耗：本轮不建净贡献核算，固定 unknown（非目标）
  const q3: SixQuestionAnswer = {
    id: 'q3', question: '账面调用量与实际资源消耗的差异方向能否说清', answer: 'unknown',
    evidence: [], gap: '净贡献基线未建立（本轮非目标）',
  }

  // Q4 连续稳定运行：存在 stabilityRetest>=2 的读数
  const stability = evalRuns.flatMap((r) => r.attempts ?? [])
    .map((a) => a.judgeMeta?.outputStability)
    .filter((s): s is { rounds: number; checked: number; flips: number } => !!s && s.rounds >= 2)
  const q4: SixQuestionAnswer = stability.length === 0
    ? {
        id: 'q4', question: '连续稳定运行的差距是否有可解释的数据', answer: 'unknown',
        evidence: [], gap: '无稳定性重测记录（stabilityRetest < 2 或未跑评测）',
      }
    : {
        id: 'q4', question: '连续稳定运行的差距是否有可解释的数据', answer: 'yes',
        evidence: [
          { source: 'eval', ref: 'stability-readings', value: stability.length },
          { source: 'eval', ref: 'checked', value: stability.reduce((n, s) => n + s.checked, 0) },
          { source: 'eval', ref: 'flips', value: stability.reduce((n, s) => n + s.flips, 0) },
        ],
      }

  // Q5 同口径基准：本轮不接跨轮基线（非目标）
  const q5: SixQuestionAnswer = {
    id: 'q5', question: '是否存在一个可与后续观测同口径比较的基准', answer: 'unknown',
    evidence: [], gap: '跨轮基线未接入六问（本轮非目标）',
  }

  // Q6 验证投入与例外处置有署名记录
  const unsigned = judgments.filter((j) => !active.has(j.signedBy))
  const q6: SixQuestionAnswer = judgments.length === 0
    ? {
        id: 'q6', question: '验证投入与例外处置是否已有署名记录', answer: 'no',
        evidence: [{ source: 'judgments', ref: 'records', value: 0 }],
        gap: '零署名记录：判断是否发生无法证明',
      }
    : {
        id: 'q6', question: '验证投入与例外处置是否已有署名记录',
        answer: unsigned.length === 0 ? 'yes' : 'no',
        evidence: [
          { source: 'judgments', ref: 'records', value: judgments.length },
          { source: 'judgments', ref: 'unsigned', value: unsigned.length },
        ],
        ...(unsigned.length === 0 ? {} : { gap: `${unsigned.length} 条记录的署名不在在岗名单` }),
      }

  return [q1, q2, q3, q4, q5, q6]
}
