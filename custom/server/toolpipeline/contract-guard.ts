// overlay/toolpipeline 域：契约执法钩子（2026-11-04 W1 执法轮）。
//
// 来源：vivo《面向技术产品经理的 Agent Harness 设计》04/05 节——「Prompt 可以
// 被误解，Schema 和 Policy 必须能够在执行前强制生效」。2026-10-21 轮落地的
// ToolParamSchema 停在声明（validateToolCallArgs 全仓零生产调用）；本钩子把它
// 接进 patch 565 执行瀑布：声明了 inputSchema 的工具，入参违规即拒绝执行，
// 错误体为机器可读信封（code=INPUT_SCHEMA_INVALID + issues 明细）——模型可
// 据此修正参数重调，审计可按 code 聚合。
//
// 失败传播语义（与 auditHook 的 fail-open 契约区分开）：
//   - 入参违规（契约已声明 schema）→ fail-closed：拒绝执行。
//   - 幂等回放（契约显式 replay:'return' 且账上有缓存）→ 拒绝重复执行并回放
//     首次结果（瀑布 pre 只能拒绝，ok:true 替换需执行器改造——见 spec 未做项）。
//   - 契约未声明 / 校验器自身异常 → 放行（fail-soft：执法器故障不拦业务）。
//   - 出参 strict 档改写在 postExecute：违反 outputSchema 的结果改写为错误信封。
import {
  computeIdempotencyKey,
  redactSensitive,
  resolveToolContract,
  validateAgainstSchema,
  type ToolContract,
} from '../toolcontract/contract'
import {
  outputSchemaViolationEnvelope,
  schemaRejectionEnvelope,
} from '../toolcontract/error-envelope'
import { IdempotencyStore } from '../toolcontract/idempotency-store'
import { getToolCallCorrelation } from './call-correlation'

interface PreExecuteVerdict {
  allow: false
  error: string
}

/** AgentToolResult 最小面（改写结果用；完整类型在 ekko 上游）。 */
interface ToolResultLike {
  ok: boolean
  content: string
  data?: unknown
  error?: string
}

/** 执行身份最小面（与 tool-hooks 的 AuditContext 字段子集对齐）。 */
interface HookIdentity {
  userId?: string
  sessionId?: string
  profileId?: string
  runId?: string
}

/**
 * 契约幂等键的唯一派生点（W1）：tool-hooks（写入 complete）与本钩子
 * （读取 peek）必须同键——键料分头算必然漂移，故收敛到这一处。
 * 关联上下文（taskId/stepId）入料，同一业务动作跨窗口折叠为同一键。
 */
export function contractIdempotencyKey(
  name: string,
  input: Record<string, unknown>,
  contract: ToolContract,
  identity?: HookIdentity,
): string {
  const correlation = getToolCallCorrelation()
  return computeIdempotencyKey({
    tool: name,
    args: redactSensitive(input, contract.redactKeys),
    userId: identity?.userId,
    runId: identity?.runId,
    taskId: correlation.taskId,
    stepId: correlation.stepId,
    windowMs: contract.idempotency.ttlMs,
    keyFields: contract.idempotency.keyFields,
  })
}

/** 幂等回放信封：拒绝重复执行 + 携带首次结果（文章「跳转已有记录」语义）。 */
function idempotentReplayEnvelope(tool: string, cached: unknown, firstAt: number): string {
  return JSON.stringify({
    ok: false,
    code: 'IDEMPOTENT_REPLAY',
    replayed: true,
    tool,
    firstAt,
    cached,
    hint: '同一业务动作已完成（见 cached）；请使用首次结果或改变参数，勿重复调用',
  })
}

/**
 * 契约执法钩子（排瀑布第二位：audit 后、其余围栏前——先记观测再执法，
 * 保证被拒调用也有完整审计行）。
 * contractResolver 注入口供测试/嵌入方替换契约解析（生产缺省走内置表）。
 */
export function contractGuardHook(
  options: {
    idempotencyStore?: IdempotencyStore
    contractResolver?: (name: string) => ToolContract
  } = {},
) {
  const store = options.idempotencyStore ?? new IdempotencyStore()
  const resolveContract = options.contractResolver ?? resolveToolContract
  return {
    async preExecute(
      name: string,
      input: Record<string, unknown>,
      context?: HookIdentity,
    ): Promise<PreExecuteVerdict | void> {
      let contract: ToolContract
      try {
        contract = resolveContract(name)
      } catch {
        return // 契约解析故障=放行（fail-soft：执法器不自伤业务）
      }

      // 1) 入参契约：声明即执法（未声明=不检查，存量纪律不变）。
      if (contract.inputSchema) {
        try {
          const issues = validateAgainstSchema(input, contract.inputSchema)
          if (issues.length > 0) {
            return { allow: false, error: JSON.stringify(schemaRejectionEnvelope(issues)) }
          }
        } catch {
          return // 校验器异常=放行（fail-soft）
        }
      }

      // 2) 幂等回放：显式 replay:'return' 且账上有缓存结果才短路。
      if (contract.idempotency.mode === 'key' && contract.idempotency.replay === 'return') {
        try {
          const hit = store.peek(contractIdempotencyKey(name, input, contract, context))
          if (hit?.result !== undefined) {
            return { allow: false, error: idempotentReplayEnvelope(name, hit.result, hit.firstAt) }
          }
        } catch {
          return // 账本故障=放行（幂等层降级为观测）
        }
      }
    },

    async postExecute(
      name: string,
      _input: Record<string, unknown>,
      result: ToolResultLike,
    ): Promise<ToolResultLike | void> {
      let contract: ToolContract
      try {
        contract = resolveContract(name)
      } catch {
        return
      }
      // 出参 strict 档：结果 data 违反 outputSchema 时改写为错误信封（fail-closed）。
      // data 缺席=非结构化结果，跳过（audit 档的观测记录在 tool-hooks 落账）。
      if (contract.outputEnforcement !== 'strict' || !contract.outputSchema) return
      if (!result?.ok || result.data === undefined || result.data === null) return
      try {
        const issues = validateAgainstSchema(result.data, contract.outputSchema, 'data')
        if (issues.length > 0) {
          const envelope = outputSchemaViolationEnvelope(issues)
          return { ...result, ok: false, content: JSON.stringify(envelope), error: envelope.error }
        }
      } catch {
        return // 校验器异常=不改写（fail-soft）
      }
    },
  }
}
