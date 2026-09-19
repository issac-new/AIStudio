// overlay/custom/client/ia2/composables/useSharedArm.ts
// v12.1 双视图共享武装（2026-09-19 壳层重排）：页头+注意力条常驻双视图后，
// /app（IaShell）与 /ide（IdeShell）都需要 workspace/runs/loops/cockpit 数据面。
// 引用计数幂等：首个挂载者武装，末个卸载者回收——视图切换不泄漏流/调度器。
// 不含（壳私有，留在 IaShell）：Esc 键（gov/maximize）、standalone 补标、
// merge-back storage 监听（IDE 窗口不得响应，防串台）。
import { onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const SUBSCRIBE_CAP = 30

let consumers = 0
let shellDisposed = false

export function useSharedArm(): void {
  const workspace = useWorkspaceStore()
  const runsStore = useRunCenterStore()
  const loopStore = useLoopStore()
  const cockpit = useCockpitStore()

  onMounted(() => {
    consumers += 1
    if (consumers > 1) return
    shellDisposed = false
    workspace.loadTodos()
    workspace.startReminderScheduler()
    workspace.watchKanbanTasks()
    workspace.initFleetStream()
    void workspace.refreshAllBoards()
    void bootShared()
    void cockpit.bootstrap()
  })

  onUnmounted(() => {
    consumers = Math.max(0, consumers - 1)
    if (consumers > 0) return
    shellDisposed = true
    workspace.unwatchKanbanTasks()
    workspace.stopFleetStream()
    workspace.stopReminderScheduler()
    cockpit.disconnectOnUnmount()
  })

  async function bootShared(): Promise<void> {
    await runsStore.fetchRuns()
    if (shellDisposed) return
    const awaiting = runsStore.awaitingRuns.map(r => r.runId)
    const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
    runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
    void runsStore.fetchMetrics()
    void loopStore.fetchLoops()
  }
}

/** 测试专用：复位模块级引用计数（consumers 跨同文件用例残留会短路武装断言） */
export function __resetSharedArmForTest(): void {
  consumers = 0
  shellDisposed = false
}
