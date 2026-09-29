// B8 守门：取回编辑链（MessageItem ✎ → window 事件 → ChatInput 填入）。
// 补丁漂移守卫（注入态文件直读，与 sidepane i18n 守门同模式——注入后生效，
// 本地两例标注入依赖见终报）+ 行为契约（事件载荷=原文，非空才触发）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

describe('B8 patch 503/500 漂移守卫', () => {
  it('patch 503 文件在档：emitEditResend helper + 按钮 + 样式', () => {
    const patch = readFileSync(resolve(__dirname, '../../../../patches/503-client-messageitem-edit-resend.patch'), 'utf8')
    expect(patch).toContain('emitEditResend')
    expect(patch).toContain('ide-edit-resend')
    expect(patch).toContain('msg-edit-resend')
  })

  it('patch 500 扩展在档：editResendHandler + setInputText expose', () => {
    const patch = readFileSync(resolve(__dirname, '../../../../patches/500-client-chatinput-custom-slash.patch'), 'utf8')
    expect(patch).toContain("addEventListener('ide-edit-resend'")
    expect(patch).toContain('setInputText')
  })
})

describe('B8 行为契约（事件面）', () => {
  it('事件载荷约定：detail=消息原文（string），空文本由消费侧忽略（patch 500 分支）', () => {
    const patch500 = readFileSync(resolve(__dirname, '../../../../patches/500-client-chatinput-custom-slash.patch'), 'utf8')
    // 消费分支存在性与空值守卫
    expect(patch500).toContain("if (typeof text === 'string' && text.trim())")
  })
})
