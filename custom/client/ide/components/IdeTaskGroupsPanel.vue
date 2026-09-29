<script setup lang="ts">
// IdeTaskGroupsPanel — Task Groups 面板（复刻 antigravity：每组目标概览+
// edited-files pill（点开看当前态）+可展开子任务步骤+待批区；UI 复刻 R6）。
// 数据面=会话 taskPlan 快照（真实只读投影）。
// A3 根治（2026-09-29）：引擎无"逐步批准"语义（taskPlan pending=未执行，非待批），
// 原批准按钮 emit 无消费者属纸面融合——待批区改接真实通道：会话级 pendingApproval
// → chatStore.respondApproval（once/session/always/deny 四档，与审批收件箱同源）。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

interface Step { stepId: string; description: string; approved: boolean; running?: boolean }
interface Group {
  groupId: string
  title: string
  editedFiles: string[]
  steps: Step[]
}

const props = defineProps<{ groups?: Group[] }>()

const expanded = ref<Record<string, boolean>>({})
const openFile = ref<string | null>(null)
const approvalError = ref('')

const chatStore = useChatStore()

/** 真实链：会话 taskPlan 快照（steps→组步骤；status 映射完成/执行中/未执行）映射为任务组。 */
const taskPlanGroups = computed<Group[]>(() => {
  const plan = (chatStore.activeSession as unknown as { taskPlan?: { plan_id: string; run_id: string; plan: Array<{ id: string; step: string; status: string }> } } | null)?.taskPlan
  if (!plan?.plan?.length) return []
  return [{
    groupId: plan.plan_id || plan.run_id,
    title: `任务计划 · ${plan.run_id.slice(-8)}`,
    editedFiles: [],
    steps: plan.plan.map((p) => ({
      stepId: p.id, description: p.step,
      approved: p.status === 'completed',
      running: p.status === 'in_progress',
    })),
  }]
})

const groups = computed(() => props.groups?.length ? props.groups : taskPlanGroups.value)
const pendingSteps = computed(() =>
  groups.value.flatMap((g) => g.steps.filter((s) => !s.approved && !s.running).map((s) => ({ groupId: g.groupId, step: s }))),
)

/** 会话级真实待批审批（引擎 pendingApproval，与审批收件箱同源） */
const sessionApproval = computed(() =>
  (chatStore as unknown as { activePendingApproval?: { approvalId: string; command: string; description: string; choices: Array<'once' | 'session' | 'always' | 'deny'>; allowPermanent: boolean } | null }).activePendingApproval ?? null,
)

const CHOICE_LABEL: Record<string, string> = { once: '仅本次', session: '本会话', always: '总是', deny: '拒绝' }

function approveSession(choice: 'once' | 'session' | 'always' | 'deny'): void {
  approvalError.value = ''
  const fn = (chatStore as unknown as { respondApproval?: (c: string) => 'submitted' | 'missing' }).respondApproval
  if (!fn) { approvalError.value = '审批通道不可用'; return }
  const result = fn.call(chatStore, choice)
  if (result !== 'submitted') approvalError.value = '审批已失效（可能已被其他入口处理）'
}

function toggle(groupId: string): void {
  expanded.value = { ...expanded.value, [groupId]: !expanded.value[groupId] }
}
</script>

<template>
  <div v-if="groups.length || sessionApproval" class="ide-tg" data-testid="ide-task-groups">
    <div v-if="sessionApproval" class="ide-tg__approval" data-testid="ide-tg-session-approval">
      <div class="ide-tg__approvalhead">待批审批</div>
      <div class="ide-tg__approvaldesc">{{ sessionApproval.description || sessionApproval.command }}</div>
      <div class="ide-tg__approvalactions">
        <button
          v-for="c in sessionApproval.choices"
          :key="c"
          type="button"
          class="ide-tg__approve"
          :class="{ 'is-deny': c === 'deny' }"
          :data-testid="`ide-tg-approval-${c}`"
          @click="approveSession(c)"
        >{{ CHOICE_LABEL[c] ?? c }}</button>
      </div>
      <div v-if="approvalError" class="ide-tg__approvalerr" data-testid="ide-tg-approval-err">{{ approvalError }}</div>
    </div>
    <div v-for="g in groups" :key="g.groupId" class="ide-tg__group">
      <div class="ide-tg__head" :data-testid="`ide-tg-head-${g.groupId}`" @click="toggle(g.groupId)">
        <span class="ide-tg__chev">{{ expanded[g.groupId] ? '▾' : '▸' }}</span>
        <span class="ide-tg__title">{{ g.title }}</span>
        <span class="ide-tg__counts">{{ g.steps.filter((s) => s.approved).length }}/{{ g.steps.length }}</span>
      </div>
      <div v-if="expanded[g.groupId]" class="ide-tg__body">
        <div class="ide-tg__files">
          <button
            v-for="f in g.editedFiles"
            :key="f"
            type="button"
            class="ide-tg__pill"
            :data-testid="`ide-tg-file-${f}`"
            @click="openFile = openFile === f ? null : f"
          >📄 {{ f.split(/[\\/]/).pop() }}</button>
        </div>
        <div v-if="openFile && g.editedFiles.includes(openFile)" class="ide-tg__filestate" :data-testid="'ide-tg-filestate'">{{ openFile }}</div>
        <ol class="ide-tg__steps">
          <li v-for="s in g.steps" :key="s.stepId" class="ide-tg__step" :class="{ 'is-approved': s.approved }">
            {{ s.description }}
            <span v-if="s.approved" class="ide-tg__ok">✓</span>
            <span v-else-if="s.running" class="ide-tg__running">◐ 执行中</span>
            <span v-else class="ide-tg__pendingbadge">未执行</span>
          </li>
        </ol>
      </div>
    </div>
    <div v-if="pendingSteps.length" class="ide-tg__pending" data-testid="ide-tg-pending">
      <div class="ide-tg__pendinghead">未执行步骤 · {{ pendingSteps.length }}</div>
      <div v-for="p in pendingSteps" :key="p.step.stepId" class="ide-tg__pendingrow">
        {{ p.step.description }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-tg { margin: 4px 12px; font-size: 12px; }
.ide-tg__group { border: 1px solid var(--border-color, #e8e8e8); border-radius: 6px; margin: 6px 0; }
.ide-tg__head { display: flex; gap: 6px; align-items: center; padding: 6px 10px; cursor: pointer; }
.ide-tg__chev { color: var(--text-color-3, #999); }
.ide-tg__title { flex: 1; font-weight: 600; }
.ide-tg__counts { color: var(--text-color-3, #999); font-size: 11px; }
.ide-tg__body { padding: 0 10px 8px; }
.ide-tg__files { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
.ide-tg__pill {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 10px;
  font-size: 11px; padding: 1px 8px; cursor: pointer;
}
.ide-tg__filestate { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-color-3, #888); margin: 2px 0; }
.ide-tg__steps { margin: 4px 0 0; padding-left: 18px; }
.ide-tg__step { padding: 1px 0; }
.ide-tg__step.is-approved { color: var(--text-color-3, #999); }
.ide-tg__ok { color: var(--primary-color, #18a058); margin-left: 4px; }
.ide-tg__running { color: var(--warning-color, #f0a020); margin-left: 4px; font-size: 11px; }
.ide-tg__pendingbadge { color: var(--text-color-3, #999); margin-left: 4px; font-size: 11px; }
.ide-tg__approve {
  border: 1px solid var(--primary-color, #18a058); background: transparent; color: var(--primary-color, #18a058);
  border-radius: 4px; font-size: 11px; padding: 0 6px; cursor: pointer; margin-left: 6px;
}
.ide-tg__approve.is-deny { border-color: var(--error-color, #d03050); color: var(--error-color, #d03050); }
.ide-tg__approval { border: 1px solid var(--warning-color, #f0a020); border-radius: 6px; padding: 6px 10px; margin: 6px 0; }
.ide-tg__approvalhead { font-weight: 600; font-size: 11px; color: var(--warning-color, #f0a020); }
.ide-tg__approvaldesc { padding: 4px 0; word-break: break-all; }
.ide-tg__approvalactions { display: flex; gap: 6px; }
.ide-tg__approvalerr { color: var(--error-color, #d03050); font-size: 11px; padding-top: 4px; }
.ide-tg__pending { margin-top: 10px; border-top: 1px dashed var(--border-color, #ccc); padding-top: 6px; }
.ide-tg__pendinghead { font-weight: 600; font-size: 11px; color: var(--text-color-3, #999); }
.ide-tg__pendingrow { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
</style>
