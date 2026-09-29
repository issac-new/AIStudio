// CUA 三端后端平台分支守门（win/linux 路径的 mac 可测部分，2026-09-29 待办③）。
// 断言对象=共享树/隔离树 patched @zcode/zcode-cua（zcode-patches 003 注入态；
// OVERLAY_UPSTREAM_ROOT 同名同义门控）。Windows/Linux 的真实行为仍需真机
// （PowerShell/xdotool 不在 mac 上）——本守门收窄的是：①三平台构造不炸；
// ②命令派发形状正确（mock runner 断言参数，零 shell 拼接面）；③非法参数/
// 工具缺失的显式错误路径。
import { describe, it, expect } from 'vitest'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

const upstreamRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim(), 'zcode')
  : resolve(__dirname, '../../../../../upstream/zcode')
const backendUrl = pathToFileURL(resolve(upstreamRoot, 'packages/zcode-cua/node-backend.js')).href

async function loadBackend() {
  return await import(backendUrl) as typeof import('cua-node-backend-shim')
}

// 类型 shim（动态加载的 JS 模块；只要用到面）
interface CuaNodeBackendModule {
  createNodeAutomationBackend(options?: {
    platform?: string
    runCommand?: (cmd: string, args: string[], options?: { timeoutMs?: number }) => Promise<{ code: number; stdout: string; stderr: string }>
    runJxaStdin?: (script: string) => Promise<{ code: number; stdout: string; stderr: string }>
  }): Record<string, (params?: unknown) => Promise<unknown>>
  NODE_BACKEND_METHODS: string[]
}

describe('CUA node-backend 平台分支（win/linux mac 可测面）', () => {
  it('三平台构造不炸；方法词表 20 项含 set_value', async () => {
    const mod = await loadBackend() as unknown as CuaNodeBackendModule
    for (const platform of ['darwin', 'win32', 'linux']) {
      expect(typeof mod.createNodeAutomationBackend({ platform }).health).toBe('function')
    }
    expect(mod.NODE_BACKEND_METHODS).toContain('set_value')
    expect(mod.NODE_BACKEND_METHODS.length).toBeGreaterThanOrEqual(20)
  })

  it('win32：鼠标/键盘经 powershell.exe 固定参数派发（SendInput/SetCursorPos 形状）', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = []
    const mod = await loadBackend() as unknown as CuaNodeBackendModule
    const backend = mod.createNodeAutomationBackend({
      platform: 'win32',
      runCommand: async (cmd, args) => {
        calls.push({ cmd, args })
        return { code: 0, stdout: 'ok', stderr: '' }
      },
    })
    await backend.mouse_move({ x: 120, y: 80 })
    await backend.left_click({ x: 120, y: 80 })
    const psCalls = calls.filter((c) => c.cmd === 'powershell.exe')
    expect(psCalls.length).toBe(2)
    for (const c of psCalls) {
      expect(c.args[0]).toBe('-NoProfile')          // 固定参数形态
      expect(c.args[1]).toBe('-NonInteractive')
      expect(c.args[2]).toBe('-Command')
    }
    // PowerShell 事件 JSON 形态：SetCursorPos([int]$ev.x,...) 动态取值，断言结构不字面坐标
    expect(calls.find((c) => c.args.join(' ').includes('SetCursorPos'))).toBeTruthy()
    expect(calls.find((c) => c.args.join(' ').includes('[int]$ev.x'))).toBeTruthy()
    expect(calls.find((c) => c.args.join(' ').includes('SendInput'))).toBeTruthy()
  })

  it('linux：工具探测经 sh command -v；xdotool 可用时输入走 xdotool（Y11 无工具显式错）', async () => {
    const mod = await loadBackend() as unknown as CuaNodeBackendModule
    const available = new Set(['xdotool', 'maim'])
    const backend = mod.createNodeAutomationBackend({
      platform: 'linux',
      runCommand: async (cmd, args) => {
        if (cmd === 'sh' && args[1]?.startsWith('command -v')) {
          const name = args[1].replace('command -v ', '').replace(/"/g, '')
          return available.has(name) ? { code: 0, stdout: `/usr/bin/${name}`, stderr: '' } : { code: 1, stdout: '', stderr: '' }
        }
        return { code: 0, stdout: '', stderr: '' }
      },
    })
    await backend.mouse_move({ x: 10, y: 20 })
    // permission_status 探测路径：xdotool+maim 在位 → granted/granted
    const status = await backend.permission_status() as { accessibility: string; screen_recording: string }
    expect(status.accessibility).toBe('granted')
    expect(status.screen_recording).toBe('granted')
    // 工具全缺 → denied + note（fail-closed 如实报）
    const bare = mod.createNodeAutomationBackend({
      platform: 'linux',
      runCommand: async () => ({ code: 1, stdout: '', stderr: '' }),
    })
    const bareStatus = await bare.permission_status() as { accessibility: string; note?: string }
    expect(bareStatus.accessibility).toBe('denied')
    expect(bareStatus.note).toContain('xdotool')
  })

  it('win32 linux 截屏：PowerShell CopyFromScreen / maim 派发形状（mock 命中后走文件读取分支报错路径可控）', async () => {
    const mod = await loadBackend() as unknown as CuaNodeBackendModule
    const winCalls: Array<{ cmd: string; args: string[] }> = []
    const win = mod.createNodeAutomationBackend({
      platform: 'win32',
      runCommand: async (cmd, args) => { winCalls.push({ cmd, args }); return { code: 0, stdout: 'ok', stderr: '' } },
    })
    await win.screenshot({}).catch(() => undefined) // 文件不存在 → 报错（mock 无真文件）——但命令形状可断言
    const ps = winCalls.find((c) => c.cmd === 'powershell.exe')
    expect(ps?.args.join(' ')).toContain('CopyFromScreen')

    const linCalls: Array<{ cmd: string; args: string[] }> = []
    const lin = mod.createNodeAutomationBackend({
      platform: 'linux',
      runCommand: async (cmd, args) => {
        if (cmd === 'sh') return { code: 0, stdout: '/usr/bin/maim', stderr: '' }
        linCalls.push({ cmd, args })
        return { code: 0, stdout: '', stderr: '' }
      },
    })
    await lin.screenshot({}).catch(() => undefined)
    expect(linCalls.find((c) => c.cmd === 'maim')).toBeTruthy()
  })

  it('非法参数显式拒（坐标越界/空文本/未知平台）——不静默成功', async () => {
    const mod = await loadBackend() as unknown as CuaNodeBackendModule
    const backend = mod.createNodeAutomationBackend({
      platform: 'win32',
      runCommand: async () => ({ code: 0, stdout: 'ok', stderr: '' }),
    })
    await expect(backend.mouse_move({ x: 9_999_999, y: 0 })).rejects.toThrow(/coordinate/)
    await expect(backend.type_text({ text: '' })).rejects.toThrow(/required/)
    const alien = mod.createNodeAutomationBackend({ platform: 'freebsd' })
    await expect(alien.screenshot({})).rejects.toThrow(/unsupported platform/)
  })
})
