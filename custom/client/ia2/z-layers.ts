// overlay/custom/client/ia2/z-layers.ts
// 弹层等级账本（数值只在此处与 ia2.scss 的 CSS 变量成对出现）。
// 总序：surface(区块 chrome/暗化遮罩) < drawer < fullscreen < header-panel
// < overlay-clear(全屏透明点击收层) < modal < toast。
// B6 裁定：页头面板与透明点击收层必须低于 modal——否则全屏透明层
// (曾 998/999/1000) 会压住矩阵弹窗(z1000)与页面按钮，出现"点不到"。
export const Z_LAYERS = {
  surface: 40,
  drawer: 600,
  fullscreen: 700,
  headerPanel: 800,
  overlayClear: 900,
  modal: 1000,
  toast: 2000,
} as const

export type ZLayerName = keyof typeof Z_LAYERS
