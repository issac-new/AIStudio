<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TraceNode } from '../adapters/run-trace-adapter'

defineProps<{ node: TraceNode | null }>()

const { t } = useI18n()

const KIND_ICONS: Record<string, string> = {
  ingress: '📨', workflow: '🔄', agent: '🤖', skill: '⚡', tool: '🔧',
  memory: '🧠', service: '🌐', peer: '🔗', approval: '✋',
}

function kindIcon(kind: string): string {
  return KIND_ICONS[kind] || '❓'
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = (ms / 1000).toFixed(1)
  if (ms < 60000) return `${s}s`
  const m = Math.floor(ms / 60000)
  const restS = Math.floor((ms % 60000) / 1000)
  return `${m}m${restS}s`
}

function truncate(s: unknown, max: number): string {
  const str = typeof s === 'string' ? s : JSON.stringify(s, null, 2)
  return str.length > max ? str.slice(0, max) + '...' : str
}
</script>

<template>
  <aside class="run-trace-inspector" data-run-trace-inspector>
    <template v-if="node">
      <!-- 头部：类型图标 + 标签 + 标签组 -->
      <div class="run-trace-inspector__head">
        <span class="run-trace-inspector__icon">{{ kindIcon(node.kind) }}</span>
        <div class="run-trace-inspector__head-info">
          <b>{{ node.label }}</b>
          <div class="run-trace-inspector__tags">
            <span class="run-trace-inspector__tag">{{ node.kind }}</span>
            <span class="run-trace-inspector__tag" :class="'is-evidence-' + node.evidence.toLowerCase()">{{ node.evidence }}</span>
            <span class="run-trace-inspector__tag" :class="'is-status-' + node.status">{{ node.status }}</span>
          </div>
        </div>
      </div>

      <!-- 时间信息 -->
      <section v-if="node.startedAt" class="run-trace-inspector__section">
        <h5>{{ t('cockpit.timelinePrefix') }}</h5>
        <div class="run-trace-inspector__row"><span>{{ t('cockpit.startTime') }}</span><code>{{ fmtTime(node.startedAt) }}</code></div>
        <div v-if="node.endedAt" class="run-trace-inspector__row"><span>{{ t('cockpit.endTime') }}</span><code>{{ fmtTime(node.endedAt) }}</code></div>
        <div v-if="node.durationMs" class="run-trace-inspector__row"><span>{{ t('cockpit.duration') }}</span><code>{{ fmtDuration(node.durationMs) }}</code></div>
      </section>

      <!-- 详情 -->
      <section v-if="node.detail" class="run-trace-inspector__section">
        <h5>详情</h5>
        <pre class="run-trace-inspector__detail">{{ node.detail }}</pre>
      </section>

      <!-- 引用信息 -->
      <section v-if="node.ref && (node.ref.sessionId || node.ref.runId || node.ref.toolCallId || node.ref.workflowNodeId)" class="run-trace-inspector__section">
        <h5>引用</h5>
        <div v-if="node.ref.sessionId" class="run-trace-inspector__row"><span>Session</span><code>{{ node.ref.sessionId }}</code></div>
        <div v-if="node.ref.runId" class="run-trace-inspector__row"><span>Run</span><code>{{ node.ref.runId }}</code></div>
        <div v-if="node.ref.toolCallId" class="run-trace-inspector__row"><span>Tool Call</span><code>{{ node.ref.toolCallId }}</code></div>
        <div v-if="node.ref.workflowNodeId" class="run-trace-inspector__row"><span>Workflow Node</span><code>{{ node.ref.workflowNodeId }}</code></div>
      </section>

      <!-- 子时间线（思维链 + 工具 + 消息） -->
      <section v-if="node.children && node.children.length > 0" class="run-trace-inspector__section">
        <h5>时间线 ({{ node.children.length }}项)</h5>
        <div v-for="item in node.children" :key="item.id" class="run-trace-inspector__timeline-item" :class="'is-' + item.kind">
          <div class="run-trace-inspector__timeline-head">
            <span class="run-trace-inspector__timeline-kind">{{ item.kind }}</span>
            <span v-if="item.durationMs" class="run-trace-inspector__timeline-meta">{{ fmtDuration(item.durationMs) }}</span>
            <span v-if="item.status" class="run-trace-inspector__timeline-status" :class="'is-' + item.status">{{ item.status }}</span>
            <span v-if="item.attribution" class="run-trace-inspector__timeline-attr" :class="'is-' + item.attribution">{{ item.attribution === 'inferred' ? '推断' : '准确' }}</span>
          </div>
          <!-- 思维链文本 -->
          <p v-if="item.text" class="run-trace-inspector__timeline-text">{{ truncate(item.text, 500) }}</p>
          <!-- 工具名称 -->
          <p v-if="item.toolName" class="run-trace-inspector__timeline-tool">🔧 {{ item.toolName }}</p>
          <!-- 工具参数 -->
          <div v-if="item.toolArgs" class="run-trace-inspector__timeline-args">
            <span class="run-trace-inspector__label">{{ t('cockpit.parameter') }}</span>
            <pre>{{ truncate(item.toolArgs, 300) }}</pre>
          </div>
          <!-- 工具结果 -->
          <div v-if="item.toolResult" class="run-trace-inspector__timeline-result">
            <span class="run-trace-inspector__label">{{ t('cockpit.result') }}</span>
            <pre>{{ truncate(item.toolResult, 300) }}</pre>
          </div>
        </div>
      </section>
    </template>
    <p v-else class="run-trace-inspector__empty">选择节点查看详情</p>
  </aside>
</template>

<style scoped lang="scss">
.run-trace-inspector { border-left: 1px solid var(--border-color); background: var(--bg-sidebar); padding: 16px; overflow: auto; }

/* 头部 */
.run-trace-inspector__head { display: flex; align-items: flex-start; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); margin-bottom: 14px; }
.run-trace-inspector__icon { font-size: 20px; flex-shrink: 0; line-height: 1; }
.run-trace-inspector__head-info { flex: 1; min-width: 0; }
.run-trace-inspector__head-info b { display: block; font-size: 14px; color: var(--text-primary); margin-bottom: 4px; word-break: break-word; }
.run-trace-inspector__tags { display: flex; flex-wrap: wrap; gap: 4px; }
.run-trace-inspector__tag { font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-muted); text-transform: uppercase;
  &.is-evidence-l1 { background: var(--success); color: #fff; }
  &.is-evidence-l2 { background: var(--accent-info); color: #fff; }
  &.is-evidence-l3 { background: var(--warning); color: #fff; }
  &.is-status-running { background: var(--success); color: #fff; }
  &.is-status-ok { background: var(--accent-info); color: #fff; }
  &.is-status-error { background: var(--error); color: #fff; }
}

/* 区块 */
.run-trace-inspector__section { margin-bottom: 14px; }
.run-trace-inspector__section h5 { font-size: 9px; color: var(--text-muted); letter-spacing: 1px; margin-bottom: 6px; text-transform: uppercase; }
.run-trace-inspector__row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 3px 0; font-size: 11px; }
.run-trace-inspector__row span { color: var(--text-muted); flex-shrink: 0; }
.run-trace-inspector__row code { font-size: 10px; color: var(--text-secondary); font-family: ui-monospace, monospace; word-break: break-all; text-align: right; }

/* 详情 */
.run-trace-inspector__detail { font-size: 11px; color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap; word-break: break-word; background: var(--bg-secondary); padding: 8px; border-radius: 4px; max-height: 200px; overflow-y: auto; margin: 0; }

/* 时间线 */
.run-trace-inspector__timeline-item { padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 6px; background: var(--bg-card);
  &.is-thinking { border-left: 3px solid var(--accent-info); }
  &.is-tool { border-left: 3px solid var(--warning); }
  &.is-memory { border-left: 3px solid var(--text-muted); }
  &.is-message { border-left: 3px solid var(--success); }
}
.run-trace-inspector__timeline-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.run-trace-inspector__timeline-kind { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary); text-transform: uppercase; }
.run-trace-inspector__timeline-meta { font-size: 9px; color: var(--text-muted); font-family: monospace; }
.run-trace-inspector__timeline-status { font-size: 9px; padding: 1px 4px; border-radius: 3px;
  &.is-running { background: var(--success); color: #fff; }
  &.is-ok { background: var(--accent-info); color: #fff; }
  &.is-error { background: var(--error); color: #fff; }
}
.run-trace-inspector__timeline-attr { font-size: 8px; padding: 1px 4px; border-radius: 3px;
  &.is-inferred { background: var(--warning); color: #fff; }
  &.is-accurate { background: var(--success); color: #fff; }
}
.run-trace-inspector__timeline-text { font-size: 11px; color: var(--text-secondary); line-height: 1.5; margin: 4px 0 0 0; white-space: pre-wrap; word-break: break-word; }
.run-trace-inspector__timeline-tool { font-size: 11px; color: var(--text-primary); font-weight: 600; margin: 4px 0 0 0; }
.run-trace-inspector__label { font-size: 9px; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px; }
.run-trace-inspector__timeline-args pre, .run-trace-inspector__timeline-result pre { font-size: 10px; color: var(--text-secondary); background: var(--bg-secondary); padding: 4px 6px; border-radius: 3px; margin: 0; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow-y: auto; }

.run-trace-inspector__empty { color: var(--text-muted); font-size: 12px; }
</style>
