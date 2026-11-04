// overlay/custom/client/ia2/__tests__/ia-shell-header-mask-order-guard.test.ts
// 守门（2026-11-04 走查 bug4）：页头弹层（通知下拉/态势面板）与全屏 mask 同
// z-index（--ia-z-header-panel），同层级下 DOM 后者盖前者——mask 若渲染在面板
// 之后，会把面板整个盖住，面板内任何点击都落在透明遮罩上→弹层一触即关
//（「消息」页签点击即关的根因）。jsdom 无真实层叠，取源码级顺序断言。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const header = readFileSync(
  resolve(__dirname, '../components/IaShellHeader.vue'),
  'utf8',
)

/** template 区内两选择器的出现顺序：before 必须在 after 之前。 */
function assertOrder(before: RegExp, after: RegExp, label: string): void {
  const a = before.exec(header)
  const b = after.exec(header)
  if (!a || !b) throw new Error(`定位失败（${label}）：before=${a?.index} after=${b?.index}`)
  expect(a.index, `${label}：mask 必须在面板之前渲染`).toBeLessThan(b.index)
}

describe('页头弹层遮罩序（bug4 守门）', () => {
  it('态势面板：mask 在 sitpanel 之前', () => {
    assertOrder(
      /class="cockpit-top__mask"[^>]*@click="sitPanel = null"/,
      /class="cockpit-top__sitpanel"/,
      'sitPanel',
    )
  })

  it('通知下拉：mask 在 NotifyDropdownPanel 之前', () => {
    assertOrder(
      /class="cockpit-top__mask"[^>]*@click="showNotify = false"/,
      /<NotifyDropdownPanel/,
      'notify',
    )
  })

  it('无残留的面板后置 mask（每组只一个遮罩）', () => {
    const maskTotal = (header.match(/cockpit-top__mask/g) ?? []).length
    // 模板 2 处（sit/notify）+ scoped CSS 1 处定义 = 3；多出即回归后置遮罩
    expect(maskTotal).toBe(3)
  })
})
