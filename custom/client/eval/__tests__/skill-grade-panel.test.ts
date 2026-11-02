// @vitest-environment jsdom
// 技能评估面板冒烟（2026-11-02 挂账清偿批，spec 2026-11-02-eval-skill-panel）：
// 四维与 PASS 徽标渲染、CONDITIONAL 黄标（fail-open 合法态）、基线 delta 正负与无基线态、
// 空输入不发请求、API 抛错错误面如实。判定端 mock，零网络。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/eval/api', () => ({
  evalApi: { skillGrade: vi.fn() },
}))

import SkillGradePanel from '@/custom/eval/components/SkillGradePanel.vue'
import { evalApi } from '@/custom/eval/api'
import type { SkillGradeResponseDto } from '@/custom/eval/api'

const gradeMock = vi.mocked(evalApi.skillGrade)

function fixture(over: Partial<SkillGradeResponseDto['grades']>, baseline?: SkillGradeResponseDto['baseline']): SkillGradeResponseDto {
  return {
    ok: true,
    grades: {
      overall: 'PASS',
      sectionFound: true,
      s0: [
        { id: 'maet-rows', label: 'MAET 四路径行', pass: true, detail: 'M/A/E/T 齐全' },
        { id: 'gwt-columns', label: 'GWT 列', pass: false, detail: '表头缺 When 列' },
      ],
      dimensions: [
        { dimension: 'maet-completeness', value: 'yes', source: 's1', p: 0.93, reason: 'S1 yes' },
        { dimension: 'gwt-concreteness', value: 'no', source: 's0', reason: 'S0 机械判 fail：gwt-columns' },
        { dimension: 'boundary-coverage', value: 'unknown', source: 's1', reason: '判定端不可用' },
        { dimension: 'verifiability', value: 'yes', source: 's1', p: 0.88, reason: 'S1 yes' },
      ],
      meta: { model: 'stub', online: true, cached: false, latencyMs: 12 },
      ...over,
    },
    ...(baseline !== undefined ? { baseline } : {}),
  }
}

async function panelWithSpec() {
  const w = mount(SkillGradePanel)
  await w.find('[data-testid="skill-grade-spec-input"]').setValue('## 19. 测试左移\n…')
  return w
}

beforeEach(() => {
  gradeMock.mockReset()
})

describe('SkillGradePanel', () => {
  it('评估动作调 API，渲染 overall 徽标/S0 表/S1 四维/meta', async () => {
    gradeMock.mockResolvedValue(fixture({ overall: 'PASS' } as Partial<SkillGradeResponseDto['grades']>))
    const w = await panelWithSpec()
    await w.find('[data-testid="skill-grade-submit"]').trigger('click')
    await flushPromises()
    expect(gradeMock).toHaveBeenCalledTimes(1)
    expect(gradeMock).toHaveBeenCalledWith({ specText: '## 19. 测试左移\n…' })
    const verdict = w.find('[data-testid="skill-grade-verdict"]')
    expect(verdict.text()).toBe('PASS')
    expect(verdict.classes()).toContain('skill-grade__verdict--pass')
    const s1 = w.find('[data-testid="skill-grade-s1-table"]')
    expect(s1.text()).toContain('maet-completeness')
    expect(s1.text()).toContain('boundary-coverage')
    expect(w.find('[data-testid="skill-grade-s0-table"]').text()).toContain('GWT 列')
    expect(w.text()).toContain('model=stub')
  })

  it('CONDITIONAL 黄标（fail-open 合法态不与 FAIL 同色）', async () => {
    gradeMock.mockResolvedValue(fixture({ overall: 'CONDITIONAL' } as Partial<SkillGradeResponseDto['grades']>))
    const w = await panelWithSpec()
    await w.find('[data-testid="skill-grade-submit"]').trigger('click')
    await flushPromises()
    const verdict = w.find('[data-testid="skill-grade-verdict"]')
    expect(verdict.text()).toBe('CONDITIONAL')
    expect(verdict.classes()).toContain('skill-grade__verdict--conditional')
    expect(verdict.classes()).not.toContain('skill-grade__verdict--fail')
  })

  it('填基线 runId：delta 正负如实呈现', async () => {
    gradeMock.mockResolvedValue(fixture({ overall: 'PASS' } as Partial<SkillGradeResponseDto['grades']>, {
      runId: 'skill-iter-2', baselineTs: 1, baselinePassRate: 0.5, currentPassRate: 0.75, delta: 0.25,
    }))
    const w = await panelWithSpec()
    await w.find('[data-testid="skill-grade-baseline-runid"]').setValue('skill-iter-2')
    await w.find('[data-testid="skill-grade-submit"]').trigger('click')
    await flushPromises()
    expect(gradeMock).toHaveBeenCalledWith({ specText: '## 19. 测试左移\n…', baselineRunId: 'skill-iter-2' })
    const b = w.find('[data-testid="skill-grade-baseline"]')
    expect(b.text()).toContain('0.5')
    expect(b.text()).toContain('0.75')
    expect(b.text()).toContain('+0.25')
  })

  it('勾选落基线：请求体带 snapshot=true；服务端无快照时如实示「无基线」', async () => {
    gradeMock.mockResolvedValue(fixture({ overall: 'PASS' } as Partial<SkillGradeResponseDto['grades']>))
    const w = await panelWithSpec()
    await w.find('[data-testid="skill-grade-baseline-runid"]').setValue('skill-iter-1')
    await w.find('[data-testid="skill-grade-snapshot"]').setValue(true)
    await w.find('[data-testid="skill-grade-submit"]').trigger('click')
    await flushPromises()
    expect(gradeMock).toHaveBeenCalledWith({ specText: '## 19. 测试左移\n…', baselineRunId: 'skill-iter-1', snapshot: true })
    expect(w.find('[data-testid="skill-grade-baseline-none"]').exists()).toBe(true)
  })

  it('空输入禁用提交按钮不发请求', async () => {
    const w = mount(SkillGradePanel)
    const btn = w.find('[data-testid="skill-grade-submit"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    await btn.trigger('click')
    expect(gradeMock).not.toHaveBeenCalled()
  })

  it('API 抛错：错误面如实展示不吞', async () => {
    gradeMock.mockRejectedValue(new Error('判定端连接失败'))
    const w = await panelWithSpec()
    await w.find('[data-testid="skill-grade-submit"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="skill-grade-error"]').text()).toContain('判定端连接失败')
    expect(w.find('[data-testid="skill-grade-result"]').exists()).toBe(false)
  })
})
