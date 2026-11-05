// 文件职责：cockpit 注意力联动与沙箱终端切片。
// 拆分纪律：纯移动，无行为变更；refs 与跨切片函数以依赖注入传入。
import { ref, type Ref } from 'vue'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'
import type { TerminalLine, WorkspaceMode } from './cockpit'

export interface AttentionTerminalDeps {
  attentionTaskIds: Ref<string[]>
  selectTask: (id: string) => Promise<void>
  setWorkspaceMode: (mode: WorkspaceMode) => void
  detailCache: Ref<Record<string, KanbanTaskDetail>>
  terminalMode: Ref<boolean>
  workspaceMode: Ref<WorkspaceMode>
  terminalLines: Ref<TerminalLine[]>
}

export function createCockpitAttentionTerminalSlice(deps: AttentionTerminalDeps) {
  const { attentionTaskIds: _attentionTaskIds, selectTask, setWorkspaceMode, detailCache: _detailCache, terminalMode, workspaceMode, terminalLines } = deps
  // ── 联动：注意力/时序 ──
  const _attentionFocusTitle = ref<string | null>(null)
  const _attentionFocusDesc = ref<string | null>(null)
  async function focusOnTaskFromAttention(taskId: string, title?: string, desc?: string) {
    // 同一任务再次点击 → 切换（清除筛选）
    if (_attentionTaskIds.value.length === 1 && _attentionTaskIds.value[0] === taskId) {
      _attentionTaskIds.value = []
      return
    }
    // 保持原有行为
    await selectTask(taskId)
    setWorkspaceMode('work')
    _attentionFocusTitle.value = title ?? null
    _attentionFocusDesc.value = desc ?? null
    // 计算关联任务 ID：本身 + parents + children
    const related = new Set<string>([taskId])
    const detail = _detailCache.value[taskId]
    if (detail) {
      for (const p of detail.parents ?? []) related.add(p)
      for (const c of detail.children ?? []) related.add(c)
    }
    _attentionTaskIds.value = [...related]
  }
  function focusOnTimelineNode(_eventId: string) {
    setWorkspaceMode('work')
  }

  // ── 终端 ──
  function enterTerminal() { terminalMode.value = true; workspaceMode.value = 'term' }
  function exitTerminal() { terminalMode.value = false; workspaceMode.value = 'work' }
  function sendTerminalCommand(cmd: string) {
    const c = cmd.trim()
    if (!c) return
    terminalLines.value.push({ kind: 'prompt', text: c })
    terminalLines.value.push({ kind: 'info', text: `ℹ sandbox 内执行：${c}` })
  }

  return {
    _attentionFocusTitle, _attentionFocusDesc, focusOnTaskFromAttention, focusOnTimelineNode,
    enterTerminal, exitTerminal, sendTerminalCommand,
  }
}
