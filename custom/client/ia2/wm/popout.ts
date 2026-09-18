// overlay/custom/client/ia2/wm/popout.ts
// 窗口管理（2026-09-18 统一导航 /goal 追加）：独立窗口弹出与合并回驾驶舱。
//
// 弹出通路：桌面（Electron）走 IPC hermes-desktop:open-panel-window（主进程建
// BrowserWindow + preload + --hermes-window-kind=panel，与既有 chat 弹窗同模式）；
// web/dev 环境降级 window.open（同路由 + standalone=1）。
// 合并回流：跨窗口通信用 localStorage storage 事件（同源多窗口天然广播，
// Electron 多 BrowserWindow 同样生效）——独立窗口写信号后自关，主窗监听导航。
import { desktopBridge } from '@/utils/desktop-bridge'

/** standalone 标记：路由 query 参数，弹出窗口据此渲染精简壳 */
export const STANDALONE_QUERY_KEY = 'standalone'

/** 合并回驾驶舱信号：localStorage key（storage 事件跨窗口广播） */
export const MERGE_BACK_KEY = 'swarmstudio:wm-merge-back'

export interface PopoutRequest {
  /** 完整路由路径（含 query，如 /app/ops?tab=runs） */
  path: string
  width?: number
  height?: number
}

/** 给路径合并 standalone=1（保留既有 query；路径须以 / 开头） */
export function withStandaloneQuery(path: string): string {
  if (!path.startsWith('/')) return path
  const [rawPath, rawQuery = ''] = path.split('?')
  const params = new URLSearchParams(rawQuery)
  params.set(STANDALONE_QUERY_KEY, '1')
  return `${rawPath}?${params.toString()}`
}

/** 剥掉 standalone 参数（合并回主窗时恢复普通挂载态） */
export function stripStandaloneQuery(path: string): string {
  const [rawPath, rawQuery = ''] = path.split('?')
  const params = new URLSearchParams(rawQuery)
  params.delete(STANDALONE_QUERY_KEY)
  const query = params.toString()
  return query ? `${rawPath}?${query}` : rawPath
}

/** 弹出独立窗口（桌面 IPC 优先，web 降级 window.open） */
export async function openPanelWindow(req: PopoutRequest): Promise<void> {
  const target = withStandaloneQuery(req.path)
  const bridge = desktopBridge()
  if (bridge?.isDesktop && typeof bridge.openPanelWindow === 'function') {
    await bridge.openPanelWindow(target, { width: req.width, height: req.height })
    return
  }
  const url = `${location.origin}${location.pathname}#${target}`
  window.open(
    url,
    '_blank',
    `popup=yes,width=${req.width ?? 1100},height=${req.height ?? 720}`,
  )
}

/** 独立窗口内请求合并回主窗口：广播信号后自关（窗口由脚本打开，可 close） */
export function requestMergeBack(path: string): void {
  const target = stripStandaloneQuery(path)
  try {
    localStorage.setItem(
      MERGE_BACK_KEY,
      JSON.stringify({ path: target, at: Date.now() }),
    )
  } catch {
    // localStorage 不可用（隐私模式等）时仅自关，主窗靠手动导航
  }
  window.close()
}

/** 主窗监听合并回流信号；返回取消函数 */
export function listenMergeBack(handler: (path: string) => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== MERGE_BACK_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as { path?: unknown }
      if (typeof parsed.path === 'string' && parsed.path.startsWith('/')) {
        handler(parsed.path)
      }
    } catch {
      // 无效信号忽略
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
