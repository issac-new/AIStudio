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
      <div v-if="loading && events.length === 0" class="ui-empty-state ui-empty-state--compact">…</div>
      <div v-else-if="events.length === 0" class="ui-empty-state ui-empty-state--compact" data-testid="ges-empty">
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
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  display: flex; flex-direction: column; gap: 8px;
}
.ges__bar { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.ges__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 4px; }
.ges__chip {
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-primary); padding: 1px 9px; font-size: 10.5px; cursor: pointer;
  &.is-on { color: var(--accent-info); border-color: rgba(var(--accent-info-rgb), 0.33); background: rgba(var(--accent-info-rgb), 0.1); }
  &.is-off { color: var(--text-muted); opacity: 0.7; }
}
.ges__sev { border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 6px; font-size: 10.5px; background: var(--bg-primary); color: var(--text-primary); margin-left: auto; }
.ges__refresh { border: none; background: transparent; cursor: pointer; font-size: 12px; color: var(--accent-primary); }
.ges__error { font-size: 11px; color: var(--error); }
.ges__body { max-height: 300px; overflow: auto; }
.ges__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; background: var(--bg-primary); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); vertical-align: top; } }
.ges__ts { font-family: ui-monospace, monospace; font-size: 9.5px; white-space: nowrap; }
.ges__type { font-family: ui-monospace, monospace; font-size: 9.5px; white-space: nowrap; }
.ges__summary { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ges__badge { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-quality { color: var(--success); background: rgba(var(--success-rgb), 0.08); }
  &.is-security { color: var(--error); background: rgba(var(--error-rgb), 0.08); }
  &.is-cost { color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.12); }
  &.is-approval { color: var(--ia-compensated); background: color-mix(in srgb, var(--ia-compensated) 12%, transparent); }
  &.is-autonomy { color: var(--accent-info); background: rgba(var(--accent-info-rgb), 0.1); }
  &.is-system { color: var(--text-muted); background: var(--bg-secondary); } }
.ges__sev-badge { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-high { color: var(--error); background: rgba(var(--error-rgb), 0.08); }
  &.is-warn { color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.12); }
  &.is-info { color: var(--text-muted); background: var(--bg-secondary); } }
</style>
