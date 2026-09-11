<!-- overlay/custom/client/ia2/components/SpecDetail.vue -->
<!-- Spec 详情（P3 Task 6；P4 深化）：GraphSpec 只读可视化 + JSON 查看器 + 导出。
     画布复用 runcenter RunGraphCanvas（拓扑经 layoutFromSpec 喂同一布局器——
     模板图与运行图形状可对照；P4 起 spec.containers 透传画包围框）；
     JSON 可折叠查看；导出走 Blob 下载（与 RunDetailView 导出同款，REST 走
     授权头，直链不带凭证；导出格式与编辑器一致 = spec JSON）；
     origin==='editor' 的自建 spec 附加「试跑」入口（emit 交父层起跑跳转）；
     导入在 P4 编辑器内提供，此处保持置灰。组件薄壳：数据由父层注入。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RunGraphCanvas from '@/custom/loop/runcenter/components/RunGraphCanvas.vue'
import { layoutFromSpec, type GraphSpecLike, type SpecCard } from '../adapters/orchestrate'

const props = defineProps<{
  card: SpecCard
  /** 原始 spec（JSON 查看器与导出的数据源；画布拓扑由 layoutFromSpec 投影） */
  spec: GraphSpecLike | null
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'create', card: SpecCard): void
  (e: 'try-run', card: SpecCard): void
}>()

const { t } = useI18n()

const showJson = ref(false)
const jsonText = computed(() =>
  props.spec ? JSON.stringify(props.spec, null, 2) : '')

/** P4 T8：spec 携带的 loop 容器 → RunGraphCanvas 包围框 */
const containers = computed(() => props.spec?.containers ?? [])

// ── 导出 JSON（Blob 下载，RunDetailView 同款；与编辑器导出同为 spec JSON）──
const exporting = ref(false)
function exportJson(): void {
  const id = props.card.id
  if (!id || exporting.value || !props.spec) return
  exporting.value = true
  try {
    const blob = new Blob([jsonText.value], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spec-${id}.json`
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="spec-detail" data-spec-detail>
    <header class="spec-detail__head">
      <button class="spec-detail__back" data-spec-back @click="emit('back')">
        {{ t('ia2.orchestrate.backToList') }}
      </button>
      <h3 class="spec-detail__title">{{ props.card.name }}</h3>
      <span v-if="props.card.version > 0" class="spec-detail__version">v{{ props.card.version }}</span>
      <span class="spec-detail__kind">{{ t(`ia2.orchestrate.kind.${props.card.kind}`) }}</span>
      <button
        v-if="props.card.origin === 'editor'"
        class="spec-detail__tryrun"
        data-spec-tryrun
        @click="emit('try-run', props.card)"
      >
        {{ t('ia2.orchestrate.editor.tryRun') }}
      </button>
      <button class="spec-detail__create" data-spec-create @click="emit('create', props.card)">
        {{ t('ia2.orchestrate.createLoop') }}
      </button>
    </header>

    <section class="spec-detail__canvas" data-spec-canvas>
      <RunGraphCanvas
        :graph="layoutFromSpec(props.spec)"
        :entry-node="props.spec?.entryNode"
        :containers="containers"
      />
    </section>

    <section class="spec-detail__io">
      <button class="spec-detail__json-toggle" data-spec-json-toggle @click="showJson = !showJson">
        {{ showJson ? t('ia2.orchestrate.jsonHide') : t('ia2.orchestrate.jsonShow') }}
      </button>
      <button class="spec-detail__export" data-spec-export :disabled="exporting" @click="exportJson">
        {{ exporting ? t('ia2.orchestrate.exporting') : t('ia2.orchestrate.exportJson') }}
      </button>
      <!-- 导入：P4 画布配套，本期置灰（tooltip 说明） -->
      <span class="spec-detail__import-wrap" data-spec-import-wrap :title="t('ia2.orchestrate.importDisabledTip')">
        <button class="spec-detail__import" data-spec-import disabled>
          {{ t('ia2.orchestrate.importJson') }}
        </button>
      </span>
    </section>

    <pre v-if="showJson" class="spec-detail__json" data-spec-json>{{ jsonText }}</pre>
  </div>
</template>

<style scoped>
.spec-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
.spec-detail__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.spec-detail__back {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.spec-detail__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spec-detail__version {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.spec-detail__kind {
  padding: 1px 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-secondary);
  font-size: 11px;
  color: var(--text-secondary);
}
.spec-detail__tryrun {
  padding: 4px 12px;
  border: 1px solid var(--accent-primary, var(--color-primary, #3b82f6));
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: var(--accent-primary, var(--color-primary, #3b82f6));
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.spec-detail__tryrun:hover {
  background: var(--accent-primary, var(--color-primary, #3b82f6));
  color: var(--color-on-accent, #fff);
}
.spec-detail__create {
  margin-left: auto;
  padding: 4px 12px;
  border: none;
  border-radius: var(--radius-micro, 3px);
  background: var(--accent-primary, var(--color-primary, #3b82f6));
  color: var(--color-on-accent, #fff);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.spec-detail__canvas {
  flex: 1;
  min-height: 320px;
}
.spec-detail__io {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spec-detail__io button {
  padding: 3px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.spec-detail__io button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.spec-detail__import-wrap { display: inline-flex; }
.spec-detail__json {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-secondary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre;
}
</style>
