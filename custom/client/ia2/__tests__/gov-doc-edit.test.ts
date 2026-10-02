// overlay/custom/client/ia2/__tests__/gov-doc-edit.test.ts
// 通用工件编辑链+新鲜度徽标守门（吸收二期 #9，2026-10-01）：client 编辑态
// （superadmin+editable 双门控）与「本轮/旧轮」徽标接线静态断言。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

describe('通用工件编辑链 client 接线（R13）', () => {
  const view = readOverlay('custom/client/ia2/views/gov/GovDocsReviewView.vue')

  it('编辑入口=superadmin+editable 双门控；编辑态/保存/取消 testid 齐备', () => {
    expect(view).toContain('isStoredSuperAdmin')
    expect(view).toContain('doc.editable')
    for (const id of ['gov-doc-edit', 'gov-doc-editor', 'gov-doc-save', 'gov-doc-cancel', 'gov-doc-save-error']) {
      expect(view).toContain(id)
    }
  })

  it('保存走 saveGovernanceDoc 后刷新 doc+overview（编辑链闭环）', () => {
    expect(view).toContain('saveGovernanceDoc')
    expect(view).toMatch(/saveEdit[\s\S]*openDoc[\s\S]*fetchGovernanceOverview/)
  })

  it('API 客户端 PUT /api/governance/doc 带 message/actor', () => {
    const api = readOverlay('custom/client/governance/api/governance.ts')
    expect(api).toContain("method: 'PUT'")
    expect(api).toContain('/api/governance/doc')
    expect(api).toContain('actor')
  })
})

describe('新鲜度徽标（IMP-46 产品面）', () => {
  const view = readOverlay('custom/client/ia2/views/gov/GovDocsReviewView.vue')

  it('工件行徽标 testid+24h 窗口判定+本轮/旧轮双样式', () => {
    expect(view).toContain('gov-fresh-')
    expect(view).toContain('24 * 3600 * 1000')
    expect(view).toContain('is-fresh')
    expect(view).toContain('is-stale')
  })

  it('徽标词条入治理词表（zh/en 双键）', () => {
    const i18n = readOverlay('custom/client/governance/i18n.ts')
    expect(i18n).toContain("freshRound: '本轮'")
    expect(i18n).toContain("freshRound: 'this round'")
    expect(i18n).toContain("staleRound: '旧轮'")
    expect(i18n).toContain("staleRound: 'prior round'")
  })
})
