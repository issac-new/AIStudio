// custom/server/services/kanban/raci-dispatch.ts
// RACI 派发服务：根据 KanbanTask body 中的 RACI 块创建 Matrix 房间并按角色派发通知。
// 挂载：B 类 patch 361 在 kanban-service.createTask、patch 366 在 assignTask 成功路径
// best-effort 调用。同任务幂等：sidecar 记录 taskId→roomId，重复派发不再建群。
// 约束：custom 树禁止 import upstream 模块（overlay 树内无该文件），任务对象用结构化类型承接。
// 依赖：custom/server/matrix/gateway-env.ts（RACI 类型与角色映射）+
//       custom/server/matrix/simulation.ts（Matrix 房间/消息内存模拟）。

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import {
  type RACITuple,
  type DispatchResult,
  ROLE_USER_MAP,
  createRoomName,
  DEFAULT_GATEWAY_CONFIG,
} from '../../matrix/gateway-env'
import {
  simulateCreateRoom,
  simulateSendMessage,
} from '../../matrix/simulation'

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

async function recordDispatch(path: string, taskId: string, roomId: string): Promise<void> {
  const map = await readDedupe(path)
  map[taskId] = { roomId, dispatchedAt: Date.now() }
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(map, null, 2), 'utf8')
  await rename(tmp, path)
}

// ─── RACI Dispatch 服务 ────────────────────────────────────

export class RACIDispatchService {
  /**
   * 根据 task.body 中 JSON 的 raci 块触发派发
   * 1. sidecar 去重：同任务已派发 → 返回原 roomId（deduped）
   * 2. 解析 RACI tuple（缺省回落 assignee）
   * 3. 创建 Matrix 房间 + 邀请角色参与者 + 发送摘要
   */
  static async dispatch(task: RaciDispatchTask, dedupePath = defaultDedupePath()): Promise<DispatchResult> {
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
      const roomId = await RACIDispatchService.createMatrixRoom(task)
      await RACIDispatchService.inviteParticipants(roomId, raci)
      await RACIDispatchService.sendDispatchMessage(roomId, task, raci)
      await recordDispatch(dedupePath, task.id, roomId)
      return { ok: true, roomId }
    } catch (err) {
      return {
        ok: false,
        roomId: null,
        error: err instanceof Error ? err.message : 'Matrix 派发失败',
      }
    }
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

  /**
   * 创建 Matrix 房间并邀请 RACI 参与者（模拟态：内存房间）
   */
  private static async createMatrixRoom(task: RaciDispatchTask): Promise<string> {
    const roomName = createRoomName(task.id, task.title)
    const invitedUsers = [
      ...ROLE_USER_MAP.responsible,
      ...ROLE_USER_MAP.approver,
      ...ROLE_USER_MAP.consulted,
      ...ROLE_USER_MAP.informed,
    ]
    const room = await simulateCreateRoom(roomName, DEFAULT_GATEWAY_CONFIG.userId, invitedUsers)
    return room.roomId
  }

  /**
   * 角色权限位（模拟态已随建房邀请完成；生产态在此按角色设置 power_levels）
   */
  private static async inviteParticipants(
    _roomId: string,
    _raci: RACITuple,
  ): Promise<void> {
    // no-op：simulateCreateRoom 已完成邀请
  }

  /**
   * 发送任务摘要消息到 Matrix 房间
   */
  private static async sendDispatchMessage(
    roomId: string,
    task: RaciDispatchTask,
    raci: RACITuple,
  ): Promise<void> {
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

    await simulateSendMessage(roomId, DEFAULT_GATEWAY_CONFIG.userId, lines.join('\n'))
  }
}
