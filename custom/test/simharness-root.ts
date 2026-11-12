// 测试定位 simharness 推演仓的唯一入口（单一事实源，2026-11-12 CI 平台差异清偿）：
//   显式 env MX_SIMHARNESS_ROOT > 仓内 simharness/（单仓整合正本）> 旧兄弟布局回落。
// 此前 delivery-harness-contract 与 raci-rest-guard 各持一份复制解析、只认
// 「ncwk 分树轮兄弟布局」，CI 单检出上兄弟路径 ENOENT（scandir ../simharness /
// 构造器 Command failed）；单仓整合（2026-10-24）后 simharness 已入库且与消费
// 它的守门测试同 commit 锁定，仓内优先。只服务 Vitest，不在生产代码引用。
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const OVERLAY_ROOT = resolve(__dirname, '../..')

/** 旧布局回落：worktree 的 .git 文件指向主仓 .git——兄弟目录挂在主仓根旁，
 * 须回到主仓根再取兄弟（保留既有语义，防主检出 worktree 场景失配）。 */
function resolveViaLegacySibling(startDir: string): string | null {
  let cur = startDir
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(cur, 'patches', 'series'))) {
      const gitFile = join(cur, '.git')
      if (existsSync(gitFile) && statSync(gitFile).isFile()) {
        const m = /gitdir:\s*(.+)/.exec(readFileSync(gitFile, 'utf8').trim())
        if (m) {
          const mainRoot = dirname(dirname(resolve(m[1].trim())))
          const viaMain = join(mainRoot, '..', 'simharness')
          if (existsSync(viaMain)) return viaMain
        }
      }
      const sibling = join(cur, '..', 'simharness')
      if (existsSync(sibling)) return sibling
    }
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

export function resolveSimharnessRoot(startDir: string = __dirname): string {
  const explicit = process.env.MX_SIMHARNESS_ROOT?.trim()
  if (explicit) return resolve(explicit)
  const inRepo = join(OVERLAY_ROOT, 'simharness')
  if (existsSync(inRepo)) return inRepo
  return resolveViaLegacySibling(startDir) ?? inRepo
}

export const SIMHARNESS_ROOT = resolveSimharnessRoot()

export function simharnessPath(...parts: string[]): string {
  return resolve(SIMHARNESS_ROOT, ...parts)
}
