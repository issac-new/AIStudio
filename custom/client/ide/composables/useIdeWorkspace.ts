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
