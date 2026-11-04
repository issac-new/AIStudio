<!-- overlay/custom/client/projects/views/ProjectsView.vue
     项目列表页：表格（项目 id/状态徽标/任务分布/操作）+ 完成豁免确认框。
     消费 /api/projectworkflow/projects；行内操作走 pause/resume/complete
     （共享编排 composables/useProjectActions）。挂在 IaShell 专题壳内
     （ProjectShellView 包装，IaFeatureShell 先例），左侧常用组「项目」入口同源。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import { fetchProjects, type ProjectSummary } from '../api/projects'
import {
  actionAvailability, distributionSegments, statusBadgeClass, statusLabel,
} from '../utils'
import { useProjectActions } from '../composables/useProjectActions'
import ProjectCompleteDialog from '../components/ProjectCompleteDialog.vue'

const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const locale = computed<'zh' | 'en'>(() => (zh.value ? 'zh' : 'en'))

const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const loadError = ref('')

async function refresh(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    projects.value = await fetchProjects()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => { void refresh() })

const actions = useProjectActions(refresh)

function openDetail(id: string): void {
  void router.push({ name: 'projectDetail', params: { id } })
}

/** 行操作可用性（纯函数矩阵；busy 行叠加禁用防重复点击） */
function rowActions(p: ProjectSummary): { pause: boolean; resume: boolean; complete: boolean } {
  const avail = actionAvailability(p.status)
  const busy = actions.busyId.value === p.id
  return {
    pause: avail.pause && !busy,
    resume: avail.resume && !busy,
    complete: avail.complete && !busy,
  }
}
</script>

<template>
  <div class="prj" data-testid="projects-page">
    <header class="prj__head">
      <h2 class="prj__title">{{ zh ? '项目' : 'Projects' }}</h2>
      <div class="prj__actions">
        <NButton size="small" :loading="loading" data-testid="projects-refresh" @click="refresh">
          {{ zh ? '刷新' : 'Refresh' }}
        </NButton>
      </div>
    </header>

    <p v-if="loadError" class="prj__error" data-testid="projects-error" :title="loadError">
      {{ zh ? '项目列表暂不可用。' : 'Project list unavailable.' }}
    </p>

    <p v-else-if="!loading && !projects.length" class="prj__empty" data-testid="projects-empty">
      {{ zh ? '还没有项目。' : 'No projects yet.' }}
    </p>

    <div v-else class="prj__card" data-testid="projects-table">
      <table class="prj__table">
        <thead>
          <tr>
            <th>{{ zh ? '项目' : 'Project' }}</th>
            <th>{{ zh ? '状态' : 'Status' }}</th>
            <th>{{ zh ? '任务分布' : 'Task distribution' }}</th>
            <th>{{ zh ? '操作' : 'Actions' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in projects" :key="p.id" :data-testid="`projects-row-${p.id}`">
            <td>
              <button
                type="button"
                class="prj__id-link"
                :data-testid="`projects-open-${p.id}`"
                :title="p.id"
                @click="openDetail(p.id)"
              >{{ p.id }}</button>
            </td>
            <td>
              <span class="prj-badge" :class="statusBadgeClass(p.status)" :data-testid="`projects-status-${p.id}`">
                {{ statusLabel(p.status, locale) }}
              </span>
            </td>
            <td>
              <div class="prj__dist" :data-testid="`projects-dist-${p.id}`">
                <span class="prj__dist-total">{{ p.taskStats.total }}</span>
                <span
                  v-for="seg in distributionSegments(p.taskStats)"
                  :key="seg.status"
                  class="prj__dist-item"
                >{{ seg.status }} {{ seg.count }}</span>
              </div>
            </td>
            <td>
              <div class="prj__row-actions">
                <NButton
                  size="tiny"
                  :disabled="!rowActions(p).pause"
                  :data-testid="`projects-pause-${p.id}`"
                  @click="actions.pauseOrResume(p, true)"
                >{{ zh ? '暂停' : 'Pause' }}</NButton>
                <NButton
                  size="tiny"
                  :disabled="!rowActions(p).resume"
                  :data-testid="`projects-resume-${p.id}`"
                  @click="actions.pauseOrResume(p, false)"
                >{{ zh ? '恢复' : 'Resume' }}</NButton>
                <NButton
                  size="tiny"
                  :disabled="!rowActions(p).complete"
                  :data-testid="`projects-complete-${p.id}`"
                  @click="actions.complete(p)"
                >{{ zh ? '完成' : 'Complete' }}</NButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

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
.prj { display: flex; flex-direction: column; gap: var(--ia-sp-3, 12px); padding: 14px 16px; }
.prj__head { display: flex; align-items: center; gap: var(--ia-sp-3, 12px); }
.prj__title { margin: 0; font-size: var(--ia-fs-page, 15px); }
.prj__actions { margin-left: auto; display: flex; gap: 6px; }
.prj__error { margin: 0; color: var(--ia-fail); font-size: var(--ia-fs-body, 12px); }
.prj__empty { margin: 0; font-size: var(--ia-fs-body, 12px); color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; }
.prj__card { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; overflow-x: auto; }
.prj__table { width: 100%; border-collapse: collapse; font-size: var(--ia-fs-body, 12px); }
.prj__table th,
.prj__table td { border-bottom: 1px solid var(--border-color); padding: 6px 10px; text-align: left; vertical-align: middle; }
.prj__table th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.prj__id-link { border: none; background: none; padding: 0; font: inherit; color: var(--accent-primary); cursor: pointer; word-break: break-all; text-align: left; }
.prj__id-link:hover { text-decoration: underline; }
/* 状态徽标：active 绿（--ia-fresh）/ paused 黄（--ia-stale）/ completed 灰（中性 muted 边框），深色主题由 ia2.scss 覆写值自动兼容 */
.prj-badge { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; font-size: var(--ia-fs-aux, 11px); border: 1px solid var(--border-color); white-space: nowrap; }
.prj-badge--active { color: var(--ia-fresh); border-color: var(--ia-fresh); }
.prj-badge--paused { color: var(--ia-stale); border-color: var(--ia-stale); }
.prj-badge--completed { color: var(--text-muted); }
.prj__dist { display: flex; align-items: center; gap: var(--ia-sp-2, 8px); flex-wrap: wrap; }
.prj__dist-total { font-variant-numeric: tabular-nums; font-weight: 600; }
.prj__dist-item { color: var(--text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.prj__row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
