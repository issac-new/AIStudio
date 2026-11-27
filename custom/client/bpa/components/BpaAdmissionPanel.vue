<!-- overlay/custom/client/bpa/components/BpaAdmissionPanel.vue -->
<!-- 场景准入面板（2026-11-28 B2）：逐节点四条排除规则三态 + 人签署「可进入试点/暂缓」。
     只披露不评分：没有打分、没有加权、没有排序；「需补条件」由缺口推导不签署；
     署名是登录身份（服务端取，界面不填签署人输入框）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { bpaApi, type AdmissionAssessmentDto, type AdmissionRecordDto, type AdmissionRuleVerdict } from '@/custom/bpa/api'
import type { BpaMessages } from '@/custom/bpa/i18n'

const props = defineProps<{ L: BpaMessages; active?: boolean }>()

const nodes = ref<Array<AdmissionAssessmentDto & { latest: AdmissionRecordDto | null }>>([])
const peopleAvailable = ref(true)
const loading = ref(false)
const error = ref('')
const signingId = ref('')
const reason = ref('')
const signError = ref('')
const signOkId = ref('')

/** 只列三级流程（场景=单条流程）；其它层级的节点在架构清单编辑器里也能补字段。 */
const scenarios = computed(() => nodes.value.filter((n) => n.level === 3))

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const r = await bpaApi.admission()
    nodes.value = r.nodes
    peopleAvailable.value = r.peopleAvailable
  } catch (e) {
    error.value = `${props.L.admission.loadFailed}：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function verdictClass(v: AdmissionRuleVerdict): string {
  return v === 'hit' ? 'is-hit' : v === 'undetermined' ? 'is-undetermined' : 'is-clear'
}

function ruleLabel(code: string): string {
  const map: Record<string, string> = {
    OWNER_MISSING: props.L.admission.ruleOwner,
    NO_BASELINE: props.L.admission.ruleBaseline,
    DATA_UNLAWFUL: props.L.admission.ruleData,
    MAJOR_UNREVIEWED: props.L.admission.ruleMajor,
  }
  return map[code] ?? code
}

function derivedLabel(d: string): string {
  return d === 'eligible' ? props.L.admission.derivedEligible : props.L.admission.derivedBlocked
}

function conclusionLabel(c: string): string {
  return c === 'pilot' ? props.L.admission.conclusionPilot : props.L.admission.conclusionDeferred
}

async function sign(nodeId: string, conclusion: 'pilot' | 'deferred'): Promise<void> {
  signingId.value = nodeId
  signError.value = ''
  try {
    await bpaApi.signAdmission(nodeId, conclusion, reason.value.trim())
    signOkId.value = nodeId
    setTimeout(() => { signOkId.value = '' }, 2000)
    reason.value = ''
    await refresh()
  } catch (e) {
    signError.value = `${conclusionLabel(conclusion)}${props.L.admission.signFailedSuffix}：${e instanceof Error ? e.message : String(e)}`
  } finally {
    signingId.value = ''
  }
}

onMounted(() => void refresh())
// 页签激活时重拉：本面板在首次进 /app/bpa 时就挂载（v-show 切换不重挂），
// 架构在页外被 seed/编辑后不重拉会显示过期空列表（2026-11-28 走查实证）
watch(() => props.active, (now, prev) => {
  if (now && !prev) void refresh()
})
</script>

<template>
  <div class="bpa-admission" data-testid="bpa-admission-panel">
    <p class="muted hint">{{ L.admission.hint }}</p>
    <p v-if="!peopleAvailable" class="warn" data-testid="bpa-admission-people-missing">{{ L.admission.peopleMissing }}</p>
    <div v-if="error" class="err">{{ error }}</div>

    <div v-for="n in scenarios" :key="n.nodeId" class="node" :class="{ 'node--eligible': n.derived === 'eligible' }" :data-testid="`bpa-admission-node-${n.nodeId}`">
      <header class="node__head">
        <span class="mono">{{ n.nodeId }}</span>
        <strong>{{ n.nodeName }}</strong>
        <span class="derived" :class="n.derived === 'eligible' ? 'is-eligible' : 'is-blocked'" :data-testid="`bpa-admission-derived-${n.nodeId}`">
          {{ derivedLabel(n.derived) }}
        </span>
      </header>

      <ul class="rules">
        <li v-for="r in n.rules" :key="r.rule" class="rule" :class="verdictClass(r.verdict)" :data-testid="`bpa-admission-rule-${n.nodeId}-${r.rule}`">
          <span class="rule__name">{{ ruleLabel(r.rule) }}</span>
          <span class="rule__verdict">{{ r.verdict === 'hit' ? L.admission.verdictHit : r.verdict === 'undetermined' ? L.admission.verdictUndetermined : L.admission.verdictClear }}</span>
          <span class="rule__detail">{{ r.detail }}</span>
        </li>
      </ul>

      <ul v-if="n.pendingItems.length > 0" class="pending" :data-testid="`bpa-admission-pending-${n.nodeId}`">
        <li v-for="(item, i) in n.pendingItems" :key="i">{{ item }}</li>
      </ul>

      <div v-if="n.latest" class="latest" :data-testid="`bpa-admission-latest-${n.nodeId}`">
        <span class="latest__conclusion" :class="n.latest.conclusion === 'pilot' ? 'is-pilot' : 'is-deferred'">{{ conclusionLabel(n.latest.conclusion) }}</span>
        <span class="muted">{{ L.admission.signedBy }}：{{ n.latest.signedBy }} · {{ new Date(n.latest.signedAt).toLocaleString() }}</span>
        <span class="muted small">{{ n.latest.reason }}</span>
      </div>

      <div class="sign-bar">
        <input
          v-model="reason"
          class="reason"
          :placeholder="L.admission.reasonPh"
          :data-testid="`bpa-admission-reason-${n.nodeId}`"
        />
        <button
          type="button" class="primary"
          :disabled="signingId !== '' || reason.trim().length < 10"
          :data-testid="`bpa-admission-sign-pilot-${n.nodeId}`"
          @click="sign(n.nodeId, 'pilot')"
        >{{ L.admission.signPilot }}</button>
        <button
          type="button" class="ghost"
          :disabled="signingId !== '' || reason.trim().length < 10"
          :data-testid="`bpa-admission-sign-deferred-${n.nodeId}`"
          @click="sign(n.nodeId, 'deferred')"
        >{{ L.admission.signDeferred }}</button>
        <span v-if="signOkId === n.nodeId" class="ok">✓ {{ L.admission.signed }}</span>
      </div>
      <p v-if="signError" class="err">{{ signError }}</p>
    </div>

    <p v-if="scenarios.length === 0 && !loading && !error" class="muted">{{ L.admission.empty }}</p>
  </div>
</template>

<style scoped lang="scss">
.bpa-admission { display: flex; flex-direction: column; gap: 10px; }
.hint { margin: 0; }
.warn { margin: 0; color: var(--ia-stale); font-size: 12px; }
.node { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
  &--eligible { border-left: 3px solid var(--success); } }
.node__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.derived { margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--border-color);
  &.is-eligible { color: var(--success); }
  &.is-blocked { color: var(--warning); } }
.rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.rule { display: flex; gap: 8px; font-size: 12px; align-items: baseline; flex-wrap: wrap;
  .rule__name { font-weight: 600; min-width: 88px; }
  .rule__verdict { padding: 0 6px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 11px; }
  .rule__detail { opacity: 0.75; flex: 1; min-width: 200px; }
  &.is-hit .rule__verdict { color: var(--danger); }
  &.is-undetermined .rule__verdict { color: var(--ia-stale); }
  &.is-clear .rule__verdict { color: var(--success); } }
.pending { margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--warning); }
.latest { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; border-top: 1px dashed var(--border-color); padding-top: 6px;
  .latest__conclusion { font-weight: 600; &.is-pilot { color: var(--success); } &.is-deferred { color: var(--warning); } } }
.sign-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  .reason { flex: 1; min-width: 240px; border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 10px; font-size: 12px; background: var(--bg-primary); color: inherit; } }
button.primary { background: var(--accent-primary); color: var(--text-on-accent); border: none; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 12px;
  &:disabled { opacity: 0.55; cursor: not-allowed; } }
button.ghost { background: transparent; border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 12px;
  &:disabled { opacity: 0.55; cursor: not-allowed; } }
.err { color: var(--danger); font-size: 12px; margin: 0; }
.ok { color: var(--success); font-size: 12px; }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
