/**
 * 报告语言执法面（2026-10-11 用户裁定：说人话/图对得上描述——判据具体化轮同步件）。
 * 与 simharness mx-report-gen 判据块 / mx-report-audit A10·A11 两侧判定一致（§5.4.1：
 * 本目录为语义正本，差异即缺陷）。词表单一事实源=scripts/plan-html/jargon-check.py
 * （HARD 数组），本模块加载时解析——词表更新两侧自动同频，同步性由测试断言防漂移。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

// server tsconfig 为 commonjs，import.meta 会以 TS1343 被 tsc 门禁拒绝；CJS 侧
// 用 __dirname（esbuild bundle 后同样成立），vitest ESM 下 __dirname 未定义则
// 落绝对路径兜底候选——两个候选指向同一份 jargon-check.py（单一事实源不破）。
const HERE = (() => { try { return __dirname } catch { return process.cwd() } })()
const JC = [join(HERE, '../../../scripts/plan-html/jargon-check.py'), '/Users/cuishi/lab/ncwk/overlay/scripts/plan-html/jargon-check.py']
  .find((p) => existsSync(p))

/** 解析 jargon-check.py 的 HARD 数组（词表单一事实源，不复制第二份） */
export function loadHardWords(from = JC): string[] {
  if (!from) return []
  const src = readFileSync(from, 'utf-8')
  const m = /HARD\s*=\s*\[([\s\S]*?)\]/.exec(src)
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

export const HARD_WORDS = loadHardWords()
const ALLOW_EXACT = new Set(['闭环治理终态'])
const ALLOW_SUBSTR = ['一起跑', "'导演'"]

export interface PlainLanguageVerdict {
  violations: string[]
  ok: boolean
}

/** 正文可见文本黑话检查（A10 等价）：剔除折叠区/代码块后扫 HARD 词 */
export function checkVisibleTextPlainLanguage(html: string): PlainLanguageVerdict {
  let vis = html
  // 由内向外剥 <details>（嵌套折叠区必须整层移除）
  for (;;) {
    const next = vis.replace(/<details[^>]*>(?:(?!<details|<\/details>)[\s\S])*<\/details>/gi, ' ')
    if (next === vis) break
    vis = next
  }
  vis = vis.replace(/<(script|style|pre)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, '\n')
  const violations: string[] = []
  for (const w of HARD_WORDS) {
    const hits = vis.split(w).length - 1
    if (hits === 0) continue
    if (ALLOW_EXACT.has(w)) continue
    if (ALLOW_SUBSTR.some((s) => s.includes(w) && vis.includes(s))) continue
    violations.push(`${w}×${hits}`)
  }
  return { violations, ok: violations.length === 0 }
}

export interface CriteriaSectionVerdict {
  /** 合格线标准条目在位（不只列名字） */
  hasCriteriaItems: boolean
  /** 判定证据行在位（实物核对/关卡判词——证明优先于叙事） */
  hasEvidenceLine: boolean
  ok: boolean
}

/** 断言⑥（判据具体化）：步块②段须含合格线标准与判定证据行 */
export function checkCriteriaSection(sectionHtml: string): CriteriaSectionVerdict {
  const hasCriteriaItems = /合格线/.test(sectionHtml) && /<li>/i.test(sectionHtml)
  const hasEvidenceLine = /判定证据：/.test(sectionHtml) &&
    /(实物核对|关卡判词|判词通过|无文件域工件)/.test(sectionHtml)
  return { hasCriteriaItems, hasEvidenceLine, ok: hasCriteriaItems && hasEvidenceLine }
}

export interface FrameLabelVerdict {
  violations: string[]
  ok: boolean
}

/** 断言⑦（A11 等价，图与描述对得上）：alt 非空 + 成效帧图注含功能语义 */
export function checkFrameFunctionLabels(html: string): FrameLabelVerdict {
  const violations: string[] = []
  const imgs = html.match(/<img [^>]*>/g) || []
  for (const tag of imgs) {
    const alt = /\salt="([^"]*)"/.exec(tag)
    if (!alt || alt[1].trim() === '') violations.push(`img 缺功能描述 alt：${tag.slice(0, 50)}`)
  }
  const caps = html.match(/<figcaption><span class="shot-kind">功能实证<\/span>([^<]*)<\/figcaption>/g) || []
  for (const c of caps) {
    const label = c.replace(/<[^>]+>/g, '').replace('功能实证', '').trim()
    if (label === '' || /^[A-Za-z0-9._-]+$/.test(label) || label.includes('未标注')) {
      violations.push(`成效帧图注无功能语义（只留文件名/未标注）：${label}`)
    }
  }
  return { violations, ok: violations.length === 0 }
}
