// custom/server/services/kanban/raci-dispatch.ts
// RACI 派发服务：根据 KanbanTask body 中的 RACI 块创建 Matrix 房间并按角色派发通知。
// 挂载：B 类 patch 361 在 kanban-service.createTask、patch 366 在 assignTask 成功路径
// best-effort 调用。同任务幂等：sidecar 记录 taskId→roomId，重复派发不再建群。
// 通道：有 Matrix 凭据（gateway dotenv 五件套）走真实 client-server 建群+邀人
// （room-invite-gap 根治，原先只进内存模拟）；无凭据回落内存模拟（测试/无网关环境）。
// 约束：custom 树禁止 import upstream 模块（overlay 树内无该文件），任务对象用结构化类型承接。
// 依赖：custom/server/matrix/gateway-env.ts（凭据/RACI 类型）+
//       custom/server/matrix/raci-matrix.ts（真实 Matrix HTTP 面）+
//       custom/server/matrix/simulation.ts（无凭据回落的内存模拟）。

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import {
  type RACITuple,
  type DispatchResult,
  createRoomName,
  DEFAULT_GATEWAY_CONFIG,
} from '../../matrix/gateway-env'
import {
  simulateCreateRoom,
  simulateSendMessage,
} from '../../matrix/simulation'
import {
  resolveMatrixDispatchEnv,
  matrixCreateTaskRoom,
  matrixInviteUser,
  matrixSendMessage,
  matrixSendProtocolEvent,
  raciInviteeIds,
  type MatrixDispatchEnv,
} from '../../matrix/raci-matrix'
import { TASK_ASSIGN_EVENT_TYPE, buildAssignContent } from '../../matrix/task-protocol'

/** 派发所需的最小任务结构（KanbanTask 的结构化子集） */
export interface RaciDispatchTask {
  id: string
  title: string
  body: string | null
  assignee: string | null
  status: string
}

// ─── 派发去重 sidecar（同 retry-store 的落盘惯例） ──────────────

interface DispatchRecord {
  roomId: string
  dispatchedAt: number
}

type DedupeMap = Record<string, DispatchRecord>

function defaultDedupePath(): string {
  return join(homedir(), '.hermes-web-ui', 'overlay', 'aipaydev-raci-dispatch.json')
}

async function readDedupe(path: string): Promise<DedupeMap> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as DedupeMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// sidecar 是整文件读-改-写：并发 assign 时后写会覆盖先写丢记录（被丢任务下次
// 重复建群）。写入经模块级队列串行化；进程内同任务并发由 in-flight 表合并。
let dedupeWriteQueue: Promise<void> = Promise.resolve()
const inFlightDispatch = new Map<string, Promise<DispatchResult>>()

function recordDispatch(path: string, taskId: string, roomId: string): Promise<void> {
  const run = dedupeWriteQueue.then(async () => {
    const map = await readDedupe(path)
    map[taskId] = { roomId, dispatchedAt: Date.now() }
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify(map, null, 2), 'utf8')
    await rename(tmp, path)
  })
  dedupeWriteQueue = run.catch(() => {})
  return run
}

// ─── RACI Dispatch 服务 ────────────────────────────────────

export class RACIDispatchService {
  /**
   * 根据 task.body 中 JSON 的 raci 块触发派发
   * 1. sidecar 去重：同任务已派发 → 返回原 roomId（deduped）
   * 2. 解析 RACI tuple（缺省回落 assignee）
   * 3. 创建 Matrix 房间 + 邀请角色参与者 + 发送摘要
   */
  static dispatch(task: RaciDispatchTask, dedupePath = defaultDedupePath()): Promise<DispatchResult> {
    // 同任务并发调用合并为一次执行（sidecar 读-检-写在跨进程幂等之外补进程内竞态）
    const pending = inFlightDispatch.get(task.id)
    if (pending) return pending
    const run = RACIDispatchService.doDispatch(task, dedupePath).finally(() => {
      inFlightDispatch.delete(task.id)
    })
    inFlightDispatch.set(task.id, run)
    return run
  }

  private static async doDispatch(task: RaciDispatchTask, dedupePath: string): Promise<DispatchResult> {
    const seen = (await readDedupe(dedupePath))[task.id]
    if (seen?.roomId) {
      return { ok: true, roomId: seen.roomId, deduped: true }
    }

    const raci = RACIDispatchService.parseRACIFields(task)
    if (!raci) {
      return { ok: false, roomId: null, error: 'RACI 字段缺失：至少需要 responsible' }
    }
    if (raci.responsible.length === 0) {
      return { ok: false, roomId: null, error: 'responsible 不能为空' }
    }
    if (raci.approver.length > 1) {
      return { ok: false, roomId: null, error: 'approver 最多 1 人' }
    }

    try {
      const mode = await RACIDispatchService.dispatchToMatrix(task, raci)
      await recordDispatch(dedupePath, task.id, mode.roomId)
      return { ok: true, roomId: mode.roomId, mode: mode.mode }
    } catch (err) {
      return {
        ok: false,
        roomId: null,
        error: err instanceof Error ? err.message : 'Matrix 派发失败',
      }
    }
  }

  /** 建群+邀人+发摘要：有 Matrix 凭据走真实 client-server（room-invite-gap 根治），
   *  无凭据（测试/无网关环境）回落内存模拟。返回 roomId 与实际走的通道。 */
  private static async dispatchToMatrix(
    task: RaciDispatchTask,
    raci: RACITuple,
  ): Promise<{ roomId: string; mode: 'matrix' | 'simulated' }> {
    const env = resolveMatrixDispatchEnv()
    if (env) {
      return { roomId: await RACIDispatchService.dispatchReal(env, task, raci), mode: 'matrix' }
    }
    return { roomId: await RACIDispatchService.dispatchSimulated(task, raci), mode: 'simulated' }
  }

  /** 真实 Matrix 派发：建房（邀人随房提交）+ 逐个补邀幂等 + 发协议事件与人读摘要 */
  private static async dispatchReal(
    env: MatrixDispatchEnv,
    task: RaciDispatchTask,
    raci: RACITuple,
  ): Promise<string> {
    const roomName = createRoomName(task.id, task.title)
    const invitees = raciInviteeIds(raci)
    const roomId = await matrixCreateTaskRoom(env, roomName, invitees)
    // 补邀（建房 invite 已含，此处幂等兜底已在房/漏邀场景）
    for (const uid of invitees) await matrixInviteUser(env, roomId, uid)
    // 协作信号走 task.assign 协议事件（边界设计 §6-T2）：每个 responsible 一发，
    // 跨机协议消费方只认事件不认摘要文本；摘要保留作人读通知。
    const targets = raci.responsible.length > 0 ? [...new Set(raci.responsible)] : [env.userId]
    for (const account of targets) {
      await matrixSendProtocolEvent(env, roomId, TASK_ASSIGN_EVENT_TYPE, buildAssignContent({
        taskId: task.id,
        title: task.title,
        body: task.body ?? undefined,
        target: { account },
        issuedBy: env.userId,
      }))
    }
    await matrixSendMessage(env, roomId, RACIDispatchService.buildDispatchText(task, raci))
    return roomId
  }

  /** 内存模拟派发（无凭据环境；保留原行为供测试/无网关回落） */
  private static async dispatchSimulated(task: RaciDispatchTask, raci: RACITuple): Promise<string> {
    const roomName = createRoomName(task.id, task.title)
    const room = await simulateCreateRoom(roomName, DEFAULT_GATEWAY_CONFIG.userId, raciInviteeIds(raci))
    await simulateSendMessage(room.roomId, DEFAULT_GATEWAY_CONFIG.userId, RACIDispatchService.buildDispatchText(task, raci))
    return room.roomId
  }

  /**
   * 从 task.body 解析 RACI tuple；body 非 JSON 或无 raci 块时回落 assignee。
   */
  private static parseRACIFields(task: RaciDispatchTask): RACITuple | null {
    const defaultRaci: RACITuple = {
      responsible: task.assignee ? [task.assignee] : [],
      approver: [],
      consulted: [],
      informed: [],
    }
    if (task.body) {
      try {
        const meta = JSON.parse(task.body)
        if (meta && typeof meta === 'object' && meta.raci) {
          return {
            responsible: meta.raci.responsible || defaultRaci.responsible,
            approver: meta.raci.approver || [],
            consulted: meta.raci.consulted || [],
            informed: meta.raci.informed || [],
          }
        }
      } catch { /* body 不是 JSON，使用默认值 */ }
    }
    return defaultRaci
  }

  /** 派发摘要文本（真实/模拟共用） */
  private static buildDispatchText(task: RaciDispatchTask, raci: RACITuple): string {
    const lines = [
      `📋 **RACI 派发通知**`,
      ``,
      `**任务**：${task.title}`,
      `**状态**：${task.status}`,
      task.body ? `**描述**：${task.body.slice(0, 200)}` : '',
      ``,
      `**RACI 分配**：`,
      `• 负责执行：${raci.responsible.join(', ') || '未分配'} @room`,
      `• 审批方：${raci.approver.join(', ') || '未分配'}`,
      `• 协商方：${raci.consulted.join(', ') || '未分配'}`,
      `• 知悉方：${raci.informed.join(', ') || '未分配'}`,
      ``,
      `**Kanban 任务链接**：查看看板详情`,
    ].filter((l) => l !== '')
    return lines.join('\n')
  }
}
