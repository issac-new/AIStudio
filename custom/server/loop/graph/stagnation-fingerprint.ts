// overlay/custom/server/loop/graph/stagnation-fingerprint.ts
// 长会话治理 B3：停滞熔断的外部状态指纹（13b5739 教训的产品化）。
//
// 教训（run14 G5 熔断 85 圈）：停滞判据若只看内部日志形态（行数/通道布尔），
// 外部证据（分支 tip、任务卡内容）已经变了也不会复位——真在推进的循环被误熔断，
// 真停滞的循环靠日志噪声逃过熔断。判据签名必须包含**外部状态**。
//
// 本指纹的组成（只选"真进展才会动"的信号，刻意排除 attempts/status 这类每轮
// 都会翻动的字段——否则指纹永不稳定，熔断永不可达）：
//   1. 契约的 persistedTaskId 集合（新任务卡真实入库才变）；
//   2. loop.verification-complete 且 passed=true 的计数（真验证通过才变）；
//   3. worktree git tip（可选：装配层注入 worktreeDir 解析器时生效）。
// 任一变化 = 有进展 = 停滞计数清零；全部不变 = 空转 +1。

import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { LoopInstance, TaskContract } from '../types'
import type { LoopStateStore } from '../store/state-store'

const execFileAsync = promisify(execFile)

export interface FingerprintDeps {
  /** 契约 → worktree 目录路径（缺省无 → git 面不参与指纹） */
  worktreeDir?: (contract: TaskContract) => string | null
  /** git tip 读取（测试注入用；缺省 execFile git rev-parse，3s 有界） */
  gitTip?: (dir: string) => Promise<string | null>
  /** 事件窗口（缺省 200 条） */
  eventWindow?: number
}

async function defaultGitTip(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD'], { timeout: 3000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function readGitTip(dir: string | null | undefined, deps: FingerprintDeps): Promise<string> {
  if (!dir) return 'no-wt'
  const tip = await (deps.gitTip ?? defaultGitTip)(dir)
  return tip ?? 'no-tip'
}

/** sha256 指纹；组成面全空（无契约）返回 null（调用方回退布尔语义）。 */
export async function computeLoopFingerprint(
  loop: LoopInstance, contracts: TaskContract[],
  passedVerifications: number, deps: FingerprintDeps = {},
): Promise<string | null> {
  if (contracts.length === 0) return null
  const parts: string[] = []
  for (const c of [...contracts].sort((a, b) => a.id.localeCompare(b.id))) {
    const tip = await readGitTip(deps.worktreeDir?.(c) ?? null, deps)
    parts.push(`${c.id}|card=${c.persistedTaskId ?? '-'}|tip=${tip}`)
  }
  parts.push(`vp=${passedVerifications}`)
  return createHash('sha256').update(parts.join('\n')).digest('hex')
}

/** 组装 fingerprint 回调（RunSpawner.fingerprint 注入面）。 */
export function makeLoopFingerprint(store: LoopStateStore, deps: FingerprintDeps = {}) {
  return async (loop: LoopInstance): Promise<string | null> => {
    const contracts = await store.queryContracts(loop.id)
    const events = await store.queryEvents(loop.id, undefined, deps.eventWindow ?? 200)
    const passed = events.filter(
      (e): e is typeof e & { passed: boolean } =>
        e.type === 'loop.verification-complete' && (e as { passed?: unknown }).passed === true,
    ).length
    return computeLoopFingerprint(loop, contracts, passed, deps)
  }
}
