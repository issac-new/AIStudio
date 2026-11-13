<script setup lang="ts">
// 账号切换器（spec 2026-11-13 matrix-account-switch）：本机已登录账号一键切换。
// 列表两源合一：multiplex 档位账号（/api/matrix/profile-accounts，点击联动切档位）+
// vault 手动登录账号（不动档位）；同 userId 去重取档位项（有联动语义）。
// 文案用中文常量而非 i18n key——matrixChat 段在 vendor patch 面，本组件零 patch 依赖。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { listVaultAccounts, removeVaultAccount } from '@/custom/matrix-chat/stores/matrix-credentials'
import {
  switchToManualAccount,
  switchToProfileAccount,
  StaleTokenError,
  PendingAccountError,
} from '@/custom/matrix-chat/stores/account-switcher'
import { deploymentUrl } from '@/utils/deployment-url'
import { showToast } from '@/custom/ide/utils/toast'

/** 档位账号（服务端 profile-accounts 载荷项） */
interface ProfileAccountItem {
  profile: string
  userId: string
  homeserverUrl: string
}

/** 列表统一项：两源归一后的展示模型 */
interface AccountItem {
  key: string
  userId: string
  label: string
  sub: string
  kind: 'profile' | 'manual'
  profile?: string
}

const clientStore = useMatrixClientStore()
const open = ref(false)
const loading = ref(false)
const switchingKey = ref<string | null>(null)
const profileAccounts = ref<ProfileAccountItem[]>([])
const profileLoadError = ref<string | null>(null)
// vault 读自 localStorage（非响应式源）——版本号在移除/刷新时自增，驱动 computed 重算
const vaultVersion = ref(0)

const currentUserId = computed(() => clientStore.userId)

/** 合并列表：档位项 + vault manual 项（同 userId 去重取档位项）；当前活跃项打标。 */
const accounts = computed<AccountItem[]>(() => {
  // 依赖收集锚点：vaultVersion 变化即重读 vault
  void vaultVersion.value
  const items: AccountItem[] = []
  const seen = new Set<string>()
  for (const p of profileAccounts.value) {
    if (seen.has(p.userId)) continue
    seen.add(p.userId)
    items.push({
      key: `profile:${p.profile}`,
      userId: p.userId,
      label: p.userId,
      sub: `档位 · ${p.profile}`,
      kind: 'profile',
      profile: p.profile,
    })
  }
  for (const v of listVaultAccounts()) {
    if (seen.has(v.userId)) continue
    seen.add(v.userId)
    items.push({
      key: `manual:${v.userId}`,
      userId: v.userId,
      label: v.displayName || v.userId,
      sub: '本机登录',
      kind: 'manual',
    })
  }
  return items
})

const vaultCount = computed(() => {
  void vaultVersion.value
  return listVaultAccounts().length
})

async function loadProfileAccounts(): Promise<void> {
  profileLoadError.value = null
  try {
    const res = await fetch(deploymentUrl('/api/matrix/profile-accounts'))
    if (!res.ok) {
      // 403=非回环被闸（正常桌面部署不该出现）；404/5xx 统一降级为仅 vault 列表
      profileLoadError.value = `档位账号加载失败（${res.status}）`
      profileAccounts.value = []
      return
    }
    const data = await res.json() as { accounts?: ProfileAccountItem[] }
    profileAccounts.value = Array.isArray(data.accounts) ? data.accounts : []
  } catch {
    profileLoadError.value = '档位账号加载失败（网络不可达）'
    profileAccounts.value = []
  }
}

function toggle(): void {
  open.value = !open.value
  if (open.value) void loadProfileAccounts()
}

function outsideClick(e: MouseEvent): void {
  const root = (e.target as HTMLElement | null)?.closest?.('.account-switcher')
  if (!root) open.value = false
}

onMounted(() => {
  document.addEventListener('click', outsideClick, true)
  // 打开即拉取一次——切完档位 reload 后重新挂载，列表不陈旧
  void loadProfileAccounts()
})
onUnmounted(() => document.removeEventListener('click', outsideClick, true))

/** vault manual 项移除（不触碰当前活跃账号；活跃项不显示移除钮）。 */
function handleRemoveVault(entryUserId: string): void {
  removeVaultAccount(entryUserId)
  vaultVersion.value++
  showToast('已从本机账号列表移除')
}

async function handleSwitch(item: AccountItem): Promise<void> {
  if (item.userId === currentUserId.value) {
    open.value = false
    return
  }
  switchingKey.value = item.key
  loading.value = true
  try {
    const result = item.kind === 'profile' && item.profile
      ? await switchToProfileAccount(item.profile)
      : await switchToManualAccount(item.userId)
    // 成功路径 switchTo* 内部已 reload；此处只为不可达兜底（reload 被测试桩截断时）
    if (result.profileSwitch === 'skipped_forbidden') {
      showToast('身份已切换；档位未切（需要超级管理员权限）')
    }
    open.value = false
  } catch (err) {
    if (err instanceof StaleTokenError) {
      showToast(err.message)
      // manual 项已被编排从仓删除——bump 版本号驱动列表重算
      vaultVersion.value++
      await loadProfileAccounts()
    } else if (err instanceof PendingAccountError) {
      showToast(err.message)
    } else {
      showToast((err as Error)?.message || '切换失败，请重试')
    }
  } finally {
    loading.value = false
    switchingKey.value = null
  }
}
</script>

<template>
  <div class="account-switcher">
    <button class="page-sidebar-menu-btn" type="button" @click="toggle">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span>切换账号</span>
      <span v-if="vaultCount > 0" class="account-switcher-count">{{ vaultCount }}</span>
    </button>

    <div v-if="open" class="account-switcher-panel">
      <div class="account-switcher-title">本机账号（{{ accounts.length }}）</div>
      <p v-if="profileLoadError" class="account-switcher-hint">{{ profileLoadError }}——仅显示本机登录账号</p>
      <div v-if="accounts.length === 0" class="account-switcher-empty">
        本机还没有可切换账号：档位需配置 Matrix 凭据，或先手动登录一次。
      </div>
      <button
        v-for="item in accounts"
        :key="item.key"
        type="button"
        class="account-switcher-item"
        :class="{ active: item.userId === currentUserId }"
        :disabled="loading || item.userId === currentUserId"
        @click="handleSwitch(item)"
      >
        <span class="account-switcher-item-main">
          <span class="account-switcher-item-label">{{ item.label }}</span>
          <span class="account-switcher-item-sub">{{ item.sub }}</span>
        </span>
        <span v-if="item.userId === currentUserId" class="account-switcher-current">当前</span>
        <span
          v-else-if="item.kind === 'manual'"
          class="account-switcher-remove"
          role="button"
          :title="'从列表移除（不登出）'"
          @click.stop="handleRemoveVault(item.userId)"
        >×</span>
        <span v-else-if="switchingKey === item.key" class="account-switcher-current">切换中…</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.account-switcher {
  position: relative;
  width: 100%;
}

.account-switcher-count {
  margin-left: auto;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(127, 127, 127, 0.25);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.account-switcher-panel {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 60;
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-color, #fff);
  border: 1px solid rgba(127, 127, 127, 0.3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.account-switcher-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
  padding: 2px 6px 6px;
}

.account-switcher-hint {
  font-size: 11px;
  opacity: 0.6;
  margin: 0 6px 6px;
}

.account-switcher-empty {
  font-size: 12px;
  opacity: 0.65;
  padding: 6px;
}

.account-switcher-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.account-switcher-item:hover:not(:disabled) {
  background: rgba(127, 127, 127, 0.14);
}

.account-switcher-item.active {
  cursor: default;
  background: rgba(127, 127, 127, 0.1);
}

.account-switcher-item-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.account-switcher-item-label {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-switcher-item-sub {
  font-size: 11px;
  opacity: 0.6;
}

.account-switcher-current {
  font-size: 11px;
  opacity: 0.6;
  flex-shrink: 0;
}

.account-switcher-remove {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  border-radius: 10px;
  font-size: 14px;
  opacity: 0.5;
}

.account-switcher-remove:hover {
  opacity: 1;
  background: rgba(127, 127, 127, 0.2);
}
</style>
