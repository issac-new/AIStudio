// overlay/custom/client/ia2/composables/useIdeJump.ts
// v12.3 R4 编码动线单一实现（自 WorkbenchView 零散 router.push 收编）：
// 三处消费——工作台右栏/会话面板 ⌨、左栏行双击、任务簇 chip 双击。
// 现状经 query.task 深链（IdeShell 侧落任务维度）；富绑定
// （matrix-teams ide-linkage TaskBinding：acpSessionId/caseId/roomId/docRefs）
// 待 IDE 侧协议支持后在本函数内升级，调用方无感。
import { useRouter } from 'vue-router'

export function useIdeJump() {
  const router = useRouter()

  /** 跳 IDE 工作台（携带挂接任务进任务维度；无任务裸进） */
  function jumpIde(taskId?: string | null): void {
    void router.push({ name: 'ide.shell', query: taskId ? { task: taskId } : undefined })
  }

  return { jumpIde }
}
