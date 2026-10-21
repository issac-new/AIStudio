// overlay/secaudit 域：只读采集器（自动面的证据兜底）。
//
// 每个采集器回 { count, summary }——count 是"该面自动检出的条目数"，summary 是人话
// 一句。采集器全部只读、fail-soft：挂了返回 count=0 + 失败摘要，不阻断账本构建。
// 复用既有只读能力（skillgov/mcp-drift/审批链/工具审计/姿态/进程扫描/密钥形态），
// 不新写扫描规则（除了从另一在途 worktree 移植的 mcp-scan）。
import { mcpSecurityReport } from './mcp-scan'
import { collectMcpDrift } from '../mcpcatalog/mcp-drift'
import { runSkillScan } from '../skillgov/skill-scan'
import { verifyApprovalChain } from '../approvals/approval-log'
import { queryToolExecAudit } from '../toolpipeline/tool-hooks'
import { collectGovernancePosture } from '../governance/posture'
import { collectProcessScan } from '../clusterinspector/process-scan'
import type { AutoEvidence } from './coverage'

export async function collectAutoEvidence(): Promise<AutoEvidence> {
  const out: AutoEvidence = {}
  try {
    const r = mcpSecurityReport()
    out.mcp = {
      count: r.findings.length,
      summary: `扫描 ${r.profilesScanned} 个 profile、${r.serversScanned} 个 server：高危 ${r.summary.high} / 中 ${r.summary.medium} / 低 ${r.summary.low}`,
    }
  } catch (e) {
    out.mcp = { count: 0, summary: `mcp 扫描失败：${(e as Error).message.slice(0, 120)}` }
  }
  try {
    const d = collectMcpDrift()
    out.mcp_drift = {
      count: d.drift.length,
      summary: d.hasBaseline
        ? `基线 ${d.baselineAt ? new Date(d.baselineAt).toISOString() : '未知'}：漂移 ${d.drift.length} 项`
        : '无基线（首次运行合法空态）',
    }
  } catch (e) {
    out.mcp_drift = { count: 0, summary: `mcp drift 失败：${(e as Error).message.slice(0, 120)}` }
  }
  try {
    const s = runSkillScan()
    out.skills = {
      count: s.results.reduce((n, r) => n + r.findings.length, 0),
      summary: `扫描 ${s.scanned} 个技能：dangerous ${s.byVerdict.dangerous} / caution ${s.byVerdict.caution}`,
    }
  } catch (e) {
    out.skills = { count: 0, summary: `skill 扫描失败：${(e as Error).message.slice(0, 120)}` }
  }
  try {
    const v = verifyApprovalChain()
    out.tool_exec = {
      count: v.anomalies.length,
      summary: `审批链 ${v.anomalies.length === 0 ? '完整' : '有断点'}：异常 ${v.anomalies.length} 条`,
    }
  } catch (e) {
    out.tool_exec = { count: 0, summary: `审批链校验失败：${(e as Error).message.slice(0, 120)}` }
  }
  try {
    const q = queryToolExecAudit({ limit: 200 })
    const denied = q.entries.filter((e) => e.phase === 'post' && e.ok === false).length
    out.tool_exec_audit = {
      count: denied,
      summary: `近 ${q.entries.length} 条工具执行审计：失败 ${denied} 条`,
    }
  } catch (e) {
    out.tool_exec_audit = { count: 0, summary: `工具审计读取失败：${(e as Error).message.slice(0, 120)}` }
  }
  try {
    const p = collectGovernancePosture()
    const problem = p.profiles.filter((x) => x.lamp !== 'governed').length
    out.review = {
      count: problem,
      summary: `姿态 ${p.summary.governed}/${p.summary.total} governed：非 governed ${problem} 个 profile`,
    }
  } catch (e) {
    out.review = { count: 0, summary: `姿态采集失败：${(e as Error).message.slice(0, 120)}` }
  }
  try {
    const ps = await collectProcessScan()
    const shadow = ps.procs.filter((p) => p.profile !== null && !ps.registered.includes(p.profile)).length
    out.agents = {
      count: shadow,
      summary: `进程 ${ps.procs.length} 个：疑似影子 profile ${shadow} 个`,
    }
  } catch (e) {
    out.agents = { count: 0, summary: `进程扫描失败：${(e as Error).message.slice(0, 120)}` }
  }
  return out
}
