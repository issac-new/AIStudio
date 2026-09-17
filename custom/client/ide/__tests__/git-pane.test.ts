// overlay/custom/client/ide/__tests__/git-pane.test.ts
// Git 面板守门：toGroups 纯函数分组 + 组件渲染/动作调用/错误态。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, params?: Record<string, string>) => (params ? `${k}:${JSON.stringify(params)}` : k) }) }))

const { status, diff, stage, commit } = vi.hoisted(() => ({
  status: vi.fn(),
  diff: vi.fn(),
  stage: vi.fn(async () => {}),
  commit: vi.fn(async () => 'ok'),
}))
vi.mock('../api/git', async () => {
  const actual = await vi.importActual<any>('../api/git')
  return { ...actual, ideGitApi: { status, diff, stage, commit } }
})

import IdeGitPane from '../views/IdeGitPane.vue'
import { toGroups, type GitChange } from '../api/git'
import { useIdeStore } from '../store/ide'

function change(partial: Partial<GitChange>): GitChange {
  return {
    file: 'a.ts',
    renamedFrom: null,
    indexStatus: ' ',
    worktreeStatus: 'M',
    kind: 'modified',
    ...partial,
  }
}

describe('toGroups（变更分组纯函数）', () => {
  it('untracked 单列；index 侧非空进已暂存；其余进未暂生', () => {
    const groups = toGroups([
      change({ file: 'staged.ts', indexStatus: 'A', worktreeStatus: ' ', kind: 'added' }),
      change({ file: 'work.ts', indexStatus: ' ', worktreeStatus: 'M', kind: 'modified' }),
      change({ file: 'new.ts', indexStatus: '?', worktreeStatus: '?', kind: 'untracked' }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['staged', 'unstaged', 'untracked'])
    expect(groups[0].changes[0].file).toBe('staged.ts')
    expect(groups[1].changes[0].file).toBe('work.ts')
    expect(groups[2].changes[0].file).toBe('new.ts')
  })

  it('空组不出现', () => {
    expect(toGroups([])).toEqual([])
    expect(toGroups([change({ file: 'x.ts' })]).map((g) => g.key)).toEqual(['unstaged'])
  })
})

describe('IdeGitPane', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mountPane() {
    return mount(IdeGitPane)
  }

  it('workspace 未设置：显示提示且不请求', () => {
    const wrapper = mountPane()
    expect(wrapper.find('.ide-git__state').text()).toBe('ide.gitNeedWorkspace')
    expect(status).not.toHaveBeenCalled()
  })

  it('非仓库（not_a_repo）：显示专用空态', async () => {
    const ide = useIdeStore()
    ide.setWorkspace('/tmp/not-a-repo')
    status.mockRejectedValueOnce(Object.assign(new Error('not repo'), { code: 'not_a_repo' }))
    const wrapper = mountPane()
    await flushPromises()
    expect(wrapper.find('.ide-git__state').text()).toBe('ide.gitNotRepo')
  })

  it('渲染分支/分组/计数，点击文件拉 diff，暂存与提交动作调用 API', async () => {
    const ide = useIdeStore()
    ide.setWorkspace('/tmp/repo')
    status.mockResolvedValue({
      repoRoot: '/tmp/repo',
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 0,
      detached: false,
      changes: [
        change({ file: 'staged.ts', indexStatus: 'A', worktreeStatus: ' ', kind: 'added' }),
        change({ file: 'work.ts', indexStatus: ' ', worktreeStatus: 'M', kind: 'modified' }),
        change({ file: 'new.ts', indexStatus: '?', worktreeStatus: '?', kind: 'untracked' }),
      ],
    })
    diff.mockResolvedValue({ file: 'work.ts', staged: false, diff: '+hello\n-world' })
    const wrapper = mountPane()
    await flushPromises()

    expect(wrapper.find('.ide-git__branch').text()).toBe('main ↑2 ↓0')
    const groupHeads = wrapper.findAll('.ide-git__group-head').map((n) => n.text())
    expect(groupHeads[0]).toContain('ide.gitStaged')
    expect(groupHeads[1]).toContain('ide.gitUnstaged')
    expect(groupHeads[2]).toContain('ide.gitUntracked')

    // 点击未暂存文件 → 拉 worktree diff 并渲染着色行
    await wrapper.findAll('.ide-git__change')[1].trigger('click')
    await flushPromises()
    expect(diff).toHaveBeenCalledWith('/tmp/repo', 'work.ts', false)
    expect(wrapper.find('.ide-git__diff-file').text()).toBe('work.ts')
    const lineClasses = wrapper.findAll('.ide-git__diff-line').map((n) => n.classes())
    expect(lineClasses.some((c) => c.includes('is-add'))).toBe(true)
    expect(lineClasses.some((c) => c.includes('is-del'))).toBe(true)

    // 暂存单文件：stage(root, [file], true) + 刷新
    status.mockResolvedValue({
      repoRoot: '/tmp/repo', branch: 'main', upstream: null, ahead: 0, behind: 0, detached: false, changes: [],
    })
    await wrapper.findAll('.ide-git__stage-btn')[1].trigger('click')
    await flushPromises()
    expect(stage).toHaveBeenCalledWith('/tmp/repo', ['work.ts'], true)

    // 提交按钮：无 staged/无 message 时禁用
    const commitBtn = wrapper.find('.ide-git__commit-btn')
    expect(commitBtn.attributes('disabled')).toBeDefined()
  })

  it('提交：staged>0 且有 message 时调用 commit 并清空', async () => {
    const ide = useIdeStore()
    ide.setWorkspace('/tmp/repo')
    status.mockResolvedValue({
      repoRoot: '/tmp/repo', branch: 'main', upstream: null, ahead: 0, behind: 0, detached: false,
      changes: [change({ file: 'staged.ts', indexStatus: 'A', worktreeStatus: ' ', kind: 'added' })],
    })
    status.mockResolvedValue({
      repoRoot: '/tmp/repo', branch: 'main', upstream: null, ahead: 0, behind: 0, detached: false,
      changes: [change({ file: 'staged.ts', indexStatus: 'A', worktreeStatus: ' ', kind: 'added' })],
    })
    const wrapper = mountPane()
    await flushPromises()

    await wrapper.find('.ide-git__commit-input').setValue('feat: test commit')
    const commitBtn = wrapper.find('.ide-git__commit-btn')
    expect(commitBtn.attributes('disabled')).toBeUndefined()
    expect(commitBtn.text()).toContain('(1)')

    await commitBtn.trigger('click')
    await flushPromises()
    expect(commit).toHaveBeenCalledWith('/tmp/repo', 'feat: test commit')
    expect((wrapper.find('.ide-git__commit-input').element as HTMLTextAreaElement).value).toBe('')
  })
})
