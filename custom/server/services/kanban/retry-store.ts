// custom/server/services/kanban/retry-store.ts
// 防死循环打回计数的 sidecar 持久化（kanban CLI 无 body 编辑动词，任务元数据
// 不可写，故按 teams-store 惯例落 `~/.hermes-web-ui/overlay/`）。
// 任务 id 全局唯一，完成态不复零无副作用；reset 供测试与人工清零。

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'

type RetryCounts = Record<string, number>

function defaultPath(): string {
  return join(homedir(), '.hermes-web-ui', 'overlay', 'aipaydev-retry.json')
}

async function readCounts(path: string): Promise<RetryCounts> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as RetryCounts
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeCounts(path: string, counts: RetryCounts): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(counts, null, 2), 'utf8')
  await rename(tmp, path)
}

export class RetryStore {
  static async increment(taskId: string, filePath = defaultPath()): Promise<number> {
    const counts = await readCounts(filePath)
    const next = (counts[taskId] ?? 0) + 1
    counts[taskId] = next
    await writeCounts(filePath, counts)
    return next
  }

  static async get(taskId: string, filePath = defaultPath()): Promise<number> {
    return (await readCounts(filePath))[taskId] ?? 0
  }

  static async reset(taskId: string, filePath = defaultPath()): Promise<void> {
    const counts = await readCounts(filePath)
    if (counts[taskId] === undefined) return
    delete counts[taskId]
    await writeCounts(filePath, counts)
  }
}
