// overlay[expdual] 台账存储：JSON 单文件 + 原子写。
//
// 隔离约定与 expcandidates 同链：EXP_DUAL_STORE 显式覆写 → HERMES_WEB_UI_HOME /
// HERMES_WEBUI_STATE_DIR（推演隔离环境）→ 宿主 webui 目录。坏文件不静默吞：读取抛错，
// 注入层 fail-soft 返回空块，写路径把错误交给调用方（不拿猜测覆盖现场）。
import { mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import { emptyStore, type DualStoreShape } from './dual-types'

export function storeDir(): string {
  const env = process.env.EXP_DUAL_STORE?.trim()
  if (env) return env
  const webuiHome = process.env.HERMES_WEB_UI_HOME?.trim() || process.env.HERMES_WEBUI_STATE_DIR?.trim()
  return webuiHome ? join(webuiHome, 'expdual') : underWebUi('expdual')
}

export function storePath(): string {
  return join(storeDir(), 'dual-store.json')
}

function normalize(raw: Partial<DualStoreShape>): DualStoreShape {
  const base = emptyStore()
  return {
    version: 1,
    chunk: typeof raw.chunk === 'number' && raw.chunk > 0 ? raw.chunk : base.chunk,
    nextSeq: {
      fact: typeof raw.nextSeq?.fact === 'number' ? raw.nextSeq.fact : 1,
      tip: typeof raw.nextSeq?.tip === 'number' ? raw.nextSeq.tip : 1,
    },
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    retired: Array.isArray(raw.retired) ? raw.retired : [],
    removed: Array.isArray(raw.removed) ? raw.removed : [],
    blames: Array.isArray(raw.blames) ? raw.blames : [],
    synthesis: Array.isArray(raw.synthesis) ? raw.synthesis : [],
    snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
  }
}

export function readDualStore(): DualStoreShape {
  let raw: Partial<DualStoreShape>
  try {
    raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<DualStoreShape>
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore()
    throw e
  }
  return normalize(raw)
}

export function writeDualStore(store: DualStoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(storePath(), store)
}

/** 读-改-写一次完成（控制器统一走这里，避免半更新落盘）。 */
export function updateDualStore<T>(mutator: (store: DualStoreShape) => T): T {
  const store = readDualStore()
  const result = mutator(store)
  writeDualStore(store)
  return result
}
