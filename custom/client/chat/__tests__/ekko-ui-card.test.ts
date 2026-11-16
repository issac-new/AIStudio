// @vitest-environment jsdom
// overlay/custom/client/chat/__tests__/ekko-ui-card.test.ts
// 聊天卡片守门：从工具消息参数渲染、挂起/完成两态、回填动作与会话归属。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const respondUiSurface = vi.fn()
vi.mock('@/api/studio/chat', () => ({ respondUiSurface: (...args: unknown[]) => respondUiSurface(...args) }))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ activeSessionId: 's1', activeSession: { profile: 'default' } }) }))

import EkkoUISurfaceCard from '../components/EkkoUISurfaceCard.vue'
import { EKKO_UI_PROTOCOL } from '../ekko-ui/protocol'

function args() {
  return {
    spec: {
      protocol: EKKO_UI_PROTOCOL,
      surfaceId: 'booking',
      title: '预订信息',
      fallbackText: '预订表单',
      state: { date: '' },
      root: {
        id: 'form',
        type: 'form',
        children: [
          {
            id: 'date-field',
            type: 'field',
            props: { label: '入住日期', required: true },
            children: [{ id: 'date', type: 'date', bind: 'date', props: { required: true } }],
          },
        ],
      },
    },
  }
}

describe('EkkoUISurfaceCard（聊天时间线卡片）', () => {
  beforeEach(() => respondUiSurface.mockReset())

  it('running 态从工具参数渲染交互界面并回填', async () => {
    const w = mount(EkkoUISurfaceCard, {
      props: {
        message: {
          id: 'tool-1',
          role: 'tool',
          toolName: 'mcp__ekko-studio-interaction__ekko_studio_show_surface',
          toolArgs: args(),
          toolStatus: 'running',
        },
        sessionId: 's1',
      },
    })
    expect(w.text()).toContain('预订信息')
    expect(w.text()).toContain('等待填写')

    // 未填必填项：不发送
    await w.find('.ekko-surface-btn.primary').trigger('click')
    expect(respondUiSurface).not.toHaveBeenCalled()

    await w.find('input[type="date"]').setValue('2026-11-20')
    await w.find('.ekko-surface-btn.primary').trigger('click')
    expect(respondUiSurface).toHaveBeenCalledWith(
      's1', 'srf:s1:booking', 1, 'submit', { date: '2026-11-20' }, 'default',
    )
    expect(w.text()).toContain('已提交')
  })

  it('done 态按工具结果渲染只读卡片', () => {
    const w = mount(EkkoUISurfaceCard, {
      props: {
        message: {
          id: 'tool-2',
          role: 'tool',
          toolName: 'ekko_studio_show_surface',
          toolArgs: JSON.stringify(args()),
          toolResult: JSON.stringify({
            status: 'submitted',
            surface_id: 'srf:s1:booking',
            revision: 1,
            action_id: 'submit',
            payload: { date: '2026-12-01' },
          }),
          toolStatus: 'done',
        },
        sessionId: 's1',
      },
    })
    expect(w.text()).toContain('已提交')
    expect((w.find('input[type="date"]').element as HTMLInputElement).value).toBe('2026-12-01')
    expect(w.find('.ekko-surface-actions').exists()).toBe(false)
  })

  it('取消结果不给输入框，显示已取消', () => {
    const w = mount(EkkoUISurfaceCard, {
      props: {
        message: {
          id: 'tool-3',
          role: 'tool',
          toolName: 'ekko_studio_show_surface',
          toolArgs: args(),
          toolResult: JSON.stringify({ status: 'cancelled', reason: 'timed_out' }),
          toolStatus: 'done',
        },
        sessionId: 's1',
      },
    })
    expect(w.text()).toContain('已取消')
    expect(w.find('.ekko-surface-btn.primary').exists()).toBe(false)
  })

  it('非法 spec 显示 fallback 与问题摘要，不渲染交互控件', () => {
    const w = mount(EkkoUISurfaceCard, {
      props: {
        message: {
          id: 'tool-4',
          role: 'tool',
          toolName: 'ekko_studio_show_surface',
          toolArgs: {
            spec: {
              protocol: EKKO_UI_PROTOCOL,
              surfaceId: 'bad',
              fallbackText: '请改用文字回答',
              root: { id: 'x', type: 'script', props: {} },
            },
          },
          toolStatus: 'running',
        },
        sessionId: 's1',
      },
    })
    expect(w.text()).toContain('请改用文字回答')
    expect(w.text()).toContain('渲染问题')
    expect(w.find('input').exists()).toBe(false)
  })

  it('未提供会话时不允许提交（避免跨会话回填）', async () => {
    const w = mount(EkkoUISurfaceCard, {
      props: {
        message: {
          id: 'tool-5',
          role: 'tool',
          toolName: 'ekko_studio_show_surface',
          toolArgs: args(),
          toolStatus: 'running',
        },
        sessionId: '',
      },
    })
    // 卡片仍在，但没有可用的 sessionId 时不进入交互态（footer 不出现）
    expect(w.find('.ekko-surface-btn.primary').exists()).toBe(false)
    expect(w.text()).toContain('等待填写')
  })
})
