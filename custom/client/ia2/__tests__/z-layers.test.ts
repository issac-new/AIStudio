// overlay/custom/client/ia2/__tests__/z-layers.test.ts
// B6 弹层账本守门：总序单调递增 + 页头面板/透明收层必须低于 modal
// （否则全屏透明层压住弹窗与页面按钮，即"按钮点不到"根因）+ 与 ia2.scss
// 的 --ia-z-* 变量成对同值（账本漂移在此拦下，不靠走查）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Z_LAYERS } from '../z-layers'

const ORDER = ['surface', 'drawer', 'fullscreen', 'headerPanel', 'overlayClear', 'modal', 'toast'] as const

describe('ia2/z-layers 弹层等级账本（B6）', () => {
  it('总序单调递增：surface < drawer < fullscreen < headerPanel < overlayClear < modal < toast', () => {
    for (let i = 1; i < ORDER.length; i++) {
      expect(Z_LAYERS[ORDER[i - 1]], `${ORDER[i - 1]} 应低于 ${ORDER[i]}`).toBeLessThan(Z_LAYERS[ORDER[i]])
    }
  })

  it('页头面板与透明点击收层必须低于 modal（弹窗不被遮罩压死）', () => {
    expect(Z_LAYERS.headerPanel).toBeLessThan(Z_LAYERS.modal)
    expect(Z_LAYERS.overlayClear).toBeLessThan(Z_LAYERS.modal)
  })

  it('modal 保持 1000（matrix 弹窗沿用）、toast 最高', () => {
    expect(Z_LAYERS.modal).toBe(1000)
    expect(Z_LAYERS.toast).toBe(2000)
  })

  it('与 ia2.scss 的 --ia-z-* 变量成对同值', () => {
    const scssPath = fileURLToPath(new URL('../styles/ia2.scss', import.meta.url))
    const scss = readFileSync(scssPath, 'utf8')
    for (const [name, value] of Object.entries(Z_LAYERS)) {
      const cssVar = `--ia-z-${name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`
      expect(scss, `${cssVar} 应与账本同值 ${value}`).toMatch(new RegExp(`${cssVar}:\\s*${value};`))
    }
  })
})
