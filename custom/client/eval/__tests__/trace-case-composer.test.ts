// @vitest-environment jsdom
// 生产轨迹转题 composer 守门：预览、人工定义、hash 确认、幂等与格式边界。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/eval/api', () => ({
  evalApi: {
    sampleFromTrace: vi.fn(),
    sampleSpanFromTrace: vi.fn(),
    reflowTrace: vi.fn(),
  },
}))

import TraceCaseComposer from '@/custom/eval/components/TraceCaseComposer.vue'
import { evalApi } from '@/custom/eval/api'

const preview = (over: Record<string, unknown> = {}) => ({
  ok: true,
  sessionId: 'sess-1',
  sample: { transcript: 'tool: run_tests -> error', toolCalls: [{ name: 'run_tests', ok: false }] },
  meta: { traceHash: 'a'.repeat(64), format: 'legacy', complete: true, tokens: 10, toolCalls: 1 },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalApi.sampleFromTrace).mockResolvedValue(preview() as never)
  vi.mocked(evalApi.sampleSpanFromTrace).mockResolvedValue(preview({ spanRef: 'tc-1', spanKind: 'tool_span' }) as never)
  vi.mocked(evalApi.reflowTrace).mockResolvedValue({
    ok: true,
    created: true,
    taskId: 're-1',
    set: { id: 'eset-reg', name: '回归样本库', track: 'e2e', taskCount: 1, revision: 1 },
  } as never)
})

async function fillValid(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.find('[data-testid="trace-case-problem"]').setValue('生产会话测试失败')
  await wrapper.find('[data-testid="trace-case-expected"]').setValue('修复后登录测试通过')
  await wrapper.find('[data-testid="trace-case-assertion"]').setValue('证据包含测试通过标记')
}

describe('TraceCaseComposer', () => {
  it('session 预览后由人工确认任务定义并提交 traceHash', async () => {
    const wrapper = mount(TraceCaseComposer, { props: { sessionId: 'sess-1' } })
    await flushPromises()
    expect(evalApi.sampleFromTrace).toHaveBeenCalledWith('sess-1')
    expect(wrapper.find('[data-testid="trace-case-submit"]').attributes('disabled')).toBeDefined()

    await fillValid(wrapper)
    expect(wrapper.find('[data-testid="trace-case-submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-testid="trace-case-form"]').trigger('submit')
    await flushPromises()

    expect(evalApi.reflowTrace).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      expectedTraceHash: 'a'.repeat(64),
      task: {
        problem: '生产会话测试失败',
        expectedBehavior: '修复后登录测试通过',
        rubric: [{ id: 'a1', text: '证据包含测试通过标记', expect: 'yes', kind: 'trajectory' }],
      },
    })
    expect(wrapper.emitted('created')?.[0]).toEqual([{ setId: 'eset-reg', taskId: 're-1' }])
    expect(wrapper.find('[data-testid="trace-case-success"]').text()).toContain('回归样本库')
  })

  it('span 使用 span 采样端点，并把 spanRef 带回转题请求', async () => {
    const wrapper = mount(TraceCaseComposer, { props: { sessionId: 'sess-1', spanRef: 'tc-1', spanKind: 'tool_span' } })
    await flushPromises()
    expect(evalApi.sampleSpanFromTrace).toHaveBeenCalledWith('sess-1', 'tc-1')
    await fillValid(wrapper)
    await wrapper.find('[data-testid="trace-case-form"]').trigger('submit')
    await flushPromises()
    expect(vi.mocked(evalApi.reflowTrace).mock.calls[0][0]).toMatchObject({ sessionId: 'sess-1', spanRef: 'tc-1' })
  })

  it('hash 冲突如实展示且不发出 created', async () => {
    vi.mocked(evalApi.reflowTrace).mockRejectedValue(new Error('trace_hash_mismatch') as never)
    const wrapper = mount(TraceCaseComposer, { props: { sessionId: 'sess-1' } })
    await flushPromises()
    await fillValid(wrapper)
    await wrapper.find('[data-testid="trace-case-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="trace-case-error"]').text()).toContain('trace_hash_mismatch')
    expect(wrapper.emitted('created')).toBeUndefined()
  })

  it('未完整证据不提供可提交动作；完整 OTel 可提交（批次 B 起 OTel 可消费）', async () => {
    vi.mocked(evalApi.sampleFromTrace).mockResolvedValue(preview({ meta: { traceHash: 'b'.repeat(64), format: 'otel', complete: false, tokens: 0, toolCalls: 0 } }) as never)
    const wrapper = mount(TraceCaseComposer, { props: { sessionId: 'sess-otel' } })
    await flushPromises()
    expect(wrapper.find('[data-testid="trace-case-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('完成后再转')

    vi.mocked(evalApi.sampleFromTrace).mockResolvedValue(preview({ meta: { traceHash: 'b'.repeat(64), format: 'otel', complete: true, tokens: 5, toolCalls: 1 } }) as never)
    const otelOk = mount(TraceCaseComposer, { props: { sessionId: 'sess-otel2' } })
    await flushPromises()
    expect(otelOk.find('[data-testid="trace-case-unsupported"]').exists()).toBe(false)
    await fillValid(otelOk)
    expect(otelOk.find('[data-testid="trace-case-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('重复转题显示已存在，不把幂等误报成新建', async () => {
    vi.mocked(evalApi.reflowTrace).mockResolvedValue({
      ok: true,
      created: false,
      taskId: 're-1',
      set: { id: 'eset-reg', name: '回归样本库', track: 'e2e', taskCount: 1, revision: 1 },
    } as never)
    const wrapper = mount(TraceCaseComposer, { props: { sessionId: 'sess-1' } })
    await flushPromises()
    await fillValid(wrapper)
    await wrapper.find('[data-testid="trace-case-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="trace-case-success"]').text()).toContain('已在')
  })
})
