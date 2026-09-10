<!-- overlay/custom/client/ia2/components/IaNav.vue -->
<!-- 六区域一级导航（左侧窄栏）：图标 + 文案，Pure Ink（选中 = 左侧 3px 色条 + 浅底）。
     键盘：g 后 1s 内按 1-6 跳对应区域（§7B.1 键盘可达）。 -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IA_AREAS } from '@/custom/ia2/routes'
import { useIaStore } from '@/custom/ia2/store/ia'

const { t } = useI18n()
const router = useRouter()
const store = useIaStore()

// ── g then 1-6 跳区域 ──
const G_ARM_TIMEOUT_MS = 1000
let gArmTimer: ReturnType<typeof setTimeout> | null = null
const gArmed = ref(false)

/** 输入目标守卫（审查 C-3）：聊天/输入框内打字不触发区域跳转（window 级监听
 *  会收到 input 冒泡的 keydown——"g2" 之类文本会被劫持成跳区） */
function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  return (
    target.isContentEditable === true ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing || isEditableTarget(event)) return
  if (event.key === 'g' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    gArmed.value = true
    if (gArmTimer) clearTimeout(gArmTimer)
    gArmTimer = setTimeout(() => { gArmed.value = false }, G_ARM_TIMEOUT_MS)
    return
  }
  const digit = Number(event.key)
  if (gArmed.value && digit >= 1 && digit <= IA_AREAS.length) {
    gArmed.value = false
    if (gArmTimer) clearTimeout(gArmTimer)
    const area = IA_AREAS[digit - 1]
    if (area) store.goToArea(router, area.key)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (gArmTimer) clearTimeout(gArmTimer)
})
</script>

<template>
  <nav class="ia-nav" aria-label="Primary areas">
    <button
      v-for="(area, index) in IA_AREAS"
      :key="area.key"
      type="button"
      class="ia-nav__item"
      :class="{ 'ia-nav__item--active': store.currentArea === area.key }"
      :title="`${index + 1} · ${t(area.labelKey)}`"
      @click="store.goToArea(router, area.key)"
    >
      <svg
        class="ia-nav__icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <!-- 总览：四格面板 -->
        <template v-if="area.key === 'overview'">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </template>
        <!-- 编排：分支 -->
        <template v-else-if="area.key === 'orchestrate'">
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="12" cy="18" r="2.5" />
          <path d="M6 8.5v1a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-1" />
          <path d="M12 13.5v2" />
        </template>
        <!-- 运行：播放 -->
        <template v-else-if="area.key === 'runs'">
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5l6 3.5-6 3.5z" />
        </template>
        <!-- 介入：收件箱 -->
        <template v-else-if="area.key === 'inbox'">
          <path d="M4 4h16v12h-5l-3 4-3-4H4z" />
          <path d="M4 12h4l2 3h4l2-3h4" />
        </template>
        <!-- 工作项：看板列 -->
        <template v-else-if="area.key === 'tasks'">
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="4" width="5" height="10" rx="1" />
          <rect x="17" y="4" width="4" height="13" rx="1" />
        </template>
        <!-- 沟通：对话气泡 -->
        <template v-else>
          <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
        </template>
      </svg>
      <span class="ia-nav__label">{{ t(area.labelKey) }}</span>
    </button>
  </nav>
</template>
