<script setup lang="ts">
import { onMounted } from 'vue'
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
import { loadSeed } from '@/custom/cockpit/fixtures/seed'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

// 右上角用户/设置按钮 → 返回 overlay 项目原生 settings 页面
const goSettings = () => router.push({ name: 'hermes.settings' })
// Kanban 下方"AI协作中心"入口 → 进入原生 Kanban 管理面板
const goCenter = () => router.push({ name: 'hermes.kanban' })

// 演示种子（批次 1 抽离到 fixtures/seed.ts；后续接 kanban API 时替换 loadSeed）
onMounted(() => loadSeed(store))
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
          <CockpitWorkspace v-if="store.workspaceMode === 'work'" :class="{ 'is-readonly': store.archivedMode }" @submit="() => {}" @later="() => {}" />
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

<!--
  驾驶舱布局样式 · Pure Ink（仅用 CSS 变量，无自定义色值）
  统一选中态语言：左侧 3px 色条 + 浅底
  间距：8 倍数 4/8/12/16/24/32；圆角 6/8/12
  放在组件非 scoped style 块内，使其随视图加载（避免依赖入口 main.ts 的全局 import 顺序）。
  子组件（Kanban/CollabMap/Workspace 等）通过同名 class 复用此处样式。
-->
<style lang="scss">
.cockpit {
  height: calc(100 * var(--vh, 1vh));
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

.cockpit__body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

// ── 三列通用 ──
.cockpit-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
  transition: flex-basis 0.2s ease;

  &--left { flex: 0 0 220px; border-right: 1px solid var(--border-color); background: var(--bg-sidebar); }
  &--mid { flex: 0 0 340px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
  &--right { flex: 1 1 0; min-width: 360px; background: var(--bg-sidebar); }

  &.is-collapsed { flex: 0 0 32px; }
  &.is-collapsed .cockpit-col__inner { display: none; }
}

.cockpit-col__inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

// 折叠竖条（贴边）
.cockpit-rail {
  display: none;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 10px;
  cursor: pointer;
  width: 100%;
  & .cockpit-rail__label {
    writing-mode: vertical-rl;
    letter-spacing: 2px;
    font-size: 11px;
    color: var(--text-muted);
  }
  &:hover .cockpit-rail__label { color: var(--text-primary); }
}
.is-collapsed .cockpit-rail { display: flex; }

// 折叠按钮（列内侧边缘）
.cockpit-collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 14px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-family: inherit;
  font-size: 9px;
  color: var(--text-muted);
  border-radius: 3px;
  padding: 0;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}

// ── 统一选中态（左色条 + 浅底）──
.cockpit-sel-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-primary);
  display: none;
}
.is-selected .cockpit-sel-bar { display: block; }
.cockpit-kanban__task.is-selected { background: var(--bg-secondary); }

// ── P5: 历史弹窗 overlay ──
.cockpit-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 40; }
.cockpit-modal-anchor { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 41; }
</style>