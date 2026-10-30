<script setup lang="ts">
// IdeUnmaterializedView — 未物化任务工作区的只读兜底视图（2026-10-30 run23 复盘续作）。
//
// 问题：`/app/ide?task=<id>` 在任务工作区未物化（目录已回收/未派发/任务号未命中）时，
// 中栏是空白会话、右栏「还没有任务工作区」、简报抽屉自动收起——编码面在产品里
// 是死胡同空态，推演报告只能判 ⬜。
//
// 本视图把设计要求的信息补齐（全部只读，不写后端）：
//   ① 顶部提示行：未物化任务工作区 / 任务不存在或无权 / 解析故障（四态语义见
//      composables/useIdeFallback.ts 与 useIdeWorkspace.ts noWorkspaceHint）；
//   ② 任务简报卡：标题/状态/负责人/RUN 标记/看板入口（数据来自看板详情解析，
//      解析不到时明确显示「任务不存在或无权」并给可点的看板入口）；
//   ③ 文件区：任务目录有文件→任务工作区只读树（/api/hermes/kanban/workspace-files）；
//      目录已回收→回落服务器默认根树（/api/studio/files/list 无 root，普通用户可读；
//      带 root 的请求按既有权限规则要求 super_admin，本视图不越权）。
// 状态为 not_found / resolve_error 时不渲染文件树——解析故障不能装成正常空目录。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FileTree from '@/components/hermes/files/FileTree.vue'
import { useFilesStore } from '@/stores/hermes/files'
import { ideTaskFilesApi, type TaskWorkspaceFileEntry } from '../api/taskWorkspace'
import { noWorkspaceHint, type IdeNoWorkspaceHint } from '../composables/useIdeWorkspace'
import { primaryOwnerOf, runMarkOf, type IdeFallbackKind } from '../composables/useIdeFallback'
import type { BriefingTask } from './briefing-types'
import IdeReadOnlyTree from './IdeReadOnlyTree.vue'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const props = withDefaults(defineProps<{
  state: IdeFallbackKind
  requestedId: string | null
  task: BriefingTask | null
  board: string | null
  workspacePath: string | null
  workspaceError: { status: number } | null
  /** /api/ide/task-workspace 的 materialized（false=目录确定不存在，跳过任务目录探测直出默认根）。 */
  workspaceMaterialized?: boolean | null
  /** 命中方式（按任务号命中时在卡面标注，防读者误以为深链 id 就是卡 id）。 */
  resolvedBy?: 'id' | 'task_number' | null
}>(), {
  // 布尔 prop 缺省会被 Vue 强转成 false——这里显式 null 才能区分「未知」与「已判 false」
  workspaceMaterialized: null,
  resolvedBy: null,
})

const emit = defineEmits<{
  (event: 'open-board'): void
  (event: 'retry'): void
}>()

const { locale } = useI18n()
const loc = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].fallback)
const zh = computed(() => String(locale.value ?? 'zh').startsWith('zh'))

/** 顶部提示行（四态；文本源与 IdeFilesPane 同源 noWorkspaceHint）。 */
const hint = computed<IdeNoWorkspaceHint>(() => {
  const requested = props.requestedId
  if (props.state === 'not_found') {
    return noWorkspaceHint({ taskId: requested, error: { status: 404 } })
  }
  if (props.state === 'resolve_error') {
    const status = props.workspaceError?.status ?? 0
    if (status >= 400) return noWorkspaceHint({ taskId: requested, error: { status } })
    // 非 HTTP 异常（网络/超时，status=0）：说清是解析故障，不冒充「没有文件」
    return { zh: loc.value.resolveErrorNetwork, en: loc.value.resolveErrorNetwork }
  }
  if (props.state === 'unmaterialized') {
    return { zh: loc.value.unmaterializedNotice, en: loc.value.unmaterializedNotice }
  }
  if (props.state === 'resolving') {
    return { zh: loc.value.resolving, en: loc.value.resolving }
  }
  return noWorkspaceHint({ taskId: null })
})
const notice = computed(() => (zh.value ? hint.value.zh : hint.value.en))

const owner = computed(() => primaryOwnerOf(props.task) ?? '—')
const runMark = computed(() => runMarkOf(props.task))
const title = computed(() => props.task?.title ?? loc.value.notFoundTitle)
const showBrief = computed(() => props.state !== 'resolving')
const showTree = computed(() => props.state === 'unmaterialized')
const isMiss = computed(() => props.state === 'not_found')
const showRetry = computed(() => props.state === 'not_found' || props.state === 'resolve_error')

// 文件区：任务工作区有文件→任务树；否则回落服务器默认根树（FileTree 无 root）。
const taskFiles = ref<TaskWorkspaceFileEntry[] | null>(null)
const taskFilesLoading = ref(false)
const taskFilesFailed = ref(false)
const filesStore = useFilesStore()

async function loadTaskFiles(): Promise<void> {
  taskFiles.value = null
  taskFilesFailed.value = false
  if (!showTree.value || !props.task?.id) return
  // 端点已明确 materialized=false（目录不存在）→ 不做任务目录探测：
  // /api/hermes/kanban/workspace-files 冷启会预热 CLI 缓存（实测约 9s），
  // 兜底视图不该为「确定不存在的目录」等这么久；默认根树立即呈现。
  if (props.workspaceMaterialized === false) return
  taskFilesLoading.value = true
  try {
    const res = await ideTaskFilesApi.list(props.task.id, props.board ?? undefined, 2)
    taskFiles.value = res.entries ?? []
  } catch {
    taskFilesFailed.value = true
    taskFiles.value = []
  } finally {
    taskFilesLoading.value = false
  }
}
watch(() => [props.state, props.task?.id, props.board, props.workspaceMaterialized] as const, () => void loadTaskFiles(), { immediate: true })

const hasTaskTree = computed(() => (taskFiles.value?.length ?? 0) > 0)

// 默认根树必须真的走「无 root」：清掉可能残留的工作区偏好根（带 root 的请求
// 按既有权限规则要求 super_admin，普通用户会 403）。任务树分支不碰该状态。
watch([showTree, hasTaskTree], ([tree, hasTask]) => {
  if (tree && !hasTask) filesStore.workspaceRoot = undefined
}, { immediate: true })
</script>

<template>
  <section class="ide-fb" data-testid="ide-fallback-view" :data-state="state">
    <p class="ide-fb__notice" data-testid="ide-fallback-notice">{{ notice }}</p>

    <div v-if="showBrief" class="ide-fb__brief" data-testid="ide-fallback-brief">
      <div class="ide-fb__brief-head">
        <h3 class="ide-fb__title" data-testid="ide-fallback-title">{{ title }}</h3>
        <span v-if="runMark" class="ide-fb__run" data-testid="ide-fallback-run">{{ loc.run }} {{ runMark }}</span>
      </div>
      <dl class="ide-fb__meta">
        <div>
          <dt>{{ loc.id }}</dt>
          <dd class="mono" data-testid="ide-fallback-id">{{ task?.id ?? '—' }}</dd>
        </div>
        <div v-if="requestedId && requestedId !== task?.id">
          <dt>{{ loc.requestedId }}</dt>
          <dd class="mono" data-testid="ide-fallback-requested-id">
            {{ requestedId }}<span v-if="resolvedBy === 'task_number'" class="ide-fb__tag" data-testid="ide-fallback-resolved-by">{{ loc.resolvedByNumber }}</span>
          </dd>
        </div>
        <div>
          <dt>{{ loc.status }}</dt>
          <dd data-testid="ide-fallback-status">{{ task?.status ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ loc.owner }}</dt>
          <dd data-testid="ide-fallback-owner">{{ owner }}</dd>
        </div>
        <div>
          <dt>{{ loc.board }}</dt>
          <dd class="mono" data-testid="ide-fallback-board">{{ board ?? '—' }}</dd>
        </div>
      </dl>
      <p v-if="isMiss" class="ide-fb__hint" data-testid="ide-fallback-miss-hint">{{ loc.notFoundHint }}</p>
      <p v-if="state === 'resolve_error'" class="ide-fb__hint" data-testid="ide-fallback-error-hint">{{ loc.resolveErrorHint }}</p>
      <div class="ide-fb__actions">
        <button type="button" class="ide-fb__btn" data-testid="ide-fallback-open-board" @click="emit('open-board')">{{ loc.openBoard }}</button>
        <button v-if="showRetry" type="button" class="ide-fb__btn" data-testid="ide-fallback-retry" @click="emit('retry')">{{ loc.retry }}</button>
      </div>
    </div>

    <div v-if="showTree" class="ide-fb__files" data-testid="ide-fallback-files">
      <div class="ide-fb__files-head">
        <span class="ide-fb__files-title">{{ loc.filesTitle }}</span>
        <span class="ide-fb__badge">{{ loc.readOnly }}</span>
        <span v-if="taskFilesLoading" class="ide-fb__muted" data-testid="ide-fallback-tree-loading">{{ loc.loadingTree }}</span>
      </div>
      <p v-if="taskFilesFailed" class="ide-fb__muted" data-testid="ide-fallback-task-files-failed">{{ loc.taskFilesFailed }}</p>
      <div v-if="hasTaskTree" class="ide-fb__tree" data-testid="ide-fallback-task-tree">
        <p class="ide-fb__muted">{{ loc.taskTreeLabel }}<span v-if="workspacePath" class="mono">· {{ workspacePath }}</span></p>
        <IdeReadOnlyTree :entries="taskFiles ?? []" />
      </div>
      <div v-else class="ide-fb__tree" data-testid="ide-fallback-default-tree">
        <p class="ide-fb__muted">{{ loc.defaultTreeLabel }}</p>
        <p v-if="workspacePath" class="ide-fb__muted" data-testid="ide-fallback-missing-note">{{ loc.taskWorkspaceMissing }}<span class="mono">· {{ workspacePath }}</span></p>
        <FileTree :profile="null" show-files />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.ide-fb {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px;
  overflow-y: auto;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.ide-fb__notice {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 45%, var(--border-color));
  border-left-width: 4px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-card));
  font-size: 13px;
  font-weight: 600;
}
.ide-fb__brief {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  padding: 12px 14px;
}
.ide-fb__brief-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.ide-fb__title { margin: 0; font-size: 15px; line-height: 1.4; }
.ide-fb__run {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--accent-primary);
}
.ide-fb__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 6px 16px;
  margin: 10px 0 0;
  font-size: 12px;
}
.ide-fb__meta div { display: flex; gap: 6px; min-width: 0; }
.ide-fb__meta dt { color: var(--text-muted); flex-shrink: 0; }
.ide-fb__meta dd { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-fb__hint { margin: 10px 0 0; font-size: 12px; color: var(--text-muted); }
.ide-fb__actions { display: flex; gap: 8px; margin-top: 12px; }
.ide-fb__btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}
.ide-fb__btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.ide-fb__files {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: hidden;
}
.ide-fb__files-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  font-weight: 600;
}
.ide-fb__badge {
  font-size: 10px;
  font-weight: 500;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}
.ide-fb__tree { flex: 1; min-height: 0; overflow: auto; padding: 8px 12px; }
.ide-fb__muted { margin: 0 0 6px; font-size: 12px; color: var(--text-muted); }
.ide-fb__tag {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--accent-primary);
  font-size: 10px;
  font-family: var(--font-sans, inherit);
}
.mono { font-family: var(--font-mono, monospace); }
</style>
