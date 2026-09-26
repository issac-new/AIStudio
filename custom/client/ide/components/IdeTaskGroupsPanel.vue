<script setup lang="ts">
// IdeTaskGroupsPanel — Task Groups 面板（复刻 antigravity：每组目标概览+
// edited-files pill（点开看当前态）+可展开子任务步骤+末尾"待批步骤"专区；UI 复刻 R6）。
// 数据面=taskgroups 域（defineGroup/approveStep/groupSummary 语义镜像——本地状态）。
import { computed, ref } from 'vue'

interface Step { stepId: string; description: string; needsApproval: boolean; approved: boolean }
interface Group {
  groupId: string
  title: string
  editedFiles: string[]
  steps: Step[]
}

const props = defineProps<{ groups?: Group[] }>()
const emit = defineEmits<{ (e: 'approve', groupId: string, stepId: string, approved: boolean): void }>()

const expanded = ref<Record<string, boolean>>({})
const openFile = ref<string | null>(null)

const groups = computed(() => props.groups ?? [])
const pendingApprovals = computed(() =>
  groups.value.flatMap((g) => g.steps.filter((s) => s.needsApproval && !s.approved).map((s) => ({ groupId: g.groupId, step: s }))),
)

function toggle(groupId: string): void {
  expanded.value = { ...expanded.value, [groupId]: !expanded.value[groupId] }
}
</script>

<template>
  <div v-if="groups.length" class="ide-tg" data-testid="ide-task-groups">
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
            <button
              v-if="s.needsApproval && !s.approved"
              type="button"
              class="ide-tg__approve"
              :data-testid="`ide-tg-approve-${s.stepId}`"
              @click="emit('approve', g.groupId, s.stepId, true)"
            >批准</button>
            <span v-else-if="s.approved" class="ide-tg__ok">✓</span>
          </li>
        </ol>
      </div>
    </div>
    <div v-if="pendingApprovals.length" class="ide-tg__pending" data-testid="ide-tg-pending">
      <div class="ide-tg__pendinghead">待批步骤专区 · {{ pendingApprovals.length }}</div>
      <div v-for="p in pendingApprovals" :key="p.step.stepId" class="ide-tg__pendingrow">
        {{ p.step.description }}
        <button type="button" class="ide-tg__approve" @click="emit('approve', p.groupId, p.step.stepId, true)">批准</button>
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
.ide-tg__approve {
  border: 1px solid var(--primary-color, #18a058); background: transparent; color: var(--primary-color, #18a058);
  border-radius: 4px; font-size: 11px; padding: 0 6px; cursor: pointer; margin-left: 6px;
}
.ide-tg__pending { margin-top: 10px; border-top: 1px dashed var(--border-color, #ccc); padding-top: 6px; }
.ide-tg__pendinghead { font-weight: 600; font-size: 11px; color: var(--text-color-3, #999); }
.ide-tg__pendingrow { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
</style>
