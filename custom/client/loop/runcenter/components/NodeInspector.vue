<!-- overlay/custom/loop/runcenter/components/NodeInspector.vue -->
<!-- NodeInspector — 节点检查器 attach 档（task-7）：选中执行图节点后在侧栏显示
     类型/状态/迭代（完成次数）/耗时、最近一次 update 的 channel 键值
     （socket result.update 真实键值；事件日志 payload 仅键名——服务端日志契约）、
     failed 时人类可读原因 + 建议动作（重跑整个 run = fork → startRun 显式起跑，
     "从失败重跑"），以及该节点关联事件列表（Verbose 档）。
     数据组织在 adapters/intervention.inspectNode（纯函数），本组件薄壳。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDurationMs, inspectNode } from '../adapters/intervention'
import { formatEventTs } from '../adapters/run-graph'
import { runRest } from '../api'
import type { RunGraphNode, ReplayEventLike } from '../adapters/run-graph'

const props = defineProps<{
  /** 选中节点（RunDetailView 的图投影产物；null = 未选中，渲染空态） */
  node: RunGraphNode | null
  /** 事件流（回放端点日志词汇，ReplayEventLike 公共超集） */
  events: ReplayEventLike[]
  /** 所属 run（重跑动作的 fork 源） */
  runId: string
}>()

const { t } = useI18n()

const insp = computed(() => (props.node ? inspectNode(props.events, props.node.id) : null))

/** 节点状态 → i18n key（复用 task-6 的 runcenter.graph.nodeStatus.*） */
const NODE_STATUS_KEY: Record<RunGraphNode['status'], string> = {
  idle: 'idle',
  running: 'running',
  done: 'done',
  failed: 'failed',
  'awaiting-input': 'awaitingInput',
  skipped: 'skipped',
}

/** update 键值的安全字符串化（值可能是任意 JSON 形状） */
function valueLabel(v: unknown): string {
  try {
    const s = JSON.stringify(v)
    return s.length > 120 ? `${s.slice(0, 117)}…` : s
  } catch {
    return String(v)
  }
}

// ── 重跑整个 run（fork → startRun 显式起跑；"从失败重跑"的建议动作）──
const rerunning = ref(false)
const rerunNote = ref<{ kind: 'ok' | 'error'; id: string | null; text: string } | null>(null)

async function rerun(): Promise<void> {
  if (rerunning.value) return
  rerunning.value = true
  rerunNote.value = null
  try {
    const fork = await runRest.forkRun(props.runId) // 缺省 superStep → 最新 checkpoint
    await runRest.startRun(fork.runId)
    rerunNote.value = { kind: 'ok', id: fork.runId, text: '' }
  } catch (e) {
    rerunNote.value = {
      kind: 'error',
      id: null,
      text: e instanceof Error ? e.message : String(e),
    }
  } finally {
    rerunning.value = false
  }
}
</script>

<template>
  <div class="ni-panel" data-node-inspector>
    <!-- 空态：未选中节点 -->
    <div v-if="!node || !insp" class="ni-panel__empty">
      <p>{{ t('runcenter.inspector.empty') }}</p>
      <p class="ni-panel__empty-hint">{{ t('runcenter.inspector.emptyHint') }}</p>
    </div>

    <template v-else>
      <div class="ni-panel__head">
        <strong class="ni-panel__title">{{ t('runcenter.inspector.title') }}</strong>
        <span class="ni-panel__node-id">{{ insp.nodeId }}</span>
      </div>

      <!-- 概要：类型 / 状态 / 迭代 / 耗时 -->
      <dl class="ni-panel__meta">
        <div class="ni-panel__meta-row">
          <dt>{{ t('runcenter.inspector.type') }}</dt>
          <dd>{{ node.type }}</dd>
        </div>
        <div class="ni-panel__meta-row">
          <dt>{{ t('runcenter.inspector.status') }}</dt>
          <dd :class="`ni-panel__status ni-panel__status--${node.status}`">
            {{ t(`runcenter.graph.nodeStatus.${NODE_STATUS_KEY[node.status] ?? node.status}`) }}
          </dd>
        </div>
        <div class="ni-panel__meta-row">
          <dt>{{ t('runcenter.inspector.iteration') }}</dt>
          <dd>{{ node.iteration }}</dd>
        </div>
        <div class="ni-panel__meta-row">
          <dt>{{ t('runcenter.inspector.duration') }}</dt>
          <dd>{{ formatDurationMs(node.durationMs) }}</dd>
        </div>
      </dl>

      <!-- 最近一次 update 的 channel 键值（node.completed payload） -->
      <div class="ni-panel__section">
        <span class="ni-panel__section-title">{{ t('runcenter.inspector.lastUpdate') }}</span>
        <div v-if="!insp.lastUpdate" class="ni-panel__muted">{{ t('runcenter.inspector.noUpdate') }}</div>
        <div v-else class="ni-panel__update">
          <div v-for="k in insp.lastUpdate.updateKeys" :key="k" class="ni-panel__update-row">
            <span class="ni-panel__update-key">{{ k }}</span>
            <code
              v-if="insp.lastUpdate.update && k in insp.lastUpdate.update"
              class="ni-panel__update-value"
            >{{ valueLabel(insp.lastUpdate.update[k]) }}</code>
          </div>
        </div>
      </div>

      <!-- 失败原因 + 建议动作（重跑整个 run） -->
      <template v-if="node.status === 'failed'">
        <div class="ni-panel__error">
          <span class="ni-panel__error-text">{{ insp.error ?? t('runcenter.inspector.noErrorDetail') }}</span>
        </div>
        <div class="ni-panel__hint">{{ t('runcenter.inspector.errorHint') }}</div>
        <div class="ni-panel__rerun-row">
          <button class="ni-panel__rerun" :disabled="rerunning" @click="rerun">
            {{ rerunning ? t('runcenter.inspector.rerunning') : t('runcenter.inspector.rerun') }}
          </button>
          <div
            v-if="rerunNote"
            class="ni-panel__rerun-note"
            :class="{
              'ni-panel__rerun-note--ok': rerunNote.kind === 'ok',
              'ni-panel__rerun-note--error': rerunNote.kind === 'error',
            }"
          >
            <template v-if="rerunNote.kind === 'ok'">
              {{ t('runcenter.inspector.rerunDone') }}
              <code class="ni-panel__rerun-id">{{ rerunNote.id }}</code>
            </template>
            <template v-else>{{ rerunNote.text }}</template>
          </div>
        </div>
      </template>

      <!-- 关联事件（Verbose 档） -->
      <div class="ni-panel__section">
        <span class="ni-panel__section-title">{{ t('runcenter.inspector.events') }}</span>
        <div v-if="insp.events.length === 0" class="ni-panel__muted">{{ t('runcenter.inspector.noEvents') }}</div>
        <div v-for="(e, i) in insp.events" v-else :key="i" class="ni-panel__event">
          <span class="ni-panel__event-ts">{{ formatEventTs(e.ts) }}</span>
          <span class="ni-panel__event-type">{{ e.kind ?? e.type }}</span>
          <span v-if="(e.payload?.error ?? e.error) !== undefined" class="ni-panel__event-error">
            {{ e.payload?.error ?? e.error }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ni-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  font-size: 12px;
  overflow: auto;
}
.ni-panel__empty { text-align: center; color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.ni-panel__empty p { margin: 0 0 4px; }
.ni-panel__empty-hint { font-size: 11px; opacity: 0.8; }

.ni-panel__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.ni-panel__title { font-size: 13px; white-space: nowrap; }
.ni-panel__node-id {
  font-family: var(--font-mono, ui-monospace, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ni-panel__meta {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
}
.ni-panel__meta-row { display: flex; gap: 6px; min-width: 0; }
.ni-panel__meta-row dt { color: var(--text-muted, var(--color-text-secondary, #878c99)); flex-shrink: 0; }
.ni-panel__meta-row dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ni-panel__status--failed { color: var(--color-danger, #e11d48); }
.ni-panel__status--running { color: var(--color-success, #28bf5c); }
.ni-panel__status--awaiting-input { color: var(--color-warning, #f59e0b); }

.ni-panel__section { display: flex; flex-direction: column; gap: 4px; }
.ni-panel__section-title {
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-size: 11px;
}
.ni-panel__muted { color: var(--text-muted, var(--color-text-secondary, #878c99)); }

.ni-panel__update {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
}
.ni-panel__update-row { display: flex; gap: 8px; min-width: 0; }
.ni-panel__update-key { flex-shrink: 0; font-weight: 600; }
.ni-panel__update-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}

.ni-panel__error {
  padding: 6px 8px;
  border: 1px solid var(--color-danger, #e11d48);
  border-radius: var(--radius-micro, 3px);
  color: var(--color-danger, #e11d48);
  word-break: break-word;
}
.ni-panel__hint { color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.ni-panel__rerun-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ni-panel__rerun {
  padding: 4px 12px;
  border: 1px solid var(--accent-primary, var(--color-primary, #3b82f6));
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: var(--accent-primary, var(--color-primary, #3b82f6));
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
}
.ni-panel__rerun:disabled { opacity: 0.5; cursor: default; }
.ni-panel__rerun-note { min-width: 0; word-break: break-all; }
.ni-panel__rerun-note--ok { color: var(--color-success, #28bf5c); }
.ni-panel__rerun-note--error { color: var(--color-danger, #e11d48); }
.ni-panel__rerun-id { font-family: var(--font-mono, ui-monospace, monospace); }

.ni-panel__event {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px dashed var(--border-color);
  min-width: 0;
}
.ni-panel__event-ts {
  flex: 0 0 56px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-variant-numeric: tabular-nums;
}
.ni-panel__event-type {
  font-family: var(--font-mono, ui-monospace, monospace);
  flex-shrink: 0;
}
.ni-panel__event-error {
  color: var(--color-danger, #e11d48);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
