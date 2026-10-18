// overlay[expcandidates] qgate 失败回流（2026-10-18 P2-5）。
//
// 源文《Spec as AIOS》：反复出现的失败模式应被识别为规范缺口，回流到
// AGENTS.md/规则/Skill；当前经验库只从看板 task_events 提取，qgate 的
// FAIL/CONDITIONAL 从未进入候选。本模块把 `.qgate/runs/*.json` 归一成
// antipattern 候选（指纹幂等），注入仍由 EXPERIENCE_INJECT=1 控制。
import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import type { ExtractedCandidate } from './extract'

export interface QgateRunRow {
  runId: string
  gateId: string
  verdict: 'PASS' | 'FAIL' | 'CONDITIONAL' | 'INCONCLUSIVE' | 'WAIVED' | 'NOT_APPLICABLE' | string
  failureSummary?: string
  conditions?: string[]
  startedAt: number
  domain?: string
}

function shortHash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 12)
}

/** 纯提取：FAIL/CONDITIONAL → antipattern 候选；同指纹聚合计数。 */
export function extractQgateRunCandidates(rows: QgateRunRow[]): ExtractedCandidate[] {
  const groups = new Map<string, { gateId: string; detail: string; count: number; evidence: Array<{ taskId: string; note: string; at: number }> }>()
  for (const row of rows) {
    if (row.verdict !== 'FAIL' && row.verdict !== 'CONDITIONAL') continue
    if (!row.gateId) continue
    const detail = (row.verdict === 'FAIL' ? row.failureSummary : row.conditions?.join('；')) || row.verdict
    const key = `${row.gateId}:${shortHash(detail)}`
    const g = groups.get(key) ?? { gateId: row.gateId, detail, count: 0, evidence: [] }
    g.count += 1
    if (g.evidence.length < 5) {
      g.evidence.push({
        taskId: row.runId,
        note: `${row.verdict} ${row.gateId}${detail ? `：${detail.slice(0, 120)}` : ''}`,
        at: row.startedAt,
      })
    }
    groups.set(key, g)
  }

  return [...groups.entries()].map(([key, g]) => ({
    type: 'antipattern' as const,
    statement: `qgate 拦截反模式：${g.gateId} 在窗口内 ${g.detail}（${g.count} 次）——同类提交先补齐该门要求再重试，避免同坑重踩`,
    fingerprint: `qgate:${key}`,
    evidence: g.evidence,
  }))
}

/** qgate run 目录解析：显式 env > 从 cwd 向上找 .qgate/runs。 */
export function resolveQgateRunsDir(explicit?: string): string | null {
  const env = explicit?.trim() || process.env.QGATE_RUNS_DIR?.trim() || process.env.QGATE_DIR?.trim()
  if (env) {
    const dir = resolve(env.replace(/^~/, String(process.env.HOME ?? '')))
    return /[\\/]runs$/.test(dir) ? dir : join(dir, 'runs')
  }
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.qgate', 'runs')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** 读取 run JSON；坏文件跳过（fail-soft）。 */
export function readQgateRunRows(runsDir: string | null): QgateRunRow[] {
  if (!runsDir || !existsSync(runsDir)) return []
  const out: QgateRunRow[] = []
  try {
    for (const name of readdirSync(runsDir)) {
      if (!name.endsWith('.json')) continue
      try {
        const raw = JSON.parse(readFileSync(join(runsDir, name), 'utf8')) as Partial<QgateRunRow>
        if (typeof raw.gateId !== 'string' || !raw.gateId) continue
        out.push({
          runId: String(raw.runId ?? name.replace(/\.json$/, '')),
          gateId: raw.gateId,
          verdict: String(raw.verdict ?? 'INCONCLUSIVE'),
          failureSummary: typeof raw.failureSummary === 'string' ? raw.failureSummary : undefined,
          conditions: Array.isArray(raw.conditions) ? raw.conditions.map(String) : undefined,
          startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
          domain: typeof raw.domain === 'string' ? raw.domain : undefined,
        })
      } catch { /* 坏文件跳过 */ }
    }
  } catch { /* 目录不可读按空集 */ }
  return out
}
