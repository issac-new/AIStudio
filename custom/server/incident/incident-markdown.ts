// overlay/custom/server/incident/incident-markdown.ts
// 事故报告 Markdown 渲染（2026-10-08 六文调研轮 A）：导出面=报告层，
// 只含摘要/计数/指针/黄条，证据全文仍在证据面（对齐论文 Evidence vs Report 分层）。
import { INCIDENT_CATEGORIES, type IncidentReport } from './incident-types'

function tsOf(ms?: number): string {
  if (!ms) return '(未知)'
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

const STATUS_BADGE: Record<string, string> = { collected: '✅ 已采集', partial: '🟡 部分采集', absent: '⚪ 未采集' }

export function renderIncidentMarkdown(report: IncidentReport): string {
  const L: string[] = []
  L.push(`# Agent 事故报告：${report.subject.title ?? report.sessionId}`)
  L.push('')
  L.push(`- 会话：\`${report.sessionId}\`${report.subject.title ? `（${report.subject.title}）` : ''}`)
  L.push(`- 生成时间：${tsOf(report.generatedAt)}；覆盖 ${report.coverage.total} 要素（${STATUS_BADGE.collected} ${report.coverage.collected} / ${STATUS_BADGE.partial} ${report.coverage.partial} / ${STATUS_BADGE.absent} ${report.coverage.absent}）`)
  L.push(`- 框架依据：arXiv 2609.24515《Beyond Predictable Paths》三类 17 要素`)
  L.push(`- 纪律：缺席要素如实标注未采集，不造数；本报告为摘要层，原始证据见各要素 sources 指针`)
  L.push('')

  for (const cat of INCIDENT_CATEGORIES) {
    L.push(`## ${cat.title}`)
    L.push('')
    for (const e of report.elements.filter((x) => x.category === cat.key)) {
      L.push(`### ${e.title}（${e.key}）${STATUS_BADGE[e.status] ?? ''}`)
      L.push('')
      L.push(e.summary + '。')
      if (e.note) L.push(`> 注：${e.note}`)
      if (e.sources.length > 0) L.push(`- 证据指针：${e.sources.map((s) => `\`${s}\``).join('；')}`)
      L.push('')
    }
  }

  L.push('## 四、自治度对账（设计态 ≠ 运行态）')
  L.push('')
  L.push('### 理论自治度（设计允许做到什么程度）')
  L.push('')
  for (const f of report.autonomy.theoretical.facts) L.push(`- ${f}`)
  if (report.autonomy.theoretical.note) L.push(`> 注：${report.autonomy.theoretical.note}`)
  L.push('')
  L.push('### 实际自治度（本次轨迹中实际自主到什么程度）')
  L.push('')
  for (const f of report.autonomy.effective.facts) L.push(`- ${f}`)
  L.push('')
  L.push('### 偏差发现')
  L.push('')
  for (const d of report.autonomy.divergences) {
    L.push(`- ${d.severity === 'warn' ? '⚠️ 黄条' : 'ℹ️'} ${d.finding}${d.evidence.length > 0 ? `（证据：${d.evidence.map((s) => `\`${s}\``).join('；')}）` : ''}`)
  }
  L.push('')
  if (report.autonomy.note) L.push(`> ${report.autonomy.note}`)
  return L.join('\n') + '\n'
}
