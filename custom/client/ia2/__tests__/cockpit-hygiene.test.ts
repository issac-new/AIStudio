// 驾驶舱冗余清理守门：旧整页必须改道、死组件不得回流、死词条不得复活。
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANNEXED_LEGACY, buildIaRoutes } from '../routes'
import { SIM_TABS_TEXT } from '../views/sim/sim-tabs'
import { GOV_TABS_TEXT } from '../i18n-gov-tabs'

function flatten(rs: any[], out: any[] = []): any[] { for (const r of rs ?? []) { out.push(r); if (r.children) flatten(r.children, out) } return out }
const all = flatten([...buildIaRoutes(), ...ANNEXED_LEGACY])
const record = (name: string) => all.find(r => r.name === name)

describe('cockpit hygiene', () => {
  it('旧独立整页收敛到对应阶段签（名称保留，深链改道）', () => {
    const cases: Array<[string, string, string]> = [
      ['ia2.teams', 'ia2.stage1', 'teams'],
      ['ia2.agents', 'ia2.stage1', 'agents'],
      ['ia2.accounts', 'ia2.stage1', 'accounts'],
      ['ia2.deliveryCases', 'ia2.stage5', 'cases'],
      ['hermes.journey', 'ia2.journey', ''],
    ]
    for (const [from, to, tab] of cases) {
      const redirect = record(from)?.redirect
      expect(redirect, from).toBeTruthy()
      const target = typeof redirect === 'function' ? redirect({ query: {} }) : redirect
      expect(target, from).toMatchObject(tab ? { name: to, query: { tab } } : { name: to })
    }
  })

  it('死视图直接删除，不再靠“零入口”留存', () => {
    const removed = [
      'views/OrchestrateView.vue', 'components/SpecList.vue', 'components/SpecDetail.vue',
      'adapters/orchestrate.ts', 'views/scenes/EngScene.vue', 'components/flow/RunCanvas.vue',
      'views/gov/GovClusterSection.vue', 'views/gov/GovSessionHealthSection.vue',
      '../loop/runcenter/views/RunCenterView.vue', '../loop/runcenter/views/RunDetailView.vue',
    ]
    for (const p of removed) expect(existsSync(resolve(__dirname, '..', p)), p).toBe(false)
  })

  it('推演与治理死词条清零', () => {
    expect(SIM_TABS_TEXT.zh).not.toHaveProperty('tabDelivery')
    expect(SIM_TABS_TEXT.zh).not.toHaveProperty('tabTrace')
    expect(GOV_TABS_TEXT.zh).not.toHaveProperty('tabGovCluster')
    expect(GOV_TABS_TEXT.zh).not.toHaveProperty('tabGovSessionHealth')
  })
})
