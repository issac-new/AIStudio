/**
 * 报告证据透传块（§5.4 呈现形态/§5.5 门禁证据引用——正本自 simharness
 * mx-report-gen.py qgate_block/gov_evidence_block 移植，2026-10-08 落地产品侧）。
 *
 * 纪律：证据=导出件原文透传（禁手抄结论）；QGate 块摘要自带来源分布要求；
 * 敏感内容不加工——只做 HTML 转义与容器包装。
 */

/**
 * 宿主环境脱敏（§5.4.3，2026-10-11 立法）：报告与全部衍生呈现件禁出现宿主机个人环境标识。
 * 语义正本在此，simharness mx-report-gen._mask_env / mask_env_paths 为兼容消费实现——两侧判定必须一致。
 */
export function maskEnvPaths(s: string): string {
  return s
    .replace(/\/Users\/[A-Za-z0-9_.-]+/g, '[宿主家目录]')
    .replace(/\/Volumes\/[A-Za-z0-9_.-]+/g, '[宿主卷]')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** QGate 门禁证据块（步 20）：release-report 原文透传+来源分布随行 */
export function qgateBlock(rawReleaseReport: string): string {
  const raw = maskEnvPaths(rawReleaseReport)
  return (
    '<details class="st-artifact st-qgate"><summary>🛡 QGate 门禁证据' +
    '（release-report 原文透传，来源分布随行——§5.5：降级/声明/无信号桶非零或存在未验证声明时不得表述为全绿/已核验）</summary>' +
    `<pre class="art-code">${escapeHtml(raw.trim())}</pre></details>`
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
        `（原文透传）</summary><pre class="art-code">${escapeHtml(maskEnvPaths(it.raw).trim())}</pre></details>`,
    )
    .join('')
}

export interface ProductOutcomeShot {
  /** 帧文件名（如 cashier-p1-order.png） */
  file: string
  /** 相对报告的证据目录前缀（如 product-outcome/） */
  dir?: string
  /** 功能语义标注（如「微信开发者工具·支付成功」——用户红线：图与描述对得上；
   *  缺省回退文件名并标「未标注」，checkFrameFunctionLabels 将其判为违例 */
  label?: string
}

/**
 * 产品成效系列帧网格（§5.4.4 系列完整性 + 2026-10-11 版面指令）：
 * 四分之一宽四列缩略网格（.po-shots），自然比例不裁剪，点击全屏放大（.shot 缩放交互）。
 * 系列覆盖=P1 首页+P2 结果页三态（成功/失败可重试/超时关闭）+幂等，双渠道主状态各 ≥1 程。
 */
export function productOutcomeShots(shots: ProductOutcomeShot[]): string {
  const d = shots[0]?.dir ?? 'product-outcome/'
  return (
    '<div class="po-shots">' +
    shots
      .map((s) => {
        const label = s.label ?? s.file.replace(/\.[a-z]+$/, '') + '（未标注）'
        return (
          `<label class="shot"><input type="checkbox">` +
          `<img src="${escapeHtml(d + s.file)}" alt="${escapeHtml(label)}" loading="lazy">` +
          `<figcaption><span class="shot-kind">功能实证</span>${escapeHtml(label)}</figcaption></label>`
        )
      })
      .join('') +
    '</div>'
  )
}

/** 步 23/24 治理证据导出件清单（文件名→展示名；采集端按此落盘 evidence/） */
export const GOV_EVIDENCE_FILES: Readonly<Record<number, ReadonlyArray<{ file: string; label: string }>>> = {
  23: [{ file: 'incident-report.md', label: '事故报告汇编（三类 17 要素，/api/incident/sessions/:id/report 导出件）' }],
  24: [
    { file: 'autonomy-reconcile.txt', label: '理论/实际自治度对账（/autonomy 导出件，偏差黄条）' },
    { file: 'virtual-pl.txt', label: 'AI 虚拟损益表（/api/hermes/virtual-pl 导出件）' },
  ],
}
