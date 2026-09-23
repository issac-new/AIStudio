// overlay/custom/client/ide/__tests__/heavy-round5.test.ts
// R5 守门：wiki 管线提示词（Qoder 三要素）/ worktree 徽标判定 / goal 预算浮层
// 消耗面推导 / patch 346 漂移守卫。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { buildWikiPipelinePrompt } from '../utils/wikiPipeline'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k) }) }))

describe('wiki 管线提示词（Qoder：多子代理/增量更新/引用注入）', () => {
  it('首次全量：含子代理分派/每页硬结构/index.md/引用方式', () => {
    const p = buildWikiPipelinePrompt()
    expect(p).toContain('首次全量生成')
    expect(p).toContain('delegate_task')
    expect(p).toContain('docs/wiki/index.md')
    expect(p).toContain('引用方式')
    expect(p).toContain('@wiki')
  })

  it('增量更新：带已有页面清单 + 跳过/补页/删页三规则 + 变更摘要', () => {
    const p = buildWikiPipelinePrompt({ existingPages: ['docs/wiki/a.md', 'docs/wiki/b.md'] })
    expect(p).toContain('增量更新')
    expect(p).toContain('已存在 2 页')
    expect(p).toContain('docs/wiki/a.md')
    expect(p).toContain('跳过重写')
    expect(p).toContain('补页')
    expect(p).toContain('删页')
    expect(p).toContain('变更摘要')
  })
})

const fakeIde = vi.hoisted(() => ({ workspace: '/repo', setChatFocus: vi.fn() }))
vi.mock('../store/ide', () => ({ useIdeStore: () => fakeIde }))

const fakeChat = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { reactive } = require('vue') as typeof import('vue')
  return reactive({
    activeSessionId: 's1' as string | null,
    isRunActive: false,
    abortState: null,
    activeSession: null as Record<string, unknown> | null,
  })
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => fakeChat }))

describe('IdeWorktreeBadge worktree 判定（惯用根段识别）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function mountBadge() {
    const { default: IdeWorktreeBadge } = await import('../views/IdeWorktreeBadge.vue')
    return mount(IdeWorktreeBadge)
  }

  it('.claude/worktrees/<name> → 徽标展示 name', async () => {
    fakeIde.workspace = '/repo/.claude/worktrees/feat-x'
    const w = await mountBadge()
    expect(w.find('[data-testid="ide-worktree-badge"]').text()).toContain('feat-x')
  })

  it('.loop/worktrees/<name> 与常规路径', async () => {
    fakeIde.workspace = '/repo/.loop/worktrees/wt-task-1/sub'
    const w = await mountBadge()
    expect(w.find('[data-testid="ide-worktree-badge"]').text()).toContain('wt-task-1')
    fakeIde.workspace = '/repo/plain/src'
    const w2 = await mountBadge()
    expect(w2.find('[data-testid="ide-worktree-badge"]').exists()).toBe(false)
  })
})

describe('IdeGoalBudgetFloat 消耗面（zcode goal stats 语义）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeChat.activeSession = null
    fakeChat.activeSessionId = 's1'
    fakeChat.isRunActive = false
  })

  it('工具数/迭代数（assistant 轮）/上下文用量三行；无会话不渲染', async () => {
    fakeChat.activeSession = {
      contextTokens: 42000,
      messages: [
        { role: 'user', content: 'x' },
        { role: 'assistant', content: 'a' },
        { role: 'tool', toolName: 'read' },
        { role: 'tool', toolName: 'write' },
        { role: 'assistant', content: 'b' },
      ],
    }
    const { default: IdeGoalBudgetFloat } = await import('../views/IdeGoalBudgetFloat.vue')
    const w = mount(IdeGoalBudgetFloat)
    await nextTick()
    const trigger = w.find('[data-testid="ide-goal-budget"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain('2·2')
    await trigger.trigger('click')
    expect(w.find('[data-testid="ide-goal-panel"]').text()).toContain('42k')

    fakeChat.activeSession = null
    const w2 = mount(IdeGoalBudgetFloat)
    await nextTick()
    expect(w2.find('[data-testid="ide-goal-budget"]').exists()).toBe(false)
  })
})

describe('patch 346 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('346 双语含 worktree/goal/wiki.pipeline；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/346-client-i18n-ide-r5.patch'), 'utf8')
    for (const key of ['worktree', 'goal', 'pipeline']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('346-client-i18n-ide-r5.patch')
    // 未注入检出（worktree/CI）回落 series 登记：守卫语义=补丁已登记进 overlay 补丁集
    const manifest = existsSync(resolve(overlayRoot, '.overlay-injected.json'))
      ? JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
      : { appliedPatches: readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')) }
    expect(manifest.appliedPatches).toContain('346-client-i18n-ide-r5.patch')
  })
})
