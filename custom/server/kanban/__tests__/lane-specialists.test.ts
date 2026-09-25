// 泳道专家提示词资产守门（routa §七#16 搬运完整性：11 份齐+出处 README）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DIR = resolve(__dirname, '../../../../runtime/roster/lane-specialists')
const EXPECTED = [
  'agent.yaml', 'backlog-refiner.yaml', 'blocked-resolver.yaml', 'dev-executor.yaml',
  'done-reporter.yaml', 'flow-analyst.yaml', 'pr-publisher.yaml', 'qa-frontend.yaml',
  'review-guard.yaml', 'todo-orchestrator.yaml', 'workflow.yaml',
]

describe('routa 泳道专家资产搬运（MIT 附出处）', () => {
  it('11 份齐全+README 出处声明', () => {
    for (const f of EXPECTED) {
      expect(existsSync(resolve(DIR, f)), `缺 ${f}`).toBe(true)
    }
    const readme = readFileSync(resolve(DIR, 'README.md'), 'utf8')
    expect(readme).toContain('MIT')
    expect(readme).toContain('phodal/routa')
    expect(readme).toContain('11 份')
  })

  it('关键专家内容非空（搬运未截断）', () => {
    for (const f of ['backlog-refiner.yaml', 'review-guard.yaml', 'dev-executor.yaml']) {
      const content = readFileSync(resolve(DIR, f), 'utf8')
      expect(content.length).toBeGreaterThan(500)
    }
  })
})
