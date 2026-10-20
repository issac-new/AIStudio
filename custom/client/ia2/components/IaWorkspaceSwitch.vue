<!-- overlay/custom/client/ia2/components/IaWorkspaceSwitch.vue
     工作视图切换（2026-10-20 日常/推演拆分）：
     日常工作台 | IDE 工作区 | 全流程推演。推演是独立模式，不再作为日常
     侧栏的「整轮」分组；切换只改路由，不改组件树。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'

const route = useRoute()
const router = useRouter()
const { locale } = useI18n()
const chatStore = useChatStore()

const isZh = computed(() => String(locale?.value ?? 'zh').startsWith('zh'))
const collabLabel = computed(() => isZh.value ? '日常工作台' : 'Daily')
// 词条表（patch 316/317）没有 IDE 视图名，走本地字典；EN 下不能留中文。
const ideLabel = computed(() => isZh.value ? 'IDE 工作区' : 'IDE Workspace')
const simLabel = computed(() => isZh.value ? '全流程推演' : 'Full-run Simulation')
const groupLabel = computed(() => isZh.value ? '工作视图' : 'Workspace view')

const isIde = computed(() => route.path === '/app/ide' || route.path.startsWith('/app/ide/'))
const isSim = computed(() => route.path === '/app/sim' || route.path.startsWith('/app/sim/'))
const isCollab = computed(() => !isIde.value && !isSim.value)

function goCollab(): void {
  const sid = chatStore.activeSessionId
  void router.push(sid ? { name: 'ia2.collabSession', params: { sessionId: sid } } : { name: 'ia2.collab' })
}

function goIde(): void {
  const sid = chatStore.activeSessionId
  void router.push(sid ? { name: 'ide.shell', query: { session: sid } } : { name: 'ide.shell' })
}

function goSim(): void {
  void router.push({ name: 'ia2.sim' })
}
</script>

<template>
  <div class="iws" role="group" :aria-label="groupLabel" data-testid="ia-workspace-switch">
    <button
      type="button"
      class="iws__btn"
      :class="{ 'iws__btn--on': isCollab }"
      data-testid="ia-workspace-collab"
      :aria-pressed="isCollab"
      @click="goCollab"
    >{{ collabLabel }}</button>
    <button
      type="button"
      class="iws__btn"
      :class="{ 'iws__btn--on': isIde }"
      data-testid="ia-workspace-ide"
      :aria-pressed="isIde"
      @click="goIde"
    >{{ ideLabel }}</button>
    <button
      type="button"
      class="iws__btn"
      :class="{ 'iws__btn--on': isSim }"
      data-testid="ia-workspace-sim"
      :aria-pressed="isSim"
      @click="goSim"
    >{{ simLabel }}</button>
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
