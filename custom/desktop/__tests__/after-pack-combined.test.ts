// 守门测试:patch 127 + 267 的 after-pack-combined.cjs 钩子。
//
// 背景:patch 041 曾静态排除 win32-*/linux-*/darwin-x64 node-pty prebuilds,
// 误排 Windows 包自身原生二进制导致终端打不开。patch 127 改用 afterPack 钩子
// 按构建目标(electronPlatformName + arch)裁剪。旧版测试指向已不存在的
// after-pack-prune-node-pty.cjs(钩子文件后来并入 after-pack-combined.cjs),
// 纯函数断言全部静默 skip —— 本文件重写指向现行钩子并补 267 新增能力:
//   - sharp/@img 平台包裁剪(交叉打包时剔除宿主平台二进制)
//   - Linux spawn-helper 保留 + exec 位恢复(node-pty Unix 实现的硬依赖)
// 此测试不依赖 inject 注入:钩子文件由 patch 127/267 注入到 upstream,
// 可能未就绪时 skip(纯函数部分);集成部分用临时目录模拟 resources 布局。
import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from 'fs'
import { resolve } from 'path'
import { createRequire } from 'module'

const overlayRoot = resolve(__dirname, '..', '..', '..')
const hookPath = resolve(
  overlayRoot, '..', 'upstream', 'hermes-studio', 'packages', 'desktop', 'scripts', 'after-pack-combined.cjs',
)
const prebuildsDir = resolve(
  overlayRoot, '..', 'upstream', 'hermes-studio', 'node_modules', 'node-pty', 'prebuilds',
)

const requireHook = () => {
  if (!existsSync(hookPath)) return null
  const req = createRequire(import.meta.url)
  return req(hookPath) as {
    (context: unknown): Promise<void>
    computeKeepDir: (platform: string, arch: number) => string
    listPruneTargets: (dirs: string[], keep: string) => string[]
    archName: (arch: number | string) => string
    sharpKeepDirs: (platform: string, arch: number) => string[]
    listSharpPruneTargets: (dirs: string[], platform: string, arch: number) => string[]
    SHARP_KEEP_ALWAYS: Set<string>
  }
}

describe('after-pack-combined (patch 127/267)', () => {
  const mod = requireHook()
  const maybeIt = mod ? it : it.skip

  describe('computeKeepDir / listPruneTargets (node-pty prebuilds)', () => {
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
      expect(() => mod!.archName(99)).toThrow(/unknown arch/)
    })
    maybeIt('returns all dirs except the keep dir', () => {
      expect(mod!.listPruneTargets(['win32-x64', 'win32-arm64', 'darwin-arm64'], 'win32-x64'))
        .toEqual(['win32-arm64', 'darwin-arm64'])
    })
  })

  describe('sharp/@img 平台裁剪 (patch 267)', () => {
    maybeIt('linux-x64 保留 sharp-linux-x64 + sharp-libvips-linux-x64', () => {
      expect(mod!.sharpKeepDirs('linux', 1)).toEqual(['sharp-linux-x64', 'sharp-libvips-linux-x64'])
    })
    maybeIt('darwin-arm64 保留 darwin 对,剔除 darwin-x64', () => {
      const prunes = mod!.listSharpPruneTargets(
        ['sharp-darwin-arm64', 'sharp-darwin-x64', 'sharp-libvips-darwin-arm64', 'sharp-win32-x64', 'colour'],
        'darwin', 3,
      )
      expect(prunes).toEqual(['sharp-darwin-x64', 'sharp-win32-x64'])
    })
    maybeIt('colour / sharp-wasm32 平台无关,永远保留', () => {
      expect([...mod!.SHARP_KEEP_ALWAYS]).toEqual(expect.arrayContaining(['colour', 'sharp-wasm32']))
    })
  })

  describe('集成:linux 包的钩子行为(临时 resources 布局)', () => {
    maybeIt('裁掉非目标 prebuilds/@img 并恢复 spawn-helper 执行位', async () => {
      const tmp = mkdtempSync(resolve('/tmp', 'afterpack-'))
      try {
        const webui = resolve(tmp, 'resources', 'webui')
        const nodePty = resolve(webui, 'node_modules', 'node-pty')
        mkdirSync(resolve(nodePty, 'prebuilds', 'darwin-arm64'), { recursive: true })
        mkdirSync(resolve(nodePty, 'prebuilds', 'linux-x64'), { recursive: true })
        mkdirSync(resolve(nodePty, 'build', 'Release'), { recursive: true })
        const helper = resolve(nodePty, 'build', 'Release', 'spawn-helper')
        writeFileSync(helper, '#!/bin/sh\n')
        chmodSync(helper, 0o644)
        const img = resolve(webui, 'node_modules', '@img')
        for (const dir of ['colour', 'sharp-darwin-arm64', 'sharp-libvips-darwin-arm64', 'sharp-linux-x64']) {
          mkdirSync(resolve(img, dir), { recursive: true })
        }
        // verifyPackagedWebUi 要求的三个文件
        writeFileSync(resolve(webui, 'package.json'), '{}')
        mkdirSync(resolve(webui, 'bin'), { recursive: true })
        writeFileSync(resolve(webui, 'bin', 'hermes-web-ui.mjs'), '')
        mkdirSync(resolve(webui, 'dist', 'server'), { recursive: true })
        writeFileSync(resolve(webui, 'dist', 'server', 'index.js'), '')

        await mod!({
          electronPlatformName: 'linux',
          arch: 1,
          appOutDir: tmp,
          packager: { appInfo: { productFilename: 'SwarmStudio' } },
        })

        expect(readdirSync(resolve(nodePty, 'prebuilds'))).toEqual(['linux-x64'])
        expect(readdirSync(img).sort()).toEqual(['colour', 'sharp-linux-x64'])
        expect(existsSync(helper)).toBe(true)
        expect(statSync(helper).mode & 0o111).not.toBe(0)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
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
