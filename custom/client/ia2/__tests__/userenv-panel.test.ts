// @vitest-environment jsdom
// N01 ProfileEnvPanel 组件守门：GET 脱敏渲染、非敏感就地编辑保存、敏感草稿确认位、
// 409 键名回显、成功 toast 带备份文件名、幂等跳写提示、增删行与键名预检。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import ProfileEnvPanel from '../views/agents/ProfileEnvPanel.vue'
import type { EnvEntryDto } from '../utils/userenv'

const mockedFetch = vi.mocked(authFetch)

/** 造 authFetch 响应（panel 只用 ok 与 json()） */
function res(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

const ENTRIES: EnvEntryDto[] = [
  { key: 'API_TOKEN', valueMasked: '***len=11***', valueLength: 11, sensitive: true },
  { key: 'MODEL', valueMasked: 'glm-4.7', valueLength: 7, sensitive: false },
]
const GET_BODY = { ok: true, profile: 'default', entries: ENTRIES }

beforeEach(() => {
  mockedFetch.mockReset()
  document.body.innerHTML = '' // 真实 toast 写 document.body，跨用例清理防串味
})

afterEach(() => {
  document.body.innerHTML = ''
})

async function mountPanel(profile = 'default') {
  mockedFetch.mockResolvedValueOnce(res(GET_BODY))
  const w = mount(ProfileEnvPanel, { props: { profile } })
  await flushPromises()
  return w
}

function lastPutBody(): { entries: Array<{ key: string; value: string }>; confirmSensitive: boolean } {
  return JSON.parse(mockedFetch.mock.lastCall?.[1]?.body as string)
}

describe('ProfileEnvPanel — N01 环境变量编辑面板', () => {
  it('GET 渲染：非敏感明文输入、敏感掩码＋修改入口、敏感列标注', async () => {
    const w = await mountPanel()
    expect(mockedFetch).toHaveBeenCalledWith('/api/userenv/profiles/default/env')
    expect(w.find('[data-testid="uep-mask-0"]').text()).toBe('***len=11***')
    expect((w.find('[data-testid="uep-val-1"]').element as HTMLInputElement).value).toBe('glm-4.7')
    expect(w.find('[data-testid="uep-edit-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="uep-row-0"]').text()).toContain('是')
    w.unmount()
  })

  it('非敏感就地编辑保存：PUT 载荷含新值与敏感行掩码回传、confirmSensitive=false；成功 toast 带备份名', async () => {
    const w = await mountPanel()
    await w.find('[data-testid="uep-val-1"]').setValue('glm-5.3')
    mockedFetch.mockResolvedValueOnce(res({
      ok: true, profile: 'default', written: true, changedKeys: ['MODEL'],
      backup: '.env.bak-2026-11-04T08-00-00-000Z', restartHint: true,
      entries: ENTRIES,
    }))
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    expect(mockedFetch).toHaveBeenLastCalledWith('/api/userenv/profiles/default/env', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [
          { key: 'API_TOKEN', value: '***len=11***' }, // 未动敏感行掩码原样回传=保持现值
          { key: 'MODEL', value: 'glm-5.3' },
        ],
        confirmSensitive: false,
      }),
    })
    // 成功 toast 显示备份文件名与重启提示（toast 落 document.body）
    expect(document.body.textContent).toContain('.env.bak-2026-11-04T08-00-00-000Z')
    expect(document.body.textContent).toContain('重启该档案网关后生效')
    expect(w.find('[data-testid="uep-note-default"]').text()).toContain('已保存')
    w.unmount()
  })

  it('敏感编辑确认矩阵：有实质草稿才出现确认框；未勾选保存 confirmSensitive=false，勾选后 true', async () => {
    const w = await mountPanel()
    // 未动敏感行：无确认框
    expect(w.find('[data-testid="uep-confirmbox-default"]').exists()).toBe(false)
    // 打开草稿框（空草稿不算实质变更，确认框仍不出现）
    await w.find('[data-testid="uep-edit-0"]').trigger('click')
    expect(w.find('[data-testid="uep-draft-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="uep-confirmbox-default"]').exists()).toBe(false)
    // 输入新草稿：确认框出现
    await w.find('[data-testid="uep-draft-0"]').setValue('brand-new-token')
    expect(w.find('[data-testid="uep-confirmbox-default"]').exists()).toBe(true)
    // 未勾选直接保存 → confirmSensitive=false（服务端将 409）
    mockedFetch.mockResolvedValueOnce(res({ ok: true, written: false, changedKeys: [], entries: ENTRIES }))
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    expect(lastPutBody().confirmSensitive).toBe(false)
    // 保存成功后行集重建（草稿清空）：重新进入草稿→勾选→保存
    await w.find('[data-testid="uep-edit-0"]').trigger('click')
    await w.find('[data-testid="uep-draft-0"]').setValue('brand-new-token')
    await w.find('[data-testid="uep-confirm-default"]').setValue(true)
    mockedFetch.mockResolvedValueOnce(res({ ok: true, written: true, changedKeys: ['API_TOKEN'], entries: ENTRIES }))
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    expect(lastPutBody()).toMatchObject({
      confirmSensitive: true,
      entries: [{ key: 'API_TOKEN', value: 'brand-new-token' }, { key: 'MODEL', value: 'glm-4.7' }],
    })
    w.unmount()
  })

  it('409 敏感未确认：回包 problems 键名回显到 note，行集不被重建（草稿保留）', async () => {
    const w = await mountPanel()
    await w.find('[data-testid="uep-edit-0"]').trigger('click')
    await w.find('[data-testid="uep-draft-0"]').setValue('brand-new-token')
    mockedFetch.mockResolvedValueOnce(res({
      ok: false, error: '敏感键值变更须勾选「我确认修改敏感值」后重试', problems: ['API_TOKEN'],
      written: false, entries: [],
    }, false))
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    const note = w.find('[data-testid="uep-note-default"]').text()
    expect(note).toContain('API_TOKEN')
    expect(note).toContain('敏感')
    // 失败不清草稿：确认框仍在，可直接勾选重试
    expect(w.find('[data-testid="uep-draft-0"]').exists()).toBe(true)
    w.unmount()
  })

  it('幂等跳写：written=false 显示无变更提示、不弹 toast', async () => {
    const w = await mountPanel()
    mockedFetch.mockResolvedValueOnce(res({ ok: true, profile: 'default', written: false, changedKeys: [], entries: ENTRIES }))
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="uep-note-default"]').text()).toContain('无变更')
    expect(document.body.textContent ?? '').not.toContain('已保存')
    w.unmount()
  })

  it('添加/删除行进保存载荷；键名非法前端预检拦截不发包', async () => {
    const w = await mountPanel()
    await w.find('[data-testid="uep-add-default"]').trigger('click')
    await w.find('[data-testid="uep-key-2"]').setValue('NEW_FLAG')
    await w.find('[data-testid="uep-val-2"]').setValue('1')
    const withNew = [...ENTRIES, { key: 'NEW_FLAG', valueMasked: '1', valueLength: 1, sensitive: false }]
    mockedFetch.mockResolvedValueOnce(res({ ok: true, written: true, changedKeys: ['NEW_FLAG'], entries: withNew }))
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    expect(lastPutBody().entries).toContainEqual({ key: 'NEW_FLAG', value: '1' })
    // 键名非法：前端预检不发包
    await w.find('[data-testid="uep-key-2"]').setValue('9BAD')
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="uep-note-default"]').text()).toContain('键名非法')
    const calls = mockedFetch.mock.calls.length
    // 删除该行后保存：恢复发包（载荷不再含 9BAD）
    await w.find('[data-testid="uep-del-2"]').trigger('click')
    mockedFetch.mockResolvedValueOnce(res({ ok: true, written: true, entries: ENTRIES }))
    await w.find('[data-testid="uep-save-default"]').trigger('click')
    await flushPromises()
    expect(mockedFetch.mock.calls.length).toBe(calls + 1)
    expect(lastPutBody().entries.map((e) => e.key)).toEqual(['API_TOKEN', 'MODEL'])
    w.unmount()
  })
})
