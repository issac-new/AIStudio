// overlay/custom/client/ide/utils/toast.ts
// 轻量 toast 基础设施（overlay 自给版）。
// naive-ui useMessage 需要全局 message-provider 包裹，upstream main.ts 未装
// （存储面板等处的 useMessage() 在无 provider 时返回 undefined 静默吞掉调用）。
// 因此 R2 起 IDE 侧通知统一走本模块：fixed 堆叠右下角、info/warning/error 三级、
// 默认 6s 自动消失、上限 5 条、同源窗口 alert 语义。
export type ToastLevel = 'info' | 'warning' | 'error'

const TOAST_MAX = 5
const TOAST_DURATION_MS = 6000
const CONTAINER_ID = 'overlay-toast-container'

let injectStylesOnce = false

function ensureContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let el = document.getElementById(CONTAINER_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = CONTAINER_ID
  el.setAttribute('data-testid', 'overlay-toast-container')
  document.body.appendChild(el)
  if (!injectStylesOnce) {
    injectStylesOnce = true
    const style = document.createElement('style')
    style.textContent = `
      #${CONTAINER_ID} {
        position: fixed; right: 16px; bottom: 40px; z-index: 2000;
        display: flex; flex-direction: column; gap: 8px; max-width: 360px;
        pointer-events: none;
      }
      .overlay-toast {
        pointer-events: auto; display: flex; gap: 8px; align-items: flex-start;
        padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.45;
        color: #d7dae0; background: #242832; border: 1px solid #3a3f4b;
        box-shadow: 0 6px 18px rgba(0,0,0,.35);
        animation: overlay-toast-in .18s ease-out;
      }
      .overlay-toast--warning { border-color: #f0a44c66; }
      .overlay-toast--error { border-color: #e06c7566; }
      .overlay-toast__close {
        margin-left: auto; border: none; background: none; color: #9aa0aa;
        font-size: 13px; line-height: 1; cursor: pointer; padding: 0 2px;
      }
      .overlay-toast__close:hover { color: #d7dae0; }
      @keyframes overlay-toast-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    `
    document.head.appendChild(style)
  }
  return el
}

/** 弹出一条 toast；返回手动关闭函数。durationMs≤0 表示不自动消失。 */
export function showToast(text: string, level: ToastLevel = 'info', durationMs = TOAST_DURATION_MS): () => void {
  const container = ensureContainer()
  if (!container) return () => {}
  while (container.children.length >= TOAST_MAX) {
    container.firstElementChild?.remove()
  }
  const el = document.createElement('div')
  el.className = `overlay-toast overlay-toast--${level}`
  el.setAttribute('data-level', level)
  const body = document.createElement('span')
  body.textContent = text
  el.appendChild(body)
  const close = document.createElement('button')
  close.className = 'overlay-toast__close'
  close.type = 'button'
  close.setAttribute('aria-label', 'close')
  close.textContent = '×'
  el.appendChild(close)
  const dismiss = () => {
    if (el.isConnected) el.remove()
  }
  close.addEventListener('click', dismiss)
  container.appendChild(el)
  if (durationMs > 0) setTimeout(dismiss, durationMs)
  return dismiss
}
