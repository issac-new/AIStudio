// B5+B11 守门：todo 常驻条解析/渲染 + 归档批量恢复纯函数。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const chatState = reactive({ activeSession: null as unknown })
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

import IdeTodoBar from '../components/IdeTodoBar.vue'
import { parseTodoContent } from '../utils/todo-parse'
import { restoreAllArchived } from '../utils/archive-restore'

describe('B5 todo 常驻条', () => {
  beforeEach(() => { chatState.activeSession = null })

  it('解析：文本形态逐行提取状态+文本；JSON 形态兼容；垃圾输入返空（不假数据）', () => {
    expect(parseTodoContent('- [completed] 修登录\n2. [in_progress] 写测试\n- [pending] 发版')).toEqual([
      { status: 'completed', text: '修登录' },
      { status: 'in_progress', text: '写测试' },
      { status: 'pending', text: '发版' },
    ])
    expect(parseTodoContent(JSON.stringify({ todos: [{ status: 'in_progress', content: '进行中项' }] })))
      .toEqual([{ status: 'in_progress', text: '进行中项' }])
    expect(parseTodoContent('完全无关的文本')).toEqual([])
  })

  it('渲染：最新 todo 快照的进度+进行中项；点击展开完整清单；无 todo 自隐藏', async () => {
    chatState.activeSession = { messages: [
      { id: 't1', role: 'tool', toolName: 'todo_list', content: '- [completed] 旧清单项' },
      { id: 'm1', role: 'user', content: '继续' },
      { id: 't2', role: 'tool', toolName: 'todo_list', content: '- [completed] 修登录\n- [in_progress] 写测试\n- [pending] 发版' },
    ] }
    const w = mount(IdeTodoBar)
    const head = w.find('[data-testid="ide-todo-head"]')
    expect(head.exists()).toBe(true)
    expect(head.text()).toContain('1/3')
    expect(w.find('[data-testid="ide-todo-current"]').text()).toContain('写测试')
    await head.trigger('click')
    expect(w.find('[data-testid="ide-todo-list"]').text()).toContain('发版')
    // 自隐藏：无 todo 工具消息
    chatState.activeSession = { messages: [{ id: 'm1', role: 'user', content: 'hi' }] }
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-todo-bar"]').exists()).toBe(false)
  })
})

describe('B11 归档批量恢复（restoreAllArchived 纯函数）', () => {
  it('成功/失败分明细；单条异常不中断批量', async () => {
    const unarchive = vi.fn(async (id: string) => id !== 'bad')
    const okThrow = vi.fn(async (id: string) => { if (id === 'boom') throw new Error('net'); return true })
    expect(await restoreAllArchived(['a', 'bad', 'c'], unarchive)).toEqual({ okIds: ['a', 'c'], failedIds: ['bad'] })
    expect(await restoreAllArchived(['x', 'boom', 'y'], okThrow)).toEqual({ okIds: ['x', 'y'], failedIds: ['boom'] })
    expect(unarchive).toHaveBeenCalledTimes(3)
  })

  it('空列表零调用', async () => {
    const unarchive = vi.fn()
    expect(await restoreAllArchived([], unarchive)).toEqual({ okIds: [], failedIds: [] })
    expect(unarchive).not.toHaveBeenCalled()
  })
})
