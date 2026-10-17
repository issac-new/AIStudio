// overlay/custom/client/ia2/composables/useStageProgress.ts
// 阶段进度共享读面（2026-10-18 左侧栏 + 阶段页页签批）：
// 左侧栏要显示六阶段完成/当前状态，阶段页要显示同一套进度——两处若各拉一次
// run-state，既重复请求又可能显示不同结果。本模块把读取收敛为一份模块级缓存：
// 同一 run 只请求一次（进行中的请求也去重），成功后写 useRunContext 的运行记忆。
// 失败如实保留 error，状态推导返回 pending，不假装完成。
import { computed, ref, watch } from 'vue'
import { authFetch } from '../../ide/utils/auth-fetch'
import { useRunContext } from './useRunContext'
import { SETUP_STEPS, STAGE_META, type SetupStep } from '../stage-meta'

export interface RunStateLike {
  steps: Record<string, string>
  gates: Record<string, string>
  posture?: string
  ledger?: { open: number }
}

export type StageState = 'done' | 'current' | 'pending'
export type SetupStepState = 'done' | 'current' | 'pending' | 'untracked'

const cache = new Map<string, RunStateLike>()
const inflight = new Map<string, Promise<RunStateLike>>()

async function fetchRunState(run: string): Promise<RunStateLike> {
  const cached = cache.get(run)
  if (cached) return cached
  const pending = inflight.get(run)
  if (pending) return pending
  const request = (async () => {
    try {
      const res = await authFetch(`/api/hermes/sim/run-state?run=${encodeURIComponent(run)}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as RunStateLike
      cache.set(run, data)
      return data
    } finally {
      inflight.delete(run)
    }
  })()
  inflight.set(run, request)
  return request
}

/** 测试用：清空模块级缓存（避免 jsdom 同文件跨用例串味） */
export function __resetStageProgressCacheForTest(): void {
  cache.clear()
  inflight.clear()
}

export function useStageProgress() {
  const { run, remember } = useRunContext()
  const state = ref<RunStateLike | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    const name = run.value.trim()
    if (!name) {
      state.value = null
      error.value = ''
      return
    }
    loading.value = true
    error.value = ''
    try {
      const data = await fetchRunState(name)
      state.value = data
      remember()
    } catch (e) {
      // 失败不覆盖上一次成功结果：切换运行失败时保留可读的旧态，错误原文呈现
      error.value = (e as Error).message || '运行状态读取失败'
    } finally {
      loading.value = false
    }
  }

  watch(run, () => { void load() }, { immediate: true })

  const merged = computed<Record<string, string>>(() =>
    state.value ? { ...state.value.steps, ...state.value.gates } : {})

  function stageState(no: 1 | 2 | 3 | 4 | 5 | 6): StageState {
    if (!state.value) return 'pending'
    const meta = STAGE_META[no - 1]
    if (meta.keys.some(k => k in merged.value)) return 'done'
    const first = STAGE_META.find(s => !s.keys.some(k => k in merged.value))
    return first?.no === no ? 'current' : 'pending'
  }

  function stepState(step: SetupStep): SetupStepState {
    if (step.keys.length === 0) return 'untracked'
    if (!state.value) return 'pending'
    if (step.keys.some(k => k in merged.value)) return 'done'
    const first = SETUP_STEPS.find(s => s.keys.length > 0 && !s.keys.some(k => k in merged.value))
    return first?.key === step.key ? 'current' : 'pending'
  }

  return { run, state, loading, error, load, merged, stageState, stepState }
}
