// overlay/custom/server/toolpipeline/tool-hooks.ts
// P1 工具执行瀑布的 overlay 消费面（2026-10-04 九源轮）。
//
// ekko registry 瀑布（patch 565/566：preExecute 在权限后、postExecute 在结果
// 回填前）+ manager 注入（两处 createRuntime）。本模块 v1 = **观测钩子**：
// pre 记调用（名称+入参键，不落值）；post 记结局（ok/error 摘要）到
// append-only JSONL（CAP 500 行），供工具执行账/轨迹热点消费。
// 只观测不拦截（v1 边界如实声明：deny/改写形态由后续轮按治理策略接入——
// 钩子失败 fail-open，不阻断工具执行）。
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { ekkoGuardHook } from '../toolresultguard'

export interface ToolExecAuditEntry {
  ts: number
  phase: 'pre' | 'post'
  tool: string
  /** pre：入参键清单（不落值——脱敏纪律）；post：ok 与 error 摘要 */
  inputKeys?: string[]
  ok?: boolean
  error?: string
}

const CAP = 500

function auditDir(): string {
  const env = process.env.TOOL_EXEC_AUDIT_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'tool-exec-audit')
}

function auditFile(): string {
  return join(auditDir(), 'tool-exec.jsonl')
}

function appendEntry(entry: ToolExecAuditEntry): void {
  try {
    mkdirSync(auditDir(), { recursive: true })
    appendFileSync(auditFile(), JSON.stringify(entry) + '\n')
    // 粗截断：超 2×CAP 行时保留后半（append-only 面，避免无限增长）
    try {
      const lines = readFileSync(auditFile(), 'utf8').split('\n').filter(Boolean)
      if (lines.length > CAP * 2) {
        const { writeFileSync, renameSync } = require('fs') as typeof import('fs')
        const tmp = `${auditFile()}.tmp-${process.pid}-${Date.now()}`
        writeFileSync(tmp, lines.slice(-CAP).join('\n') + '\n')
        renameSync(tmp, auditFile())
      }
    } catch { /* 截断失败不阻断 */ }
  } catch { /* 审计失败 fail-open：不阻断工具执行 */ }
}

/** 观测钩子（v1）：pre 记键名，post 记结局。 */
const auditHook = {
  async preExecute(name: string, input: Record<string, unknown>) {
    appendEntry({ ts: Date.now(), phase: 'pre', tool: name, inputKeys: Object.keys(input ?? {}).slice(0, 20) })
  },
  async postExecute(name: string, _input: Record<string, unknown>, result: { ok?: boolean; error?: string }) {
    appendEntry({
      ts: Date.now(),
      phase: 'post',
      tool: name,
      ok: typeof result?.ok === 'boolean' ? result.ok : undefined,
      error: typeof result?.error === 'string' ? result.error.slice(0, 200) : undefined,
    })
  },
}

// toolresultguard P1a（2026-10-06 五文轮）：postExecute 增加注入判定/隔离改写
// （结果回填模型前）。守卫默认关（TRG_ENABLED=0 时零行为变化），超时/离线
// fail-open，S0 预筛兜底——关闭态与既有 v1 观测语义完全一致。
export const ekkoToolExecuteHooks = [auditHook, ekkoGuardHook()]

/** 读尾部（测试/消费面）。 */
export function readToolExecAudit(limit = 100): ToolExecAuditEntry[] {
  try {
    const lines = readFileSync(auditFile(), 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map((l) => JSON.parse(l) as ToolExecAuditEntry)
  } catch {
    return []
  }
}

/** 测试隔离。 */
export function _useAuditDirForTests(dir: string): void {
  process.env.TOOL_EXEC_AUDIT_DIR = dir
}
