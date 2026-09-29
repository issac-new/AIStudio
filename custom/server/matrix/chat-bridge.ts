// custom/server/matrix/chat-bridge.ts
// v14 统一聊天 P2B/P2C/P2D（2026-09-29）：matrix 房间 ↔ 本地 hermes 群聊桥。
//
// 架构定位（v14 文档裁决 D1）：matrix = 传输与身份层（远端在场），本地
// GroupChatServer 内核 = 编排器（mention 路由/handoff/队列/审批/summary 全留本地）。
// 本桥双挂两侧：
//   入向：bot 账号 /sync long-poll → 桥内映射房的 m.text → gcs.publishBridgeMemberMessage
//         （patch 509 注入 API：持久化+广播+processMentions 编排），@mention 由
//         上游 resolveMentionTargets 从正文解析（user 角色 0 mention 亦按上游策略派发）。
//   出向：轮询本地房消息（storage.getMessagesForContext），agent 终态消息以
//         `@<bridge-bot>` 身份发 m.text + agent.message 徽章事件（P2D，类型见 task-protocol）。
//         流式不出网（裁决 D2：本地流式、matrix 终态）。
//   P2C：消费 task.assign 协议事件（成员 Studio 客户端不在线也可执行）——
//         注入映射群房驱动本地 agent 编排，回执 task.receipt 协议事件
//         （created/failed）。审批请求（gcs.bridgeEvents）远端通知到房。
//   P2D：启动时对映射房发 agent.profile state 声明（能力面）。
//
// 配置（env）：CHAT_BRIDGE_ENABLED=1 开启；凭据 CHAT_BRIDGE_MATRIX_HOMESERVER/
// ACCESS_TOKEN/USER_ID（缺省回落 gateway dotenv，与 brief 投递同源）；
// CHAT_BRIDGE_ROOMS="matrixRoomId=gcRoomId,..."; CHAT_BRIDGE_POLL_MS（出向轮询，
// 缺省 2000）; CHAT_BRIDGE_SYNC_TIMEOUT_MS（缺省 25000）。
// 状态：<HERMES_HOME>/chat-bridge-state.json（since token/已投递消息 id/已见事件 id，
// 均有上限防膨胀）。安全边界：token 不落日志。
import { readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync } from 'node:fs'
import path from 'node:path'
import { hermesHomePath, readGatewayMatrixEnv } from './gateway-env'
// 协议事件类型单一事实源（服务端镜像；守门 task-protocol-guard 对账）
import {
  TASK_ASSIGN_EVENT_TYPE, TASK_RECEIPT_EVENT_TYPE,
  AGENT_MESSAGE_EVENT_TYPE, AGENT_PROFILE_EVENT_TYPE, SWARM_EVENT_PREFIX,
} from './task-protocol'

export interface BridgeMatrixEnv { homeserverUrl: string; accessToken: string; userId: string }
export interface BridgeMapping { matrixRoomId: string; gcRoomId: string }

export interface BridgeGcMessage {
  id: string
  timestamp: number
  senderType?: string
  senderName?: string
  senderAgentType?: string
  role?: string
  content: string
  run_id?: string | null
  isStreaming?: boolean
}

/** 桥视角的 GroupChatServer 面（patch 509 提供；测试替身同构） */
export interface GroupChatServerLike {
  publishBridgeMemberMessage(input: {
    roomId: string; senderId: string; senderName: string; content: string
  }): { id: string; timestamp: number } | null
  getStorage(): {
    getRoom(roomId: string): unknown
    getMessagesForContext(roomId: string): BridgeGcMessage[]
  }
  getRoomAgentViews?(roomId: string): Array<Record<string, unknown>>
  bridgeEvents: { on(evt: string, cb: (payload: unknown) => void): unknown }
}

/** 映射表解析："!a:host=g1,!b:host=g2"（空白/空段容忍） */
export function parseBridgeMappings(raw: string | undefined): BridgeMapping[] {
  if (!raw?.trim()) return []
  const out: BridgeMapping[] = []
  for (const seg of raw.split(/[,\n]/)) {
    const m = seg.trim().match(/^([^=]+)=([^=]+)$/)
    if (m) out.push({ matrixRoomId: m[1].trim(), gcRoomId: m[2].trim() })
  }
  return out
}

/** gc 消息 content → 纯文本：JSON content-block 数组拼接 text 块，否则原样。 */
export function extractText(content: string): string {
  const s = (content ?? '').trim()
  if (!s.startsWith('[')) return s
  try {
    const blocks = JSON.parse(s) as Array<{ type?: string; text?: string }>
    return blocks.filter(b => b?.type === 'text' && typeof b.text === 'string')
      .map(b => b.text as string).join('\n').trim()
  } catch { return s }
}

/** matrix /sync 响应的最小解析（invite + join 房消息 + swarmstudio 协议自定义事件）。 */
export interface SyncResult {
  nextBatch: string
  invites: string[]
  joined: Array<{
    roomId: string
    messages: Array<{ eventId: string; sender: string; body: string; ts: number }>
    customEvents: Array<{ eventId: string; sender: string; type: string; content: Record<string, unknown>; ts: number }>
  }>
}

export async function matrixSync(
  env: BridgeMatrixEnv, since: string | null, timeoutMs: number, fetchImpl: typeof fetch,
): Promise<SyncResult> {
  const url = new URL('/_matrix/client/v3/sync', env.homeserverUrl)
  url.searchParams.set('timeout', String(timeoutMs))
  // 最小过滤：timeline 限制 + 家态裁剪，降低桥账号流量
  url.searchParams.set('filter', JSON.stringify({
    room: { timeline: { limit: 20 } }, account_data: { not_senders: ['*'] } as never,
  }))
  if (since) url.searchParams.set('since', since)
  const res = await fetchImpl(url.toString(), { headers: { authorization: `Bearer ${env.accessToken}` } })
  if (!res.ok) throw new Error(`matrix sync failed: HTTP ${res.status}`)
  const data = await res.json() as {
    next_batch?: string
    rooms?: { invite?: Record<string, unknown>; join?: Record<string, { timeline?: { events?: Array<Record<string, unknown>> } }> }
  }
  const invites = Object.keys(data.rooms?.invite ?? {})
  const joined: SyncResult['joined'] = []
  for (const [roomId, room] of Object.entries(data.rooms?.join ?? {})) {
    const messages: SyncResult['joined'][number]['messages'] = []
    const customEvents: SyncResult['joined'][number]['customEvents'] = []
    for (const ev of room.timeline?.events ?? []) {
      const type = String(ev.type ?? '')
      if (type === 'm.room.message') {
        const content = ev.content as { msgtype?: string; body?: string } | undefined
        if (content?.msgtype && content.msgtype !== 'm.text') continue
        messages.push({
          eventId: String(ev.event_id ?? ''),
          sender: String(ev.sender ?? ''),
          body: String(content?.body ?? ''),
          ts: Number((ev as { origin_server_ts?: number }).origin_server_ts ?? 0),
        })
      } else if (type.startsWith(SWARM_EVENT_PREFIX)) {
        customEvents.push({
          eventId: String(ev.event_id ?? ''),
          sender: String(ev.sender ?? ''),
          type,
          content: (ev.content ?? {}) as Record<string, unknown>,
          ts: Number((ev as { origin_server_ts?: number }).origin_server_ts ?? 0),
        })
      }
    }
    joined.push({ roomId, messages, customEvents })
  }
  return { nextBatch: String(data.next_batch ?? ''), invites, joined }
}

/** 发消息事件（m.room.message 或自定义类型同走 send 端点；txn 幂等防重）。 */
export async function matrixSend(
  env: BridgeMatrixEnv, roomId: string, eventType: string, content: Record<string, unknown>,
  fetchImpl: typeof fetch, txnSeed: string,
): Promise<string> {
  const txn = `${txnSeed}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const url = new URL(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/${encodeURIComponent(txn)}`, env.homeserverUrl)
  const res = await fetchImpl(url.toString(), {
    method: 'PUT',
    headers: { authorization: `Bearer ${env.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(content),
  })
  if (!res.ok) throw new Error(`matrix send ${eventType} failed: HTTP ${res.status}`)
  const data = await res.json() as { event_id?: string }
  return String(data.event_id ?? '')
}

export async function matrixJoinRoom(env: BridgeMatrixEnv, roomId: string, fetchImpl: typeof fetch): Promise<void> {
  const url = new URL(`/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, env.homeserverUrl)
  const res = await fetchImpl(url.toString(), { method: 'POST', headers: { authorization: `Bearer ${env.accessToken}` }, body: '{}' })
  if (!res.ok) throw new Error(`matrix join failed: HTTP ${res.status}`)
}

/** 发 state 事件（agent.profile 声明用）。 */
export async function matrixSendState(
  env: BridgeMatrixEnv, roomId: string, eventType: string, stateKey: string, content: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const url = new URL(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${encodeURIComponent(stateKey)}`, env.homeserverUrl)
  const res = await fetchImpl(url.toString(), {
    method: 'PUT',
    headers: { authorization: `Bearer ${env.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(content),
  })
  if (!res.ok) throw new Error(`matrix state ${eventType} failed: HTTP ${res.status}`)
}

interface BridgeState {
  since: string | null
  /** gcRoomId → 已出向投递的最后时间戳 */
  lastSentTs: Record<string, number>
  /** gcRoomId → 已出向投递消息 id（上限 500 环形截断） */
  sentIds: Record<string, string[]>
  /** 已消费的 matrix 事件 id（入向幂等，上限 1000） */
  seenEventIds: string[]
}

const SENT_IDS_CAP = 500
const SEEN_CAP = 1000
/** assignHandled 防重上限（长驻进程只增不减会随派发量线性涨内存；同 SENT_IDS/SEEN 环形语义） */
const ASSIGN_HANDLED_CAP = 1000

function defaultStateFile(): string {
  return path.join(hermesHomePath(), 'chat-bridge-state.json')
}

function loadState(file: string): BridgeState {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<BridgeState>
    return {
      since: raw.since ?? null,
      lastSentTs: raw.lastSentTs ?? {},
      sentIds: raw.sentIds ?? {},
      seenEventIds: raw.seenEventIds ?? [],
    }
  } catch { return { since: null, lastSentTs: {}, sentIds: {}, seenEventIds: [] } }
}

function saveState(file: string, st: BridgeState): void {
  const dir = path.dirname(file)
  mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(st), { encoding: 'utf-8', mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, file)
}

export interface ChatBridgeOptions {
  env: BridgeMatrixEnv
  mappings: BridgeMapping[]
  gcs: GroupChatServerLike
  fetchImpl?: typeof fetch
  now?: () => number
  stateFile?: string
  syncTimeoutMs?: number
  log?: (msg: string) => void
}

export class ChatBridge {
  private st: BridgeState
  private running = false
  private readonly opts: Required<Omit<ChatBridgeOptions, 'gcs' | 'mappings' | 'env'>> & Pick<ChatBridgeOptions, 'gcs' | 'mappings' | 'env'>
  /** 已向 matrix 发送的 assign 回执 taskId（防重入） */
  private assignHandled = new Set<string>()

  constructor(opts: ChatBridgeOptions) {
    this.opts = {
      gcs: opts.gcs,
      mappings: opts.mappings,
      env: opts.env,
      fetchImpl: opts.fetchImpl ?? fetch,
      now: opts.now ?? Date.now,
      stateFile: opts.stateFile ?? defaultStateFile(),
      syncTimeoutMs: opts.syncTimeoutMs ?? 25_000,
      log: opts.log ?? ((m: string) => { console.log(`[ChatBridge] ${m}`) }),
    }
    this.st = loadState(this.opts.stateFile)
  }

  private mappingByMatrix(roomId: string): BridgeMapping | undefined {
    return this.opts.mappings.find(m => m.matrixRoomId === roomId)
  }

  private mappingByGc(gcRoomId: string): BridgeMapping | undefined {
    return this.opts.mappings.find(m => m.gcRoomId === gcRoomId)
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.opts.gcs.bridgeEvents.on('approval.requested', route => { void this.onApprovalRequested(route) })
    await this.declareAgentProfiles()
    void this.syncLoop()
  }

  stop(): void {
    this.running = false
  }

  private async syncLoop(): Promise<void> {
    while (this.running) {
      try {
        const r = await matrixSync(this.opts.env, this.st.since, this.opts.syncTimeoutMs, this.opts.fetchImpl)
        const startedAt = this.opts.now()
        this.st.since = r.nextBatch || this.st.since
        const mappedInvites = r.invites.filter(id => this.mappingByMatrix(id))
        for (const roomId of mappedInvites) {
          try { await matrixJoinRoom(this.opts.env, roomId, this.opts.fetchImpl); this.opts.log(`joined ${roomId}`) }
          catch (e) { this.opts.log(`join ${roomId} failed: ${String((e as Error).message)}`) }
        }
        for (const room of r.joined) {
          const mapping = this.mappingByMatrix(room.roomId)
          if (!mapping) continue
          for (const ev of room.customEvents) {
            if (ev.type === TASK_ASSIGN_EVENT_TYPE && ev.sender !== this.opts.env.userId) {
              // 逐条容错：since 已推进到本批，单条异常不得吞掉同批其余事件（丢失后不再重投）
              try {
                await this.handleAssignEvent(mapping, { eventId: ev.eventId, content: ev.content as { taskId?: string; title?: string; body?: string; issuedBy?: string } })
              } catch (e) { this.opts.log(`assign ${ev.eventId} 处理失败跳过：${String((e as Error).message)}`) }
            }
          }
          for (const msg of room.messages) {
            try { await this.handleMatrixEvent(mapping, msg) }
            catch (e) { this.opts.log(`message ${msg.eventId} 处理失败跳过：${String((e as Error).message)}`) }
          }
        }
        for (const mapping of this.opts.mappings) await this.flushOutbound(mapping)
        saveState(this.opts.stateFile, this.st)
        // 真实 long-poll 在服务端阻塞 syncTimeout；瞬时返回（mock/异常配置）时
        // 以小间隔让步，避免忙转（也给了测试 stop() 的窗口）。
        const elapsed = this.opts.now() - startedAt
        if (elapsed < 200) await new Promise(res => setTimeout(res, 250))
      } catch (e) {
        if (!this.running) return
        this.opts.log(`sync error: ${String((e as Error).message)}，5s 后重试`)
        await new Promise(res => setTimeout(res, 5_000))
      }
    }
  }

  /** 入向：一条 matrix 消息 → 本地群房注入（自己发的跳过；幂等按 eventId）。 */
  async handleMatrixEvent(mapping: BridgeMapping, msg: { eventId: string; sender: string; body: string; ts: number }): Promise<void> {
    if (!msg.eventId) return
    if (this.st.seenEventIds.includes(msg.eventId)) return
    this.st.seenEventIds.push(msg.eventId)
    if (this.st.seenEventIds.length > SEEN_CAP) this.st.seenEventIds.splice(0, this.st.seenEventIds.length - SEEN_CAP)
    if (msg.sender === this.opts.env.userId) return
    if (!msg.body.trim()) return
    const senderName = matrixLocalPart(msg.sender)
    const injected = this.opts.gcs.publishBridgeMemberMessage({
      roomId: mapping.gcRoomId,
      senderId: `mx:${msg.sender}`,
      senderName,
      content: msg.body,
    })
    if (!injected) this.opts.log(`gc 房不在：${mapping.gcRoomId}（消息 ${msg.eventId} 丢弃）`)
  }

  /** P2C：assign 协议事件 → 注入本地编排 + 回执。 */
  async handleAssignEvent(
    mapping: BridgeMapping,
    ev: { eventId: string; content: { taskId?: string; title?: string; body?: string; issuedBy?: string } },
  ): Promise<void> {
    const taskId = String(ev.content.taskId ?? '')
    if (!taskId || this.assignHandled.has(taskId)) return
    this.assignHandled.add(taskId)
    if (this.assignHandled.size > ASSIGN_HANDLED_CAP) {
      const oldest = this.assignHandled.values().next().value
      if (oldest !== undefined) this.assignHandled.delete(oldest)
    }
    const issuedBy = ev.content.issuedBy ? matrixLocalPart(String(ev.content.issuedBy)) : '远端'
    const prompt = [
      `【任务派发】${ev.content.title ?? taskId}`,
      ev.content.body ?? '',
      `(经 matrix 桥转派，来源 ${issuedBy}；任务号 ${taskId})`,
    ].filter(Boolean).join('\n')
    const injected = this.opts.gcs.publishBridgeMemberMessage({
      roomId: mapping.gcRoomId,
      senderId: `mx-assign:${taskId}`,
      senderName: `派发-${issuedBy}`,
      content: prompt,
    })
    try {
      await matrixSend(this.opts.env, mapping.matrixRoomId, TASK_RECEIPT_EVENT_TYPE, {
        taskId,
        status: injected ? 'created' : 'failed',
        reason: injected ? 'injected-to-local-orchestration' : 'local-room-missing',
        by: this.opts.env.userId,
        at: this.opts.now(),
      }, this.opts.fetchImpl, `receipt-${taskId.slice(0, 12)}`)
    } catch (e) {
      this.opts.log(`receipt ${taskId} 发送失败：${String((e as Error).message)}`)
    }
  }

  /** 出向：本地 agent 终态消息 → matrix m.text + agent.message 徽章事件。 */
  async flushOutbound(mapping: BridgeMapping): Promise<void> {
    const storage = this.opts.gcs.getStorage()
    if (!storage.getRoom(mapping.gcRoomId)) return
    const all = storage.getMessagesForContext(mapping.gcRoomId) ?? []
    const lastTs = this.st.lastSentTs[mapping.gcRoomId] ?? 0
    const sent = new Set(this.st.sentIds[mapping.gcRoomId] ?? [])
    const fresh = all
      .filter(m => (m.senderType === 'agent' || m.role === 'assistant')
        && (m.role ?? 'assistant') !== 'tool'
        && !m.isStreaming
        && m.timestamp > lastTs
        && !sent.has(m.id)
        && Boolean(m.senderName))
      .sort((a, b) => a.timestamp - b.timestamp)
    for (const m of fresh) {
      const text = extractText(m.content)
      if (!text) continue
      try {
        await matrixSend(this.opts.env, mapping.matrixRoomId, 'm.room.message', {
          msgtype: 'm.text', body: `[${m.senderName}] ${text}`,
        }, this.opts.fetchImpl, `gc-${m.id}`)
        // P2D：徽章事件（matrix-chat 侧渲染 agent 标识；run 关联可回查）
        await matrixSend(this.opts.env, mapping.matrixRoomId, AGENT_MESSAGE_EVENT_TYPE, {
          agent: m.senderAgentType ?? m.senderName ?? '', agentName: m.senderName ?? '',
          gcMessageId: m.id, runId: m.run_id ?? null, text,
        }, this.opts.fetchImpl, `badge-${m.id}`)
        sent.add(m.id)
        this.st.lastSentTs[mapping.gcRoomId] = m.timestamp
      } catch (e) {
        this.opts.log(`出向 ${m.id} 失败：${String((e as Error).message)}`)
        break // 保序：失败即停，下轮重试同批
      }
    }
    this.st.sentIds[mapping.gcRoomId] = [...sent].slice(-SENT_IDS_CAP)
  }

  /** P2C：审批请求 → 映射 matrix 房远端通知（应答仍在工作台本地 UI）。 */
  private async onApprovalRequested(route: unknown): Promise<void> {
    const r = route as { roomId?: string; agentName?: string; approvalId?: string; command?: string; description?: string; choices?: string[] }
    if (!r.roomId) return
    const mapping = this.mappingByGc(r.roomId)
    if (!mapping) return
    const lines = [
      `🔔 审批请求（agent：${r.agentName ?? '?'}）`,
      r.description ? `说明：${r.description}` : '',
      r.command ? `命令：\n${r.command}` : '',
      `选项：${(r.choices ?? []).join(' / ') || 'once / session / deny'}`,
      '请在 SwarmStudio 工作台右栏或群聊内应答（远端应答列演进）。',
    ].filter(Boolean)
    try {
      await matrixSend(this.opts.env, mapping.matrixRoomId, 'm.room.message', {
        msgtype: 'm.text', body: lines.join('\n'),
      }, this.opts.fetchImpl, `approval-${r.approvalId ?? this.opts.now()}`)
    } catch { /* 通知失败不阻断 */ }
  }

  /** P2D：agent.profile 能力声明（启动时一次性发映射房）。 */
  private async declareAgentProfiles(): Promise<void> {
    for (const mapping of this.opts.mappings) {
      try {
        const views = this.opts.gcs.getRoomAgentViews?.(mapping.gcRoomId) ?? []
        const agents = views.map(v => ({
          agentId: String(v.agentId ?? v.id ?? ''),
          name: String(v.name ?? ''),
          agent: String(v.agent ?? ''),
        })).filter(a => a.name)
        await matrixSendState(this.opts.env, mapping.matrixRoomId, AGENT_PROFILE_EVENT_TYPE, '', {
          bridge: this.opts.env.userId, declaredAt: this.opts.now(), agents,
        }, this.opts.fetchImpl)
      } catch (e) {
        this.opts.log(`agent.profile 声明 ${mapping.matrixRoomId} 失败：${String((e as Error).message)}`)
      }
    }
  }
}

function matrixLocalPart(mxid: string): string {
  const m = mxid.match(/^@([^:]+):/)
  return m ? m[1] : mxid
}

/**
 * 进程内启动入口（patch 510 在 bootstrap/http.ts 调）。CHAT_BRIDGE_ENABLED=1 开启；
 * 凭据三级：CHAT_BRIDGE_MATRIX_* env → gateway dotenv（与 brief 投递同源）。
 */
export function startChatBridge(gcs: GroupChatServerLike): ChatBridge | null {
  if (process.env.CHAT_BRIDGE_ENABLED !== '1') return null
  const gateway = readGatewayMatrixEnv()
  const env: BridgeMatrixEnv = {
    homeserverUrl: process.env.CHAT_BRIDGE_MATRIX_HOMESERVER || gateway?.homeserverUrl || '',
    accessToken: process.env.CHAT_BRIDGE_MATRIX_ACCESS_TOKEN || gateway?.accessToken || '',
    userId: process.env.CHAT_BRIDGE_MATRIX_USER_ID || gateway?.userId || '',
  }
  const mappings = parseBridgeMappings(process.env.CHAT_BRIDGE_ROOMS)
  if (!env.homeserverUrl || !env.accessToken || !env.userId) {
    console.log('[ChatBridge] 凭据不全（CHAT_BRIDGE_MATRIX_* / gateway dotenv），未启动')
    return null
  }
  if (!mappings.length) {
    console.log('[ChatBridge] CHAT_BRIDGE_ROOMS 映射为空，未启动')
    return null
  }
  const bridge = new ChatBridge({
    env, mappings, gcs,
    stateFile: process.env.CHAT_BRIDGE_STATE_FILE || defaultStateFile(),
    syncTimeoutMs: Number(process.env.CHAT_BRIDGE_SYNC_TIMEOUT_MS || 25_000),
  })
  void bridge.start().catch(e => { console.log(`[ChatBridge] 启动失败：${String((e as Error).message)}`) })
  return bridge
}
