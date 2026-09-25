// overlay/autosched 域：自动化调度（qoder §四 P1-5 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（自动化：定时+时区+到期日+无人值守授权+执行记录分组）：
// - **定时+时区**：cron 表达式按时区解析（跨时区任务不漂）；
// - **到期日**：automation 带 deadline（到期自停）；
// - **无人值守授权**：自动跑的授权（unattended 授权——多机/夜间跑的准入）。
// 衔接 hermes cron（执行面）与 391/402（授权面）：本层=调度语义+授权判定纯函数。
export interface AutomationSpec {
  specId: string
  cron: string
  /** IANA 时区（qoder 时区语义；缺省=UTC）。 */
  timeZone: string
  /** 到期日（ISO；null=永不过期）。 */
  deadline: string | null
  /** 无人值守授权（未授权=到点需人放行）。 */
  unattended: boolean
}

export interface AutomationReadiness {
  runnable: boolean
  reason: string
}

/** 调度就绪判定（到期/授权双门——qoder 语义）。 */
export function automationReadiness(spec: AutomationSpec, now: number = Date.now()): AutomationReadiness {
  if (spec.deadline) {
    const deadlineMs = Date.parse(spec.deadline)
    if (Number.isFinite(deadlineMs) && now > deadlineMs) {
      return { runnable: false, reason: '已过到期日（deadline 已过——到期自停）' }
    }
  }
  if (!spec.unattended) {
    return { runnable: false, reason: '未授予无人值守授权——到点需人放行' }
  }
  return { runnable: true, reason: '就绪（未过期+已授权）' }
}

/** 执行记录分组键（qoder：执行记录按日分组）。 */
export function executionGroupKey(at: number, timeZone: string): string {
  // 按日分组键：时区偏移由调用方给（Intl 不可用环境降级 UTC 日）。
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
  } catch {
    return new Date(at).toISOString().slice(0, 10)
  }
}
