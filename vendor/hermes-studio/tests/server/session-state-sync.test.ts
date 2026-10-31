import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as connect, type Socket } from 'socket.io-client'
import type { SessionListState } from '../../packages/shared/session-state'

const state = vi.hoisted(() => ({ db: null as DatabaseSync | null }))
vi.mock('../../packages/server/src/modules/studio/infrastructure/database', () => ({ getDb: () => state.db }))
import { SessionStateSync } from '../../packages/server/src/modules/studio/services/session-state'
import { listSessionStateRecords, recordSessionAttention } from '../../packages/server/src/modules/studio/repositories/session-state-store'

let server: Server
let sync: SessionStateSync
let origin: string
const clients: Socket[] = []
const runtime = new Map<string, { working: boolean; backgroundPending: number }>()
function once<T = any>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${event}`)), 3000)
    socket.once(event, value => { clearTimeout(timer); resolve(value) })
  })
}
async function device(user = 1) {
  const socket = connect(`${origin}/chat-run`, { autoConnect: false, transports: ['websocket'],
    query: { session_state: '1' }, auth: { user } })
  clients.push(socket)
  const snapshot = once<{ sessions: SessionListState[] }>(socket, 'sessions.state.snapshot')
  socket.connect()
  return { socket, snapshot: (await snapshot).sessions }
}
function assistant(sessionId: string, content = 'Result') {
  return Number(state.db!.prepare("INSERT INTO messages(session_id,role,content) VALUES (?,'assistant',?)").run(sessionId, content).lastInsertRowid)
}
function read(socket: Socket, sessionId: string, messageId: number, attentionId?: number) {
  return new Promise<{ ok: boolean }>(resolve => socket.emit('sessions.read', { sessionId, messageId, attentionId }, resolve))
}

beforeEach(async () => {
  state.db = new DatabaseSync(':memory:')
  state.db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE sessions(id TEXT PRIMARY KEY,profile TEXT DEFAULT 'default',source TEXT DEFAULT 'cli',studio_user_id TEXT);
    CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,role TEXT,content TEXT);
    INSERT INTO sessions(id) VALUES ('chat');
    INSERT INTO sessions(id,profile) VALUES ('research','research');
    INSERT INTO sessions(id,studio_user_id) VALUES ('person-main-one','1'),('person-main-two','2');
    INSERT INTO sessions(id,source) VALUES ('group','group_chat'),('workflow','workflow'),('global','global_agent'),('person-task-hidden','builtin_agent');`)
  runtime.clear()
  sync = new SessionStateSync(id => runtime.get(id) || { working: false, backgroundPending: 0 },
    (user, profile) => profile === 'default' || user.id === 1)
  const http = createServer()
  server = new Server(http)
  const namespace = server.of('/chat-run')
  namespace.use((socket, next) => {
    if (Number(socket.handshake.auth.user) > 0) socket.data.user = { id: Number(socket.handshake.auth.user), username: 'test', role: 'user' }
    next()
  })
  namespace.on('connection', socket => sync.attach(socket))
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(http.address() as any).port}`
})
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  sync.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  state.db?.close()
})

describe('account session state over Socket.IO', () => {
  it('migrates existing message receipts without losing their read position', async () => {
    const messageId = assistant('chat')
    state.db!.exec(`CREATE TABLE session_read_state(user_id INTEGER,session_id TEXT,message_id INTEGER,PRIMARY KEY(user_id,session_id))`)
    state.db!.prepare('INSERT INTO session_read_state VALUES (1,?,?)').run('chat', messageId)
    const a = await device()
    expect(a.snapshot.find(s => s.sessionId === 'chat')).toMatchObject({
      unread: false, readMessageId: messageId, lastAttentionId: 0, readAttentionId: 0,
    })
  })

  it('persists distinct collaboration notices and never clears a newer handoff with a stale receipt', async () => {
    recordSessionAttention('person-main-one', 'stage:first')
    let a = await device()
    const first = a.snapshot.find(s => s.sessionId === 'person-main-one')!
    expect(first).toMatchObject({ unread: true, lastMessageId: 0 })
    await read(a.socket, first.sessionId, 0, first.lastAttentionId)
    recordSessionAttention('person-main-one', 'stage:first')
    a = await device()
    expect(a.snapshot.find(s => s.sessionId === first.sessionId)).toMatchObject({ unread: false, lastAttentionId: first.lastAttentionId })
    recordSessionAttention(first.sessionId, 'stage:second')
    await read(a.socket, first.sessionId, 0, first.lastAttentionId)
    await read(a.socket, first.sessionId, 0) // An older client cannot acknowledge unseen notices.
    a = await device()
    expect(a.snapshot.find(s => s.sessionId === first.sessionId)?.unread).toBe(true)
    await read(a.socket, first.sessionId, 0, Number.MAX_SAFE_INTEGER)
    const beforeNew = listSessionStateRecords(1, first.sessionId)[0]
    expect(beforeNew.readAttentionId).toBe(beforeNew.lastAttentionId)
    recordSessionAttention(first.sessionId, 'stage:third')
    a = await device()
    expect(a.snapshot.find(s => s.sessionId === first.sessionId)?.unread).toBe(true)
  })

  it('ignores legacy internal handoff notices while retaining completion notices', async () => {
    recordSessionAttention('person-main-one', 'person-stage:legacy:0')
    const a = await device()
    expect(a.snapshot.find(s => s.sessionId === 'person-main-one')).toMatchObject({ unread: false, lastAttentionId: 0 })
    recordSessionAttention('person-main-one', 'person-flow-completed:relay:0')
    const updated = once<SessionListState>(a.socket, 'sessions.state.updated')
    sync.publish('person-main-one')
    const completed = await updated
    expect(completed).toMatchObject({ unread: true, lastMessageId: 0 })
    expect(await read(a.socket, completed.sessionId, 0, completed.lastAttentionId)).toEqual({ ok: true })
  })

  it('synchronizes ordinary chats in login-disabled installations without exposing private Person sessions', async () => {
    const messageId = assistant('chat')
    const a = await device(0), b = await device(0)
    expect(a.snapshot.map(s => s.sessionId)).toEqual(['chat'])
    const changed = once<SessionListState>(b.socket, 'sessions.state.updated')
    expect(await read(a.socket, 'chat', messageId)).toEqual({ ok: true })
    expect(await changed).toMatchObject({ unread: false, readMessageId: messageId })
  })
  it.each(['chat', 'person-main-one'])('keeps %s breathing across devices until background work settles', async sessionId => {
    const a = await device(), b = await device()
    let first = once<SessionListState>(a.socket, 'sessions.state.updated')
    let second = once<SessionListState>(b.socket, 'sessions.state.updated')
    sync.observe('run.started', { session_id: sessionId })
    expect(await first).toMatchObject({ sessionId, working: true })
    expect(await second).toMatchObject({ sessionId, working: true })
    const messageId = assistant(sessionId)
    first = once(a.socket, 'sessions.state.updated'); second = once(b.socket, 'sessions.state.updated')
    sync.observe('run.completed', { session_id: sessionId, background_pending: 2 })
    expect(await first).toMatchObject({ working: true, backgroundPending: 2, unread: false, lastMessageId: messageId })
    expect(await second).toMatchObject({ working: true, backgroundPending: 2, unread: false })
    const reconnect = await device()
    expect(reconnect.snapshot.find(s => s.sessionId === sessionId)).toMatchObject({ working: true, backgroundPending: 2, unread: false })
    expect(await read(a.socket, sessionId, messageId)).toEqual({ ok: false })
    second = once(b.socket, 'sessions.state.updated')
    sync.observe('delegation.updated', { session_id: sessionId, background_pending: 0 })
    expect(await second).toMatchObject({ working: false, backgroundPending: 0, unread: true })
    second = once(b.socket, 'sessions.state.updated')
    expect(await read(a.socket, sessionId, messageId)).toEqual({ ok: true })
    expect(await second).toMatchObject({ working: false, backgroundPending: 0, unread: false })
  })

  it.each(['run.completed', 'run.failed', 'abort.completed'])('defers partial-message unread until %s', async event => {
    const a = await device()
    const started = once<SessionListState>(a.socket, 'sessions.state.updated')
    sync.observe('run.started', { session_id: 'chat' })
    await started
    const messageId = assistant('chat', 'Partial response')
    const interim = once<SessionListState>(a.socket, 'sessions.state.updated')
    sync.observe('message.interim', { session_id: 'chat' })
    expect(await interim).toMatchObject({ working: true, unread: false, lastMessageId: messageId, readMessageId: 0 })
    expect(await read(a.socket, 'chat', messageId)).toEqual({ ok: false })
    const terminal = once<SessionListState>(a.socket, 'sessions.state.updated')
    sync.observe(event, { session_id: 'chat' })
    expect(await terminal).toMatchObject({ working: false, unread: true, lastMessageId: messageId, readMessageId: 0 })
  })

  it('persists read cursors and does not acknowledge newer messages from a delayed device', async () => {
    const a = await device()
    const old = assistant('chat')
    const latest = assistant('chat')
    expect(await read(a.socket, 'chat', old)).toEqual({ ok: true })
    let b = await device()
    expect(b.snapshot.find(s => s.sessionId === 'chat')).toMatchObject({ unread: true, lastMessageId: latest, readMessageId: old })
    await read(b.socket, 'chat', latest)
    await read(a.socket, 'chat', old)
    // A new service instance, like a process restart, reads the same persisted cursor.
    sync.close()
    sync = new SessionStateSync(() => ({ working: false, backgroundPending: 0 }), () => true)
    b = await device()
    expect(b.snapshot.find(s => s.sessionId === 'chat')).toMatchObject({ unread: false, readMessageId: latest })
    await read(b.socket, 'chat', Number.MAX_SAFE_INTEGER)
    const newer = assistant('chat')
    b = await device()
    expect(b.snapshot.find(s => s.sessionId === 'chat')).toMatchObject({ unread: true, lastMessageId: newer, readMessageId: latest })
  })

  it('isolates accounts, private Person sessions and Profile access', async () => {
    const one = assistant('person-main-one')
    assistant('person-main-two')
    const a = await device(), b = await device(2)
    expect(a.snapshot.map(s => s.sessionId)).toEqual(['chat', 'research', 'person-main-one'])
    expect(a.snapshot.find(s => s.sessionId === 'research')?.profile).toBe('research')
    expect(a.snapshot.find(s => s.sessionId === 'chat')?.profile).toBe('default')
    expect(b.snapshot.map(s => s.sessionId)).toEqual(['chat', 'person-main-two'])
    expect(await read(b.socket, 'person-main-one', one)).toEqual({ ok: false })
    expect(await read(b.socket, 'research', 0)).toEqual({ ok: false })
    for (const cursor of [-1, NaN, 1.5]) expect(await read(a.socket, 'chat', cursor)).toEqual({ ok: false })
    const normal = assistant('chat')
    await read(a.socket, 'chat', normal)
    const other = await device(2)
    expect(other.snapshot.find(s => s.sessionId === 'chat')?.unread).toBe(true)
    state.db!.prepare("DELETE FROM sessions WHERE id='chat'").run()
    expect(listSessionStateRecords(1).some(s => s.id === 'chat')).toBe(false)
    expect(state.db!.prepare("SELECT * FROM session_read_state WHERE session_id='chat'").all()).toEqual([])
  })

  it('snapshots background activity without requiring any device to open its transcript', async () => {
    runtime.set('chat', { working: false, backgroundPending: 3 })
    runtime.set('person-main-one', { working: false, backgroundPending: 2 })
    const a = await device()
    expect(a.snapshot.find(s => s.sessionId === 'chat')).toMatchObject({ working: true, backgroundPending: 3 })
    expect(a.snapshot.find(s => s.sessionId === 'person-main-one')).toMatchObject({ working: true, backgroundPending: 2 })
    runtime.set('person-main-one', { working: false, backgroundPending: 0 })
    const changed = once<{ sessions: SessionListState[] }>(a.socket, 'sessions.state.snapshot')
    sync.refreshPerson(1)
    expect((await changed).sessions.find(s => s.sessionId === 'person-main-one')).toMatchObject({ working: false, backgroundPending: 0 })
  })

  it.each(['run.failed', 'abort.completed'])('clears foreground activity on %s while retaining queued background work', async event => {
    const a = await device()
    let changed = once<SessionListState>(a.socket, 'sessions.state.updated')
    sync.observe('run.started', { session_id: 'chat' })
    expect(await changed).toMatchObject({ working: true })
    changed = once(a.socket, 'sessions.state.updated')
    sync.observe(event, { session_id: 'chat', background_pending: 1 })
    expect(await changed).toMatchObject({ working: true, backgroundPending: 1 })
    changed = once(a.socket, 'sessions.state.updated')
    sync.observe('delegation.updated', { session_id: 'chat', background_pending: 0 })
    expect(await changed).toMatchObject({ working: false })
  })

  it('clears a queued continuation when its last queued message is cancelled', async () => {
    const a = await device()
    let changed = once<SessionListState>(a.socket, 'sessions.state.updated')
    sync.observe('run.completed', { session_id: 'chat', queue_remaining: 1 })
    expect(await changed).toMatchObject({ working: true })
    changed = once(a.socket, 'sessions.state.updated')
    sync.observe('run.queued', { session_id: 'chat', queue_length: 0 })
    expect(await changed).toMatchObject({ working: false })
  })
})
