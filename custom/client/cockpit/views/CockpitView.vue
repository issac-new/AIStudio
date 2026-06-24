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
import CockpitFilePanel from '@/custom/cockpit/components/CockpitFilePanel.vue'
import CockpitHistoryModal from '@/custom/cockpit/components/CockpitHistoryModal.vue'
import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import CockpitTemplateManager from '@/custom/cockpit/components/CockpitTemplateManager.vue'
import CockpitTopBar from '@/custom/cockpit/components/CockpitTopBar.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

const goSettings = () => router.push({ name: 'hermes.settings' })
const goCenter = () => router.push({ name: 'hermes.kanban' })

// 时间戳格式化（秒/毫秒兼容）
function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return '—'
  const ms = ts < 1e12 ? ts * 1000 : ts
  return new Date(ms).toLocaleString('zh-CN')
}

onMounted(() => { store.bootstrap() })
onUnmounted(() => { store.disconnectOnUnmount() })

// 单按钮双态切换：最大（全屏）↔ 还原（原页面布局）
function colCtrlIcon(col: ColumnKey): string {
  return store.maximized[col] ? '🗗' : '⛶'
}
function colCtrlTitle(col: ColumnKey): string {
  return store.maximized[col] ? '还原' : '最大化'
}
function onColCtrl(col: ColumnKey) {
  store.toggleMaximized(col)
}
</script>

<template>
  <div class="cockpit">
    <CockpitTopBar
      :agent-count="3"
      :human-count="2"
      :notify-count="store.notifyCount"
      :schedule-count="store.scheduleDatesWithEvents.size"
      :user-name="store.currentUserName"
      @schedule="store.openSchedule()"
      @notify="store.openNotify()"
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
          <CockpitKanban @enter-center="goCenter" @maximize="onColCtrl('left')" />
        </div>
      </section>

      <!-- 左-中分割线折叠按钮 -->
      <div v-if="!store.collapsed.left" class="cockpit-divider" data-divider="left-mid">
        <button type="button" class="cockpit-divider__btn"
          :title="store.collapsed.left ? '展开左栏' : '向左折叠左栏'"
          @click="store.toggleCollapsed('left')">◀</button>
      </div>

      <!-- 中栏 协作图 + 时序流 -->
      <section class="cockpit-col cockpit-col--mid"
        :class="{ 'is-collapsed': store.collapsed.mid, 'is-maximized': store.maximized.mid, 'is-hidden-by-max': !store.maximized.mid && (store.maximized.left || store.maximized.right) }">
        <CockpitColumnRail label="协作 · 时序" @expand="store.toggleCollapsed('mid')" />
        <div class="cockpit-col__inner">
          <div class="cockpit-col__ctrls">
            <button type="button" class="cockpit-col__ctrl" :class="{ 'is-on': store.maximized.mid }"
              :title="colCtrlTitle('mid')" @click="onColCtrl('mid')">{{ colCtrlIcon('mid') }}</button>
          </div>
          <CockpitCollabMap v-show="!store.midTopCollapsed" :style="{ flex: store.midBottomCollapsed ? '1 1 0' : '1 1 0' }" />
          <!-- 中栏分区折叠分隔条 -->
          <div class="cockpit-mid-divider">
            <button type="button" class="cockpit-mid-divider__btn" :class="{ 'is-on': store.midTopCollapsed }"
              :title="store.midTopCollapsed ? '展开协作图' : '折叠协作图'"
              @click="store.toggleMidTop()">
              {{ store.midTopCollapsed ? '▽' : '△' }}
            </button>
            <span class="cockpit-mid-divider__line" />
            <button type="button" class="cockpit-mid-divider__btn" :class="{ 'is-on': store.midBottomCollapsed }"
              :title="store.midBottomCollapsed ? '展开时序流' : '折叠时序流'"
              @click="store.toggleMidBottom()">
              {{ store.midBottomCollapsed ? '△' : '▽' }}
            </button>
          </div>
          <CockpitTimeline v-show="!store.midBottomCollapsed" />
        </div>
      </section>

      <!-- 中-右分割线折叠按钮 -->
      <div v-if="!store.collapsed.mid || !store.collapsed.right" class="cockpit-divider" data-divider="mid-right">
        <button type="button" class="cockpit-divider__btn"
          :title="store.collapsed.mid ? '展开中栏' : '向右折叠中栏'"
          @click="store.toggleCollapsed('mid')">◀</button>
        <button type="button" class="cockpit-divider__btn"
          :title="store.collapsed.right ? '展开右栏' : '向右折叠右栏'"
          @click="store.toggleCollapsed('right')">▶</button>
      </div>

      <!-- 右栏 A2UI 工作区（按模式切换）-->
      <section class="cockpit-col cockpit-col--right"
        :class="{ 'is-collapsed': store.collapsed.right, 'is-maximized': store.maximized.right, 'is-hidden-by-max': !store.maximized.right && (store.maximized.left || store.maximized.mid) }">
        <CockpitColumnRail label="工作区" @expand="store.toggleCollapsed('right')" />
        <div class="cockpit-col__inner">
          <CockpitModeBar />
          <CockpitCollabBar v-if="store.workspaceMode !== 'term'" />
          <span v-if="store.archivedMode" class="cockpit-readonly-badge">{{ t('cockpit.readOnly') }}</span>
          <CockpitWorkspace v-if="store.workspaceMode === 'work'" :class="{ 'is-readonly': store.archivedMode }" @submit="store.submitWorkItem" />
          <CockpitFilePanel v-else-if="store.workspaceMode === 'workspace'" />
          <CockpitChatPane v-else-if="store.workspaceMode === 'chat'" />
          <CockpitTerminalPane v-else />
        </div>
      </section>
    </div>

    <div v-if="store.historyOpen" class="cockpit-overlay" @click="store.closeHistory()" />
    <CockpitHistoryModal v-if="store.historyOpen" class="cockpit-modal-anchor" />
    <div v-if="store.scheduleOpen" class="cockpit-overlay" @click="store.closeSchedule()" />
    <CockpitScheduleModal v-if="store.scheduleOpen" class="cockpit-modal-anchor" />
    <div v-if="store.notifyOpen" class="cockpit-overlay cockpit-overlay--clear" @click="store.closeNotify()" />
    <CockpitNotifyModal v-if="store.notifyOpen" />
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

    <!-- kanban 任务详情弹窗（双击协作图节点） -->
    <div v-if="store.kanbanDetailOpen" class="cockpit-overlay" @click="store.closeKanbanDetail()" />
    <div v-if="store.kanbanDetailOpen && store.kanbanDetailTask" class="cockpit-kanban-detail cockpit-modal-anchor">
      <div class="cockpit-title-detail__head">
        <span>任务详情</span>
        <button type="button" class="cockpit-title-detail__close" @click="store.closeKanbanDetail()">×</button>
      </div>
      <div class="cockpit-kanban-detail__body">
        <!-- 关键信息：标题、描述、摘要、Workspace -->
        <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">标题</span><span class="cockpit-kanban-detail__value cockpit-kanban-detail__value--title">{{ store.kanbanDetailTask.task.title }}</span></div>
        <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.task.body"><span class="cockpit-kanban-detail__label">描述</span><span class="cockpit-kanban-detail__value cockpit-kanban-detail__value--pre">{{ store.kanbanDetailTask.task.body }}</span></div>
        <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.latest_summary"><span class="cockpit-kanban-detail__label">摘要</span><span class="cockpit-kanban-detail__value cockpit-kanban-detail__value--pre">{{ store.kanbanDetailTask.latest_summary }}</span></div>
        <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">Workspace</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.workspace_kind }}: {{ store.kanbanDetailTask.task.workspace_path ?? '—' }}</span></div>

        <!-- 折叠的更多信息 -->
        <button type="button" class="cockpit-kanban-detail__toggle" @click="store.detailExpanded = !store.detailExpanded">
          {{ store.detailExpanded ? '▾ 收起更多信息' : '▸ 更多信息' }}
        </button>
        <div v-if="store.detailExpanded" class="cockpit-kanban-detail__more">
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">ID</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.id }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">状态</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.status }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">优先级</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.priority }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">负责人</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.assignee ?? '(未分配)' }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">创建者</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.created_by ?? '—' }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">租户</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.tenant ?? '(未指定)' }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">项目ID</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.project_id ?? '—' }}</span></div>
          <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.task.skills?.length"><span class="cockpit-kanban-detail__label">技能</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.task.skills.join(', ') }}</span></div>
          <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.task.result"><span class="cockpit-kanban-detail__label">结果</span><span class="cockpit-kanban-detail__value cockpit-kanban-detail__value--pre">{{ store.kanbanDetailTask.task.result }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">创建时间</span><span class="cockpit-kanban-detail__value">{{ formatTimestamp(store.kanbanDetailTask.task.created_at) }}</span></div>
          <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.task.started_at"><span class="cockpit-kanban-detail__label">开始时间</span><span class="cockpit-kanban-detail__value">{{ formatTimestamp(store.kanbanDetailTask.task.started_at) }}</span></div>
          <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.task.completed_at"><span class="cockpit-kanban-detail__label">完成时间</span><span class="cockpit-kanban-detail__value">{{ formatTimestamp(store.kanbanDetailTask.task.completed_at) }}</span></div>
          <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.parents?.length"><span class="cockpit-kanban-detail__label">父任务</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.parents.join(', ') }}</span></div>
          <div class="cockpit-kanban-detail__row" v-if="store.kanbanDetailTask.children?.length"><span class="cockpit-kanban-detail__label">子任务</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.children.join(', ') }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">事件数</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.events?.length ?? 0 }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">执行次数</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.runs?.length ?? 0 }}</span></div>
          <div class="cockpit-kanban-detail__row"><span class="cockpit-kanban-detail__label">评论数</span><span class="cockpit-kanban-detail__value">{{ store.kanbanDetailTask.comments?.length ?? 0 }}</span></div>
        </div>
      </div>
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
.cockpit-kanban-detail {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 1000; width: min(480px, calc(100vw - 48px));
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.cockpit-kanban-detail__body { padding: 12px 16px; }
.cockpit-kanban-detail__row {
  display: flex; align-items: baseline; gap: 12px; padding: 6px 0;
  border-bottom: 1px solid var(--border-light); font-size: 13px; color: var(--text-primary);
  &:last-child { border-bottom: none; }
}
.cockpit-kanban-detail__label {
  font-size: 11px; font-weight: 700; color: var(--text-muted);
  width: 70px; flex-shrink: 0; text-transform: uppercase;
}
.cockpit-kanban-detail__value { word-break: break-word; }
.cockpit-kanban-detail__value--title { font-size: 15px; font-weight: 700; }
.cockpit-kanban-detail__value--pre { white-space: pre-wrap; max-height: 120px; overflow-y: auto; font-size: 12px; }
.cockpit-kanban-detail__toggle {
  width: 100%; padding: 8px 0; margin-top: 4px; border: none;
  border-top: 1px solid var(--border-color); background: none;
  color: var(--text-muted); font-size: 11px; font-family: inherit; cursor: pointer;
  text-align: left;
  &:hover { color: var(--text-primary); }
}
.cockpit-kanban-detail__more { padding-top: 4px; }
.cockpit-mid-divider {
  flex-shrink: 0; display: flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color); background: var(--bg-card);
}
.cockpit-mid-divider__btn {
  width: 20px; height: 18px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-secondary); color: var(--text-muted);
  cursor: pointer; font-size: 10px; line-height: 1; font-family: inherit;
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-mid-divider__line { flex: 1; height: 1px; background: var(--border-light); }
.cockpit-divider {
  flex-shrink: 0; width: 14px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  background: var(--bg-card); border-left: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color); z-index: 50;
}
.cockpit-divider__btn {
  width: 12px; height: 28px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 3px; background: var(--bg-secondary); color: var(--text-muted);
  cursor: pointer; font-size: 8px; line-height: 1; font-family: inherit;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
</style>