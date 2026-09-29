<script setup lang="ts">
// IdeBrowserPane — IDE 浏览器页签（Computer Use 接线轮，2026-09-29）。
//
// 此前该页签嵌的是上游 DesktopBrowserView（profile/下载设置页，不渲染网页）。
// 本组件换成真·内置浏览器（DesktopBrowserPanel）：Electron WebContentsView，
// 代理可经 BrowserBroker/ekko_studio_browser MCP 工具集驱动（导航/快照/交互/
// 截图），人工接管（takeOver）即收回控制权——与 ChatPanel 同一运行时实例。
// 标注提交复用 ChatPanel 同链：createBrowserAnnotationAttachment → 活跃会话
// sendMessage（IDE 会话列与 ChatPanel 共用 chatStore）。
//
// 无桥降级（浏览器 dev 环境）：如实空态说明，不嵌设置页冒充浏览器。
import { computed, defineAsyncComponent } from 'vue'
import { useMessage } from 'naive-ui'
import { useChatStore } from '@/stores/hermes/chat'
import { hasDesktopBrowserBridge } from '@/utils/desktop-bridge'
import { createBrowserAnnotationAttachment, type BrowserAnnotationSubmission } from '@/utils/browser-annotation-submit'

const DesktopBrowserPanel = defineAsyncComponent(async () =>
  (await import('@/components/hermes/chat/DesktopBrowserPanel.vue')).default)

const message = useMessage()
const chatStore = useChatStore()

const available = computed(() => hasDesktopBrowserBridge())

/** 标注提交：进当前活跃会话（无会话时如实提示不静默丢弃）。 */
async function submitAnnotation(payload: BrowserAnnotationSubmission): Promise<boolean> {
  if (!chatStore.activeSessionId) {
    message.warning('当前无活跃会话——标注需提交到一个会话')
    return false
  }
  const attachment = createBrowserAnnotationAttachment(payload)
  await chatStore.sendMessage('', [attachment])
  return true
}
</script>

<template>
  <div class="ide-browser" data-testid="ide-browser-pane">
    <DesktopBrowserPanel v-if="available" :visible="true" :submit="submitAnnotation" />
    <div v-else class="ide-browser__empty" data-testid="ide-browser-unavailable">
      <div class="ide-browser__empty-title">内置浏览器需要桌面应用运行</div>
      <div class="ide-browser__empty-body">
        当前是浏览器/dev 环境，Electron 内置浏览器（代理可驱动的真浏览器）不可用。
        桌面应用中打开本页签即可：AI 代理可导航/点击/截图，你的任何手动操作会立即收回代理控制权。
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-browser { height: 100%; display: flex; flex-direction: column; }
.ide-browser__empty {
  flex: 1; display: flex; flex-direction: column; gap: 8px; justify-content: center;
  padding: 24px; color: var(--text-color-3, #999); text-align: center;
}
.ide-browser__empty-title { font-weight: 600; color: var(--text-color-2, #555); }
.ide-browser__empty-body { font-size: 12px; line-height: 1.8; }
</style>
