// overlay/custom/client/loop/__tests__/loop-migrate.test.ts
import { describe, it, expect } from 'vitest'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'
import { LocalStore } from '../../../server/loop/store/local-store'
import type { LoopInstance } from '../types'

const TEST_DIR = '.loop-migrate-test'

function makeLoop(id: string = 'migrate-test'): LoopInstance {
  return {
    id, name: 'Migrate Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Loop Migration (Local → Matrix)', () => {
  it('can enumerate LocalStore data for migration', async () => {
    const store = new LocalStore(TEST_DIR)
    await store.createLoop(makeLoop())
    const loops = await store.listLoops()
    expect(loops.length).toBe(1)
    // Cleanup
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('migration script file exists', () => {
    expect(existsSync(resolve(process.cwd(), 'scripts/loop-migrate.mjs'))).toBe(true)
  })
})
