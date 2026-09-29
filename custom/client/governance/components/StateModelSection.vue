<!-- overlay/custom/client/governance/components/StateModelSection.vue -->
<!-- 状态-事件本体视图（4A 治理层第五期②的展示面）：task 九态+五条治理挂接转移+
     四事件源。数据全真实：/api/governance/state-model；词表与 upstream 逐字对齐
     （守门断言），problems 非空时红条显式列出。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchStateModel, type StateModelResp,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { stateModel: Record<string, string> }).stateModel
})

const data = ref<StateModelResp | null>(null)
const error = ref('')

async function refresh(): Promise<void> {
  error.value = ''
  try {
    data.value = await fetchStateModel()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
onMounted(() => void refresh())
</script>

<template>
  <div class="sm" data-testid="gov-state-model">
    <div class="sm__bar">
      <h3 class="sm__title">{{ L?.title }}</h3>
      <span v-if="data?.doc" class="sm__chip" data-testid="sm-counts">
        {{ data.doc.states.length }} {{ L?.states }} · {{ data.doc.transitions.length }} {{ L?.transitions }} · {{ data.doc.eventSources.length }} {{ L?.eventSources }}
      </span>
      <span v-if="data?.problems.length" class="sm__chip is-bad" data-testid="sm-problems">✕ {{ data.problems.length }} {{ L?.problems }}</span>
    </div>
    <div v-if="error" class="sm__error">{{ error }}</div>
    <div v-else-if="data && !data.exists" class="sm__empty">{{ L?.missing }}</div>
    <div v-else-if="!data" class="sm__empty">…</div>
    <template v-else>
      <!-- 九态 -->
      <div class="sm__row" data-testid="sm-states">
        <span class="sm__label">{{ L?.states }}</span>
        <span v-for="s in data.doc?.states" :key="s.id" class="sm__tag" :title="s.semantics">{{ s.id }}</span>
        <span v-if="data.doc?.freeMoveStates?.length" class="sm__label">{{ L?.freeMove }}: {{ data.doc.freeMoveStates.join(' / ') }}</span>
      </div>
      <!-- 转移（有治理挂接） -->
      <div class="sm__grid">
        <div v-for="t in data.doc?.transitions" :key="t.id" class="sm__trans" :data-testid="`sm-trans-${t.id}`">
          <div class="sm__trans-head"><b>{{ t.id }}</b><span class="sm__from-to">{{ t.from }} → {{ t.to }}</span></div>
          <div class="sm__trans-line">{{ L?.trigger }}：{{ t.trigger }}</div>
          <div v-if="t.rules.length" class="sm__trans-line">{{ L?.rules }}：{{ t.rules.join(' · ') }}</div>
          <div class="sm__trans-line">{{ L?.actions }}：{{ t.actions.join(' · ') }}</div>
          <div class="sm__trans-ev">{{ L?.evidence }}：{{ t.evidence }}</div>
        </div>
      </div>
      <!-- 事件源 -->
      <div class="sm__row" data-testid="sm-events">
        <span class="sm__label">{{ L?.eventSources }}</span>
        <span v-for="e in data.doc?.eventSources" :key="e.id" class="sm__tag is-src" :title="e.authority">{{ e.id }} · {{ e.kind }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.sm {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sm__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted, #878c99); text-transform: uppercase; letter-spacing: 0.04em; }
.sm__chip { font-size: 10.5px; color: var(--text-muted, #878c99); border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 1px 8px;
  &.is-bad { color: #b91c1c; border-color: #b91c1c55; background: #fee2e2; } }
.sm__error { color: #dc2626; font-size: 12px; }
.sm__empty { border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 16px; text-align: center; font-size: 12px; color: var(--text-muted, #878c99); }
.sm__row { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.sm__label { font-size: 10.5px; color: var(--text-muted, #878c99); }
.sm__tag { font-size: 9.5px; font-weight: 700; border-radius: 4px; padding: 0 6px; line-height: 1.6; color: #334155; background: #f1f5f9;
  &.is-src { color: #1d4ed8; background: #dbeafe; } }
.sm__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px; }
.sm__trans { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px 10px; font-size: 11px; }
.sm__trans-head { display: flex; gap: 8px; align-items: baseline; }
.sm__from-to { font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-muted, #878c99); }
.sm__trans-line { margin-top: 2px; font-size: 10.5px; }
.sm__trans-ev { margin-top: 2px; font-size: 10px; color: var(--text-muted, #878c99); }
</style>
