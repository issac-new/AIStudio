// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/runtime-caps.test.ts
// 守门：吸收批 9（#7/#17/#10 剩余 fork 直通）——runtime-caps 文本解析纯函数 +
// History 浏览器 fork 剪贴板通道。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseCredentials, parseCronRuns } from '../api/runtime-caps'

const CRED_SAMPLE = `alibaba (1 credentials):
  #1  DASHSCOPE_API_KEY    api_key id=60cae9 priority=0 env:DASHSCOPE_API_KEY auth failed invalid_api_key (401) (re-auth may be required) ←

alibaba-cloud-cn (1 credentials):
  #1  DASHSCOPE_API_KEY    api_key id=bb7287 priority=0 env:DASHSCOPE_API_KEY ←

cc-switch (3 credentials):
  #1  KEY_A    api_key id=111111 priority=0
  #2  KEY_B    api_key id=222222 priority=1 ←
  #3  KEY_C    api_key id=333333 priority=2
`

describe('runtime-caps 解析（hermes CLI 文本协议）', () => {
  it('凭证池：provider 分节解析+失败态标记', () => {
    const rows = parseCredentials(CRED_SAMPLE)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ provider: 'alibaba', count: 1, failed: true })
    expect(rows[0]!.failureDetail).toContain('invalid_api_key')
    expect(rows[1]).toMatchObject({ provider: 'alibaba-cloud-cn', failed: false })
    expect(rows[2]).toMatchObject({ provider: 'cc-switch', count: 3, failed: false })
  })

  it('凭证池：空输入回空数组', () => {
    expect(parseCredentials('')).toEqual([])
  })

  it('cron 运行史：行解析（id 截断/状态/时间戳）', () => {
    const raw = [
      'c59f1c8b1730422c88074eccaf681813  completed  job=632eb7704a11  source=builtin  2026-10-01T21:52:01.615820+08:00',
      'a0de60bf391b465fa1896d8a28872cbf  failed  job=4c8d086ceeae  source=webhook  2026-10-01T21:50:00.933924+08:00',
    ].join('\n')
    const rows = parseCronRuns(raw)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ runId: 'c59f1c8b', status: 'completed', job: '632eb770', source: 'builtin' })
    expect(rows[1]!.status).toBe('failed')
  })

  it('cron 运行史：噪声行不混入', () => {
    const raw = 'header junk\nnot a run line\nc59f1c8b1730422c88074eccaf681813  completed  job=j1  source=builtin  2026-10-01T00:00:00+08:00'
    expect(parseCronRuns(raw)).toHaveLength(1)
  })
})

// ── History fork 直通（#10 剩余）──
const setChatFocus = vi.hoisted(() => vi.fn())
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    activeSession: { id: 's1', messages: [{ id: 'm1', role: 'user', content: '做一个支付页' }] },
    activeSessionId: 's1',
    isStreaming: false,
  }),
}))
vi.mock('../../ide/store/ide', () => ({ useIdeStore: () => ({ setChatFocus }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
const writeText = vi.hoisted(() => vi.fn(async () => {}))
Object.assign(navigator, { clipboard: { writeText } })

import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import IdeHistoryBrowser from '../../ide/components/IdeHistoryBrowser.vue'

describe('IdeHistoryBrowser — fork 直通（聊天内 /fork 命令通道）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('⋔ 分叉按钮复制 /fork 并聚焦输入框（不代发——不可逆动作人工回车）', async () => {
    const wrapper = mount(IdeHistoryBrowser)
    const btns = wrapper.findAll('.ihb__act')
    expect(btns.length).toBe(4) // ↗ ⧉ ✎ ⋔
    await btns[3]!.trigger('click')
    expect(writeText).toHaveBeenCalledWith('/fork ')
    expect(setChatFocus).toHaveBeenCalled()
  })
})
