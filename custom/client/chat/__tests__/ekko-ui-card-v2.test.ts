// @vitest-environment jsdom
// overlay/custom/client/chat/__tests__/ekko-ui-card-v2.test.ts
// v2 卡片守门：surface.turn 走既有发消息通道、copy 写剪贴板、open_url 复验 scheme。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const respondUiSurface = vi.fn()
const sendMessage = vi.fn()
vi.mock('@/api/studio/chat', () => ({ respondUiSurface: (...args: unknown[]) => respondUiSurface(...args) }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ activeSessionId: 's1', activeSession: { profile: 'default' }, sendMessage: (...args: unknown[]) => sendMessage(...args) }),
}))

import EkkoUISurfaceCard from '../components/EkkoUISurfaceCard.vue'
import { EKKO_UI_PROTOCOL_V2 } from '../ekko-ui/protocol'

function args() {
  return {
    spec: {
      protocol: EKKO_UI_PROTOCOL_V2,
      surfaceId: 'estimator',
      title: '估算器',
      fallbackText: '估算卡片',
      state: { seats: 8 },
      root: {
        id: 'root',
        type: 'stack',
        children: [
          { id: 'seats', type: 'range', bind: 'seats', props: { min: 1, max: 50 } },
          {
            id: 'b1',
            type: 'button',
            props: { text: '按此继续' },
            events: { click: { type: 'surface.turn', text: { kind: 'concat', values: [{ kind: 'literal', value: '人数改为 ' }, { kind: 'state', path: 'seats' }] } } },
          },
          {
            id: 'b2',
            type: 'button',
            props: { text: '复制结果' },
            events: { click: { type: 'surface.copy', text: { kind: 'state', path: 'seats' } } },
          },
          {
            id: 'b3',
            type: 'button',
            props: { text: '查看文档' },
            events: { click: { type: 'surface.open_url', url: { kind: 'literal', value: 'https://example.com/doc' } } },
          },
        ],
      },
    },
  }
}

function mountCard() {
  return mount(EkkoUISurfaceCard, {
    props: {
      message: {
        id: 'tool-v2',
        role: 'tool',
        toolName: 'mcp__ekko-studio-interaction__ekko_studio_show_surface',
        toolArgs: args(),
        toolStatus: 'running',
      },
      sessionId: 's1',
    },
  })
}

describe('EkkoUISurfaceCard v2 动作', () => {
  beforeEach(() => {
    respondUiSurface.mockReset()
    sendMessage.mockReset()
  })

  it('surface.turn 经 chatStore.sendMessage 发起新用户消息，不触发回填', async () => {
    const w = mountCard()
    const buttons = w.findAll('.ekko-button')
    await buttons[0].trigger('click')
    expect(sendMessage).toHaveBeenCalledWith('人数改为 8')
    expect(respondUiSurface).not.toHaveBeenCalled()
  })

  it('surface.copy 写剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = mountCard()
    await w.findAll('.ekko-button')[1].trigger('click')
    expect(writeText).toHaveBeenCalledWith('8')
  })

  it('surface.open_url 复验 scheme 后新窗口打开', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const w = mountCard()
    await w.findAll('.ekko-button')[2].trigger('click')
    expect(open).toHaveBeenCalledWith('https://example.com/doc', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
  })
})
