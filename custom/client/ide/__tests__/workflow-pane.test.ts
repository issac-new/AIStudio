// IdeWorkflowRunLines 组件渲染守门（workflow 集成轮）：活性行渲染、状态点类名、
// 确认收起交互、空摘要 v-if 守卫。模型层守门见 workflow-run-line.test.ts。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IdeWorkflowRunLines from '../components/IdeWorkflowRunLines.vue'
import type { ZcodeWorkflowActivity } from '../../zcode/store/zcode-projection'

const activity: ZcodeWorkflowActivity = {
  runs: [
    {
      runId: 'run-1', name: '重构排查', status: 'running', agentsWorking: 3, startedAt: Date.now() - 90_000,
      currentPhase: '采样',
      phases: [
        { name: '扫描', status: 'done' },
        { name: '采样', status: 'running', alongside: [0] },
        { name: '报告', status: 'pending' },
      ],
    },
    { runId: 'run-2', status: 'errored', phases: [] },
  ],
}

describe('IdeWorkflowRunLines 运行行组件', () => {
  it('活性行渲染：状态点/站点灯/agents/双线段；终态行给确认按钮', () => {
    const w = mount(IdeWorkflowRunLines, { props: { activity } })
    expect(w.find('[data-testid="ide-workflow-run-lines"]').exists()).toBe(true)
    const live = w.find('[data-testid="ide-workflow-run-run-1"]')
    expect(live.classes()).toContain('is-running')
    // 三站：done ● / running ◐ / pending ○；并行站带 twin 段。
    expect(live.findAll('.ide-wf-station').map((n) => n.text())).toEqual(['●', '◐', '○'])
    expect(live.find('.ide-wf-seg.is-twin').exists()).toBe(true)
    expect(live.find('.ide-wf-agents').text()).toBe('3 agents')
    // 无 phases 的 run → 隐含站 ◆。
    const errored = w.find('[data-testid="ide-workflow-run-run-2"]')
    expect(errored.classes()).toContain('is-errored')
    expect(errored.find('.ide-wf-rail.is-implicit').exists()).toBe(true)
    expect(errored.find('[data-testid="wf-confirm"]').exists()).toBe(true)
    expect(live.find('[data-testid="wf-confirm"]').exists()).toBe(false)
  })

  it('点行 emit open-run（runId 可定位面板事件流）；确认终态行后从视图消失', async () => {
    const w = mount(IdeWorkflowRunLines, { props: { activity } })
    await w.find('[data-testid="ide-workflow-run-run-1"]').trigger('click')
    const opened = w.emitted('open-run')
    expect(opened).toBeTruthy()
    expect((opened![0][0] as { runId: string }).runId).toBe('run-1')
    await w.find('[data-testid="ide-workflow-run-run-2"] [data-testid="wf-confirm"]').trigger('click')
    expect(w.find('[data-testid="ide-workflow-run-run-2"]').exists()).toBe(false)
  })

  it('空摘要不渲染根节点（v-if 守卫）', () => {
    const w = mount(IdeWorkflowRunLines, { props: { activity: undefined } })
    expect(w.find('[data-testid="ide-workflow-run-lines"]').exists()).toBe(false)
  })
})
