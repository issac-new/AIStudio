<script setup lang="ts">
// IdeModelSwitcher — 会话内模型切换器（R4，antigravity 模型切换器语义）：
// 当前模型显示 + 下拉选择（按 provider 分组的 modelGroups 目录）→ setSessionModel 持久化。
// 落点：IdeChatPane 头部（与 antigravity 的「会话内切换+粘性」一致）。
// 目录未加载或 global codingAgent 会话（模型由 agent 底座管）时渲染诚实禁用态。
// 2026-09-26 用户指令：模型目录**独立设置**——优先读 IDE 引擎独立配置
// （/api/ide/engine-models，与 hermes agent 零共享）；未配置回落 hermes 目录（过渡兼容）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useAppStore } from '@/stores/hermes/app'
import { useIdeStore } from '../store/ide'
import { fetchEngineCatalog, type EngineCatalogGroup } from '../utils/engine-models'
import { autoRoute, type CostTier } from '../../../server/modelroute/model-routing'
import IdeEngineModelsDialog from '../components/IdeEngineModelsDialog.vue'

const { t } = useI18n()
const chatStore = useChatStore()
const appStore = useAppStore()
const ide = useIdeStore()

const open = ref(false)

// ── Auto 模型路由（吸收第一批 D3，qoder：复杂度→成本档+思考强度）──
// 判定 v1=启发式（最近 user 消息长度+任务关键词），理由透明（toast 展示，不黑箱）；
// 档位→模型映射默认=目录摊平序 [首/中位/末]，localStorage ide_auto_tier_map 可覆盖。
const AUTO_MAP_KEY = 'ide_auto_tier_map'
function tierModels(): Record<CostTier, { provider: string; model: string } | null> {
  // P3 优先级链：服务端 config.route > localStorage 覆盖 > 目录摊平序兜底
  const fromServer = (tier: CostTier): { provider: string; model: string } | null => {
    const r = serverRoute.value[tier]
    return r ? { provider: r.providerId, model: r.modelId } : null
  }
  const served: Partial<Record<CostTier, { provider: string; model: string } | null>> = {
    economy: fromServer('economy'), standard: fromServer('standard'), power: fromServer('power'),
  }
  if (served.economy && served.standard && served.power) return served as Record<CostTier, { provider: string; model: string }>
  try {
    const raw = JSON.parse(localStorage.getItem(AUTO_MAP_KEY) ?? 'null')
    if (raw?.economy?.model && raw?.standard?.model && raw?.power?.model) return raw
  } catch { /* 坏档回默认 */ }
  const flat: Array<{ provider: string; model: string }> = []
  for (const g of groups.value) for (const m of g.models) flat.push({ provider: g.provider, model: m })
  const merged: Record<CostTier, { provider: string; model: string } | null> = {
    economy: null, standard: null, power: null,
  }
  const ls = (() => { try { return JSON.parse(localStorage.getItem(AUTO_MAP_KEY) ?? 'null') } catch { return null } })()
  const pickAt = (i: number) => flat[Math.min(i, flat.length - 1)] ?? null
  const fallback = { economy: pickAt(0), standard: pickAt(Math.floor((flat.length - 1) / 2)), power: pickAt(flat.length - 1) }
  for (const tier of ['economy', 'standard', 'power'] as const) {
    merged[tier] = served[tier] ?? (ls?.[tier]?.model ? { provider: ls[tier].provider ?? '', model: ls[tier].model } : null) ?? fallback[tier]
  }
  return merged
}

function judgeComplexity(): 'simple' | 'standard' | 'complex' {
  const msgs = (chatStore.activeSession?.messages ?? []) as Array<Record<string, unknown>>
  let lastUser = ''
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { lastUser = String(msgs[i].content ?? ''); break }
  }
  if (/重构|排查|架构|设计|迁移|审计|全量|端到端/i.test(lastUser)) return 'complex'
  if (lastUser.length <= 24 && !/[？?]/.test(lastUser)) return 'simple'
  return 'standard'
}

async function pickAuto(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) return
  const route = autoRoute({ complexity: judgeComplexity() })
  const target = tierModels()[route.tier]
  open.value = false
  if (!target) return
  await chatStore.switchSessionModel(target.model, target.provider, sid)
  // 判定理由透明（不黑箱）：toast 告知档位与依据。
  window.setTimeout(() => {
    const el = document.createElement('div')
    el.textContent = `Auto：${route.detail} → ${target.model}`
    el.style.cssText = 'position:fixed;bottom:44px;right:16px;z-index:999;background:#18a058;color:#fff;padding:6px 12px;border-radius:6px;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,.2)'
    document.body.appendChild(el)
    window.setTimeout(() => el.remove(), 3200)
  }, 50)
}

const session = computed(() => chatStore.activeSession)
// switchSessionModel 对 codingAgentMode==='global' 的会话直接返回 false（模型由
// agent 底座管）；scoped 会话或已有具体 model 的会话才允许在工作台切
const switchable = computed(() => {
  const s = session.value
  if (!s) return false
  return s.codingAgentMode !== 'global' || !!s.model
})

const currentModel = computed(() => session.value?.model || '')

const engineGroups = ref<EngineCatalogGroup[]>([])
const usingIndependent = ref(false)
// P3：服务端档位映射（config.route，engine-models 对话框维护）；优先于 localStorage
const serverRoute = ref<Partial<Record<'economy' | 'standard' | 'power', { providerId: string; modelId: string }>>>({})
const manageOpen = ref(false)

// A8：抽成可重入——管理对话框保存后重拉目录（写穿结果立即可选）。
async function loadCatalog(): Promise<void> {
  try {
    const catalog = await fetchEngineCatalog()
    engineGroups.value = catalog.groups
    usingIndependent.value = catalog.independent
    serverRoute.value = catalog.route ?? {}
  } catch {
    engineGroups.value = []
    usingIndependent.value = false
  }
}
onMounted(() => { void loadCatalog() })

function onManageSaved(): void {
  void loadCatalog()
}

// 独立设置：独立目录优先；空回落 hermes 目录（appStore.modelGroups）
const groups = computed(() =>
  usingIndependent.value ? engineGroups.value : (appStore.modelGroups ?? []),
)
const catalogReady = computed(() => groups.value.length > 0)

async function pick(provider: string, model: string): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) return
  open.value = false
  await chatStore.switchSessionModel(model, provider, sid)
}
</script>

<template>
  <div v-if="switchable" class="ide-model-switcher">
    <button
      type="button"
      class="ide-model-switcher__trigger"
      data-testid="ide-model-switcher"
      :title="t('ide.modelSwitcher.title')"
      @click="open = !open"
    >
      <span class="ide-model-switcher__current">{{ currentModel || t('ide.modelSwitcher.empty') }}</span>
      <span class="ide-model-switcher__chevron">▾</span>
    </button>

    <div v-if="open" class="ide-model-switcher__panel" data-testid="ide-model-switcher-panel">
      <!-- Auto 档（D3）：复杂度路由（判定理由 toast 透明） -->
      <section class="ide-model-switcher__group">
        <div class="ide-model-switcher__provider">Auto 路由</div>
        <button
          type="button"
          class="ide-model-switcher__option is-auto"
          data-testid="ide-model-option-auto"
          title="按任务复杂度选成本档（0.5×/1×/2×）——判定理由见点击后提示"
          @click="pickAuto"
        >⚡ Auto（复杂度路由）</button>
      </section>
      <p v-if="!catalogReady" class="ide-model-switcher__state">{{ t('ide.modelSwitcher.loading') }}</p>
      <template v-else>
        <section v-for="g in groups" :key="g.provider" class="ide-model-switcher__group">
          <div class="ide-model-switcher__provider">{{ g.label || g.provider }}</div>
          <button
            v-for="m in g.models"
            :key="`${g.provider}/${m}`"
            type="button"
            class="ide-model-switcher__option"
            :class="{ 'is-active': m === currentModel && session?.provider === g.provider }"
            :data-testid="`ide-model-option-${m}`"
            @click="pick(g.provider, m)"
          >
            {{ m }}
          </button>
        </section>
      </template>
      <div class="ide-model-switcher__manage">
        <button
          type="button"
          class="ide-model-switcher__managebtn"
          data-testid="ide-model-manage"
          @click="manageOpen = true"
        >⚙ 管理引擎目录…</button>
      </div>
    </div>
    <IdeEngineModelsDialog v-if="manageOpen" @close="manageOpen = false" @saved="onManageSaved" />
  </div>
</template>

<style scoped lang="scss">
.ide-model-switcher {
  position: relative;
}

.ide-model-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  max-width: 220px;

  &:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
}

.ide-model-switcher__current {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}

.ide-model-switcher__chevron {
  font-size: 9px;
}

.ide-model-switcher__panel {
  position: absolute;
  left: 0;
  top: 24px;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  background: var(--bg-secondary, #1b1e24);
  border: 1px solid var(--border-color, #3a3f4b);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 330;
}

.ide-model-switcher__state {
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
  padding: 4px;
}

.ide-model-switcher__provider {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #9aa0aa);
  padding: 4px 6px 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ide-model-switcher__option {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 12px;
  font-family: ui-monospace, monospace;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { background: rgba(255, 255, 255, 0.06); }

  &.is-active {
    color: var(--primary-color, #18a058);
    background: rgba(97, 175, 239, 0.12);
  }
}

.ide-model-switcher__manage {
  border-top: 1px dashed var(--border-color, #3a3f4b);
  margin-top: 4px;
  padding-top: 4px;
}

.ide-model-switcher__managebtn {
  display: block;
  width: 100%;
  border: none;
  background: none;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  padding: 4px 6px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;

  &:hover { background: rgba(255, 255, 255, 0.06); color: var(--primary-color, #18a058); }
}
</style>
