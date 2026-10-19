// overlay/custom/server/harness/workbench/apply.ts
// managed 面的写盘与回滚：只动 HERMES_HOME 内已存在文件，写前快照，写后校验。
// 双闸：HARNESS2_APPLY=1 + 提案已人工批准（门禁在 service 层统一判定）。
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { sha256, treeDigest } from './loop'
import { backupDir } from './store'
import { hermesHome, resolveManagedTarget } from './surface-registry'
import type { Proposal, VariantFile } from './types'

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
  // 新文件用 0600；已存在文件保留原权限。
  const mode = existsSync(abs) ? statSync(abs).mode : 0o600
  const tmp = `${abs}.harness2-tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, content, 'utf8')
  chmodSync(tmp, mode)
  renameSync(tmp, abs)
}

/** 写入 proposal 的选中内容；调用方必须先过晋级门禁。 */
export function applyProposalFile(proposal: Proposal): ApplyResult {
  if (!applyEnabled()) return { ok: false, error: '写盘未启用：需设置 HARNESS2_APPLY=1' }
  const selected = proposal.composition?.variantId ? proposal.variants.find((v) => v.id === proposal.composition?.variantId) : null
  if (selected?.files && selected.files.length > 0) {
    return applyProposalTree(proposal, { files: selected.files, deletions: selected.deletions })
  }
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

/** 多文件原子写：先解析全部路径（任一不可写整体不动），快照后执行新建/修改/删除。 */
function applyProposalTree(proposal: Proposal, selected: { files: VariantFile[]; deletions?: string[] }): ApplyResult {
  const home = hermesHome()
  const touched: Array<{ path: string; abs: string; existed: boolean; oldContent: string | null; action: 'write' | 'delete'; newContent: string | null }> = []
  for (const f of selected.files) {
    const r = resolveManagedTarget(proposal.surfaceKey, f.path, home, { requireExists: false, relaxPattern: true })
    if (!r.ok || !r.abs) return { ok: false, error: `文件 ${f.path} 不可写：${r.error}` }
    const existed = existsSync(r.abs)
    touched.push({ path: f.path, abs: r.abs, existed, oldContent: existed ? readFileSync(r.abs, 'utf8') : null, action: 'write', newContent: f.content })
  }
  for (const d of selected.deletions ?? []) {
    const r = resolveManagedTarget(proposal.surfaceKey, d, home, { relaxPattern: true })
    if (!r.ok || !r.abs) return { ok: false, error: `删除路径 ${d} 不可写：${r.error}` }
    touched.push({ path: d, abs: r.abs, existed: true, oldContent: readFileSync(r.abs, 'utf8'), action: 'delete', newContent: null })
  }
  const dir = backupDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const backupPath = join(dir, `${proposal.id}-tree-${Date.now()}.json`)
  try {
    writeFileSync(backupPath, JSON.stringify({ touched }, null, 2), { encoding: 'utf8', mode: 0o600 })
    for (const t of touched.filter((x) => x.action === 'delete')) unlinkSync(t.abs)
    for (const t of touched.filter((x) => x.action === 'write')) {
      mkdirSync(dirname(t.abs), { recursive: true })
      atomicWrite(t.abs, t.newContent ?? '')
    }
  } catch (e) {
    return { ok: false, error: `树写盘失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, backupPath, digest: treeDigest(selected.files, selected.deletions ?? []) }
}

/** 回滚：当前文件仍等于晋级时摘要才恢复基线；外部改动则拒绝并说明。 */
export function rollbackProposalFile(proposal: Proposal): ApplyResult {
  const promotion = proposal.promotion
  if (!promotion || !promotion.applied) return { ok: true } // 本来就没写盘，只回滚冠军指针
  if (!promotion.backupPath) {
    // 兼容旧形态：无备份路径的单文件晋级，直接按基线快照回滚。
    if (!proposal.targetPath || !proposal.base) return { ok: false, error: '提案缺少目标或基线快照' }
    const r0 = resolveManagedTarget(proposal.surfaceKey, proposal.targetPath, hermesHome())
    if (!r0.ok || !r0.abs) return { ok: false, error: r0.error ?? '目标路径不可写' }
    if (!existsSync(r0.abs)) return { ok: false, error: '目标文件已不存在，请人工处理' }
    if (fileDigest(r0.abs) !== promotion.digest) {
      return { ok: false, error: '目标文件在晋级后被外部修改，拒绝回滚覆盖' }
    }
    try {
      atomicWrite(r0.abs, proposal.base.content)
    } catch (e) {
      return { ok: false, error: `回滚写盘失败：${e instanceof Error ? e.message : String(e)}` }
    }
    return { ok: true, digest: proposal.base.digest }
  }
  // 单文件快照（.bak 纯文本）
  if (promotion.backupPath.endsWith('.bak')) {
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
  // 树快照（JSON：touched 三态恢复）
  try {
    const snap = JSON.parse(readFileSync(promotion.backupPath, 'utf8')) as {
      touched: Array<{ path: string; abs: string; existed: boolean; oldContent: string | null; action: 'write' | 'delete'; newContent: string | null }>
    }
    if (!Array.isArray(snap.touched)) throw new Error('快照格式非法')
    for (const t of snap.touched) {
      const r = resolveManagedTarget(proposal.surfaceKey, t.path, hermesHome(), { requireExists: false, relaxPattern: true })
      if (!r.ok || !r.abs) throw new Error(`回滚路径 ${t.path} 不可写：${r.error}`)
      if (t.action === 'write') {
        if (!existsSync(r.abs)) throw new Error(`文件 ${t.path} 已被外部删除，请人工处理`)
        const expected = sha256(t.newContent ?? '')
        if (fileDigest(r.abs) !== expected) throw new Error(`文件 ${t.path} 在晋级后被外部修改，拒绝回滚覆盖`)
        if (t.existed) atomicWrite(r.abs, t.oldContent ?? '')
        else unlinkSync(r.abs)
      } else {
        if (existsSync(r.abs)) throw new Error(`删除路径 ${t.path} 在晋级后被外部重建，拒绝回滚覆盖`)
        atomicWrite(r.abs, t.oldContent ?? '')
      }
    }
  } catch (e) {
    return { ok: false, error: `回滚失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, digest: promotion.digest }
}

