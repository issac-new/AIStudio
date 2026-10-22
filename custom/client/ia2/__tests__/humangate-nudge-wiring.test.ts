// 2026-10-22 P0 接线批守门：human-gate 收件箱消费＋nudge 挂载与消费全链锚定。
// 背景：两功能曾分别「服务端死路由+零前端调用」「路由从未挂载」端到端断裂。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8')

describe('HumanGate 前置批准接线', () => {
  it('GatekeeperSection 渲染前置批准队列且批准/驳回走 decideGate → decideHumanGate', () => {
    const src = read('../components/inbox/GatekeeperSection.vue')
    expect(src).toContain('fetchHumanGateRequests')
    expect(src).toContain('decideHumanGate')
    expect(src).toContain('data-testid="gk-hgate-approve"')
    expect(src).toContain('decideGate(r.id, \'approve\')')
    expect(src).toContain('decideGate(r.id, \'reject\')')
  })

  it('api 层契约：GET /api/approvals/human-gate ＋ POST /:id/decide', () => {
    const src = read('../../ia2/api/gatekeeper.ts')
    expect(src).toContain("authFetch('/api/approvals/human-gate')")
    expect(src).toContain('/decide')
  })

  it('清算目标代号人话化（信息降噪批）：PR-N 主文案人话、代号进 title', () => {
    const src = read('../components/inbox/GatekeeperSection.vue')
    expect(src).toContain('CLEARANCE_TARGET_LABEL')
    expect(src).toContain("'PR-7': '预设派发'")
    expect(src).toContain(':title="g.target"')
  })
})

describe('催办 owner 动态路由接线', () => {
  it('服务端：registerKanbanRoutes 挂载＋卡源异步 provider', () => {
    const nudge = read('../../../server/kanban/owner-routed-nudge.ts')
    expect(nudge).toContain('await cardProvider()')
    const idx = read('../../../server/kanban/index.ts')
    expect(idx).toContain('app.use(nudgeRouter.routes())')
    const patch = read('../../../../patches/676-server-kanban-nudge-mount.patch')
    expect(patch).toContain('registerKanbanRoutes(app)')
    expect(patch).toContain('setNudgeCardProvider')
  })

  it('客户端：看板批量催办按钮 → nudgeRoute 逐卡解析', () => {
    const bar = read('../../kanban/components/KanbanBulkBar.vue')
    expect(bar).toContain("emit('nudge')")
    const view = read('../../kanban/views/SwarmKanbanView.vue')
    expect(view).toContain('@nudge="handleNudge"')
    expect(view).toContain('nudgeRoute(cardId)')
    const api = read('../../ia2/api/gatekeeper.ts')
    expect(api).toContain("authFetch('/api/kanban/nudge/route'")
  })
})
