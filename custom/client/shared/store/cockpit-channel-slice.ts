// 文件职责：cockpit 频道切片（选中频道/三通道发送/消息投影/离壳回收）。
// 拆分纪律：纯移动，无行为变更；store 实例与 refs 以依赖注入传入。
import { computed } from 'vue'
import type { Ref } from 'vue'
import type { ChatMessage } from '@/custom/shared/adapters/chat-adapter'
import type { CollabChannel, WorkspaceMode } from './cockpit'

export interface ChannelSliceDeps {
  activeChannelId: Ref<string | null>
  workspaceMode: Ref<WorkspaceMode>
  getActiveChannel: () => CollabChannel | null
  chatStore: { sendMessage: (text: string) => Promise<unknown>; messages?: unknown[] }
  groupStore: { sendMessage: (text: string) => Promise<unknown>; disconnect?: () => void; sortedMessages?: unknown[] }
  matrixComposer: { sendMessage: (text: string) => Promise<unknown> }
  kanban: { stopEventStream?: () => void }
  stopFleetStream: () => void
  stopMcpHealthPoll: () => void
  resetBootstrapped: () => void
}

export function createCockpitChannelSlice(deps: ChannelSliceDeps) {
  const { activeChannelId, workspaceMode, getActiveChannel, chatStore, groupStore, matrixComposer, kanban, stopFleetStream, stopMcpHealthPoll, resetBootstrapped } = deps
  // ── 频道（选中频道时切换到 chat 工作区）──
  function selectChannel(id: string | null) {
    activeChannelId.value = id
    if (id) workspaceMode.value = 'chat' as WorkspaceMode
  }
  async function sendMessage(text: string): Promise<void> {
    const ch = getActiveChannel()
    if (!ch || !text.trim()) return
    switch (ch.kind) {
      case 'matrix': await matrixComposer.sendMessage(text); break
      case 'chat': await chatStore.sendMessage(text); break
      case 'group': await groupStore.sendMessage(text); break
    }
  }
  const messagesForActiveChannel = computed<ChatMessage[]>(() => {
    const ch = getActiveChannel()
    if (!ch) return []
    switch (ch.kind) {
      case 'matrix': return [] // matrix 消息归一需 currentUserId，由组件层注入 adapter 调用
      case 'chat': return (chatStore as any).messages?.map?.((m: any) => ({
        id: m.id, channelId: ch.id, author: m.role === 'user' ? '你' : m.role,
        isMe: m.role === 'user', text: m.content, ts: m.timestamp,
      })) ?? []
      case 'group': return (groupStore as any).sortedMessages?.map?.((m: any) => ({
        id: m.id, channelId: ch.id, author: m.senderName || m.senderId,
        isMe: false, text: m.content, ts: m.timestamp,
      })) ?? []
    }
    return []
  })
  function disconnectOnUnmount() {
    try { groupStore.disconnect?.() } catch { /* ignore */ }
    stopFleetStream()
    stopMcpHealthPoll()
    // bootstrap 武装的 kanban 单板事件流随壳回收（Task 5）：此前只启不停，
    // 离壳后 WS 与重连退避定时器整会话泄漏（看板视图自启的流由其 onUnmounted 自停）
    kanban.stopEventStream?.()
    resetBootstrapped() // 复位幂等守卫：再次进入 /app 时允许重新 bootstrap
  }

  return {
    selectChannel, sendMessage, messagesForActiveChannel, disconnectOnUnmount,
  }
}
