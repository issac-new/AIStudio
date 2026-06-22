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
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

// 右上角用户/设置按钮 → 返回 overlay 项目原生 settings 页面
const goSettings = () => router.push({ name: 'hermes.settings' })
// Kanban 下方"AI协作中心"入口 → 进入原生 Kanban 管理面板
const goCenter = () => router.push({ name: 'hermes.kanban' })

// 种子数据（P1 占位；后续接入 kanban API）
onMounted(() => {
  store.tasks = [
    { id: '1', title: 'PR #142 · 重构 auth', category: 'human', priority: 'P0', status: 'review', assignee: '@张三', workspace: '~/ws/auth-svc' },
    { id: '2', title: '前端联调 auth', category: 'human', priority: 'P1', status: 'blocked', assignee: '@李四', workspace: '~/ws/web-fe' },
    { id: '3', title: 'API 文档补全', category: 'human', priority: 'P1', status: 'running', assignee: '@王五', workspace: '~/ws/api-docs' },
    { id: '4', title: '发版方案评估', category: 'cluster', priority: 'P1', status: 'running', assignee: 'arch/qa', workspace: '~/ws/platform' },
    { id: '5', title: '部署架构选型', category: 'cluster', priority: 'P2', status: 'triage', assignee: 'arch', workspace: '~/ws/platform' },
    { id: '6', title: 'cli-helper · 迁移脚本', category: 'direct', priority: 'P1', status: 'todo', assignee: '你↔cli', workspace: '~/ws/db-mig' },
  ]
  store.attention = [
    { id: 'a1', severity: 'high', title: 'PR #142 · review 标风险', taskId: '1' },
    { id: 'a2', severity: 'medium', title: '集群提问：阻塞发版？', taskId: '4' },
    { id: 'a3', severity: 'low', title: '前端联调 · 等接口', taskId: '2' },
  ]
  store.selectTask('1')
  // P2 种子：时序事件 + 拓扑（P5 接入 Kanban event API）
  store.events = [
    { id: 'e1', taskId: '1', actor: '张三', kind: 'A2H', what: '提交 PR #142', when: '14:32', pending: false, ts: 1732 },
    { id: 'e2', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '自评：结构良好', when: '14:35', pending: false, ts: 1735 },
    { id: 'e3', taskId: '1', actor: 'review-agent', kind: 'A2A', what: '2 处边界未覆盖 → 委派 qa', when: '14:36', pending: true, ts: 1736 },
    { id: 'e4', taskId: '1', actor: 'qa-agent', kind: 'A2H', what: '用例写完 → 待审', when: '现在', pending: true, ts: 1740 },
  ]
  store.appTopology = [
    { id: 'n1', taskId: '1', label: 'refresh.ts', kind: 'file', focus: true, links: ['n2'] },
    { id: 'n2', taskId: '1', label: 'auth.spec', kind: 'test', focus: false, links: [] },
  ]
  store.reqTopology = [{ id: 'r1', taskId: '1', label: '认证重构', kind: 'req', focus: true }]
  store.projTopology = [{ id: 'p1', taskId: '1', label: 'auth-platform', kind: 'project', focus: true }]
  // P3 种子：工作项 + 文件树（后续接入 listFiles API）
  store.workItems = [
    {
      id: 'w1', taskId: '1', decision: 'conditional',
      riskTags: ['concurrency', 'test-gap'], opinion: '建议合并前补充 token 并发刷新用例，其余结构 OK。',
      modifiedFiles: ['refresh.ts', 'token.ts', 'auth.spec.ts'], score: 4,
    },
  ]
  store.fileTrees = {
    '1': [
      {
        id: 'f1', name: 'src', isDir: true,
        children: [
          { id: 'f2', name: 'refresh.ts', isDir: false, modified: true },
          { id: 'f3', name: 'token.ts', isDir: false, modified: true },
          { id: 'f4', name: 'index.ts', isDir: false, modified: false },
        ],
      },
      { id: 'f5', name: 'tests', isDir: true, children: [{ id: 'f6', name: 'auth.spec.ts', isDir: false, modified: true }] },
      { id: 'f7', name: 'package.json', isDir: false, modified: false },
    ],
  }
  // P4 种子：协作频道 + 消息（后续接入 socket）
  store.channels = [
    { id: 'c1', taskId: '1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '李四', '你'] },
    { id: 'c2', taskId: '1', kind: 'chat', label: 'review-agent', members: ['review-agent'] },
  ]
  store.messages = {
    c1: [
      { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'PR #142 我提交了，看看并发刷新。', ts: 1 },
      { id: 'm2', channelId: 'c1', author: 'review-agent', isMe: false, text: '结构 OK，但并发刷新 2 处边界没覆盖，已委派 qa。', ts: 2 },
      { id: 'm3', channelId: 'c1', author: '你', isMe: true, text: '收到，先别合并。李四后端能配合吗？', ts: 3 },
      { id: 'm4', channelId: 'c1', author: '李四', isMe: false, text: '可以，我加个幂等锁。', ts: 4 },
    ],
    c2: [
      { id: 'm5', channelId: 'c2', author: 'review-agent', isMe: false, text: '已委派 qa 补用例，需要你决策是否阻塞。', ts: 5 },
    ],
  }
  // P5 种子：历史事件（后续接入 Kanban event API）
  store.history = [
    { id: 'h1', when: '今天 14:36', taskId: '1', action: '审批', title: '审批 PR #142（有条件通过）', archived: false },
    { id: 'h2', when: '今天 13:20', taskId: '4', action: '决策', title: '决定延后发版', archived: false },
    { id: 'h3', when: '今天 11:05', taskId: '6', action: '补充', title: '确认迁移脚本参数', archived: false },
    { id: 'h4', when: '昨天 18:40', taskId: '1', action: '审批', title: '审批 v2.2 发版', archived: true },
    { id: 'h5', when: '3 天前', taskId: '1', action: '评估', title: '评估旧版 auth 重构', archived: true },
  ]
  // P6 种子：A2UI 模板 + 拓扑关系
  store.templates = [
    { id: 'tpl1', name: 'PR 标准审核', decision: 'conditional', riskTags: ['concurrency', 'test-gap'], opinion: '建议补用例再合并', modifiedFiles: [] },
  ]
  store.appRelations = [
    { id: 'rel1', taskId: '1', from: 'n1', to: 'n2', label: 'A2A' },
    { id: 'rel2', taskId: '1', from: 'n2', to: 'n1', label: 'A2H' },
  ]
})
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