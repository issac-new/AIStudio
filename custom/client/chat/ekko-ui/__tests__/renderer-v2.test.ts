// @vitest-environment jsdom
// overlay/custom/client/chat/ekko-ui/__tests__/renderer-v2.test.ts
// v2 渲染守门：chart/metric/tabs/steps/empty/descriptions/image 与 turn/copy/open_url 事件。
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EkkoUISurface from '../EkkoUISurface.vue'
import { EKKO_UI_PROTOCOL_V2, type EkkoUISpec } from '../protocol'

function spec(overrides: Partial<EkkoUISpec> = {}): EkkoUISpec {
  return {
    protocol: EKKO_UI_PROTOCOL_V2,
    surfaceId: 'dash',
    title: '面板',
    fallbackText: '面板',
    state: { seats: 8, items: [{ name: '甲', qty: 2 }, { name: '乙', qty: 3 }] },
    root: { id: 'root', type: 'stack', children: [] },
    ...overrides,
  }
}

describe('v2 部件渲染', () => {
  it('chart 三形态渲染内联 SVG', () => {
    for (const kind of ['bar', 'line', 'pie'] as const) {
      const w = mount(EkkoUISurface, {
        props: {
          spec: spec({
            root: {
              id: 'c', type: 'chart',
              props: { kind, data: [{ label: '一', value: 3 }, { label: '二', value: 5 }], height: 120 },
            },
          }),
        },
      })
      expect(w.find('svg').exists(), kind).toBe(true)
      expect(w.findAll('svg [data-chart-label]').map(n => n.text())).toEqual(['一', '二'])
    }
  })

  it('metric 渲染标签/值/单位，值支持 $expr 表达式', () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          root: {
            id: 'm', type: 'metric',
            props: {
              label: '月费',
              unit: '元',
              value: { $expr: { kind: 'arith', op: '*', left: { kind: 'state', path: 'seats' }, right: { kind: 'literal', value: 29 } } },
            },
          },
        }),
      },
    })
    expect(w.text()).toContain('月费')
    expect(w.text()).toContain('232')
    expect(w.text()).toContain('元')
  })

  it('tabs 渲染面板头并本地切换，不 emit 任何边界事件', async () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          root: {
            id: 'tabs', type: 'tabs',
            children: [
              { id: 'p1', type: 'tab-panel', props: { label: '概览' }, children: [{ id: 't1', type: 'text', props: { text: '第一页' } }] },
              { id: 'p2', type: 'tab-panel', props: { label: '明细' }, children: [{ id: 't2', type: 'text', props: { text: '第二页' } }] },
            ],
          },
        }),
      },
    })
    expect(w.text()).toContain('第一页')
    expect(w.text()).not.toContain('第二页')
    const heads = w.findAll('.ekko-tabs-head button')
    expect(heads.map(n => n.text())).toEqual(['概览', '明细'])
    await heads[1].trigger('click')
    expect(w.text()).toContain('第二页')
    expect(w.text()).not.toContain('第一页')
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.emitted('turn')).toBeUndefined()
  })

  it('steps/empty/descriptions 渲染', () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          root: {
            id: 'root', type: 'stack',
            children: [
              { id: 's', type: 'steps', props: { items: [{ title: '设计', status: 'done' }, { title: '实现', status: 'active' }] } },
              { id: 'e', type: 'empty', props: { text: '暂无数据', hint: '先创建一条记录' } },
              { id: 'd', type: 'descriptions', props: { items: [{ label: '负责人', value: 'Ada' }] } },
            ],
          },
        }),
      },
    })
    expect(w.text()).toContain('设计')
    expect(w.text()).toContain('暂无数据')
    expect(w.text()).toContain('负责人')
    expect(w.text()).toContain('Ada')
  })

  it('image：非法 scheme 的动态值不渲染 img', () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          state: { evil: 'javascript:alert(1)', good: 'https://example.com/a.png' },
          root: {
            id: 'root', type: 'stack',
            children: [
              { id: 'i1', type: 'image', props: { src: { $state: 'evil' }, alt: '坏' } },
              { id: 'i2', type: 'image', props: { src: { $state: 'good' }, alt: '好' } },
            ],
          },
        }),
      },
    })
    const imgs = w.findAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0].attributes('src')).toBe('https://example.com/a.png')
  })

  it('map 循环模板经 $expr 渲染列表行', () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          root: {
            id: 'list', type: 'descriptions',
            props: {
              items: {
                $expr: {
                  kind: 'map',
                  list: { kind: 'state', path: 'items' },
                  item: 'it',
                  body: {
                    kind: 'object',
                    fields: {
                      label: { kind: 'var', name: 'it', path: 'name' },
                      value: { kind: 'var', name: 'it', path: 'qty' },
                    },
                  },
                },
              },
            },
          },
        }),
      },
    })
    const rows = w.findAll('.ekko-descriptions-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('甲')
    expect(rows[1].text()).toContain('3')
  })
})

describe('v2 动作事件', () => {
  it('surface.turn / copy / open_url 经事件上抛', async () => {
    const w = mount(EkkoUISurface, {
      props: {
        spec: spec({
          root: {
            id: 'root', type: 'stack',
            children: [
              { id: 'b1', type: 'button', props: { text: '继续' }, events: { click: { type: 'surface.turn', text: { kind: 'concat', values: [{ kind: 'literal', value: '人数 ' }, { kind: 'state', path: 'seats' }] } } } },
              { id: 'b2', type: 'button', props: { text: '复制' }, events: { click: { type: 'surface.copy', text: { kind: 'state', path: 'seats' } } } },
              { id: 'b3', type: 'button', props: { text: '打开' }, events: { click: { type: 'surface.open_url', url: { kind: 'literal', value: 'https://example.com' } } } },
            ],
          },
        }),
      },
    })
    const buttons = w.findAll('.ekko-button')
    await buttons[0].trigger('click')
    expect(w.emitted('turn')![0][0]).toEqual({ text: '人数 8' })
    await buttons[1].trigger('click')
    expect(w.emitted('copy')![0][0]).toEqual({ text: '8' })
    await buttons[2].trigger('click')
    expect(w.emitted('open-url')![0][0]).toEqual({ url: 'https://example.com' })
  })
})
