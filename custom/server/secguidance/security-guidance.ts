// overlay/secguidance 域：安全指导双层（claude-code §五差距表 P2 吸收，矩阵 §3.7 P2）。
//
// cc 语义（security-guidance 同步拦+异步复查范式）：安全指导两层——
// - **同步拦**：危险操作当场拦（hard ask/deny——402 审批域的前置层）；
// - **异步复查**：已放行动作事后复查（可疑写入异步告警——不阻断但留痕）。
// 本模块=判定面（操作→同步拦/异步复查/放行三态），执行归审批域（402）与审计面。
export type SecurityVerdict = 'block' | 'async-review' | 'allow'

export interface SecurityFacts {
  tool: string
  argv: string
}

export interface SecurityDecision {
  verdict: SecurityVerdict
  reason: string
}

// 同步拦清单（cc 同步拦语义：不可静态判定的破坏性命令——hardAskOverride 同族扩展）。
const BLOCK_PATTERNS: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+.*\$[({`]/i,           // rm -rf 带命令替换（不可静态判定）
  /\bchmod\s+777\b/i,                                     // 全开权限
  /\bcurl\b[^|]*\|\s*(?:ba)?sh\b/i,                       // curl|sh 管道执行
  /\bmkfs\b|\bdd\s+if=.*of=\/dev\//i,                     // 磁盘级破坏
]

// 异步复查清单（放行但事后复查：可疑但非当场拦）。
const REVIEW_PATTERNS: RegExp[] = [
  /\bsudo\b/i,                                            // 提权操作
  /\bexport\s+[A-Z_]*(TOKEN|KEY|SECRET)/i,               // 密钥类环境变量
  /\bhistory\s+-c\b/i,                                    // 清历史
]

/** 操作→安全判定（同步拦 > 异步复查 > 放行）。 */
export function securityVerdict(facts: SecurityFacts): SecurityDecision {
  const cmd = facts.argv
  for (const p of BLOCK_PATTERNS) {
    if (p.test(cmd)) {
      return { verdict: 'block', reason: `同步拦（不可静态判定的破坏性命令）：${p.source.slice(0, 40)}` }
    }
  }
  for (const p of REVIEW_PATTERNS) {
    if (p.test(cmd)) {
      return { verdict: 'async-review', reason: '放行但入异步复查（可疑操作留痕）' }
    }
  }
  return { verdict: 'allow', reason: '无安全特征' }
}
