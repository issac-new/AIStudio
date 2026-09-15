// 守门测试:patch 268(desktop Linux 沙箱回退)的纯决策函数。
//
// 背景:麒麟/UOS 普遍关闭 unprivileged user namespaces,AppImage 挂载点无法
// 给 chrome-sandbox 置 SUID —— 两者都缺时 Chromium 启动即崩。entry.ts 在加载
// GUI 前探测并带 --no-sandbox 重启一次。此处只测决策表,probe 的 /proc 读取
// 在 macOS 测试机上仅验证"不抛异常"。
import { describe, it, expect, afterEach } from 'vitest'
import { shouldRelaunchWithoutSandbox, probeLinuxSandbox } from '../../../../upstream/hermes-studio/packages/desktop/src/main/linux-sandbox'

const originalPlatform = process.platform
function stubPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}
afterEach(() => stubPlatform(originalPlatform))

const base = { packaged: true, hasNoSandboxFlag: false, isRoot: false }

describe('shouldRelaunchWithoutSandbox (patch 268)', () => {
  it('麒麟形态:无 SUID helper + userns 被禁 → 需要重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox(
      { chromeSandboxSetuid: false, maxUserNamespaces: 0, unprivilegedUsernsCloneEnabled: false },
      base,
    )).toBe(true)
  })

  it('AppImage 形态:无 SUID helper + 无 clone sysctl 但 userns 配额>0 → 可用 userns,不重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox(
      { chromeSandboxSetuid: false, maxUserNamespaces: 15000 },
      base,
    )).toBe(false)
  })

  it('deb 形态:SUID chrome-sandbox 就位 → 不重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox(
      { chromeSandboxSetuid: true, maxUserNamespaces: 0, unprivilegedUsernsCloneEnabled: false },
      base,
    )).toBe(false)
  })

  it('已带 --no-sandbox / root / 非打包 / 非 Linux → 不重启(防循环)', () => {
    stubPlatform('linux')
    const probe = { chromeSandboxSetuid: false, maxUserNamespaces: 0 } as const
    expect(shouldRelaunchWithoutSandbox(probe, { ...base, hasNoSandboxFlag: true })).toBe(false)
    expect(shouldRelaunchWithoutSandbox(probe, { ...base, isRoot: true })).toBe(false)
    expect(shouldRelaunchWithoutSandbox(probe, { ...base, packaged: false })).toBe(false)
    stubPlatform('darwin')
    expect(shouldRelaunchWithoutSandbox(probe, base)).toBe(false)
  })

  it('userns 配额读不到(/proc 缺失)且无 SUID → 保守重启', () => {
    stubPlatform('linux')
    expect(shouldRelaunchWithoutSandbox({ chromeSandboxSetuid: false }, base)).toBe(true)
  })
})

describe('probeLinuxSandbox', () => {
  it('在任意机器上探测都不抛异常且返回布尔/可选数值', () => {
    const probe = probeLinuxSandbox('/nonexistent/exec/path')
    expect(typeof probe.chromeSandboxSetuid).toBe('boolean')
    expect(probe.maxUserNamespaces === undefined || typeof probe.maxUserNamespaces === 'number').toBe(true)
  })
})
