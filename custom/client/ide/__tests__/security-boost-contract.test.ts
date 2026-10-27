// overlay/custom/client/ide/__tests__/security-boost-contract.test.ts
// 守门（产品一致性 Task 11 · 安全扫描真实性）：
// ① 死端点清剿：不再请求不存在的 /api/studio/git/status，不再拿文件路径
//    字符串当内容扫描——改走 ideGitApi.status + diff 读真实变更内容
// ② 无变更不装安全：显示「未扫描到变更，不代表安全」
// ③ 失败可见：status/diff 失败显示原因，不伪装成「无发现」
// ④ 敏感原值不输出：发现只报文件/行/类别，不回显命中的密钥原文
// ⑤ boost 去 window.prompt：面板内联输入提交 /boost
// ⑥ zh/en 键成对（ide.security 族）
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, p?: unknown) => (typeof p === 'string' ? p : k) }),
}))

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ sendMessage, activeSession: null, sessions: [] }),
}))

const { status, diff } = vi.hoisted(() => ({ status: vi.fn(), diff: vi.fn() }))
vi.mock('../api/git', () => ({ ideGitApi: { status, diff } }))

vi.mock('../composables/useIdeWorkspace', () => ({
  useIdeWorkspace: () => ({ root: ref('/ws/proj') }),
}))

import IdeSecurityBoostBar from '../components/IdeSecurityBoostBar.vue'
import { expectLocaleKeys } from '../../__tests__/helpers/locale-tree'

const SRC = resolve(__dirname, '../components/IdeSecurityBoostBar.vue')

function gitStatus(changes: Array<Record<string, unknown>>) {
  return { repoRoot: '/ws/proj', branch: 'main', upstream: null, ahead: 0, behind: 0, detached: false, changes }
}
function change(file: string, over: Record<string, unknown> = {}) {
  return { file, renamedFrom: null, indexStatus: ' ', worktreeStatus: 'M', kind: 'modified', ...over }
}

async function mountAndScan() {
  const w = mount(IdeSecurityBoostBar)
  await w.find('[data-testid="ide-scan-toggle"]').trigger('click')
  await w.find('[data-testid="ide-scan-run"]').trigger('click')
  await flushPromises()
  return w
}

describe('源码契约：真实 git 数据面', () => {
  it('无死端点 /api/studio/git/status，不再引 authFetch 做 git 请求', () => {
    const src = readFileSync(SRC, 'utf8')
    expect(src).not.toContain('/api/studio/git/status')
    expect(src).not.toContain('authFetch')
    expect(src).toContain("from '../api/git'")
  })

  it('无 window.prompt（boost 内联化）', () => {
    expect(readFileSync(SRC, 'utf8')).not.toContain('window.prompt')
  })
})

describe('扫描真实变更内容（ideGitApi.status + diff）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('命中新增行里的硬编码密钥：报文件与行号，且不回显密钥原文', async () => {
    status.mockResolvedValue(gitStatus([change('src/secrets.ts')]))
    diff.mockResolvedValue({
      file: 'src/secrets.ts',
      staged: false,
      diff: [
        'diff --git a/src/secrets.ts b/src/secrets.ts',
        '@@ -1,2 +1,4 @@',
        '+const key = "sk-abcdefghijklmnop123456"',
        '+const safe = 1',
      ].join('\n'),
    })
    const w = await mountAndScan()
    expect(status).toHaveBeenCalledWith('/ws/proj')
    expect(diff).toHaveBeenCalledWith('/ws/proj', 'src/secrets.ts', false)
    const finding = w.find('[data-testid="ide-scan-finding-0"]')
    expect(finding.exists()).toBe(true)
    expect(finding.text()).toContain('src/secrets.ts')
    expect(finding.text()).toContain(':1')
    // 安全约束：不输出敏感原值（只报类别，不回显命中的密钥）
    expect(finding.text()).not.toContain('sk-abcdefghijklmnop123456')
    expect(w.text()).not.toContain('sk-abcdefghijklmnop123456')
    w.unmount()
  })

  it('上下文行里的历史密钥不算变更发现（只扫新增行）', async () => {
    status.mockResolvedValue(gitStatus([change('src/ctx.ts')]))
    diff.mockResolvedValue({
      file: 'src/ctx.ts',
      staged: false,
      diff: ['@@ -1,2 +1,2 @@', ' const legacy = "sk-zyxwvutsrqponml987654"', '+const clean = 2'].join('\n'),
    })
    const w = await mountAndScan()
    expect(w.find('[data-testid="ide-scan-finding-0"]').exists()).toBe(false)
    expect(w.text()).not.toContain('sk-zyxwvutsrqponml987654')
    w.unmount()
  })

  it('无变更：显示「未扫描到变更，不代表安全」，不装安全', async () => {
    status.mockResolvedValue(gitStatus([]))
    const w = await mountAndScan()
    const clean = w.find('[data-testid="ide-scan-clean"]')
    expect(clean.exists()).toBe(true)
    expect(clean.text()).toContain('未扫描到变更')
    expect(clean.text()).toContain('不代表安全')
    w.unmount()
  })

  it('全部变更为未跟踪文件：如实标注未扫描，不冒充「无发现」也不说「未扫描到变更」', async () => {
    status.mockResolvedValue(gitStatus([change('draft.md', { kind: 'untracked', indexStatus: '?', worktreeStatus: '?' })]))
    const w = await mountAndScan()
    expect(diff).not.toHaveBeenCalled()
    const clean = w.find('[data-testid="ide-scan-clean"]')
    expect(clean.exists()).toBe(true)
    expect(clean.text()).toContain('未跟踪')
    expect(clean.text()).not.toContain('未扫描到变更')
    w.unmount()
  })

  it('混合态（已扫若干+无发现+存在未跟踪）：clean 行渲染且未跟踪注记同时渲染（fix round 1）', async () => {
    status.mockResolvedValue(gitStatus([
      change('src/clean.ts'),
      change('draft.md', { kind: 'untracked', indexStatus: '?', worktreeStatus: '?' }),
    ]))
    diff.mockResolvedValue({ file: 'src/clean.ts', staged: false, diff: ['@@ -1,2 +1,2 @@', '+const ok = 1'].join('\n') })
    const w = await mountAndScan()
    // clean 行命中后 v-if 链不得吞掉未跟踪注记——用户须知道还有文件未扫
    const clean = w.find('[data-testid="ide-scan-clean"]')
    expect(clean.exists()).toBe(true)
    expect(clean.text()).toContain('无 static 档发现')
    const untracked = w.find('[data-testid="ide-scan-untracked"]')
    expect(untracked.exists()).toBe(true)
    expect(untracked.text()).toContain('未跟踪')
    w.unmount()
  })

  it('重扫描竞态：上一轮有未跟踪、下一轮 status 失败时不残留陈旧未跟踪注记（fix round 1）', async () => {
    // 第一轮：全未跟踪 → 注记渲染
    status.mockResolvedValue(gitStatus([change('draft.md', { kind: 'untracked', indexStatus: '?', worktreeStatus: '?' })]))
    const w = await mountAndScan()
    expect(w.find('[data-testid="ide-scan-clean"]').text()).toContain('未跟踪')
    // 第二轮：status 失败 → 只显示错误原因，不残留上一轮注记
    vi.mocked(status).mockReset()
    status.mockRejectedValue(new Error('第二轮 git 不可用'))
    await w.find('[data-testid="ide-scan-run"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ide-scan-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-scan-error"]').text()).toContain('第二轮 git 不可用')
    expect(w.find('[data-testid="ide-scan-untracked"]').exists()).toBe(false)
    expect(w.text()).not.toContain('未跟踪')
    w.unmount()
  })

  it('status 失败：显示失败原因，不伪装成无发现', async () => {
    status.mockRejectedValue(new Error('git 不可用'))
    const w = await mountAndScan()
    const err = w.find('[data-testid="ide-scan-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('git 不可用')
    expect(w.find('[data-testid="ide-scan-clean"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('boost 内联输入（去 window.prompt）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('window.prompt 不应被调用')
    })
  })

  it('⚡ 打开内联输入，提交 sendMessage("/boost <问题>") 后收起', async () => {
    const w = mount(IdeSecurityBoostBar)
    await w.find('[data-testid="ide-boost-run"]').trigger('click')
    const input = w.find('[data-testid="ide-boost-input"]')
    expect(input.exists()).toBe(true)
    await input.setValue('重新设计登录跳转')
    await w.find('[data-testid="ide-boost-send"]').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith('/boost 重新设计登录跳转')
    expect(w.find('[data-testid="ide-boost-input"]').exists()).toBe(false)
    w.unmount()
  })

  it('空问题不发送', async () => {
    const w = mount(IdeSecurityBoostBar)
    await w.find('[data-testid="ide-boost-run"]').trigger('click')
    await w.find('[data-testid="ide-boost-send"]').trigger('click')
    expect(sendMessage).not.toHaveBeenCalled()
    w.unmount()
  })
})

describe('i18n 键 zh/en 成对', () => {
  it('ide.security 族双语文表齐备', () => {
    expectLocaleKeys('ide.security', [
      'title', 'riskLow', 'riskMedium', 'riskHigh', 'planPrefix', 'planSuffix',
      'run', 'running', 'noChanges', 'noFindings', 'untrackedNote', 'failIntro',
      'scannedFiles', 'capNote', 'noWorkspace', 'boostTitle', 'boostPlaceholder',
      'boostSend', 'boostCancel',
    ])
  })
})
