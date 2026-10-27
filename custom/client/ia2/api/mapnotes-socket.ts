// overlay/custom/client/ia2/api/mapnotes-socket.ts
// /mapnotes 命名空间客户端（批三 D1 实时协同；zcode-socket.ts 同款模式）。
// 事件面 = 服务端 mapnotes-socket.ts 的 mapnotes:changed（标注变更）与
// mapnotes:presence（房间在线协作者数）。
import { io, type Socket } from 'socket.io-client'
import { getApiKey, getBaseUrlValue } from '@/api/client'
import type { MapAnnotationDto } from './sim-director'

export interface MapnotesChangedEvent {
  kind: 'upsert' | 'delete'
  key: string
  annotation?: MapAnnotationDto
  applied?: boolean
  nodeId?: string
  by?: string
}

export interface MapnotesPresenceEvent {
  key: string
  watchers: number
  joined: boolean
}

let mapnotesSocket: Socket | null = null

function connectMapnotes(): Socket {
  if (mapnotesSocket) return mapnotesSocket
  const baseUrl = getBaseUrlValue() || window.location.origin
  const token = getApiKey()
  mapnotesSocket = io(`${baseUrl}/mapnotes`, {
    auth: { token: token || undefined },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  })
  return mapnotesSocket
}

/**
 * 订阅指纹房间：登记两事件监听+subscribe，返回清理函数（组件卸载/换指纹必须调用）。
 * 断线重连幂等重订（zcode-socket 同款注释纪律）。
 */
export function subscribeMapnotes(
  key: string,
  onChanged: (e: MapnotesChangedEvent) => void,
  onPresence: (e: MapnotesPresenceEvent) => void,
): () => void {
  const socket = connectMapnotes()
  const resubscribe = () => { socket.emit('subscribe', key) }
  socket.on('mapnotes:changed', onChanged)
  socket.on('mapnotes:presence', onPresence)
  socket.on('connect', resubscribe)
  resubscribe()
  return () => {
    socket.off('mapnotes:changed', onChanged)
    socket.off('mapnotes:presence', onPresence)
    socket.off('connect', resubscribe)
    socket.emit('unsubscribe', key)
  }
}
