// overlay/secaudit 域：目标中立报告（JSON + Markdown）与零依赖 schema 校验。
//
// 报告刻意与"这是哪个产品/哪个仓"解耦——同一格式能服务代码仓、Agent 部署、
// 配置基线三类目标；读者拿到的永远是"已确认/待验证/已否决"三档 + 覆盖账本。
import type { AuditProject, AuditRun, CoverageLedger, SecAuditFinding } from './types'

export interface SecAuditReport {
  schema: 'secaudit-report/v1'
  generatedAt: number
  target: { kind: string; fingerprint: string }
  coverage: CoverageLedger['summary'] & { criticCount: number }
  findings: {
    confirmed: SecAuditFinding[]
    needsValidation: SecAuditFinding[]
    rejected: SecAuditFinding[]
    hardeningAdvice: SecAuditFinding[]
  }
  recordReview: { total: number; verified: number; replaced: number; stale: number }
  critic: CoverageLedger['critic']
}

export function buildReport(project: AuditProject, run: AuditRun, ledger: CoverageLedger): SecAuditReport {
  const confirmed = project.findings.filter((f) => f.status === 'confirmed' && !f.defenseInDepth)
  const needsValidation = project.findings.filter((f) => f.status === 'needs_validation' && !f.defenseInDepth)
  const rejected = project.findings.filter((f) => f.status === 'rejected')
  const hardeningAdvice = project.findings.filter((f) => f.defenseInDepth)
  return {
    schema: 'secaudit-report/v1',
    generatedAt: Date.now(),
    target: { kind: project.target.kind, fingerprint: run.targetFingerprint },
    coverage: { ...ledger.summary, criticCount: ledger.critic.length },
    findings: { confirmed, needsValidation, rejected, hardeningAdvice },
    recordReview: run.recordReview ?? { total: 0, verified: 0, replaced: 0, stale: 0 },
    critic: ledger.critic,
  }
}

/** 零依赖 schema 校验（返回问题清单；空=通过）。 */
export function validateReportSchema(report: unknown): string[] {
  const problems: string[] = []
  if (!report || typeof report !== 'object') return ['报告必须是对象']
  const r = report as Partial<SecAuditReport>
  if (r.schema !== 'secaudit-report/v1') problems.push('schema 须为 secaudit-report/v1')
  if (typeof r.generatedAt !== 'number') problems.push('generatedAt 必填且为数字')
  if (!r.target || typeof r.target !== 'object') problems.push('target 必填')
  else {
    if (typeof r.target.kind !== 'string' || !r.target.kind) problems.push('target.kind 必填')
    if (typeof r.target.fingerprint !== 'string' || !r.target.fingerprint) problems.push('target.fingerprint 必填')
  }
  if (!r.coverage || typeof r.coverage !== 'object') problems.push('coverage 必填')
  else {
    const c = r.coverage
    for (const k of ['total', 'full', 'partial', 'unchecked', 'coverageRatio', 'criticCount'] as const) {
      if (typeof c[k] !== 'number') problems.push(`coverage.${k} 必填且为数字`)
    }
  }
  if (!r.findings || typeof r.findings !== 'object') problems.push('findings 必填')
  else {
    for (const k of ['confirmed', 'needsValidation', 'rejected', 'hardeningAdvice'] as const) {
      if (!Array.isArray(r.findings[k])) problems.push(`findings.${k} 必须是数组`)
    }
  }
  if (!r.recordReview || typeof r.recordReview !== 'object') problems.push('recordReview 必填')
  if (!Array.isArray(r.critic)) problems.push('critic 必须是数组')
  return problems
}

/** Markdown 呈现（目标中立：标题不带产品名，只带目标类型与指纹）。 */
export function reportMarkdown(report: SecAuditReport): string {
  const lines: string[] = []
  lines.push(`# 安全审计报告`)
  lines.push('')
  lines.push(`- 目标类型：${report.target.kind}`)
  lines.push(`- 目标指纹：${report.target.fingerprint}`)
  lines.push(`- 生成时间：${new Date(report.generatedAt).toISOString()}`)
  lines.push('')
  lines.push(`## 覆盖账本`)
  lines.push('')
  lines.push(`- 面总数：${report.coverage.total}`)
  lines.push(`- 已充分检查：${report.coverage.full}`)
  lines.push(`- 部分检查：${report.coverage.partial}`)
  lines.push(`- 未检查：${report.coverage.unchecked}`)
  lines.push(`- 覆盖率：${(report.coverage.coverageRatio * 100).toFixed(1)}%`)
  lines.push(`- 批评者发现：${report.coverage.criticCount} 条`)
  if (report.critic.length > 0) {
    lines.push('')
    for (const c of report.critic) lines.push(`  - [${c.kind}] ${c.detail}`)
  }
  lines.push('')
  const bucket = (name: string, items: SecAuditFinding[]) => {
    lines.push(`## ${name}（${items.length}）`)
    lines.push('')
    if (items.length === 0) {
      lines.push('（无）')
      lines.push('')
      return
    }
    for (const f of items) {
      lines.push(`### ${f.candidate.title}`)
      lines.push('')
      lines.push(`- 面：${f.candidate.surfaceClass}`)
      if (f.severity) lines.push(`- 严重性：${f.severity}`)
      if (f.candidate.traceChain) lines.push(`- 追踪链：${f.candidate.traceChain}`)
      if (f.candidate.observation) lines.push(`- 有界观察：${f.candidate.observation}`)
      if (f.unknownFact) lines.push(`- 未解事实：${f.unknownFact}`)
      if (f.refutation) lines.push(`- 证伪理由：${f.refutation}`)
      if (f.defenseInDepth) lines.push(`- 归口：纵深防御缺口（加固建议，不算漏洞）`)
      lines.push(`- 发现人：${f.candidate.author}`)
      if (f.decidedBy) lines.push(`- 裁决人：${f.decidedBy}`)
      lines.push('')
    }
  }
  bucket('已确认（confirmed）', report.findings.confirmed)
  bucket('待验证（needs_validation）', report.findings.needsValidation)
  bucket('加固建议（纵深防御缺口）', report.findings.hardeningAdvice)
  bucket('已否决（rejected）', report.findings.rejected)
  lines.push(`## 记录复核`)
  lines.push('')
  lines.push(`- 应复核：${report.recordReview.total}`)
  lines.push(`- 已核实：${report.recordReview.verified}`)
  lines.push(`- 已替换：${report.recordReview.replaced}`)
  lines.push(`- 失效（内容改动）：${report.recordReview.stale}`)
  lines.push('')
  return lines.join('\n')
}
