// @vitest-environment jsdom
// parseRaciFromTask 守门 + 端到端渲染回归：无结构化 RACI 字段的卡片，
// 简报 RACI 行曾恒显 "R: — · A:—"（aipaydev 实证缺陷）；修复后从 assignee/正文解析出人名。
// 用例正文取自 aipaydev 推演真实卡片（排期卡 / 派单式任务卡）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import TaskBriefingPanel from '@/custom/ide/components/TaskBriefingPanel.vue'
import { parseRaciFromTask } from '@/custom/ide/components/briefing-types'
import type { BriefingTask } from '@/custom/ide/components/briefing-types'

const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh: {} } })

const scheduleCard: BriefingTask = {
  id: 't_47374e48',
  title: '排期 DEV-PAYCORE：csw-pay-core 接口拓展（chen 4.5d D1–D5）',
  status: 'done',
  priority: 0,
  body: [
    '排期跟踪卡（窗口/工作量跟踪层，**非执行载体**——执行在既有卡 t_5b889ee8「T-003 pay-core接口拓展」，两向引用）。',
    '',
    '- 模块：csw-pay-core（T-003 接口拓展）',
    '- 责任人：chen ｜ 类型：开发 ｜ 工作量：4.5 人日（系分口径，6 有效工时/日）',
    '- 窗口：D1–D5（2026-09-23 ～ 2026-09-29）',
  ].join('\n'),
}

const dispatchCard: BriefingTask = {
  id: 't_62343345',
  title: '跟踪 T-004 派单反馈（hu/wei）',
  status: 'done',
  body: [
    '【派单】T-004 channel-wechat适配',
    '责任人: @hu:matrix.test 的 AI 助理（@hu-agent:matrix.test），团队负责人 @wei:matrix.test（@wei-agent:matrix.test）',
    '发起方: @fanfan:matrix.test',
  ].join('\n'),
}

describe('parseRaciFromTask', () => {
  it('空任务返回全空 RACI', () => {
    expect(parseRaciFromTask(null)).toEqual({ responsible: [], approver: [], consulted: [], informed: [] })
  })

  it('排期卡正文提取 R=chen（“｜”截断）', () => {
    const r = parseRaciFromTask(scheduleCard)
    expect(r.responsible).toEqual(['chen'])
    expect(r.approver).toEqual([])
  })

  it('派单式正文提取 R=hu / A=wei（@mention 去域名）', () => {
    const r = parseRaciFromTask(dispatchCard)
    expect(r.responsible).toEqual(['hu'])
    expect(r.approver).toEqual(['wei'])
  })

  it('发起方归入 I（通知对象）', () => {
    const r = parseRaciFromTask(dispatchCard)
    expect(r.informed).toContain('fanfan')
  })

  it('assignee 结构化字段优先于正文解析', () => {
    expect(parseRaciFromTask({ ...scheduleCard, assignee: 'someone-else' }).responsible).toEqual(['someone-else'])
  })

  it('正文无标签行不误报', () => {
    const r = parseRaciFromTask({ id: 't_x', title: '普通卡', status: 'todo', body: '与责任人无关的正文' })
    expect(r.responsible).toEqual([])
    expect(r.informed).toEqual([])
  })
})

describe('briefing RACI 渲染（parseRaciFromTask → 面板）', () => {
  const mountPanel = (task: BriefingTask) =>
    mount(TaskBriefingPanel, {
      global: { plugins: [i18n] },
      props: {
        task,
        raci: parseRaciFromTask(task),
        git: { branch: null, worktreePath: null, commits: [] },
        workflow: { stage: task.status, parentIds: [], childIds: [], blocked: false, retryCount: 0 },
        collab: [],
      },
    })

  it('排期卡正文解析后 RACI 行不再显示 "R: —"', () => {
    const text = mountPanel(scheduleCard).text()
    expect(text).toContain('R: chen')
    expect(text).not.toContain('R: —')
  })

  it('派单式正文解析后 RACI 行显示 R 与 A', () => {
    const text = mountPanel(dispatchCard).text()
    expect(text).toContain('R: hu')
    expect(text).toContain('A: wei')
  })
})
