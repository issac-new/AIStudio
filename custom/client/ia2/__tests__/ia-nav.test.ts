// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-nav.test.ts
// P3 Task 3 — IaNav + IaShell jsdom：六项渲染 / 当前区域高亮 / 点击跳转 / g+数字键盘。
// i18n 走全局 setup 的 key 直返 mock；区域视图用桩组件（本文件只测导航壳）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import IaShell from '../views/IaShell.vue'
import { IA_AREAS } from '../routes'

function makeRouter(): Router {
  const stub = { template: '<div class="area-stub" />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/app',
        component: IaShell,
        children: [
          ...IA_AREAS.map(area => ({
            path: area.path === '/app' ? '' : area.path.slice('/app/'.length),
            name: area.name,
            component: stub,
          })),
          // 运行详情子路由（测试高亮投影用；生产中指向 RunDetailView）
          { path: 'runs/:runId', name: 'ia2.runDetail', component: stub },
        ],
      },
    ],
  })
}

// 生产中 App.vue 的顶层 <router-view> 渲染 IaShell（depth 0）。测试必须复刻这一
// 结构：若直接把 IaShell 当挂载根，其内部 router-view 深度为 0 会再渲染一层
// IaShell（导航出现双份）。根组件必须是 <router-view />。
const App = { template: '<router-view />' }

async function mountShell(router: Router) {
  router.push('/app')
  await router.isReady()
  root = mount(App, { global: { plugins: [router] } })
  return root
}

// IaNav 在 window 上挂 keydown 监听；不卸载会跨用例残留（旧实例持有旧 router）。
let root: VueWrapper | null = null
afterEach(() => {
  root?.unmount()
  root = null
})

describe('IaNav（左侧窄栏一级导航）', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('渲染六个区域项，文案为各自 i18n key', async () => {
    const wrapper = await mountShell(makeRouter())
    const items = wrapper.findAll('.ia-nav__item')
    expect(items).toHaveLength(6)
    expect(items.map(i => i.text())).toEqual(IA_AREAS.map(a => a.labelKey))
  })

  it('当前区域高亮：/app/runs 时 runs 项带 active', async () => {
    const router = makeRouter()
    const wrapper = await mountShell(router)
    await router.push('/app/runs')
    await wrapper.vm.$nextTick()
    const items = wrapper.findAll('.ia-nav__item')
    const activeTexts = items.filter(i => i.classes().includes('ia-nav__item--active')).map(i => i.text())
    expect(activeTexts).toEqual(['ia2.nav.runs'])
  })

  it('运行详情子路由同属运行区高亮', async () => {
    const router = makeRouter()
    const wrapper = await mountShell(router)
    await router.push('/app/runs/run-1')
    await wrapper.vm.$nextTick()
    const active = wrapper.findAll('.ia-nav__item--active')
    expect(active.map(i => i.text())).toEqual(['ia2.nav.runs'])
  })

  it('点击导航项跳转对应区域', async () => {
    const router = makeRouter()
    const wrapper = await mountShell(router)
    const inbox = wrapper.findAll('.ia-nav__item')[3]
    await inbox.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.inbox')
  })

  it('键盘 g+1..6 跳区域（g 后 1s 内按数字）', async () => {
    const router = makeRouter()
    await mountShell(router)
    // VTU trigger 构造的 keydown 不携带 key 属性到 window 监听器（jsdom 已知局限），
    // 直接派发真实 KeyboardEvent（IaNav 监听的是 window keydown）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.runs')
  })

  it('单独按数字（未按 g）不跳转', async () => {
    const router = makeRouter()
    await mountShell(router)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app')
  })

  it('输入框内 g+数字不跳区（审查 C-3：输入目标守卫）', async () => {
    const router = makeRouter()
    await mountShell(router)
    // window 级监听会收到 input 冒泡的 keydown；聊天框打 "g2" 不得被劫持成跳区
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app')
    // 守卫只针对可编辑目标：window（非输入目标）上 g+3 仍正常跳区
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    input.remove()
  })

  it('TEXTAREA 内 g+数字同样不跳区', async () => {
    const router = makeRouter()
    await mountShell(router)
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app')
    textarea.remove()
  })

  it('输入法合成中（isComposing）的按键不触发跳区', async () => {
    const router = makeRouter()
    await mountShell(router)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', isComposing: true }))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app')
  })

  it('壳内渲染 router-view（当前区域视图）', async () => {
    const router = makeRouter()
    const wrapper = await mountShell(router)
    await router.push('/app/tasks')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.area-stub').exists()).toBe(true)
    expect(wrapper.find('.ia-shell__main').exists()).toBe(true)
  })
})
