<script setup lang="ts">
import { computed, ref } from 'vue'
import { humanDateTime, jsonEntries } from '../../format'

// 锚点抽屉（R7）：全产品唯一反查交互——点任何数字/判词直达证据原文。
// 右滑出，宽 480px；证据原文与锚类型/锚号只读展示，跳转由消费方接锚处理。
const props = defineProps<{
  open: boolean
  title?: string
  anchorType?: 'event' | 'commit' | 'card' | 'room' | null
  anchorId?: string | null
  evidence?: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const ANCHOR_LABEL: Record<NonNullable<typeof props.anchorType>, string> = {
  event: '事件',
  commit: '提交',
  card: '卡',
  room: '房间',
}

const entries = computed(() => jsonEntries(props.evidence))
const normalized = computed(() => entries.value.map(e => ({
  key: e.key,
  value: /^\d{4}-\d{2}-\d{2}[ T]/.test(e.value) || /^\d{10,13}$/.test(e.value) ? humanDateTime(e.value) : e.value,
})))
const copied = ref(false)
async function copyRaw(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.evidence ?? '')
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
  } catch { copied.value = false }
}
</script>

<template>
  <!-- 回归轮残留 R4：关闭即卸载（原常驻 + aria-hidden——三签各挂一件，关闭态
       仍有 0×0 role=dialog 进可访问性树，读屏噪音）。收起动画换语义洁净。 -->
  <div
    v-if="props.open"
    class="sim-anchor-drawer"
    data-testid="sim-anchor-drawer"
    role="dialog"
  >
    <div class="sim-anchor-drawer__head">
      <span class="sim-anchor-drawer__title" data-testid="sim-anchor-drawer-title">{{ props.title || '证据原文' }}</span>
      <button
        class="sim-anchor-drawer__close"
        data-testid="sim-anchor-drawer-close"
        type="button"
        @click="emit('close')"
      >关闭</button>
    </div>
    <div v-if="props.anchorType && props.anchorId" class="sim-anchor-drawer__anchor" data-testid="sim-anchor-drawer-anchor">
      {{ ANCHOR_LABEL[props.anchorType] }}锚：{{ props.anchorId }}
    </div>
    <div v-else class="sim-anchor-drawer__anchor sim-anchor-drawer__anchor--absent" data-testid="sim-anchor-drawer-anchor-absent">
      无锚
    </div>
    <div class="sim-anchor-drawer__body" data-testid="sim-anchor-drawer-evidence">
      <dl v-if="normalized.length" class="sim-anchor-drawer__fields">
        <div v-for="row in normalized" :key="row.key" class="sim-anchor-drawer__field">
          <dt>{{ row.key }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
      <p v-else class="sim-anchor-drawer__absent">证据原文缺席</p>
      <details v-if="props.evidence" class="sim-anchor-drawer__raw">
        <summary>技术原文</summary>
        <pre>{{ props.evidence }}</pre>
        <button type="button" class="sim-anchor-drawer__copy" data-testid="sim-anchor-drawer-copy" @click="copyRaw">{{ copied ? '已复制' : '复制原文' }}</button>
      </details>
    </div>
  </div>
</template>

<style scoped>
.sim-anchor-drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 480px;
  box-sizing: border-box;
  padding: 12px 16px;
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
  z-index: var(--ia-z-drawer);
  overflow-y: auto;
}
.sim-anchor-drawer__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.sim-anchor-drawer__title {
  font-weight: 600;
}
.sim-anchor-drawer__close {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 4px;
  padding: 2px 10px;
  cursor: pointer;
}
.sim-anchor-drawer__anchor {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  margin-bottom: 8px;
}
.sim-anchor-drawer__anchor--absent {
  color: var(--text-muted);
}
.sim-anchor-drawer__evidence {
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  background: rgba(127, 127, 127, 0.12);
  border-radius: 6px;
  padding: 10px;
  margin: 0;
}
.sim-anchor-drawer__body { display: flex; flex-direction: column; gap: 8px; }
.sim-anchor-drawer__fields { margin: 0; display: grid; grid-template-columns: minmax(72px, auto) minmax(0, 1fr); gap: 6px 10px; }
.sim-anchor-drawer__field { display: contents; }
.sim-anchor-drawer__field dt { color: var(--text-muted); font-size: 11.5px; }
.sim-anchor-drawer__field dd { margin: 0; min-width: 0; font-size: 12px; word-break: break-word; white-space: pre-wrap; }
.sim-anchor-drawer__absent { margin: 0; color: var(--text-muted); font-size: 12px; }
.sim-anchor-drawer__raw { font-size: 11.5px; }
.sim-anchor-drawer__raw summary { cursor: pointer; color: var(--text-muted); }
.sim-anchor-drawer__raw pre { margin: 6px 0; max-height: 240px; overflow: auto; white-space: pre-wrap; word-break: break-all; background: rgba(127,127,127,.12); border-radius: 6px; padding: 8px; font-size: 11px; }
.sim-anchor-drawer__copy { border: 1px solid var(--border-color); border-radius: 4px; background: transparent; color: inherit; font: inherit; font-size: 11px; padding: 2px 8px; cursor: pointer; }
</style>
