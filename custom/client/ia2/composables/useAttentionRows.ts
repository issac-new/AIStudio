// overlay/custom/client/ia2/composables/useAttentionRows.ts
// 注意力行单一装配（2026-10-03 UX 复盘裁决 B）：注意力条（IaGlobalTop）与右栏「需关注」
// （WorkbenchView）此前各有一套装配（mergeAttention vs buildAttention），口径分裂、
// 同屏计数打架。统一为本组合式：blocked 任务 + blocked 循环 + 等我（useSitCounts）
// + 会话受阻/失败（abortStates 投影）四源 → mergeAttention 归并，行带 kind 供分派。
import { computed } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useChatStore } from '@/stores/hermes/chat'
import { useSitCounts } from './useSitCounts'
import { mergeAttention, type AttentionRow, type AttentionInput } from '../adapters/overview'

export function useAttentionRows() {
  const workspace = useWorkspaceStore()
  const runsStore = useRunCenterStore()
  const chatStore = useChatStore()
  const { waitItems, loopRows } = useSitCounts()
  void runsStore

  // R7-B 开发产出回喂：ide 会话失败/受阻 → 注意力输入（abortStates 投影，非响应式字段
  // 靠引用比较间接刷新——与原 WorkbenchView 实装一致）
  const sessionAttention = computed(() => {
    const out: Array<{ id: string; title: string; failed?: boolean; blocked?: boolean; updatedAt: number }> = []
    for (const s of chatStore.sessions ?? []) {
      const abort = (chatStore as unknown as { abortStates?: Map<string, { error?: string; timedOut?: boolean; aborting?: boolean }> }).abortStates?.get(s.id)
      if (abort?.error || abort?.timedOut) {
        out.push({ id: s.id, title: s.title, failed: true, updatedAt: s.updatedAt ?? Date.now() })
      } else if (abort?.aborting && !abort.error) {
        out.push({ id: s.id, title: s.title, blocked: true, updatedAt: s.updatedAt ?? Date.now() })
      }
    }
    return out
  })

  /** 四源归并的注意力行（注意力条与右栏需关注共用，计数同源同口径） */
  const attentionRows = computed<AttentionRow[]>(() => {
    const inputs: AttentionInput[] = []
    for (const t of workspace.tasks) {
      if (t.status === 'blocked') inputs.push({ id: t.id, title: t.title, status: 'blocked', createdAt: t.createdAt, kind: 'task' })
    }
    for (const l of loopRows.value) {
      if (l.blocked) inputs.push({ id: `loop:${l.id}`, title: l.name, status: 'blocked', priority: 2, kind: 'loop' })
    }
    for (const w of waitItems.value) {
      const kind: AttentionInput['kind'] = w.id.startsWith('task:') ? 'task' : w.id.startsWith('run:') ? 'run' : w.id.startsWith('fleet:') ? 'fleet' : 'task'
      inputs.push({ id: w.id, title: w.title, status: w.kind === 'task-review' ? 'review' : 'triage', priority: 1, createdAt: w.ts, kind })
    }
    for (const s of sessionAttention.value) {
      inputs.push({ id: s.id, title: s.title, status: s.blocked ? 'blocked' : 'review', createdAt: s.updatedAt, kind: 'session' })
    }
    return mergeAttention(inputs)
  })

  return { attentionRows, sessionAttention }
}
