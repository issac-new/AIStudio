<!-- overlay/custom/client/loop/runcenter/components/RunTimeline.vue -->
<!-- RunTimeline — 时间轴回放面板（task-6）。横向 scrubber（拖动 = 重放至第 N 事件）
     + 播放/暂停/倍速 + 事件流三级分辨率（Summary/Normal/Verbose）。
     回放状态由父层 useRunReplay 持有（图与时间轴共用同一游标前缀），
     本组件只做展示与事件转发（薄壳纪律）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatEventTs } from '../adapters/run-graph'
import type { TimelineMode, TimelineRow } from '../adapters/run-graph'

const props = defineProps<{
  /** 当前游标前缀的投影行（父层 projectEvents 产物） */
  rows: TimelineRow[]
  cursorIndex: number
  total: number
  playing: boolean
  speed: number
  mode: TimelineMode
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'seek', index: number): void
  (e: 'toggle-play'): void
  (e: 'set-speed', speed: number): void
  (e: 'set-mode', mode: TimelineMode): void
}>()

const { t } = useI18n()

const SPEEDS = [0.5, 1, 2, 4]
const MODES: Array<{ value: TimelineMode; i18n: string }> = [
  { value: 'summary', i18n: 'runcenter.timeline.modeSummary' },
  { value: 'normal', i18n: 'runcenter.timeline.modeNormal' },
  { value: 'verbose', i18n: 'runcenter.timeline.modeVerbose' },
]

function onScrub(ev: Event): void {
  const value = (ev.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value)) emit('seek', value)
}

function payloadJson(row: TimelineRow): string {
  try {
    return JSON.stringify(row.payload ?? {}, null, 2)
  } catch {
    return String(row.payload)
  }
}
</script>

<template>
  <div class="rt-panel" data-run-timeline>
    <!-- 回放控制条 -->
    <div class="rt-panel__controls">
      <button
        class="rt-panel__play"
        :title="t(playing ? 'runcenter.timeline.pause' : 'runcenter.timeline.play')"
        :disabled="total === 0"
        @click="emit('toggle-play')"
      >
        {{ playing ? '❚❚' : '▶' }}
      </button>
      <button
        class="rt-panel__step"
        :title="t('runcenter.timeline.stepBack')"
        :disabled="cursorIndex <= 0"
        @click="emit('seek', cursorIndex - 1)"
      >
        −1
      </button>
      <button
        class="rt-panel__step"
        :title="t('runcenter.timeline.stepForward')"
        :disabled="cursorIndex >= total"
        @click="emit('seek', cursorIndex + 1)"
      >
        +1
      </button>

      <span class="rt-panel__position">{{ t('runcenter.timeline.replayTo', { n: cursorIndex, total }) }}</span>

      <div class="rt-panel__speeds">
        <button
          v-for="s in SPEEDS"
          :key="s"
          class="rt-panel__speed"
          :class="{ 'rt-panel__speed--active': speed === s }"
          @click="emit('set-speed', s)"
        >
          {{ s }}×
        </button>
      </div>
    </div>

    <!-- 横向 scrubber：位置 = 已重放事件数 -->
    <input
      class="rt-panel__scrubber"
      type="range"
      :min="0"
      :max="total"
      :step="1"
      :value="cursorIndex"
      :disabled="total === 0"
      :aria-label="t('runcenter.timeline.scrubber')"
      @input="onScrub"
    >

    <!-- 三级分辨率切换（详情页右上） -->
    <div class="rt-panel__modes">
      <button
        v-for="m in MODES"
        :key="m.value"
        class="rt-panel__mode"
        :class="{ 'rt-panel__mode--active': mode === m.value }"
        @click="emit('set-mode', m.value)"
      >
        {{ t(m.i18n) }}
      </button>
    </div>

    <!-- 事件流 -->
    <div class="rt-panel__stream" :class="{ 'rt-panel__stream--loading': loading }">
      <div v-if="rows.length === 0 && !loading" class="rt-panel__empty">
        {{ t('runcenter.timeline.empty') }}
      </div>
      <div
        v-for="row in rows"
        :key="row.index"
        class="rt-row"
        :class="[`is-${row.level}`, row.status ? `has-${row.status}` : '']"
      >
        <span class="rt-row__ts">{{ formatEventTs(row.ts) }}</span>
        <span class="rt-row__dot" aria-hidden="true" />
        <div class="rt-row__body">
          <div class="rt-row__line">
            <span class="rt-row__type">{{ row.type }}</span>
            <span v-if="row.nodeId" class="rt-row__node">{{ row.nodeId }}</span>
            <span
              v-if="row.status"
              class="rt-row__status"
            >{{ t(`runcenter.graph.nodeStatus.${row.status === 'awaiting-input' ? 'awaitingInput' : row.status}`) }}</span>
          </div>
          <div v-if="row.goto?.length" class="rt-row__goto">↳ {{ row.goto.join(' → ') }}</div>
          <div v-if="row.error" class="rt-row__error">{{ row.error }}</div>
          <details v-if="row.payload" class="rt-row__payload">
            <summary>{{ t('runcenter.timeline.payload') }}</summary>
            <pre>{{ payloadJson(row) }}</pre>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rt-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.rt-panel__controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rt-panel__play,
.rt-panel__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
}
.rt-panel__play, .rt-panel__step:disabled { opacity: 0.4; cursor: default; }
.rt-panel__position {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rt-panel__speeds { display: flex; gap: 2px; margin-left: auto; }
.rt-panel__speed {
  padding: 3px 7px;
  border: 1px solid transparent;
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}
.rt-panel__speed--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(59, 130, 246, 0.1)));
}

.rt-panel__scrubber { width: 100%; accent-color: var(--accent-primary, var(--color-primary, #3b82f6)); }
.rt-panel__scrubber:disabled { opacity: 0.4; }

.rt-panel__modes { display: flex; gap: 4px; }
.rt-panel__mode {
  padding: 3px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
}
.rt-panel__mode--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(59, 130, 246, 0.1)));
}

.rt-panel__stream {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}
.rt-panel__stream--loading { opacity: 0.6; }
.rt-panel__empty { padding: 24px 0; text-align: center; color: var(--text-muted, #878c99); }

.rt-row {
  display: flex;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border-bottom: 1px dashed var(--border-color);
  line-height: 1.5;
}
.rt-row.is-raw { opacity: 0.62; }
.rt-row__ts {
  flex: 0 0 58px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.rt-row__dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: var(--radius-pill, 999px);
  background: var(--border-color, #c8c8c8);
}
.rt-row.is-result.has-done .rt-row__dot { background: var(--text-secondary, #5c6470); }
.rt-row.is-result.has-failed .rt-row__dot { background: var(--color-danger, #e11d48); }
.rt-row.is-result.has-awaiting-input .rt-row__dot { background: var(--color-warning, #f59e0b); }
.rt-row.has-running .rt-row__dot { background: var(--color-success, #28bf5c); }

.rt-row__body { min-width: 0; flex: 1; }
.rt-row__line { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.rt-row__type { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
.rt-row__node {
  padding: 0 5px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  font-size: 10px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.rt-row__status { font-size: 10px; color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.rt-row__goto, .rt-row__error { font-size: 11px; }
.rt-row__goto { color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.rt-row__error { color: var(--color-danger, #e11d48); }

.rt-row__payload summary {
  cursor: pointer;
  font-size: 10px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  user-select: none;
}
.rt-row__payload pre {
  margin: 4px 0 0;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  overflow: auto;
  max-height: 180px;
  font-size: 10px;
  line-height: 1.4;
}
</style>
