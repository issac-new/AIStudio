// overlay/handoff 域：coder 交接话术（dsh coder final message=entire handoff 吸收，矩阵 §3.2 dsh P1）。
//
// deepseek-harness 语义（final message=entire handoff——收尾消息即完整交接书）：
// 交接书六段（衔接 400 compact 六段的会话延续口径）：
// 1. done（已完成——含验证锚点）；2. not-done（未完成/被跳过，如实）；
// 3. risks（风险与不确定项）；4. next（建议下一步）；
// 5. artifacts（产物路径/命令）；6. verify（复核命令——对方可独立验收）。
// 纯提示词资产+结构守门：每段非空、not-done 不得为空数组（空=须显式写"无"）。
export interface Handoff {
  done: string[]
  notDone: string[]
  risks: string[]
  next: string[]
  artifacts: string[]
  verify: string[]
}

export const HANDOFF_SECTIONS = [
  'done', 'notDone', 'risks', 'next', 'artifacts', 'verify',
] as const

/** 交接书结构守门：六段齐备且非空占位（空段须显式写"无"）。 */
export function validateHandoff(h: Handoff): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  for (const section of HANDOFF_SECTIONS) {
    if (!h[section] || h[section].length === 0) problems.push(`empty:${section}`)
    if (h[section]?.some((line) => line.trim() === '')) problems.push(`blank-line:${section}`)
  }
  return { ok: problems.length === 0, problems }
}

/** 交接书 → final message 文本（人可读六段式）。 */
export function renderHandoff(h: Handoff): string {
  const titles: Record<keyof Handoff, string> = {
    done: '已完成', notDone: '未完成', risks: '风险', next: '下一步', artifacts: '产物', verify: '复核',
  }
  return HANDOFF_SECTIONS
    .map((sec) => `## ${titles[sec]}\n${h[sec].map((l) => `- ${l}`).join('\n')}`)
    .join('\n\n')
}
