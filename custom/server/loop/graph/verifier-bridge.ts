// overlay/custom/server/loop/graph/verifier-bridge.ts
// P1 修复波（终审 Important 5）— Verifier 生产依赖桥接（patch 202 装配用）
//
// 终审缺陷：patch 202 原以 `new Verifier()` 零依赖装配——
// - requestHumanApproval 缺失 → verifier.ts 人工门禁分支短路（needsHuman &&
//   deps.requestHumanApproval），带 human 意图的契约静默通过，审批闭环生产不可达；
// - callJudge 缺失 → judge 意图被静默跳过（无降级声明）。
//
// 桥接语义：
// - requestHumanApproval 返回 'pending'：等待本身由图 interrupt 承载——validation
//   节点收到 overall==='pending' 即发 approval:<contractId>@<attempts> interrupt，
//   run 进 awaiting-input；真人经 POST /api/loop/contracts/:id/approve（patch 202
//   已桥接 resumeApproval）或 POST /api/graph/runs/:id/resume 应答，节点重入消费裁决。
// - callJudge（2026-11-19 调度智能批）：显式配置 GRAPH_JUDGE_BASE_URL +
//   GRAPH_JUDGE_MODEL 时注入 OpenAI-compatible 客户端；任何失败返回 pending，
//   不阻断 overall、不烧穿 repair。GRAPH_JUDGE_ENFORCE=1 时再注入 defaultJudge，
//   让未显式声明 judge 的合同也走独立审查；未配置时保持「跳过 judge 项」。

import type { VerifierDeps } from '../engine/verifier'
import type { JudgeCheck } from '../types'
import { createOpenAiJudgeClient } from './judge-client'

export interface VerifierBridgeOpts {
  log?: (msg: string) => void
}

interface JudgeEnvConfig {
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs?: number
  maxDiffChars?: number
  enabled: boolean
  enforce: boolean
  minScore: number
  rubric: string
}

function readJudgeEnv(env: NodeJS.ProcessEnv = process.env): JudgeEnvConfig {
  const baseUrl = env.GRAPH_JUDGE_BASE_URL?.trim() ?? ''
  const model = env.GRAPH_JUDGE_MODEL?.trim() ?? ''
  const timeoutMs = Number(env.GRAPH_JUDGE_TIMEOUT_MS ?? '')
  const maxDiffChars = Number(env.GRAPH_JUDGE_MAX_DIFF_CHARS ?? '')
  const minScoreRaw = env.GRAPH_JUDGE_MIN_SCORE?.trim()
  const minScoreParsed = minScoreRaw ? Number(minScoreRaw) : Number.NaN
  const minScore = Number.isFinite(minScoreParsed) && minScoreParsed >= 0 && minScoreParsed <= 1
    ? minScoreParsed
    : 0.7
  return {
    baseUrl,
    model,
    apiKey: env.GRAPH_JUDGE_API_KEY?.trim() || undefined,
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
    ...(Number.isFinite(maxDiffChars) && maxDiffChars > 0 ? { maxDiffChars } : {}),
    enabled: Boolean(baseUrl && model),
    enforce: env.GRAPH_JUDGE_ENFORCE === '1',
    minScore,
    rubric: env.GRAPH_JUDGE_RUBRIC?.trim()
      || 'Judge whether the diff satisfies the task intent; penalize missing tests, scope creep, and unverified claims.',
  }
}

export function createProductionVerifierDeps(opts: VerifierBridgeOpts = {}): VerifierDeps {
  const log = opts.log ?? ((m: string) => console.log(m))
  const deps: VerifierDeps = {
    requestHumanApproval: async (contractId, approvers) => {
      log(`[graph] human approval requested for contract ${contractId} (approvers: ${approvers.join(', ')}) — deferring to graph interrupt`)
      return 'pending'
    },
  }
  const judge = readJudgeEnv()
  if (judge.enabled) {
    deps.callJudge = createOpenAiJudgeClient({
      baseUrl: judge.baseUrl,
      model: judge.model,
      ...(judge.apiKey ? { apiKey: judge.apiKey } : {}),
      ...(judge.timeoutMs ? { timeoutMs: judge.timeoutMs } : {}),
      ...(judge.maxDiffChars ? { maxDiffChars: judge.maxDiffChars } : {}),
    })
    if (judge.enforce) {
      const defaultJudge: JudgeCheck = {
        model: judge.model,
        rubric: judge.rubric,
        minScore: judge.minScore,
      }
      deps.defaultJudge = defaultJudge
    }
    log(`[graph] verifier: judge enabled (model=${judge.model}, defaultIntent=${judge.enforce})`)
  } else {
    log('[graph] verifier: judge disabled (set GRAPH_JUDGE_BASE_URL + GRAPH_JUDGE_MODEL; '
      + 'GRAPH_JUDGE_ENFORCE=1 to apply a default judge intent)')
  }
  return deps
}
