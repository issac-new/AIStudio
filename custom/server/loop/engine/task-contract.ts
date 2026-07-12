// overlay/custom/server/loop/engine/task-contract.ts
import type { TaskContract, TaskSource, ReadPlan, VerificationSpec, ResultTemplate } from '../types'

let counter = 0
export function generateContractId(loopId: string, summary: string): string {
  counter++
  const slug = summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30).replace(/^-|-$/g, '')
  return `task/${slug}-${counter.toString().padStart(3, '0')}`
}

export function createContract(params: {
  loopId: string
  source: TaskSource
  readPlan: ReadPlan
  writeBoundary: string[]
  verificationIntent: VerificationSpec
  resultTemplate: ResultTemplate
  maxAttempts?: number
}): TaskContract {
  const id = generateContractId(params.loopId, params.source.summary)
  return {
    id,
    loopId: params.loopId,
    source: params.source,
    readPlan: params.readPlan,
    writeBoundary: params.writeBoundary,
    verificationIntent: params.verificationIntent,
    resultTemplate: params.resultTemplate,
    worktreeId: null,
    assignee: 'maker',
    status: 'queued',
    attempts: 0,
    maxAttempts: params.maxAttempts ?? 3,
  }
}
