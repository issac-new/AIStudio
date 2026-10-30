// overlay/custom/client/ide/composables/useIdeWorkspace.ts
// IDE 工作区根单一事实源。
//
// 优先级（2026-10-18 深度重构 D2）：
//   1. materialized 任务根（并行轮 patch 658 的 ide.taskWorkspace.path）
//   2. 活动会话 workspace
//   3. ide.workspace 用户偏好
// 文件、Git、终端、Wiki、Worktree、队列、回滚、侧问、自检都只读这里，避免
// 同一界面不同面板指向不同仓库。
import { computed, ref } from 'vue'
import { useIdeStore } from '../store/ide'
import { useChatStore } from '@/stores/hermes/chat'
import { authFetch } from '../utils/auth-fetch'

export type IdeWorkspaceSource = 'task' | 'session' | 'preference' | 'none'

export interface IdeWorkspacePickInput {
  taskPath?: string | null
  taskMaterialized?: boolean
  sessionPath?: string | null
  preference?: string | null
  /** 偏好来源：user/worktree 显式设置的根优先于任务/会话 */
  preferenceOrigin?: 'default' | 'user' | 'task'
}

export interface IdeWorkspacePick {
  path: string | null
  source: IdeWorkspaceSource
}

/** 纯函数：按优先级选根（测试与 UI 同源） */
export function pickWorkspaceRoot(input: IdeWorkspacePickInput): IdeWorkspacePick {
  const preference = input.preference?.trim() || null
  // 用户手动选择或 worktree 建出的隔离根，意图明确，压过任务/会话自动根
  if (preference && input.preferenceOrigin === 'user') return { path: preference, source: 'preference' }
  const task = input.taskMaterialized && input.taskPath?.trim() ? input.taskPath.trim() : null
  if (task) return { path: task, source: 'task' }
  const session = input.sessionPath?.trim()
  if (session) return { path: session, source: 'session' }
  if (preference) return { path: preference, source: 'preference' }
  return { path: null, source: 'none' }
}

export type IdeWorkspaceValidationStatus = 'idle' | 'checking' | 'ok' | 'invalid'

export interface IdeWorkspaceValidation {
  path: string | null
  status: IdeWorkspaceValidationStatus
  message?: string
}

/** 空工作区提示（双语；组件按 locale 取一侧）。 */
export interface IdeNoWorkspaceHint {
  zh: string
  en: string
}

export interface IdeNoWorkspaceInput {
  /** 深链 ?task= 绑定的任务 id（null=没有显式任务）。 */
  taskId: string | null
  /** 任务 workspace 解析失败原因（status=0 表示非 HTTP 异常）。 */
  error?: { status: number } | null
  /** 解析成功的关联态（materialized=false 表示任务在但工作区未物化）。 */
  taskWorkspace?: { materialized: boolean } | null
}

const GENERIC_NO_WORKSPACE: IdeNoWorkspaceHint = {
  zh: '还没有任务工作区——从左侧任务或看板选一张卡带入',
  en: 'No task workspace yet — pick a task from the sidebar or board',
}

/**
 * 空工作区文案（纯函数，2026-10-30 run23 复盘 · 产品承载面诊断）。
 *
 * 背景：深链 ?task=<id> 未命中时，旧文案与「任务存在但未物化」完全相同——采集帧看起来
 * 就是一块空白，报告只能判「渲染空白」却说不清是页面没做还是参数失效。四种状态分开说：
 * 404=任务不存在/无权访问；≥500=解析服务故障；materialized=false=任务在但未物化；其余=无任务。
 */
export function noWorkspaceHint(input: IdeNoWorkspaceInput): IdeNoWorkspaceHint {
  const id = input.taskId
  if (!id) return GENERIC_NO_WORKSPACE
  const status = input.error?.status ?? 0
  if (status === 404) {
    return {
      zh: `任务 ${id} 不存在或当前账号无权访问（深链 ?task= 未命中）；从左侧任务或看板重选一张卡`,
      en: `Task ${id} not found or not accessible (deep link ?task= missed); pick another task from the sidebar or board`,
    }
  }
  if (status >= 500) {
    return {
      zh: `任务 ${id} 的工作区解析失败（HTTP ${status}）；稍后重试`,
      en: `Failed to resolve workspace for task ${id} (HTTP ${status}); retry later`,
    }
  }
  if (input.taskWorkspace && input.taskWorkspace.materialized === false) {
    return {
      zh: `任务 ${id} 暂无物化工作区（未派发或已回收）；文件树随工作区就绪后出现`,
      en: `Task ${id} has no materialized workspace yet (not dispatched or reclaimed)`,
    }
  }
  return GENERIC_NO_WORKSPACE
}

// 模块级缓存：所有 useIdeWorkspace 实例共享同一次根校验，避免文件树/Git/自检
// 各打一次 400。
const validation = ref<IdeWorkspaceValidation>({ path: null, status: 'idle' })
let validationSeq = 0

export function useIdeWorkspace() {
  const ide = useIdeStore()
  const chat = useChatStore()

  const pick = computed<IdeWorkspacePick>(() => pickWorkspaceRoot({
    taskPath: ide.taskWorkspace?.path ?? null,
    taskMaterialized: Boolean(ide.taskWorkspace?.materialized),
    sessionPath: (chat.activeSession?.workspace as string | undefined) ?? null,
    preference: ide.workspace,
    preferenceOrigin: ide.workspaceOrigin,
  }))
  const root = computed(() => pick.value.path)
  const source = computed(() => pick.value.source)
  const currentValidation = computed(() =>
    validation.value.path === root.value ? validation.value : { path: root.value, status: 'idle' as const })

  async function validate(): Promise<boolean> {
    const path = root.value
    if (!path) {
      validation.value = { path: null, status: 'ok' }
      return true
    }
    if (validation.value.path === path && (validation.value.status === 'ok' || validation.value.status === 'invalid')) {
      return validation.value.status === 'ok'
    }
    const seq = ++validationSeq
    validation.value = { path, status: 'checking' }
    try {
      const res = await authFetch(`/api/studio/files/list?root=${encodeURIComponent(path)}`)
      if (seq !== validationSeq) return validation.value.status === 'ok'
      if (res.ok) {
        validation.value = { path, status: 'ok' }
        return true
      }
      const body = await res.json().catch(() => ({})) as { error?: string; detail?: string }
      validation.value = {
        path,
        status: 'invalid',
        message: body.detail || body.error || `HTTP ${res.status}`,
      }
      return false
    } catch (err) {
      if (seq !== validationSeq) return validation.value.status === 'ok'
      validation.value = {
        path,
        status: 'invalid',
        message: err instanceof Error ? err.message : String(err),
      }
      return false
    }
  }

  function invalidate(): void {
    validation.value = { path: null, status: 'idle' }
  }

  return { root, source, pick, validation: currentValidation, validate, invalidate }
}
