<!-- overlay/custom/client/ia2/views/orchestration/OrchestrationView.vue -->
<!-- 任务协同图（Orchestration Chart）——以一个业务结果（根卡）为锚，回答
     「这件事如何由人、Agent 与控制点协同完成」（2026-10-10 麦肯锡概念一轮）。
     左：根卡选择 + VueFlow 任务链画布（人=蓝 / Agent=紫 / 未指派=灰；控制点=橙色描边+徽标）。
     右：五问面板（业务结果与负责人 / 人机分工 / 确认点 / 异常升级 / 可复用资产）。
     口径诚实项（面板脚注）：人/Agent 判定用 -agent 后缀约定；估算覆盖率如实展示，
     未估算卡不折算；任务工厂模板沉淀为 Phase 2 占位说明。 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { VueFlow, MarkerType, useVueFlow, type Node, type Edge } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { useWorkspaceStore } from '../../store/workspace'
import {
  type OrchTaskRaw, type AutonomyEntry, type EscalationRecord, type StoredSpecSummary,
  classifyExecutor, controlPointReasons, deriveMissionRoots, buildMissionTree,
  deriveFiveQuestions, layoutMissionDag, ORCH_NODE_W, ORCH_NODE_H,
  fetchAutonomyLadder, fetchPendingEscalations, fetchGraphSpecs,
} from '../../api/orchestration'

const workspace = useWorkspaceStore()

const loading = ref(false)
const selectedRootId = ref<string>('')
const ladder = ref<AutonomyEntry[] | null>(null)
const escalations = ref<EscalationRecord[] | null>(null)
const specs = ref<StoredSpecSummary[] | null>(null)

/** 全板任务（raw list JSON：含 parents/children/estimate_days，2026-10-10 起带出） */
const allTasks = computed<OrchTaskRaw[]>(() => (workspace.rawTasks ?? []).map(r => r.task))

const ladderByTarget = computed(() => new Map((ladder.value ?? []).map(e => [e.target, e])))

const roots = computed(() => deriveMissionRoots(allTasks.value))

/** 根卡选择兜底：未选/选失焦（卡被删）时自动落最大树 */
watch(roots, list => {
  if (list.length === 0) { selectedRootId.value = ''; return }
  if (!list.some(r => r.taskId === selectedRootId.value)) selectedRootId.value = list[0]!.taskId
}, { immediate: true })

const rootRaw = computed<OrchTaskRaw | null>(() =>
  allTasks.value.find(t => t.id === selectedRootId.value) ?? null)

const missionTree = computed(() =>
  rootRaw.value ? buildMissionTree(rootRaw.value.id, allTasks.value, ladderByTarget.value) : { nodes: [], edges: [] })

const fiveQ = computed(() => {
  if (!rootRaw.value) return null
  return deriveFiveQuestions(
    missionTree.value,
    {
      id: rootRaw.value.id,
      title: rootRaw.value.title,
      status: rootRaw.value.status,
      owner: rootRaw.value.assignee ?? '（未指派）',
      approver: rootRaw.value.raci?.approver ?? null,
    },
    escalations.value ?? [],
    specs.value ?? [],
  )
})

// ── 画布：VueFlow 节点/边（分层布局，根在上）──

const flowNodes = computed<Node[]>(() => {
  const { nodes, edges } = missionTree.value
  if (nodes.length === 0) return []
  const pos = layoutMissionDag(selectedRootId.value, edges)
  return nodes.map(n => ({
    id: n.taskId,
    type: 'orch',
    position: pos.get(n.taskId) ?? { x: 0, y: 0 },
    data: {
      title: n.title,
      assignee: n.assignee,
      status: n.status,
      executor: n.executor,
      estimateDays: n.estimateDays,
      control: n.controlReasons.length > 0,
    },
  }))
})

const flowEdges = computed<Edge[]>(() => {
  const seen = new Set<string>()
  const out: Edge[] = []
  for (const e of missionTree.value.edges) {
    const id = `${e.from}->${e.to}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      source: e.from,
      target: e.to,
      markerEnd: MarkerType.ArrowClosed,
      style: { stroke: 'var(--border-color, #7f8691)', strokeWidth: 1.8 },
    })
  }
  return out
})

// 数据异步到达/换根后再适配视口（fitViewOnInit 只在初始空画布时触发，节点
// 后到会溢出视口右缘——2026-10-10 走查实锤；VueFlow 量测节点尺寸异步完成，
// 单次 nextTick fit 仍可能早于量测，双延迟重试兜底）
const { fitView } = useVueFlow()
const nodeCount = computed(() => flowNodes.value.length)
watch(nodeCount, n => {
  if (n === 0) return
  const fit = (): void => { void fitView({ padding: 0.15, maxZoom: 1, duration: 200 }) }
  void nextTick(fit)
  setTimeout(fit, 150)
  setTimeout(fit, 450)
}, { immediate: true })

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [ladderR, escR, specsR] = await Promise.all([
      fetchAutonomyLadder(), fetchPendingEscalations(), fetchGraphSpecs(),
    ])
    ladder.value = ladderR
    escalations.value = escR
    specs.value = specsR
    await workspace.refreshAllBoards(true)
  } finally {
    loading.value = false
  }
}

onMounted(() => { void refresh() })

function onNodeClick(_: unknown, node: Node): void {
  selectedRootId.value = node.id
}

const EXECUTOR_LABEL: Record<string, string> = { human: '人', agent: 'Agent', unassigned: '未指派' }
</script>

<template>
  <div class="orch" data-testid="ia-orchestration-panel">
    <div class="orch__toolbar">
      <label class="orch__label" for="orch-root">业务结果（根任务）</label>
      <select id="orch-root" v-model="selectedRootId" class="orch__select" data-testid="ia-orchestration-root">
        <option v-if="roots.length === 0" value="" disabled>暂无带子任务的任务链</option>
        <option v-for="r in roots" :key="r.taskId" :value="r.taskId">
          {{ r.title }}（{{ r.treeSize }} 卡 · {{ r.status }}）
        </option>
      </select>
      <button type="button" class="orch__refresh" :disabled="loading" data-testid="ia-orchestration-refresh" @click="refresh">
        {{ loading ? '加载中…' : '刷新' }}
      </button>
      <div class="orch__legend" aria-hidden="true">
        <span class="orch__chip orch__chip--human">人</span>
        <span class="orch__chip orch__chip--agent">Agent</span>
        <span class="orch__chip orch__chip--unassigned">未指派</span>
        <span class="orch__chip orch__chip--control">控制点</span>
      </div>
    </div>

    <div v-if="roots.length === 0 && !loading" class="orch__empty" data-testid="ia-orchestration-empty">
      当前看板没有「有子任务、无父任务」的根卡。先在看板对一个需求卡执行任务拆解（decompose）或群任务（swarm）建立任务链，协同图才有锚点。
    </div>

    <div v-else class="orch__main">
      <div class="orch__canvas">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          fit-view-on-init
          :min-zoom="0.2"
          :max-zoom="1.6"
          @node-click="onNodeClick"
        >
          <template #node-orch="nodeProps">
            <div
              class="orch-node"
              :class="[`orch-node--${nodeProps.data.executor}`, { 'orch-node--control': nodeProps.data.control }]"
              :data-testid="`ia-orchestration-node-${nodeProps.id}`"
            >
              <div class="orch-node__title" :title="nodeProps.data.title">{{ nodeProps.data.title }}</div>
              <div class="orch-node__meta">
                <span class="orch-node__assignee">{{ nodeProps.data.assignee ?? '未指派' }}</span>
                <span class="orch-node__status">{{ nodeProps.data.status }}</span>
                <span v-if="nodeProps.data.estimateDays != null" class="orch-node__est">{{ nodeProps.data.estimateDays }}人日</span>
              </div>
              <div v-if="nodeProps.data.control" class="orch-node__badge">控制点</div>
            </div>
          </template>
        </VueFlow>
      </div>

      <aside v-if="fiveQ" class="orch__panel" data-testid="ia-orchestration-fiveq">
        <h3 class="orch__panel-title">五问核对（任务协同设计）</h3>

        <section class="orch__q">
          <h4>1. 业务结果与负责人</h4>
          <p class="orch__q-line"><strong>{{ fiveQ.outcome.title }}</strong></p>
          <p class="orch__q-line">负责人：{{ fiveQ.outcome.owner }}<template v-if="fiveQ.outcome.approver"> · 审批人：{{ fiveQ.outcome.approver }}</template></p>
          <p class="orch__q-line">状态：{{ fiveQ.outcome.status }} · 任务链 {{ fiveQ.outcome.taskCount }} 张卡</p>
        </section>

        <section class="orch__q">
          <h4>2. 任务链人机分工</h4>
          <p class="orch__q-line">
            人 {{ fiveQ.division.human }} 卡（{{ fiveQ.division.humanDays }} 人日） ·
            Agent {{ fiveQ.division.agent }} 卡（{{ fiveQ.division.agentDays }} 人日） ·
            未指派 {{ fiveQ.division.unassigned }} 卡
          </p>
          <p class="orch__q-note">估算覆盖率 {{ Math.round(fiveQ.division.coverage * 100) }}%（只有任务拆解建的卡带人日估算，未估算不折算）。</p>
        </section>

        <section class="orch__q">
          <h4>3. 需要人确认的控制点</h4>
          <p v-if="fiveQ.checkpoints.length === 0" class="orch__q-note">本任务链当前无显式控制点（无 RACI 审批人、无 review 状态卡、执行者无自主度审批点）。</p>
          <ul v-else class="orch__list">
            <li v-for="cp in fiveQ.checkpoints" :key="cp.taskId">
              <span class="orch__cp-title">{{ cp.title }}</span>
              <span class="orch__cp-reason">{{ cp.reasons.join('；') }}</span>
            </li>
          </ul>
        </section>

        <section class="orch__q">
          <h4>4. 异常如何升级</h4>
          <p class="orch__q-line">待决升级 {{ fiveQ.escalation.pendingTotal }} 条，其中关联本任务链 {{ fiveQ.escalation.linkedToMission }} 条。</p>
          <ul v-if="fiveQ.escalation.examples.length > 0" class="orch__list">
            <li v-for="(e, i) in fiveQ.escalation.examples" :key="i">
              {{ e.fromAgent }}（{{ e.urgency }}）：{{ e.reason }}
            </li>
          </ul>
          <p class="orch__q-note">升级处理入口在审批收件箱（/app/inbox）。</p>
        </section>

        <section class="orch__q">
          <h4>5. 可复用资产</h4>
          <template v-if="fiveQ.assets.factoryTemplates.length > 0">
            <p class="orch__q-note">任务工厂模板（复用次数）：</p>
            <ul class="orch__list">
              <li v-for="s in fiveQ.assets.factoryTemplates" :key="s.id">
                {{ s.name }} · 复用 {{ s.reuseCount }} 次<span v-if="s.sourceRunId">（来源 run {{ s.sourceRunId }}）</span>
              </li>
            </ul>
          </template>
          <p v-if="fiveQ.assets.loopTemplates.length > 0" class="orch__q-note">循环模板：{{ fiveQ.assets.loopTemplates.map(s => s.goal || s.id).slice(0, 3).join('、') }}<template v-if="fiveQ.assets.loopTemplates.length > 3"> 等 {{ fiveQ.assets.loopTemplates.length }} 件</template></p>
          <p v-if="fiveQ.assets.factoryTemplates.length === 0 && fiveQ.assets.loopTemplates.length === 0" class="orch__q-note">当前无可复用图模板登记。</p>
          <p class="orch__q-note">{{ fiveQ.assets.factoryNote }}</p>
        </section>

        <p class="orch__footnote">口径说明：人/Agent 按 -agent 后缀约定判定；控制点来自 RACI 审批人、review 状态与自主度阶梯审批点。</p>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.orch {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.orch__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.orch__label { font-size: 13px; color: var(--text-muted, #878c99); white-space: nowrap; }

.orch__select {
  max-width: 420px;
  min-width: 220px;
  padding: 4px 8px;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  color: inherit;
  font-size: 13px;
  font-family: inherit;
}

.orch__refresh {
  padding: 4px 12px;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--bg-secondary, #f1f2f4);
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: var(--bg-tertiary, #e7e9ee); }
  &:disabled { opacity: 0.6; cursor: default; }
}

.orch__legend { margin-left: auto; display: flex; gap: 6px; align-items: center; }

.orch__chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  &--human { color: #1d4ed8; border-color: #93c5fd; background: rgba(59, 130, 246, 0.08); }
  &--agent { color: #6d28d9; border-color: #c4b5fd; background: rgba(139, 92, 246, 0.08); }
  &--unassigned { color: var(--text-muted, #878c99); border-color: var(--border-color, #dcdfe6); }
  &--control { color: #b45309; border-color: #fcd34d; background: rgba(245, 158, 11, 0.1); }
}

.orch__empty {
  padding: 40px 24px;
  color: var(--text-muted, #878c99);
  font-size: 13px;
  line-height: 1.8;
  text-align: center;
}

.orch__main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.orch__canvas {
  flex: 1;
  min-width: 0;
  position: relative;
}

.orch__panel {
  width: 340px;
  flex-shrink: 0;
  overflow: auto;
  border-left: 1px solid var(--border-color, #e5e7eb);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.orch__panel-title { margin: 0; font-size: 14px; }

.orch__q {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  h4 { margin: 0 0 6px; font-size: 13px; }
}

.orch__q-line { margin: 2px 0; font-size: 12.5px; line-height: 1.6; }

.orch__q-note { margin: 4px 0 0; font-size: 11.5px; color: var(--text-secondary, #6b7280); line-height: 1.5; }

.orch__list {
  margin: 4px 0 0;
  padding-left: 16px;
  font-size: 12.5px;
  line-height: 1.6;
  li { margin: 2px 0; }
}

.orch__cp-title { font-weight: 600; }
.orch__cp-reason { display: block; color: var(--text-muted, #878c99); font-size: 11.5px; }

.orch__footnote {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color, #e5e7eb);
  font-size: 11px;
  color: var(--text-muted, #878c99);
  line-height: 1.5;
}

/* 画布节点（VueFlow 挂载非 scoped 深层节点，样式经 :deep 收口；修饰符类拆平——
   sass 不允许 :deep(...) 外层选择器带 & 后缀） */
:deep(.orch-node) {
  width: 190px;
  min-height: 56px;
  border-radius: 8px;
  border: 1.5px solid var(--border-color, #c9cdd4);
  background: var(--bg-primary, #fff);
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  position: relative;

  .orch-node__title {
    font-weight: 600;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .orch-node__meta {
    margin-top: 3px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--text-muted, #878c99);
    font-size: 11px;
  }

  .orch-node__est { color: #b45309; }

  .orch-node__badge {
    position: absolute;
    top: -9px;
    right: 8px;
    font-size: 10px;
    padding: 0 6px;
    border-radius: 999px;
    background: #f59e0b;
    color: #fff;
  }
}

:deep(.orch-node--human) { border-color: #60a5fa; }
:deep(.orch-node--agent) { border-color: #a78bfa; }
:deep(.orch-node--unassigned) { border-color: var(--border-color, #c9cdd4); opacity: 0.85; }
:deep(.orch-node--control) { box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35); border-color: #f59e0b; }
</style>
