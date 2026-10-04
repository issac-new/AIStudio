<!-- overlay/custom/client/governance/components/RsiMaturitySection.vue -->
<!-- 驾驭工程 B6：RSI 分级自检（P9，2026-10-04 九源轮）。L1-L5 阶梯三态（带本机证据）
     + 五元组盘点（Model/Harness/Data/Trainer/Improvement）。自检非认证；
     "机制存在"≠"级别达成"，L4 为安全取舍性未达成。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

interface Evidence { anchor: string; present: boolean }
interface Level { key: string; achieved: boolean | null; title: string; whatItMeans: string; evidence: Evidence[]; gap: string }
interface Element { key: string; evolvable: 'yes' | 'partial' | 'no'; how: string; anchor: string }

const data = ref<{ levels: Level[]; elements: Element[]; meta: { note: string; source: string; boundary: string } } | null>(null)
const error = ref('')
const busy = ref(false)

const LEVEL_NAMES = computed(() => String(L.value.rsiLevelNames ?? '').split('|'))

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/api/harness/rsi-maturity', { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data.value = await res.json()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function authHeaders(): Record<string, string> {
  const jwt = localStorage.getItem('hermes_api_key') || ''
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

onMounted(() => void refresh())
</script>

<template>
  <div class="rs" data-testid="harness-rsi-maturity">
    <div class="rs__bar">
      <h3 class="rs__title">{{ L?.rsiTitle }}</h3>
      <button type="button" class="rs__refresh" data-testid="harness-rsi-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="rs__sub">{{ L?.rsiSub }}</p>
    <div v-if="error" class="rs__error">{{ L?.loadFailed }}：{{ error }}</div>

    <div v-if="data" class="rs__ladder" data-testid="harness-rsi-ladder">
      <details
        v-for="lv in data.levels" :key="lv.key"
        class="rs__level" :class="{ 'rs__level--ok': lv.achieved === true, 'rs__level--fail': lv.achieved === false }"
        :data-testid="`harness-rsi-level-${lv.key}`"
      >
        <summary>
          <span class="rs__lvkey">{{ lv.key }}</span>
          <span class="rs__lvname">{{ lv.title }}</span>
          <span class="rs__lvstate" :class="`rs__lvstate--${lv.achieved === true ? 'ok' : lv.achieved === false ? 'fail' : 'na'}`">
            {{ lv.achieved === true ? L?.achieved : lv.achieved === false ? L?.notAchieved : L?.undetermined }}
          </span>
        </summary>
        <div class="rs__means">{{ lv.whatItMeans }}</div>
        <ul class="rs__ev">
          <li v-for="(ev, i) in lv.evidence" :key="i">
            <span :class="ev.present ? 'rs__evok' : 'rs__evmiss'">{{ ev.present ? '✓' : '✗' }}</span>
            <code>{{ ev.anchor }}</code>
          </li>
        </ul>
        <div v-if="lv.gap" class="rs__gap">{{ lv.gap }}</div>
      </details>
    </div>

    <div v-if="data" class="rs__elements" data-testid="harness-rsi-elements">
      <div v-for="el in data.elements" :key="el.key" class="rs__el" :data-testid="`harness-rsi-el-${el.key}`">
        <code class="rs__elkey">{{ el.key }}</code>
        <span class="rs__elbadge" :class="`rs__elbadge--${el.evolvable}`">
          {{ el.evolvable === 'yes' ? L?.rsiEvolvableYes : el.evolvable === 'partial' ? L?.rsiEvolvablePartial : L?.rsiEvolvableNo }}
        </span>
        <span class="rs__elhow">{{ el.how }}</span>
      </div>
    </div>
    <div v-if="data" class="rs__meta" data-testid="harness-rsi-note">{{ data.meta.note }}{{ data.meta.boundary }}</div>
  </div>
</template>

<style scoped lang="scss">
.rs { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.rs__bar { display: flex; align-items: center; gap: 8px; }
.rs__title { margin: 0; font-size: 14px; }
.rs__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.rs__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.rs__error { color: var(--danger, #dc2626); font-size: 12px; }
.rs__ladder { display: flex; flex-direction: column; gap: 4px; }
.rs__level { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 4px 8px; }
.rs__level--ok { border-color: var(--ok, #16a34a); }
.rs__level--fail { border-color: rgb(217 119 6 / 60%); }
.rs__level summary { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; list-style: none; }
.rs__level summary::-webkit-details-marker { display: none; }
.rs__lvkey { font-weight: 600; font-size: 12px; }
.rs__lvname { font-size: 12px; opacity: 0.85; }
.rs__lvstate { margin-left: auto; font-size: 11px; padding: 0 6px; border-radius: 8px; border: 1px solid; flex-shrink: 0; }
.rs__lvstate--ok { color: var(--ok-ink, #166534); border-color: var(--ok, #16a34a); }
.rs__lvstate--fail { color: var(--warning-ink, #92400e); border-style: dashed; border-color: currentColor; }
.rs__lvstate--na { color: var(--text-muted, #878c99); border-style: dashed; border-color: currentColor; }
.rs__means { font-size: 11.5px; opacity: 0.75; margin: 4px 0 2px; }
.rs__ev { margin: 2px 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.rs__ev li { display: flex; gap: 6px; align-items: baseline; font-size: 11px; }
.rs__ev code { background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; }
.rs__evok { color: var(--ok, #16a34a); }
.rs__evmiss { color: var(--danger, #dc2626); }
.rs__gap { font-size: 11px; color: var(--warning-ink, #92400e); margin-top: 2px; }
.rs__elements { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px; }
.rs__el { display: flex; align-items: baseline; gap: 6px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 4px 6px; font-size: 11.5px; flex-wrap: wrap; }
.rs__elkey { font-size: 10.5px; background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; }
.rs__elbadge { font-size: 10px; padding: 0 5px; border-radius: 8px; border: 1px solid currentColor; }
.rs__elbadge--yes { color: var(--ok-ink, #166534); }
.rs__elbadge--partial { color: var(--warning-ink, #92400e); border-style: dashed; }
.rs__elbadge--no { color: var(--text-muted, #878c99); }
.rs__elhow { opacity: 0.8; }
.rs__meta { font-size: 11px; color: var(--warning-ink, #92400e); background: rgb(254 243 199 / 50%); border-radius: 6px; padding: 4px 8px; }
</style>
