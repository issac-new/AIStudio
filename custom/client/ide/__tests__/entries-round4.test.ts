// overlay/custom/client/ide/__tests__/entries-round4.test.ts
// R4 守门：hooks 归一化（数组/分组/异常形）/ 终端 actions 配置存取 / 收件箱
// 三态推导 / patch 345 漂移守卫。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { normalizeHooks } from '../api/hooks'
import {
  loadTerminalActions,
  addTerminalAction,
  removeTerminalAction,
  TERMINAL_ACTION_EVENT,
} from '../utils/terminalActions'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k) }) }))

describe('hooks 归一化（ShellHookSpec 数组/分组两形）', () => {
  it('数组形原样保留；非法项剔除', () => {
    const arr = normalizeHooks([
      { event: 'pre_tool_call', command: './guard.sh', matcher: 'bash' },
      { event: 'Stop', command: 'notify.sh' },
      { noEvent: true },
      null,
    ])
    expect(arr).toHaveLength(2)
    expect(arr[0]).toMatchObject({ event: 'pre_tool_call', command: './guard.sh' })
  })

  it('分组形 { event: [...] } 摊平并补 event 字段；非数组值忽略', () => {
    const grouped = normalizeHooks({
      pre_tool_call: [{ command: 'a.sh' }, { command: 'b.sh', timeout: 10 }],
      post_tool_call: [{ command: 'c.sh' }],
      junk: 'not-an-array',
    })
    expect(grouped).toHaveLength(3)
    expect(grouped.filter((h) => h.event === 'pre_tool_call')).toHaveLength(2)
    expect(grouped.find((h) => h.command === 'b.sh')?.timeout).toBe(10)
  })

  it('空/非法输入 → 空数组', () => {
    expect(normalizeHooks(null)).toEqual([])
    expect(normalizeHooks(undefined)).toEqual([])
    expect(normalizeHooks('x')).toEqual([])
    expect(normalizeHooks(42)).toEqual([])
  })
})

describe('终端 actions 配置（codex-product 项目级一键命令）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('添加/按名去重/上限 12/按工作区隔离/删除', () => {
    const ws = '/w/proj'
    expect(loadTerminalActions(ws)).toEqual([])
    let list = addTerminalAction(ws, '启动', 'npm start')
    expect(list).toHaveLength(1)
    list = addTerminalAction(ws, '启动', 'npm run dev') // 同名去重
    expect(list).toHaveLength(1)
    expect(list[0].command).toBe('npm run dev')
    for (let i = 0; i < 15; i++) addTerminalAction(ws, `a${i}`, `cmd${i}`)
    expect(loadTerminalActions(ws).length).toBeLessThanOrEqual(12)
    // 工作区隔离
    expect(loadTerminalActions('/w/other')).toEqual([])
    const after = removeTerminalAction(ws, list[0].id)
    expect(after.find((a) => a.label === '启动')).toBeUndefined()
  })

  it('空名/空命令不落库；坏 JSON 返回空', () => {
    expect(addTerminalAction('/w', '  ', 'x')).toEqual([])
    expect(addTerminalAction('/w', 'x', '  ')).toEqual([])
    localStorage.setItem('ide-terminal-actions:/w', '{broken')
    expect(loadTerminalActions('/w')).toEqual([])
  })

  it('TERMINAL_ACTION_EVENT 常量稳定（dock 监听同名事件）', () => {
    expect(TERMINAL_ACTION_EVENT).toBe('overlay:terminal-action')
  })
})

describe('IdeActivityInbox 三态（claude-code 通知耗时 + codex-product 收件箱）', () => {
  // vi.mock 工厂被 hoisted 到模块顶，fakeChat 必须经 vi.hoisted 同步提升
  const fakeChat = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { reactive } = require('vue') as typeof import('vue')
    return reactive({
      isRunActive: false,
      activePendingApproval: null as null | { approvalId: string; requestedAt: number },
      activePendingClarify: null as null | { clarifyId: string },
      activeSessionId: 's1' as string | null,
      activeSession: { id: 's1', updatedAt: 1_700_000_050_000 } as Record<string, unknown> | null,
      runStartedAt: new Map<string, number>(),
    })
  })

  vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => fakeChat }))

  beforeEach(() => {
    setActivePinia(createPinia())
    fakeChat.isRunActive = false
    fakeChat.activePendingApproval = null
    fakeChat.activePendingClarify = null
    fakeChat.runStartedAt = new Map()
  })

  async function flushJobs(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
      await nextTick()
    }
  }

  it('待我（审批/澄清）→ 徽标计数；运行翻转 false → 完成条带耗时入收件箱', async () => {
    fakeChat.runStartedAt.set('s1', 1_700_000_000_000)
    const { default: IdeActivityInbox } = await import('../views/IdeActivityInbox.vue')
    const w = mount(IdeActivityInbox)
    await flushJobs()
    expect(w.find('[data-testid="ide-inbox-badge"]').exists()).toBe(false)

    // 待我：审批
    fakeChat.activePendingApproval = { approvalId: 'a1', requestedAt: 1_700_000_010_000 }
    await flushJobs()
    expect(w.find('[data-testid="ide-inbox-badge"]').text()).toBe('1')

    // 运行→完成翻转：完成条入流水，未读 +1
    fakeChat.isRunActive = true
    await flushJobs()
    fakeChat.isRunActive = false
    await flushJobs()
    expect(w.find('[data-testid="ide-inbox-badge"]').text()).toBe('2')

    // 打开收件箱：完成未读清零，待我仍在
    await w.find('[data-testid="ide-inbox-bell"]').trigger('click')
    await flushJobs()
    expect(w.find('[data-testid="ide-inbox-badge"]').text()).toBe('1')
    const items = w.findAll('.ide-inbox__item')
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.map((i) => i.attributes('data-state'))).toContain('waiting')
    expect(items.map((i) => i.attributes('data-state'))).toContain('done')
  })
})

describe('patch 345 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('345 双语含五块键；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/345-client-i18n-ide-r4.patch'), 'utf8')
    for (const key of ['hooks', 'inbox', 'modelSwitcher', 'termActions', 'sidePaneTab_hooks']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('345-client-i18n-ide-r4.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('345-client-i18n-ide-r4.patch')
  })
})
