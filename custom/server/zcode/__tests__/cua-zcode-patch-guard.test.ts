// Computer Use 桌面级守门（zcode-patches 003/004，2026-09-29）。
// 断言面：series 登记 + 补丁内容锚点（粘贴通道/resolver fail-closed/词表路由/
// sun_path 短名/host 回落与 DISABLE 门）。应用性验证锚点：本轮隔离树
// git apply 双补丁 BOTH-APPLY-CLEAN（见 series 注释与记忆）；共享树 zcode
// 部署态注入随下次 npm run inject 全循环生效。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

function readPatch(name: string): string {
  const path = resolve(OVERLAY_ROOT, 'zcode-patches', name)
  expect(existsSync(path), `${name} 存在`).toBe(true)
  return readFileSync(path, 'utf8')
}

describe('CUA zcode 补丁守门（003/004）', () => {
  it('series 登记 003/004（受管 fork 链完整）', () => {
    const series = readFileSync(resolve(OVERLAY_ROOT, 'zcode-patches/series'), 'utf8')
    expect(series).toContain('003-zcode-cua-live.patch')
    expect(series).toContain('004-node-repl-cua-fallback.patch')
  })

  it('003：跨三端后端锚点（mac JXA+screencapture / win PowerShell SendInput / linux xdotool|ydotool|maim）', () => {
    const patch = readPatch('003-zcode-cua-live.patch')
    expect(patch).toContain('CGEventCreateMouseEvent')        // mac 输入合成
    expect(patch).toContain('screencapture')                  // mac 截屏
    expect(patch).toContain('SendInput')                      // win 输入
    expect(patch).toContain('CopyFromScreen')                 // win 截屏
    expect(patch).toContain('xdotool')                        // linux X11 输入
    expect(patch).toContain('ydotool')                        // linux Wayland 输入
    expect(patch).toContain('maim')                           // linux 截屏链
  })

  it('003：中文输入 IME 根治=剪贴板粘贴通道（备份→pbcopy→cmd+v→恢复）+ 剪贴板恢复', () => {
    const patch = readPatch('003-zcode-cua-live.patch')
    expect(patch).toContain('pbcopy')
    expect(patch).toContain('pbpaste')
    expect(patch).toContain('command down')                   // System Events keystroke v
    expect(patch).toContain('IME')                            // 设计注释：拦截根因
  })

  it('003：broker 词表路由显式拒（未知方法 action_unavailable，不静默成功）', () => {
    const patch = readPatch('003-zcode-cua-live.patch')
    expect(patch).toContain('unknown broker method')
    expect(patch).toContain('action_unavailable')
  })

  it('003：sun_path 104 字符限制治理（短文件名 + 超长退 /tmp——mac tmpdir 实锤坑）', () => {
    const patch = readPatch('003-zcode-cua-live.patch')
    expect(patch).toContain('sun_path')
    expect(patch).toContain('cua-${randomUUID().slice(0, 8)}.sock')
  })

  it('003：resolver fail-closed 门（权限未授予不注册 MCP 条目）+ DISABLE 总开关', () => {
    const patch = readPatch('003-zcode-cua-live.patch')
    expect(patch).toContain('accessibility !== "granted"')
    expect(patch).toContain('ZCODE_CUA_DISABLE')
  })

  it('003：SDK 方法面别名（官方 computer-use 插件 client 的方法名全接）', () => {
    const patch = readPatch('003-zcode-cua-live.patch')
    for (const m of ['set_value', 'paste', 'left_click_drag', 'stop_computer_control', 'select_text', 'perform_action']) {
      expect(patch).toContain(`name: "${m}"`)
    }
  })

  it('004：host 自包含回落 + ZCODE_CUA_DISABLE=1 保持 fail-closed（undefined→bridge 缺席）', () => {
    const patch = readPatch('004-node-repl-cua-fallback.patch')
    expect(patch).toContain('createComputerUseRuntime()')
    expect(patch).toContain('ZCODE_CUA_DISABLE === "1"')
    expect(patch).toContain('return undefined')
  })

  it('003：d.ts 零改动（API 兼容——补丁不触碰任何 .d.ts）', () => {
    const patch = readPatch('003-zcode-cua-live.patch')
    expect(patch).not.toMatch(/diff --git.*\.d\.ts/)
  })
})
