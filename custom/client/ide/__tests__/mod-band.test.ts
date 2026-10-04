// P4 模组横幅带守门（2026-10-04 九源轮）：排序/隐藏持久化/恢复/不可隐藏条。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount } from '@vue/test-utils'
import { useModBand, type ModBandSpec } from '../composables/useModBand'
import IdeModBand from '../components/IdeModBand.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh-CN' } }) }))

beforeEach(() => {
  localStorage.clear()
})

const SPECS: ModBandSpec[] = [
  { id: 'todo', priority: 60, visible: true },
  { id: 'recap', priority: 10, visible: true, hideable: false },
  { id: 'runline', priority: 40, visible: false },
  { id: 'injection', priority: 20, visible: true },
]

describe('useModBand 排序与隐藏', () => {
  it('按 priority 升序；visible=false 不占位', () => {
    const band = useModBand()
    const ordered = band.ordered.value(SPECS)
    expect(ordered.map((m) => m.id)).toEqual(['recap', 'injection', 'todo'])
  })

  it('隐藏持久化到 settings-layers user 层；恢复清键', () => {
    const band = useModBand()
    band.hideMod('injection')
    expect(JSON.parse(localStorage.getItem('sl:user:ide_modband_hidden') ?? '[]')).toEqual(['injection'])
    expect(band.ordered.value(SPECS).map((m) => m.id)).toEqual(['recap', 'todo'])
    band.showMod('injection')
    expect(band.ordered.value(SPECS).map((m) => m.id)).toEqual(['recap', 'injection', 'todo'])
    expect(localStorage.getItem('sl:user:ide_modband_hidden')).toBeNull()
  })

  it('重开（新实例）读回已隐藏条', () => {
    useModBand().hideMod('todo')
    const band2 = useModBand()
    expect(band2.ordered.value(SPECS).map((m) => m.id)).toEqual(['recap', 'injection'])
  })
})

describe('IdeModBand 宿主渲染', () => {
  it('按序渲染槽位；hideable=false 无带级 ✕；隐藏后有恢复 chip', async () => {
    const w = mount(IdeModBand, {
      props: { mods: SPECS },
      slots: {
        recap: '<div data-testid="slot-recap">r</div>',
        injection: '<div data-testid="slot-injection">i</div>',
        todo: '<div data-testid="slot-todo">t</div>',
      },
    })
    // 排序：recap 在 injection 前
    const ids = w.findAll('[data-testid^="ide-modband-mod-"]').map((n) => n.attributes('data-testid'))
    expect(ids).toEqual(['ide-modband-mod-recap', 'ide-modband-mod-injection', 'ide-modband-mod-todo'])
    // recap 不可隐藏：无带级 ✕；injection/todo 有
    expect(w.find('[data-testid="ide-modband-hide-recap"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-modband-hide-injection"]').exists()).toBe(true)
    // 隐藏 injection → 槽位消失 + 恢复 chip 出现
    await w.find('[data-testid="ide-modband-hide-injection"]').trigger('click')
    expect(w.find('[data-testid="slot-injection"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-modband-restore"]').exists()).toBe(true)
    await w.find('[data-testid="ide-modband-restore"]').trigger('click')
    expect(w.find('[data-testid="slot-injection"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-modband-restore"]').exists()).toBe(false)
  })
})
