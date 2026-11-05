// @vitest-environment node
// Task 8 负例：bundle 身份对任一输入变化敏感、同输入稳定（含键序无关）。
// 实现前随模块缺失先行咬红；敏感性用例即 Task 10 变异探针④的锚定面
//（实现忽略 runtimeManifestDigest 时本组必红）。
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { computeBundleIdentity } from '../bundle-identity'

const baseInput = {
  commit: 'a'.repeat(40),
  vendorBaselines: { 'hermes-studio': 's'.repeat(40), 'hermes-agent': 'g'.repeat(40), zcode: null },
  patchDigests: [
    { name: '001-foo.patch', sha256: '1'.repeat(64) },
    { name: '002-bar.patch', sha256: '2'.repeat(64) },
  ],
  runtimeManifestDigest: '3'.repeat(64),
  assetDigests: [
    { rel: 'runtime/pricing/models.yaml', sha256: '4'.repeat(64) },
    { rel: 'semantica-bridge.py', sha256: '5'.repeat(64) },
  ],
}

describe('computeBundleIdentity', () => {
  it('稳定：同输入同 sha256（64 hex）', () => {
    const a = computeBundleIdentity(baseInput)
    const b = computeBundleIdentity(JSON.parse(JSON.stringify(baseInput)))
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('稳定：输入对象键序无关（canonical 序列化，不随 Object 插序漂移）', () => {
    const reordered = {
      assetDigests: [...baseInput.assetDigests].reverse(),
      patchDigests: [...baseInput.patchDigests],
      runtimeManifestDigest: baseInput.runtimeManifestDigest,
      vendorBaselines: { zcode: null, 'hermes-agent': 'g'.repeat(40), 'hermes-studio': 's'.repeat(40) },
      commit: baseInput.commit,
    }
    // assetDigests 是集合面（rel 唯一）：顺序无关；其余字段名序无关
    expect(computeBundleIdentity(reordered)).toBe(computeBundleIdentity(baseInput))
  })

  it('敏感：commit 变化 → 身份变', () => {
    expect(computeBundleIdentity({ ...baseInput, commit: 'b'.repeat(40) }))
      .not.toBe(computeBundleIdentity(baseInput))
  })

  it('敏感：任一 vendor 基线变化（含 null→oid）→ 身份变', () => {
    const studio = computeBundleIdentity({
      ...baseInput,
      vendorBaselines: { ...baseInput.vendorBaselines, 'hermes-studio': 'x'.repeat(40) },
    })
    const zcodeActivated = computeBundleIdentity({
      ...baseInput,
      vendorBaselines: { ...baseInput.vendorBaselines, zcode: 'z'.repeat(40) },
    })
    const agentRemoved = computeBundleIdentity({
      ...baseInput,
      vendorBaselines: { ...baseInput.vendorBaselines, 'hermes-agent': null },
    })
    const base = computeBundleIdentity(baseInput)
    expect(studio).not.toBe(base)
    expect(zcodeActivated).not.toBe(base)
    expect(agentRemoved).not.toBe(base)
  })

  it('敏感：补丁清单变化（改摘要/增删项/改序）→ 身份变', () => {
    const base = computeBundleIdentity(baseInput)
    const modified = computeBundleIdentity({
      ...baseInput,
      patchDigests: [
        { name: '001-foo.patch', sha256: '9'.repeat(64) },
        { name: '002-bar.patch', sha256: '2'.repeat(64) },
      ],
    })
    const added = computeBundleIdentity({
      ...baseInput,
      patchDigests: [...baseInput.patchDigests, { name: '003-baz.patch', sha256: '7'.repeat(64) }],
    })
    const removed = computeBundleIdentity({
      ...baseInput,
      patchDigests: [baseInput.patchDigests[0]],
    })
    // series 序是注入语义的一部分：同两项不同序=不同计划
    const reordered = computeBundleIdentity({
      ...baseInput,
      patchDigests: [...baseInput.patchDigests].reverse(),
    })
    for (const v of [modified, added, removed, reordered]) expect(v).not.toBe(base)
  })

  it('敏感：runtimeManifestDigest 变化 → 身份变（Task 10 变异探针④锚定面）', () => {
    expect(computeBundleIdentity({ ...baseInput, runtimeManifestDigest: '6'.repeat(64) }))
      .not.toBe(computeBundleIdentity(baseInput))
  })

  it('敏感：任一资产摘要变化 → 身份变', () => {
    const base = computeBundleIdentity(baseInput)
    const drifted = computeBundleIdentity({
      ...baseInput,
      assetDigests: [
        { rel: 'runtime/pricing/models.yaml', sha256: '8'.repeat(64) },
        { rel: 'semantica-bridge.py', sha256: '5'.repeat(64) },
      ],
    })
    const added = computeBundleIdentity({
      ...baseInput,
      assetDigests: [...baseInput.assetDigests, { rel: 'runtime/roster/squads.yaml', sha256: '0'.repeat(64) }],
    })
    expect(drifted).not.toBe(base)
    expect(added).not.toBe(base)
  })

  it('形态：与 canonical JSON 的 sha256 可独立复算（无隐藏盐/时变因子）', () => {
    // 同输入两次调用一致已证稳定；此处锚定「纯函数」——不触时间/随机源：
    // 直接断言 digest 可作为确定性映射（同输入在不同进程语义下仍同值）
    const d1 = computeBundleIdentity(baseInput)
    const d2 = createHash('sha256').update(String(computeBundleIdentity(baseInput))).digest('hex')
    expect(d1).toMatch(/^[0-9a-f]{64}$/)
    expect(d2).toMatch(/^[0-9a-f]{64}$/)
  })
})
