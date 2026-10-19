// overlay[redteam] 运行账本（独立于 eval store：红队报告量大、保留策略不同）。
//
// 纪律同 eval/heldout store：tmp+rename 原子写、仅 ENOENT 按空账、
// 保留最近 50 次运行（旧报告可随时用同种子复现，无需无限堆积）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { RedteamRun, RedteamRunSummary } from './types'

interface StoreShape {
  runs: RedteamRun[]
  nextSeq: number
}

const KEEP_RUNS = 50

function storeDir(): string {
  const env = process.env.REDTEAM_STORE?.trim()
  return env || join(homedir(), '.hermes-web-ui', 'redteam')
}

function storePath(): string {
  return join(storeDir(), 'redteam-store.json')
}

function readStore(): StoreShape {
  try {
    const raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<StoreShape>
    return {
      runs: Array.isArray(raw.runs) ? raw.runs : [],
      nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { runs: [], nextSeq: 1 }
    throw e
  }
}

function writeStore(store: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = storePath()
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function appendRun(run: RedteamRun): void {
  const store = readStore()
  store.runs.push(run)
  if (store.runs.length > KEEP_RUNS) store.runs = store.runs.slice(-KEEP_RUNS)
  store.nextSeq += 1
  writeStore(store)
}

export function listRuns(limit = 20): RedteamRunSummary[] {
  const store = readStore()
  return [...store.runs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, Math.min(limit, KEEP_RUNS)))
    .map((run) => ({
      id: run.id,
      createdAt: run.createdAt,
      config: run.config,
      totals: run.totals,
      benign: { total: run.benign.total, flagged: run.benign.flagged, falsePositiveRate: run.benign.falsePositiveRate },
    }))
}

export function getRun(id: string): RedteamRun | undefined {
  return readStore().runs.find((r) => r.id === id)
}

export function latestRun(): RedteamRun | undefined {
  return [...readStore().runs].sort((a, b) => b.createdAt - a.createdAt)[0]
}

/** 运行总次数（指标消费证据用；不受保留上限之外的额外信息影响）。 */
export function countRuns(): number {
  return readStore().runs.length
}

/** 测试隔离。 */
export function _useStoreDirForTests(dir: string): void {
  process.env.REDTEAM_STORE = dir
}

export function _storeFileExistsForTests(): boolean {
  return existsSync(storePath())
}
