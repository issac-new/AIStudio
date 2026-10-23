// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/identity-chat-at.test.ts
// @身份统一聊天（2026-10-23 五轮 D）守门：消息内 @<身份> 扇出到多身份
// （命中的发对应身份、未 @ 发当前选中、每身份独立 Bot Chat、from 标签区分发言人）。
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/custom/ia2/identity-chat', () => ({
  fetchIdentities: vi.fn(async () => [
    { kind: 'gateway', id: 'worker-coder', label: 'worker-coder', online: true },
    { kind: 'gateway', id: 'data-arch', label: 'data-arch', online: false },
    { kind: 'gateway', id: 'ops-sre', label: 'ops-sre', online: false },
  ]),
  sendToIdentity: vi.fn(async (profile: string) => ({
    ok: true, sessionId: `sid-${profile}`, queued: false, reply: `[${profile}] 收到`,
  })),
  fetchIdentityMessages: vi.fn(async () => ({ sessionId: 'sid-x', messages: [] })),
}))

import IdentityChatCanvas from '../components/IdentityChatCanvas.vue'
import { sendToIdentity } from '../identity-chat'

describe('IdentityChatCanvas — @身份扇出', () => {
  it('无 @ 时发当前选中身份；消息内 @a @b 扇出两身份且回复带 from 标签', async () => {
    const w = mount(IdentityChatCanvas, { props: { presetProfile: null }, attachTo: document.body })
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    // 默认选中在线身份 worker-coder；无 @ 消息 → 只发它
    ;(w.vm as unknown as { draft: string }).draft = '你好'
    await (w.vm as unknown as { send: () => Promise<void> }).send()
    await flushPromises()
    expect(sendToIdentity).toHaveBeenCalledWith('worker-coder', '你好')

    // @ 两个身份 → 扇出（含未 @ 的选中身份不参与）
    vi.mocked(sendToIdentity).mockClear()
    ;(w.vm as unknown as { draft: string }).draft = '排期确认 @data-arch @ops-sre'
    await (w.vm as unknown as { send: () => Promise<void> }).send()
    await flushPromises()
    const calls = vi.mocked(sendToIdentity).mock.calls.map(c => c[0])
    expect(calls).toEqual(['data-arch', 'ops-sre'])
    // 回复行带 from 身份标签
    const log = document.body.textContent ?? ''
    expect(log).toContain('[data-arch] 收到')
    expect(log).toContain('[ops-sre] 收到')
    w.unmount()
  })
})
