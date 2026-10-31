// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'

const transport = vi.hoisted(() => ({ sockets: [] as any[], invalidate: null as null | (() => void) }))
vi.mock('@/api/studio/session-state', () => ({ connectSessionState: () => {
  const handlers = new Map<string, Function>()
  const socket = { connected: true, handlers, on: vi.fn((event, handler) => handlers.set(event, handler)),
    emit: vi.fn(), removeAllListeners: vi.fn(), disconnect: vi.fn() }
  transport.sockets.push(socket)
  return socket
} }))
vi.mock('@/api/auth-invalidation', () => ({ onAuthInvalidated: (handler: () => void) => {
  transport.invalidate = handler
  return () => { transport.invalidate = null }
} }))
import { useSessionStateStore } from '@/stores/hermes/session-state'
import { useSessionReadState } from '@/composables/useSessionReadState'

const status = (sessionId: string, changes = {}) => ({ sessionId, working: false, backgroundPending: 0,
  lastMessageId: 10, readMessageId: 0, unread: true, ...changes })
beforeEach(() => {
  setActivePinia(createPinia()); transport.sockets = []
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => useSessionStateStore().stop())

describe('session state subscription', () => {
  it('waits for execution to finish before acknowledging completion notices', () => {
    const store = useSessionStateStore(); store.start()
    const socket = transport.sockets[0]
    socket.handlers.get('sessions.state.snapshot')({ sessions: [status('person-main-one', {
      lastMessageId: 0, lastAttentionId: 7, readAttentionId: 0, working: true,
    })] })
    store.markRead('person-main-one')
    expect(store.isUnread('person-main-one')).toBe(false)
    expect(socket.emit).not.toHaveBeenCalled()
    socket.handlers.get('sessions.state.updated')(status('person-main-one', {
      lastMessageId: 0, lastAttentionId: 7, readAttentionId: 0, working: false,
    }))
    store.markRead('person-main-one')
    expect(socket.emit).toHaveBeenLastCalledWith('sessions.read', {
      sessionId: 'person-main-one', messageId: 0, attentionId: 7,
    }, expect.any(Function))
    socket.handlers.get('sessions.state.updated')(status('person-main-one', {
      lastMessageId: 0, lastAttentionId: 8, readAttentionId: 7, working: true,
    }))
    store.markRead('person-main-one')
    expect(socket.emit).toHaveBeenCalledTimes(1)
    socket.handlers.get('sessions.state.updated')(status('person-main-one', {
      lastMessageId: 0, lastAttentionId: 8, readAttentionId: 7, working: false,
    }))
    store.markRead('person-main-one')
    expect(socket.emit).toHaveBeenLastCalledWith('sessions.read', {
      sessionId: 'person-main-one', messageId: 0, attentionId: 8,
    }, expect.any(Function))
    socket.handlers.get('sessions.state.updated')(status('person-main-one', {
      lastMessageId: 0, lastAttentionId: 8, readAttentionId: 8, unread: false,
    }))
    expect(store.isUnread('person-main-one')).toBe(false)
  })

  it('uses server activity for foreground and background work and waits for shared read confirmation', () => {
    const store = useSessionStateStore(); store.start(); store.start()
    expect(transport.sockets).toHaveLength(1)
    const socket = transport.sockets[0]
    socket.handlers.get('sessions.state.snapshot')({ sessions: [status('chat', { working: true, backgroundPending: 2 }), status('person-main-one')] })
    expect(store.isWorking('chat')).toBe(true)
    expect(store.backgroundCount('chat')).toBe(2)
    expect(store.isUnread('person-main-one')).toBe(true)
    store.markRead('chat'); store.markRead('chat')
    expect(store.isUnread('chat')).toBe(false)
    expect(socket.emit).not.toHaveBeenCalled()
    socket.handlers.get('sessions.state.updated')(status('chat'))
    store.markRead('chat'); store.markRead('chat')
    expect(socket.emit).toHaveBeenCalledTimes(1)
    expect(socket.emit).toHaveBeenCalledWith('sessions.read', { sessionId: 'chat', messageId: 10 }, expect.any(Function))
    expect(store.isUnread('chat')).toBe(true)
    socket.handlers.get('sessions.state.updated')(status('chat', { readMessageId: 10, unread: false }))
    expect(store.isUnread('chat')).toBe(false)
    expect(store.isUnread('chat', true)).toBe(false)
    expect(store.isUnread('global-agent-chat', true)).toBe(true)
    expect(store.isWorking('chat')).toBe(false)
    expect(store.isWorking('chat', true)).toBe(false)
    socket.connected = false
    store.markRead('person-main-one')
    expect(socket.emit).toHaveBeenCalledTimes(1)
    socket.handlers.get('sessions.state.snapshot')({ sessions: [status('chat', { lastMessageId: 12 })] })
    expect(store.backgroundCount('chat')).toBe(0)
    expect(store.sessions.has('person-main-one')).toBe(false)
  })

  it('discards a previous account and retained socket callbacks after logout', () => {
    const store = useSessionStateStore(); store.start()
    const old = transport.sockets[0]
    old.handlers.get('sessions.state.snapshot')({ sessions: [status('private')] })
    transport.invalidate!()
    store.start()
    old.handlers.get('sessions.state.updated')(status('private'))
    expect(store.sessions.size).toBe(0)
    expect(old.disconnect).toHaveBeenCalledOnce()
    transport.sockets[1].handlers.get('sessions.state.snapshot')({ sessions: [status('new')] })
    expect([...store.sessions.keys()]).toEqual(['new'])
  })

  it('acknowledges only the loaded, visible session and updates on visibility and navigation', async () => {
    const viewed = ref<string | null>(null)
    const wrapper = mount(defineComponent({ setup() { useSessionReadState(() => viewed.value); return () => null } }))
    const socket = transport.sockets[0]
    socket.handlers.get('sessions.state.snapshot')({ sessions: [status('chat'), status('person-main-one')] })
    await nextTick()
    expect(socket.emit).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    viewed.value = 'chat'; await nextTick()
    expect(socket.emit).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(socket.emit).toHaveBeenLastCalledWith('sessions.read', { sessionId: 'chat', messageId: 10 }, expect.any(Function))
    viewed.value = 'person-main-one'; await nextTick()
    expect(socket.emit).toHaveBeenLastCalledWith('sessions.read', { sessionId: 'person-main-one', messageId: 10 }, expect.any(Function))
    wrapper.unmount()
    socket.emit.mockClear()
    window.dispatchEvent(new Event('focus'))
    expect(socket.emit).not.toHaveBeenCalled()
  })
})
