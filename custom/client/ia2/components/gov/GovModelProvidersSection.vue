<!-- overlay/custom/client/ia2/components/gov/GovModelProvidersSection.vue -->
<!-- D20 模型服务商统一入口（挂账清偿 §一.6）：IdeEngineModelsDialog 表单平铺化
     （去弹窗壳，逻辑与端点同源——GET /api/ide/engine-models + POST
     /api/ide/engine-models-put），挂治理·系统设置 资产域路由页。
     凭据纪律：apiKeyEnv 只填环境变量名，不存值。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authFetch } from '../../../ide/utils/auth-fetch'

interface ModelRow { modelId: string; reasoningLevels: string }
interface ProviderRow { providerId: string; baseURL: string; apiKeyEnv: string; models: ModelRow[] }

const rows = ref<ProviderRow[]>([])
const defaultProviderId = ref('')
const defaultModelId = ref('')
const routeEconomy = ref('')
const routeStandard = ref('')
const routePower = ref('')
const loading = ref(true)
const saving = ref(false)
const problems = ref<string[]>([])
const savedNote = ref('')

const routeOptions = computed(() => {
  const out: Array<{ value: string; label: string }> = []
  for (const p of rows.value) {
    for (const m of p.models) {
      if (p.providerId && m.modelId) out.push({ value: `${p.providerId}/${m.modelId}`, label: `${p.providerId} · ${m.modelId}` })
    }
  }
  return out
})

onMounted(async () => {
  try {
    const res = await authFetch('/api/ide/engine-models')
    const body = (await res.json()) as {
      config?: {
        providers?: Array<{ providerId: string; baseURL?: string; apiKeyEnv?: string; models?: Array<{ modelId: string; reasoningLevels?: string[] }> }>
        defaultModel?: { providerId: string; modelId: string } | null
        route?: Record<string, { providerId: string; modelId: string }>
      }
    }
    rows.value = (body.config?.providers ?? []).map((p) => ({
      providerId: p.providerId,
      baseURL: p.baseURL ?? '',
      apiKeyEnv: p.apiKeyEnv ?? '',
      models: (p.models ?? []).map((m) => ({ modelId: m.modelId, reasoningLevels: (m.reasoningLevels ?? []).join(',') })),
    }))
    defaultProviderId.value = body.config?.defaultModel?.providerId ?? ''
    defaultModelId.value = body.config?.defaultModel?.modelId ?? ''
    const refOf = (r?: { providerId: string; modelId: string }) => (r ? `${r.providerId}/${r.modelId}` : '')
    routeEconomy.value = refOf(body.config?.route?.economy)
    routeStandard.value = refOf(body.config?.route?.standard)
    routePower.value = refOf(body.config?.route?.power)
  } finally {
    loading.value = false
  }
})

function addProvider(): void {
  rows.value.push({ providerId: '', baseURL: '', apiKeyEnv: '', models: [{ modelId: '', reasoningLevels: '' }] })
}
function removeProvider(i: number): void { rows.value.splice(i, 1) }
function addModel(i: number): void { rows.value[i]?.models.push({ modelId: '', reasoningLevels: '' }) }
function removeModel(i: number, j: number): void { rows.value[i]?.models.splice(j, 1) }

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  problems.value = []
  savedNote.value = ''
  try {
    const payload = {
      providers: rows.value.map((p) => ({
        providerId: p.providerId.trim(),
        baseURL: p.baseURL.trim(),
        ...(p.apiKeyEnv.trim() ? { apiKeyEnv: p.apiKeyEnv.trim() } : {}),
        models: p.models
          .map((m) => ({ modelId: m.modelId.trim(), ...(m.reasoningLevels.trim() ? { reasoningLevels: m.reasoningLevels.split(',').map((s) => s.trim()).filter(Boolean) } : {}) }))
          .filter((m) => m.modelId),
      })).filter((p) => p.providerId),
      defaultModel: defaultProviderId.value && defaultModelId.value
        ? { providerId: defaultProviderId.value, modelId: defaultModelId.value }
        : null,
      route: (() => {
        const parse = (v: string) => {
          const i = v.indexOf('/')
          return i > 0 && i < v.length - 1 ? { providerId: v.slice(0, i), modelId: v.slice(i + 1) } : undefined
        }
        const route = { economy: parse(routeEconomy.value), standard: parse(routeStandard.value), power: parse(routePower.value) }
        return Object.values(route).some(Boolean) ? route : undefined
      })(),
    }
    const res = await authFetch('/api/ide/engine-models-put', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[]; enginePassthrough?: { wrote: boolean; providerKeys: string[] } }
    if (!res.ok) {
      problems.value = body.problems?.length ? body.problems : [`HTTP ${res.status}`]
      return
    }
    const pt = body.enginePassthrough
    savedNote.value = pt?.wrote ? `已保存并写穿引擎（${pt.providerKeys.length} 个 provider）` : '已保存'
  } catch (err) {
    problems.value = [err instanceof Error ? err.message : String(err)]
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="gmp" data-testid="gmp-section">
    <h3 class="gmp__title">模型服务商目录（组织级）</h3>
    <p class="gmp__sub">IDE 引擎模型目录的统一入口——provider、baseURL、密钥环境变量名与模型清单；apiKeyEnv 只填环境变量名，不存值。</p>
    <div v-if="loading" class="gmp__state">载入中…</div>
    <template v-else>
      <div v-for="(p, i) in rows" :key="i" class="gmp__provider" :data-testid="`gmp-provider-${i}`">
        <div class="gmp__row">
          <input v-model="p.providerId" placeholder="providerId（如 glm）" :data-testid="`gmp-pid-${i}`" />
          <input v-model="p.baseURL" placeholder="baseURL（https://…）" />
          <input v-model="p.apiKeyEnv" placeholder="apiKeyEnv（环境变量名）" />
          <button type="button" @click="removeProvider(i)">删</button>
        </div>
        <div v-for="(m, j) in p.models" :key="j" class="gmp__row is-model">
          <input v-model="m.modelId" placeholder="modelId" />
          <input v-model="m.reasoningLevels" placeholder="推理档（逗号分隔，可空）" />
          <button type="button" @click="removeModel(i, j)">删</button>
        </div>
        <button type="button" class="gmp__add" @click="addModel(i)">＋模型</button>
      </div>
      <button type="button" class="gmp__add" data-testid="gmp-padd" @click="addProvider">＋ provider</button>
      <div class="gmp__row gmp__default">
        <span>默认模型</span>
        <select v-model="defaultProviderId" data-testid="gmp-defp">
          <option value="">（无）</option>
          <option v-for="(p, i) in rows" :key="i" :value="p.providerId">{{ p.providerId || `provider ${i + 1}` }}</option>
        </select>
        <select v-model="defaultModelId" data-testid="gmp-defm">
          <option value="">（无）</option>
          <option v-for="m in (rows.find((r) => r.providerId === defaultProviderId)?.models ?? [])" :key="m.modelId" :value="m.modelId">{{ m.modelId }}</option>
        </select>
      </div>
      <div class="gmp__row gmp__route">
        <span>Auto 路由档</span>
        <select v-model="routeEconomy">
          <option value="">economy（自动兜底）</option>
          <option v-for="opt in routeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <select v-model="routeStandard">
          <option value="">standard（自动兜底）</option>
          <option v-for="opt in routeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <select v-model="routePower">
          <option value="">power（自动兜底）</option>
          <option v-for="opt in routeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <p class="gmp__routehint">复杂度→档位（0.5×/1×/2×）；未映射档按目录顺序自动兜底。</p>
      <ul v-if="problems.length" class="gmp__problems" data-testid="gmp-problems">
        <li v-for="(p, i) in problems" :key="i">{{ p }}</li>
      </ul>
      <div v-if="savedNote" class="gmp__saved" data-testid="gmp-saved">{{ savedNote }}</div>
      <div class="gmp__foot">
        <button type="button" data-testid="gmp-save" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.gmp { display: flex; flex-direction: column; gap: 6px; }
.gmp__title { margin: 0; font-size: 13px; }
.gmp__sub { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.gmp__state { padding: 12px 0; color: var(--text-muted); font-size: 12px; }
.gmp__provider { border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; margin: 4px 0; }
.gmp__row { display: flex; gap: 6px; margin: 4px 0; align-items: center; }
.gmp__row input, .gmp__row select { flex: 1; border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 6px; font-size: 11.5px; background: transparent; color: inherit; }
.gmp__row.is-model { padding-left: 14px; }
.gmp__row button { border: 1px solid var(--border-color); background: none; border-radius: 4px; cursor: pointer; font-size: 11px; }
.gmp__add { border: 1px dashed var(--border-color); background: none; border-radius: 4px; font-size: 11px; padding: 1px 8px; cursor: pointer; margin: 2px 0; align-self: flex-start; }
.gmp__default span, .gmp__route span { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.gmp__route { flex-wrap: wrap; }
.gmp__routehint { margin: 2px 0 0; font-size: 10.5px; color: var(--text-muted); }
.gmp__problems { color: var(--error); font-size: 11px; margin: 6px 0; padding-left: 18px; }
.gmp__saved { color: var(--ia-fresh, var(--ia-fresh)); font-size: 11px; }
.gmp__foot { display: flex; justify-content: flex-end; }
.gmp__foot button { border: 1px solid var(--accent-primary, var(--color-primary)); color: var(--accent-primary, var(--color-primary)); background: none; border-radius: 6px; padding: 3px 16px; cursor: pointer; }
</style>
