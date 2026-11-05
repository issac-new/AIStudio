// bundle 身份（P1 平台重写 Task 8）：构建产物与源码事实的稳定绑定摘要。
//
// 设计约束（spec §4.3-1）：bundleId 绑定源码提交、vendor 基线（treeOid）、补丁摘要
// （series 序）、runtime manifest 摘要与必需资源摘要——任一输入变化即身份变化；
// 同输入必同身份（canonical 序列化，键序无关、无时间/随机因子）。
//
// 数据面来源（不在此模块重复采集）：
//   - commit                = 构建时 git HEAD（release:gate 证据同源）
//   - vendorBaselines       = 注入 manifest v2 的 baseline.treeOids（Task 3 采集）
//   - patchDigests          = 注入计划 PlanItem[]（series 序，sha256=补丁字节摘要）
//   - runtimeManifestDigest = runtime-assets 清单 canonical 摘要（Task 7）
//   - assetDigests          = runtime-assets 清单 assets（rel 集合，序无关）
import { createHash } from 'node:crypto'

/** 补丁摘要项（series 序即数组序——注入计划的顺序是语义的一部分）。 */
export interface PatchDigest {
  name: string
  sha256: string
}

/** 资产摘要项（rel 唯一——集合语义，序无关）。 */
export interface AssetDigest {
  rel: string
  sha256: string
}

/** 三树 vendor 基线 treeOid；树缺席/未观测=显式 null（缺席也是可绑定的事实）。 */
export type VendorBaselines = {
  'hermes-studio'?: string | null
  'hermes-agent'?: string | null
  zcode?: string | null
}

export interface BundleIdentityInput {
  commit: string
  vendorBaselines: VendorBaselines
  patchDigests: PatchDigest[]
  runtimeManifestDigest: string
  assetDigests: AssetDigest[]
}

/** 固定键序的 canonical 载荷（同输入同字节——键序漂移不进摘要）。 */
function canonicalPayload(input: BundleIdentityInput): string {
  const baselines = input.vendorBaselines ?? {}
  return JSON.stringify({
    commit: input.commit,
    vendorBaselines: {
      'hermes-studio': baselines['hermes-studio'] ?? null,
      'hermes-agent': baselines['hermes-agent'] ?? null,
      zcode: baselines.zcode ?? null,
    },
    // 补丁按 series 序（数组序保留）
    patchDigests: (input.patchDigests ?? []).map((p) => ({ name: p.name, sha256: p.sha256 })),
    runtimeManifestDigest: input.runtimeManifestDigest,
    // 资产按 rel 集合（排序归一，序无关）
    assetDigests: [...(input.assetDigests ?? [])]
      .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
      .map((a) => ({ rel: a.rel, sha256: a.sha256 })),
  })
}

/**
 * 计算 bundle 身份（稳定 sha256，64 hex）。
 * 纯函数：同输入同输出（canonical JSON 序列化后 sha256），不读环境、不触时钟。
 */
export function computeBundleIdentity(input: BundleIdentityInput): string {
  return createHash('sha256').update(canonicalPayload(input)).digest('hex')
}
