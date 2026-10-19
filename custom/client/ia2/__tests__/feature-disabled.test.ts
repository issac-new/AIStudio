// overlay/custom/client/ia2/__tests__/feature-disabled.test.ts
// 专题开关关闭时的深链行为（2026-10-19 P1-5）：
// 路由注册与开关解耦；关闭时 IaFeatureShell 必须渲染说明页而不是静默回首页。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const featuresState = vi.hoisted(() => ({ bpa: true, ontology: true, eval: false, skillgov: true }))
vi.mock('../../../../config/features', () => ({ features: featuresState }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, f?: string) => f ?? k, locale: { value: 'zh' } }) }))
const push = vi.hoisted(() => vi.fn())
// 只替换 useRouter，保留其余导出：完整 mock 会击穿上游 @/router 的模块级
// createRouter（2026-10-18 教训），而 useRouter 在测试里无 app 上下文。
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ push }) }
})
// IaShell 的真实依赖链会拉起 api/client→@/router；本测试只关心内容区，
// 用同 props 契约的壳替身，避免为路由初始化买单。
vi.mock('../views/IaShell.vue', () => ({
  default: { name: 'IaShell', props: ['featureView'], template: '<div class="shell-stub"><component :is="featureView" /></div>' },
}))

import IaFeatureShell from '../views/IaFeatureShell.vue'
import FeatureDisabledView from '../views/FeatureDisabledView.vue'

describe('IaFeatureShell 开关关闭态', () => {
  it('features.eval=false：渲染「评测工作台当前未开启」说明页', () => {
    const w = mount(IaFeatureShell, {
      props: { feature: 'eval' },
    })
    expect(w.find('[data-testid="feature-disabled"]').exists()).toBe(true)
    expect(w.text()).toContain('评测工作台当前未开启')
    expect(w.text()).toContain('VITE_CUSTOM_EVAL=true')
  })
})

describe('FeatureDisabledView', () => {
  it('返回工作台按钮 push /app', async () => {
    const w = mount(FeatureDisabledView, { props: { feature: 'eval' } })
    await w.find('[data-testid="feature-disabled-back"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/app')
  })
})
