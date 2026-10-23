// overlay/custom/client/ui/__tests__/mxid-display.test.ts
// 账号短显单一事实源守门：剥域名保其余、名字槽位再去 @、URL/裸串不误伤。
import { describe, expect, it } from 'vitest'
import { shortMxName, stripHomeserver } from '../mxid-display'

describe('stripHomeserver（id 槽位：保 @ 前缀，剥 :域名）', () => {
  it('常规 mxid 只剥域名', () => {
    expect(stripHomeserver('@zhang:matrix.test')).toBe('@zhang')
    expect(stripHomeserver('@wei')).toBe('@wei')
    expect(stripHomeserver('zhang:matrix.test')).toBe('zhang')
  })
  it('agent 复合 id（@user:dom/slug）剥域名保 /slug 尾段', () => {
    expect(stripHomeserver('@hu:matrix.test/team-x')).toBe('@hu/team-x')
  })
  it('房间 id（!room:dom）同样剥域名', () => {
    expect(stripHomeserver('!mNF:matrix.test')).toBe('!mNF')
  })
  it('域名可带端口', () => {
    expect(stripHomeserver('@a:matrix.test:8448')).toBe('@a')
  })
  it('非 mxid / 非域名形态原样返回（URL、时间、空串）', () => {
    expect(stripHomeserver('http://localhost:8649/x')).toBe('http://localhost:8649/x')
    expect(stripHomeserver('14:05')).toBe('14:05')
    expect(stripHomeserver('')).toBe('')
    expect(stripHomeserver(':matrix.test')).toBe(':matrix.test')
  })
})

describe('shortMxName（名字槽位：再去 @）', () => {
  it('mxid → 裸 localpart', () => {
    expect(shortMxName('@sim_pm_aipay:matrix.test')).toBe('sim_pm_aipay')
    expect(shortMxName('@admin:matrix.test')).toBe('admin')
    expect(shortMxName('@hu:matrix.test/team-x')).toBe('hu/team-x')
  })
  it('已是短名/裸串保持', () => {
    expect(shortMxName('@wei')).toBe('wei')
    expect(shortMxName('wei')).toBe('wei')
    expect(shortMxName('')).toBe('')
  })
})
