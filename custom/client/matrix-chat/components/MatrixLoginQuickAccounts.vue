<script setup lang="ts">
// 登录页「本机账号一键进入」（spec 批二变更 3）：档位账号（/api/matrix/profile-accounts）
// ∪ vault 手动留底账号，点击即走批一切换编排（登录页场景等价免密登录，D10）。
// 自包含组件——vendor LoginView 只加 import+标签各一行，patch 025 增量最小。
// manual_logout 标记不拦显式点击（明确意图优先，区别于自动登录）。
// 文案中文常量：登录页 i18n key 在 vendor patch 面，本组件零新增 key 依赖。
import { computed, onMounted, ref } from 'vue'
import {
  listVaultAccounts,
} from '@/custom/matrix-chat/stores/matrix-credentials'
import {
  switchToManualAccount,
  switchToProfileAccount,
  StaleTokenError,
  PendingAccountError,
} from '@/custom/matrix-chat/stores/account-switcher'
import { deploymentUrl } from '@/utils/deployment-url'

interface ProfileAccountItem {
  profile: string
  userId: string
  homeserverUrl: string
}

interface QuickAccountItem {
  key: string
  userId: string
  label: string
  sub: string
  kind: 'profile' | 'manual'
  profile?: string
}

const profileAccounts = ref<ProfileAccountItem[]>([])
const loadError = ref<string | null>(null)
const switchingKey = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

/** 双源合并（与切换器同口径：同 userId 去重取档位项） */
const accounts = computed<QuickAccountItem[]>(() => {
  const items: QuickAccountItem[] = []
  const seen = new Set<string>()
  for (const p of profileAccounts.value) {
    if (seen.has(p.userId)) continue
    seen.add(p.userId)
    items.push({ key: `profile:${p.profile}`, userId: p.userId, label: p.userId, sub: `档位 · ${p.profile}`, kind: 'profile', profile: p.profile })
  }
  for (const v of listVaultAccounts()) {
    if (seen.has(v.userId)) continue
    seen.add(v.userId)
    items.push({ key: `manual:${v.userId}`, userId: v.userId, label: v.displayName || v.userId, sub: '本机登录', kind: 'manual' })
  }
  return items
})

onMounted(async () => {
  try {
    const res = await fetch(deploymentUrl('/api/matrix/profile-accounts'))
    if (!res.ok) {
      loadError.value = `档位账号加载失败（${res.status}）`
      return
    }
    const data = await res.json() as { accounts?: ProfileAccountItem[] }
    profileAccounts.value = Array.isArray(data.accounts) ? data.accounts : []
  } catch {
    loadError.value = '档位账号加载失败（网络不可达）'
  }
})

async function handleQuickLogin(item: QuickAccountItem): Promise<void> {
  if (switchingKey.value) return
  switchingKey.value = item.key
  errorMsg.value = null
  try {
    if (item.kind === 'profile' && item.profile) {
      await switchToProfileAccount(item.profile)
    } else {
      await switchToManualAccount(item.userId)
    }
    // 成功路径编排内部已 reload 进应用；此处兜底不可达分支
  } catch (err) {
    if (err instanceof StaleTokenError || err instanceof PendingAccountError) {
      errorMsg.value = (err as Error).message
    } else {
      errorMsg.value = (err as Error)?.message || '一键进入失败，请使用密码登录'
    }
  } finally {
    switchingKey.value = null
  }
}
</script>

<template>
  <div class="quick-accounts">
    <div class="quick-accounts-title">本机账号一键进入</div>
    <p v-if="loadError" class="quick-accounts-hint">{{ loadError }}</p>
    <div v-if="accounts.length === 0 && !loadError" class="quick-accounts-empty">
      本机暂无已登录账号（档位需配置 Matrix 凭据，或先登录一次）
    </div>
    <div v-else class="quick-accounts-list">
      <button
        v-for="item in accounts"
        :key="item.key"
        type="button"
        class="quick-accounts-item"
        :disabled="switchingKey !== null"
        @click="handleQuickLogin(item)"
      >
        <span class="quick-accounts-item-main">
          <span class="quick-accounts-item-label">{{ item.label }}</span>
          <span class="quick-accounts-item-sub">{{ item.sub }}</span>
        </span>
        <span v-if="switchingKey === item.key" class="quick-accounts-busy">进入中…</span>
      </button>
    </div>
    <div v-if="errorMsg" class="quick-accounts-error">{{ errorMsg }}</div>
  </div>
</template>

<style scoped>
.quick-accounts {
  margin-top: 20px;
  text-align: start;
}

.quick-accounts-title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.75;
  margin-bottom: 8px;
}

.quick-accounts-hint,
.quick-accounts-empty {
  font-size: 12px;
  opacity: 0.6;
  margin: 0 0 4px;
}

.quick-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.quick-accounts-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(127, 127, 127, 0.3);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: start;
}

.quick-accounts-item:hover:not(:disabled) {
  border-color: rgba(127, 127, 127, 0.6);
  background: rgba(127, 127, 127, 0.08);
}

.quick-accounts-item:disabled {
  opacity: 0.55;
  cursor: default;
}

.quick-accounts-item-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.quick-accounts-item-label {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-accounts-item-sub {
  font-size: 11px;
  opacity: 0.6;
}

.quick-accounts-busy {
  font-size: 11px;
  opacity: 0.6;
  flex-shrink: 0;
}

.quick-accounts-error {
  font-size: 12px;
  color: #d03050;
  margin-top: 6px;
}
</style>
