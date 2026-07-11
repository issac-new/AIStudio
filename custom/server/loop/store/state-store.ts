// overlay/custom/server/loop/store/state-store.ts
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../../../client/loop/types'

export interface LoopStateStore {
  createLoop(loop: LoopInstance): Promise<void>
  getLoop(id: string): Promise<LoopInstance | null>
  listLoops(filter?: LoopFilter): Promise<LoopInstance[]>
  updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void>
  deleteLoop(id: string): Promise<void>

  appendContract(contract: TaskContract): Promise<void>
  getContract(id: string): Promise<TaskContract | null>
  queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]>
  updateContract(id: string, patch: Partial<TaskContract>): Promise<void>

  appendVerification(record: VerificationRecord): Promise<void>

  appendEvent(event: LoopEvent): Promise<void>
  queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]>

  detectDrift(loopId: string): Promise<DriftReport>
}
