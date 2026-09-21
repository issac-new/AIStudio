<!-- overlay/custom/client/ia2/components/IaViewSwitcher.vue -->
<!-- v12.4 视图单按钮切换（2026-09-20 用户裁定）：「沟通协作 | IDE 工作台」
     双按钮合并为一个切换钮——显示目标视图名（collab 态显示 IDE 工作台，
     ide 态显示沟通协作），点击跳另一视图。自算当前视图（/ide → ide，
     其余 /app 家族 → collab）；testid 沿用 ia-viewswitch-row / ia-scenes
     保持守门兼容，按钮改 ia-view-toggle。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const isIde = computed(() => route.path === '/ide' || route.path.startsWith('/ide/'))

function toggleView(): void {
  void router.push({ name: isIde.value ? 'ia2.collab' : 'ide.shell' })
}
</script>

<template>
  <div class="ia-vsrow" data-testid="ia-viewswitch-row">
    <nav class="ia-scenes" data-testid="ia-scenes">
      <button
        type="button" class="ia-scenes__btn ia-scenes__btn--on" data-testid="ia-view-toggle"
        :title="isIde ? t('ia2.nav.collab') : t('ia2.shell.gotoIde')" @click="toggleView"
      >{{ isIde ? t('ia2.nav.collab') : t('ia2.shell.gotoIde') }} ⇄</button>
    </nav>
  </div>
</template>

<style scoped lang="scss">
/* v12.5：色彩风格对齐全局（与 IaLocaleToggle/页头按钮同款幽灵描边——
 * v12.4 首版实心主色底与页头整体风格不统一，用户裁定收敛） */
.ia-vsrow {
  display: inline-flex; align-items: center; flex-shrink: 0; margin-left: 4px;
}
.ia-scenes {
  display: flex; border: 1px solid var(--border-color);
  border-radius: var(--radius, 6px); background: transparent; padding: 0;
}
.ia-scenes__btn {
  padding: 2px 10px; border: none; border-radius: 5px; cursor: pointer;
  background: transparent; color: var(--text-muted);
  font-size: 12px; font-family: inherit; white-space: nowrap; height: 20px;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}
</style>
