<!-- overlay/custom/client/matrix-chat/components/MatrixServerMovedBanner.vue -->
<!-- 存量 homeserver 迁移横幅：localStorage 里的旧服务器地址与 server-info 单源
     不一致时由 client store 置 serverMoved；此处人话告知 + 一键重登（重登后登录
     表单预填新地址——补丁 669）。挂在全量客户端（/matrix）与日常工作台房间列。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMatrixClientStore } from '../stores/matrix-client'

const store = useMatrixClientStore()
const router = useRouter()
const { locale } = useI18n()
const zh = computed(() => String(locale.value).startsWith('zh'))

async function relogin(): Promise<void> {
  // 重登入口=产品登录页 matrix 页签（补丁 672 后预填以 server-info 单源为准；
  // 旧 /matrix 路由未认证态只有占位文案，不可作为落点）。
  store.logout()
  await router.push('/login')
}
</script>

<template>
  <div v-if="store.serverMoved" class="msmb" data-testid="matrix-server-moved-banner" role="alert">
    <span class="msmb__text">
      {{ zh
        ? `Matrix 服务器地址已变更（${store.serverMoved.from} → ${store.serverMoved.to}），当前登录凭据已失效，请重新登录。`
        : `Matrix homeserver has moved (${store.serverMoved.from} → ${store.serverMoved.to}); please sign in again.` }}
    </span>
    <button type="button" class="msmb__btn" data-testid="matrix-server-moved-relogin" @click="relogin">
      {{ zh ? '重新登录 →' : 'Sign in again →' }}
    </button>
  </div>
</template>

<style scoped>
.msmb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 12px;
  border: 1px solid var(--warning, #f57f17);
  border-radius: 8px;
  background: var(--bg-secondary, rgba(128, 128, 128, 0.08));
  font-size: 12px;
}
.msmb__text { flex: 1; min-width: 200px; word-break: break-word; }
.msmb__btn {
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--accent-primary, inherit);
  font: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}
.msmb__btn:hover { border-color: var(--accent-primary); }
</style>
