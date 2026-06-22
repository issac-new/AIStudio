<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import CockpitAttention from '@/custom/cockpit/components/CockpitAttention.vue'
import CockpitKanban from '@/custom/cockpit/components/CockpitKanban.vue'
import CockpitColumnRail from '@/custom/cockpit/components/CockpitColumnRail.vue'
import CockpitCollabMap from '@/custom/cockpit/components/CockpitCollabMap.vue'
import CockpitTimeline from '@/custom/cockpit/components/CockpitTimeline.vue'
import CockpitWorkspace from '@/custom/cockpit/components/CockpitWorkspace.vue'
import CockpitModeBar from '@/custom/cockpit/components/CockpitModeBar.vue'
import CockpitCollabBar from '@/custom/cockpit/components/CockpitCollabBar.vue'
import CockpitChatPane from '@/custom/cockpit/components/CockpitChatPane.vue'
import CockpitTerminalPane from '@/custom/cockpit/components/CockpitTerminalPane.vue'
import CockpitHistoryModal from '@/custom/cockpit/components/CockpitHistoryModal.vue'
import CockpitTemplateManager from '@/custom/cockpit/components/CockpitTemplateManager.vue'
import CockpitTopBar from '@/custom/cockpit/components/CockpitTopBar.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

// 右上角用户/设置按钮 → 返回 overlay 项目原生 settings 页面
const goSettings = () => router.push({ name: 'hermes.settings' })
// Kanban 下方"AI协作中心"入口 → 进入原生 Kanban 管理面板
const goCenter = () => router.push({ name: 'hermes.kanban' })

// 从 kanban 真实数据引导 cockpit（替代原 loadSeed mock 装载）
onMounted(() => { store.bootstrap() })
// 离开 cockpit 时断开 group socket（matrix client 跨页保活，不在此断开）
onUnmounted(() => { store.disconnectOnUnmount() })
</script>

<template>
  <div class="cockpit">
    <CockpitTopBar
      :agent-count="3"
      :human-count="2"
      :notify-count="3"
      :schedule-count="2"
      user-name="石磊"
      @schedule="store.openHistory()"
      @notify="store.openHistory()"
      @search="() => {}"
      @settings="goSettings"
    />
    <CockpitAttention @history="store.openHistory()" />

    <div class="cockpit__body">
      <!-- 左栏 Kanban -->
      <section class="cockpit-col cockpit-col--left" :class="{ 'is-collapsed': store.collapsed.left }">
        <CockpitColumnRail label="KANBAN" @expand="store.toggleCollapsed('left')" />
        <div class="cockpit-col__inner">
          <CockpitKanban @collapse="store.toggleCollapsed('left')" @enter-center="goCenter" />
        </div>
      </section>

      <!-- 中栏 协作图 + 时序流 -->
      <section class="cockpit-col cockpit-col--mid" :class="{ 'is-collapsed': store.collapsed.mid }">
        <CockpitColumnRail label="协作 · 时序" @expand="store.toggleCollapsed('mid')" />
        <button type="button" class="cockpit-collapse-btn" @click="store.toggleCollapsed('mid')">◀</button>
        <div class="cockpit-col__inner">
          <CockpitCollabMap />
          <CockpitTimeline />
        </div>
      </section>

      <!-- 右栏 A2UI 工作区（按模式切换）-->
      <section class="cockpit-col cockpit-col--right" :class="{ 'is-collapsed': store.collapsed.right }">
        <CockpitColumnRail label="工作区" @expand="store.toggleCollapsed('right')" />
        <button type="button" class="cockpit-collapse-btn" @click="store.toggleCollapsed('right')">▶</button>
        <div class="cockpit-col__inner">
          <CockpitModeBar v-if="store.workspaceMode !== 'term'" />
          <CockpitCollabBar v-if="store.workspaceMode !== 'term'" />
          <span v-if="store.archivedMode" class="cockpit-readonly-badge">{{ t('cockpit.readOnly') }}</span>
          <CockpitWorkspace v-if="store.workspaceMode === 'work'" :class="{ 'is-readonly': store.archivedMode }" @submit="store.submitWorkItem" @later="() => {}" />
          <CockpitChatPane v-else-if="store.workspaceMode === 'chat'" />
          <CockpitTerminalPane v-else />
        </div>
      </section>
    </div>

    <div v-if="store.historyOpen" class="cockpit-overlay" @click="store.closeHistory()" />
    <CockpitHistoryModal v-if="store.historyOpen" class="cockpit-modal-anchor" />
    <div v-if="store.templateManagerOpen" class="cockpit-overlay" @click="store.closeTemplateManager()" />
    <CockpitTemplateManager v-if="store.templateManagerOpen" class="cockpit-modal-anchor" />
  </div>
</template>

<style scoped lang="scss">
.cockpit-readonly-badge { position: absolute; top: 8px; right: 14px; font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 9px; z-index: 5; }
</style>