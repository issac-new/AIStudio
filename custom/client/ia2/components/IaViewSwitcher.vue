<!-- overlay/custom/client/ia2/components/IaViewSwitcher.vue -->
<!-- v12.4 视图单按钮切换（2026-09-20 用户裁定）：「沟通协作 | IDE 工作台」
     双按钮合并为一个切换钮——显示目标视图名（collab 态显示 IDE 工作台，
     ide 态显示沟通协作），点击跳另一视图。自算当前视图（V5 补遗⑤ M2 起
     /app/ide → ide，其余 /app 家族 → collab；旧 /ide 兼容重定向已兜）；
     testid 沿用 ia-viewswitch-row / ia-scenes 保持守门兼容，按钮改 ia-view-toggle。
     2026-09-30 用户裁定：迁入页头品牌位（「驾驶舱」文案退役）并配图标——
     前导目标视图图标（IDE 工作台=code / 沟通协作=message），尾随切换图标
     （switch，替换原 ⇄ 文字字符）；自算视图与跳转逻辑不动。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const isIde = computed(() => route.path === '/app/ide' || route.path.startsWith('/app/ide/'))

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
      >
        <CockpitIcon :name="isIde ? 'message' : 'code'" :size="12" />
        {{ isIde ? t('ia2.nav.collab') : t('ia2.shell.gotoIde') }}
        <CockpitIcon name="switch" :size="12" />
      </button>
    </nav>
  </div>
</template>

<style scoped lang="scss">
/* v12.5：色彩风格对齐全局（与 IaLocaleToggle/页头按钮同款幽灵描边——
 * v12.4 首版实心主色底与页头整体风格不统一，用户裁定收敛） */
.ia-vsrow {
  display: inline-flex; align-items: center; flex-shrink: 0; margin-left: 4px;
}
/* v12.7 顶栏对齐：scoped 提高特异性压住全局 ia2.scss 的 .ia-scenes（padding 2px/
 * margin 8px 16px 0 会把容器撑到 36px、按钮下沉 4px——v12.6 首修只改按钮高度
 * 没碰容器，是「midY 仍 26」的真凶）。nav 与按钮同高 28px。 */
.ia-vsrow .ia-scenes.ia-scenes {
  display: flex; align-items: center; border: 1px solid var(--border-color);
  border-radius: var(--radius, 6px); background: transparent;
  padding: 0; margin: 0; height: 28px; box-sizing: border-box; align-self: auto;
}
.ia-vsrow .ia-scenes .ia-scenes__btn.ia-scenes__btn {
  padding: 0 10px; border: none; border-radius: 5px; cursor: pointer;
  background: transparent; color: var(--text-muted);
  font-size: 12px; font-family: inherit; white-space: nowrap; height: 100%;
  margin: 1px 0; align-self: center;
  /* 2026-09-30 图标入钮：前导目标视图图标 + 尾随切换图标同行排布 */
  display: inline-flex; align-items: center; gap: 4px;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}
</style>
