<!-- overlay/custom/client/ia2/components/SpecDetail.vue -->
<!-- Spec 详情（P3 Task 6）：GraphSpec 只读可视化 + JSON 查看器 + 导出/导入。
     画布复用 runcenter RunGraphCanvas（拓扑经 layoutFromSpec 喂同一布局器——
     模板图与运行图形状可对照）；JSON 可折叠查看；导出走 Blob 下载
     （与 RunDetailView 导出同款，REST 走授权头，直链不带凭证）；
     导入 P4 画布配套，本期置灰 tooltip。组件薄壳：数据由父层注入。 -->
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
}>()

const { t } = useI18n()

const showJson = ref(false)
const jsonText = computed(() =>
  props.spec ? JSON.stringify(props.spec, null, 2) : '')

// ── 导出 JSON（Blob 下载，RunDetailView 同款）──
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
      <button class="spec-detail__create" data-spec-create @click="emit('create', props.card)">
        {{ t('ia2.orchestrate.createLoop') }}
      </button>
    </header>

    <section class="spec-detail__canvas" data-spec-canvas>
      <RunGraphCanvas
        :graph="layoutFromSpec(props.spec)"
        :entry-node="props.spec?.entryNode"
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
