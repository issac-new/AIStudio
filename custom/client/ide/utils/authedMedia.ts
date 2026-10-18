// overlay/custom/client/ide/utils/authedMedia.ts
// 本地媒体鉴权重写：Markdown 渲染的本地图片/音频/视频先以 data-local-media
// 占位（不含 token），本组合式函数在 IDE 聊天容器内用 Authorization fetch
// 换成 blob URL。
//
// 背景（2026-10-18 回归）：安全加固禁用 query token 后，<img>/<audio>/<video>
// 的 src 仍带 API key 且请求 401。fetch 能带 header，故把媒体请求从浏览器
// 直连改为鉴权 fetch + blob，URL 不再泄露 token。
import { onMounted, onUnmounted, type Ref } from 'vue'
import { getDownloadUrl } from '@/api/studio/download'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { authFetch } from './auth-fetch'

const PROCESSED = 'data-media-rewritten'
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** 下载 URL → 去掉 query token（fetch 走 header） */
export function stripDownloadToken(url: string): string {
  const [base, query = ''] = url.split('?')
  if (!query) return url
  const params = new URLSearchParams(query)
  params.delete('token')
  const rest = params.toString()
  return rest ? `${base}?${rest}` : base
}

/** 占位元素 → 鉴权 fetch URL（workspaceRoot 模式带 root） */
export function mediaFetchUrl(path: string, root?: string | null): string {
  return stripDownloadToken(getDownloadUrl(path, undefined, null, root ?? undefined))
}

export function useAuthedMediaRewrite(rootRef: Ref<HTMLElement | null>) {
  const { root } = useIdeWorkspace()
  let observer: MutationObserver | null = null
  let scheduled = false
  const objectUrls = new Set<string>()

  async function rewriteOne(el: Element): Promise<void> {
    const path = el.getAttribute('data-local-media') || ''
    const existing = el.getAttribute('src') || ''
    const url = path ? mediaFetchUrl(path, root.value) : existing.includes('/api/studio/files/download') ? stripDownloadToken(existing) : ''
    if (!url) return
    el.setAttribute(PROCESSED, '1')
    try {
      const res = await authFetch(url)
      if (!res.ok) return
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      objectUrls.add(objectUrl)
      el.setAttribute('src', objectUrl)
      if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') (el as HTMLMediaElement).load?.()
    } catch {
      // 保持占位/空态，不阻塞消息渲染
    }
  }

  function rewrite(): void {
    const container = rootRef.value
    if (!container) return
    const nodes = container.querySelectorAll(`[data-local-media]:not([${PROCESSED}]), img[src*="/api/studio/files/download"]:not([${PROCESSED}]), audio[src*="/api/studio/files/download"]:not([${PROCESSED}]), video[src*="/api/studio/files/download"]:not([${PROCESSED}])`)
    for (const node of Array.from(nodes)) void rewriteOne(node)
  }

  function schedule(): void {
    if (scheduled) return
    scheduled = true
    const run = () => { scheduled = false; rewrite() }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 0)
  }

  onMounted(() => {
    void rewrite()
    if (typeof MutationObserver === 'undefined') return
    observer = new MutationObserver(schedule)
    const container = rootRef.value
    if (container) observer.observe(container, { childList: true, subtree: true })
  })
  onUnmounted(() => {
    observer?.disconnect()
    observer = null
    for (const url of objectUrls) URL.revokeObjectURL(url)
    objectUrls.clear()
  })

  return { rewrite, schedule, TRANSPARENT_GIF }
}

// ── 全局重写器（非 IDE 聊天页共用）──
// patch 660 v2 起 Markdown 本地媒体默认渲染占位（data-local-media），任何宿主
// 没有自己的容器级重写器时由本观察器兜底：body 级 MutationObserver 用
// Authorization fetch 换 blob。IDE 容器重写器带 workspace root，先到先改
// （data-media-rewritten 标记互斥），全局兜底不会重复拉取。
let globalInstalled = false

export function installGlobalAuthedMediaRewrite(): void {
  if (globalInstalled || typeof window === 'undefined') return
  globalInstalled = true
  const objectUrls = new Set<string>()
  let scheduled = false

  async function rewriteOne(el: Element): Promise<void> {
    const path = el.getAttribute('data-local-media') || ''
    if (!path) return
    el.setAttribute(PROCESSED, '1')
    try {
      const res = await authFetch(mediaFetchUrl(path, null))
      if (!res.ok) return
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      objectUrls.add(objectUrl)
      el.setAttribute('src', objectUrl)
      if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
        el.setAttribute('preload', 'metadata')
        ;(el as HTMLMediaElement).load?.()
      }
    } catch { /* 保持占位，不打断消息渲染 */ }
  }

  function rewrite(): void {
    const nodes = document.body?.querySelectorAll(`[data-local-media]:not([${PROCESSED}])`) ?? []
    for (const node of Array.from(nodes)) void rewriteOne(node)
  }

  function schedule(): void {
    if (scheduled) return
    scheduled = true
    const run = () => { scheduled = false; rewrite() }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 0)
  }

  void rewrite()
  if (typeof MutationObserver === 'undefined') return
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('beforeunload', () => {
    observer.disconnect()
    for (const url of objectUrls) URL.revokeObjectURL(url)
  })
}
