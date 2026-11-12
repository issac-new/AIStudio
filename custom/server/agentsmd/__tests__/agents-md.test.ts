// AGENTS.md 域守门（/init 模板/32KB 告警/防抖 watch）。
import { describe, it, expect } from 'vitest'
import { checkSize, initTemplate, shouldEmit, AGENTS_MD_WARN_BYTES } from '../agents-md'

describe('checkSize（32KB 告警）', () => {
  it('超限告警+建议文案；未超无 advice', () => {
    const big = checkSize('x'.repeat(AGENTS_MD_WARN_BYTES + 1))
    expect(big.warn).toBe(true)
    expect(big.advice).toContain('裁剪')
    const ok = checkSize('short')
    expect(ok.warn).toBe(false)
    expect(ok.advice).toBeUndefined()
    expect(ok.bytes).toBe(5)
  })
  it('UTF-8 字节计量（中文 3 字节）', () => {
    expect(checkSize('中').bytes).toBe(3)
  })
})

describe('initTemplate（/init 四段骨架）', () => {
  it('含目标/构建/约定/红线四段', () => {
    const t = initTemplate('demo')
    expect(t).toContain('# demo')
    for (const sec of ['## 目标', '## 构建与验证', '## 约定', '## 红线']) expect(t).toContain(sec)
  })
})

describe('shouldEmit（防抖 watch）', () => {
  it('窗口内不放行；窗口边界及以上放行', () => {
    expect(shouldEmit(1000, 1200, 300)).toBe(false)
    expect(shouldEmit(1000, 1300, 300)).toBe(true)
    expect(shouldEmit(1000, 1301, 300)).toBe(true)
  })
})
