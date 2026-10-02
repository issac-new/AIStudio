// overlay/custom/client/settings-layers/__tests__/settings-layers.test.ts
// 设置分层基建守门（2026-10-02 吸收二期 #13 步一）：四层读写链/类型保真/脏值
// 容错/default 不可写/清层精确前缀。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readSetting, writeSetting, inspectSetting, clearLayer, adoptLegacySetting, type SettingsLayer } from '../index'

beforeEach(() => { localStorage.clear() })

describe('四层覆盖链', () => {
  it('未设全链返回 fallback（layer=default）', () => {
    const r = readSetting('ui.density', 'compact')
    expect(r).toEqual({ value: 'compact', layer: 'default' })
  })

  it('user 覆盖 default；workspace 覆盖 user；session 覆盖一切（注入 scoped 时）', () => {
    writeSetting('user', 'ui.density', 'cozy')
    expect(readSetting('ui.density', 'compact').value).toBe('cozy')
    writeSetting('workspace', 'ui.density', 'compact')
    expect(readSetting('ui.density', 'x', { workspaceId: 'w1' }).value).toBe('compact')
    writeSetting('session', 'ui.density', 'dense')
    expect(readSetting('ui.density', 'x', { workspaceId: 'w1', sessionId: 's1' }).value).toBe('dense')
    // 撤 session 后回落 workspace
    writeSetting('session', 'ui.density', null)
    expect(readSetting('ui.density', 'x', { workspaceId: 'w1', sessionId: 's1' }).value).toBe('compact')
  })

  it('类型保真：number/boolean 经 JSON 往返不串型', () => {
    writeSetting('user', 'ui.fontSize', 13)
    const r = readSetting('ui.fontSize', 12)
    expect(r.value).toBe(13)
    expect(typeof r.value).toBe('number')
    writeSetting('user', 'ui.compact', false)
    expect(readSetting('ui.compact', true).value).toBe(false)
  })

  it('脏值容错：非法 JSON 按未设跳过（回落下一层），不抛', () => {
    localStorage.setItem('sl:user:ui.density', '{broken')
    localStorage.setItem('sl:workspace:ui.density', '"cozy"')
    expect(readSetting('ui.density', 'compact', { workspaceId: 'w1' }).value).toBe('cozy')
  })

  it('类型不匹配（存 string 读 number 链）按未设处理', () => {
    localStorage.setItem('sl:user:ui.fontSize', '"big"')
    expect(readSetting('ui.fontSize', 12).value).toBe(12)
  })
})

describe('边界与清理', () => {
  it('default 层不可写（代码内默认，写即抛）', () => {
    expect(() => writeSetting('default' as SettingsLayer, 'k', 'v')).toThrow()
  })

  it('键前缀隔离：裸键/其他层不受 clearLayer 影响', () => {
    localStorage.setItem('ia2.flow.sortMode', 'alpha')  // 既有裸键
    writeSetting('user', 'ui.density', 'cozy')
    writeSetting('workspace', 'ui.density', 'cozy')
    clearLayer('user')
    expect(localStorage.getItem('ia2.flow.sortMode')).toBe('alpha')
    expect(localStorage.getItem('sl:user:ui.density')).toBeNull()
    expect(localStorage.getItem('sl:workspace:ui.density')).toBe('"cozy"')
  })

  it('inspectSetting 全层快照（重置为默认的展示面）', () => {
    writeSetting('user', 'ui.density', 'cozy')
    writeSetting('session', 'ui.density', 'dense')
    const snap = inspectSetting('ui.density')
    expect(snap.user).toBe('cozy')
    expect(snap.workspace).toBeUndefined()
    expect(snap.session).toBe('dense')
  })
})

describe('JSON 复合值与遗留收养（步二迁键面）', () => {
  it('数组/对象经层往返保真（ide_status_slots 形态）', () => {
    const slots = [{ kind: 'telemetry', on: false }, { kind: 'task', on: true }]
    writeSetting('user', 'ide.slots', slots)
    const r = readSetting('ide.slots', [] as typeof slots)
    expect(r.layer).toBe('user')
    expect(r.value).toEqual(slots)
  })

  it('收养裸字符串遗留键（sortMode=alpha 无引号）→包 JSON 入 user 层+删遗留', () => {
    localStorage.setItem('ia2.flow.sortMode', 'alpha')
    adoptLegacySetting('flow.sortMode', 'ia2.flow.sortMode')
    expect(localStorage.getItem('ia2.flow.sortMode')).toBeNull()
    expect(readSetting('flow.sortMode', 'recent').value).toBe('alpha')
  })

  it('收养 JSON 形态遗留键（ide_status_slots 数组）原样搬入', () => {
    localStorage.setItem('ide_status_slots', JSON.stringify([{ kind: 'x', on: false }]))
    adoptLegacySetting('ide.slots', 'ide_status_slots')
    expect(localStorage.getItem('ide_status_slots')).toBeNull()
    expect(readSetting('ide.slots', [] as Array<{ kind: string; on: boolean }>).value)
      .toEqual([{ kind: 'x', on: false }])
  })

  it('幂等：分层已设不再收养；遗留缺省空转', () => {
    writeSetting('user', 'flow.sortMode', 'unread')
    localStorage.setItem('ia2.flow.sortMode', 'alpha')
    adoptLegacySetting('flow.sortMode', 'ia2.flow.sortMode')
    expect(readSetting('flow.sortMode', 'recent').value).toBe('unread')
    expect(localStorage.getItem('ia2.flow.sortMode')).toBe('alpha')  // 未动
    adoptLegacySetting('no.legacy.key', 'whatever-absent')  // 空转不炸
  })
})
