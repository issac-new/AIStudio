// overlay/custom/client/ide/__tests__/engine-round5.test.ts
// R5 引擎域守门：goal 引擎投影（turn 进度解析/预算警示）/ worktree 编排
// （server 控制器源码锚点 + patch 348）/ 子代理 steer UI 接线 / patch 349 漂移守卫。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { parseGoalTurns, extractGoalProgress, goalBudgetLevel } from '../utils/goalEngine'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k) }) }))

// 共享 ide/chat fake（goal 面板与 steer 浮窗两例同模块 mock，合并到顶部避免
// describe 内重复注册互相覆盖——曾致 goal 用例拿到 steer 的 fake 而渲染空）。
const fakeIde = vi.hoisted(() => ({
  floats: {} as Record<string, boolean>,
  toggleFloat: vi.fn(),
  setChatFocus: vi.fn(),
  workspace: null as string | null,
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => fakeIde }))

const fakeChat = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { reactive } = require('vue') as typeof import('vue')
  return reactive({
    activeSessionId: 's1' as string | null,
    isRunActive: false,
    abortState: null,
    activeSession: null as Record<string, unknown> | null,
    subagentStreams: new Map<string, unknown>(),
    sendMessage: vi.fn(async () => {}),
  })
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => fakeChat }))

describe('goal 引擎投影（hermes GoalManager 语义）', () => {
  it('parseGoalTurns：N/M turns 提取；无匹配/非法返回 null', () => {
    expect(parseGoalTurns('Goal active: 3/20 turns used. Judge pending.')).toEqual({ used: 3, max: 20 })
    expect(parseGoalTurns('turn progress: 12/50 turns')).toEqual({ used: 12, max: 50 })
    expect(parseGoalTurns('no progress here')).toBeNull()
    expect(parseGoalTurns('0/0 turns')).toBeNull()
    expect(parseGoalTurns(undefined)).toBeNull()
  })

  it('extractGoalProgress：从消息流末尾向前取最近一条含 turns 的回执', () => {
    const messages = [
      { role: 'user', content: '/goal status' },
      { role: 'assistant', content: 'Goal active: 2/20 turns used.' },
      { role: 'assistant', content: '普通回复无进度。' },
      { role: 'assistant', content: 'Goal active: 5/20 turns used. Run: running' },
      { role: 'assistant', content: '最后一条无进度。' },
    ]
    expect(extractGoalProgress(messages)).toEqual({ used: 5, max: 20 })
    expect(extractGoalProgress([{ role: 'assistant', content: '无进度' }])).toBeNull()
  })

  it('goalBudgetLevel：≥80% warn、≥100% over、其余 ok', () => {
    expect(goalBudgetLevel({ used: 5, max: 20 })).toBe('ok')
    expect(goalBudgetLevel({ used: 16, max: 20 })).toBe('warn')
    expect(goalBudgetLevel({ used: 20, max: 20 })).toBe('over')
    expect(goalBudgetLevel({ used: 25, max: 20 })).toBe('over')
  })
})

describe('IdeGoalBudgetFloat 引擎面板接线', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    fakeChat.activeSession = {
      contextTokens: 42000,
      messages: [
        { role: 'user', content: '/goal status' },
        { role: 'assistant', content: 'Goal active: 17/20 turns used. Run: running' },
      ],
    }
  })

  it('turn 进度渲染 + 预算警示（17/20=85% → warn）+ 命令按钮驱动 sendMessage', async () => {
    const { default: IdeGoalBudgetFloat } = await import('../views/IdeGoalBudgetFloat.vue')
    const w = mount(IdeGoalBudgetFloat)
    await nextTick()
    const trigger = w.find('[data-testid="ide-goal-budget"]')
    expect(trigger.attributes('data-level')).toBe('warn')
    await trigger.trigger('click')
    expect(w.find('[data-testid="ide-goal-progress"]').text()).toContain('17/20')
    expect(w.find('[data-testid="ide-goal-warn"]').exists()).toBe(true)

    // 命令驱动：status → sendMessage('/goal status')
    await w.find('[data-testid="ide-goal-status"]').trigger('click')
    expect(fakeChat.sendMessage).toHaveBeenCalledWith('/goal status')
    expect(fakeIde.setChatFocus).toHaveBeenCalled()

    // 设 goal（带 max turns）
    await w.find('[data-testid="ide-goal-input"]').setValue('重构 utils')
    await w.find('[data-testid="ide-goal-turns"]').setValue('30')
    await w.find('[data-testid="ide-goal-set"]').trigger('click')
    expect(fakeChat.sendMessage).toHaveBeenCalledWith('/goal 重构 utils --max-turns 30')
  })
})

describe('worktree 编排（patch 348 server 控制器锚点）', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('348 patch 含 import 与挂载两行；控制器源码含 WorktreeManager + 会话绑定', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/348-server-ide-worktree-routes.patch'), 'utf8')
    expect(patch).toContain("import ideWorktreeRouter from '../custom/controllers/ide/worktree'")
    expect(patch).toContain('app.use(ideWorktreeRouter.routes())')
    const ctrl = readFileSync(resolve(overlayRoot, 'custom/server/controllers/ide/worktree.ts'), 'utf8')
    expect(ctrl).toContain('WorktreeManager')
    // 会话绑定复用既有 REST 端点（与 POST /api/studio/sessions/:id/workspace 同一存储字段）
    expect(ctrl).toContain('/api/studio/sessions/')
    expect(ctrl).toContain('/workspace')
    expect(ctrl).toContain('/api/ide/worktree/create')
    expect(ctrl).toContain('/api/ide/worktree/remove')
    expect(ctrl).toContain('/api/ide/worktree/list')
  })
})

describe('子代理 steer UI 接线（/steer 通道）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const streams = new Map<string, unknown>()
    streams.set('s1:agent-1', {
      sessionId: 's1', subagentId: 'agent-1', taskIndex: 0, taskCount: 1,
      status: 'completed', startedAt: 1, updatedAt: 2, entries: [],
    })
    streams.set('s1:agent-2', {
      sessionId: 's1', subagentId: 'agent-2', taskIndex: 1, taskCount: 1,
      status: 'running', startedAt: 1, updatedAt: 3, entries: [],
    })
    fakeChat.subagentStreams = streams
    fakeChat.activeSession = null
  })

  it('idle 子代理渲染 steer 输入；发送注入 /steer @<id> <text>', async () => {
    // 全量并发（230+ 文件转换队列）下动态 import+mount 超默认 5s（推演收口轮 4 连挂实录）；
    // 单独跑 <1s 必过。提超时至 15s 吸收并发负载，断言语义不变。
    const { default: IdeSubagentsFloat } = await import('../components/IdeSubagentsFloat.vue')
    const w = mount(IdeSubagentsFloat, {
      global: { stubs: { IdeFloatPanel: { template: '<div><slot /></div>' }, SubagentStreamPanel: { template: '<div />', props: ['agent', 'stream'] } } },
    })
    await nextTick()
    // 选中 idle 子代理 agent-1
    await w.find('[data-testid="ide-float-agent-agent-1"]').trigger('click')
    await nextTick()
    expect(w.find('[data-testid="ide-agent-steer"]').exists()).toBe(true)
    await w.find('[data-testid="ide-agent-steer-input"]').setValue('再补个测试')
    await w.find('[data-testid="ide-agent-steer-send"]').trigger('click')
    expect(fakeChat.sendMessage).toHaveBeenCalledWith('/steer @agent-1 再补个测试')
  }, 15000)
})

describe('patch 349 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('349 双语含 worktree 编排/goal 引擎/steer 键；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/349-client-i18n-ide-r5-engine.patch'), 'utf8')
    for (const key of ['createHint', 'budgetWarn', 'engineHint', 'steerPlaceholder', 'steerSend']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('349-client-i18n-ide-r5-engine.patch')
    // 未注入检出（worktree/CI）回落 series 登记：守卫语义=补丁已登记进 overlay 补丁集
    const manifest = existsSync(resolve(overlayRoot, '.overlay-injected.json'))
      ? JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
      : { appliedPatches: readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')) }
    expect(manifest.appliedPatches).toContain('349-client-i18n-ide-r5-engine.patch')
  })
})
