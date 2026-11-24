// overlay[zcode] 带比对基线的命令发送（N34-1，挂账 2026-11-24-zcode-400-pending-batch）。
//
// 引擎命令入口对「需要比对基线」的命令要求信封带 baseRevision（按行定位的另带 baseLogEpoch），
// issuedAt 必须是毫秒数；缺字段在入口即拒。宿主的分叉、检查点恢复、模式切换此前都没带，
// 引擎一律回 rejected（proto.invalidPayload），宿主只看到「被拒绝」。
//
// 规则锚＝纯净 4.0 树 packages/shared/src/zcode-protocol-v4/command.ts：
//   COMMANDS_REQUIRING_BASE_REVISION / ROW_TARGETING_COMMANDS / parseCommandEnvelope。
// 比对＝apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts decide()：
//   baseRevision 须等于当前修订号、baseLogEpoch 须等于当前纪元，否则回 stale
//   （proto.staleRevision / proto.staleLogEpoch）。stale 的命令不入幂等表，同一 commandId 重发安全。
//
// 基线取自引擎只读查询 conversationRowsRangeV4 返回的 atRevision/atLogEpoch（服务端取值时的
// 水位与纪元，transport.ts v4ConversationRowsRangeResultSchema）：按需拉取，每次都是新值。
// 不取自宿主会话投影——投影只消费完整帧、跳过分片帧，长会话的快照恰恰是分片的，
// 且投影未必在看这个会话。
import type { ZcodeEngineAgentService } from './engine-bridge'

/** 会话当前的比对基线。 */
export interface ControlBase {
  revision: number
  logEpoch: string
}

type CasAgent = Pick<ZcodeEngineAgentService, 'conversationRowsRangeV4' | 'sendConversationCommandV4'>

/** 取不到基线：引擎没有该会话、只读查询不可用或返回形状不符。调用方据此明确失败，不发必被拒的信封。 */
export class ControlBaseUnavailableError extends Error {
  readonly reason = 'session_base_unavailable'
  constructor(detail: string) {
    super(detail)
    this.name = 'ControlBaseUnavailableError'
  }
}

/** 向引擎取会话当前的修订号与日志纪元。 */
export async function fetchControlBase(agent: Pick<CasAgent, 'conversationRowsRangeV4'>, workspacePath: string, sessionId: string): Promise<ControlBase> {
  let raw: unknown
  try {
    raw = await agent.conversationRowsRangeV4({ workspacePath, sessionId, limit: 1 })
  } catch (e) {
    throw new ControlBaseUnavailableError(`引擎未返回会话修订号与日志纪元：${e instanceof Error ? e.message : String(e)}`)
  }
  const r = raw as { atRevision?: unknown; atLogEpoch?: unknown } | null | undefined
  if (typeof r?.atRevision !== 'number' || !Number.isFinite(r.atRevision) || typeof r?.atLogEpoch !== 'string' || !r.atLogEpoch) {
    throw new ControlBaseUnavailableError('引擎未返回会话修订号与日志纪元（只读查询结果形状不符）')
  }
  return { revision: r.atRevision, logEpoch: r.atLogEpoch }
}

export interface CasSendOptions {
  workspacePath: string
  sessionId: string
  /** 用基线构造信封。重试时会以新基线再次调用——commandId 须在闭包外固定（重试不变）。 */
  build: (base: ControlBase) => Record<string, unknown>
  /** 已知基线（可选）：先用它，过时再重取。 */
  base?: ControlBase
  /** 最多尝试次数，默认 3；仅当引擎回 stale/proto.staleRevision 时重取基线再试。 */
  maxAttempts?: number
}

/**
 * 发送一条带比对基线的命令。传输层错误（引擎不可达、超时）原样抛出，由调用方归类。
 */
export async function sendCasCommand(agent: CasAgent, opts: CasSendOptions): Promise<{ status: string; reasonCode?: string }> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)
  let base = opts.base
  let ack: { status: string; reasonCode?: string } | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (!base) base = await fetchControlBase(agent, opts.workspacePath, opts.sessionId)
    ack = await agent.sendConversationCommandV4({ workspacePath: opts.workspacePath, envelope: opts.build(base) })
    const staleRevision = ack?.status === 'stale' && ack.reasonCode === 'proto.staleRevision'
    if (!staleRevision || attempt === maxAttempts) return ack
    base = undefined // 取值之后会话又有变化：重取再试
  }
  return ack as { status: string; reasonCode?: string }
}
