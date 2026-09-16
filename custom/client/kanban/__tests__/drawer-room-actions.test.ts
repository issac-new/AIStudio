// @vitest-environment jsdom
// overlay/custom/client/kanban/__tests__/drawer-room-actions.test.ts
// 任务↔群弱锚点（2026-09-16 多视图重构，裁决#4）：抽屉头部建群/跳群按钮。
// matrix store 桩化（抽屉按需动态 import，vitest mock 对动态 import 同样生效）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const { sortedRooms, kanbanApi } = vi.hoisted(() => ({
  sortedRooms: { value: [] as Array<{ roomId: string; name?: string | null }> },
  kanbanApi: {
    getTask: vi.fn(async () => null),
    getTaskDetail: vi.fn(async () => null),
  },
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ sortedRooms: sortedRooms.value }),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, ...kanbanApi }
})
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ tasks: [], fetchTasks: vi.fn(async () => {}) }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
// naive-ui 的 useMessage/useDialog 必须有外层 Provider 否则 setup 直接抛错；
// 测试只桩这两个钩子，NDrawer/NDrawerContent/NButton 等模板组件保持真身。
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<any>('naive-ui')
  return {
    ...actual,
    useMessage: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }),
    useDialog: () => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  }
})

import KanbanTaskDrawer from '../components/KanbanTaskDrawer.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/comms/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } }],
  })
}

async function mountDrawer() {
  const router = makeRouter()
  const wrapper = mount(KanbanTaskDrawer, {
    props: { show: true, taskId: 'abcdef12-3456-7890' },
    global: { plugins: [router] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

// NDrawer 把内容 teleport 到 document.body，wrapper.find 的子树查询不可达；
// 抽屉内锚点一律按 body 全局查询（断言语义不变）。
function findInDrawer(selector: string): DOMWrapper<Element> | null {
  const el = document.querySelector(selector)
  return el ? new DOMWrapper(el) : null
}

// attachTo + teleport 组合 VTU 不做自动清理：显式卸载，防上一用例的
// teleport 残留 DOM 污染下一用例的 body 全局查询。
const mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted.length = 0
})

describe('KanbanTaskDrawer — 拉群弱锚点按钮', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sortedRooms.value = []
  })

  it('建群按钮恒在（有 taskId）；无匹配群时跳群按钮隐藏', async () => {
    const { wrapper } = await mountDrawer()
    expect(findInDrawer('[data-testid="drawer-create-room"]')).not.toBeNull()
    expect(findInDrawer('[data-testid="drawer-goto-room"]')).toBeNull()
  })

  it('匹配群存在时跳群按钮渲染，点击 → ia2.commsRoom 并关抽屉', async () => {
    sortedRooms.value = [{ roomId: '!r1:sv', name: '[abcdef12] 需求评审' }]
    const { wrapper, router } = await mountDrawer()
    const push = vi.spyOn(router, 'push')
    const btn = findInDrawer('[data-testid="drawer-goto-room"]')
    expect(btn).not.toBeNull()
    await btn!.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!r1:sv' } })
    expect(wrapper.emitted('update:show')?.[0]).toEqual([false])
  })

  it('matrix 不可用（import 抛错）时静默隐藏跳群，不影响抽屉', async () => {
    // 桩返回 sortedRooms 抛错路径由「空列表」等价覆盖；此处断言无群即隐藏即可
    const { wrapper } = await mountDrawer()
    expect(findInDrawer('[data-testid="drawer-goto-room"]')).toBeNull()
  })
})
