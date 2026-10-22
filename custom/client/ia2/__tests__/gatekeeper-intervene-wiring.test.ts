// 2026-10-22 走查批守门：审批收件箱介入卡「批准/打回」不得再绑空函数（假按钮）。
// 根因实锚：GatekeeperSection.vue 原 @approve="() => {}" @reject="() => {}"——
// 用户可点、零效果零提示。修复=派发到各介入点真实裁决面（单一事实源在源系统）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GatekeeperSection 介入卡接线', () => {
  const src = readFileSync(resolve(__dirname, '../components/inbox/GatekeeperSection.vue'), 'utf-8')

  it('批准/打回都走 goDecide 派发（无空函数绑定）', () => {
    expect(src).toContain('@approve="goDecide(p.sourceKey)"')
    expect(src).toContain('@reject="goDecide(p.sourceKey)"')
    expect(src).not.toContain('@approve="() => {}"')
    expect(src).not.toContain('@reject="() => {}"')
  })

  it('14 个介入点 sourceKey 全部登记裁决面（派发表无漏）', () => {
    const m = src.match(/const DECIDE_ROUTES: Record<string, string> = \{([\s\S]*?)\n\}/)
    expect(m).not.toBeNull()
    const keys = [...m![1].matchAll(/'([a-z0-9_-]+)':/g)].map(x => x[1])
    for (const k of ['g1_frozen','g2_arch_pass','g5_human','uat-verdict','clearance-waive',
      'admin-roster','req-scope','dispatch','triage','defect-verdict','audit-sign',
      'retro-decide','breaker-override','posture-approve']) {
      expect(keys).toContain(k)
    }
  })
})
