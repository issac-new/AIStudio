// 守门测试:patch 268(desktop Linux 沙箱回退)的纯决策函数。
//
// 背景:麒麟/UOS 普遍关闭 unprivileged user namespaces,AppImage 挂载点无法
// 给 chrome-sandbox 置 SUID —— 两者都缺时 Chromium 启动即崩。entry.ts 在加载
// GUI 前探测并带 --no-sandbox 重启一次。此处只测决策表,probe 的 /proc 读取
// 在 macOS 测试机上仅验证"不抛异常"。
//
// 被测文件是上游源码,经统一解析序定位(env → 仓内 vendor → 旧兄弟 upstream,
// custom/test/upstream-root 单一事实源):此前静态 import 硬编码兄弟 ../upstream,
// CI 单检出上不存在即整文件红;vendor 注入态同路径存在(patch 268 注入)。
// 未注入树上显式 skip(与 after-pack-combined 同款纪律)。
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { describe, it, expect, afterEach } from 'vitest'
import { upstreamPath } from '../../test/upstream-root'

const sandboxModulePath = upstreamPath('hermes-studio', 'packages', 'desktop', 'src', 'main', 'linux-sandbox.ts')
type LinuxSandboxModule = typeof import('../../../../upstream/hermes-studio/packages/desktop/src/main/linux-sandbox')
const mod: LinuxSandboxModule | null = existsSync(sandboxModulePath)
  ? await import(pathToFileURL(sandboxModulePath).href) as LinuxSandboxModule
  : null
const { shouldRelaunchWithoutSandbox, probeLinuxSandbox } = mod ?? ({} as LinuxSandboxModule)
const maybeIt = mod ? it : it.skip

const originalPlatform = process.platform
function stubPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}
afterEach(() => stubPlatform(originalPlatform))

const base = { packaged: true, hasNoSandboxFlag: false, isRoot: false }

describe('shouldRelaunchWithoutSandbox (patch 268)', () => {
  maybeIt('麒麟形态:无 SUID helper + userns 被禁 → 需要重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox(
      { chromeSandboxSetuid: false, maxUserNamespaces: 0, unprivilegedUsernsCloneEnabled: false },
      base,
    )).toBe(true)
  })

  maybeIt('AppImage 形态:无 SUID helper + 无 clone sysctl 但 userns 配额>0 → 可用 userns,不重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox(
      { chromeSandboxSetuid: false, maxUserNamespaces: 15000 },
      base,
    )).toBe(false)
  })

  maybeIt('deb 形态:SUID chrome-sandbox 就位 → 不重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox(
      { chromeSandboxSetuid: true, maxUserNamespaces: 0, unprivilegedUsernsCloneEnabled: false },
      base,
    )).toBe(false)
  })

  maybeIt('已带 --no-sandbox / root / 非打包 / 非 Linux → 不重启(防循环)', () => {
    stubPlatform('linux')
    const probe = { chromeSandboxSetuid: false, maxUserNamespaces: 0 } as const
    expect(shouldRelaunchWithoutSandbox(probe, { ...base, hasNoSandboxFlag: true })).toBe(false)
    expect(shouldRelaunchWithoutSandbox(probe, { ...base, isRoot: true })).toBe(false)
    expect(shouldRelaunchWithoutSandbox(probe, { ...base, packaged: false })).toBe(false)
    stubPlatform('darwin')
    expect(shouldRelaunchWithoutSandbox(probe, base)).toBe(false)
  })

  maybeIt('userns 配额读不到(/proc 缺失)且无 SUID → 保守重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox({ chromeSandboxSetuid: false }, base)).toBe(true)
  })
})

describe('probeLinuxSandbox', () => {
  maybeIt('在任意机器上探测都不抛异常且返回布尔/可选数值', () => {
    const probe = probeLinuxSandbox('/nonexistent/exec/path')
    expect(typeof probe.chromeSandboxSetuid).toBe('boolean')
    expect(probe.maxUserNamespaces === undefined || typeof probe.maxUserNamespaces === 'number').toBe(true)
  })
})
