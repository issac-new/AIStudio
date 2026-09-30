// overlay/custom/client/ia2/composables/useSharedArm.ts
// v12.1 双视图共享武装（2026-09-19 壳层重排）：页头+注意力条常驻双视图后，
// /app（IaShell）与 /ide（IdeShell）都需要 workspace/runs/loops/cockpit 数据面。
// 引用计数幂等：首个挂载者武装，末个卸载者回收——视图切换不泄漏流/调度器。
// 不含（壳私有，留在 IaShell）：Esc 键（gov/maximize）、standalone 补标、
// merge-back storage 监听（IDE 窗口不得响应，防串台）。
// 2026-09-30 性能批：收编页（IaLegacyShell）也消费本武装，页面跳转会让引用
// 计数归零再回 1——旧实现每次跳转都重拉全量数据面（kanban 族 API 每个要
// 4-6s，实测设置页→模型页墙钟 6s）。末个卸载改为 DISPOSE_GRACE_MS 延迟回收：
// 宽限期内重新挂载即取消回收、免重拉；真正闲置超时才断流。
import { onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { usePlatformsStore } from '../store/platforms'

const SUBSCRIBE_CAP = 30
/** 末个卸载后的武装保留窗口：页面间跳转（收编页/双壳）不重拉数据面 */
export const DISPOSE_GRACE_MS = 10_000

let consumers = 0
let shellDisposed = false
let disposeTimer: ReturnType<typeof setTimeout> | null = null

function armShared(): void {
  const workspace = useWorkspaceStore()
  const runsStore = useRunCenterStore()
  const loopStore = useLoopStore()
  const cockpit = useCockpitStore()
  shellDisposed = false
  workspace.loadTodos()
  workspace.startReminderScheduler()
  workspace.watchKanbanTasks()
  workspace.initFleetStream()
  void workspace.refreshAllBoards()
  void bootShared(runsStore, loopStore)
  void cockpit.bootstrap()
  // R7-C agent 名册数据源：platforms 在线探针（引用计数由 store 自管）
  usePlatformsStore().retain()
}

function disarmShared(): void {
  const workspace = useWorkspaceStore()
  shellDisposed = true
  workspace.unwatchKanbanTasks()
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
  const cockpit = useCockpitStore()
  cockpit.disconnectOnUnmount()
  usePlatformsStore().release()
}

export function useSharedArm(): void {
  onMounted(() => {
    consumers += 1
    // 宽限期内回归：取消挂起的回收，武装与数据保持原样（免重拉）
    if (disposeTimer) {
      clearTimeout(disposeTimer)
      disposeTimer = null
      return
    }
    if (consumers > 1) return
    armShared()
  })

  onUnmounted(() => {
    consumers = Math.max(0, consumers - 1)
    if (consumers > 0) return
    if (disposeTimer) return
    disposeTimer = setTimeout(() => {
      disposeTimer = null
      if (consumers > 0) return
      disarmShared()
    }, DISPOSE_GRACE_MS)
  })
}

async function bootShared(runsStore: ReturnType<typeof useRunCenterStore>, loopStore: ReturnType<typeof useLoopStore>): Promise<void> {
  await runsStore.fetchRuns()
  if (shellDisposed) return
  const awaiting = runsStore.awaitingRuns.map(r => r.runId)
  const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
  runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
}

/** 测试专用：复位模块级引用计数（consumers 跨同文件用例残留会短路武装断言） */
export function __resetSharedArmForTest(): void {
  consumers = 0
  shellDisposed = false
  if (disposeTimer) {
    clearTimeout(disposeTimer)
    disposeTimer = null
  }
}

/** 测试专用：立即执行挂起的宽限回收（免伪时钟；宽限期内应等于真实超时路径） */
export function __flushSharedArmDisposeForTest(): void {
  if (!disposeTimer) return
  clearTimeout(disposeTimer)
  disposeTimer = null
  if (consumers === 0) disarmShared()
}
