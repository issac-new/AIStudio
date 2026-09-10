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
// - callJudge 不注入：P1 无可用模型调用方，verifier 对未配置 judge 的既有语义是
//   跳过 judge 项（程序化 + 人工门禁照常生效）。刻意不注入"恒失败"的假 judge——
//   score<minScore 会让 judge 意图契约永远失败，repair 循环烧穿 attempts 全部
//   escalated（生产死锁）。P2 Task 3 已在 VerificationRecord/judge dep 上备好
//   pending 结构（{status:'pending', reason} → 记 status='pending' 且不阻断 overall），
//   真实模型调用仍待接线（judge 未配置时装配 warn 一次显式声明降级）。

import type { VerifierDeps } from '../engine/verifier'

export interface VerifierBridgeOpts {
  log?: (msg: string) => void
}

export function createProductionVerifierDeps(opts: VerifierBridgeOpts = {}): VerifierDeps {
  const log = opts.log ?? ((m: string) => console.log(m))
  log('[graph] verifier: human approval gate bridged to graph interrupt; judge NOT configured in P1 (judge-intent contracts verify via programmatic+human gates only, real judge lands in P2)')
  return {
    requestHumanApproval: async (contractId, approvers) => {
      log(`[graph] human approval requested for contract ${contractId} (approvers: ${approvers.join(', ')}) — deferring to graph interrupt`)
      return 'pending'
    },
  }
}
