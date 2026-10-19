<!-- overlay/custom/client/eval/components/EvidenceDrawer.vue
     归因一次点击（百度评测范式轮 §5）：按 sessionId 重读 L2 trace，展示该样本的
     工具轨迹摘要与资源读数。不复制证据进 attempt，保持 trace 单一事实源。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { evalApi, type EvidenceDto } from '@/custom/eval/api'
import { evalMessages } from '@/custom/eval/i18n'

const props = defineProps<{ runId: string; taskId: string; sampleIdx: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? evalMessages.zh.eval : evalMessages.en.eval
})

const data = ref<EvidenceDto | null>(null)
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    data.value = await evalApi.evidence(props.runId, props.taskId, props.sampleIdx)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

function close(): void {
  emit('close')
}
</script>

<template>
  <div class="drawer-backdrop" data-testid="eval-evidence-drawer" @click.self="close">
    <aside class="drawer">
      <header class="drawer__head">
        <div>
          <h3>{{ L.evidence.title }}</h3>
          <p class="muted mono">{{ taskId }} #{{ sampleIdx }}</p>
        </div>
        <button type="button" data-testid="eval-evidence-close" @click="close">{{ L.evidence.close }}</button>
      </header>

      <p v-if="loading" class="muted">{{ L.evidence.loading }}</p>
      <p v-else-if="error" class="drawer__error">{{ error }}</p>
      <template v-else-if="data">
        <p v-if="!data.ok" class="drawer__warn" data-testid="eval-evidence-unavailable">
          {{ L.evidence.unavailable }}：{{ data.reason }}
        </p>
        <template v-else>
          <div class="drawer__meta">
            <span v-if="data.sessionId">{{ L.evidence.session }}：<code>{{ data.sessionId }}</code></span>
            <span v-if="data.meta">{{ data.meta.toolCalls }} tools · {{ data.meta.tokens }} tokens</span>
            <span v-if="data.efficiency?.durationMs !== undefined">{{ data.efficiency.durationMs }}ms</span>
          </div>

          <h4>{{ L.evidence.calls }}</h4>
          <p v-if="!data.toolCalls?.length" class="muted">{{ L.evidence.empty }}</p>
          <table v-else class="drawer__table">
            <thead>
              <tr><th>#</th><th>tool</th><th>status</th><th>ms</th></tr>
            </thead>
            <tbody>
              <tr v-for="(call, i) in data.toolCalls" :key="i">
                <td>{{ i + 1 }}</td>
                <td class="mono">{{ call.name }}</td>
                <td :class="call.ok ? 'ok' : 'danger'">{{ call.ok ? 'ok' : 'error' }}</td>
                <td>{{ call.durationMs ?? '—' }}</td>
              </tr>
            </tbody>
          </table>

          <h4>
            {{ L.evidence.transcript }}
            <span v-if="data.truncated" class="chip chip-warn">{{ L.evidence.truncated }}</span>
          </h4>
          <pre class="drawer__transcript">{{ data.transcript || '—' }}</pre>
          <p v-if="data.hint" class="muted">{{ L.evidence.hint }}：{{ data.hint }}</p>
        </template>
      </template>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.drawer-backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35);
  display: flex; justify-content: flex-end; z-index: 60;
}
.drawer {
  width: min(640px, 92vw); height: 100%; overflow-y: auto;
  background: var(--bg-secondary); padding: 16px 18px;
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
}
.drawer__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  h3 { margin: 0; font-size: 15px; }
  p { margin: 2px 0 0; font-size: 11px; }
  button { border: 1px solid var(--border-color); background: transparent; border-radius: 6px; padding: 3px 9px; cursor: pointer; }
}
.drawer__error { color: var(--danger); font-size: 13px; }
.drawer__warn { color: var(--warning); font-size: 13px; }
.drawer__meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; opacity: 0.85; }
.drawer__table { width: 100%; border-collapse: collapse; font-size: 12px;
  th, td { text-align: left; padding: 4px 6px; border-top: 1px solid var(--border-color); }
  .ok { color: var(--success); } .danger { color: var(--danger); }
}
.drawer__transcript {
  background: color-mix(in srgb, var(--border-color) 25%, transparent);
  border-radius: 8px; padding: 10px; font-size: 11px; white-space: pre-wrap; max-height: 320px; overflow: auto;
}
h4 { margin: 6px 0 0; font-size: 12px; display: flex; align-items: center; gap: 8px; }
</style>
