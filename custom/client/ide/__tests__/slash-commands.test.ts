// B7 守门：自定义斜杠命令全链。
// ① 服务端域校验纯函数（slashcmd/slash-commands.ts）；
// ② 客户端 store（载入幂等/保存成功失败两路）；
// ③ pane 管理 UI（增删改/校验问题可见/保存）；
// ④ patch 500 漂移守卫（锚点在档：自定义分支+合并点+懒加载）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { validateSlashCommands, normalizeSlashCommands } from '../../../server/slashcmd/slash-commands'
import { loadSlashCommands, saveSlashCommands, slashCommandsSnapshot, __resetSlashCommandsForTest } from '../store/slash-commands'
import IdeSlashCommandsPane from '../views/IdeSlashCommandsPane.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

describe('B7 域校验（slashcmd/slash-commands）', () => {
  it('名格式/唯一性/prompt 非空三类拦截；归一化 trim+剔坏行', () => {
    expect(validateSlashCommands([
      { name: 'ok-cmd', description: '', prompt: '做 X' },
    ])).toEqual([])
    const problems = validateSlashCommands([
      { name: 'Bad Name', description: '', prompt: 'x' },
      { name: 'dup', description: '', prompt: 'x' },
      { name: 'dup', description: '', prompt: 'y' },
      { name: 'noprompt', description: '', prompt: '  ' },
    ])
    expect(problems.join('\n')).toContain('非法')
    expect(problems.join('\n')).toContain('重复')
    expect(problems.join('\n')).toContain('不能为空')
    expect(normalizeSlashCommands([{ name: ' a ' }, null, 'junk'])).toEqual([{ name: 'a', description: '', prompt: '' }])
  })
})

describe('B7 客户端 store', () => {
  beforeEach(() => {
    __resetSlashCommandsForTest()
    fetchMock.mockReset()
  })

  it('load 幂等（二次不重复请求）；save 成功更新内存快照', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url) === '/api/ide/slash-commands') {
        return { ok: true, json: async () => ({ ok: true, commands: [{ name: 'review', description: '评审', prompt: '请评审当前改动' }] }) }
      }
      return { ok: true, json: async () => ({ ok: true }) }
    })
    await loadSlashCommands()
    await loadSlashCommands()
    expect(fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/ide/slash-commands')).toHaveLength(1)
    expect(slashCommandsSnapshot()[0]?.name).toBe('review')
    const res = await saveSlashCommands([{ name: 'review', description: '评审 v2', prompt: '请评审 v2 改动' }])
    expect(res.ok).toBe(true)
    expect(slashCommandsSnapshot()[0]?.prompt).toBe('请评审 v2 改动')
  })

  it('save 400：problems 透传，内存快照不污染', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 400, json: async () => ({ ok: false, problems: ['prompt 不能为空'] }) }))
    const res = await saveSlashCommands([{ name: 'bad', description: '', prompt: '' }])
    expect(res.ok).toBe(false)
    expect(res.problems?.[0]).toContain('prompt')
    expect(slashCommandsSnapshot()).toHaveLength(0)
  })
})

describe('B7 管理面板', () => {
  beforeEach(() => {
    __resetSlashCommandsForTest()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return { ok: true, json: async () => ({ ok: true }) }
      return { ok: true, json: async () => ({ ok: true, commands: [{ name: 'review', description: '评审', prompt: '请评审' }] }) }
    })
  })

  it('载入渲染/新增行/保存 POST；保存失败 problems 可见', async () => {
    const w = mount(IdeSlashCommandsPane)
    await new Promise((r) => setTimeout(r, 30))
    // input 值不在 text() 里，直取元素 value
    expect((w.find('[data-testid="ide-slash-name"]').element as HTMLInputElement).value).toBe('review')
    // 新增行
    await w.find('[data-testid="ide-slash-add"]').trigger('click')
    const rows = w.findAll('[data-testid^="ide-slash-row-"]')
    expect(rows).toHaveLength(2)
    // 编辑第二行
    await rows[1].find('[data-testid="ide-slash-name"]').setValue('ship')
    await rows[1].find('[data-testid="ide-slash-prompt"]').setValue('走发布流程')
    await w.find('[data-testid="ide-slash-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')
    const body = JSON.parse(String(post![1]?.body))
    expect(body.commands).toHaveLength(2)
    expect(body.commands[1]).toMatchObject({ name: 'ship', prompt: '走发布流程' })
    expect(w.find('[data-testid="ide-slash-saved"]').exists()).toBe(true)
  })
})

describe('B7 patch 500 漂移守卫', () => {
  it('ChatInput 补丁在档且含全部锚点（自定义分支/合并点/懒加载/类型扩展）', () => {
    const patch = readFileSync(resolve(__dirname, '../../../../patches/500-client-chatinput-custom-slash.patch'), 'utf8')
    expect(patch).toContain('opensCustomPrompt')
    expect(patch).toContain('commandsWithCustom')
    expect(patch).toContain('loadSlashCommands()')
    expect(patch).toContain("from '@/custom/ide/store/slash-commands'")
    expect(patch).toContain('inputText.value = command.insertText ??')
  })
})
