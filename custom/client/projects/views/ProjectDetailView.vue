<!-- overlay/custom/client/projects/views/ProjectDetailView.vue
     项目详情页：route param id → 详情 + 刷新（DirectorRunDetail 骨架：
     useRoute + watch + 返回入口）。三区：统计卡（total/byStatus）/ 未终结
     任务表（id/status/board/title）/ timeline 倒序列表（时间+kind+detail）。
     操作条同列表页三按钮（共享 useProjectActions 编排）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import { fetchProject, type ProjectDetailData } from '../api/projects'
import {
  actionAvailability, distributionRows, formatEpochTime, statusBadgeClass, statusLabel, timelineDescending,
} from '../utils'
import { useProjectActions } from '../composables/useProjectActions'
import ProjectCompleteDialog from '../components/ProjectCompleteDialog.vue'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const locale = computed<'zh' | 'en'>(() => (zh.value ? 'zh' : 'en'))

/** 路由 /app/projects/:id（深链可分享；参数变化就地刷新） */
const projectId = computed(() => {
  const raw = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
})

const project = ref<ProjectDetailData | null>(null)
const loading = ref(false)
const loadError = ref('')

async function refresh(): Promise<void> {
  if (!projectId.value) return
  loading.value = true
  loadError.value = ''
  try {
    project.value = await fetchProject(projectId.value)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => { void refresh() })
watch(projectId, () => { void refresh() })

const actions = useProjectActions(refresh)

const distRows = computed(() => distributionRows(project.value?.taskStats.byStatus ?? {}))
const unfinished = computed(() => project.value?.unfinished ?? [])
const timeline = computed(() => timelineDescending(project.value?.timeline ?? []))
/** 操作条可用性（同列表页矩阵；读取期/操作中叠加禁用） */
const avail = computed(() => actionAvailability(project.value?.status ?? 'completed'))
const busy = computed(() => actions.busyId.value === projectId.value)

function backToList(): void {
  void router.push({ name: 'projects' })
}
</script>

<template>
  <div class="prd" data-testid="project-detail-page">
    <header class="prd__head">
      <h2 class="prd__title">{{ zh ? '项目详情' : 'Project detail' }}</h2>
      <div class="prd__actions">
        <NButton size="small" :loading="loading" data-testid="project-detail-refresh" @click="refresh">
          {{ zh ? '刷新' : 'Refresh' }}
        </NButton>
        <NButton size="small" data-testid="project-detail-back" @click="backToList">
          {{ zh ? '返回项目列表' : 'Back to projects' }}
        </NButton>
      </div>
    </header>

    <p v-if="!projectId" class="prd__note" data-testid="project-detail-no-id">
      {{ zh ? '缺少项目 id——请从项目列表进入。' : 'Missing project id.' }}
    </p>
    <p v-else-if="loadError" class="prd__error" data-testid="project-detail-error" :title="loadError">
      {{ zh ? '项目数据暂不可用。' : 'Project data unavailable.' }}
    </p>

    <template v-else-if="project">
      <section class="prd__card" data-testid="project-detail-summary">
        <div class="prd__kv">
          <span class="prd__k">{{ zh ? '项目' : 'Project' }}</span>
          <code class="prd__v">{{ project.id }}</code>
        </div>
        <div class="prd__kv">
          <span class="prd__k">{{ zh ? '状态' : 'Status' }}</span>
          <span class="prj-badge" :class="statusBadgeClass(project.status)" data-testid="project-detail-status">
            {{ statusLabel(project.status, locale) }}
          </span>
        </div>
        <div class="prd__kv">
          <span class="prd__k">{{ zh ? '任务总数' : 'Total tasks' }}</span>
          <span class="prd__v prd__num" data-testid="project-detail-total">{{ project.taskStats.total }}</span>
        </div>
        <div class="prd__dist" data-testid="project-detail-dist">
          <span
            v-for="row in distRows"
            :key="row.status"
            class="prd__dist-item"
          >{{ row.status }} {{ row.count }}</span>
          <span v-if="!distRows.length" class="prd__muted">{{ zh ? '暂无任务分布。' : 'No task distribution.' }}</span>
        </div>
        <div v-if="project.pausedAt" class="prd__kv">
          <span class="prd__k">{{ zh ? '暂停于' : 'Paused at' }}</span>
          <span class="prd__v">{{ formatEpochTime(project.pausedAt, locale) }}</span>
        </div>
        <div v-if="project.completedAt" class="prd__kv">
          <span class="prd__k">{{ zh ? '完成于' : 'Completed at' }}</span>
          <span class="prd__v">{{ formatEpochTime(project.completedAt, locale) }}</span>
        </div>
        <!-- 操作条：与列表页同款三按钮（pause 仅 active / resume 仅 paused / complete 非 completed） -->
        <div class="prd__ops" data-testid="project-detail-ops">
          <NButton
            size="small"
            :disabled="!avail.pause || busy"
            data-testid="project-detail-pause"
            @click="actions.pauseOrResume(project, true)"
          >{{ zh ? '暂停' : 'Pause' }}</NButton>
          <NButton
            size="small"
            :disabled="!avail.resume || busy"
            data-testid="project-detail-resume"
            @click="actions.pauseOrResume(project, false)"
          >{{ zh ? '恢复' : 'Resume' }}</NButton>
          <NButton
            size="small"
            :disabled="!avail.complete || busy"
            data-testid="project-detail-complete"
            @click="actions.complete(project)"
          >{{ zh ? '完成' : 'Complete' }}</NButton>
        </div>
      </section>

      <section class="prd__card" data-testid="project-detail-unfinished">
        <h3 class="prd__h">{{ zh ? '未终结任务' : 'Unfinished tasks' }}</h3>
        <p v-if="!unfinished.length" class="prd__muted">{{ zh ? '没有未终结任务。' : 'No unfinished tasks.' }}</p>
        <table v-else class="prd__table">
          <thead>
            <tr>
              <th>{{ zh ? '任务' : 'Task' }}</th>
              <th>{{ zh ? '状态' : 'Status' }}</th>
              <th>{{ zh ? '看板' : 'Board' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in unfinished" :key="t.id" :data-testid="`project-detail-unfinished-${t.id}`">
              <td>
                <div class="prd__task">
                  <span class="prd__task-id">{{ t.id }}</span>
                  <span v-if="t.title" class="prd__muted">{{ t.title }}</span>
                </div>
              </td>
              <td>{{ t.status }}</td>
              <td>{{ t.board }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="prd__card" data-testid="project-detail-timeline">
        <h3 class="prd__h">{{ zh ? '时间线（倒序）' : 'Timeline (latest first)' }}</h3>
        <p v-if="!timeline.length" class="prd__muted">{{ zh ? '还没有时间线记录。' : 'No timeline events yet.' }}</p>
        <ul v-else class="prd__timeline">
          <li
            v-for="(e, i) in timeline"
            :key="`${e.at}-${e.kind}-${i}`"
            class="prd__event"
            :data-testid="`project-detail-timeline-${i}`"
          >
            <span class="prd__ts">{{ formatEpochTime(e.at, locale) }}</span>
            <span class="prd__kind">{{ e.kind }}</span>
            <span v-if="e.detail" class="prd__detail">{{ e.detail }}</span>
          </li>
        </ul>
      </section>
    </template>

    <ProjectCompleteDialog
      :show="actions.confirmOpen.value"
      :project-id="actions.confirmTarget.value?.id ?? ''"
      :problems="actions.confirmProblems.value"
      :reason="actions.overrideReason.value"
      :busy="actions.overrideBusy.value"
      @update:show="(v: boolean) => { if (!v) actions.closeConfirm() }"
      @update:reason="(v: string) => { actions.overrideReason.value = v }"
      @force="actions.forceComplete()"
    />
  </div>
</template>

<style scoped>
.prd { display: flex; flex-direction: column; gap: var(--ia-sp-3, 12px); padding: 14px 16px; }
.prd__head { display: flex; align-items: center; gap: var(--ia-sp-3, 12px); }
.prd__title { margin: 0; font-size: var(--ia-fs-page, 15px); }
.prd__actions { margin-left: auto; display: flex; gap: 6px; }
.prd__note { margin: 0; font-size: var(--ia-fs-body, 12px); color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; }
.prd__error { margin: 0; color: var(--ia-fail); font-size: var(--ia-fs-body, 12px); }
.prd__card { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; display: flex; flex-direction: column; gap: var(--ia-sp-2, 8px); }
.prd__h { margin: 0; font-size: var(--ia-fs-block, 13px); }
.prd__kv { display: flex; gap: 10px; align-items: baseline; font-size: var(--ia-fs-body, 12px); }
.prd__k { color: var(--text-muted); min-width: 64px; }
.prd__v { word-break: break-all; }
.prd__num { font-variant-numeric: tabular-nums; font-weight: 600; }
.prd__dist { display: flex; gap: var(--ia-sp-2, 8px); flex-wrap: wrap; font-size: var(--ia-fs-body, 12px); }
.prd__dist-item { color: var(--text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.prd__muted { margin: 0; font-size: var(--ia-fs-body, 12px); color: var(--text-muted); }
.prd__ops { display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px dashed var(--border-color); padding-top: var(--ia-sp-2, 8px); }
.prd__table { width: 100%; border-collapse: collapse; font-size: var(--ia-fs-body, 12px); }
.prd__table th,
.prd__table td { border-bottom: 1px solid var(--border-color); padding: 5px 8px; text-align: left; vertical-align: top; }
.prd__table th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.prd__task { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.prd__task-id { word-break: break-all; }
.prd__timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.prd__event { display: flex; gap: 10px; font-size: var(--ia-fs-aux, 11px); }
.prd__ts { color: var(--text-muted); min-width: 130px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.prd__kind { min-width: 96px; word-break: break-all; }
.prd__detail { color: var(--text-muted); word-break: break-all; }
/* 状态徽标与列表页同 token（active 绿/paused 黄/completed 灰） */
.prj-badge { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; font-size: var(--ia-fs-aux, 11px); border: 1px solid var(--border-color); white-space: nowrap; }
.prj-badge--active { color: var(--ia-fresh); border-color: var(--ia-fresh); }
.prj-badge--paused { color: var(--ia-stale); border-color: var(--ia-stale); }
.prj-badge--completed { color: var(--text-muted); }
</style>
