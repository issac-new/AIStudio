// overlay/custom/server/__tests__/announcement-filter.test.ts
// 版本感知公告过滤守门（2026-09-22 实锤：0.7.23 机器弹「请更新至0.7.20」）。
import { describe, it, expect } from 'vitest'
import {
  referencedVersions, compareSemver, parseSemver,
  isStaleAnnouncement, filterStaleAnnouncementPayload,
} from '../studio/announcement-filter'

describe('announcement-filter 版本感知过滤', () => {
  it('referencedVersions 提取 x.y.z（多处出现全收）', () => {
    expect(referencedVersions('0.7.20新增DeepSeek Harness Agent，如需使用，请更新至0.7.20'))
      .toEqual([[0, 7, 20], [0, 7, 20]])
    expect(referencedVersions('系统维护通知')).toEqual([])
  })

  it('compareSemver 元组比较（0.7.20 > 0.7.9，非字符串序）', () => {
    expect(compareSemver([0, 7, 20], [0, 7, 9])).toBe(1)
    expect(compareSemver([0, 7, 9], [0, 7, 20])).toBe(-1)
    expect(compareSemver([0, 7, 20], [0, 7, 20])).toBe(0)
    expect(compareSemver([1, 0, 0], [0, 99, 99])).toBe(1)
  })

  it('parseSemver 严格解析（非法 → null）', () => {
    expect(parseSemver('0.7.23')).toEqual([0, 7, 23])
    expect(parseSemver('v0.7.23')).toBeNull()
    expect(parseSemver('0.7')).toBeNull()
    expect(parseSemver('')).toBeNull()
  })

  it('引用版本全部 ≤ 本机 → 过期（0.7.20 公告 @ 0.7.23 实锤）', () => {
    const item = { title: '版本通知', content: '0.7.20新增DeepSeek Harness Agent，如需使用，请更新至0.7.20' }
    expect(isStaleAnnouncement(item, '0.7.23')).toBe(true)
    expect(isStaleAnnouncement(item, '0.7.20')).toBe(true)
  })

  it('任一引用版本 > 本机 → 保留（确有新版可升）', () => {
    const item = { title: '版本通知', content: '0.8.0新增工作流，请更新至0.8.0' }
    expect(isStaleAnnouncement(item, '0.7.23')).toBe(false)
  })

  it('依赖产品版本不参与判定（run7 实锤：hermes 0.21.5 曾让 0.7.25 过期公告在 0.7.26 放行）', () => {
    const item = {
      title: '版本通知',
      content: '0.7.25已更新，加入jev、cursor，修复更新到最新hermes 0.21.5 无法使用的问题，修复更新到dsh 0.17 无法使用的问题',
    }
    // 主体版本只有 0.7.25（≤0.7.26）→ 过期；hermes 0.21.5 是依赖版本不抬刀
    expect(isStaleAnnouncement(item, '0.7.26')).toBe(true)
    // 主体版本 0.7.27 > 0.7.26 → 保留（确有新版），即便正文同样提到 hermes 0.21.5
    expect(isStaleAnnouncement({ title: '版本通知', content: '0.7.27已发布，适配hermes 0.21.5' }, '0.7.26')).toBe(false)
    // 正文只有依赖版本、无 studio 主体版本 → 保留（不误杀兼容性公告）
    expect(isStaleAnnouncement({ title: '兼容性公告', content: '已适配hermes 0.21.5' }, '0.7.26')).toBe(false)
  })

  it('无版本号 → 保留（维护/活动公告不误杀）', () => {
    expect(isStaleAnnouncement({ title: '维护通知', content: '今晚 24:00 停机维护' }, '0.7.23')).toBe(false)
  })

  it('本机版本非法 → 保留（fail-open 不影响厂商通道）', () => {
    const item = { title: '版本通知', content: '0.7.20新增，请更新至0.7.20' }
    expect(isStaleAnnouncement(item, '')).toBe(false)
    expect(isStaleAnnouncement(item, 'dev')).toBe(false)
  })

  it('payload 过滤：只动 list，其它字段原样；实锤报文整条滤掉', () => {
    const payload = {
      ok: true, platform: 'desktop', locale: 'zh-CN',
      list: [
        { id: 9, title: '版本通知', content: '0.7.20新增DeepSeek Harness Agent，如需使用，请更新至0.7.20', updateTime: 1789215397 },
        { id: 10, title: '维护通知', content: '今晚停机维护', updateTime: 1789215398 },
      ],
      serverTime: 1790063558,
    }
    const out = filterStaleAnnouncementPayload(payload, '0.7.23') as typeof payload
    expect(out.list.map((i) => i.id)).toEqual([10])
    expect(out.ok).toBe(true)
    expect(out.serverTime).toBe(1790063558)
    // 本机版本低于公告 → 两条都保留
    const kept = filterStaleAnnouncementPayload(payload, '0.7.0') as typeof payload
    expect(kept.list).toHaveLength(2)
    // list 非数组 / 非对象原样返回
    expect(filterStaleAnnouncementPayload({ ok: true }, '0.7.23')).toEqual({ ok: true })
    expect(filterStaleAnnouncementPayload(null, '0.7.23')).toBeNull()
  })
})
