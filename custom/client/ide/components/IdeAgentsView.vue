<script setup lang="ts">
// IdeAgentsView — 后台代理三分区视图（复刻 claude-code "claude agents" 总视图：
// Needs input/Working/Completed 三分区+antigravity Manager 状态列；UI 复刻 S4）。
// 数据=chatStore.subagentStreams 六态映射三分区：needs input=failed/interrupted；
// working=running；completed=completed/cancelled。
// 在场两维徽章（multica §六 2.1，吸收第一批 A3）：每行 availability 圆点
// （心跳距今 30s/90s 两档）× workload 芯片（running/queued/idle）分画——
// "在线但闲"与"离线但队里有活"一眼可分。投影=presence-two-axis.ts。
import { computed, ref } from 'vue'
import { useChatStore, type SubagentStream } from '@/stores/hermes/chat'
import { presenceTwoAxis, type PresenceTwoAxis } from '../utils/presence-two-axis'
import IdeRosterTree from './IdeRosterTree.vue'
import { boostPipeline, type BoostResult } from '../../../server/boost/boost-pipeline'

const chat = useChatStore()

const streams = computed<SubagentStream[]>(() => {
  const sid = chat.activeSessionId
  const list: SubagentStream[] = []
  for (const [key, s] of chat.subagentStreams) {
    if (!sid || key.startsWith(`${sid}:`)) list.push(s)
  }
  return list
})

const needsInput = computed(() => streams.value.filter((s) => s.status === 'failed' || s.status === 'error' || s.status === 'interrupted'))
const working = computed(() => streams.value.filter((s) => s.status === 'running'))
const completed = computed(() => streams.value.filter((s) => s.status === 'completed' || s.status === 'cancelled'))

function dur(s: SubagentStream): string {
  const secs = s.durationSeconds ?? (s.updatedAt - s.startedAt) / 1000
  return `${Math.max(0, Math.round(secs))}s`
}

/** subagentStream → 在场两维（心跳=updatedAt 距今；queued=pending 类态）。 */
function presence(s: SubagentStream): PresenceTwoAxis {
  return presenceTwoAxis({
    lastHeartbeatAgoMs: Date.now() - s.updatedAt,
    running: s.status === 'running' ? 1 : 0,
    queued: (s.status === 'failed' || s.status === 'error' || s.status === 'interrupted') ? 1 : 0,
  })
}

const PRESENCE_TEXT: Record<string, string> = {
  online: '在线', unstable: '迟滞', offline: '离线',
  working: '干活', queued: '待处理', idle: '空闲',
}

// ── 多路聚合（遗留清单 L4，antigravity /boost 断言回灌+交叉验证）：
// completed 区各路最后 text=候选答案；断言=文本中「断言：/- 断言」行（boost
// 模板要求 agent 输出）；boostPipeline 一致数胜出——多路一致才 verified。
const boostResult = ref<BoostResult | null>(null)
function runBoostAggregate(): void {
  const candidates = completed.value.map((s, i) => {
    const texts = (s.entries ?? []).filter((e) => e.kind === 'text' && e.text?.trim())
    const answer = texts[texts.length - 1]?.text?.trim() ?? ''
    const assertions = (texts.flatMap((e) => (e.text ?? '').split('\n')))
      .filter((l) => /^[-－*]?\s*断言[:：]/.test(l.trim()))
      .map((l) => l.trim())
    return { candidateId: `${s.subagentId}:${i}`, answer, assertions }
  }).filter((c) => c.answer)
  boostResult.value = candidates.length ? boostPipeline(candidates) : null
}
</script>

<template>
  <div v-if="streams.length" class="ide-agents" data-testid="ide-agents-view">
    <IdeRosterTree />
    <div class="ide-agents__section is-needs" data-testid="ide-agents-needs">
      <div class="ide-agents__head">⚑ Needs input · {{ needsInput.length }}</div>
      <div v-for="s in needsInput" :key="s.subagentId" class="ide-agents__row">
        <span class="ide-agents__presence" :data-testid="`ide-agents-presence-${s.subagentId}`" :title="presence(s).combo">
          <span class="ide-agents__dot" :class="`is-${presence(s).availability}`" />
          <span class="ide-agents__chip" :class="`is-${presence(s).workload}`">{{ PRESENCE_TEXT[presence(s).workload] }}</span>
        </span>
        <span class="ide-agents__state is-needs">{{ s.status }}</span>
        {{ s.goal || s.subagentId }}<span class="ide-agents__dur">{{ dur(s) }}</span>
      </div>
    </div>
    <div class="ide-agents__section is-working" data-testid="ide-agents-working">
      <div class="ide-agents__head">▶ Working · {{ working.length }}</div>
      <div v-for="s in working" :key="s.subagentId" class="ide-agents__row">
        <span class="ide-agents__presence" :data-testid="`ide-agents-presence-${s.subagentId}`" :title="presence(s).combo">
          <span class="ide-agents__dot" :class="`is-${presence(s).availability}`" />
          <span class="ide-agents__chip" :class="`is-${presence(s).workload}`">{{ PRESENCE_TEXT[presence(s).workload] }}</span>
        </span>
        <span class="ide-agents__state is-working">running</span>
        {{ s.goal || s.subagentId }}<span class="ide-agents__dur">{{ dur(s) }}</span>
      </div>
    </div>
    <div class="ide-agents__section is-done" data-testid="ide-agents-completed">
      <div class="ide-agents__head">
        ✓ Completed · {{ completed.length }}
        <button v-if="completed.length > 1" type="button" class="ide-agents__boost" data-testid="ide-boost-aggregate" title="多路候选聚合：一致数胜出+断言回灌（/boost 管线的消费面）" @click="runBoostAggregate">⚡聚合</button>
      </div>
      <div v-if="boostResult" class="ide-agents__boostresult" data-testid="ide-boost-result" :title="`断言回灌 ${boostResult.mergedAssertions.length} 条`">
        {{ boostResult.verified ? '✓ 多数一致' : '△ 未达多数一致' }} · 胜出 {{ boostResult.winner }} · 断言 {{ boostResult.mergedAssertions.length }} 条
      </div>
      <div v-for="s in completed" :key="s.subagentId" class="ide-agents__row">
        <span class="ide-agents__state is-done">{{ s.status }}</span>
        {{ s.goal || s.subagentId }}<span class="ide-agents__dur">{{ dur(s) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-agents { margin: 4px 12px; font-size: 12px; }
.ide-agents__section { margin: 6px 0; }
.ide-agents__head { font-weight: 600; color: var(--text-color-3, #999); font-size: 11px; }
.ide-agents__row { display: flex; gap: 8px; align-items: baseline; padding: 2px 4px; }
.ide-agents__state { font-size: 10px; padding: 0 6px; border-radius: 8px; }
.ide-agents__state.is-needs { background: rgba(208, 48, 80, 0.1); color: var(--error-color, #d03050); }
.ide-agents__state.is-working { background: rgba(24, 160, 88, 0.12); color: #18a058; }
.ide-agents__state.is-done { background: var(--hover-color, rgba(0, 0, 0, 0.06)); color: var(--text-color-3, #999); }
.ide-agents__dur { margin-left: auto; color: var(--text-color-3, #aaa); font-size: 11px; }
// 在场两维（A3）：圆点=availability，芯片=workload，分画不合并。
.ide-agents__presence { display: inline-flex; align-items: center; gap: 4px; flex: none; }
.ide-agents__dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block;
  &.is-online { background: var(--success-color, #18a058); }
  &.is-unstable { background: var(--warning-color, #f0a020); }
  &.is-offline { background: var(--text-color-3, #bbb); } }
.ide-agents__chip { font-size: 9px; padding: 0 5px; border-radius: 7px; line-height: 14px;
  &.is-working { background: rgba(32, 128, 240, 0.12); color: var(--info-color, #2080f0); }
  &.is-queued { background: rgba(240, 160, 32, 0.12); color: var(--warning-color, #f0a020); }
  &.is-idle { background: var(--hover-color, rgba(0, 0, 0, 0.06)); color: var(--text-color-3, #999); } }
.ide-agents__boost { border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px; font-size: 10px; padding: 0 6px; cursor: pointer; color: var(--text-color-3, #999); margin-left: 6px; }
.ide-agents__boostresult { font-size: 10px; color: var(--info-color, #2080f0); padding: 2px 4px; }
</style>
