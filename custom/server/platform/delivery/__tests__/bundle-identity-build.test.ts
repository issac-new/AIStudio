// @vitest-environment node
// Round-2 Important 1 负例：bundleId 接线层（构建侧装配，非纯函数重复）。
// 锚定四件事：注入 manifest v2 + runtime 清单 → BundleIdentityInput 的装配映射；
// 接线层敏感性（任一输入变→bundleId 变）；TS 侧 canonical 序列化与
// scripts/platform/lib/runtime-assets.mjs 的 canonicalManifestJson 逐字节一致（双实现
// 单语义，测试锁死）；产物文件确定性（无时间戳、固定行序）。
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  releaseIdentityFromManifests, renderBundleIdentityFile, writeBundleIdentity,
  canonicalRuntimeManifestJson,
} from '../bundle-identity-build'

/** 注入 manifest v2 最小夹具（真实形状：baseline.treeOids + patches[].{name,sha256,channel,target}）。 */
function injectionFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    status: 'complete',
    baseline: { upstreamRoot: '/repo/vendor', treeOids: { 'hermes-studio': 's'.repeat(40), 'hermes-agent': 'a'.repeat(40), zcode: null } },
    patches: [
      { channel: 'hermes', target: 'hermes-studio', name: '001-a.patch', sha256: '1'.repeat(64), seriesIndex: 0, addedFiles: [], status: 'applied', reason: null },
      { channel: 'zcode', target: 'zcode', name: 'z-001.patch', sha256: '2'.repeat(64), seriesIndex: 0, addedFiles: [], status: 'applied', reason: null },
    ],
    runtimeDeploy: { precheck: 'complete', apply: 'complete' },
    ...over,
  }
}

function runtimeFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    assets: [
      { rel: 'runtime/pricing/models.yaml', sha256: '4'.repeat(64), bytes: 100 },
      { rel: 'semantica-bridge.py', sha256: '5'.repeat(64), bytes: 10 },
    ],
    ...over,
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

describe('releaseIdentityFromManifests（装配层）', () => {
  it('装配映射：baselines→vendorBaselines、patches 保 series 序、runtime/asset 摘要来自清单', () => {
    const inj = injectionFixture()
    const rt = runtimeFixture()
    const id = releaseIdentityFromManifests({ commit: 'c'.repeat(40), injectionManifest: inj, runtimeManifest: rt })
    expect(id.bundleId).toMatch(/^[0-9a-f]{64}$/)
    expect(id.input.commit).toBe('c'.repeat(40))
    expect(id.input.vendorBaselines).toEqual({ 'hermes-studio': 's'.repeat(40), 'hermes-agent': 'a'.repeat(40), zcode: null })
    expect(id.input.patchDigests).toEqual([
      { name: '001-a.patch', sha256: '1'.repeat(64) },
      { name: 'z-001.patch', sha256: '2'.repeat(64) },
    ])
    expect(id.input.runtimeManifestDigest).toBe(sha256(canonicalRuntimeManifestJson(rt as never)))
    expect(id.input.assetDigests).toEqual([
      { rel: 'runtime/pricing/models.yaml', sha256: '4'.repeat(64) },
      { rel: 'semantica-bridge.py', sha256: '5'.repeat(64) },
    ])
  })

  it('接线层敏感性：任一输入面变化→bundleId 变（补丁摘要/基线/资产/runtime 清单）', () => {
    const base = releaseIdentityFromManifests({ commit: 'c'.repeat(40), injectionManifest: injectionFixture(), runtimeManifest: runtimeFixture() })
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['补丁 sha 变', injectionFixture({
        patches: [
          { channel: 'hermes', target: 'hermes-studio', name: '001-a.patch', sha256: '9'.repeat(64), seriesIndex: 0, addedFiles: [], status: 'applied', reason: null },
          { channel: 'zcode', target: 'zcode', name: 'z-001.patch', sha256: '2'.repeat(64), seriesIndex: 0, addedFiles: [], status: 'applied', reason: null },
        ],
      }), runtimeFixture()],
      ['补丁数量变（尾部增量）', injectionFixture({
        patches: [
          ...((injectionFixture().patches) as unknown[]),
          { channel: 'hermes', target: 'hermes-studio', name: '003-c.patch', sha256: '7'.repeat(64), seriesIndex: 1, addedFiles: [], status: 'applied', reason: null },
        ],
      }), runtimeFixture()],
      ['vendor 基线变', injectionFixture({
        baseline: { upstreamRoot: '/repo/vendor', treeOids: { 'hermes-studio': 'x'.repeat(40), 'hermes-agent': 'a'.repeat(40), zcode: null } },
      }), runtimeFixture()],
      ['资产摘要变', injectionFixture(), runtimeFixture({
        assets: [
          { rel: 'runtime/pricing/models.yaml', sha256: '8'.repeat(64), bytes: 100 },
          { rel: 'semantica-bridge.py', sha256: '5'.repeat(64), bytes: 10 },
        ],
      })],
      ['runtime 清单内容变（schemaVersion/资产集合）', injectionFixture(), runtimeFixture({
        assets: [
          { rel: 'runtime/pricing/models.yaml', sha256: '4'.repeat(64), bytes: 100 },
          { rel: 'runtime/roster/squads.yaml', sha256: '6'.repeat(64), bytes: 3 },
          { rel: 'semantica-bridge.py', sha256: '5'.repeat(64), bytes: 10 },
        ],
      })],
    ]
    for (const [label, inj, rt] of cases) {
      const varied = releaseIdentityFromManifests({ commit: 'c'.repeat(40), injectionManifest: inj, runtimeManifest: rt })
      expect(varied.bundleId, label).not.toBe(base.bundleId)
    }
    // 同输入两次装配恒等
    expect(releaseIdentityFromManifests({ commit: 'c'.repeat(40), injectionManifest: injectionFixture(), runtimeManifest: runtimeFixture() }).bundleId)
      .toBe(base.bundleId)
  })
})

describe('canonical 序列化双实现单语义（TS 侧 vs scripts mjs 侧）', () => {
  it('与 runtime-assets.mjs canonicalManifestJson 逐字节一致（含乱序资产归一）', async () => {
    const { canonicalManifestJson } = await import('../../../../../scripts/platform/lib/runtime-assets.mjs')
    const rt = runtimeFixture({
      assets: [
        { rel: 'semantica-bridge.py', sha256: '5'.repeat(64), bytes: 10 },
        { rel: 'runtime/pricing/models.yaml', sha256: '4'.repeat(64), bytes: 100 },
      ],
    })
    expect(canonicalRuntimeManifestJson(rt as never)).toBe(canonicalManifestJson(rt as never))
  })
})

describe('产物文件（bundle-identity.txt）', () => {
  it('renderBundleIdentityFile：固定行序、携带 bundleId/commit/三基线/双摘要/计数、无时间戳', () => {
    const id = releaseIdentityFromManifests({ commit: 'c'.repeat(40), injectionManifest: injectionFixture(), runtimeManifest: runtimeFixture() })
    const text = renderBundleIdentityFile(id)
    expect(text).toContain(`bundleId: ${id.bundleId}`)
    expect(text).toContain(`commit: ${'c'.repeat(40)}`)
    expect(text).toContain(`vendorBaseline.hermes-studio: ${'s'.repeat(40)}`)
    expect(text).toContain('vendorBaseline.zcode: null')
    expect(text).toMatch(/patches: 2 sha256:[0-9a-f]{64}/)
    expect(text).toMatch(/runtimeManifest: sha256:[0-9a-f]{64} assets:2/)
    expect(text).toMatch(/assets: sha256:[0-9a-f]{64}/)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/) // 无时变因子
    // 同输入两次渲染逐字节一致
    expect(renderBundleIdentityFile(id)).toBe(text)
  })

  it('writeBundleIdentity：读两份清单落盘并回读 bundleId；commit 缺省取参数（不触 git）', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bundle-id-build-'))
    try {
      const injPath = join(tmp, '.overlay-injected.json')
      const rtPath = join(tmp, 'runtime-assets.json')
      const outPath = join(tmp, 'bundle-identity.txt')
      writeFileSync(injPath, JSON.stringify(injectionFixture()))
      writeFileSync(rtPath, JSON.stringify(runtimeFixture()))
      const written = writeBundleIdentity({ commit: 'd'.repeat(40), injectionManifestPath: injPath, runtimeManifestPath: rtPath, outFile: outPath })
      const text = readFileSync(outPath, 'utf8')
      expect(text).toContain(`bundleId: ${written.bundleId}`)
      expect(text).toContain(`commit: ${'d'.repeat(40)}`)
      // 坏输入（manifest 缺席/非法 JSON）向上抛，不写半份产物
      expect(() => writeBundleIdentity({ commit: 'e'.repeat(40), injectionManifestPath: join(tmp, 'nope.json'), runtimeManifestPath: rtPath, outFile: outPath })).toThrow()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
