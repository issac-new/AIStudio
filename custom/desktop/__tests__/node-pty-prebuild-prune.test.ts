// 校验 after-pack-prune-node-pty.cjs 钩子的纯函数逻辑与命名约定。
//
// 背景:patch 041 曾静态排除 win32-*/linux-*/darwin-x64 node-pty prebuilds,
// 误排 Windows 包自身原生二进制导致终端打不开。patch 127 改用 afterPack 钩子
// 按构建目标(electronPlatformName + arch)裁剪,只保留目标平台 prebuilds。
// 此测试不依赖 inject 注入:钩子文件由 patch 127 注入到 upstream,可能未就绪时 skip。
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { createRequire } from 'module'

const overlayRoot = resolve(__dirname, '..', '..', '..')
const hookPath = resolve(
  overlayRoot,
  '..',
  'upstream',
  'hermes-studio',
  'packages',
  'desktop',
  'scripts',
  'after-pack-prune-node-pty.cjs',
)
const prebuildsDir = resolve(
  overlayRoot,
  '..',
  'upstream',
  'hermes-studio',
  'node_modules',
  'node-pty',
  'prebuilds',
)

const requireHook = () => {
  if (!existsSync(hookPath)) return null
  const req = createRequire(import.meta.url)
  return req(hookPath) as {
    computeKeepDir: (platform: string, arch: number) => string
    listPruneTargets: (dirs: string[], keep: string) => string[]
    ARCH_NAMES: Record<number, string>
  }
}

describe('after-pack-prune-node-pty (patch 127)', () => {
  const mod = requireHook()
  const maybeIt = mod ? it : it.skip

  describe('computeKeepDir', () => {
    maybeIt('maps win32 + x64(arch 1) -> win32-x64', () => {
      expect(mod!.computeKeepDir('win32', 1)).toBe('win32-x64')
    })

    maybeIt('maps darwin + arm64(arch 3) -> darwin-arm64', () => {
      expect(mod!.computeKeepDir('darwin', 3)).toBe('darwin-arm64')
    })

    maybeIt('maps linux + x64(arch 1) -> linux-x64', () => {
      expect(mod!.computeKeepDir('linux', 1)).toBe('linux-x64')
    })

    maybeIt('throws on unknown arch enum', () => {
      expect(() => mod!.computeKeepDir('win32', 99)).toThrow(/unknown arch/)
    })
  })

  describe('listPruneTargets', () => {
    maybeIt('returns all dirs except the keep dir', () => {
      const dirs = ['win32-x64', 'win32-arm64', 'darwin-arm64', 'darwin-x64', 'linux-x64']
      expect(mod!.listPruneTargets(dirs, 'win32-x64')).toEqual([
        'win32-arm64',
        'darwin-arm64',
        'darwin-x64',
        'linux-x64',
      ])
    })

    maybeIt('returns empty when only keep dir present', () => {
      expect(mod!.listPruneTargets(['win32-x64'], 'win32-x64')).toEqual([])
    })
  })

  // 命名约定校验:钩子计算的 keep 目录名必须在真实 prebuilds 目录中存在,
  // 否则钩子会保留一个不存在的目录、删掉所有真实目录(node-pty 仍会加载失败)。
  describe('prebuilds naming convention (real node_modules)', () => {
    it('prebuilds directory exists', () => {
      expect(existsSync(prebuildsDir)).toBe(true)
    })

    it('contains win32-x64 (Windows x64 target keep dir)', () => {
      expect(readdirSync(prebuildsDir)).toContain('win32-x64')
    })

    it('contains darwin-arm64 (mac arm64 target keep dir)', () => {
      expect(readdirSync(prebuildsDir)).toContain('darwin-arm64')
    })
  })
})
