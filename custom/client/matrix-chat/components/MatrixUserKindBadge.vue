<script setup lang="ts">
// AI 员工徽标（2026-10-19 群聊身份标识轮）：自动归类模式（user-id）下人类不
// 渲染——零错标风险（spec D-1）；强制模式（kind）两态都渲染（成员详情身份行）。
// 词条走模块内建词典 + computed locale（spec D-5），不走全局 i18n 合并。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isAiUserId, userKindMessages, type UserKind } from '../identity/user-kind'

const props = defineProps<{
  /** 自动归类：命中 -agent 命名约定才显示徽标（人类不显示） */
  userId?: string
  /** 强制身份（成员详情两态都显）：提供则忽略 userId */
  kind?: UserKind
}>()

const resolved = computed<UserKind | null>(() => {
  if (props.kind) return props.kind
  if (props.userId) return isAiUserId(props.userId) ? 'ai' : null
  return null
})

const { locale } = useI18n()
const label = computed(() => {
  const tree = locale.value.toLowerCase().startsWith('zh') ? userKindMessages.zh : userKindMessages.en
  // 自动模式只有 AI 一种形态，用短词；强制模式（身份行）用全称两态
  if (props.kind) return resolved.value === 'ai' ? tree.aiMember : tree.humanMember
  return tree.aiBadge
})
</script>

<template>
  <span
    v-if="resolved"
    class="mx_user-kind-badge"
    :class="`mx_user-kind-badge--${resolved}`"
    :data-testid="`mx-user-kind-${resolved}`"
  >
    <svg v-if="resolved === 'ai'" class="mx_user-kind-badge__icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="1.2" r="1.1" fill="currentColor" />
      <rect x="7.3" y="2.2" width="1.4" height="2" fill="currentColor" />
      <rect x="4" y="4.8" width="8" height="6.6" rx="1.3" fill="currentColor" />
      <rect x="2" y="6.4" width="1.5" height="3" rx="0.6" fill="currentColor" />
      <rect x="12.5" y="6.4" width="1.5" height="3" rx="0.6" fill="currentColor" />
      <circle cx="6.3" cy="8" r="0.95" class="mx_user-kind-badge__hole" />
      <circle cx="9.7" cy="8" r="0.95" class="mx_user-kind-badge__hole" />
    </svg>
    <svg v-else class="mx_user-kind-badge__icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5" r="2.9" fill="currentColor" />
      <path d="M2.9 14a5.1 5.1 0 0 1 10.2 0z" fill="currentColor" />
    </svg>
    <span class="mx_user-kind-badge__label">{{ label }}</span>
  </span>
</template>

<style scoped lang="scss">
.mx_user-kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 5px;
  border-radius: 4px;
  // 靛紫系（与服务端 AI 头像色板同族，spec D-6）
  background: rgba(var(--accent-primary-rgb), 0.16);
  color: var(--accent-primary);
  font-size: 10px;
  line-height: 16px;
  font-weight: 600;
  vertical-align: middle;
  white-space: nowrap;
}

.mx_user-kind-badge--human {
  background: rgba(var(--text-muted-rgb), 0.16);
  color: var(--text-muted);
}

.mx_user-kind-badge__icon {
  width: 12px;
  height: 12px;
  flex: none;
}

.mx_user-kind-badge__hole {
  fill: rgba(var(--accent-primary-rgb), 0.16); // 与徽标底同色，视觉上「挖洞」
}

.mx_user-kind-badge--human .mx_user-kind-badge__hole {
  fill: rgba(var(--text-muted-rgb), 0.16);
}

.mx_user-kind-badge__label {
  transform: translateY(0.5px); // 10px 字与 16px 行高的基线微调
}
</style>
