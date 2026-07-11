// overlay/custom/server/loop/store/local-store.ts
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import lockfile from 'proper-lockfile'
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../../../client/loop/types'
import type { LoopStateStore } from './state-store'

const DEFAULT_LOOP_DIR = '.loop'

export class LocalStore implements LoopStateStore {
  constructor(private baseDir: string = DEFAULT_LOOP_DIR) {}

  // --- path helpers (respect this.baseDir so tests/sandboxes don't pollute CWD) ---
  private loopDir(id: string): string {
    return resolve(this.baseDir, 'loops', id)
  }

  private contractPath(loopId: string, contractId: string): string {
    return resolve(this.loopDir(loopId), 'contracts', `${contractId}.json`)
  }

  private verifyPath(loopId: string, contractId: string): string {
    return resolve(this.loopDir(loopId), 'verifications', `${contractId}.verify.json`)
  }

  private eventsPath(loopId: string): string {
    return resolve(this.loopDir(loopId), 'events.jsonl')
  }

  private stateJsonPath(): string {
    return resolve(this.baseDir, 'STATE.json')
  }

  private stateMdPath(): string {
    return resolve(this.baseDir, 'STATE.md')
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockPath = resolve(this.baseDir, 'STATE.lock')
    await this.ensureDir(this.baseDir)
    const release = await lockfile.lock(this.baseDir, {
      lockfilePath: lockPath,
      stale: 5000,
      retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
    })
    try {
      return await fn()
    } finally {
      await release()
    }
  }

  async createLoop(loop: LoopInstance): Promise<void> {
    await this.withLock(async () => {
      const dir = this.loopDir(loop.id)
      await this.ensureDir(dir)
      await this.ensureDir(resolve(dir, 'contracts'))
      await this.ensureDir(resolve(dir, 'verifications'))
      await fs.writeFile(resolve(dir, 'loop.json'), JSON.stringify(loop, null, 2), 'utf-8')
      await this.regenerateStateFiles()
    })
  }

  async getLoop(id: string): Promise<LoopInstance | null> {
    const p = resolve(this.loopDir(id), 'loop.json')
    if (!existsSync(p)) return null
    const data = await fs.readFile(p, 'utf-8')
    return JSON.parse(data) as LoopInstance
  }

  async listLoops(filter?: LoopFilter): Promise<LoopInstance[]> {
    const loopsDir = resolve(this.baseDir, 'loops')
    if (!existsSync(loopsDir)) return []
    const entries = await fs.readdir(loopsDir)
    const loops: LoopInstance[] = []
    for (const entry of entries) {
      const p = resolve(loopsDir, entry, 'loop.json')
      if (existsSync(p)) {
        loops.push(JSON.parse(await fs.readFile(p, 'utf-8')))
      }
    }
    if (!filter) return loops
    return loops.filter(l => {
      if (filter.status && !filter.status.includes(l.status)) return false
      if (filter.stage && !filter.stage.includes(l.stage)) return false
      return true
    })
  }

  async updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void> {
    await this.withLock(async () => {
      const existing = await this.getLoop(id)
      if (!existing) throw new Error(`Loop not found: ${id}`)
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
      await fs.writeFile(resolve(this.loopDir(id), 'loop.json'), JSON.stringify(updated, null, 2), 'utf-8')
      await this.regenerateStateFiles()
    })
  }

  async deleteLoop(id: string): Promise<void> {
    await this.withLock(async () => {
      const dir = this.loopDir(id)
      if (existsSync(dir)) {
        await fs.rm(dir, { recursive: true, force: true })
      }
      await this.regenerateStateFiles()
    })
  }

  async appendContract(contract: TaskContract): Promise<void> {
    await this.withLock(async () => {
      await this.ensureDir(resolve(this.loopDir(contract.loopId), 'contracts'))
      await fs.writeFile(
        this.contractPath(contract.loopId, contract.id),
        JSON.stringify(contract, null, 2),
        'utf-8',
      )
    })
  }

  async getContract(id: string): Promise<TaskContract | null> {
    // Contracts are nested under loops; search all loop dirs
    const loopsDir = resolve(this.baseDir, 'loops')
    if (!existsSync(loopsDir)) return null
    for (const entry of await fs.readdir(loopsDir)) {
      const p = resolve(loopsDir, entry, 'contracts', `${id}.json`)
      if (existsSync(p)) {
        return JSON.parse(await fs.readFile(p, 'utf-8'))
      }
    }
    return null
  }

  async queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]> {
    const contractsDir = resolve(this.loopDir(loopId), 'contracts')
    if (!existsSync(contractsDir)) return []
    const files = await fs.readdir(contractsDir)
    const contracts: TaskContract[] = []
    for (const f of files) {
      if (f.endsWith('.json')) {
        contracts.push(JSON.parse(await fs.readFile(resolve(contractsDir, f), 'utf-8')))
      }
    }
    if (!filter) return contracts
    return contracts.filter(c => {
      if (filter.status && !filter.status.includes(c.status)) return false
      return true
    })
  }

  async updateContract(id: string, patch: Partial<TaskContract>): Promise<void> {
    const contract = await this.getContract(id)
    if (!contract) throw new Error(`Contract not found: ${id}`)
    const updated = { ...contract, ...patch }
    await fs.writeFile(
      this.contractPath(contract.loopId, id),
      JSON.stringify(updated, null, 2),
      'utf-8',
    )
  }

  async appendVerification(record: VerificationRecord): Promise<void> {
    const contract = await this.getContract(record.contractId)
    if (!contract) throw new Error(`Contract not found: ${record.contractId}`)
    await this.ensureDir(resolve(this.loopDir(contract.loopId), 'verifications'))
    await fs.writeFile(
      this.verifyPath(contract.loopId, record.contractId),
      JSON.stringify(record, null, 2),
      'utf-8',
    )
  }

  async appendEvent(event: LoopEvent): Promise<void> {
    const loopId = 'loopId' in event ? event.loopId : (event as any).loop?.id
    if (!loopId) return
    await this.ensureDir(this.loopDir(loopId))
    const line = JSON.stringify(event) + '\n'
    await fs.appendFile(this.eventsPath(loopId), line, 'utf-8')
    await this.regenerateStateFiles()
  }

  async queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> {
    const p = this.eventsPath(loopId)
    if (!existsSync(p)) return []
    const content = await fs.readFile(p, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    let events: LoopEvent[] = lines.map(l => JSON.parse(l))
    if (since) {
      events = events.filter(e => (e as any).ts > since)
    }
    if (limit) {
      events = events.slice(-limit)
    }
    return events
  }

  async detectDrift(loopId: string): Promise<DriftReport> {
    // Compare STATE.md (human-readable) vs STATE.json (machine-readable)
    // If STATE.md was hand-edited, report drift
    const stateJson = this.stateJsonPath()
    const stateMd = this.stateMdPath()
    if (!existsSync(stateJson) || !existsSync(stateMd)) {
      return { hasDrift: false, details: 'State files not yet created' }
    }
    const jsonContent = JSON.parse(await fs.readFile(stateJson, 'utf-8'))
    const mdContent = await fs.readFile(stateMd, 'utf-8')
    // Simple heuristic: check if loopId appears in both
    const jsonHasLoop = jsonContent.loops?.some((l: any) => l.id === loopId)
    const mdHasLoop = mdContent.includes(`### ${loopId}`)
    if (jsonHasLoop !== mdHasLoop) {
      return { hasDrift: true, details: `Loop ${loopId} exists in JSON but not in MD (or vice versa). STATE.md is auto-generated; hand-editing it will not take effect. Edit STATE.json or use the API instead.` }
    }
    return { hasDrift: false, details: 'No drift detected' }
  }

  private async regenerateStateFiles(): Promise<void> {
    const loops = await this.listLoops()
    // STATE.json
    const stateJson = { updated: new Date().toISOString(), loops }
    await this.ensureDir(this.baseDir)
    await fs.writeFile(this.stateJsonPath(), JSON.stringify(stateJson, null, 2), 'utf-8')
    // STATE.md (human-readable projection)
    const md = this.renderStateMd(loops)
    await fs.writeFile(this.stateMdPath(), md, 'utf-8')
  }

  private renderStateMd(loops: LoopInstance[]): string {
    const lines: string[] = [
      '# Loop State Spine',
      `Updated: ${new Date().toISOString()}`,
      '',
    ]
    const active = loops.filter(l => l.status !== 'completed' && l.status !== 'failed')
    const archived = loops.filter(l => l.status === 'completed' || l.status === 'failed')
    if (active.length > 0) {
      lines.push('## Active Loops', '')
      for (const l of active) {
        lines.push(`### ${l.id}`)
        lines.push(`- **Name**: ${l.name}`)
        lines.push(`- **Goal**: ${l.goal}`)
        lines.push(`- **Stop**: ${l.stopCondition}`)
        lines.push(`- **Stage**: ${l.stage}`)
        lines.push(`- **Status**: ${l.status}`)
        lines.push(`- **Pattern**: ${l.pattern} (${l.autonomyLevel})`)
        lines.push(`- **Schedule**: ${l.schedule.mode} ${l.schedule.cron ?? ''} (${l.schedule.timezone})`)
        lines.push(`- **Iteration**: #${l.stats.currentIteration}`)
        lines.push(`- **Budget**: $${l.stats.totalCost.toFixed(2)} / $${l.budget.maxCostTotal.toFixed(2)} (${((l.stats.totalCost / l.budget.maxCostTotal) * 100).toFixed(1)}%)`)
        lines.push(`- **Next tick**: ${l.nextTickAt ?? '—'}`)
        lines.push('')
      }
    }
    if (archived.length > 0) {
      lines.push('## Archived Loops', '')
      for (const l of archived) {
        lines.push(`### ${l.id} (${l.status})`)
        lines.push(`- **Pattern**: ${l.pattern}`)
        lines.push(`- **Iterations**: ${l.stats.totalIterations}`)
        lines.push(`- **Tasks completed**: ${l.stats.tasksCompleted}`)
        lines.push('')
      }
    }
    return lines.join('\n')
  }
}
