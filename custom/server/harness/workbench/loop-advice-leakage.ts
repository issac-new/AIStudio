// 文件职责：评测泄漏批评者（S1）（自 loop-advice.ts 纯移动，行为不变）。
import type { GateBlocker } from './types'

// ---- 泄漏批评者（S1）：评测前读 diff，拒绝携带评测集特化内容 ----

export interface LeakageSetLike {
  id: string
  tasks: Array<{ id: string; problem?: string; expectedBehavior?: string; rubric?: Array<{ text?: string }> }>
}

export type LeakageKind = 'task_id' | 'assertion_text' | 'reference' | 'problem'

export interface LeakageFinding {
  kind: LeakageKind
  /** 命中的评测集内容（长文本截断呈现）。 */
  needle: string
  /** 命中位置（候选标签/文件路径）。 */
  where: string
}

const LEAK_MIN_TASK_ID_LEN = 6
/** 文本针最小信息量：拉丁字符计 1、CJK 字符计 1.5（中文信息密度高，12 字已足够特化）。 */
const LEAK_MIN_TEXT_WEIGHT = 16
const LEAK_MAX_FINDINGS = 20

function textWeight(text: string): number {
  let w = 0
  for (const ch of text) w += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1.5 : 1
  return w
}

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 确定性泄漏扫描（论文 critic 是 LLM 读 diff；本仓映射为可解释的子串扫描）：
 * 候选内容/路径中出现评测集任务 id、断言文本、参照答案、题干 → 泄漏。
 * 泛化性提示词/工具改进不会命中；转述式泄漏检测不到（如实标注为局限）。
 */
export function findBenchmarkLeakage(
  parts: Array<{ where: string; content: string }>,
  set: LeakageSetLike | null | undefined,
): LeakageFinding[] {
  if (!set) return []
  const needles: Array<{ needle: string; kind: LeakageKind }> = []
  for (const task of set.tasks ?? []) {
    if (task.id && task.id.trim().length >= LEAK_MIN_TASK_ID_LEN) needles.push({ needle: task.id.trim(), kind: 'task_id' })
    const addText = (raw: string | undefined, kind: LeakageKind): void => {
      const text = (raw ?? '').trim()
      if (text && textWeight(text) >= LEAK_MIN_TEXT_WEIGHT) needles.push({ needle: text, kind })
    }
    addText(task.problem, 'problem')
    addText(task.expectedBehavior, 'reference')
    for (const a of task.rubric ?? []) addText(a.text, 'assertion_text')
  }
  const findings: LeakageFinding[] = []
  for (const part of parts ?? []) {
    const body = String(part.content ?? '')
    if (!body) continue
    for (const { needle, kind } of needles) {
      if (body.includes(needle)) {
        findings.push({ kind, needle: clip(needle), where: part.where })
        if (findings.length >= LEAK_MAX_FINDINGS) return findings
      }
    }
  }
  return findings
}

export function leakageBlockers(findings: LeakageFinding[]): GateBlocker[] {
  const zh: Record<LeakageKind, string> = {
    task_id: '评测任务 ID',
    assertion_text: '评测断言原文',
    reference: '评测参照答案',
    problem: '评测题干原文',
  }
  return findings.map((f) => ({
    code: 'benchmark_leakage',
    message: `候选携带${zh[f.kind]}（${f.where}：「${f.needle}」）——这是 benchmark 特化而非通用改进（RRSI 泄漏批评者）`,
  }))
}
