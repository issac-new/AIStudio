/**
 * Skill 三段安全治理 · 第二段「执行拦截」+ 第三段「输出审核」（skillgov）。
 *
 * 挂进 custom/server/toolpipeline/tool-hooks.ts 的 ekko 瀑布（preExecute 在权限后、
 * postExecute 在结果回填模型前）——skill_view/skill_manage 是注册工具，装载动作
 * 本身走工具管线，这里按注册扫描（skill-scan.ts 第一段）的 verdict 执法：
 *
 *   执行拦截：SKILLGOV_ENFORCE=1 且最近扫描判定 dangerous → preExecute 拒绝
 *   （{allow:false}；无扫描记录=未测不猜，fail-open 放行——先扫描后执法的顺序契约）。
 *   调用授权（2026-11-19 结果交付后续批）：同一开关下按 `skill-acl.ts` 的 per-profile/
 *   per-user 规则判定 invoke（skill_view）/ edit（skill_manage）；未配 ACL 文件保持现状。
 *   输出审核：skill_view 回填内容含内联 shell 执行段（`` !`cmd` ``，装载期会被展开）
 *   → enforce 开启时在内容头插入警示横幅（REWRITE 同款语义，只动 content）；
 *   观测审计（skill-guard.jsonl）恒开（fail-open 不阻断），并记录 userId/profileId/
 *   sessionId/runId，保证「谁装载了什么」可倒查。
 *
 * 默认零行为变化（enforce 关）；与 toolresultguard TRG_ENABLED / enforce-gate
 * HERMES_TOOL_ENFORCE 同款「显式开启才执法」纪律。
 */
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { latestVerdictOf, INLINE_SHELL_RE } from './skill-scan'
import { evaluateSkillAcl, type SkillAclContext } from './skill-acl'
import { atomicWriteText } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

interface PreExecuteVerdict { allow: false; error: string }

export interface SkillGuardAuditEntry {
  ts: number
  tool: string
  skill?: string
  /** pre：allow|block；post：viewed|flagged。 */
  action: string
  detail?: string
  /** 调用者身份（Ekko tool context；缺省未传时留空，不伪造）。 */
  userId?: string
  profileId?: string
  sessionId?: string
  runId?: string
}

type ToolContext = SkillAclContext & { sessionId?: string; runId?: string }

function identityOf(context?: ToolContext): Pick<SkillGuardAuditEntry, 'userId' | 'profileId' | 'sessionId' | 'runId'> {
  return {
    ...(context?.userId ? { userId: String(context.userId) } : {}),
    ...(context?.profileId ? { profileId: String(context.profileId) } : {}),
    ...(context?.sessionId ? { sessionId: String(context.sessionId) } : {}),
    ...(context?.runId ? { runId: String(context.runId) } : {}),
  }
}

const AUDIT_CAP = 500

function auditFile(): string {
  return process.env.SKILLGOV_GUARD_LEDGER?.trim()
    ? resolve(process.env.SKILLGOV_GUARD_LEDGER.replace(/^~/, homedir()))
    : underWebUi('skillgov', 'skill-guard.jsonl')
}

function appendGuardAudit(entry: SkillGuardAuditEntry): void {
  try {
    const file = auditFile()
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length > AUDIT_CAP * 2) {
      const { writeFileSync, renameSync } = require('node:fs') as typeof import('node:fs')
  atomicWriteText(file, lines.slice(-AUDIT_CAP).join('\n') + '\n')
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
    async preExecute(name: string, input: Record<string, unknown>, context?: ToolContext): Promise<PreExecuteVerdict | void> {
      if (!SKILL_TOOLS.has(name) || !enforceEnabled()) return
      const skill = typeof input?.name === 'string' ? input.name : ''
      if (!skill) return
      const identity = identityOf(context)
      let verdict
      try {
        verdict = latestVerdictOf(skill)
      } catch {
        return // 扫描面异常不拦截（fail-open：观测优先、执法不猜）
      }
      if (verdict === 'dangerous') {
        appendGuardAudit({
          ts: Date.now(), tool: name, skill, action: 'block',
          detail: '注册扫描判定 dangerous', ...identity,
        })
        return {
          allow: false,
          error: `[skillgov] 技能 ${skill} 最近注册扫描判定 dangerous（高危项清单见 /api/skillgov/scan/latest）——处置后重扫再装载`,
        }
      }
      // 调用授权：invoke=skill_view / edit=skill_manage；未配 ACL 文件时 allow（零行为变化）。
      const acl = evaluateSkillAcl({
        skill,
        action: name === 'skill_manage' ? 'edit' : 'invoke',
        context: { userId: context?.userId, profileId: context?.profileId },
      })
      if (!acl.allowed) {
        appendGuardAudit({
          ts: Date.now(), tool: name, skill, action: 'block',
          detail: `acl:${acl.reason}`, ...identity,
        })
        return {
          allow: false,
          error: `[skillgov] 技能 ${skill} 未获授权：${acl.reason}（策略 skill-acl.json，source=${acl.source}）`,
        }
      }
    },
    async postExecute<T extends { ok: boolean; content: string }>(name: string, input: Record<string, unknown>, result: T, context?: ToolContext) {
      if (!SKILL_TOOLS.has(name)) return undefined
      const skill = typeof input?.name === 'string' ? input.name : ''
      if (typeof result?.content !== 'string' || result.content.length === 0) return undefined
      // 第三段·输出审核（S0 机械判据）：装载内容含内联 shell 执行段
      const hit = INLINE_SHELL_RE.exec(result.content)
      appendGuardAudit({
        ts: Date.now(), tool: name, ...(skill ? { skill } : {}),
        action: hit ? 'flagged' : 'viewed',
        ...(hit ? { detail: hit[0].slice(0, 80) } : {}),
        ...identityOf(context),
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
