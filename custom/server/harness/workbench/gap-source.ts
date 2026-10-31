// overlay/custom/server/harness/workbench/gap-source.ts
// R5（2026-10-31 二批执行）：RSI 内核缺口信号 → 改进实验台提案来源的只读桥。
// 决策 D4：不搬内核进仓，只建双向桥；回写走 capability-gap-suggestions.yaml
// 建议行（不直写手工区，维持 2026-09-18 rsi-kernel spec 裁决 1）。
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

/** RSI 内核 gap_register 权威位置（watchdog 同源，R1 三级序的第②址）。 */
export const GAP_REGISTER_PATH = '/Users/cuishi/hermes-docker-sandbox/workspace/life-workbench/gap_register.yaml'

/** capability 域缺口的机器可读形态（只取与 harness 改进相关的字段）。 */
export interface GapEntry {
  id: string
  domain: string
  description: string
  severity?: string
  evidence?: string
  createdAt?: string
}

/**
 * 解析 gap_register.yaml 的 capability 域条目（容错 YAML 子集读取，不引依赖）。
 * 文件缺席/不可读返回 null（fail-soft），不猜。
 */
export function readCapabilityGaps(path: string = GAP_REGISTER_PATH): GapEntry[] | null {
  if (!existsSync(path)) return null
  try {
    const txt = readFileSync(path, 'utf8')
    const entries: GapEntry[] = []
    let cur: Record<string, string> | null = null
    for (const raw of txt.split('\n')) {
      const line = raw.replace(/\r$/, '')
      if (/^\s*-\s+\S/.test(line) || /^\S/.test(line)) {
        // 新条目起点（列表项或顶层键）
        if (cur && cur.domain === 'capability') {
          entries.push({ id: cur.id ?? `gap-${entries.length}`, domain: cur.domain, description: cur.description ?? '', severity: cur.severity, evidence: cur.evidence, createdAt: cur.createdAt })
        }
        cur = {}
        const kv = line.match(/^\s*-?\s*([\w_]+):\s*(.*)$/)
        if (kv) cur[kv[1]] = kv[2].trim()
      } else if (cur) {
        const kv = line.match(/^\s+([\w_]+):\s*(.*)$/)
        if (kv) cur[kv[1]] = kv[2].trim()
      }
    }
    if (cur && cur.domain === 'capability') {
      entries.push({ id: cur.id ?? `gap-${entries.length}`, domain: cur.domain, description: cur.description ?? '', severity: cur.severity, evidence: cur.evidence, createdAt: cur.createdAt })
    }
    return entries
  } catch {
    return null
  }
}

/** 缺口驱动提案的 draft 形态（喂给既有 createProposal 通道）。 */
export interface GapDrivenDraft {
  title: string
  hypothesis: string
  surfaceKey: 'skills' | 'tool_guidance' | 'system_prompt'
  domain: string
  evidenceRefs: string[]
}

const SURFACE_BY_FIX_HINT: Array<[RegExp, GapDrivenDraft['surfaceKey']]> = [
  [/技能|skill/i, 'skills'],
  [/工具|tool/i, 'tool_guidance'],
]

/** 缺口→提案形态映射（标题截断/hypothesis=缺口陈述/evidenceRefs 引 gap id）。 */
export function gapToDraft(gap: GapEntry): GapDrivenDraft {
  const fix = `${gap.description} ${gap.evidence ?? ''}`
  const surfaceKey: GapDrivenDraft['surfaceKey'] = SURFACE_BY_FIX_HINT.find(([re]) => re.test(fix))?.[1] ?? 'skills'
  return {
    title: `缺口驱动：${gap.description.slice(0, 24)}`,
    hypothesis: `capability 缺口「${gap.description.slice(0, 120)}」——按 RSI 内核阶梯补全（gap id ${gap.id}）`,
    surfaceKey,
    domain: 'capability',
    evidenceRefs: [`gap:${gap.id}`],
  }
}

/**
 * 采纳晋级后的回写：向 capability-gap-suggestions.yaml 追加一条建议行
 * （不直写手工区 capability-graph.yaml——裁决 1）。文件缺席则连头建。
 */
export function appendGapSuggestion(suggestPath: string, line: { gapId: string; proposalId: string; surfaceKey: string; at: string }): void {
  const yaml = `- gap_id: ${line.gapId}\n  proposal: ${line.proposalId}\n  surface: ${line.surfaceKey}\n  at: ${line.at}\n`
  if (!existsSync(suggestPath)) {
    mkdirSync(dirname(suggestPath), { recursive: true })
    appendFileSync(suggestPath, `# R5 桥（2026-10-31）：workbench 采纳 → capability 补全建议（人审后入 capability-graph 手工区）\n${yaml}`)
    return
  }
  appendFileSync(suggestPath, yaml)
}
