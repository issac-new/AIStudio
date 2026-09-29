// overlay/custom/client/ia2/__tests__/account-admin-view.test.ts
// P6 守门：表单校验→建号调用→roster 回显（API mock）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AccountAdminView from '../views/AccountAdminView.vue'

const api = vi.hoisted(() => ({
  fetchRegistry: vi.fn(async () => ({ markdown: '# r\n\n| 账号 | AI 助理账号 | 角色 |\n| --- | --- | --- |\n| @admin:matrix.test | — | 管理员 |\n', commit: 'aaa0001' })),
  provisionAccount: vi.fn(async () => ({ created: ['@zhang:matrix.test', '@zhang-agent:matrix.test'], rosterCommit: 'bbb0002' })),
  saveRegistry: vi.fn(async () => ({ commit: 'ccc0003' })),
}))
vi.mock('@/custom/governance/api/adminRegistry', () => api)
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

beforeEach(() => { api.provisionAccount.mockClear(); api.fetchRegistry.mockClear() })

describe('AccountAdminView（P6 账户管理）', () => {
  it('挂载即载 roster 表；缺必填拦截；齐备后建号并回显提交号', async () => {
    const w = mount(AccountAdminView)
    await flushPromises()
    expect(w.find('[data-testid="aac-cell-0-0"]').element).toBeTruthy()
    expect(w.text()).toContain('aaa0001')

    await w.find('[data-testid="aac-create-btn"]').trigger('click')
    expect(api.provisionAccount).not.toHaveBeenCalled()

    await w.find('[data-testid="aac-name"]').setValue('zhang')
    await w.find('[data-testid="aac-role"]').setValue('研发')
    await w.findAll('input[type=password]')[0].setValue('Pw1!')
    await w.find('[data-testid="aac-token"]').setValue('admin-tok')
    await w.find('[data-testid="aac-create-btn"]').trigger('click')
    await flushPromises()
    expect(api.provisionAccount).toHaveBeenCalledWith(expect.objectContaining({ localName: 'zhang', adminToken: 'admin-tok' }))
    expect(w.find('[data-testid="aac-msg"]').text()).toContain('bbb0002')
  })
})
