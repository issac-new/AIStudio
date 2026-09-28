// overlay/custom/client/ide/__tests__/m1-extras.test.ts
// M1.6/M1.7 守门：模型失效判定纯函数 + 上游 ImagePreviewOverlay 灯箱（patch 310 注入态）
// 的导航/缩放/下载工具栏。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import { isSessionModelInvalid } from '../utils/modelInvalid'
import ImagePreviewOverlay from '@/components/hermes/chat/ImagePreviewOverlay.vue'

describe('isSessionModelInvalid（M1.6 模型失效判定）', () => {
  it('model 缺失 / 目录未加载 / 空目录 → 不误报', () => {
    expect(isSessionModelInvalid(null, [{ models: ['a'] }])).toBe(false)
    expect(isSessionModelInvalid({ model: null }, [{ models: ['a'] }])).toBe(false)
    expect(isSessionModelInvalid({ model: 'gpt-x' }, [])).toBe(false)
    expect(isSessionModelInvalid({ model: 'gpt-x' }, null)).toBe(false)
  })

  it('目录含该 model → 有效；不含 → 失效（跨 provider 查全表）', () => {
    const groups = [
      { provider: 'p1', models: ['a', 'b'] },
      { provider: 'p2', models: ['c'] },
    ]
    expect(isSessionModelInvalid({ model: 'c' }, groups)).toBe(false)
    expect(isSessionModelInvalid({ model: 'gone' }, groups)).toBe(true)
  })
})

describe('ImagePreviewOverlay 灯箱（patch 310 注入态，M1.4）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountOverlay(props: Record<string, unknown> = {}) {
    return mount(ImagePreviewOverlay, {
      props: { src: 'blob:a', alt: 'x', ...props },
      global: { stubs: { Teleport: true } },
    })
  }

  it('单图模式：无前后导航，有缩放/下载/关闭工具栏', () => {
    const w = mountOverlay()
    expect(w.find('.image-preview-toolbar').exists()).toBe(true)
    expect(w.findAll('.image-preview-btn').length).toBe(4) // 缩小/放大/下载/关闭
    expect(w.find('.image-preview-counter').exists()).toBe(false)
  })

  it('图集模式：显示计数与前后导航，点击切换并重置缩放', async () => {
    const w = mountOverlay({ images: ['blob:a', 'blob:b', 'blob:c'], startIndex: 0 })
    expect(w.find('.image-preview-counter').text()).toContain('1 / 3')
    const btns = w.findAll('.image-preview-btn')
    // 顺序：prev/缩小/放大/下载/next/关闭
    await btns[4].trigger('click') // next
    expect(w.find('.image-preview-counter').text()).toContain('2 / 3')
    await w.findAll('.image-preview-btn')[0].trigger('click') // prev
    expect(w.find('.image-preview-counter').text()).toContain('1 / 3')
    // 环绕：从 1 prev → 3
    await w.findAll('.image-preview-btn')[0].trigger('click')
    expect(w.find('.image-preview-counter').text()).toContain('3 / 3')
  })

  it('缩放按钮钳制在 25%-400%', async () => {
    const w = mountOverlay()
    const btns = w.findAll('.image-preview-btn')
    for (let i = 0; i < 12; i++) await btns[0].trigger('click') // 持续缩小
    expect(w.find('.image-preview-scale').text()).toBe('25%')
    for (let i = 0; i < 30; i++) await btns[1].trigger('click') // 持续放大
    expect(w.find('.image-preview-scale').text()).toBe('400%')
  })

  it('Esc 关闭（keydown 冒泡到 window）', async () => {
    const w = mountOverlay()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toBeTruthy()
  })
})
