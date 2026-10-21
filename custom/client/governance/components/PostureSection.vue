<!-- overlay/custom/client/governance/components/PostureSection.vue -->
<!-- AGT 吸收轮 A/B/D（2026-10-21）：治理姿态对账 + 审计链防篡改 + MCP 漂移。
     立场：吸收微软 Agent Governance Toolkit「策略没加载时默认 allow，仪表盘照样
     显示 governed」的批评——本面板只显示实际生效值，治理没生效就如实亮红。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchGovernancePosture, fetchPolicyDecisionChain, fetchApprovalChain,
  fetchMcpDrift, rebaseMcpDrift,
  type GovernancePostureResp, type ChainVerifyResp, type McpDriftResp,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { posture: Record<string, string> }).posture
})

const posture = ref<GovernancePostureResp | null>(null)
const policyChain = ref<ChainVerifyResp | null>(null)
const approvalChain = ref<ChainVerifyResp | null>(null)
const drift = ref<McpDriftResp | null>(null)
const error = ref('')
const busy = ref('')

async function refresh(): Promise<void> {
  error.value = ''
  try {
    posture.value = await fetchGovernancePosture()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function verifyChains(): Promise<void> {
  busy.value = 'chain'
  try {
    const [p, a] = await Promise.all([fetchPolicyDecisionChain(), fetchApprovalChain()])
    policyChain.value = p
    approvalChain.value = a
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = ''
  }
}

async function refreshDrift(): Promise<void> {
  busy.value = 'drift'
  try {
    drift.value = await fetchMcpDrift()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = ''
  }
}

async function rebase(): Promise<void> {
  busy.value = 'rebase'
  try {
    await rebaseMcpDrift()
    await refreshDrift()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = ''
  }
}

const lampZh = computed(() => ({
  governed: L.value?.lampGoverned ?? '',
  partial: L.value?.lampPartial ?? '',
  bare: L.value?.lampBare ?? '',
}))

const summaryText = computed(() => {
  const s = posture.value?.summary
  if (!s) return ''
  return (L.value?.summary ?? '')
    .replace('{total}', String(s.total))
    .replace('{governed}', String(s.governed))
    .replace('{partial}', String(s.partial))
    .replace('{bare}', String(s.bare))
    .replace('{missing}', String(s.configMissing))
})

function modeText(p: { approvalsMode: string | null; approvalsDeclared: boolean }): string {
  if (p.approvalsMode) return p.approvalsMode
  return p.approvalsDeclared ? '—' : (L.value?.undeclared ?? '—')
}

function chainText(c: ChainVerifyResp | null): string {
  if (!c) return '—'
  if (c.error) return c.error
  if (c.intact) {
    const un = c.unchained > 0 ? ` · ${String(L.value?.chainUnchained ?? '').replace('{n}', String(c.unchained))}` : ''
    return `${L.value?.chainIntact ?? ''}（${c.chained}/${c.total}）${un}`
  }
  return String(L.value?.chainBroken ?? '').replace('{first}', String(c.firstBroken ?? '?'))
}

onMounted(() => {
  void refresh()
  void refreshDrift()
})
</script>

<template>
  <div class="pt" data-testid="gov-posture">
    <div class="pt__bar">
      <h3 class="pt__title">{{ L?.title }}</h3>
      <button type="button" class="pt__btn" @click="() => void refresh()">{{ L?.chainVerify }}</button>
    </div>
    <p class="pt__sub">{{ L?.sub }}</p>
    <div v-if="error" class="pt__error">{{ error }}</div>
    <div v-else-if="!posture" class="ui-empty-state">…</div>
    <template v-else>
      <div class="pt__global" data-testid="pt-global">
        <span class="pt__chip" :data-on="posture.global.enforceMasterOn">
          {{ L?.enforceMaster }}：{{ posture.global.enforceMasterOn ? 'ON' : 'OFF' }}
        </span>
        <span class="pt__chip" :data-on="posture.global.strictOn" :title="L?.strictHint">
          {{ L?.strict }}：{{ posture.global.strictOn ? 'ON' : 'OFF' }}
        </span>
        <span class="pt__chip">{{ L?.enforceMode }}：{{ posture.global.enforceMode ?? '—' }}</span>
        <span class="pt__chip" :title="`${L?.rules}：沙箱 ${posture.global.sandboxRoots} / 浏览器白 ${posture.global.browserAllow} / 黑 ${posture.global.browserDeny} / 工具黑名单 ${posture.global.toolBlacklist} / 预算 ${posture.global.budgetPolicies} / 身份 ${posture.global.identityAllowlists} / 阶梯 ${posture.global.ladderEntries}`">
          {{ L?.loadedRules }}：{{ posture.global.loadedRuleTotal }}
        </span>
        <span class="pt__chip" :data-on="posture.ledger.exists">{{ L?.ledger }}：{{ posture.ledger.exists ? 'OK' : '缺' }}</span>
      </div>

      <p class="pt__summary" data-testid="pt-summary">{{ summaryText }}</p>
      <div class="pt__table" data-testid="pt-profiles">
        <div class="pt__thead">
          <span>{{ L?.lamp }}</span><span>{{ L?.profile }}</span><span>{{ L?.approvalsMode }}</span><span>{{ L?.expected }}</span><span>{{ L?.deviations }}</span>
        </div>
        <div v-for="p in posture.profiles" :key="p.name" class="pt__tr" :data-testid="`pt-row-${p.name}`">
          <span class="pt__lamp" :data-lamp="p.lamp">{{ lampZh[p.lamp] }}</span>
          <span class="pt__name">{{ p.name }}</span>
          <span>{{ modeText(p) }}</span>
          <span>{{ p.expectedApprovalsMode ?? '—' }}</span>
          <span class="pt__dev">
            <template v-if="p.deviations.length">{{ p.deviations.join('；') }}</template>
            <template v-else>—</template>
          </span>
        </div>
      </div>
      <p v-if="!posture.expectations.exists" class="pt__hint">{{ L?.expectationsMissing }}</p>

      <div class="pt__chains" data-testid="pt-chains">
        <div class="pt__chainhead">
          <h4>{{ L?.chainTitle }}</h4>
          <button type="button" class="pt__btn" :disabled="busy === 'chain'" @click="() => void verifyChains()">{{ L?.chainVerify }}</button>
        </div>
        <div class="pt__chain" data-testid="pt-chain-policy">
          <span>{{ L?.chainPolicy }}：</span>
          <span :class="{ 'is-ok': policyChain?.intact, 'is-bad': policyChain && !policyChain.intact }">{{ chainText(policyChain) }}</span>
        </div>
        <div class="pt__chain" data-testid="pt-chain-approval">
          <span>{{ L?.chainApproval }}：</span>
          <span :class="{ 'is-ok': approvalChain?.intact, 'is-bad': approvalChain && !approvalChain.intact }">{{ chainText(approvalChain) }}</span>
        </div>
      </div>

      <div class="pt__drift" data-testid="pt-drift">
        <div class="pt__chainhead">
          <h4>{{ L?.mcpDriftTitle }}</h4>
          <button type="button" class="pt__btn" :disabled="busy === 'drift' || busy === 'rebase'" @click="() => void refreshDrift()">{{ L?.chainVerify }}</button>
          <button type="button" class="pt__btn" :disabled="busy === 'rebase'" @click="() => void rebase()">{{ L?.mcpDriftRebase }}</button>
        </div>
        <div v-if="drift?.error" class="pt__error">{{ drift.error }}</div>
        <div v-else-if="drift && !drift.hasBaseline" class="pt__hint">{{ L?.mcpDriftNoBaseline }}</div>
        <div v-else-if="drift && drift.drift.length === 0" class="pt__ok">{{ L?.mcpDriftClean }}</div>
        <div v-else-if="drift" class="pt__table">
          <div v-for="d in drift.drift" :key="`${d.face}/${d.key}`" class="pt__tr pt__tr--drift">
            <span class="pt__lamp" :data-lamp="d.change === 'added' ? 'bare' : 'partial'">{{ d.change }}</span>
            <span class="pt__name">{{ d.face === 'mcp-server' ? 'server' : 'plugin' }} · {{ d.key }}</span>
            <span>{{ d.detail ?? '' }}</span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.pt {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pt__bar, .pt__chainhead { display: flex; align-items: center; gap: 8px; }
.pt__title, .pt__chainhead h4 { margin: 0; font-size: 14px; }
.pt__sub, .pt__hint, .pt__summary { margin: 0; font-size: 12px; opacity: 0.7; }
.pt__error { color: var(--danger); font-size: 12px; }
.pt__ok { font-size: 12px; color: rgb(21 128 61); }
.pt__global { display: flex; flex-wrap: wrap; gap: 6px; }
.pt__chip {
  font-size: 12px; padding: 1px 8px; border-radius: 8px;
  border: 1px solid var(--border-color); opacity: 0.9;
}
.pt__chip[data-on="true"] { color: rgb(21 128 61); border-color: rgb(134 239 172); }
.pt__chip[data-on="false"] { color: var(--danger); border-color: rgb(252 165 165); }
.pt__table { display: flex; flex-direction: column; font-size: 12px; border-top: 1px solid var(--border-color); }
.pt__thead, .pt__tr { display: grid; grid-template-columns: 64px 110px 150px 70px 1fr; gap: 8px; padding: 3px 0; border-bottom: 1px dashed var(--border-color); }
.pt__thead { font-size: 11px; opacity: 0.6; }
.pt__lamp { font-weight: 600; font-size: 11px; }
.pt__lamp[data-lamp="governed"] { color: rgb(21 128 61); }
.pt__lamp[data-lamp="partial"] { color: rgb(180 83 9); }
.pt__lamp[data-lamp="bare"] { color: var(--danger); }
.pt__name { font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.pt__dev { font-size: 11px; opacity: 0.85; }
.pt__chains, .pt__drift { border-top: 1px solid var(--border-color); padding-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.pt__chain { font-size: 12px; }
.pt__chain .is-ok { color: rgb(21 128 61); }
.pt__chain .is-bad { color: var(--danger); font-weight: 600; }
.pt__btn { font-size: 11px; padding: 1px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); cursor: pointer; }
.pt__btn:disabled { opacity: 0.5; cursor: default; }
</style>
