// overlay/custom/client/ide/__tests__/backlog-round2.test.ts
// 遗留 backlog 守门（2026-09-23 第二轮）：
//   ① normalizeHooks 与服务端 _parse_hooks_block 同口径白名单；
//   ② IdeGoalBudgetFloat 面板解嵌套（不再 button>input/button）；
//   ③ worktree 控制器惰性过期清扫接线（cleanupStale 此前零调用方）；
//   ④ patch 376 补 gitConflicts/gitMarkResolved 键。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { normalizeHooks } from '../api/hooks'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

vi.mock('@/stores/hermes/chat', () => {
  const fake = reactive({
    activeSessionId: 's1',
    isRunActive: false,
    abortState: null,
    sendMessage: vi.fn(),
    activeSession: {
      id: 's1',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'done' },
        { role: 'tool', toolName: 'read' },
      ],
      contextTokens: 12000,
      inputTokens: 0,
      outputTokens: 0,
    },
  })
  return { useChatStore: () => fake }
})

vi.mock('../store/ide', () => ({
  useIdeStore: () => ({ setChatFocus: vi.fn() }),
}))

describe('normalizeHooks 与服务端同口径白名单', () => {
  it('合法事件摊平；保留子段（output_spill/outbound）与未知事件不渲染', () => {
    const raw = {
      pre_tool_call: [{ command: 'echo pre' }],
      output_spill: [{ command: 'not-a-hook' }],
      outbound: [{ command: 'not-a-hook' }],
      typo_event: [{ command: 'echo typo' }],
      transform_api_error_classification: [{ command: 'python-only' }],
    }
    const hooks = normalizeHooks(raw)
    expect(hooks).toHaveLength(1)
    expect(hooks[0]).toMatchObject({ event: 'pre_tool_call', command: 'echo pre' })
  })

  it('数组形态同样过白名单；null/非对象返回空', () => {
    expect(normalizeHooks([{ event: 'post_tool_call', command: 'x' }, { event: 'bogus', command: 'y' }])).toHaveLength(1)
    expect(normalizeHooks(null)).toEqual([])
    expect(normalizeHooks('str')).toEqual([])
  })

  it('白名单与 hermes-agent VALID_HOOKS−SHELL_UNSUPPORTED 对账（漂移守卫）', () => {
    const pluginsPy = readFileSync(
      resolve(__dirname, '../../../../../../upstream/hermes-agent/hermes_cli/plugins.py'),
      'utf8',
    )
    const m = /VALID_HOOKS:\s*Set\[str\]\s*=\s*\{([\s\S]*?)\n\}/.exec(pluginsPy)
    expect(m).not.toBeNull()
    // 剥注释再提取：set 字面量内嵌 docstring 示例（"action"/"reason" 等）不是事件名
    const body = m![1].replace(/#.*/g, '')
    const upstream = new Set((body.match(/"[a-z_]+"/g) ?? []).map((s) => s.slice(1, -1)))
    // shell 不支持的（python-plugin-only）前端也不展示
    upstream.delete('transform_api_error_classification')
    const passed = new Set(normalizeHooks([...upstream].map((event) => ({ event, command: 'x' }))).map((h) => h.event))
    expect([...upstream].every((e) => passed.has(e))).toBe(true)
    // 前端名单不得超出上游
    const extra = normalizeHooks(
      [...upstream, 'made_up_event' as never].map((event) => ({ event, command: 'x' })),
    ).map((h) => h.event)
    expect(extra).not.toContain('made_up_event')
  })
})

describe('IdeGoalBudgetFloat 面板解嵌套', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('面板不在 <button> 内：面板元素与按钮为兄弟节点', async () => {
    const { default: IdeGoalBudgetFloat } = await import('../views/IdeGoalBudgetFloat.vue')
    const w = mount(IdeGoalBudgetFloat)
    expect(w.find('[data-testid="ide-goal-budget"]').exists()).toBe(true)
    await w.find('[data-testid="ide-goal-budget"]').trigger('click')
    await nextTick()
    const panel = w.find('[data-testid="ide-goal-panel"]')
    expect(panel.exists()).toBe(true)
    // 面板内含 input/button：若仍嵌在 <button> 里会违反交互元素嵌套规范
    expect(panel.element.closest('button')).toBeNull()
    expect(panel.find('input').exists()).toBe(true)
    expect(panel.find('button').exists()).toBe(true)
  })
})

describe('worktree 过期清扫接线（cleanupStale 零调用方根治）', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('list 与 create 均调 sweepStaleWorktrees（源契约）', () => {
    const src = readFileSync(resolve(overlayRoot, 'custom/server/controllers/ide/worktree.ts'), 'utf8')
    expect(src).toContain('await sweepStaleWorktrees(repo)')
    expect(src.match(/await sweepStaleWorktrees\(repo\)/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).toContain('manager.cleanupStale(24 * 60 * 60 * 1000')
  })
})

describe('patch 376 增量：冲突组词条', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('zh/en 成对含 gitConflicts/gitMarkResolved', () => {
    const p = readFileSync(resolve(overlayRoot, 'patches/376-client-i18n-missing-keys.patch'), 'utf8')
    expect(p).toContain("gitConflicts: '冲突'")
    expect(p).toContain("gitConflicts: 'Conflicts'")
    expect(p).toContain("gitMarkResolved: '标记已解决（git add）'")
    expect(p).toContain("gitMarkResolved: 'Mark resolved (git add)'")
  })
})
