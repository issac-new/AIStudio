<!-- overlay/custom/client/ia2/components/IaViewSwitcher.vue -->
<!-- v12.1 视图切换器（2026-09-19 壳层重排）：「沟通协作 | IDE 工作台」统一
     在注意力条下方右上角（用户裁定）。自算当前视图（/ide → ide，其余 /app →
     collab）；testid 沿用 ia-scenes / ia-scene-<key> 保持守门兼容。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const activeView = computed<'collab' | 'ide'>(() =>
  route.path === '/ide' || route.path.startsWith('/ide/') ? 'ide' : 'collab')
</script>

<template>
  <div class="ia-vsrow" data-testid="ia-viewswitch-row">
    <span class="ia-vsrow__spacer" />
    <nav class="ia-scenes" data-testid="ia-scenes">
      <router-link
        :to="{ name: 'ia2.collab' }"
        class="ia-scenes__btn"
        :class="{ 'ia-scenes__btn--on': activeView === 'collab' }"
        data-testid="ia-scene-collab"
      >{{ t('ia2.nav.collab') }}</router-link>
      <router-link
        :to="{ name: 'ide.shell' }"
        class="ia-scenes__btn ia-scenes__btn--ide"
        :class="{ 'ia-scenes__btn--on': activeView === 'ide' }"
        data-testid="ia-scene-ide"
      >{{ t('ia2.shell.gotoIde') }}</router-link>
    </nav>
  </div>
</template>

<style scoped lang="scss">
/* v12.1：切换行右对齐（用户裁定：注意力条下方右上角统一切换） */
.ia-vsrow {
  display: flex; align-items: center; flex-shrink: 0;
  padding: 6px 16px 0;
}
.ia-vsrow__spacer { flex: 1; }
.ia-scenes {
  display: flex; gap: 2px; border: 1px solid var(--border-color);
  border-radius: var(--radius, 6px); background: var(--bg-card); padding: 2px;
}
.ia-scenes__btn {
  padding: 4px 14px; border-radius: 4px; background: transparent;
  color: var(--text-secondary); font-size: 12px; text-decoration: none; white-space: nowrap;
  &:hover { color: var(--primary, #3b82f6); }
}
.ia-scenes__btn--on { background: var(--primary, #3b82f6); color: #fff; }
.ia-scenes__btn--ide { margin-left: 10px; border-left: 1px solid var(--border-color); padding-left: 14px; }
</style>
