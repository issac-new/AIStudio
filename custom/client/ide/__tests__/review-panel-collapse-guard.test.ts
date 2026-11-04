// overlay/custom/client/ide/__tests__/review-panel-collapse-guard.test.ts
// 守门（2026-11-04 走查：消息区被工具条挤压到 44px、发送后新消息几乎不可见）：
//   1. 折叠推导——open findings 强制展开（折叠只让位空内容，不藏内容）
//   2. 空态块与 verdict 行必须住在 v-if=expanded 内（否则空态常驻 ~122px 挤压消息区）
//   3. 头行常驻可点折叠（含 ▾/▸ 指示）
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(__dirname, '../components/IdeReviewPanel.vue'), 'utf8')

describe('评审面板折叠守门（消息区挤压修复）', () => {
  it('展开为事件驱动：findings 到场自动展开（watch open），open 清零保持（verdict 不被抽走）', () => {
    expect(src).toMatch(/watch\(open, \(list\) => \{\s*if \(list\.length > 0\) unfolded\.value = true/)  
    expect(src).toMatch(/const expanded = computed\(\(\) => unfolded\.value\)/)
    // 禁回归：推导式会在最后一例 resolve 时塌掉（行为测试实锤）
    expect(src).not.toMatch(/expanded = computed\(\(\) => .*> 0\)/)
  })

  it('内容段（空态/findings/verdict）住在 v-if=expanded 内，且模板闭合在 </template> 前', () => {
    const t0 = src.indexOf('<template v-if="expanded">')
    const close = src.lastIndexOf('</template>')
    expect(t0).toBeGreaterThan(-1)
    // 内容闭合标签（内层 </template>）必须在最后一个 verdict 按钮之后、根 div 闭合前
    const verdictBtn = src.indexOf('通过</button>')
    const innerClose = src.indexOf('</template>', verdictBtn)
    expect(innerClose).toBeGreaterThan(verdictBtn)
    expect(innerClose).toBeLessThan(close)
  })

  it('头行常驻（不在 expanded 内）＋折叠切换＋指示符', () => {
    const head = src.indexOf('data-testid="ide-review-head"')
    const expandedT = src.indexOf('<template v-if="expanded">')
    expect(head).toBeGreaterThan(-1)
    expect(head).toBeLessThan(expandedT)
    expect(src).toMatch(/function toggleFold\(\): void \{\s*unfolded\.value = !unfolded\.value/)
    expect(src).toMatch(/ide-review__caret/)
  })
})
