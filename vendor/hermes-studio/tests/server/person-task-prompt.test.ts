import { expect, it } from 'vitest'
import type { PersonRequirements } from '../../packages/server/src/modules/studio/contracts/person-flow'
import { personTaskPrompt } from '../../packages/server/src/modules/studio/services/person/task-prompt'

function task(requirements: PersonRequirements) {
  return { title: '检查 X 新互动', requirements_json: JSON.stringify(requirements) }
}

it('renders a readable brief without rewriting scope or showing empty sections', () => {
  const goal = '使用本机 opencli 查看新互动，尽量避免重复。\n仅只读，不回复、不点赞或执行其他公开操作。'
  const saved = task({ goal })
  expect(personTaskPrompt(saved, [])).toBe(`# 检查 X 新互动\n\n${goal}`)
  expect(JSON.parse(saved.requirements_json)).toEqual({ goal })
})

it('preserves the stage handoff as context without exposing the internal route', () => {
  const requirements: PersonRequirements = {
    goal: '将已审核文案实现为页面',
    handoff: { execution_id: 'previous-run', message: '审核通过，按文案实现。', output: '# 文案\n\n保留所有换行和 `代码`。' },
    creator_session_id: 'private-creator',
    flow: { steps: [{ session_id: 'private-next-role', goal: '后续阶段', return_expectation: '回报' }], index: 0, stopped: false, completed: false },
  }
  const prompt = personTaskPrompt(task(requirements), [])
  for (const content of [requirements.goal, requirements.handoff!.execution_id, requirements.handoff!.message, requirements.handoff!.output]) {
    expect(prompt).toContain(content)
  }
  expect(prompt).toContain('Previous stage handoff')
  expect(prompt).not.toContain('private-creator')
  expect(prompt).not.toContain('private-next-role')
})

it('preserves answered questions and who answered them', () => {
  const prompt = personTaskPrompt(task({ goal: '报告访问结果' }), [
    { question: '是否可以回复？', answer: '不可以，仅报告。', answered_by: 'user' },
    { question: '访问失败怎么办？', answer: '报告实际障碍，\n不要编造结果。', answered_by: 'person' },
  ])
  expect(prompt).toContain('是否可以回复？\n\nAnswer (user): 不可以，仅报告。')
  expect(prompt).toContain('访问失败怎么办？\n\nAnswer (person): 报告实际障碍，\n不要编造结果。')
})

it('omits an empty handoff rather than adding a blank heading', () => {
  expect(personTaskPrompt(task({ goal: '报告结果', handoff: { execution_id: '', message: '', output: '' } }), []))
    .toBe('# 检查 X 新互动\n\n报告结果')
})
