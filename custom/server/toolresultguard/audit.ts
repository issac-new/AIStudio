// overlay[toolresultguard] P1a · 判定留痕（文 5 §6/§9.4 可观测）。
//
// append-only JSONL（模式同 toolpipeline/tool-hooks.ts）：每次判定全字段留痕、
// 不落原文（只落 sha1，脱敏纪律），超 2×CAP 粗截断保后半。
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import type { GuardDecision } from './types'

export interface GuardAuditEntry extends GuardDecision {
  ts: number
  tool?: string
  source?: string
  sessionId?: string
}

const CAP = 1000

function auditDir(): string {
  const env = process.env.TOOLRESULTGUARD_AUDIT_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'toolresultguard-audit')
}

function auditFile(): string {
  return join(auditDir(), 'toolresultguard.jsonl')
}

export function appendAudit(entry: GuardAuditEntry): void {
  try {
    mkdirSync(auditDir(), { recursive: true })
    appendFileSync(auditFile(), JSON.stringify(entry) + '\n')
    try {
      const lines = readFileSync(auditFile(), 'utf8').split('\n').filter(Boolean)
      if (lines.length > CAP * 2) {
        const { writeFileSync, renameSync } = require('fs') as typeof import('fs')
        const tmp = `${auditFile()}.tmp-${process.pid}-${Date.now()}`
        writeFileSync(tmp, lines.slice(-CAP).join('\n') + '\n')
        renameSync(tmp, auditFile())
      }
    } catch { /* 截断失败不阻断 */ }
  } catch { /* 留痕失败 fail-open：不影响判定路径 */ }
}

/** 读尾部（测试/消费面）。 */
export function readAudit(limit = 100): GuardAuditEntry[] {
  try {
    const lines = readFileSync(auditFile(), 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map((line) => JSON.parse(line) as GuardAuditEntry)
  } catch {
    return []
  }
}

/** 测试隔离。 */
export function _useAuditDirForTests(dir: string): void {
  process.env.TOOLRESULTGUARD_AUDIT_DIR = dir
}
