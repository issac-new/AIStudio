<!-- overlay/custom/client/governance/components/DecisionRulesSection.vue -->
<!-- 决策规则闸（乙6 的 UI 化，2026-10-01 用户裁定）：规则注册表只读投影——
     mode 徽标 + 规则表（命中条件/动作/提示）+ 校验问题红条。
     写面按 4A 设计"不做 UI 编辑器"：mode 经 GOVERNANCE_RULES_MODE/YAML。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchDecisionRules, type DecisionRulesResp } from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { decisionRules: Record<string, string> }).decisionRules
})

const data = ref<DecisionRulesResp | null>(null)
const error = ref('')

const modeZh = computed(() => ({ off: '关闭', warn: '告警（默认）', enforce: '强制拒派' }[data.value?.doc?.mode ?? ''] ?? (data.value?.doc?.mode ?? '—')))

async function refresh(): Promise<void> {
  error.value = ''
  try {
    data.value = await fetchDecisionRules()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="dr" data-testid="gov-decision-rules">
    <div class="dr__bar">
      <h3 class="dr__title">{{ L?.title }}</h3>
      <span v-if="data?.doc" class="dr__mode" :data-mode="data.doc.mode" data-testid="dr-mode">
        {{ L?.mode }}：{{ modeZh }}
      </span>
    </div>
    <p class="dr__sub">{{ L?.sub }}</p>
    <div v-if="error" class="dr__error">{{ error }}</div>
    <div v-else-if="data && !data.exists" class="dr__missing" data-testid="dr-missing">{{ L?.missing }}</div>
    <div v-else-if="!data" class="dr__empty">…</div>
    <template v-else>
      <div v-if="data.problems?.length" class="dr__problems" data-testid="dr-problems">
        {{ L?.problems }}：{{ data.problems.join('；') }}
      </div>
      <div class="dr__table" data-testid="dr-rules">
        <div class="dr__thead">
          <span>#</span><span>{{ L?.when }}</span><span>{{ L?.then }}</span><span>{{ L?.message }}</span>
        </div>
        <div v-for="(r, i) in data.doc?.rules ?? []" :key="r.id" class="dr__tr" :data-testid="`dr-rule-${r.id}`">
          <span class="dr__id" :title="r.description">{{ i + 1 }} · {{ r.id }}</span>
          <span class="dr__when"><code v-for="(v, k) in r.when" :key="k">{{ k }}={{ v }}</code></span>
          <span class="dr__then" :class="`is-${r.then}`">{{ r.then === 'deny' ? '拒派' : '提醒' }}</span>
          <span class="dr__msg">{{ r.message }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.dr {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dr__bar { display: flex; align-items: center; gap: 8px; }
.dr__title { margin: 0; font-size: 14px; }
.dr__mode { font-size: 12px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--border-color, #e5e7eb); }
.dr__mode[data-mode="enforce"] { color: #fff; background: var(--danger, #dc2626); border-color: transparent; }
.dr__mode[data-mode="warn"] { color: var(--warning-ink, #92400e); background: rgb(254 243 199); border-color: transparent; }
.dr__mode[data-mode="off"] { opacity: 0.6; }
.dr__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.dr__error { color: var(--danger, #dc2626); font-size: 12px; }
.dr__missing, .dr__empty { font-size: 12px; opacity: 0.6; }
.dr__problems { font-size: 12px; color: var(--danger, #dc2626); background: rgb(254 226 226); border-radius: 6px; padding: 4px 8px; }
.dr__table { display: flex; flex-direction: column; font-size: 12px; border-top: 1px solid var(--border-color, #e5e7eb); }
.dr__thead, .dr__tr { display: grid; grid-template-columns: 160px 1fr 64px 2fr; gap: 8px; padding: 4px 0; border-bottom: 1px dashed var(--border-color, #e5e7eb); }
.dr__thead { font-size: 11px; opacity: 0.6; }
.dr__id { font-family: monospace; font-size: 11px; }
.dr__when code { font-size: 11px; background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; margin-right: 4px; }
.dr__then { font-weight: 600; }
.dr__then.is-deny { color: var(--danger, #dc2626); }
.dr__then.is-warn { color: var(--warning-ink, #92400e); }
.dr__msg { font-size: 11px; opacity: 0.85; }
</style>
