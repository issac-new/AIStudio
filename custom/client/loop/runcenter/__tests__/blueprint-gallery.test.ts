// overlay/custom/client/loop/runcenter/__tests__/blueprint-gallery.test.ts
// 蓝图画廊守门（2026-10-02 三受阻项解封 #11）：组件接线+槽位控件映射+API 客户端
// 结构（真数据链由走查脚本实弹：16 蓝图/建任务/422 校验）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../../..')
const comp = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/loop/runcenter/components/BlueprintGalleryPanel.vue'), 'utf8')
const api = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ia2/api/runtime-caps.ts'), 'utf8')
const view = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/loop/runcenter/views/RunCenterView.vue'), 'utf8')
const ide = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ide/components/IdeHistoryBrowser.vue'), 'utf8')

describe('蓝图画廊（#11 解封）', () => {
  it('运行中心 runs 页签挂载（GoalLoop 面板之后第二横条）', () => {
    expect(view).toContain('BlueprintGalleryPanel')
    expect(view.indexOf('GoalLoopStandingPanel')).toBeLessThan(view.indexOf('BlueprintGalleryPanel'))
  })

  it('数据链=网关代理（fetchGatewayBlueprints/instantiate）+ 通道缺席诚实降级', () => {
    expect(comp).toContain('fetchGatewayBlueprints')
    expect(comp).toContain('instantiateGatewayBlueprint')
    expect(comp).toContain('blueprint-absent')
  })

  it('槽位控件四型映射（time/enum/weekdays/text）+ 422 内联错误呈现', () => {
    for (const c of ["'time'", "'enum'", "'weekdays'", "'text'"]) expect(comp).toContain(c)
    expect(comp).toContain('blueprint-error')
  })

  it('API 客户端：蓝图/实例化/会话/分叉/状态五出口 + authFetch 鉴权', () => {
    for (const fn of ['fetchGatewayBlueprints', 'instantiateGatewayBlueprint', 'fetchGatewaySessions', 'forkGatewaySession', 'fetchGatewayStatus']) {
      expect(api).toContain(`function ${fn}`)
    }
  })
})

describe('会话分叉接真（#7 解封）', () => {
  it('IdeHistoryBrowser Fork=网关真分叉（confirm 双确认+成功 switchSession+404 降级剪贴板）', () => {
    expect(ide).toContain('forkGatewaySession')
    expect(ide).toContain('historyForkConfirm')
    expect(ide).toContain('switchSession')
    expect(ide).toContain('/fork ')  // 404 降级路径保留
    expect(ide).toContain('ide-history-fork')
  })

  it('分叉词条（confirm 语义/成功/降级）入消息面字典 zh+en', () => {
    const dict = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ia2/i18n-msg-surface.ts'), 'utf8')
    for (const k of ['historyForkConfirm', 'historyForkDone', 'historyForkFallback']) {
      expect(dict.match(new RegExp(`${k}: '`, 'g'))?.length, `${k} 须 zh/en 双份`).toBe(2)
    }
  })
})
