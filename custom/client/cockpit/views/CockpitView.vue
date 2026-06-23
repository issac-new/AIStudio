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

    <div class="cockpit__body" :class="{ 'has-max': store.maximized.left || store.maximized.mid || store.maximized.right }">
      <!-- 左栏 Kanban -->
      <section class="cockpit-col cockpit-col--left"
        :class="{ 'is-collapsed': store.collapsed.left, 'is-maximized': store.maximized.left, 'is-hidden-by-max': !store.maximized.left && (store.maximized.mid || store.maximized.right) }">
        <CockpitColumnRail label="KANBAN" @expand="store.toggleCollapsed('left')" />
        <div class="cockpit-col__inner">
          <div class="cockpit-col__ctrls">
            <button type="button" class="cockpit-col__ctrl" :title="'最小化'" @click="store.toggleCollapsed('left')">◂</button>
            <button type="button" class="cockpit-col__ctrl" :title="store.maximized.left ? '还原' : '最大化'"
              :class="{ 'is-on': store.maximized.left }"
              @click="store.toggleMaximized('left')">{{ store.maximized.left ? '🗗' : '🗖' }}</button>
          </div>
          <CockpitKanban @enter-center="goCenter" />
        </div>
      </section>

      <!-- 中栏 协作图 + 时序流 -->
      <section class="cockpit-col cockpit-col--mid"
        :class="{ 'is-collapsed': store.collapsed.mid, 'is-maximized': store.maximized.mid, 'is-hidden-by-max': !store.maximized.mid && (store.maximized.left || store.maximized.right) }">
        <CockpitColumnRail label="协作 · 时序" @expand="store.toggleCollapsed('mid')" />
        <div class="cockpit-col__inner">
          <div class="cockpit-col__ctrls">
            <button type="button" class="cockpit-col__ctrl" :title="'最小化'" @click="store.toggleCollapsed('mid')">◂</button>
            <button type="button" class="cockpit-col__ctrl" :title="store.maximized.mid ? '还原' : '最大化'"
              :class="{ 'is-on': store.maximized.mid }"
              @click="store.toggleMaximized('mid')">{{ store.maximized.mid ? '🗗' : '🗖' }}</button>
          </div>
          <CockpitCollabMap />
          <CockpitTimeline />
        </div>
      </section>

      <!-- 右栏 A2UI 工作区（按模式切换）-->
      <section class="cockpit-col cockpit-col--right"
        :class="{ 'is-collapsed': store.collapsed.right, 'is-maximized': store.maximized.right, 'is-hidden-by-max': !store.maximized.right && (store.maximized.left || store.maximized.mid) }">
        <CockpitColumnRail label="工作区" @expand="store.toggleCollapsed('right')" />
        <div class="cockpit-col__inner">
          <div class="cockpit-col__ctrls">
            <button type="button" class="cockpit-col__ctrl" :title="'最小化'" @click="store.toggleCollapsed('right')">▸</button>
            <button type="button" class="cockpit-col__ctrl" :title="store.maximized.right ? '还原' : '最大化'"
              :class="{ 'is-on': store.maximized.right }"
              @click="store.toggleMaximized('right')">{{ store.maximized.right ? '🗗' : '🗖' }}</button>
          </div>
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
.cockpit-col__ctrls {
  position: absolute; top: 6px; right: 8px; z-index: 30;
  display: flex; gap: 3px;
}
.cockpit-col__ctrl {
  width: 20px; height: 18px; padding: 0;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-card); color: var(--text-muted);
  cursor: pointer; font-size: 11px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
</style>