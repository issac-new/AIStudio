// U5b 守门：工作台房间列表同名消歧——同名行尾缀短 ID，唯一名零噪音。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount, config } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import FlowNavPanel from '../components/flow/FlowNavPanel.vue'

config.global.stubs = { teleport: true }

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': {} } })

const mk = (id: string, name: string, kind = 'room') => ({
  kind, id, name, taskIds: [] as string[], unread: 0,
})

function mountPanel(names: string[]) {
  return mount(FlowNavPanel, {
    props: {
      sessions: names.map((n, i) => mk(`!room${i}:matrix.test`, n)),
      loops: [], selection: null, taskCount: {}, loopActivity: [], agents: [],
    },
    global: { plugins: [i18n] },
  })
}

describe('FlowNavPanel 同名房间消歧（U5b）', () => {
  it('同名 ≥2 行渲染 #短房ID 后缀；唯一名不渲染', async () => {
    const wrap = mountPanel(['支付收银台需求分析讨论群', '支付收银台需求分析讨论群', 'delivery-dlv-run-1'])
    await new Promise(r => setTimeout(r, 0))
    const suffixes = wrap.findAll('[data-testid="flow-dup-suffix"]')
    expect(suffixes.length).toBe(2)
    expect(suffixes[0].text()).toMatch(/^#room0$/)
    expect(wrap.text()).toContain('delivery-dlv-run-1')
    // 唯一名行无后缀：第 3 行按钮内无 suffix span
    const rows = wrap.findAll('.flow-nav__row')
    expect(rows[2].find('[data-testid="flow-dup-suffix"]').exists()).toBe(false)
  })

  it('全部唯一名零后缀（零噪音）', async () => {
    const wrap = mountPanel(['a-room', 'b-room'])
    await new Promise(r => setTimeout(r, 0))
    expect(wrap.findAll('[data-testid="flow-dup-suffix"]').length).toBe(0)
  })
})
