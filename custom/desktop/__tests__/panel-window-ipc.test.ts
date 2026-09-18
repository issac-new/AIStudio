// overlay/custom/desktop/__tests__/panel-window-ipc.test.ts
// 守门：窗口管理桌面 IPC（patch 302/303/304 守门）——主进程 openPanelWindow
// （window-kind=panel + 路由白名单 + 可信发送者）、preload 暴露、bridge 接口。
// 断言对象是注入态上游文件，patch 丢失/漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 2 级到 overlay 根，ncwk 根再进 upstream/hermes-studio
const DESKTOP_MAIN = '../../../../upstream/hermes-studio/packages/desktop/src/main/index.ts'
const DESKTOP_PRELOAD = '../../../../upstream/hermes-studio/packages/desktop/src/preload/index.ts'
const CLIENT_BRIDGE = '../../../../upstream/hermes-studio/packages/client/src/utils/desktop-bridge.ts'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, rel), 'utf8')
}

describe('面板独立窗口 IPC（patch 302/303/304 守门）', () => {
  const main = readUpstream(DESKTOP_MAIN)
  const preload = readUpstream(DESKTOP_PRELOAD)
  const bridge = readUpstream(CLIENT_BRIDGE)

  it('主进程：openPanelWindow + panelWindows 去重表 + window-kind=panel', () => {
    expect(main).toContain('async function openPanelWindow(')
    expect(main).toContain('const panelWindows = new Map<string, BrowserWindow>()')
    expect(main).toContain("'--hermes-window-kind=panel'")
    // 去重聚焦：同路径已开则 restore/show/focus
    expect(main).toMatch(/panelWindows\.get\(routePath\)/)
  })

  it('主进程：路由白名单校验（/ 开头、hash 路由字符集、拒绝协议注入）', () => {
    expect(main).toContain('function normalizePanelRoutePath(')
    expect(main).toMatch(/startsWith\('\/'\)/)
    expect(main).toMatch(/\^\\\/\[A-Za-z0-9/)
  })

  it('主进程：IPC 通道限可信发送者（panel 窗同权）', () => {
    expect(main).toContain("ipcMain.handle('hermes-desktop:open-panel-window'")
    expect(main).toContain('Panel windows can only be opened from a Hermes desktop window')
    expect(main).toMatch(/\.\.\.panelWindows\.values\(\)/)
  })

  it('preload：openPanelWindow 暴露（routePath + 尺寸透传）', () => {
    expect(preload).toContain('openPanelWindow: (routePath: string, size?: { width?: number; height?: number })')
    expect(preload).toContain("ipcRenderer.invoke('hermes-desktop:open-panel-window'")
  })

  it('bridge 接口：openPanelWindow 可选方法 + windowKind 加 panel', () => {
    expect(bridge).toMatch(/openPanelWindow\?: \(routePath: string/)
    expect(bridge).toContain("'main' | 'pet' | 'chat' | 'panel'")
  })
})
