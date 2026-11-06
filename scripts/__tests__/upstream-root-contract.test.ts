// 上游根解析收敛守门（2026-11-06 复盘 P0-3）。
// 事故形态：build-dmg.mjs 缺省只回落兄弟 upstream/，单仓检出没有该兄弟目录，
// 不设 OVERLAY_UPSTREAM_ROOT 就打到不存在的树（与 RELEASE-MANIFEST 要求矛盾）。
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
type Roots = { root: string; source: string; studio: string; agent: string; zcode: string }
const { resolveUpstreamRoots } = await import('../inject.mjs') as {
  resolveUpstreamRoots: (root: string, env?: string) => Roots
}

describe('上游根解析单一事实源', () => {
  it('env ＞ 仓内 vendor ＞ 旧兄弟 upstream，且返回四棵树明确路径', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'upstream-roots-'))
    try {
      const vendor = join(tmp, 'vendor')
      mkdirSync(join(vendor, 'hermes-studio'), { recursive: true })
      const byVendor = resolveUpstreamRoots(tmp, '')
      expect(byVendor.source).toBe('vendor')
      expect(byVendor.studio).toBe(join(vendor, 'hermes-studio'))
      expect(byVendor.agent).toBe(join(vendor, 'hermes-agent'))
      expect(byVendor.zcode).toBe(join(vendor, 'zcode'))

      const isolated = join(tmp, 'isolated')
      mkdirSync(isolated, { recursive: true })
      const byEnv = resolveUpstreamRoots(tmp, isolated)
      expect(byEnv.source).toBe('env')
      // env 分支经 realpathOrSelf：macOS 上 /var 是 /private/var 的软链。
      expect(byEnv.studio).toBe(join(realpathSync(isolated), 'hermes-studio'))

      const noVendor = join(tmp, 'no-vendor')
      mkdirSync(noVendor, { recursive: true })
      const byLegacy = resolveUpstreamRoots(noVendor, '')
      expect(byLegacy.source).toBe('legacy')
      expect(byLegacy.root).toContain('upstream')
      expect(byLegacy.studio).toContain(join('upstream', 'hermes-studio'))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('四个消费者复用共享函数，且不再内联 vendor 判定', () => {
    const consumers = [
      'scripts/build-dmg.mjs',
      'scripts/build.mjs',
      'scripts/serve-server.mjs',
      'scripts/ensure-injected.mjs',
    ]
    for (const file of consumers) {
      const text = readFileSync(join(ROOT, file), 'utf8')
      expect(text, `${file} 未复用 resolveUpstreamRoots`).toContain('resolveUpstreamRoots')
      expect(text, `${file} 仍有内联 vendor 解析副本`).not.toContain("existsSync(resolve(overlayRoot, 'vendor', 'hermes-studio'))")
    }
    const dmg = readFileSync(join(ROOT, 'scripts/build-dmg.mjs'), 'utf8')
    expect(dmg, 'build-dmg 仍回落不存在的兄弟 upstream').not.toContain("resolve(ncwkRoot, 'upstream')")
  })

  it('发布清单文案与缺省命中 vendor 的行为一致', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'RELEASE-MANIFEST.json'), 'utf8'))
    expect(String(manifest.modules.cockpit.buildCommand)).toContain('缺省解析仓内 vendor/')
  })
})
