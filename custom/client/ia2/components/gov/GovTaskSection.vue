<!-- overlay/custom/client/ia2/components/gov/GovTaskSection.vue -->
<!-- v12 管理台 · 任务区：跨板块任务表（状态/指派人过滤）+ 行上操作
     （详情=抽屉 / ⌨=IDE / 历史=RunTrace）+ ＋新建→看板。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFlowStore } from '../../store/flow'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const props = defineProps<{ tasks: CockpitTask[] }>()

const { t } = useI18n()
const router = useRouter()
const flow = useFlowStore()
const cockpit = useCockpitStore()

const statusFilter = ref('')
const assigneeFilter = ref('')

const assignees = computed(() =>
  [...new Set(props.tasks.map(x => x.assignee).filter(Boolean))].sort())

const shown = computed(() => props.tasks.filter(x =>
  (!statusFilter.value || x.status === statusFilter.value) &&
  (!assigneeFilter.value || x.assignee === assigneeFilter.value)))

function detail(task: CockpitTask): void {
  flow.govSelectedId = `task:${task.id}`
}

function openIde(task: CockpitTask): void {
  flow.closeGov()
  void router.push({ name: 'ide.shell', query: { task: task.id } })
}

function history(task: CockpitTask): void {
  flow.closeGov()
  cockpit.openRunTrace({ taskId: task.id, sessionId: '' })
}
</script>

<template>
  <div class="gts" data-testid="gov-task-section">
    <div class="gts__head">
      <span class="gts__title">{{ t('ia2.gov.task.title') }}</span>
      <span class="gts__filters">
        <select v-model="statusFilter" class="gts__sel" data-testid="gov-task-status">
          <option value="">{{ t('ia2.gov.task.allStatus') }}</option>
          <option v-for="s in ['triage','todo','scheduled','ready','running','blocked','review','done','archived']" :key="s" :value="s">
            {{ t(`ia2.tdp.status.${s}`) }}
          </option>
        </select>
        <select v-model="assigneeFilter" class="gts__sel" data-testid="gov-task-assignee">
          <option value="">{{ t('ia2.gov.task.allAssignees') }}</option>
          <option v-for="a in assignees" :key="a" :value="a">{{ a }}</option>
        </select>
      </span>
      <button type="button" class="gts__new" data-testid="gov-task-new" @click="flow.closeGov(); router.push({ name: 'ia2.board' })">
        ＋ {{ t('ia2.gov.task.new') }}
      </button>
    </div>
    <div class="gts__table" data-testid="gov-task-rows">
      <div class="gts__row gts__row--head">
        <span class="gts__c1">{{ t('ia2.gov.task.colTask') }}</span>
        <span class="gts__c2">{{ t('ia2.gov.task.colAssignee') }}</span>
        <span class="gts__c3">{{ t('ia2.gov.task.colStatus') }}</span>
        <span class="gts__c4">{{ t('ia2.gov.task.colOps') }}</span>
      </div>
      <div v-if="!shown.length" class="gts__empty">{{ t('ia2.gov.task.empty') }}</div>
      <div
        v-for="task in shown" :key="task.id"
        class="gts__row" :data-testid="`gov-task-${task.id}`"
        :class="{ 'gts__row--sel': flow.govSelectedId === `task:${task.id}` }"
        @click="detail(task)"
      >
        <span class="gts__c1 gts__task">
          <span class="gts__dot" :class="`gts__dot--${task.status}`" />
          <span class="gts__task-name">#{{ task.id.slice(0, 8) }} {{ task.title }}</span>
        </span>
        <span class="gts__c2">{{ task.assignee }}</span>
        <span class="gts__c3">{{ t(`ia2.tdp.status.${task.status}`) }}</span>
        <span class="gts__c4 gts__ops" @click.stop>
          <button type="button" class="gts__op" @click="detail(task)">{{ t('ia2.gov.detail') }}</button>
          <button type="button" class="gts__op" :data-testid="`gov-task-ide-${task.id}`" @click="openIde(task)">⌨</button>
          <button type="button" class="gts__op" @click="history(task)">{{ t('ia2.gov.history') }}</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gts { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.gts__head {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.gts__title { font-weight: 700; color: var(--text-primary); }
.gts__filters { display: flex; gap: 6px; flex: 1; }
.gts__sel {
  height: 24px; padding: 0 6px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-card); color: var(--text-secondary); font-size: 11px; outline: none;
}
.gts__new {
  height: 24px; padding: 0 10px; border: 1px solid var(--primary); border-radius: 12px;
  background: transparent; color: var(--primary); font-size: 11px; cursor: pointer;
}
.gts__table { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; }
.gts__row {
  display: grid; grid-template-columns: minmax(0,1fr) 92px 76px 150px; gap: 6px;
  align-items: center; padding: 6px 6px; border-radius: 6px; cursor: pointer;
  &:hover { background: var(--bg-secondary); }
}
.gts__row--head {
  cursor: default; color: var(--text-muted); font-size: 10px; text-transform: uppercase;
  &:hover { background: transparent; }
  position: sticky; top: 0; background: var(--bg-primary);
}
.gts__row--sel { background: var(--bg-secondary); }
.gts__task { display: flex; align-items: center; gap: 6px; min-width: 0; }
.gts__task-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gts__dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.gts__dot--running { background: var(--primary); }
.gts__dot--review { background: var(--warning); }
.gts__dot--blocked { background: var(--error); }
.gts__dot--done { background: var(--success); }
.gts__c2, .gts__c3 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 11px; }
.gts__ops { display: flex; gap: 4px; justify-content: flex-end; }
.gts__op {
  height: 20px; padding: 0 7px; border: 1px solid var(--border-color); border-radius: 10px;
  background: transparent; color: var(--text-secondary); font-size: 10px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.gts__empty { padding: 16px; color: var(--text-muted); text-align: center; font-size: 11px; }
</style>
