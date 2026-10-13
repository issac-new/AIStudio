/**
 * Skill 三段安全治理 · 第二段「执行拦截」+ 第三段「输出审核」（skillgov）。
 *
 * 挂进 custom/server/toolpipeline/tool-hooks.ts 的 ekko 瀑布（preExecute 在权限后、
 * postExecute 在结果回填模型前）——skill_view/skill_manage 是注册工具，装载动作
 * 本身走工具管线，这里按注册扫描（skill-scan.ts 第一段）的 verdict 执法：
 *
 *   执行拦截：SKILLGOV_ENFORCE=1 且最近扫描判定 dangerous → preExecute 拒绝
 *   （{allow:false}；无扫描记录=未测不猜，fail-open 放行——先扫描后执法的顺序契约）。
 *   输出审核：skill_view 回填内容含内联 shell 执行段（`` !`cmd` ``，装载期会被展开）
 *   → enforce 开启时在内容头插入警示横幅（REWRITE 同款语义，只动 content）；
 *   观测审计（skill-guard.jsonl）恒开（fail-open 不阻断）。
 *
 * 默认零行为变化（enforce 关）；与 toolresultguard TRG_ENABLED / enforce-gate
 * HERMES_TOOL_ENFORCE 同款「显式开启才执法」纪律。
 */
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { latestVerdictOf, INLINE_SHELL_RE } from './skill-scan'

interface PreExecuteVerdict { allow: false; error: string }

export interface SkillGuardAuditEntry {
  ts: number
  tool: string
  skill?: string
  /** pre：allow|block；post：viewed|flagged。 */
  action: string
  detail?: string
}

const AUDIT_CAP = 500

function auditFile(): string {
  return process.env.SKILLGOV_GUARD_LEDGER?.trim()
    ? resolve(process.env.SKILLGOV_GUARD_LEDGER.replace(/^~/, homedir()))
    : join(homedir(), '.hermes-web-ui', 'skillgov', 'skill-guard.jsonl')
}

function appendGuardAudit(entry: SkillGuardAuditEntry): void {
  try {
    const file = auditFile()
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length > AUDIT_CAP * 2) {
      const { writeFileSync, renameSync } = require('node:fs') as typeof import('node:fs')
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
      writeFileSync(tmp, lines.slice(-AUDIT_CAP).join('\n') + '\n', 'utf8')
      renameSync(tmp, file)
    }
  } catch { /* 审计失败 fail-open */ }
}

export function readSkillGuardAudit(limit = 100): SkillGuardAuditEntry[] {
  try {
    const lines = readFileSync(auditFile(), 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map((l) => JSON.parse(l) as SkillGuardAuditEntry)
  } catch {
    return []
  }
}

export function enforceEnabled(): boolean {
  return process.env.SKILLGOV_ENFORCE === '1'
}

const SKILL_TOOLS = new Set(['skill_view', 'skill_manage'])

/** 生成挂进 ekkoToolExecuteHooks 的技能治理钩子（第二/三段）。 */
export function skillGuardHook() {
  return {
    async preExecute(name: string, input: Record<string, unknown>, _context?: { profileId?: string }): Promise<PreExecuteVerdict | void> {
      if (!SKILL_TOOLS.has(name) || !enforceEnabled()) return
      const skill = typeof input?.name === 'string' ? input.name : ''
      if (!skill) return
      let verdict
      try {
        verdict = latestVerdictOf(skill)
      } catch {
        return // 扫描面异常不拦截（fail-open：观测优先、执法不猜）
      }
      if (verdict === 'dangerous') {
        appendGuardAudit({ ts: Date.now(), tool: name, skill, action: 'block', detail: '注册扫描判定 dangerous' })
        return {
          allow: false,
          error: `[skillgov] 技能 ${skill} 最近注册扫描判定 dangerous（高危项清单见 /api/skillgov/scan/latest）——处置后重扫再装载`,
        }
      }
    },
    async postExecute<T extends { ok: boolean; content: string }>(name: string, input: Record<string, unknown>, result: T) {
      if (!SKILL_TOOLS.has(name)) return undefined
      const skill = typeof input?.name === 'string' ? input.name : ''
      if (typeof result?.content !== 'string' || result.content.length === 0) return undefined
      // 第三段·输出审核（S0 机械判据）：装载内容含内联 shell 执行段
      const hit = INLINE_SHELL_RE.exec(result.content)
      appendGuardAudit({
        ts: Date.now(), tool: name, ...(skill ? { skill } : {}),
        action: hit ? 'flagged' : 'viewed',
        ...(hit ? { detail: hit[0].slice(0, 80) } : {}),
      })
      if (!hit || !enforceEnabled()) return undefined
      return {
        ...result,
        content: `[skillgov] ⚠ 本技能内容包含内联 shell 执行段（${hit[0].slice(0, 60)}…）——装载期会真实执行，请人工核可后再沿用。\n---\n${result.content}`,
      } as T
    },
  }
}

/** 测试隔离。 */
export function _useGuardLedgerForTests(path: string): void {
  process.env.SKILLGOV_GUARD_LEDGER = path
}
