// overlay/ask 域：结构化问卷契约（minimax ask_user 吸收，矩阵 §3.4 P1；minimax+dsh 双源）。
//
// minimax 语义（§六 C 表 P1 ask_user 结构化问卷契约）：子代理向人提问不再自由文本，
// 而是结构化问卷——**1-4 步 × 每步 2-4 选项 × recommended 标记 × 带图可选**。
// 结构化的目的：回答可机器消费（选项 id 直接进派单/审批决策），推荐项降低决策成本，
// 步数/选项数上限防问卷变成漫谈。
//
// 纪律（与 402 审批域同族）：契约校验是纯函数；问卷状态机（pending→answered）
// 存储轻量 JSON；答案回流到调用方（子代理拿到选中 optionId 继续），人机边界清晰。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export const MAX_STEPS = 4
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 4

export interface AskOption {
  id: string
  label: string
  /** minimax recommended 标记（每步至多一个推荐项）。 */
  recommended?: boolean
  /** 带图可选（图片引用 URL/路径——不内嵌字节）。 */
  imageRef?: string
}

export interface AskStep {
  stepId: string
  question: string
  options: AskOption[]
}

export interface AskQuestionnaire {
  askId: string
  taskId?: string
  steps: AskStep[]
  at: number
  status: 'pending' | 'answered'
  /** 答案：stepId → optionId（answered 后只读）。 */
  answers?: Record<string, string>
}

export interface AskValidationIssue {
  where: string
  issue: string
}

export function validateQuestionnaire(steps: AskStep[]): AskValidationIssue[] {
  const issues: AskValidationIssue[] = []
  if (!Array.isArray(steps) || steps.length === 0) {
    return [{ where: 'steps', issue: '问卷至少 1 步' }]
  }
  if (steps.length > MAX_STEPS) {
    issues.push({ where: 'steps', issue: `步数上限 ${MAX_STEPS}（防问卷变漫谈）` })
  }
  const stepIds = new Set<string>()
  steps.forEach((st, i) => {
    const where = `steps[${i}]`
    if (!st || typeof st.stepId !== 'string' || !st.stepId) {
      issues.push({ where, issue: 'stepId 必填' })
      return
    }
    if (stepIds.has(st.stepId)) issues.push({ where, issue: `stepId 重复：${st.stepId}` })
    stepIds.add(st.stepId)
    if (typeof st.question !== 'string' || !st.question.trim()) {
      issues.push({ where, issue: 'question 必填' })
    }
    const opts = Array.isArray(st.options) ? st.options : []
    if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) {
      issues.push({ where, issue: `选项须 ${MIN_OPTIONS}-${MAX_OPTIONS} 个（现有 ${opts.length}）` })
    }
    const optIds = new Set<string>()
    let recommendedCount = 0
    for (const o of opts) {
      if (!o || typeof o.id !== 'string' || !o.id) {
        issues.push({ where, issue: '选项 id 必填' })
        continue
      }
      if (optIds.has(o.id)) issues.push({ where, issue: `选项 id 重复：${o.id}` })
      optIds.add(o.id)
      if (typeof o.label !== 'string' || !o.label.trim()) {
        issues.push({ where, issue: `选项 ${o.id} label 必填` })
      }
      if (o.recommended === true) recommendedCount += 1
      if (o.imageRef !== undefined && typeof o.imageRef !== 'string') {
        issues.push({ where, issue: `选项 ${o.id} imageRef 须为字符串引用（不内嵌字节）` })
      }
    }
    if (recommendedCount > 1) issues.push({ where, issue: 'recommended 至多一个（每步单推荐）' })
  })
  return issues
}

// ── 轻量存储（每问卷一份 JSON）──

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.ask-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function askDir(): string {
  const env = process.env.HERMES_ASK_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.ask')
  return join(homedir(), '.hermes-web-ui', 'ask')
}

function askFile(askId: string): string {
  return join(askDir(), `${askId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

export function loadQuestionnaire(askId: string): AskQuestionnaire | null {
  try {
    const raw = JSON.parse(readFileSync(askFile(askId), 'utf8'))
    if (raw && raw.askId === askId && Array.isArray(raw.steps)) return raw as AskQuestionnaire
  } catch { /* 坏/无文件 fail-soft */ }
  return null
}

function save(q: AskQuestionnaire): void {
  mkdirSync(askDir(), { recursive: true })
  writeFileSync(askFile(q.askId), JSON.stringify(q, null, 2))
}

/** 开问卷（先校验后存；幂等 askId）。校验失败返回 issues 不落盘。 */
export function createQuestionnaire(q: Omit<AskQuestionnaire, 'at' | 'status'> & { at?: number }): AskQuestionnaire | { issues: AskValidationIssue[] } {
  const existing = loadQuestionnaire(q.askId)
  if (existing) return existing
  const issues = validateQuestionnaire(q.steps)
  if (issues.length) return { issues }
  const full: AskQuestionnaire = { ...q, at: q.at ?? Date.now(), status: 'pending' }
  save(full)
  return full
}

/** 答卷（全部 stepId→optionId 必答且 optionId 须在选项集内；一次定音）。 */
export function answerQuestionnaire(askId: string, answers: Record<string, string>): AskQuestionnaire | { error: string } {
  const q = loadQuestionnaire(askId)
  if (!q) return { error: '问卷不存在' }
  if (q.status === 'answered') return { error: '问卷已答复（一次定音）' }
  const errors: string[] = []
  for (const st of q.steps) {
    const picked = answers[st.stepId]
    if (typeof picked !== 'string' || !picked) {
      errors.push(`缺答：${st.stepId}`)
      continue
    }
    if (!st.options.some((o) => o.id === picked)) {
      errors.push(`选项非法：${st.stepId}=${picked}`)
    }
  }
  const extra = Object.keys(answers).filter((k) => !q.steps.some((st) => st.stepId === k))
  if (extra.length) errors.push(`多余步：${extra.join(',')}`)
  if (errors.length) return { error: errors.join('; ') }
  q.answers = answers
  q.status = 'answered'
  save(q)
  return q
}
