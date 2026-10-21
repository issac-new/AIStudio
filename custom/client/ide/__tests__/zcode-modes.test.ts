// ZCode 模式目录客户端镜像守门（2026-10-18 锚定校正轮）：
// 上游锚=upstream/zcode v3.16.1 ZCODE_AGENT_MODE_OPTIONS（build/guarded/plan/yolo，
// edit 隐藏历史值）+ V4ComposerModeControls（Plan 勾选与权限档正交）。
// 断言面：目录形状 / 旧七档迁移 / 派生回写（服务端穿线词表兼容层）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ZCODE_PERMISSION_MODES, legacyToZcodeMode, toLegacyMode,
  readZcodeMode, writeZcodeMode, zcodeModeLabel,
} from '../utils/zcodeModes'

describe('zcodeModes（ZCode 模式目录镜像）', () => {
  beforeEach(() => { localStorage.clear() })

  it('目录=权限三档（build/guarded/yolo）+ Plan 独立项，词表与上游锚一致', () => {
    expect(ZCODE_PERMISSION_MODES.map(m => m.key)).toEqual(['build', 'guarded', 'yolo'])
    expect(ZCODE_PERMISSION_MODES.map(m => m.label)).toEqual(['改动前询问', '自主模式', '完全访问'])
  })

  it('旧七档迁移：readonly/plan→build+plan；dontAsk/auto→guarded；bypass→yolo；未知→build', () => {
    expect(legacyToZcodeMode('readonly')).toEqual({ mode: 'build', planEnabled: true })
    expect(legacyToZcodeMode('plan')).toEqual({ mode: 'build', planEnabled: true })
    expect(legacyToZcodeMode('acceptEdits')).toEqual({ mode: 'build', planEnabled: false })
    expect(legacyToZcodeMode('dontAsk')).toEqual({ mode: 'guarded', planEnabled: false })
    expect(legacyToZcodeMode('bypassPermissions')).toEqual({ mode: 'yolo', planEnabled: false })
    expect(legacyToZcodeMode('unknown-x')).toEqual({ mode: 'build', planEnabled: false })
  })

  it('派生回写：plan 优先；guarded→dontAsk；yolo→bypassPermissions；build→default', () => {
    expect(toLegacyMode({ mode: 'yolo', planEnabled: true })).toBe('plan')
    expect(toLegacyMode({ mode: 'guarded', planEnabled: false })).toBe('dontAsk')
    expect(toLegacyMode({ mode: 'yolo', planEnabled: false })).toBe('bypassPermissions')
    expect(toLegacyMode({ mode: 'build', planEnabled: false })).toBe('default')
  })

  it('存储往返：zcode 键 JSON 形态 + 旧键同步派生；无 zcode 键时走迁移', () => {
    writeZcodeMode('s1', { mode: 'guarded', planEnabled: false })
    expect(localStorage.getItem('ide-zcode-mode:s1')).toBe('{"mode":"guarded","planEnabled":false}')
    expect(localStorage.getItem('ide-permission-mode:s1')).toBe('dontAsk')
    expect(readZcodeMode('s1')).toEqual({ mode: 'guarded', planEnabled: false })
    // 坏 JSON 落迁移
    localStorage.setItem('ide-zcode-mode:s2', '{oops')
    localStorage.setItem('ide-permission-mode:s2', 'bypassPermissions')
    expect(readZcodeMode('s2')).toEqual({ mode: 'yolo', planEnabled: false })
    expect(zcodeModeLabel({ mode: 'build', planEnabled: false })).toBe('改动前询问')
    expect(zcodeModeLabel({ mode: 'yolo', planEnabled: false }, false)).toBe('Full access')
  })
})
