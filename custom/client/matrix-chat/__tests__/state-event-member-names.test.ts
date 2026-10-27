// @vitest-environment jsdom
// 状态事件成员文案守门（2026-10-27 用户实报：「被邀请/加入了」不显示账号名）：
//   ① 词条带占位符——zh/en 的 stateInvited/stateJoined 等 member 族词条必须含
//      {target}/{sender}/{user}（占位符缺失=插值被 vue-i18n 静默丢弃=用户看到的裸文案）；
//   ② formatStateEvent 端到端：invite 产出「A 邀请了 B」、join 产出「B 加入了」。
// 词条在 vendor locale（patch 注入），本测试读注入态文件——补丁回退态跑此测试
// 会红（预期：先红后绿的守门面）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createI18n } from 'vue-i18n'
import { formatStateEvent } from '../utils/formatStateEvent'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
// 注入态 vendor 树（与 vitest alias 的 vendor 根一致；locale 为 patch 473/701 注入产物）
const VENDOR_LOCALE_ZH = resolve(OVERLAY_ROOT, 'vendor/hermes-studio/packages/client/src/i18n/locales/zh.ts')
const VENDOR_LOCALE_EN = resolve(OVERLAY_ROOT, 'vendor/hermes-studio/packages/client/src/i18n/locales/en.ts')

function extractMatrixChatDict(path: string): Record<string, string> {
  const src = readFileSync(path, 'utf8')
  // matrixChat 有两处：770 行附近是 nav 字符串值，6588 行附近才是词条对象——
  // 从最后一次出现处起提取（对象形态）。
  const start = src.lastIndexOf('matrixChat:')
  if (start < 0) throw new Error(`matrixChat 段未找到: ${path}`)
  const bodyStart = src.indexOf('{', start)
  let depth = 0
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        const body = src.slice(bodyStart + 1, i)
        const out: Record<string, string> = {}
        for (const m of body.matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)) out[m[1]] = m[2]
        return out
      }
    }
  }
  throw new Error('matrixChat 段未闭合')
}

describe('状态事件成员词条占位符守门', () => {
  it.each([
    ['zh', VENDOR_LOCALE_ZH],
    ['en', VENDOR_LOCALE_EN],
  ])('%s 词条：member 族必须带占位符（缺=插值静默丢弃）', (_lang, path) => {
    const dict = extractMatrixChatDict(path)
    // invite/ban/kick/withdraw/unban 是三方动作：必须点名 target（sender 可选但鼓励）
    expect(dict.stateInvited, 'stateInvited').toMatch(/\{target\}/)
    expect(dict.stateBanned, 'stateBanned').toMatch(/\{target\}/)
    expect(dict.stateKicked, 'stateKicked').toMatch(/\{target\}/)
    expect(dict.stateWithdrewInvite, 'stateWithdrewInvite').toMatch(/\{target\}/)
    expect(dict.stateUnbanned, 'stateUnbanned').toMatch(/\{target\}/)
    // join/left/reject 是自身动作：必须带 {user}
    expect(dict.stateJoined, 'stateJoined').toMatch(/\{user\}/)
    expect(dict.stateLeft, 'stateLeft').toMatch(/\{user\}/)
    expect(dict.stateRejectedInvite, 'stateRejectedInvite').toMatch(/\{user\}/)
  })
})

describe('formatStateEvent 成员事件端到端', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'zh',
    messages: { zh: { matrixChat: {
      stateInvited: '{sender} 邀请了 {target}',
      stateJoined: '{user} 加入了',
      stateBanned: '{sender} 封禁了 {target}{reason}',
      stateReason: '（原因：{reason}）',
    } } },
  })
  const t = i18n.global.t.bind(i18n.global)
  const names = (u: string) => u.replace('@', '').split(':')[0]

  function memberEvent(membership: string, prev: string | undefined, sender: string, target: string) {
    return {
      getType: () => 'm.room.member',
      getSender: () => sender,
      getStateKey: () => target,
      getContent: () => ({ membership }),
      getPrevContent: () => (prev ? { membership: prev } : {}),
    } as never
  }

  it('invite：产出「fanfan 邀请了 chen」——名字在场', () => {
    const text = formatStateEvent(
      memberEvent('invite', undefined, '@fanfan:m', '@chen:m'), t, names)
    expect(text).toContain('fanfan')
    expect(text).toContain('chen')
    expect(text).toBe('fanfan 邀请了 chen')
  })

  it('join：产出「chen 加入了」——名字在场', () => {
    const text = formatStateEvent(
      memberEvent('join', undefined, '@chen:m', '@chen:m'), t, names)
    expect(text).toBe('chen 加入了')
  })
})
