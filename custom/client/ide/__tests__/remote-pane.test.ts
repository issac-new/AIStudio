// G6 远程工作区面板挂载守门：状态/探针/配置布尔/目录浏览/错误态。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
const { statusMock, listMock } = vi.hoisted(() => ({ statusMock: vi.fn(), listMock: vi.fn() }))
vi.mock('../api/remote', () => ({ ideRemoteApi: { status: statusMock, list: listMock } }))

import IdeRemotePane from '../views/IdeRemotePane.vue'

const okStatus = {
  ok: true, profile: null, backend: 'local', cwd: '/Users/x/.hermes',
  docker: { image: false, container: false },
  ssh: { host: false, user: false, key: false, port: null },
  probe: { ok: true, ms: 12, path: '/Users/x/.hermes' },
}
const entries = [
  { name: 'src', path: 'src', isDir: true, size: 0 },
  { name: 'a.txt', path: 'a.txt', isDir: false, size: 5 },
]

describe('IdeRemotePane', () => {
  beforeEach(() => vi.clearAllMocks())

  it('挂载即探测并列出根目录；SSH/Docker 只显示配置布尔', async () => {
    statusMock.mockResolvedValue(okStatus)
    listMock.mockResolvedValue({ ok: true, backend: 'local', path: '/Users/x/.hermes', entries, truncated: false })
    const w = mount(IdeRemotePane)
    await flushPromises()
    expect(statusMock).toHaveBeenCalled()
    expect(listMock).toHaveBeenCalledWith('/Users/x/.hermes')
    expect(w.find('[data-testid="ide-remote-backend"]').text()).toContain('local')
    expect(w.find('[data-testid="ide-remote-probe"]').text()).toContain('连接正常')
    expect(w.text()).toContain('Host: 未配置')
    expect(w.find('[data-testid="ide-remote-entries"]').text()).toContain('src')
    expect(w.find('[data-testid="ide-remote-entries"]').text()).toContain('a.txt')
  })

  it('点目录进入子路径（相对路径拼当前目录）', async () => {
    statusMock.mockResolvedValue(okStatus)
    listMock
      .mockResolvedValueOnce({ ok: true, backend: 'local', path: '/Users/x/.hermes', entries, truncated: false })
      .mockResolvedValueOnce({ ok: true, backend: 'local', path: '/Users/x/.hermes/src', entries: [], truncated: false })
    const w = mount(IdeRemotePane)
    await flushPromises()
    const dirBtn = w.findAll('.ide-remote__entry').find((b) => b.text().includes('src'))!
    await dirBtn.trigger('click')
    await flushPromises()
    expect(listMock).toHaveBeenLastCalledWith('/Users/x/.hermes/src')
  })

  it('探针失败：结构化 code 展示，不假装连接正常', async () => {
    statusMock.mockResolvedValue({
      ...okStatus, ok: false, backend: 'ssh',
      probe: { ok: false, ms: 8000, code: 'backend_timeout', detail: 'SSH error', path: '/' },
    })
    listMock.mockResolvedValue({ ok: false, backend: 'ssh', path: '/', entries: [], truncated: false, code: 'backend_timeout', detail: 'timeout' })
    const w = mount(IdeRemotePane)
    await flushPromises()
    expect(w.find('[data-testid="ide-remote-probe"]').text()).toContain('连接失败')
    expect(w.find('[data-testid="ide-remote-probe-error"]').text()).toContain('backend_timeout')
    expect(w.find('[data-testid="ide-remote-list-error"]').text()).toContain('timeout')
  })

  it('本地无 cwd 时给出需要配置的说明；WSL 未支持声明常在', async () => {
    statusMock.mockResolvedValue({ ...okStatus, cwd: null })
    listMock.mockResolvedValue({ ok: true, backend: 'local', path: '/Users/x/.hermes', entries: [], truncated: false })
    const w = mount(IdeRemotePane)
    await flushPromises()
    expect(w.text()).toContain('尚未配置远端')
    expect(w.text()).toContain('WSL')
  })
})
