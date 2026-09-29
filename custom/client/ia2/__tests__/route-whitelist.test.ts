// overlay/custom/client/ia2/__tests__/route-whitelist.test.ts
// 路由白名单守门（补遗⑤ §13.6-2）：用户可达路由集合快照断言——新增可达路由须走补遗⑤评审
//（改本快照=显式变更点）。快照取自 2026-09-29 P9/P10 落地后实况。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildIaRoutes } from '../routes'
import { buildIdeRoutes } from '../../ide/routes'

function flatten(rs: any[], out: any[] = []): any[] {
  for (const r of rs ?? []) { out.push(r); if (r.children) flatten(r.children, out) }
  return out
}
const all = flatten([...buildIaRoutes(), ...buildIdeRoutes()])
const named = all.filter((r) => r.name).map((r) => r.name) as string[]
const compat = all.filter((r) => r.redirect)
const EXPECTED_NAMES = [
  'ia2.accounts',
  'ia2.board',
  'ia2.collab',
  'ia2.collabChat',
  'ia2.collabGlobalAgent',
  'ia2.collabGlobalAgentSession',
  'ia2.collabHistory',
  'ia2.collabHistorySession',
  'ia2.collabSession',
  'ia2.commsRoom',
  'ia2.dash',
  'ia2.deliveryCases',
  'ia2.governance',
  'ia2.groupRoom',
  'ia2.inbox',
  'ia2.runDetail',
  'ia2.runs',
  'ia2.shell',
  'ide.shell',
]

describe('路由白名单守门（补遗⑤ §13.6-2：快照断言）', () => {
  it('路由名账本快照：仅 ia2.* 与 ide.shell——零 hermes.*/ekko.*/share.*/desktop.*/codingAgent.*', () => {
    expect([...new Set(named)].sort()).toEqual(EXPECTED_NAMES)
  })
  it('兼容层全部为 redirect；退役名 ia2.eng / ia2.loopCanvas 不在可达名账本', () => {
    for (const c of compat) expect(['string','function']).toContain(typeof c.redirect)
    expect(named).not.toContain('ia2.eng')
    expect(named).not.toContain('ia2.loopCanvas')
  })
  it('M2：旧 /ide 壳重定向 → /app/ide（驾驶舱子路由）', () => {
    expect(String(buildIdeRoutes()[0].redirect)).toBe('/app/ide')
  })
})
