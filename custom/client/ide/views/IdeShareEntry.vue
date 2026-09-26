<script setup lang="ts">
// IdeShareEntry — 会话共享入口（session-share 客户端半边，R6 服务端三端点调用方）。
// 活跃会话才可用；点击创建 view 只读共享链接并写剪贴板；链接可点击重复制。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createSessionShare, type ShareLink } from '../utils/session-share'

const props = defineProps<{ sessionId: string }>()
const { t } = useI18n()

const shareLink = ref<ShareLink | null>(null)
const sharing = ref(false)

async function shareSession(): Promise<void> {
  if (!props.sessionId || sharing.value) return
  sharing.value = true
  try {
    shareLink.value = await createSessionShare(props.sessionId, 'view')
    void navigator.clipboard?.writeText(shareLink.value.url).catch(() => undefined)
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <span class="ide-share">
    <button
      type="button"
      class="ide-share__btn"
      data-testid="ide-chat-share"
      :disabled="!sessionId || sharing"
      :title="shareLink ? shareLink.url : t('ide.chatShare')"
      @click="shareSession"
    >⇗</button>
    <span
      v-if="shareLink"
      class="ide-share__link"
      data-testid="ide-chat-share-link"
      :title="shareLink.url"
      @click="shareSession"
    >{{ shareLink.url }}</span>
  </span>
</template>

<style scoped lang="scss">
.ide-share {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ide-share__btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
}

.ide-share__btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ide-share__link {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--primary-color, #18a058);
  cursor: pointer;
}
</style>
