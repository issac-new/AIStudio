// overlay/custom/server/loop/store/matrix-store.ts
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../types'
import type { LoopStateStore } from './state-store'
import {
  getMatrixClient, sendStateEvent, sendMessage, getStateEvent,
  listStateEventsWithType, getRoomMessages,
  LOOP_STATE_EVENT_TYPES, type MatrixClientConfig,
} from './matrix-client'
import type { MatrixClient } from 'matrix-js-sdk'

export class MatrixStore implements LoopStateStore {
  private client: MatrixClient
  private roomId: string

  constructor(config: MatrixClientConfig) {
    this.client = getMatrixClient(config)
    this.roomId = config.roomId
  }

  async createLoop(loop: LoopInstance): Promise<void> {
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.STATE, loop.id, loop,
    )
    await this.appendEvent({
      type: 'loop.created', loop, ts: new Date().toISOString(),
    })
  }

  async getLoop(id: string): Promise<LoopInstance | null> {
    const content = await getStateEvent(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.STATE, id)
    return content as LoopInstance | null
  }

  async listLoops(filter?: LoopFilter): Promise<LoopInstance[]> {
    const events = await listStateEventsWithType(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.STATE)
    let loops = events.map(e => e.content as LoopInstance)
    if (!filter) return loops
    return loops.filter(l => {
      if (filter.status && !filter.status.includes(l.status)) return false
      if (filter.stage && !filter.stage.includes(l.stage)) return false
      return true
    })
  }

  async updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void> {
    const existing = await this.getLoop(id)
    if (!existing) throw new Error(`Loop not found: ${id}`)
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.STATE, id, updated,
    )
  }

  async deleteLoop(id: string): Promise<void> {
    // Matrix doesn't delete state events; set to empty
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.STATE, id, {},
    )
  }

  async appendContract(contract: TaskContract): Promise<void> {
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.CONTRACT, this.safeId(contract.id), contract,
    )
  }

  async getContract(id: string): Promise<TaskContract | null> {
    const content = await getStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.CONTRACT, this.safeId(id),
    )
    return content as TaskContract | null
  }

  async queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]> {
    const events = await listStateEventsWithType(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.CONTRACT)
    let contracts = events
      .map(e => e.content as TaskContract)
      .filter(c => c.loopId === loopId)
    if (!filter) return contracts
    return contracts.filter(c => {
      if (filter.status && !filter.status.includes(c.status)) return false
      return true
    })
  }

  async updateContract(id: string, patch: Partial<TaskContract>): Promise<void> {
    const existing = await this.getContract(id)
    if (!existing) throw new Error(`Contract not found: ${id}`)
    const updated = { ...existing, ...patch }
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.CONTRACT, this.safeId(id), updated,
    )
  }

  async appendVerification(record: VerificationRecord): Promise<void> {
    await sendStateEvent(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.VERIFICATION, this.safeId(record.contractId), record,
    )
  }

  async appendEvent(event: LoopEvent): Promise<void> {
    await sendMessage(
      this.client, this.roomId,
      LOOP_STATE_EVENT_TYPES.EVENT_LOG, event,
    )
  }

  async queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> {
    const messages = await getRoomMessages(this.client, this.roomId, limit ?? 100)
    let events: LoopEvent[] = messages
      .filter(m => m.getType() === 'm.room.message')
      .map(m => {
        try {
          const content = m.getContent()
          if (content.body && typeof content.body === 'string') {
            return JSON.parse(content.body) as LoopEvent
          }
          return content as unknown as LoopEvent
        } catch {
          return null
        }
      })
      .filter((e): e is LoopEvent => e !== null)
      .filter(e => 'loopId' in e && e.loopId === loopId)

    if (since) {
      events = events.filter(e => (e as any).ts > since)
    }
    if (limit) {
      events = events.slice(-limit)
    }
    return events
  }

  async detectDrift(_loopId: string): Promise<DriftReport> {
    // Matrix is the single source of truth; no drift possible
    return { hasDrift: false, details: 'Matrix is the source of truth' }
  }

  private safeId(id: string): string {
    // Matrix state keys cannot contain '/' — replace with '__'
    return id.replace(/\//g, '__')
  }
}
