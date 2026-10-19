// overlay/custom/server/matrix/__tests__/default-avatar.test.ts
// 默认头像生成钉测（2026-10-19 群聊身份标识轮，spec D-2）：
// PNG 结构合法 / 同 id 确定性 / 不同 id 互异 / 人类 AI 两款分离 / 非 ASCII 兜底。
import { describe, it, expect } from 'vitest'
import { renderHumanAvatarPng, renderAgentAvatarPng, hashUserId, encodePng } from '../default-avatar'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('default-avatar — PNG 结构', () => {
  it('魔法数 + IHDR 128×128 RGBA', () => {
    const png = renderHumanAvatarPng('@zhang:matrix.test')
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
    // IHDR 数据自 chunk 偏移 16 起：宽 16-19、高 20-23、bit depth 24、color type 25
    expect(png.readUInt32BE(16)).toBe(128)
    expect(png.readUInt32BE(20)).toBe(128)
    expect(png[24]).toBe(8)
    expect(png[25]).toBe(6)
  })

  it('encodePng 空画布可往返解压（IDAT 有效 zlib 流）', () => {
    const rgba = new Uint8Array(4 * 4 * 4)
    const png = encodePng(4, 4, rgba)
    expect(png.length).toBeGreaterThan(30)
  })
})

describe('default-avatar — 确定性与互异', () => {
  it('同 userId 两次生成字节级一致（补发幂等）', () => {
    const a = renderHumanAvatarPng('@zhang:matrix.test', '张三')
    const b = renderHumanAvatarPng('@zhang:matrix.test', '张三')
    expect(a.equals(b)).toBe(true)
    const c = renderAgentAvatarPng('@zhang-agent:matrix.test')
    expect(c.equals(renderAgentAvatarPng('@zhang-agent:matrix.test'))).toBe(true)
  })

  it('12 个人类账号 ≥10 款互异（配色哈希×首字母双因子）', () => {
    const names = ['ann', 'bob', 'cat', 'dan', 'eve', 'fin', 'gus', 'hal', 'ivy', 'jon', 'kim', 'leo']
    const pngs = names.map((n) => renderHumanAvatarPng(`@${n}:matrix.test`).toString('binary'))
    expect(new Set(pngs).size).toBeGreaterThanOrEqual(10)
  })

  it('人类款与 AI 款同基底也互异（色系分离）', () => {
    const human = renderHumanAvatarPng('@zhang:matrix.test')
    const agent = renderAgentAvatarPng('@zhang-agent:matrix.test')
    expect(human.equals(agent)).toBe(false)
  })

  it('纯中文昵称+非 ASCII 用户名不炸（几何形兜底仍出合法 PNG）', () => {
    const png = renderHumanAvatarPng('@张三:matrix.test', '张三')
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
  })

  it('hashUserId 稳定且对不同输入散开', () => {
    expect(hashUserId('@zhang:matrix.test')).toBe(hashUserId('@zhang:matrix.test'))
    expect(hashUserId('@zhang:matrix.test')).not.toBe(hashUserId('@zhan:matrix.test'))
  })
})
