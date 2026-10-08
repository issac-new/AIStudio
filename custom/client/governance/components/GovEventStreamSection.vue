<!-- overlay/custom/client/governance/components/GovEventStreamSection.vue -->
<!-- 治理事件流面板（六文调研轮 F UI 化）：govbus 持久化事件流的查询面。
     域 chips + 严重级下限过滤；high 恒显（安全问题不可折叠隐藏）。空态如实。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchGovEvents, type GovEventDomainDto, type GovEventDto, type GovEventSeverityDto } from '@/custom/governance/api/incident-suite'

const DOMAINS: GovEventDomainDto[] = ['quality', 'security', 'cost', 'approval', 'autonomy', 'system']
const SEVERITIES: { key: GovEventSeverityDto | ''; label: string }[] = [
  { key: '', label: '全部级别' },
  { key: 'info', label: 'info+' },
  { key: 'warn', label: 'warn+' },
  { key: 'high', label: '仅 high' },
]
const DOMAIN_LABELS: Record<GovEventDomainDto, string> = {
  quality: '质量', security: '安全', cost: '成本', approval: '审批', autonomy: '自治', system: '系统',
}

const activeDomains = ref<Set<GovEventDomainDto>>(new Set(DOMAINS))
const minSeverity = ref<'' | GovEventSeverityDto>('')
const events = ref<GovEventDto[]>([])
const loading = ref(false)
const error = ref('')

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchGovEvents({
      // 域过滤是多选：全选=不过滤（少一个参数）；部分选=客户端滤（服务端 domain 单值）
      minSeverity: minSeverity.value === 'high' ? 'high' : minSeverity.value || undefined,
      limit: 200,
    })
    const selected = activeDomains.value
    const all = selected.size === DOMAINS.length
    events.value = res.events.filter((e) => all || selected.has(e.domain))
  } catch (e) {
    error.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function toggle(d: GovEventDomainDto): void {
  const next = new Set(activeDomains.value)
  if (next.has(d)) next.delete(d)
  else next.add(d)
  activeDomains.value = next
  void refresh()
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

onMounted(() => void refresh())
</script>

<template>
  <div class="ges" data-testid="gov-event-stream">
    <div class="ges__bar">
      <h3 class="ges__title">治理事件流（实时总线）</h3>
      <button
        v-for="d in DOMAINS" :key="d" type="button"
        class="ges__chip" :class="{ 'is-on': activeDomains.has(d), 'is-off': !activeDomains.has(d) }"
        :data-testid="`ges-domain-${d}`" @click="toggle(d)"
      >{{ DOMAIN_LABELS[d] }}</button>
      <select v-model="minSeverity" class="ges__sev" data-testid="ges-severity" @change="refresh()">
        <option v-for="s in SEVERITIES" :key="s.key" :value="s.key">{{ s.label }}</option>
      </select>
      <button type="button" class="ges__refresh" data-testid="ges-refresh" @click="refresh()">刷新</button>
    </div>
    <div v-if="error" class="ges__error" data-testid="ges-error">{{ error }}</div>
    <div class="ges__body">
      <div v-if="loading && events.length === 0" class="ges__empty">…</div>
      <div v-else-if="events.length === 0" class="ges__empty" data-testid="ges-empty">
        暂无事件——审批裁决与验证裁决（fail/pass）等真实事件会自动入流
      </div>
      <table v-else class="ges__table">
        <thead><tr><th>时间</th><th>域</th><th>级别</th><th>类型</th><th>摘要</th></tr></thead>
        <tbody>
          <tr v-for="e in events" :key="e.eventId" :data-testid="`ges-row-${e.domain}`">
            <td class="ges__ts">{{ fmtTime(e.ts) }}</td>
            <td><span class="ges__badge" :class="`is-${e.domain}`">{{ DOMAIN_LABELS[e.domain] ?? e.domain }}</span></td>
            <td><span class="ges__sev-badge" :class="`is-${e.severity}`">{{ e.severity }}</span></td>
            <td class="ges__type">{{ e.type }}</td>
            <td class="ges__summary" :title="e.summary">{{ e.summary }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ges {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  display: flex; flex-direction: column; gap: 8px;
}
.ges__bar { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.ges__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted, #878c99); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 4px; }
.ges__chip {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px;
  background: var(--bg-primary, #fff); padding: 1px 9px; font-size: 10.5px; cursor: pointer;
  &.is-on { color: #1d4ed8; border-color: #1d4ed855; background: #dbeafe; }
  &.is-off { color: var(--text-muted, #878c99); opacity: 0.7; }
}
.ges__sev { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 2px 6px; font-size: 10.5px; background: var(--bg-primary, #fff); color: var(--text-primary, inherit); margin-left: auto; }
.ges__refresh { border: none; background: transparent; cursor: pointer; font-size: 12px; color: var(--accent-primary, #3b82f6); }
.ges__error { font-size: 11px; color: #b91c1c; }
.ges__body { max-height: 300px; overflow: auto; }
.ges__empty { border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 14px; text-align: center; font-size: 11px; color: var(--text-muted, #878c99); }
.ges__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted, #878c99); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); position: sticky; top: 0; background: var(--bg-primary, #fff); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color, #e5e7eb); vertical-align: top; } }
.ges__ts { font-family: ui-monospace, monospace; font-size: 9.5px; white-space: nowrap; }
.ges__type { font-family: ui-monospace, monospace; font-size: 9.5px; white-space: nowrap; }
.ges__summary { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ges__badge { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-quality { color: #15803d; background: #dcfce7; }
  &.is-security { color: #b91c1c; background: #fee2e2; }
  &.is-cost { color: #b45309; background: #fef3c7; }
  &.is-approval { color: #7c3aed; background: #ede9fe; }
  &.is-autonomy { color: #0e7490; background: #cffafe; }
  &.is-system { color: var(--text-muted, #878c99); background: var(--bg-secondary, #f1f2f4); } }
.ges__sev-badge { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-high { color: #b91c1c; background: #fee2e2; }
  &.is-warn { color: #b45309; background: #fef3c7; }
  &.is-info { color: var(--text-muted, #878c99); background: var(--bg-secondary, #f1f2f4); } }
</style>
