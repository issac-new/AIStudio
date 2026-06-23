<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore, type ColumnKey } from '@/custom/cockpit/store/cockpit'
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

const goSettings = () => router.push({ name: 'hermes.settings' })
const goCenter = () => router.push({ name: 'hermes.kanban' })

onMounted(() => { store.bootstrap() })
onUnmounted(() => { store.disconnectOnUnmount() })

// 单按钮三态循环：正常 → 最大化 → 折叠 → 正常（需求 #3）
// 返回该栏当前图标 + 点击行为
function colState(col: ColumnKey): 'normal' | 'max' | 'collapsed' {
  if (store.collapsed[col]) return 'collapsed'
  if (store.maximized[col]) return 'max'
  return 'normal'
}
function colCtrlIcon(col: ColumnKey): string {
  const s = colState(col)
  if (s === 'collapsed') return '◌'  // 折叠态：展开
  if (s === 'max') return '🗗'       // 最大化态：还原
  return '⛶'                         // 正常态：最大化
}
function colCtrlTitle(col: ColumnKey): string {
  const s = colState(col)
  if (s === 'collapsed') return '展开'
  if (s === 'max') return '还原'
  return '最大化'
}
function onColCtrl(col: ColumnKey) {
  const s = colState(col)
  if (s === 'normal') {
    // 正常 → 最大化
    store.toggleMaximized(col)
  } else if (s === 'max') {
    // 最大化 → 折叠
    store.toggleMaximized(col) // 先还原（取消 maximized）
    store.toggleCollapsed(col)  // 再折叠
  } else {
    // 折叠 → 正常
    store.toggleCollapsed(col)
  }
}
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
            <button type="button" class="cockpit-col__ctrl" :class="{ 'is-on': colState('left') !== 'normal' }"
              :title="colCtrlTitle('left')" @click="onColCtrl('left')">{{ colCtrlIcon('left') }}</button>
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
            <button type="button" class="cockpit-col__ctrl" :class="{ 'is-on': colState('mid') !== 'normal' }"
              :title="colCtrlTitle('mid')" @click="onColCtrl('mid')">{{ colCtrlIcon('mid') }}</button>
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
            <button type="button" class="cockpit-col__ctrl" :class="{ 'is-on': colState('right') !== 'normal' }"
              :title="colCtrlTitle('right')" @click="onColCtrl('right')">{{ colCtrlIcon('right') }}</button>
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

    <!-- task title 详情弹窗（双击查看完整 title） -->
    <div v-if="store.titleDetailOpen" class="cockpit-overlay" @click="store.closeTitleDetail()" />
    <div v-if="store.titleDetailOpen" class="cockpit-title-detail cockpit-modal-anchor">
      <div class="cockpit-title-detail__head">
        <span>{{ store.titleDetailTitle }}</span>
        <button type="button" class="cockpit-title-detail__close" @click="store.closeTitleDetail()">×</button>
      </div>
      <div class="cockpit-title-detail__body">{{ store.titleDetailText }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-readonly-badge { position: absolute; top: 8px; right: 14px; font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 9px; z-index: 5; }
.cockpit-col__ctrls {
  position: absolute; top: 6px; right: 8px; z-index: 100;
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
.cockpit-title-detail {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 1000; width: min(560px, calc(100vw - 48px));
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.cockpit-title-detail__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--border-color);
  font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;
}
.cockpit-title-detail__close {
  width: 20px; height: 20px; padding: 0; border: none; background: none;
  color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.cockpit-title-detail__body {
  padding: 16px; font-size: 14px; line-height: 1.6; color: var(--text-primary);
  word-break: break-word; white-space: pre-wrap; max-height: 60vh; overflow-y: auto;
}
</style>