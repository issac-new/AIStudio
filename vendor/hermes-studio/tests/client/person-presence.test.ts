// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
const transport = vi.hoisted(() => ({ sockets: [] as any[], invalidate: null as null | (() => void) }))
vi.mock('@/api/studio/person-presence', () => ({ connectPersonPresence: () => {
  const handlers = new Map<string, Function>()
  const socket = { connected: true, handlers, on: vi.fn((event, handler) => handlers.set(event, handler)),
    volatile: { emit: vi.fn() }, removeAllListeners: vi.fn(), disconnect: vi.fn() }
  transport.sockets.push(socket)
  return socket
} }))
vi.mock('@/api/auth-invalidation', () => ({ onAuthInvalidated: (handler: () => void) => {
  transport.invalidate = handler
  return () => { transport.invalidate = null }
} }))
import { usePersonPresenceStore } from '@/stores/hermes/person-presence'

beforeEach(() => {
  vi.useFakeTimers(); setActivePinia(createPinia()); transport.sockets = []
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => { usePersonPresenceStore().stop(); vi.useRealTimers() })

it('subscribes once for task counts without reporting user activity', () => {
  const store = usePersonPresenceStore(); store.start(); store.start()
  expect(transport.sockets).toHaveLength(1)
  const socket = transport.sockets[0]
  socket.handlers.get('person.presence')({ state: 'sleeping', backgroundTaskCount: 3, lastActivityAt: 1, sleepAt: 600001 })
  expect(store.backgroundTaskCount).toBe(3)
  for (const event of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.dispatchEvent(new Event(event))
  vi.advanceTimersByTime(20 * 60 * 1000)
  expect(socket.volatile.emit).not.toHaveBeenCalled()
})

it('clears old account state and rejects retained socket callbacks after logout', () => {
  const store = usePersonPresenceStore(); store.start()
  const old = transport.sockets[0]
  old.handlers.get('person.presence')({ state: 'thinking', backgroundTaskCount: 3, lastActivityAt: 1, sleepAt: 600001 })
  expect(store.backgroundTaskCount).toBe(3)
  transport.invalidate!()
  store.start()
  old.handlers.get('person.presence')({ state: 'searching', lastActivityAt: 1, sleepAt: 600001 })
  expect(store.snapshot).toBeNull()
  expect(store.backgroundTaskCount).toBe(0)
  expect(old.disconnect).toHaveBeenCalledOnce()
  window.dispatchEvent(new Event('keydown'))
  expect(transport.sockets[1].volatile.emit).not.toHaveBeenCalled()
  expect(old.volatile.emit).not.toHaveBeenCalled()
  transport.sockets[1].handlers.get('person.presence')({ state: 'idle', backgroundTaskCount: 2 })
  expect(store.backgroundTaskCount).toBe(2)
})

it('takes task counts from server snapshots independently of outcome animations', () => {
  const store = usePersonPresenceStore(); store.start()
  const socket = transport.sockets[0]
  socket.handlers.get('person.presence')({ state: 'done', backgroundTaskCount: 24, lastActivityAt: 1, sleepAt: 600001 })
  expect(store.backgroundTaskCount).toBe(24)
  socket.handlers.get('person.presence')({ state: 'searching', backgroundTaskCount: 2, lastActivityAt: 1, sleepAt: 600001 })
  expect(store.backgroundTaskCount).toBe(2)
  socket.handlers.get('person.presence')({ state: 'idle', backgroundTaskCount: 0, lastActivityAt: 1, sleepAt: 600001 })
  expect(store.backgroundTaskCount).toBe(0)
})

it('ignores invalid background task counts', () => {
  const store = usePersonPresenceStore(); store.start()
  const socket = transport.sockets[0]
  for (const count of [undefined, null, -1, 1.5, NaN, Infinity, '3', Number.MAX_SAFE_INTEGER + 1]) {
    socket.handlers.get('person.presence')({ state: 'idle', backgroundTaskCount: count })
    expect(store.backgroundTaskCount).toBe(0)
  }
  expect(socket.volatile.emit).not.toHaveBeenCalled()
})
