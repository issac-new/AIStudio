// @vitest-environment jsdom
// overlay/custom/client/chat/ekko-ui/__tests__/renderer.test.ts
// 渲染器守门：白名单组件树 → 原生控件；bind 两向、必填拦截、visibleWhen、只读态。
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EkkoUISurface from '../EkkoUISurface.vue'
import { EKKO_UI_PROTOCOL, type EkkoUISpec } from '../protocol'

function spec(overrides: Partial<EkkoUISpec> = {}): EkkoUISpec {
  return {
    protocol: EKKO_UI_PROTOCOL,
    surfaceId: 'booking',
    title: '预订房间',
    fallbackText: '预订表单',
    state: { date: '', guests: 2 },
    root: {
      id: 'form',
      type: 'form',
      children: [
        { id: 'heading', type: 'heading', props: { text: '预订信息', level: 3 } },
        {
          id: 'date-field',
          type: 'field',
          props: { label: '入住日期', required: true },
          children: [{ id: 'date', type: 'date', bind: 'date', props: { required: true } }],
        },
        {
          id: 'guests-field',
          type: 'field',
          props: { label: '人数' },
          children: [{ id: 'guests', type: 'number', bind: 'guests', props: { min: 1, max: 8 } }],
        },
      ],
    },
    ...overrides,
  }
}

describe('EkkoUISurface 渲染器', () => {
  it('把声明组件树渲染为原生控件（标题/标签/日期/数字）', () => {
    const w = mount(EkkoUISurface, { props: { spec: spec() } })
    expect(w.find('h3').text()).toBe('预订信息')
    expect(w.findAll('.ekko-label').map(node => node.text())).toEqual(['入住日期*', '人数'])
    expect(w.find('input[type="date"]').exists()).toBe(true)
    expect(w.find('input[type="number"]').exists()).toBe(true)
  })

  it('必填未填时拦截提交并显示错误；填写后提交携带 state', async () => {
    const w = mount(EkkoUISurface, { props: { spec: spec() } })
    await w.find('.ekko-surface-btn.primary').trigger('click')
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('请填写入住日期')

    await w.find('input[type="date"]').setValue('2026-11-20')
    await w.find('.ekko-surface-btn.primary').trigger('click')
    const submitted = w.emitted('submit')
    expect(submitted).toHaveLength(1)
    expect(submitted![0][0]).toEqual({
      actionId: 'submit',
      payload: { date: '2026-11-20', guests: 2 },
    })
  })

  it('本地动作与 visibleWhen：按钮 toggle 后出现提示文本', async () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          state: { show: false },
          root: {
            id: 'root',
            type: 'stack',
            children: [
              { id: 'toggle', type: 'button', props: { text: '显示' }, events: { click: { type: 'state.toggle', path: 'show' } } },
              { id: 'hint', type: 'alert', props: { text: '已显示' }, visibleWhen: { kind: 'state', path: 'show' } },
            ],
          },
        }),
      },
    })
    expect(w.find('.ekko-alert').exists()).toBe(false)
    await w.find('.ekko-button').trigger('click')
    expect(w.find('.ekko-alert').exists()).toBe(true)
  })

  it('spec 内的 submit 按钮动作直接 emit，宿主不再重复渲染提交按钮', async () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          state: { ok: true },
          root: {
            id: 'root',
            type: 'stack',
            children: [
              {
                id: 'go',
                type: 'button',
                props: { text: '确认', variant: 'primary' },
                events: {
                  click: { type: 'surface.submit', actionId: 'confirm', payload: { kind: 'state', path: '' } },
                },
              },
            ],
          },
        }),
      },
    })
    expect(w.find('.ekko-surface-btn.primary').exists()).toBe(false)
    await w.find('.ekko-button').trigger('click')
    expect(w.emitted('submit')![0][0]).toEqual({ actionId: 'confirm', payload: { ok: true } })
  })

  it('spec 内 cancel 动作 emit cancel', async () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          root: {
            id: 'root',
            type: 'stack',
            children: [{
              id: 'skip',
              type: 'button',
              props: { text: '跳过' },
              events: { click: { type: 'surface.cancel', actionId: 'skip' } },
            }],
          },
        }),
      },
    })
    await w.find('.ekko-button').trigger('click')
    expect(w.emitted('cancel')![0][0]).toEqual({ actionId: 'skip' })
  })

  it('非法 spec 显示 fallbackText 与错误摘要，不渲染组件树', () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: {
          protocol: EKKO_UI_PROTOCOL,
          surfaceId: 'bad',
          fallbackText: '无法显示请重试',
          root: { id: 'x', type: 'iframe', props: { src: 'javascript:1' } },
        },
      },
    })
    expect(w.text()).toContain('无法显示请重试')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.text()).toContain('未知组件')
  })

  it('只读态禁用输入且不渲染提交/取消', () => {
    const w = mount(EkkoUISurface, { props: { spec: spec(), interactive: false } })
    expect(w.find('input[type="date"]').attributes('disabled')).toBeDefined()
    expect(w.find('.ekko-surface-actions').exists()).toBe(false)
  })

  it('提交结果回填到只读界面', () => {
    const w = mount(EkkoUISurface, {
      props: { spec: spec(), interactive: false, submission: { date: '2026-12-01', guests: 4 } },
    })
    expect((w.find('input[type="date"]').element as HTMLInputElement).value).toBe('2026-12-01')
    expect((w.find('input[type="number"]').element as HTMLInputElement).value).toBe('4')
  })
})
