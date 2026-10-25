<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { fetchStudioAnnouncements, type StudioAnnouncement } from '@/api/studio/announcements'
import { openUrlInDesktopBrowser } from '@/utils/desktop-browser'

const STORAGE_KEY = 'hermes-studio:seen-announcements:v1'
const { t, locale } = useI18n()
const announcement = ref<StudioAnnouncement | null>(null)
const seen = new Map<number, number>()
let mounted = false
let checking = false

const actionUrl = computed(() => {
  try {
    const url = new URL(announcement.value?.actionUrl || '')
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
})

function restoreSeen() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (stored.version !== 1 || !stored.entries || typeof stored.entries !== 'object') return
    for (const [id, time] of Object.entries(stored.entries)) {
      if (Number.isSafeInteger(Number(id)) && Number(id) > 0
        && Number.isSafeInteger(Number(time)) && Number(time) > 0) {
        seen.set(Number(id), Math.max(seen.get(Number(id)) || 0, Number(time)))
      }
    }
  } catch {
    // Keep in-memory deduplication when storage is unavailable.
  }
}

function isPageVisible() {
  return document.visibilityState !== 'hidden'
}

async function checkAnnouncements() {
  if (!mounted || checking || announcement.value || !isPageVisible()) return
  checking = true
  try {
    const response = await fetchStudioAnnouncements(locale.value)
    if (!mounted || !isPageVisible() || response.ok !== true || response.platform !== 'desktop') return
    // Select the latest before checking read state: never drain older notices.
    const latest = Array.isArray(response.list) ? response.list[0] : null
    if (!latest || !Number.isSafeInteger(latest.id) || latest.id <= 0
      || !Number.isSafeInteger(latest.updateTime) || latest.updateTime <= 0
      || typeof latest.title !== 'string' || !latest.title.trim()
      || typeof latest.content !== 'string' || !latest.content.trim()) return
    restoreSeen()
    if ((seen.get(latest.id) || 0) >= latest.updateTime) return
    announcement.value = latest
  } catch {
    // Announcements are optional; network failures must not interrupt Studio.
  } finally {
    checking = false
  }
}

function dismiss() {
  const current = announcement.value
  if (!current) return
  restoreSeen()
  seen.set(current.id, current.updateTime)
  try {
    const entries = Object.fromEntries([...seen].sort((a, b) => b[1] - a[1]).slice(0, 200))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries }))
  } catch {
    // The in-memory marker still prevents repeated prompts in this page.
  }
  announcement.value = null
}

function confirm() {
  const url = actionUrl.value
  if (url) {
    void openUrlInDesktopBrowser(url).then(opened => {
      if (!opened) window.open(url, '_blank', 'noopener,noreferrer')
    }).catch(() => undefined)
  }
  dismiss()
}

onMounted(() => {
  mounted = true
  void checkAnnouncements()
  window.addEventListener('focus', checkAnnouncements)
  document.addEventListener('visibilitychange', checkAnnouncements)
})

onBeforeUnmount(() => {
  mounted = false
  window.removeEventListener('focus', checkAnnouncements)
  document.removeEventListener('visibilitychange', checkAnnouncements)
})
</script>

<template>
  <!-- 非阻塞横幅：公告不再以模态遮罩拦截操作（推演走查实锤模态挡全界面），改为底部常驻条，确认后按 id 记账不再弹 -->
  <div
    v-if="announcement"
    class="announcement-banner"
    data-testid="studio-announcement"
    role="status"
    :aria-label="announcement.title"
  >
    <div class="banner-text">
      <span class="banner-title">{{ announcement.title }}</span>
      <span class="banner-content">{{ announcement.content }}</span>
    </div>
    <div class="banner-actions">
      <NButton v-if="actionUrl && announcement.dismissible" size="small" tertiary @click="dismiss">
        {{ t('announcements.later') }}
      </NButton>
      <NButton size="small" type="primary" @click="confirm">
        {{ t(actionUrl ? 'announcements.details' : 'announcements.gotIt') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.announcement-banner {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 4000;
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 920px;
  margin: 0 auto;
  padding: 12px 16px;
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  background: var(--card-color, #fff);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}
.banner-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.banner-title {
  font-weight: 600;
  font-size: 13.5px;
}
.banner-content {
  font-size: 12.5px;
  line-height: 1.6;
  opacity: 0.85;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: var(--line-height, 1.7);
}
.banner-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(10px * var(--spacing-scale, 1));
  flex-shrink: 0;
}
</style>
