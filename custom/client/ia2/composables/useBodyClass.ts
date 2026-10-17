// overlay/custom/client/ia2/composables/useBodyClass.ts
// body 类引用计数（2026-10-18 壳层收口）：上游 StudioNavigationRail 在 /app 普通
// 页面仍然挂载，与新 IaSideNav 形成双左栏。ia-center-full 是既有的隐藏规则，
// 但此前只由 WorkbenchView/SimCenterView 各自 add/remove——两个页面互相卸载
// 会把对方需要的类摘掉，且 journey/阶段页从未加过。
// 本模块把 add/remove 收敛成引用计数：谁 retain 谁 release，计数归零才移除。
const counts = new Map<string, number>()

export function retainBodyClass(name: string): () => void {
  if (typeof document === 'undefined') return () => {}
  counts.set(name, (counts.get(name) ?? 0) + 1)
  document.body.classList.add(name)
  let released = false
  return () => {
    if (released) return
    released = true
    const next = (counts.get(name) ?? 1) - 1
    if (next <= 0) {
      counts.delete(name)
      document.body.classList.remove(name)
    } else {
      counts.set(name, next)
    }
  }
}
