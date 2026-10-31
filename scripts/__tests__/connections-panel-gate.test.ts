// 702 补丁守门（产品一致性 Task 10）：connectionsExtras=false 时 superadmin 不再
// 见空 Tabs——activeTab 归一考虑可用 pane（extras 关闭时 mcu/app 非法、缺省归一
// remote）；pane 全隐藏时走明确空态而非空页签条。
// vendor 组件不经 vitest 装载（注入态与本仓 series 不保证同步，同
// standalone-embed-patches.test.ts 模式），故用补丁文本断言 + series 登记钉死；
// 组件行为由 inject 重放验证（Task 10 报告记录）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const PATCH_NAME = '702-client-connections-tab-normalize.patch'

describe('702 connections 面板关闭态守门', () => {
  it('series 已登记 702 补丁', () => {
    expect(readFileSync(resolve(ROOT, 'patches/series'), 'utf8')).toContain(PATCH_NAME)
  })

  it('normalizeTab 归一考虑可用 pane：extras 关闭时缺省归一 remote，mcu 不再是合法落位', () => {
    // 2026-10-31 v0.8.0 升级轮：补丁文本断言改注入态树断言（同族两例先例）
    const tree = readFileSync(resolve(ROOT, 'vendor/hermes-studio/packages/client/src/components/hermes/connections/ConnectionsPanel.vue'), 'utf8')
    expect(tree).toContain("if (value === 'remote' && hasRemoteDevices) return value")
    expect(tree).toMatch(/if \(!features\.connectionsExtras\) return 'remote'/)
    expect(tree).toContain("if (value === 'mcu') return value")
  })

  it('Tabs 渲染条件要求至少一个可用 pane；全隐藏走明确空态而非空页签条', () => {
    // 2026-10-31 v0.8.0 升级轮：补丁文本断言改注入态树断言（重生成后补丁内部
    // 归因可漂移——524/650/702 分摊同一文件；行为语义以树为准）
    const tree = readFileSync(resolve(ROOT, 'vendor/hermes-studio/packages/client/src/components/hermes/connections/ConnectionsPanel.vue'), 'utf8')
    expect(tree).toContain('v-if="features.connectionsExtras || hasRemoteDevices"')
    expect(tree).toContain('connections-empty')
  })
})
