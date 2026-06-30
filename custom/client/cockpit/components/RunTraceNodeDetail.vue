<script setup lang="ts">
import type { TraceNode } from '../adapters/run-trace-adapter'

const props = defineProps<{ node: TraceNode | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function fmtTime(ts?: number): string {
  if (!ts) return '—'
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  return d.toLocaleString('zh-CN')
}
function fmtDuration(ms?: number): string {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}
</script>

<template>
  <div v-if="node" class="node-detail" data-node-detail>
    <div class="node-detail__mask" @click="emit('close')"></div>
    <div class="node-detail__panel">
      <header class="node-detail__head">
        <span class="node-detail__kind" :class="`is-${node.kind}`">{{ node.kind }}</span>
        <b>{{ node.label }}</b>
        <button type="button" class="node-detail__close" @click="emit('close')">×</button>
      </header>
      <div class="node-detail__body">
        <div v-if="node.detail" class="node-detail__row">
          <span class="node-detail__label">详情</span>
          <span class="node-detail__value node-detail__value--pre">{{ node.detail }}</span>
        </div>
        <div class="node-detail__row">
          <span class="node-detail__label">状态</span>
          <span class="node-detail__value">{{ node.status }}</span>
        </div>
        <div class="node-detail__row">
          <span class="node-detail__label">证据层级</span>
          <span class="node-detail__value">{{ node.evidence }}</span>
        </div>
        <div v-if="node.profile" class="node-detail__row">
          <span class="node-detail__label">Profile</span>
          <span class="node-detail__value">{{ node.profile }}</span>
        </div>
        <div v-if="node.cluster" class="node-detail__row">
          <span class="node-detail__label">任务</span>
          <span class="node-detail__value">{{ node.cluster }}</span>
        </div>
        <div class="node-detail__row">
          <span class="node-detail__label">开始</span>
          <span class="node-detail__value">{{ fmtTime(node.startedAt) }}</span>
        </div>
        <div v-if="node.endedAt" class="node-detail__row">
          <span class="node-detail__label">结束</span>
          <span class="node-detail__value">{{ fmtTime(node.endedAt) }}</span>
        </div>
        <div v-if="node.durationMs" class="node-detail__row">
          <span class="node-detail__label">耗时</span>
          <span class="node-detail__value">{{ fmtDuration(node.durationMs) }}</span>
        </div>
        <div v-if="node.ref?.sessionId" class="node-detail__row">
          <span class="node-detail__label">会话</span>
          <span class="node-detail__value node-detail__value--mono">{{ node.ref.sessionId }}</span>
        </div>
        <div v-if="node.ref?.runId" class="node-detail__row">
          <span class="node-detail__label">Run</span>
          <span class="node-detail__value node-detail__value--mono">{{ node.ref.runId }}</span>
        </div>
        <div v-if="node.children && node.children.length > 0" class="node-detail__children">
          <div class="node-detail__children-title">时间线（{{ node.children.length }}）</div>
          <div v-for="(c, i) in node.children" :key="i" class="node-detail__child">
            <span class="node-detail__child-kind" :class="`is-${c.kind}`">{{ c.kind }}</span>
            <span class="node-detail__child-text">{{ c.text }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.node-detail { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; }
.node-detail__mask { position: absolute; inset: 0; background: rgba(0,0,0,0.25); }
.node-detail__panel { position: relative; width: min(520px, calc(100vw - 32px)); max-height: 80vh; display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
.node-detail__head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border-color); }
.node-detail__kind { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); text-transform: uppercase; }
.node-detail__kind.is-agent { background: rgba(76,175,80,0.15); color: var(--success); }
.node-detail__kind.is-skill { background: rgba(64,120,192,0.15); color: var(--accent-info); }
.node-detail__kind.is-tool { background: rgba(214,155,90,0.15); color: var(--warning); }
.node-detail__head b { flex: 1; font-size: 13px; word-break: break-word; }
.node-detail__close { width: 24px; height: 24px; border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 18px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.node-detail__body { padding: 12px 14px; overflow-y: auto; }
.node-detail__row { display: flex; align-items: baseline; gap: 12px; padding: 5px 0; border-bottom: 1px solid var(--border-color); font-size: 12px;
  &:last-child { border-bottom: none; }
}
.node-detail__label { font-size: 10px; font-weight: 700; color: var(--text-muted); width: 60px; flex-shrink: 0; text-transform: uppercase; }
.node-detail__value { color: var(--text-primary); word-break: break-word; }
.node-detail__value--pre { white-space: pre-wrap; max-height: 200px; overflow-y: auto; font-size: 11px; }
.node-detail__value--mono { font-family: ui-monospace, monospace; font-size: 11px; }
.node-detail__children { margin-top: 8px; }
.node-detail__children-title { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; }
.node-detail__child { display: flex; gap: 8px; padding: 4px 0; font-size: 11px; border-bottom: 1px dashed var(--border-color);
  &:last-child { border-bottom: none; }
}
.node-detail__child-kind { font-size: 9px; padding: 1px 5px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary); flex-shrink: 0; height: fit-content; }
.node-detail__child-text { color: var(--text-primary); word-break: break-word; white-space: pre-wrap; }
</style>
