// overlay/custom/server/loop/engine/session-resume.ts
// 会话续接安全分档（R6，multica task.go:5210 语义）：
// session_id + work_dir 存契约行跨 run 复用——续接失败的「中毒会话」进黑名单，
// 强制新会话但保留 work_dir（不丢工作目录上下文）。
// 黑名单按 contract id 记（同一契约的 session 中毒一次即入），
// 入黑后该 contract 的后续 run 一律新会话 + 保留 work_dir。
export interface ResumeContractRow {
  id: string
  /** 上次 run 的 session_id（续接候选；空=首跑无会话） */
  session_id?: string | null
  work_dir?: string | null
  /** 上次续接结果（failed/error/timeout 视为中毒信号） */
  last_resume_failed?: boolean
}

export interface ResumeDecision {
  /** 续用旧会话（true）还是强制新会话（false） */
  reuseSession: boolean
  /** 保留的 work_dir（无论新旧会话都保留——multica 同款，不丢工作目录） */
  workDir: string | null
  /** 判定理由（留痕：为何续/为何不续） */
  reason: string
}

// 进程内黑名单（contract id 集；multica resume-unsafe blacklist 语义）
const resumeBlacklist = new Set<string>()

export function isResumeBlacklisted(contractId: string): boolean {
  return resumeBlacklist.has(contractId)
}

export function blacklistResume(contractId: string): void {
  resumeBlacklist.add(contractId)
}

export function clearResumeBlacklistForTests(): void {
  resumeBlacklist.clear()
}

/** 续接判定：黑名单/上次中毒/无旧会话 → 新会话（保留 work_dir）；否则续用 */
export function decideResume(row: ResumeContractRow): ResumeDecision {
  const workDir = row.work_dir ?? null
  if (!row.session_id) {
    return { reuseSession: false, workDir, reason: '首跑无旧会话，新会话' }
  }
  if (resumeBlacklist.has(row.id)) {
    return { reuseSession: false, workDir, reason: `resume-unsafe 黑名单（${row.id}），强制新会话保留 work_dir` }
  }
  if (row.last_resume_failed) {
    // 本次中毒：入黑 + 强制新会话（multica task.go:5210 同款——中毒会话不继承）
    resumeBlacklist.add(row.id)
    return { reuseSession: false, workDir, reason: `上次续接失败（中毒信号），入黑并强制新会话保留 work_dir` }
  }
  return { reuseSession: true, workDir, reason: `续用会话 ${row.session_id.slice(0, 12)}` }
}
