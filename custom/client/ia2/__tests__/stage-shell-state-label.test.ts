// 2026-10-22 走查批守门：StageShell 状态点文案必须覆盖 StageState 全部四态。
// 回归来源：交通灯轮给 StageState 增 'blocked'，StageShell STATE_LABEL 未跟进 →
// ④阶段（唯一可 blocked 的阶段）整页渲染崩（reading 'zh' of undefined），
// 5 页签同内容假死。此测试源码锚定防再犯。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('StageShell STATE_LABEL 四态全覆盖', () => {
  it("STATE_LABEL 含 done/current/blocked/pending（StageState 全集）", () => {
    const src = readFileSync(resolve(__dirname, '../views/stage/StageShell.vue'), 'utf-8')
    const m = src.match(/const STATE_LABEL = \{([\s\S]*?)\} as const/)
    expect(m).not.toBeNull()
    for (const key of ['done:', 'current:', 'blocked:', 'pending:']) {
      expect(m![1]).toContain(key)
    }
  })
})
