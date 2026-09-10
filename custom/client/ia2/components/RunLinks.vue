<!-- overlay/custom/client/ia2/components/RunLinks.vue -->
<!-- 任务详情"来源 run"关联区块（P3 Task 7，任务 → run 方向）：
     按 taskId 在 loop 事件日志反查 loop.persisted（显式 taskId 匹配，配对逻辑在
     adapters/traceability.persistedLinksForTask 纯函数），渲染 runId 深链
     （→ /app/runs/:runId）。挂在 kanban 任务抽屉（TasksView 内嵌看板的详情抽屉），
     加载失败降级为错误提示不炸抽屉；无关联（旧数据/手动任务）显示空态。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { loopRest } from '@/custom/loop/api/loop-rest'
import { persistedLinksForTask, type PersistedLink } from '../adapters/traceability'

const props = defineProps<{
  /** kanban 任务 id（抽屉当前任务；null = 不渲染） */
  taskId: string | null
  /** 宿主抽屉可见性（false 时不发请求；打开时惰性加载） */
  show: boolean
}>()

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)
const failed = ref(false)
const links = ref<PersistedLink[]>([])

/** 单 loop 事件拉取上限（loop.persisted 量级远小于此；对齐 runs store 指标采集口径） */
const EVENT_LIMIT = 500

async function load(taskId: string): Promise<void> {
  loading.value = true
  failed.value = false
  try {
    const loops = await loopRest.listLoops()
    const results = await Promise.allSettled(
      loops.map(l => loopRest.getEvents(l.id, undefined, EVENT_LIMIT)),
    )
    const events = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    // 任一 loop 事件拉取失败且反查结果为空 → 视为失败（结果可能不完整，不静默报"无关联"）；
    // 已有命中时失败降级为部分结果（关联已找到，够用）
    if (results.some(r => r.status === 'rejected') && events.length === 0) {
      failed.value = true
      links.value = []
      return
    }
    links.value = persistedLinksForTask(events, taskId)
  } catch {
    failed.value = true
    links.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.show, props.taskId] as const,
  ([show, taskId]) => {
    if (show && taskId) void load(taskId)
    else {
      links.value = []
      failed.value = false
      loading.value = false
    }
  },
  { immediate: true },
)

const visible = computed(() => props.show && !!props.taskId)

function openRun(runId: string | null): void {
  if (runId) void router.push(`/app/runs/${runId}`)
}
</script>

<template>
  <div v-if="visible" class="ia-runlinks" data-testid="ia-runlinks">
    <div class="ia-runlinks__head">{{ t('ia2.runLinks.title') }}</div>
    <div v-if="loading" class="ia-runlinks__muted">{{ t('ia2.runLinks.loading') }}</div>
    <div v-else-if="failed" class="ia-runlinks__error">{{ t('ia2.runLinks.loadFailed') }}</div>
    <div v-else-if="links.length === 0" class="ia-runlinks__muted">{{ t('ia2.runLinks.empty') }}</div>
    <div v-else class="ia-runlinks__list">
      <button
        v-for="(link, i) in links"
        :key="`${link.runId ?? 'norun'}-${link.contractId}-${i}`"
        type="button"
        class="ia-runlinks__item"
        :disabled="!link.runId"
        :title="link.runId ? t('ia2.runLinks.open') : undefined"
        @click="openRun(link.runId)"
      >
        <span class="ia-runlinks__runid">{{ link.runId ?? t('ia2.runLinks.noRun') }}</span>
        <code v-if="link.artifact" class="ia-runlinks__artifact">{{ link.artifact }}</code>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ia-runlinks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ia-runlinks__head {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary, #878c99));
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.ia-runlinks__muted {
  font-size: 12px;
  font-style: italic;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ia-runlinks__error {
  font-size: 12px;
  color: var(--color-danger, #e11d48);
}
.ia-runlinks__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ia-runlinks__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
}
.ia-runlinks__item:hover:not(:disabled) {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  color: var(--accent-primary, var(--color-primary, #3b82f6));
}
.ia-runlinks__item:disabled {
  cursor: default;
  opacity: 0.7;
}
.ia-runlinks__runid {
  font-family: var(--font-mono, ui-monospace, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ia-runlinks__artifact {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}
</style>
