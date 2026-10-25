<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NModal } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { getApiKey, request } from '@/api/client'
import { fetchAvailableModelsForProfile } from '@/api/hermes/system'
import { useModelsStore } from '@/stores/hermes/models'
import { useProfilesStore } from '@/stores/hermes/profiles'

const PROMPT_Z_INDEX = 4000

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const modelsStore = useModelsStore()
const profilesStore = useProfilesStore()

const show = ref(false)
const loading = ref(false)
/** 实际被检测的 profile（网关实际使用者优先；文案与 dismiss key 都锚它）。 */
const checkedProfile = ref('')
const dismissedProfiles = new Set<string>()
let checkSequence = 0

async function checkCurrentProfile() {
  const sequence = ++checkSequence

  if (!getApiKey() || route.name === 'login' || route.name === 'hermes.models') {
    show.value = false
    // Cold-start race: the auth token may be restored from localStorage right
    // after this early return (fetchProviders no-ops without it, leaving
    // providers empty). Without a re-check the stale-empty result keeps the
    // "profile has no model" prompt shown forever on this route. Retry until
    // the token appears, then re-run the check once.
    if (!getApiKey() && route.name !== 'login' && route.name !== 'hermes.models') {
      setTimeout(() => { if (getApiKey()) void checkCurrentProfile() }, 500)
      setTimeout(() => { if (getApiKey()) void checkCurrentProfile() }, 2000)
    }
    return
  }

  if (!profilesStore.activeProfileName) {
    await profilesStore.fetchProfiles()
  }

  const profile = await gatewayProfile()
  if (sequence !== checkSequence || !profile) return
  checkedProfile.value = profile

  if (dismissedProfiles.has(profile)) {
    show.value = false
    return
  }

  loading.value = true
  try {
    // 全局 providers 照旧预取（模型页数据源，原行为）；弹窗判定改看网关实际
    // profile 的独立查询——两者可能不同（UI 活跃 profile ≠ 网关使用 profile）。
    void modelsStore.fetchProviders().catch(() => {})
    const res = await fetchAvailableModelsForProfile(profile)
    if (sequence !== checkSequence || checkedProfile.value !== profile) return
    show.value = res.groups.filter(g => g.provider !== 'moa').length === 0
  } catch {
    if (sequence === checkSequence) show.value = false
  } finally {
    if (sequence === checkSequence) loading.value = false
  }
}

/**
 * 检测对象 profile（2026-10-23 修复误报）：网关实际使用 kanban.orchestrator_profile
 * 解析链（显式配置 > profile.default > 'default'）——网关派发/聊天不走 UI 活跃
 * profile。原实现按 UI 活跃 profile（常为闲置的 default）判空，对着不用的 profile
 * 弹「未配置任何大模型 Provider」误导用户。端点不可用时 fail-soft 回落原行为。
 */
async function gatewayProfile(): Promise<string> {
  try {
    const orch = await request<{ orchestrator_profile?: string; resolved_orchestrator_profile?: string }>(
      '/api/hermes/kanban/orchestration',
    )
    if (orch.resolved_orchestrator_profile) return orch.resolved_orchestrator_profile
    if (orch.orchestrator_profile) return orch.orchestrator_profile
  } catch {
    // fail-soft：orchestration 端点不可用（老后端/网络故障）回落 UI 活跃 profile
  }
  return profilesStore.activeProfileName || 'default'
}

function remindLater() {
  if (checkedProfile.value) dismissedProfiles.add(checkedProfile.value)
  show.value = false
}

function goToProviderSettings() {
  show.value = false
  void router.push({ name: 'hermes.models', query: { addProvider: '1' } })
}

watch(
  [() => route.fullPath, () => profilesStore.activeProfileName],
  () => { void checkCurrentProfile() },
  { immediate: true },
)
</script>

<template>
  <NModal
    v-model:show="show"
    preset="dialog"
    :title="t('models.noProviderPromptTitle')"
    :mask-closable="false"
    :closable="false"
    :z-index="PROMPT_Z_INDEX"
  >
    <p class="provider-warning-text">
      {{ t('models.noProviderPromptMessage', { profile: checkedProfile }) }}
    </p>
    <template #action>
      <NButton :disabled="loading" @click="remindLater">
        {{ t('models.noProviderPromptLater') }}
      </NButton>
      <NButton type="primary" :loading="loading" @click="goToProviderSettings">
        {{ t('models.noProviderPromptAction') }}
      </NButton>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.provider-warning-text {
  margin: 0;
  line-height: var(--line-height, 1.6);
}
</style>
