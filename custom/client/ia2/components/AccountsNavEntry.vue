<!-- overlay/custom/client/ia2/components/AccountsNavEntry.vue -->
<!-- 账户管理导航入口（P6 补遗④）：matrix 系统管理员页（建号/绑定/停用）。 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <button type="button" class="acct-nav" data-testid="nav-accounts" @click="router.push({ name: 'ia2.accounts' })">
    <span class="acct-nav__ico">👤</span> 账户管理
  </button>
</template>

<style scoped lang="scss">
.acct-nav {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 6px 10px; font-size: 12.5px; text-align: left;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 7px;
  background: var(--bg-primary, #fff); color: inherit; cursor: pointer;
  &:hover { background: var(--bg-secondary, #f1f2f4); }
}
.acct-nav__ico { font-size: 13px; }
</style>
