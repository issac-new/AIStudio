<!-- overlay/custom/client/governance/components/PrimitivesSection.vue -->
<!-- 驾驭工程 B4：八工程原语对账（覆盖矩阵：每原语 × 唯一标识/版本/生命周期/审计四属性
     有/部分/缺）+ 活体计数 + 展开（idPattern/存储/版本来源/审计挂点/代码锚点）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import { fetchPrimitives, type CoverageAttribute, type PrimitiveRowDto, type PrimitivesDto } from '@/custom/governance/api/harness'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.harness : governanceMessages.en.governance.harness
})

const data = ref<PrimitivesDto | null>(null)
const error = ref('')
const busy = ref(false)

const ATTRS: CoverageAttribute[] = ['identity', 'version', 'lifecycle', 'audit']
const ATTR_LABELS = computed<Record<CoverageAttribute, string>>(() => ({
  identity: L.value.attrIdentity,
  version: L.value.attrVersion,
  lifecycle: L.value.attrLifecycle,
  audit: L.value.attrAudit,
}))
const STATUS_CLASS: Record<string, string> = { '有': 'ok', '部分': 'partial', '缺': 'gap' }

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    data.value = await fetchPrimitives()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

const primitives = computed<PrimitiveRowDto[]>(() => data.value?.primitives ?? [])

onMounted(() => void refresh())
</script>

<template>
  <div class="hp" data-testid="harness-primitives">
    <div class="hp__bar">
      <h3 class="hp__title">{{ L?.primitivesTitle }}</h3>
      <span v-if="data" class="hp__chip" data-testid="harness-primitives-summary">
        {{ L?.fullyCovered }} {{ data.matrix.fullyCovered }} / {{ data.matrix.totalPrimitives }}
      </span>
      <button type="button" class="hp__refresh" data-testid="harness-primitives-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L?.loading : L?.refresh }}
      </button>
    </div>
    <p class="hp__sub">{{ L?.primitivesSub }}</p>
    <div v-if="error" class="hp__error">{{ L?.loadFailed }}：{{ error }}</div>

    <div class="hp__tablewrap">
      <table class="hp__table" data-testid="harness-primitives-matrix">
        <thead>
          <tr>
            <th>{{ L?.colPrimitive }}</th>
            <th>{{ L?.liveCount }}</th>
            <th v-for="a in ATTRS" :key="a">{{ ATTR_LABELS[a] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in primitives" :key="p.key" :data-testid="`harness-primitives-row-${p.key}`">
            <td>
              <details class="hp__detail">
                <summary class="hp__namesum">
                  <b>{{ p.name }}</b> <span class="hp__en">{{ p.enName }}</span>
                </summary>
                <div class="hp__detailbody">
                  <div class="hp__drow"><span>{{ L?.colIdPattern }}</span><code>{{ p.idPattern }}</code></div>
                  <div class="hp__drow"><span>{{ L?.colStorage }}</span><code>{{ p.storage }}</code></div>
                  <div class="hp__drow"><span>{{ L?.colVersionSource }}</span><code>{{ p.versionSource }}</code></div>
                  <div class="hp__drow"><span>{{ L?.colLifecycle }}</span><code>{{ p.lifecycle.join(' → ') }}</code></div>
                  <div class="hp__drow"><span>{{ L?.colAuditHook }}</span><code>{{ p.auditHook }}</code></div>
                  <div class="hp__notes">
                    <div v-for="(note, attr) in p.coverageNotes" :key="attr" class="hp__note">
                      · {{ ATTR_LABELS[attr as CoverageAttribute] }}：{{ note }}
                    </div>
                  </div>
                  <div class="hp__anchors">
                    <div class="hp__anchorhead">{{ L?.anchor }}</div>
                    <ul>
                      <li v-for="a in p.anchors" :key="a"><code>{{ a }}</code></li>
                    </ul>
                  </div>
                </div>
              </details>
            </td>
            <td>
              <span class="hp__count">{{ p.liveCount ?? '—' }}</span>
              <span v-if="p.liveCountNote" class="hp__countnote" :title="p.liveCountNote">{{ p.liveCountNote }}</span>
            </td>
            <td v-for="a in ATTRS" :key="a">
              <span class="hp__status" :class="`hp__status--${STATUS_CLASS[p.coverage[a]]}`" :title="p.coverageNotes[a] || ''">
                {{ p.coverage[a] }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hp { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.hp__bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hp__title { margin: 0; font-size: 14px; }
.hp__chip { font-size: 12px; opacity: 0.85; }
.hp__refresh { margin-left: auto; font-size: 12px; cursor: pointer; }
.hp__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.hp__error { color: var(--danger, #dc2626); font-size: 12px; }
.hp__tablewrap { overflow: auto; }
.hp__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.hp__table th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--border-color, #e5e7eb); padding: 4px 6px; white-space: nowrap; }
.hp__table td { border-bottom: 1px solid var(--border-color, rgb(0 0 0 / 5%)); padding: 4px 6px; vertical-align: top; }
.hp__detail summary { cursor: pointer; list-style: none; }
.hp__detail summary::-webkit-details-marker { display: none; }
.hp__en { opacity: 0.6; font-size: 11px; }
.hp__detailbody { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; max-width: 520px; }
.hp__drow { display: flex; gap: 6px; font-size: 11px; & > span { flex-shrink: 0; opacity: 0.7; width: 72px; } }
.hp__drow code { font-size: 10.5px; word-break: break-all; }
.hp__notes { font-size: 11px; opacity: 0.8; }
.hp__note { display: inline; }
.hp__anchors { font-size: 11px; }
.hp__anchorhead { opacity: 0.7; }
.hp__anchors ul { margin: 2px 0 0; padding-left: 14px; }
.hp__anchors code { font-size: 10px; word-break: break-all; }
.hp__count { font-variant-numeric: tabular-nums; font-weight: 600; }
.hp__countnote { display: block; font-size: 10px; opacity: 0.6; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp__status { font-size: 11px; padding: 0 6px; border-radius: 8px; border: 1px solid; }
.hp__status--ok { color: var(--ok-ink, #166534); border-color: var(--ok, #16a34a); background: rgb(134 239 172 / 25%); }
.hp__status--partial { color: var(--warning-ink, #92400e); border-color: var(--warning, #f59e0b); background: rgb(254 243 199 / 60%); }
.hp__status--gap { color: var(--danger, #dc2626); border-color: currentColor; background: rgb(254 202 202 / 25%); }
</style>
