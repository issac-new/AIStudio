// overlay/shelldetach 域：shell 任务 detach（kimi §五 C 表 P2 吸收，矩阵 §3.3 P2）。
//
// kimi 语义（Ctrl-B detach：正在跑的 shell detach 为后台任务）：前台长任务占着
// 输入框——**detach 转换**：前台 shell 转后台（继续跑但输入框腾出）。衔接 hermes
// terminal background 语义（process_manage）：本层=转换判定纯函数（可 detach 条件/
// 转换结果）。
export interface ShellTaskFacts {
  taskId: string
  /** 是否前台（占输入框）。 */
  foreground: boolean
  /** 是否已结束。 */
  finished: boolean
  /** 是否交互式 PTY（detach 要求非交互或 pty 后台化支持）。 */
  interactivePty: boolean
}

export type DetachVerdict = 'detached' | 'refused'

export interface DetachDecision {
  verdict: DetachVerdict
  /** detach 后的后台 taskId（refused=undefined）。 */
  backgroundTaskId?: string
  reason: string
}

/** detach 判定（kimi 语义：前台且未结束才可 detach；已完成/已后台拒）。 */
export function detachShell(facts: ShellTaskFacts): DetachDecision {
  if (facts.finished) {
    return { verdict: 'refused', reason: '任务已结束——无可 detach' }
  }
  if (!facts.foreground) {
    return { verdict: 'refused', reason: '已在后台——无需 detach' }
  }
  return {
    verdict: 'detached',
    backgroundTaskId: `bg-${facts.taskId}`,
    reason: facts.interactivePty
      ? '已转后台（交互 PTY——用 process write/submit 继续驱动）'
      : '已转后台（task 继续跑，输入框腾出）',
  }
}
