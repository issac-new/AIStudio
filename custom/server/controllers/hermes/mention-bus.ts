/**
 * IDE @mention 总线服务端接线（custom 装配，multica comment.go:3100 语义）。
 * kanban addComment 入库后调用：解析 @mention → 为 agent enqueue run（hermes CLI），
 * 分发决策留痕（系统行评论：为何触发/为何不跑，全程可审计）。
 * custom 不 import upstream（symlink 真实路径陷阱），依赖全部注入。
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { dispatchMention, type MentionBusDeps } from '../../loop/engine/mention-bus'

const execFileAsync = promisify(execFile)

export interface MentionBusRuntimeDeps {
  isKnownAgent: (name: string) => boolean
  isRuntimeHealthy: () => boolean
  /** 落系统行评论（multica 留痕；taskId 为目标任务，body 为「为何触发/为何不跑」） */
  appendSystemComment: (taskId: string, body: string) => Promise<void>
  /** R6 squad leader 协调（可选注入；@squad 时走 leader 选人+委托+评估） */
  coordinateSquad?: (task: string) => Promise<{ action: 'action' | 'no_action' | 'failed'; reasoning: string }>
}

async function enqueueAgentRunViaHermes(agentName: string, prompt: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('hermes', ['--prompt', prompt, '--agent', agentName, '--output-format', 'json'], { timeout: 120_000 })
    const m = stdout.match(/"run_id"\s*:\s*"([^"]+)"/) ?? stdout.match(/"id"\s*:\s*"([^"]+)"/)
    return m ? m[1] : `hermes-${Date.now().toString(36)}`
  } catch {
    return null
  }
}

/** addComment 入库后调用：解析+分发+留痕（任何失败静默不阻断评论入库） */
export async function runMentionBus(taskId: string, commentBody: string, deps: MentionBusRuntimeDeps): Promise<void> {
  try {
    const busDeps: MentionBusDeps = {
      isKnownAgent: deps.isKnownAgent,
      isRuntimeHealthy: deps.isRuntimeHealthy,
      enqueueAgentRun: enqueueAgentRunViaHermes,
      coordinateSquad: deps.coordinateSquad,
    }
    const result = await dispatchMention(taskId, commentBody, busDeps)
    // 留痕：无论触发与否都落系统行（multica reason code 语义，全程可审计）
    if (result.triggered || result.reason.code !== 'self_trigger_suppressed') {
      await deps.appendSystemComment(taskId, `[mention-bus] ${result.action} (reason: ${result.reason.code})`)
    }
  } catch {
    // mention-bus 失败不影响评论入库（best-effort 总线）
  }
}
