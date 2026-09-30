<!-- overlay/custom/client/governance/components/OrgDiagnosisSection.vue -->
<!-- 五流断点诊断（甲1+甲2 展示面，2026-09-30 调研落地）：信息/决策/责任/资源/反馈
     五流断点信号卡 + 人工介入趋势 + 待归因升级操作区（归因五选一）+ 机制改进候选。
     数据全真实：/api/governance/org-diagnosis（只读聚合）；归因动作走
     /api/escalation/:id/attribution。信号源缺席如实 unknown，不编造。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  attributeEscalation, fetchOrgDiagnosis,
  type FlowDiagnosisDto, type OrgDiagnosisResp,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { orgDiagnosis: Record<string, string> & { severity: Record<string, string>; gapLabels: Record<string, string> } }).orgDiagnosis
})

const data = ref<OrgDiagnosisResp | null>(null)
const error = ref('')
/** 归因操作态：当前展开的 escalationId + 选择中的 gap。 */
const attributing = ref('')
const gapChoice = ref('')
const actionMsg = ref('')

const GAPS = ['information', 'authority', 'capability', 'resource', 'feedback', 'none'] as const

async function refresh(): Promise<void> {
  error.value = ''
  actionMsg.value = ''
  try {
    data.value = await fetchOrgDiagnosis()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function submitAttribution(id: string): Promise<void> {
  if (!gapChoice.value) return
  try {
    const res = await attributeEscalation(id, gapChoice.value)
    if (res.ok) {
      attributing.value = ''
      gapChoice.value = ''
      actionMsg.value = `${id} ${L.value?.attributionDone ?? ''}`
      await refresh()
    } else {
      actionMsg.value = `${L.value?.attributionFailed ?? ''}：${res.detail ?? ''}`
    }
  } catch (e) {
    actionMsg.value = `${L.value?.attributionFailed ?? ''}：${e instanceof Error ? e.message : String(e)}`
  }
}

function flowAlerts(f: FlowDiagnosisDto): number {
  return f.signals.filter((s) => s.severity === 'alert').length
}

onMounted(() => void refresh())
</script>

<template>
  <div class="od" data-testid="gov-org-diagnosis">
    <div class="od__bar">
      <h3 class="od__title">{{ L?.title }}</h3>
      <span v-if="data" class="od__chip" data-testid="od-intervention">
        {{ L?.manualIntervention }}：{{ L?.last7d }} {{ data.manualIntervention.last7d }} · {{ L?.last30d }} {{ data.manualIntervention.last30d }}
      </span>
      <button type="button" class="od__refresh" data-testid="od-refresh" @click="refresh()">⟳</button>
    </div>
    <p class="od__sub">{{ L?.sub }}</p>
    <div v-if="error" class="od__error">{{ error }}</div>
    <div v-else-if="!data" class="od__empty">…</div>
    <template v-else>
      <!-- 五流卡片 -->
      <div class="od__grid">
        <div v-for="f in data.flows" :key="f.flow" class="od__flow" :data-testid="`od-flow-${f.flow}`">
          <div class="od__flow-head">
            <b>{{ f.title }}</b>
            <span class="od__flow-count" :class="{ 'is-alert': flowAlerts(f) > 0 }" :data-testid="`od-flow-${f.flow}-alerts`">
              {{ flowAlerts(f) > 0 ? `✕ ${flowAlerts(f)}` : '✓' }}
            </span>
          </div>
          <div class="od__essence">{{ f.essence }}</div>
          <div v-for="s in f.signals" :key="s.id" class="od__signal" :data-testid="`od-sig-${s.id}`">
            <span class="od__sev" :class="`is-${s.severity}`">{{ L?.severity?.[s.severity] ?? s.severity }}</span>
            <span class="od__sig-id">{{ s.id }}</span>
            <span class="od__sig-val">{{ s.value }}</span>
            <div class="od__sig-detail" :title="s.evidence">{{ s.detail }}</div>
          </div>
        </div>
      </div>

      <!-- 待归因升级（甲2 操作面） -->
      <div class="od__panel" data-testid="od-unattributed">
        <h4 class="od__panel-title">{{ L?.unattributedTitle }}</h4>
        <div v-if="actionMsg" class="od__action-msg">{{ actionMsg }}</div>
        <div v-if="!data.unattributed.length" class="od__empty">{{ L?.unattributedEmpty }}</div>
        <div v-for="u in data.unattributed" :key="u.escalationId" class="od__unattr">
          <span class="od__unattr-main">
            {{ u.escalationId }} · {{ u.fromAgent }} → {{ u.tool }}（{{ u.verdict }}）
          </span>
          <template v-if="attributing === u.escalationId">
            <select v-model="gapChoice" class="od__gap-select" data-testid="od-gap-select">
              <option value="" disabled>?</option>
              <option v-for="g in GAPS" :key="g" :value="g">{{ L?.gapLabels?.[g] ?? g }}</option>
            </select>
            <button type="button" class="od__gap-ok" data-testid="od-gap-submit" :disabled="!gapChoice" @click="submitAttribution(u.escalationId)">OK</button>
            <button type="button" class="od__gap-cancel" @click="attributing = ''; gapChoice = ''">✕</button>
          </template>
          <template v-else>
            <span class="od__gap-prompt">{{ L?.gapPrompt }}</span>
            <button type="button" class="od__attr-btn" :data-testid="`od-attr-${u.escalationId}`" @click="attributing = u.escalationId; gapChoice = ''">
              {{ L?.attributeAction ?? '归因' }}
            </button>
          </template>
        </div>
      </div>

      <!-- 机制改进候选 -->
      <div class="od__panel" data-testid="od-candidates">
        <h4 class="od__panel-title">{{ L?.candidatesTitle }}</h4>
        <div v-if="!data.improvementCandidates.length" class="od__empty">{{ L?.candidatesEmpty }}</div>
        <div v-for="c in data.improvementCandidates" :key="c.tool" class="od__cand" :data-testid="`od-cand-${c.tool}`">
          <div class="od__cand-head">
            <b>{{ c.tool }}</b>
            <span class="od__cand-meta">{{ c.incidents }} {{ L?.incidents }}<template v-if="c.unattributed"> · {{ c.unattributed }} 未归因</template></span>
          </div>
          <div class="od__cand-dir">{{ c.direction }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.od {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.od__bar { display: flex; align-items: center; gap: 8px; }
.od__title { margin: 0; font-size: 14px; }
.od__chip { font-size: 12px; opacity: 0.85; }
.od__refresh { margin-left: auto; border: none; background: none; cursor: pointer; font-size: 14px; }
.od__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.od__error { color: var(--danger, #dc2626); font-size: 12px; }
.od__empty { font-size: 12px; opacity: 0.6; }
.od__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.od__flow { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px; }
.od__flow-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.od__flow-count.is-alert { color: var(--danger, #dc2626); }
.od__essence { font-size: 11px; opacity: 0.65; margin: 2px 0 6px; }
.od__signal { border-top: 1px dashed var(--border-color, #e5e7eb); padding: 4px 0; font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; }
.od__sev { font-size: 11px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--border-color, #e5e7eb); }
.od__sev.is-alert { color: #fff; background: var(--danger, #dc2626); border-color: transparent; }
.od__sev.is-warn { color: var(--warning-ink, #92400e); background: rgb(254 243 199); border-color: transparent; }
.od__sev.is-ok { color: var(--ok, #15803d); border-color: rgb(134 239 172); }
.od__sev.is-unknown { opacity: 0.5; }
.od__sig-id { font-family: monospace; font-size: 11px; opacity: 0.8; }
.od__sig-val { font-weight: 600; }
.od__sig-detail { flex-basis: 100%; font-size: 11px; opacity: 0.75; }
.od__panel { border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.od__panel-title { margin: 0; font-size: 13px; }
.od__action-msg { font-size: 12px; opacity: 0.8; }
.od__unattr { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.od__unattr-main { font-family: monospace; font-size: 11px; }
.od__gap-prompt { font-size: 11px; opacity: 0.65; }
.od__gap-select { font-size: 12px; max-width: 240px; }
.od__attr-btn, .od__gap-ok, .od__gap-cancel { font-size: 12px; cursor: pointer; }
.od__cand { border-left: 3px solid var(--warning, #f59e0b); padding: 4px 8px; }
.od__cand-head { display: flex; justify-content: space-between; font-size: 12px; }
.od__cand-meta { opacity: 0.7; font-size: 11px; }
.od__cand-dir { font-size: 12px; opacity: 0.85; margin-top: 2px; }
</style>
