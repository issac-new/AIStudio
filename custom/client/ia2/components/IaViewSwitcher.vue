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
/* v12.4：单按钮切换（用户裁定：双视图两按钮合并为一个切换态），随页头行高走 */
.ia-vsrow {
  display: inline-flex; align-items: center; flex-shrink: 0; margin-left: 4px;
}
.ia-scenes {
  display: flex; border: 1px solid var(--border-color);
  border-radius: var(--radius, 6px); background: var(--bg-card); padding: 2px;
}
.ia-scenes__btn {
  padding: 3px 12px; border: none; border-radius: 4px; cursor: pointer;
  background: var(--primary, #3b82f6); color: #fff;
  font-size: 12px; font-family: inherit; white-space: nowrap;
  &:hover { opacity: 0.88; }
}
</style>
