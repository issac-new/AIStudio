<!-- overlay/custom/client/governance/components/McpSecuritySection.vue -->
<!-- MCP 注册面安全扫描面板（2026-10-21 AGT 调研轮三）：形态级只读扫描的呈现面。
     高/中/低计数徽标 + 发现表（级别/问题/Server/Profile/详情）；空态如实「通过」，
     失败态自管；只报不拦（执法属工具策略引擎，漂移检测见 MCP 配置漂移面板）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchMcpSecurityScan, type McpScanKindDto, type McpScanSeverityDto, type McpSecurityScanDto } from '@/custom/governance/api/mcpSecurity'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { mcpSecurity: Record<string, string> }).mcpSecurity
})

const scan = ref<McpSecurityScanDto | null>(null)
const loading = ref(false)
const errorMsg = ref('')

const KIND_LABEL: Record<McpScanKindDto, string> = {
  'dangerous-command': 'kindDangerousCommand',
  'embedded-secret': 'kindEmbeddedSecret',
  'remote-url': 'kindRemoteUrl',
  typosquat: 'kindTyposquat',
  'suspicious-path': 'kindSuspiciousPath',
}

const SEVERITY_LABEL: Record<McpScanSeverityDto, string> = {
  high: 'severityHigh',
  medium: 'severityMedium',
  low: 'severityLow',
}

function kindLabel(kind: McpScanKindDto): string {
  return String(L.value[KIND_LABEL[kind]] ?? kind)
}

function severityLabel(sev: McpScanSeverityDto): string {
  return String(L.value[SEVERITY_LABEL[sev]] ?? sev)
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    scan.value = await fetchMcpSecurityScan()
  } catch (e) {
    errorMsg.value = `${L.value.loadFailed}：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="ms" data-testid="gov-mcp-security">
    <div class="ms__bar">
      <h3 class="ms__title">{{ L.title }}</h3>
      <span class="ms__hint">{{ L.hint }}</span>
    </div>

    <div v-if="errorMsg" class="ms__err" data-testid="mcp-sec-error">{{ errorMsg }}</div>

    <template v-else-if="scan">
      <div class="ms__meta" data-testid="mcp-sec-meta">
        <span class="ms__chip is-high" :data-testid="`mcp-sec-count-high`">{{ L.severityHigh }} {{ scan.summary.high }}</span>
        <span class="ms__chip is-medium">{{ L.severityMedium }} {{ scan.summary.medium }}</span>
        <span class="ms__chip is-low">{{ L.severityLow }} {{ scan.summary.low }}</span>
        <span class="ms__scope">{{ L.scanMeta }}：{{ scan.profilesScanned }} {{ L.profilesUnit }} · {{ scan.serversScanned }} {{ L.serversUnit }}</span>
      </div>

      <table class="ms__table" data-testid="mcp-sec-table">
        <thead>
          <tr>
            <th>{{ L.colSeverity }}</th><th>{{ L.colKind }}</th><th>{{ L.colServer }}</th>
            <th>{{ L.colProfiles }}</th><th>{{ L.colDetail }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(f, i) in scan.findings" :key="`${f.kind}-${f.server}-${i}`" :data-testid="`mcp-sec-row-${i}`">
            <td><span class="ms__sev" :class="`is-${f.severity}`">{{ severityLabel(f.severity) }}</span></td>
            <td>{{ kindLabel(f.kind) }}</td>
            <td class="ms__server">{{ f.server }}</td>
            <td class="ms__profiles">
              {{ f.profiles.slice(0, 3).join('、') }}<template v-if="f.profileCount > 3"> 等 {{ f.profileCount }}</template>
            </td>
            <td class="ms__detail">{{ f.detail }}</td>
          </tr>
          <tr v-if="scan.findings.length === 0">
            <td colspan="5" class="ui-empty-state ui-empty-state--compact">{{ L.empty }}</td>
          </tr>
        </tbody>
      </table>

      <p class="ms__boundary">{{ L.boundary }}：{{ scan.meta.boundary }}</p>
      <ul v-if="scan.problems.length" class="ms__problems" data-testid="mcp-sec-problems">
        <li v-for="p in scan.problems.slice(0, 5)" :key="p">{{ p }}</li>
      </ul>
    </template>
    <div v-else-if="loading" class="ms__loading">…</div>
  </div>
</template>

<style scoped lang="scss">
.ms {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  display: flex; flex-direction: column; gap: 8px;
}
.ms__bar { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ms__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.ms__hint { font-size: 10px; color: var(--ia-stale); }
.ms__err { font-size: 11px; color: var(--error); }
.ms__meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ms__chip { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 1px 7px;
  &.is-high { color: var(--error); background: rgba(var(--error-rgb), 0.1); }
  &.is-medium { color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.12); }
  &.is-low { color: var(--text-muted); background: rgba(var(--accent-info-rgb), 0.08); } }
.ms__scope { font-size: 10px; color: var(--text-muted); }
.ms__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); vertical-align: top; } }
.ms__sev { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6; white-space: nowrap;
  &.is-high { color: var(--error); background: rgba(var(--error-rgb), 0.1); }
  &.is-medium { color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.12); }
  &.is-low { color: var(--text-muted); background: rgba(var(--accent-info-rgb), 0.08); } }
.ms__server { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 600; }
.ms__profiles { font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.ms__detail { max-width: 380px; }
.ms__boundary { margin: 0; font-size: 9.5px; color: var(--text-muted); }
.ms__problems { margin: 0; padding-left: 16px; font-size: 10px; color: var(--ia-stale); }
.ms__loading { font-size: 11px; color: var(--text-muted); }
</style>
