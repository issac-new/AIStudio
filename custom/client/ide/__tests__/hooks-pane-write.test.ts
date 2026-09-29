// B3 守门：IdeHooksPane 写档面（Q11 写档 UI——此前只读）。
// @vitest-environment jsdom
// 契约：载入渲染（回归）；新增（七事件词表+空命令拦截）/编辑/删除/上下移→dirty；
// 保存 PUT /api/hermes/config {section:'hooks', values:{hooks}}；失败如实显错；
// 丢弃回滚草稿。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const requestMock = vi.fn()
vi.mock('@/api/client', () => ({ request: (...a: unknown[]) => requestMock(...a) }))

import IdeHooksPane from '../views/IdeHooksPane.vue'

const SEED = {
  hooks: [
    { event: 'PreToolUse', command: './lint.sh', matcher: 'Edit|Write', timeout: 30 },
    { event: 'PostToolUse', command: './notify.sh' },
  ],
}

describe('IdeHooksPane 写档面（B3）', () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestMock.mockImplementation(async (url: string) => {
      if (String(url).includes('section=hooks')) return SEED
      return {}
    })
  })

  it('载入渲染既有 hooks（读面回归）', async () => {
    const w = mount(IdeHooksPane)
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-hooks-event-PreToolUse"]').exists()).toBe(true)
    expect(w.text()).toContain('./lint.sh')
  })

  it('新增：空命令拦截显错；合法新增进草稿并 dirty；保存 PUT 正确载荷', async () => {
    const w = mount(IdeHooksPane)
    await new Promise((r) => setTimeout(r, 30))
    await w.find('[data-testid="ide-hooks-add"]').trigger('click')
    // 空命令拦截
    await w.find('[data-testid="ide-hooks-add-ok"]').trigger('click')
    expect(w.find('[data-testid="ide-hooks-validation"]').text()).toContain('命令不能为空')
    // 合法新增
    await w.find('[data-testid="ide-hooks-add-command"]').setValue('./test.sh')
    await w.find('[data-testid="ide-hooks-add-matcher"]').setValue('Bash')
    await w.find('[data-testid="ide-hooks-add-ok"]').trigger('click')
    expect(w.find('[data-testid="ide-hooks-savebar"]').exists()).toBe(true)
    // 保存
    await w.find('[data-testid="ide-hooks-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    const put = requestMock.mock.calls.find((c) => String(c[0]) === '/api/hermes/config')
    expect(put).toBeTruthy()
    const body = JSON.parse(String(put![1]?.body))
    expect(body.section).toBe('hooks')
    expect(body.values.hooks).toHaveLength(3)
    expect(body.values.hooks[2]).toMatchObject({ event: 'PreToolUse', command: './test.sh', matcher: 'Bash' })
    expect(w.find('[data-testid="ide-hooks-savebar"]').exists()).toBe(false) // 保存后 dirty 清
  })

  it('编辑/删除/重排作用于草稿；丢弃回滚', async () => {
    const w = mount(IdeHooksPane)
    await new Promise((r) => setTimeout(r, 30))
    // 编辑 idx0 命令
    await w.find('[data-testid="ide-hooks-edit-0"]').trigger('click')
    await w.find('[data-testid="ide-hooks-edit-command-0"]').setValue('./lint-v2.sh')
    await w.find('[data-testid="ide-hooks-edit-ok-0"]').trigger('click')
    expect(w.text()).toContain('./lint-v2.sh')
    // 重排：idx0 下移
    await w.find('[data-testid="ide-hooks-down-0"]').trigger('click')
    // 删除 idx0（当前为 PostToolUse 项）
    await w.find('[data-testid="ide-hooks-del-0"]').trigger('click')
    expect(w.text()).not.toContain('./notify.sh')
    expect(w.find('[data-testid="ide-hooks-savebar"]').exists()).toBe(true)
    // 丢弃回滚到服务端真值
    await w.find('[data-testid="ide-hooks-discard"]').trigger('click')
    expect(w.text()).toContain('./lint.sh')
    expect(w.text()).toContain('./notify.sh')
    expect(w.find('[data-testid="ide-hooks-savebar"]').exists()).toBe(false)
  })

  it('保存失败：显错且 dirty 保留（不冒充已保存）', async () => {
    const w = mount(IdeHooksPane)
    await new Promise((r) => setTimeout(r, 30))
    await w.find('[data-testid="ide-hooks-del-0"]').trigger('click')
    requestMock.mockImplementation(async (url: string) => {
      if (String(url).includes('section=hooks')) return SEED
      throw new Error('PUT 500')
    })
    await w.find('[data-testid="ide-hooks-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-hooks-saveerror"]').text()).toContain('PUT 500')
    expect(w.find('[data-testid="ide-hooks-savebar"]').exists()).toBe(true)
  })
})
