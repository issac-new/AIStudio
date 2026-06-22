import { describe, it, expect } from 'vitest'
import { parseTenant } from '@/custom/cockpit/adapters/collab-adapter'

describe('parseTenant', () => {
  it('null/undefined/empty → null', () => {
    expect(parseTenant(null)).toBeNull()
    expect(parseTenant(undefined)).toBeNull()
    expect(parseTenant('')).toBeNull()
  })

  it('matrix prefix → matrix routeTarget', () => {
    const r = parseTenant('matrix:!abc:matrix.org:Auth联调')!
    expect(r.kind).toBe('matrix')
    expect(r.label).toBe('Auth联调')
    expect(r.routeTarget).toEqual({
      name: 'hermes.matrixChatRoom',
      params: { roomId: '!abc:matrix.org' },
    })
  })

  it('group prefix → groupChatRoom routeTarget', () => {
    const r = parseTenant('group:!room2:matrix.org:后端组')!
    expect(r.kind).toBe('group')
    expect(r.label).toBe('后端组')
    expect(r.routeTarget).toEqual({
      name: 'hermes.groupChatRoom',
      params: { roomId: '!room2:matrix.org' },
    })
  })

  it('session prefix with @profile → session routeTarget with profile query', () => {
    const r = parseTenant('session:sess_001@arch:架构讨论')!
    expect(r.kind).toBe('session')
    expect(r.label).toBe('架构讨论')
    expect(r.routeTarget).toEqual({
      name: 'hermes.session',
      params: { sessionId: 'sess_001' },
      query: { profile: 'arch' },
    })
  })

  it('session prefix without @profile → no profile query', () => {
    const r = parseTenant('session:sess_002:讨论2')!
    expect(r.kind).toBe('session')
    expect(r.routeTarget).toEqual({
      name: 'hermes.session',
      params: { sessionId: 'sess_002' },
      query: {},
    })
  })

  it('unknown prefix → plain (no routeTarget)', () => {
    const r = parseTenant('platform-team')!
    expect(r.kind).toBe('plain')
    expect(r.label).toBe('platform-team')
    expect(r.routeTarget).toBeUndefined()
  })

  it('preserves raw', () => {
    expect(parseTenant('matrix:!a:b.ms:X')!.raw).toBe('matrix:!a:b.ms:X')
  })
})
