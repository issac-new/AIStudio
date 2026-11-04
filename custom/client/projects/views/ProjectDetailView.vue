<!-- overlay/custom/client/projects/views/ProjectDetailView.vue
     项目详情页：route param id → 详情 + 刷新（DirectorRunDetail 骨架：
     useRoute + watch + 返回入口）。四区：统计卡（total/byStatus）/ 未终结
     任务表（id/status/board/title）/ 任务拓扑折叠区（mermaid 品牌 iframe）/
     timeline 倒序列表（时间+kind+detail）。
     操作条同列表页三按钮（共享 useProjectActions 编排）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import { fetchMermaidBrand, fetchProject, fetchProjectGraph, type ProjectDetailData } from '../api/projects'
import {
  TOPOLOGY_PANEL_INITIAL, actionAvailability, distributionRows, formatEpochTime, statusBadgeClass, statusLabel,
  timelineDescending, topologyNeedsLoad, topologyPanelNext, type TopologyPanelState,
} from '../utils'
import { useProjectActions } from '../composables/useProjectActions'
import ProjectCompleteDialog from '../components/ProjectCompleteDialog.vue'
// 品牌 HTML 展示安全形态同 IdeWikiPane：wrapGenUiHtml 注 CSP（无网络/无外链）
// 后 iframe sandbox srcdoc；brandedFrameHeight 从 viewBox 估高。纯函数无副作用。
import { wrapGenUiHtml } from '../../ide/utils/genui'
import { brandedFrameHeight } from '../../ide/utils/mermaid-brand'

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

// --- 任务拓扑折叠区：首展开触发「GET graph?format=mermaid → POST mermaid-brand」 ---
// 状态转移走 utils topologyPanelNext（纯函数，供测试）；折叠不丢已加载内容，
// 再展开不重拉。品牌渲染失败/不支持 → 回退显 mermaid 源文本（内容不丢）。
const topo = ref<TopologyPanelState>({ ...TOPOLOGY_PANEL_INITIAL })

watch(projectId, () => {
  void refresh()
  // 项目切换：拓扑折叠区回到初始（不跨项目沿用旧图）。
  topo.value = { ...TOPOLOGY_PANEL_INITIAL }
})

function toggleTopo(): void {
  topo.value = topologyPanelNext(topo.value, { type: 'toggle' })
  if (topologyNeedsLoad(topo.value)) void loadTopo()
}

async function loadTopo(): Promise<void> {
  if (!projectId.value) return
  topo.value = topologyPanelNext(topo.value, { type: 'load-start' })
  try {
    const source = await fetchProjectGraph(projectId.value, 'mermaid')
    topo.value = topologyPanelNext(topo.value, { type: 'load-start', source })
    try {
      const brand = await fetchMermaidBrand(source, zh.value ? '项目任务拓扑' : 'Project task topology')
      if (brand.ok && brand.html) {
        topo.value = topologyPanelNext(topo.value, {
          type: 'load-ok',
          html: wrapGenUiHtml(brand.html, `topology-${projectId.value}`),
        })
      } else {
        topo.value = topologyPanelNext(topo.value, {
          type: 'load-fallback',
          source,
          note: brand.reason === 'unsupported_kind'
            ? (zh.value ? '品牌渲染暂不支持该图型，回退显示 mermaid 源。' : 'Brand rendering unsupported for this diagram; showing mermaid source.')
            : (zh.value ? '品牌渲染失败，回退显示 mermaid 源。' : 'Brand rendering failed; showing mermaid source.'),
        })
      }
    } catch {
      topo.value = topologyPanelNext(topo.value, {
        type: 'load-fallback',
        source,
        note: zh.value ? '品牌渲染请求失败，回退显示 mermaid 源。' : 'Brand render request failed; showing mermaid source.',
      })
    }
  } catch (e) {
    topo.value = topologyPanelNext(topo.value, {
      type: 'load-error',
      note: e instanceof Error ? e.message : String(e),
    })
  }
}

/** iframe 高度：品牌 HTML 的 viewBox 估算（上限防爆版，同 wiki 形态） */
const topoFrameHeight = computed(() => (topo.value.html ? brandedFrameHeight(topo.value.html) : 240))

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

      <!-- 任务拓扑：折叠区首展开加载；品牌 HTML 经 CSP 加固后 iframe sandbox srcdoc
           展示（同 IdeWikiPane 安全形态），回退态显 mermaid 源文本不丢内容。 -->
      <section class="prd__card" data-testid="project-detail-topo">
        <div class="prd__topo-head">
          <h3 class="prd__h">{{ zh ? '任务拓扑' : 'Task topology' }}</h3>
          <NButton size="tiny" data-testid="project-detail-topo-toggle" @click="toggleTopo">
            {{ topo.open ? (zh ? '收起' : 'Collapse') : (zh ? '展开' : 'Expand') }}
          </NButton>
        </div>
        <template v-if="topo.open">
          <p v-if="topo.status === 'idle' || topo.status === 'loading'" class="prd__muted" data-testid="project-detail-topo-loading">
            {{ zh ? '拓扑加载中…' : 'Loading topology…' }}
          </p>
          <iframe
            v-else-if="topo.status === 'ok'"
            class="prd__topo-frame"
            :style="{ height: `${topoFrameHeight}px` }"
            sandbox="allow-scripts"
            referrerpolicy="no-referrer"
            title="project topology diagram"
            :srcdoc="topo.html ?? ''"
            data-testid="project-detail-topo-frame"
          />
          <div v-else-if="topo.status === 'fallback'" data-testid="project-detail-topo-fallback">
            <p class="prd__muted">{{ topo.note }}</p>
            <pre v-if="topo.source" class="prd__topo-src">{{ topo.source }}</pre>
          </div>
          <p v-else class="prd__error" :title="topo.note" data-testid="project-detail-topo-error">
            {{ zh ? '任务拓扑暂不可用。' : 'Task topology unavailable.' }}
          </p>
        </template>
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
/* 拓扑折叠区：头部按钮行 + 品牌 iframe（宽度自适应、边框同卡片 token）+ 回退源文本 */
.prd__topo-head { display: flex; align-items: center; gap: 8px; }
.prd__topo-head .prd__h { flex: 1; }
.prd__topo-frame { width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-standard); background: var(--bg-page, #fafafa); }
.prd__topo-src { margin: 0; padding: 8px 10px; max-height: 320px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; /* 不引用未定义 var——幽灵变量守门 */ font-size: var(--ia-fs-aux, 11px); border: 1px dashed var(--border-color); border-radius: var(--radius-standard); white-space: pre-wrap; word-break: break-all; }
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
