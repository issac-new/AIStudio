// overlay/custom/server/harness/workbench/store.ts
// 改进实验台状态（提案/经验/冠军），原子写 + 进程内串行化。
// 路径约定与 expcandidates/run-manifest 一致：HARNESS2_STORE 显式优先，
// 其次 HERMES_WEB_UI_HOME / HERMES_WEBUI_STATE_DIR，最后 ~/.hermes-web-ui。
// 读取只把 ENOENT 当空库；解析失败抛出（由 upper layer 报错），绝不静默覆写。
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import type { WorkbenchStore } from './types'

export function storeDir(): string {
  const env = process.env.HARNESS2_STORE?.trim()
  if (env) {
    // HARNESS2_STORE 可以指向目录或文件；以扩展名 .json 判定。
    return env.endsWith('.json') ? dirname(resolve(env)) : resolve(env)
  }
  const webuiHome = process.env.HERMES_WEB_UI_HOME?.trim() || process.env.HERMES_WEBUI_STATE_DIR?.trim()
  return webuiHome ? join(webuiHome, 'harness-workbench') : join(homedir(), '.hermes-web-ui', 'harness-workbench')
}

export function storeFile(): string {
  const env = process.env.HARNESS2_STORE?.trim()
  if (env && env.endsWith('.json')) return resolve(env)
  return join(storeDir(), 'workbench.json')
}

export function backupDir(): string {
  return join(storeDir(), 'backups')
}

export function emptyStore(): WorkbenchStore {
  return { version: 1, nextSeq: 1, proposals: [], experiences: [], champions: [] }
}

export function readStore(): WorkbenchStore {
  const file = storeFile()
  if (!existsSync(file)) return emptyStore()
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorkbenchStore>
  return {
    version: 1,
    nextSeq: typeof raw.nextSeq === 'number' && raw.nextSeq > 0 ? raw.nextSeq : 1,
    proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
    experiences: Array.isArray(raw.experiences) ? raw.experiences : [],
    champions: Array.isArray(raw.champions) ? raw.champions : [],
  }
}

export function writeStore(store: WorkbenchStore): void {
  const file = storeFile()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, file)
}

/** 进程内串行化读-改-写，避免并发请求互相覆盖。 */
let chain: Promise<unknown> = Promise.resolve()

export function mutateStore<T>(fn: (store: WorkbenchStore) => T | Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const store = readStore()
    const result = await fn(store)
    writeStore(store)
    return result
  })
  // 链本身不因单次失败中断；调用方仍拿到自己的拒绝。
  chain = next.catch(() => undefined)
  return next
}

export function nextId(store: { nextSeq: number }, prefix: string): string {
  const id = `${prefix}-${String(store.nextSeq).padStart(3, '0')}`
  store.nextSeq += 1
  return id
}

/** 测试隔离：显式指定 store 文件。 */
export function _useStoreFileForTests(file: string): void {
  process.env.HARNESS2_STORE = file
}
