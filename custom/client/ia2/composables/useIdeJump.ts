// overlay/custom/client/ia2/composables/useIdeJump.ts
// v12.3 R4 编码动线单一实现（自 WorkbenchView 零散 router.push 收编）：
// 三处消费——工作台右栏/会话面板 ⌨、左栏行双击、任务簇 chip 双击。
// A9 升级（2026-09-29）：任务存在 ide-linkage 富绑定（bindSession 记录的
// acpSessionId）时一并携带 session 深链，IDE 侧直切绑定的 agent 会话
// （消费端 = IdeShell ?session= watch，A4 同轮落地）。调用方无感。
import { useRouter } from 'vue-router'
import { useIdeLinkageStore } from '@/custom/matrix-teams/stores/ide-linkage'

export function useIdeJump() {
  const router = useRouter()

  /** 跳 IDE 工作台（携带挂接任务进任务维度；无任务裸进；有会话绑定带 session） */
  function jumpIde(taskId?: string | null): void {
    let session: string | null = null
    if (taskId) {
      try {
        session = useIdeLinkageStore().bindingOf(taskId)?.acpSessionId ?? null
      } catch { /* pinia 未激活等场景裸跳 */ }
    }
    void router.push({
      name: 'ide.shell',
      query: taskId ? (session ? { task: taskId, session } : { task: taskId }) : undefined,
    })
  }

  return { jumpIde }
}
