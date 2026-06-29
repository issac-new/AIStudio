import { describe, it, expect } from 'vitest'
import { isGatewayNotice, tagGatewayNotice } from '@/custom/chat/gateway-notice'

describe('isGatewayNotice', () => {
  it('命中: shutting down 变体', () => {
    expect(isGatewayNotice('⚠️ Gateway shutting down — Your current task will be interrupted.')).toBe(true)
  })
  it('命中: restarting 变体（含后续恢复提示）', () => {
    expect(isGatewayNotice('⚠️ Gateway restarting — Your current task will be interrupted. Send any message after restart and I\'ll try to resume where you left off.')).toBe(true)
  })
  it('命中: 前导/多余空白', () => {
    expect(isGatewayNotice('   ⚠️  Gateway shutting down — ...')).toBe(true)
  })
  it('不命中: 普通助手对话即便提到 Gateway', () => {
    expect(isGatewayNotice('⚠️ Gateway 这个词真有意思')).toBe(false)
  })
  it('不命中: 空字符串/非字符串', () => {
    expect(isGatewayNotice('')).toBe(false)
    expect(isGatewayNotice(undefined)).toBe(false)
    expect(isGatewayNotice(null)).toBe(false)
    expect(isGatewayNotice(123)).toBe(false)
  })
  it('不命中: 普通对话', () => {
    expect(isGatewayNotice('请帮我审查这段代码')).toBe(false)
  })
})

describe('tagGatewayNotice', () => {
  // tagGatewayNotice(content, currentSystemType):
  //   若 currentSystemType 已显式设置（非 undefined），原样返回（尊重已有语义，如 error/command）。
  //   否则命中告警返回 'gateway'，未命中返回 undefined。
  it('未显式 systemType 且命中 → gateway', () => {
    expect(tagGatewayNotice('⚠️ Gateway shutting down — x', undefined)).toBe('gateway')
  })
  it('未显式 systemType 且不命中 → undefined', () => {
    expect(tagGatewayNotice('普通消息', undefined)).toBeUndefined()
  })
  it('已显式 error → 保持 error，不被改写', () => {
    expect(tagGatewayNotice('⚠️ Gateway shutting down — x', 'error')).toBe('error')
  })
  it('已显式 command → 保持 command', () => {
    expect(tagGatewayNotice('⚠️ Gateway restarting — x', 'command')).toBe('command')
  })
})
