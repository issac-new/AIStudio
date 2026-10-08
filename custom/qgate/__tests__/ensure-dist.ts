// CLI 冒烟前置：确保 dist/cli.js 存在且不旧于 src（dist 被 .gitignore 忽略，
// fresh clone 上不存在；改源忘重建会测旧产物——2026-10-08 两个实测坑）。
// 语义：缺或旧 → 原地 npm run build；并发（vitest 并行文件同时触发）用
// dist/.build-lock O_EXCL 原子抢锁，未抢到的轮询等锁消失后复检新鲜度。
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const qgateRoot = resolve(here, '..')
export const distCli = join(qgateRoot, 'dist', 'cli.js')
const lockPath = join(qgateRoot, 'dist', '.build-lock')

const BUILD_TIMEOUT_MS = 180_000
const POLL_MS = 250

function newestSrcMtime(dir: string = join(qgateRoot, 'src')): number {
  let newest = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) newest = Math.max(newest, newestSrcMtime(p))
    else if (e.name.endsWith('.ts')) newest = Math.max(newest, statSync(p).mtimeMs)
  }
  return newest
}

const isFresh = (): boolean =>
  existsSync(distCli) && statSync(distCli).mtimeMs >= newestSrcMtime()

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function tryLock(): Promise<boolean> {
  try {
    closeSync(openSync(lockPath, 'wx'))
    return true
  } catch {
    return false
  }
}

export async function ensureDist(): Promise<void> {
  mkdirSync(join(qgateRoot, 'dist'), { recursive: true })
  if (isFresh()) return

  const deadline = Date.now() + BUILD_TIMEOUT_MS
  // 抢锁失败=并行文件在构建：等它完成后复检；锁在但构建方已死（超时）则夺锁自救。
  while (!(await tryLock())) {
    if (!existsSync(lockPath)) continue // 上一持有者刚释放，重抢
    if (Date.now() > deadline) throw new Error('qgate dist 构建锁等待超时（并行构建方未退出）')
    await sleep(POLL_MS)
    if (isFresh()) return
  }
  try {
    if (isFresh()) return
    const r = spawnSync('npm', ['run', 'build'], { cwd: qgateRoot, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS })
    if (r.status !== 0) {
      throw new Error(`qgate dist 构建失败（exit ${r.status}）：\n${r.stdout ?? ''}${r.stderr ?? ''}`)
    }
    if (!isFresh()) throw new Error('构建完成但 dist 仍旧于 src（异常，请人工检查 mtime）')
  } finally {
    rmSync(lockPath, { force: true })
  }
}
