<script setup lang="ts">
// ImagePreviewOverlay — 聊天图片查看器（zcode markdownImage 对齐）：
// 上一张/下一张（图集模式）、放大/缩小（按钮 + 滚轮）、下载、Esc/背景点击关闭。
// 兼容旧用法：仅传 src/alt 时为单图模式（无前后导航）。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  /** 图集模式：可前后导航的 url 列表（src 须为其中之一） */
  images?: string[]
  /** 图集模式初始索引 */
  startIndex?: number
  /** 下载文件名（缺省从 url 猜） */
  downloadName?: string
}>(), {
  alt: '',
  images: undefined,
  startIndex: 0,
  downloadName: undefined,
})

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const gallery = computed(() => (props.images?.length ? props.images : [props.src]))
const idx = ref(Math.max(0, Math.min(props.startIndex, gallery.value.length - 1)))
const scale = ref(1)

const currentSrc = computed(() => gallery.value[idx.value] ?? props.src)
const inGallery = computed(() => gallery.value.length > 1)

function clampScale(next: number): void {
  scale.value = Math.min(4, Math.max(0.25, Math.round(next * 100) / 100))
}

function prev(): void {
  if (!gallery.value.length) return
  idx.value = (idx.value - 1 + gallery.value.length) % gallery.value.length
  scale.value = 1
}

function next(): void {
  if (!gallery.value.length) return
  idx.value = (idx.value + 1) % gallery.value.length
  scale.value = 1
}

function zoomIn(): void {
  clampScale(scale.value * 1.25)
}

function zoomOut(): void {
  clampScale(scale.value / 1.25)
}

function guessName(url: string): string {
  if (props.downloadName) return props.downloadName
  const m = url.match(/([^/?#]+)(?:[?#].*)?$/)
  return m?.[1] || 'image'
}

function download(): void {
  const a = document.createElement('a')
  a.href = currentSrc.value
  a.download = guessName(currentSrc.value)
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'ArrowLeft') { event.preventDefault(); prev() }
  else if (event.key === 'ArrowRight') { event.preventDefault(); next() }
  else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomIn() }
  else if (event.key === '-') { event.preventDefault(); zoomOut() }
}

function handleWheel(event: WheelEvent) {
  event.preventDefault()
  clampScale(scale.value * (event.deltaY < 0 ? 1.12 : 1 / 1.12))
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="image-preview-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="alt"
      @click.self="emit('close')"
      @wheel.prevent="handleWheel"
    >
      <img
        :src="currentSrc"
        :alt="alt"
        class="image-preview-img"
        :style="{ transform: `scale(${scale})` }"
        @dblclick="scale = 1"
      />

      <div class="image-preview-toolbar" @click.stop>
        <button v-if="inGallery" type="button" class="image-preview-btn" :title="t('chat.imagePrev')" :aria-label="t('chat.imagePrev')" @click="prev">‹</button>
        <button type="button" class="image-preview-btn" :title="t('chat.imageZoomOut')" :aria-label="t('chat.imageZoomOut')" @click="zoomOut">−</button>
        <span class="image-preview-scale">{{ Math.round(scale * 100) }}%</span>
        <button type="button" class="image-preview-btn" :title="t('chat.imageZoomIn')" :aria-label="t('chat.imageZoomIn')" @click="zoomIn">+</button>
        <button type="button" class="image-preview-btn" :title="t('chat.imageDownload')" :aria-label="t('chat.imageDownload')" @click="download">⤓</button>
        <button v-if="inGallery" type="button" class="image-preview-btn" :title="t('chat.imageNext')" :aria-label="t('chat.imageNext')" @click="next">›</button>
        <button type="button" class="image-preview-btn image-preview-btn--close" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')">✕</button>
      </div>

      <div v-if="inGallery" class="image-preview-counter">{{ idx + 1 }} / {{ gallery.length }}</div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5vh 5vw;
  background: rgba(0, 0, 0, 0.85);
}

.image-preview-img {
  display: block;
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: var(--radius-component, 6px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  transition: transform 0.12s ease;
  user-select: none;
}

.image-preview-toolbar {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(20, 22, 26, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.image-preview-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e6e6e6;
  font-size: 16px;
  cursor: pointer;

  &:hover { background: rgba(255, 255, 255, 0.12); }

  &--close:hover { background: rgba(220, 60, 60, 0.5); }
}

.image-preview-scale {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  color: #9aa0aa;
}

.image-preview-counter {
  position: absolute;
  top: 18px;
  right: 22px;
  font-size: 12px;
  color: #9aa0aa;
  background: rgba(20, 22, 26, 0.8);
  border-radius: 6px;
  padding: 3px 9px;
}
</style>
