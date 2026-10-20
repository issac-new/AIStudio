// B6 布局机械守门：关键断点、横向滚动兜底与遮罩层级不允许被后续样式漂移移除。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8')

describe('cockpit layout guards', () => {
  it('工作台 ≤1100px 单列化，并隐藏拖拽分割条', () => {
    const s = read('views/WorkbenchView.vue')
    expect(s).toContain('@media (max-width: 1100px)')
    expect(s).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(s).toContain('.wb__split { display: none; }')
  })

  it('推演总览 ≤1100px 右栏退出 sticky，KPI 自动折列', () => {
    const s = read('views/sim/OverviewPanel.vue')
    expect(s).toContain('.ov__side { position: static; max-height: none; overflow: visible; }')
    expect(s).toContain('repeat(auto-fit, minmax(180px, 1fr))')
    expect(s).not.toMatch(/\.ov__lamp[\s\S]{0,180}white-space:\s*nowrap/)
  })

  it('追溯/交付表格保留横向滚动兜底，长文件名省略', () => {
    const trace = read('views/sim/TracePanel.vue')
    const delivery = read('views/sim/DeliveryPanel.vue')
    expect(trace).toContain('min-width: 0; overflow-x: auto;')
    expect(trace).toContain('.trc__table { width: 100%; min-width: 720px;')
    expect(delivery).toContain('min-width: 0; overflow-x: auto;')
    expect(delivery).toContain('.dlv__table { width: 100%; min-width: 680px;')
    expect(delivery).toContain('text-overflow: ellipsis')
  })

  it('抽屉与浮层不再依赖写死宽度/位置', () => {
    const attention = read('components/AttentionStrip.vue')
    const drawer = read('../kanban/components/KanbanTaskDrawer.vue')
    const tabs = read('views/stage/StageShell.vue')
    const gov = read('components/gov/GovOverlay.vue')
    expect(attention).toContain('.ia-attn { position: relative;')
    expect(attention).toContain('right: 0; z-index: var(--ia-z-header-panel);')
    expect(drawer).toContain('position: sticky;')
    expect(drawer).not.toContain('width: 720px;')
    expect(tabs).toContain("data-testid=\"stage-tabs-scroll\"")
    expect(tabs).toContain('.stg__tabs--end::after { display: none; }')
    expect(gov).toContain('@media (max-width: 900px)')
  })

  it('IDE 归档组有内滚上限，不再画穿侧栏', () => {
    expect(read('../ide/views/IdeTaskSidebar.vue')).toContain('.ide-taskbar__archived-body { padding-bottom: 4px; max-height: 320px; overflow-y: auto; }')
  })
})
