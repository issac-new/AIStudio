// custom/server/agentidentity/judgments.ts
// 人署名记录：验收结论 / 打回理由 / 推翻依据 / 升级 / 暂停 / 组织能力贡献。
// 只收 human-entry。没有遥测写入端点——这是研究文档 5.3 的取证前提：
// 若「已复核」能由系统自动勾选，复核行为本身会退化。
import { join } from 'node:path'
import { appendJsonl, readJsonl } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type { Person } from './people'

export type JudgmentKind = 'acceptance' | 'rejection' | 'override' | 'escalation' | 'pause' | 'capability'

export interface JudgmentRecord {
  id: string
  unitId: string
  kind: JudgmentKind
  subjectRef: string
  rationale: string
  evidenceRefs: string[]
  signedBy: string
  signedAt: number
  source: 'human-entry'
}

export interface JudgmentInput {
  unitId: string
  kind: JudgmentKind
  subjectRef: string
  rationale: string
  evidenceRefs?: string[]
}

const KINDS: JudgmentKind[] = ['acceptance', 'rejection', 'override', 'escalation', 'pause', 'capability']

let overrideDir: string | null = null

export function _useJudgmentStoreForTests(dir: string | null): void {
  overrideDir = dir
}

function storeDir(): string {
  if (overrideDir) return overrideDir
  const env = process.env.AGENT_IDENTITY_STORE?.trim()
  return env || underWebUi('agent-identity')
}

function filePath(): string {
  return join(storeDir(), 'judgments.jsonl')
}

export function listJudgments(unitId?: string): JudgmentRecord[] {
  const { rows } = readJsonl<JudgmentRecord>(filePath())
  return unitId ? rows.filter((r) => r.unitId === unitId) : rows
}

export function appendJudgment(
  input: JudgmentInput,
  signedBy: string,
  people: Person[],
): { ok: true; record: JudgmentRecord } | { ok: false; problems: string[] } {
  const problems: string[] = []
  if (!input.unitId?.trim()) problems.push('unitId 必填')
  if (!KINDS.includes(input.kind)) problems.push('kind 非法')
  if (!input.subjectRef?.trim()) problems.push('subjectRef 必填（任务/交付物/规则引用）')
  if (typeof input.rationale !== 'string' || input.rationale.trim().length < 20) {
    problems.push('rationale 至少 20 字（写出依据，不写结论）')
  }
  const signer = people.find((p) => p.id === signedBy)
  if (!signer || !signer.active) problems.push('signedBy 必须是在岗自然人')
  if (problems.length) return { ok: false, problems }

  const record: JudgmentRecord = {
    id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    unitId: input.unitId.trim(),
    kind: input.kind,
    subjectRef: input.subjectRef.trim(),
    rationale: input.rationale.trim(),
    evidenceRefs: (input.evidenceRefs ?? []).map(String),
    signedBy,
    signedAt: Date.now(),
    source: 'human-entry',
  }
  appendJsonl(filePath(), record)
  return { ok: true, record }
}
