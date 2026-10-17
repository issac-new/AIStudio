// overlay/custom/client/cockpit/styles/theme-bridge.ts
// ECharts 语义色缓存 × 主题联动桥（前端一致性重构批 A6）。
// status-colors.resolveStatusColors 把 CSS 变量解析结果缓存在模块内，
// ECharts 不吃 var() 只吃实色——不失效缓存，切主题后图表语义色滞留旧主题。
// 上游 useTheme.applyCustomization 在 document 上派发 studio-theme-change
// （useTheme.ts:178），但亮暗/comic 切换只翻转 documentElement class 不派事件，
// 故双通道：事件监听 + MutationObserver 盯 class。双落点幂等（ia2/cockpit 两入口
// 都 import 本模块，ES 模块单例 + wired 旗保证只接一次）。
import { invalidateStatusColorCache } from './status-colors'

let wired = false

function wireThemeBridge(): void {
  if (wired || typeof document === 'undefined') return
  wired = true
  const invalidate = () => invalidateStatusColorCache()
  document.addEventListener('studio-theme-change', invalidate)
  new MutationObserver(invalidate).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
}

wireThemeBridge()
