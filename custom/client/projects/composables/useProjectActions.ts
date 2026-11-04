// overlay/custom/client/projects/composables/useProjectActions.ts
// 暂停/恢复/完成三动作的共享编排（列表页与详情页同款行为）：
//   成功 → toast + 回调刷新；422 → 弹「未终结任务 + 豁免理由」确认框；
//   其余失败（含 409 恢复已完成）→ toast 服务端 error 文案。
// toast 走 naive-ui useMessage（SwarmKanbanView 同款；provider 在上游 App.vue）。
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import {
  completeProject, isProjectActionError, setProjectPaused,
  type ProjectSummary, type UnfinishedTask,
} from '../api/projects'

export interface ProjectActionsTarget {
  /** 操作目标（列表行或详情对象）——只需 id 与状态无关的标识 */
  id: string
}

export function useProjectActions(refresh: () => Promise<unknown>) {
  const message = useMessage()

  /** 操作中项目 id（行级防重复点击） */
  const busyId = ref('')
  /** 完成豁免确认框（422 problems 触发） */
  const confirmTarget = ref<ProjectActionsTarget | null>(null)
  const confirmProblems = ref<UnfinishedTask[]>([])
  const overrideReason = ref('')
  const overrideBusy = ref(false)

  const confirmOpen = computed(() => confirmTarget.value !== null)
  /** 豁免理由必填（空理由不发起 override——服务端契约 reason 是豁免凭据） */
  const overrideReady = computed(() => confirmTarget.value !== null && overrideReason.value.trim().length > 0)

  async function pauseOrResume(target: ProjectActionsTarget, paused: boolean): Promise<void> {
    busyId.value = target.id
    try {
      await setProjectPaused(target.id, paused)
      message.success(paused ? '项目已暂停' : '项目已恢复')
      await refresh()
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      busyId.value = ''
    }
  }

  /** 完成：422 problems → 打开豁免确认框；其余结果按成败 toast */
  async function complete(target: ProjectActionsTarget): Promise<void> {
    busyId.value = target.id
    try {
      await completeProject(target.id)
      message.success('项目已完成')
      await refresh()
    } catch (e) {
      if (isProjectActionError(e) && e.status === 422) {
        confirmTarget.value = target
        confirmProblems.value = e.problems
        overrideReason.value = ''
      } else {
        message.error(e instanceof Error ? e.message : String(e))
      }
    } finally {
      busyId.value = ''
    }
  }

  /** 带豁免理由强制完成（overrideReady 才可触发） */
  async function forceComplete(): Promise<void> {
    const target = confirmTarget.value
    const reason = overrideReason.value.trim()
    if (!target || !reason) return
    overrideBusy.value = true
    try {
      await completeProject(target.id, reason)
      message.success('项目已强制完成')
      closeConfirm()
      await refresh()
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      overrideBusy.value = false
    }
  }

  function closeConfirm(): void {
    confirmTarget.value = null
    confirmProblems.value = []
    overrideReason.value = ''
  }

  return {
    busyId, confirmOpen, confirmTarget, confirmProblems, overrideReason, overrideBusy, overrideReady,
    pauseOrResume, complete, forceComplete, closeConfirm,
  }
}
