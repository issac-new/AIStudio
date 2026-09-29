<script setup lang="ts">
// IdeEngineModelsDialog — IDE 引擎独立模型目录管理（A8：PUT /api/ide/engine-models
// 此前无客户端写方）。全量替换语义（服务端幂等写+校验+原子落盘+引擎写穿）：
// 载入 GET → 表单编辑 → 保存 PUT；400 校验问题逐条可见；写穿结果如实回显。
// 凭据纪律：apiKeyEnv 只填环境变量名，不存值（服务端解析注入）。
import { onMounted, ref } from 'vue'
import { authFetch } from '../utils/auth-fetch'

interface ModelRow { modelId: string; reasoningLevels: string }
interface ProviderRow { providerId: string; baseURL: string; apiKeyEnv: string; models: ModelRow[] }

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const rows = ref<ProviderRow[]>([])
const defaultProviderId = ref('')
const defaultModelId = ref('')
const loading = ref(true)
const saving = ref(false)
const problems = ref<string[]>([])
const savedNote = ref('')

onMounted(async () => {
  try {
    const res = await authFetch('/api/ide/engine-models')
    const body = (await res.json()) as {
      config?: {
        providers?: Array<{ providerId: string; baseURL?: string; apiKeyEnv?: string; models?: Array<{ modelId: string; reasoningLevels?: string[] }> }>
        defaultModel?: { providerId: string; modelId: string } | null
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
    }
    // PUT 真进程 404 历史病灶根因已修（runtime 层级）；POST 变体为实证稳定面
    const res = await authFetch('/api/ide/engine-models-put', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[]; enginePassthrough?: { wrote: boolean; providerKeys: string[]; note: string } }
    if (!res.ok) {
      problems.value = body.problems?.length ? body.problems : [`HTTP ${res.status}`]
      return
    }
    const pt = body.enginePassthrough
    savedNote.value = pt?.wrote ? `已保存并写穿引擎（${pt.providerKeys.length} 个 provider）` : '已保存'
    emit('saved')
  } catch (err) {
    problems.value = [err instanceof Error ? err.message : String(err)]
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="ide-emd__backdrop" data-testid="ide-emd" @click.self="emit('close')">
    <div class="ide-emd__dialog">
      <div class="ide-emd__head">
        <span>引擎模型目录（独立于 hermes agent）</span>
        <button type="button" data-testid="ide-emd-close" @click="emit('close')">✕</button>
      </div>
      <div v-if="loading" class="ide-emd__state">载入中…</div>
      <template v-else>
        <div v-for="(p, i) in rows" :key="i" class="ide-emd__provider" :data-testid="`ide-emd-provider-${i}`">
          <div class="ide-emd__row">
            <input v-model="p.providerId" placeholder="providerId（如 glm）" :data-testid="`ide-emd-pid-${i}`" />
            <input v-model="p.baseURL" placeholder="baseURL（https://…）" :data-testid="`ide-emd-purl-${i}`" />
            <input v-model="p.apiKeyEnv" placeholder="apiKeyEnv（环境变量名）" :data-testid="`ide-emd-pkey-${i}`" />
            <button type="button" :data-testid="`ide-emd-pdel-${i}`" @click="removeProvider(i)">删</button>
          </div>
          <div v-for="(m, j) in p.models" :key="j" class="ide-emd__row is-model">
            <input v-model="m.modelId" placeholder="modelId" :data-testid="`ide-emd-mid-${i}-${j}`" />
            <input v-model="m.reasoningLevels" placeholder="推理档（逗号分隔，可空）" :data-testid="`ide-emd-mrl-${i}-${j}`" />
            <button type="button" :data-testid="`ide-emd-mdel-${i}-${j}`" @click="removeModel(i, j)">删</button>
          </div>
          <button type="button" class="ide-emd__add" :data-testid="`ide-emd-madd-${i}`" @click="addModel(i)">＋模型</button>
        </div>
        <button type="button" class="ide-emd__add" data-testid="ide-emd-padd" @click="addProvider">＋ provider</button>
        <div class="ide-emd__row ide-emd__default">
          <span>默认模型</span>
          <select v-model="defaultProviderId" data-testid="ide-emd-defp">
            <option value="">（无）</option>
            <option v-for="(p, i) in rows" :key="i" :value="p.providerId">{{ p.providerId || `provider ${i + 1}` }}</option>
          </select>
          <select v-model="defaultModelId" data-testid="ide-emd-defm">
            <option value="">（无）</option>
            <option v-for="m in (rows.find((r) => r.providerId === defaultProviderId)?.models ?? [])" :key="m.modelId" :value="m.modelId">{{ m.modelId }}</option>
          </select>
        </div>
        <ul v-if="problems.length" class="ide-emd__problems" data-testid="ide-emd-problems">
          <li v-for="(p, i) in problems" :key="i">{{ p }}</li>
        </ul>
        <div v-if="savedNote" class="ide-emd__saved" data-testid="ide-emd-saved">{{ savedNote }}</div>
        <div class="ide-emd__foot">
          <button type="button" data-testid="ide-emd-save" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-emd__backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 500; display: flex; align-items: center; justify-content: center; }
.ide-emd__dialog { width: 560px; max-height: 70vh; overflow-y: auto; background: var(--card-color, #fff); border-radius: 10px; padding: 12px 16px; font-size: 12px; }
.ide-emd__head { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 8px; }
.ide-emd__head button { border: none; background: none; cursor: pointer; }
.ide-emd__state { padding: 16px; color: var(--text-color-3, #999); }
.ide-emd__provider { border: 1px solid var(--border-color, #e0e0e0); border-radius: 6px; padding: 6px; margin: 6px 0; }
.ide-emd__row { display: flex; gap: 6px; margin: 4px 0; }
.ide-emd__row input, .ide-emd__row select { flex: 1; border: 1px solid var(--border-color, #ddd); border-radius: 4px; padding: 2px 6px; font-size: 11px; }
.ide-emd__row.is-model { padding-left: 14px; }
.ide-emd__row button { border: 1px solid var(--border-color, #ddd); background: none; border-radius: 4px; cursor: pointer; font-size: 11px; }
.ide-emd__add { border: 1px dashed var(--border-color, #ccc); background: none; border-radius: 4px; font-size: 11px; padding: 1px 8px; cursor: pointer; margin: 2px 0; }
.ide-emd__default { align-items: center; margin-top: 8px; }
.ide-emd__default span { font-size: 11px; color: var(--text-color-3, #999); }
.ide-emd__problems { color: var(--error-color, #d03050); font-size: 11px; margin: 6px 0; padding-left: 18px; }
.ide-emd__saved { color: var(--primary-color, #18a058); font-size: 11px; margin-top: 6px; }
.ide-emd__foot { display: flex; justify-content: flex-end; margin-top: 10px; }
.ide-emd__foot button { border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: none; border-radius: 6px; padding: 3px 16px; cursor: pointer; }
</style>
