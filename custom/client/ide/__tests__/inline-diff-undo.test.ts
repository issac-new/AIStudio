// A1 守门：IdeInlineDiff 逐处拒绝的真实写通道（run-undo hunkIndexes）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const undoMock = vi.fn(async () => ({ ok: true, restoredPath: 'a.txt' }))
vi.mock('@/custom/ide/api/runs', () => ({ ideRunsApi: { undo: (...a: unknown[]) => undoMock(...a) } }))
const DIFF = '@@ -1,3 +1,3 @@\n l1\n-old\n+new\n l3\n@@ -5,3 +5,3 @@\n l5\n-x\n+y\n l7'
const CTX = { sessionId: 's1', changeId: 'chg1', fileId: 7, workspace: '/tmp/ws' }
describe('IdeInlineDiff hunk 级回滚写通道（A1）', () => {
  // 基建怪癖实证（2026-09-29）：拒绝用例中 mockReset 异步 mock 或用 vi.waitFor
  // 轮询，会把组件已捕获的 rejection 误判为未处理拒绝并连坐后续用例。
  // 定式：mockClear + setTimeout flush + 直接断言。
  beforeEach(() => { undoMock.mockClear() })
  it('有 undoContext：reject 调 undo 带 hunkIndexes，成功后落 rejected', async () => {
    undoMock.mockResolvedValue({ ok: true, restoredPath: 'a.txt' })
    const { default: C } = await import('../components/IdeInlineDiff.vue')
    const w = mount(C, { props: { diffText: DIFF, undoContext: CTX } })
    await w.find('[data-testid="ide-idiff-reject-1"]').trigger('click')
    await new Promise(r => setTimeout(r, 50))
    expect(w.find('[data-testid="ide-idiff-hunk-1"]').classes()).toContain('is-rejected')
    expect(undoMock).toHaveBeenCalledTimes(1)
    expect(undoMock).toHaveBeenCalledWith({ ...CTX, hunkIndexes: [1] })
    expect(w.emitted('reject-hunk')?.[0]).toEqual([1])
  })
  it('undo 失败：保持 pending 态且错误可见，不冒充已拒绝', async () => {
    undoMock.mockImplementation(() => Promise.reject(new Error('反向应用失败（文件可能已被后续修改）')))
    const { default: C } = await import('../components/IdeInlineDiff.vue')
    const w = mount(C, { props: { diffText: DIFF, undoContext: CTX } })
    await w.find('[data-testid="ide-idiff-reject-0"]').trigger('click')
    await new Promise(r => setTimeout(r, 50))
    expect(w.find('[data-testid="ide-idiff-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-idiff-hunk-0"]').classes()).not.toContain('is-rejected')
    expect(w.find('[data-testid="ide-idiff-error"]').text()).toContain('反向应用失败')
  })
  it('无 undoContext：纯本地标记，零网络调用（旧行为不变）', async () => {
    const { default: C } = await import('../components/IdeInlineDiff.vue')
    const w = mount(C, { props: { diffText: DIFF } })
    await w.find('[data-testid="ide-idiff-reject-0"]').trigger('click')
    expect(w.find('[data-testid="ide-idiff-hunk-0"]').classes()).toContain('is-rejected')
    expect(undoMock).not.toHaveBeenCalled()
  })
  it('accept 不触网（保留语义）', async () => {
    const { default: C } = await import('../components/IdeInlineDiff.vue')
    const w = mount(C, { props: { diffText: DIFF, undoContext: CTX } })
    await w.find('[data-testid="ide-idiff-accept-0"]').trigger('click')
    expect(w.find('[data-testid="ide-idiff-hunk-0"]').classes()).toContain('is-accepted')
    expect(undoMock).not.toHaveBeenCalled()
  })
})
