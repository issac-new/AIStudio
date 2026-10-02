// overlay/custom/client/ia2/__tests__/history-dangling-links.test.ts
// patch 539 守门（2026-10-02 IDE Fork 走查实锤的悬空链接根治）：
// ①series 登记 ②补丁签名（-行含 hermes/history 路由 × +行含 /app/history）
// ③注入树两文件零残留 hermes/history 悬空引用（#/hermes/history 与
//   name:'hermes.history' 导航均不得再现）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
const UP = resolve(OVERLAY_ROOT, '../upstream/hermes-studio')
function read(rel: string): string {
  return readFileSync(resolve(UP, rel), 'utf8')
}

describe('patch 539：/hermes/history 悬空链接根治', () => {
  it('series 已登记 539', () => {
    expect(readFileSync(resolve(OVERLAY_ROOT, 'patches/series'), 'utf8')).toContain('539-client-history-dangling-links-fix.patch')
  })

  it('补丁内容签名：7 处改向（3 链接+4 内部导航）指向 /app/history', () => {
    const patch = readFileSync(resolve(OVERLAY_ROOT, 'patches/539-client-history-dangling-links-fix.patch'), 'utf8')
    const plus = patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
    expect(plus.filter(l => l.includes('/app/history'))).toHaveLength(7)
    const minus = patch.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'))
    expect(minus.filter(l => l.includes('hermes/history') || l.includes("'hermes.history'"))).toHaveLength(7)
  })

  it('注入树零残留：MessageList/HistoryView 不再产出 /hermes/history 引用', () => {
    const ml = read('packages/client/src/components/hermes/chat/MessageList.vue')
    expect(ml).not.toContain('#/hermes/history')
    expect(ml).toContain('#/app/history')
    const hv = read('packages/client/src/views/hermes/HistoryView.vue')
    expect(hv).not.toContain("name: 'hermes.history'")
    expect(hv.match(/router\.replace\('\/app\/history'\)/g)?.length).toBeGreaterThanOrEqual(4)
  })
})
