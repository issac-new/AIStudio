// overlay/custom/server/harness/workbench/apply.ts
// managed 面的写盘与回滚：只动 HERMES_HOME 内已存在文件，写前快照，写后校验。
// 双闸：HARNESS2_APPLY=1 + 提案已人工批准（门禁在 service 层统一判定）。
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sha256 } from './loop'
import { backupDir } from './store'
import { hermesHome, resolveManagedTarget } from './surface-registry'
import type { Proposal } from './types'

export interface ApplyResult {
  ok: boolean
  backupPath?: string
  digest?: string
  error?: string
}

export function fileDigest(abs: string): string | null {
  try {
    return sha256(readFileSync(abs, 'utf8'))
  } catch {
    return null
  }
}

export function applyEnabled(): boolean {
  return process.env.HARNESS2_APPLY === '1'
}

function atomicWrite(abs: string, content: string): void {
  const mode = statSync(abs).mode
  const tmp = `${abs}.harness2-tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, content, 'utf8')
  chmodSync(tmp, mode)
  renameSync(tmp, abs)
}

/** 写入 proposal 的选中内容；调用方必须先过晋级门禁。 */
export function applyProposalFile(proposal: Proposal): ApplyResult {
  if (!applyEnabled()) return { ok: false, error: '写盘未启用：需设置 HARNESS2_APPLY=1' }
  if (!proposal.targetPath) return { ok: false, error: '提案未指定目标文件' }
  if (!proposal.base) return { ok: false, error: '提案缺少基线快照' }
  const resolved = resolveManagedTarget(proposal.surfaceKey, proposal.targetPath, hermesHome())
  if (!resolved.ok || !resolved.abs) return { ok: false, error: resolved.error ?? '目标路径不可写' }
  const current = fileDigest(resolved.abs)
  if (current == null) return { ok: false, error: '目标文件不可读' }
  if (current !== proposal.base.digest) {
    return { ok: false, error: '目标文件已在提案后被修改，拒绝覆盖' }
  }
  const content = proposal.composition?.variantId
    ? proposal.variants.find((v) => v.id === proposal.composition?.variantId)?.content
    : proposal.composition?.mergedContent
  if (content == null) return { ok: false, error: '组合内容缺失' }
  const dir = backupDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const backupPath = join(dir, `${proposal.id}-${Date.now()}.bak`)
  try {
    writeFileSync(backupPath, readFileSync(resolved.abs, 'utf8'), { encoding: 'utf8', mode: 0o600 })
    atomicWrite(resolved.abs, content)
  } catch (e) {
    return { ok: false, error: `写盘失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, backupPath, digest: sha256(content) }
}

/** 回滚：当前文件仍等于晋级时摘要才恢复基线；外部改动则拒绝并说明。 */
export function rollbackProposalFile(proposal: Proposal): ApplyResult {
  const promotion = proposal.promotion
  if (!promotion || !promotion.applied) return { ok: true } // 本来就没写盘，只回滚冠军指针
  if (!proposal.targetPath || !proposal.base) return { ok: false, error: '提案缺少目标或基线快照' }
  const resolved = resolveManagedTarget(proposal.surfaceKey, proposal.targetPath, hermesHome())
  if (!resolved.ok || !resolved.abs) return { ok: false, error: resolved.error ?? '目标路径不可写' }
  if (!existsSync(resolved.abs)) return { ok: false, error: '目标文件已不存在，请人工处理' }
  const current = fileDigest(resolved.abs)
  if (current == null) return { ok: false, error: '目标文件不可读' }
  if (current !== promotion.digest) {
    return { ok: false, error: '目标文件在晋级后被外部修改，拒绝回滚覆盖' }
  }
  try {
    atomicWrite(resolved.abs, proposal.base.content)
  } catch (e) {
    return { ok: false, error: `回滚写盘失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, digest: proposal.base.digest }
}
