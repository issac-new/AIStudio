/**
 * 报告证据透传块（§5.4 呈现形态/§5.5 门禁证据引用——正本自 simharness
 * mx-report-gen.py qgate_block/gov_evidence_block 移植，2026-10-08 落地产品侧）。
 *
 * 纪律：证据=导出件原文透传（禁手抄结论）；QGate 块摘要自带来源分布要求；
 * 敏感内容不加工——只做 HTML 转义与容器包装。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** QGate 门禁证据块（步 20）：release-report 原文透传+来源分布随行 */
export function qgateBlock(rawReleaseReport: string): string {
  return (
    '<details class="st-artifact st-qgate"><summary>🛡 QGate 门禁证据' +
    '（release-report 原文透传，来源分布随行——§5.5：降级/声明/无信号桶非零或存在未验证声明时不得表述为全绿/已核验）</summary>' +
    `<pre class="art-code">${escapeHtml(rawReleaseReport.trim())}</pre></details>`
  )
}

export interface GovEvidenceItem {
  /** 展示名（含导出来源 API 说明） */
  label: string
  /** 导出件原文 */
  raw: string
}

/** 六文调研治理能力证据块（步 23/24）：事故报告汇编/自治度对账/虚拟损益表 */
export function govEvidenceBlocks(items: GovEvidenceItem[]): string {
  return items
    .map(
      (it) =>
        `<details class="st-artifact st-gov"><summary>🧾 ${escapeHtml(it.label)}` +
        `（原文透传）</summary><pre class="art-code">${escapeHtml(it.raw.trim())}</pre></details>`,
    )
    .join('')
}

/** 步 23/24 治理证据导出件清单（文件名→展示名；采集端按此落盘 evidence/） */
export const GOV_EVIDENCE_FILES: Readonly<Record<number, ReadonlyArray<{ file: string; label: string }>>> = {
  23: [{ file: 'incident-report.md', label: '事故报告汇编（三类 17 要素，/api/incident/sessions/:id/report 导出件）' }],
  24: [
    { file: 'autonomy-reconcile.txt', label: '理论/实际自治度对账（/autonomy 导出件，偏差黄条）' },
    { file: 'virtual-pl.txt', label: 'AI 虚拟损益表（/api/hermes/virtual-pl 导出件）' },
  ],
}
