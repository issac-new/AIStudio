// 专题页统一壳守门（2026-10-18 用户裁定）：
// 流程架构/本体/评测/技能治理必须与「沟通协作」同壳（左侧栏+顶部栏），
// 不再各自作为裸 fullscreen 视图。路由只传 feature，布局由 IaFeatureShell 统一。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const TOPICS: ReadonlyArray<readonly [string, string]> = [
  ['bpa/index.ts', 'bpa'],
  ['ontology/index.ts', 'ontology'],
  ['eval/index.ts', 'eval'],
  ['skillgov/index.ts', 'skillgov'],
]

describe('专题页统一壳', () => {
  it('四个专题路由都注册 IaFeatureShell 并传 feature', () => {
    for (const [file, feature] of TOPICS) {
      const src = readFileSync(resolve(__dirname, '../../', file), 'utf8')
      expect(src, file).toContain("import('../ia2/views/IaFeatureShell.vue')")
      expect(src, file).toContain(`feature: '${feature}'`)
    }
  })

  it('IaFeatureShell 复用 IaShell 并挂四个专题视图', () => {
    const src = readFileSync(resolve(__dirname, '../views/IaFeatureShell.vue'), 'utf8')
    expect(src).toContain("import IaShell from './IaShell.vue'")
    for (const view of [
      'bpa/views/BpaView.vue',
      'ontology/views/OntologyView.vue',
      'eval/views/EvalView.vue',
      'skillgov/views/SkillgovView.vue',
    ]) {
      expect(src, view).toContain(view)
    }
  })
})
