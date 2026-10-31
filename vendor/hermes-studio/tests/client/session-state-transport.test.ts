import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { Server } from 'socket.io'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SessionListState, SessionStateSnapshot } from '../../packages/shared/session-state'

const state = vi.hoisted(() => ({ origin: '', db: null as DatabaseSync | null }))
vi.mock('@/api/client', () => ({ getBaseUrlValue: () => state.origin, getApiKey: () => 'test-account' }))
vi.mock('../../packages/server/src/modules/studio/infrastructure/database', () => ({ getDb: () => state.db }))
import { connectSessionState } from '@/api/studio/session-state'
import { SessionStateSync } from '../../packages/server/src/modules/studio/services/session-state'
import { recordSessionAttention } from '../../packages/server/src/modules/studio/repositories/session-state-store'

let server: Server
let sync: SessionStateSync
const clients: Socket[] = []
const runtime = new Map<string, { working: boolean; backgroundPending: number; collaborationPending?: number }>()

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${event}`)), 2000)
    socket.once(event, value => { clearTimeout(timer); resolve(value) })
  })
}

async function device() {
  const socket = connectSessionState()
  clients.push(socket)
  return { socket, snapshot: (await once<SessionStateSnapshot>(socket, 'sessions.state.snapshot')).sessions }
}

beforeEach(async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'default' })
  state.db = new DatabaseSync(':memory:')
  state.db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,profile TEXT DEFAULT 'default',source TEXT DEFAULT 'builtin_agent',studio_user_id TEXT);
    CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,role TEXT,content TEXT);
    INSERT INTO sessions(id,studio_user_id) VALUES ('person-main-creator','1'),('person-main-recipient','1');`)
  runtime.clear()
  sync = new SessionStateSync(id => runtime.get(id) || { working: false, backgroundPending: 0 }, () => true)
  const http = createServer()
  server = new Server(http)
  server.of('/person-presence')
  const chat = server.of('/chat-run')
  chat.use((socket, next) => {
    socket.data.user = { id: 1, username: 'test', role: 'super_admin' }
    next()
  })
  chat.on('connection', socket => sync.attach(socket))
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  state.origin = `http://127.0.0.1:${(http.address() as any).port}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  sync.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  state.db?.close()
  vi.unstubAllGlobals()
})

it('subscribes after another namespace connects and synchronizes collaboration and read receipts across devices', async () => {
  // The main app connects presence first. Its Manager has no session_state query.
  const presence = io(`${state.origin}/person-presence`, { query: { profile: 'default' }, transports: ['websocket'] })
  clients.push(presence)
  await once(presence, 'connect')
  const a = await device()
  const b = await device()
  expect(a.snapshot).toHaveLength(2)
  expect(b.snapshot).toEqual(a.snapshot)

  runtime.set('person-main-recipient', { working: false, backgroundPending: 0, collaborationPending: 1 })
  const messageId = Number(state.db!.prepare("INSERT INTO messages(session_id,role,content) VALUES (?,'assistant','Partial reply')").run('person-main-recipient').lastInsertRowid)
  const startedA = once<SessionStateSnapshot>(a.socket, 'sessions.state.snapshot')
  const startedB = once<SessionStateSnapshot>(b.socket, 'sessions.state.snapshot')
  sync.refreshPerson(1)
  const active = (await startedA).sessions
  expect((await startedB).sessions).toEqual(active)
  expect(active.find(s => s.sessionId === 'person-main-creator')).toMatchObject({ working: false, backgroundPending: 0 })
  const recipient = active.find(s => s.sessionId === 'person-main-recipient')!
  expect(recipient).toMatchObject({ working: true, unread: false, lastMessageId: messageId })

  const earlyAck = await new Promise(resolve => a.socket.emit('sessions.read', {
    sessionId: recipient.sessionId, messageId,
  }, resolve))
  expect(earlyAck).toEqual({ ok: false })
  runtime.clear()
  const finished = once<SessionListState>(b.socket, 'sessions.state.updated')
  sync.publish(recipient.sessionId)
  expect(await finished).toMatchObject({ working: false, unread: true })

  const receiptA = once<SessionListState>(a.socket, 'sessions.state.updated')
  const receiptB = once<SessionListState>(b.socket, 'sessions.state.updated')
  const ack = await new Promise(resolve => a.socket.emit('sessions.read', {
    sessionId: recipient.sessionId, messageId, attentionId: recipient.lastAttentionId,
  }, resolve))
  expect(ack).toEqual({ ok: true })
  expect(await receiptA).toMatchObject({ sessionId: recipient.sessionId, working: false, unread: false })
  expect(await receiptB).toMatchObject({ sessionId: recipient.sessionId, working: false, unread: false })

  runtime.clear()
  recordSessionAttention('person-main-creator', 'relay-completed:1')
  a.socket.disconnect()
  expect(presence.connected).toBe(true)
  const completed = once<SessionStateSnapshot>(b.socket, 'sessions.state.snapshot')
  sync.refreshPerson(1)
  expect((await completed).sessions).toEqual(expect.arrayContaining([
    expect.objectContaining({ sessionId: 'person-main-creator', working: false, unread: true }),
    expect.objectContaining({ sessionId: 'person-main-recipient', working: false, unread: false }),
  ]))
  const reconnected = once<SessionStateSnapshot>(a.socket, 'sessions.state.snapshot')
  a.socket.connect()
  expect((await reconnected).sessions).toEqual((await completed).sessions)
})
