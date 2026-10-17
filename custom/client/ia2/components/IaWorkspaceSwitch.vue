<!-- overlay/custom/client/ia2/components/IaWorkspaceSwitch.vue
     沟通协作 / IDE 工作区 切换（2026-10-18 用户裁定：切换按钮保持不动）。
     D18 把两者塞进六阶段④开发的分段控件里，导致「阶段」与「视图」两种语义
     挤在同一排；本组件把切换拆成独立分段，六阶段全部移到左侧栏，顶栏只留
     视图切换。切换保留当前会话（与退役的 IaViewSwitcher 同语义）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const chatStore = useChatStore()

const isIde = computed(() => route.path === '/app/ide' || route.path.startsWith('/app/ide/'))

function goCollab(): void {
  const sid = chatStore.activeSessionId
  void router.push(sid ? { name: 'ia2.collabSession', params: { sessionId: sid } } : { name: 'ia2.collab' })
}

function goIde(): void {
  const sid = chatStore.activeSessionId
  void router.push(sid ? { name: 'ide.shell', query: { session: sid } } : { name: 'ide.shell' })
}
</script>

<template>
  <div class="iws" role="group" aria-label="工作视图" data-testid="ia-workspace-switch">
    <button
      type="button"
      class="iws__btn"
      :class="{ 'iws__btn--on': !isIde }"
      data-testid="ia-workspace-collab"
      :aria-pressed="!isIde"
      @click="goCollab"
    >{{ t('ia2.nav.collab') }}</button>
    <button
      type="button"
      class="iws__btn"
      :class="{ 'iws__btn--on': isIde }"
      data-testid="ia-workspace-ide"
      :aria-pressed="isIde"
      @click="goIde"
    >IDE 工作区</button>
  </div>
</template>

<style scoped>
.iws {
  display: inline-flex;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}
.iws__btn {
  border: 0;
  background: transparent;
  padding: 0 10px;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.iws__btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
.iws__btn:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.iws__btn--on {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  font-weight: 600;
}
.iws__btn + .iws__btn { border-left: 1px solid var(--border-color); }
</style>
