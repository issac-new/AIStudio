// @vitest-environment jsdom
//
// TDD red-green: locks in the "?root=" plumbing for the Workspace panel.
// Covers two layers:
//   1. API layer (@/api/hermes/files): every file op carries an optional `root`
//      onto the request, so reads/writes/mutations target the task workspace,
//      not the profile home.
//   2. Store layer (useFilesStore): when workspaceRoot is set, every mutation
//      method forwards it to the API.
//
// These tests currently FAIL because patches 098/099 only threaded `root`
// through listFiles/fetchEntries. They drive the B+C implementation.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── mock @/api/client: request + the helpers upload/download use ──
// vi.mock factories are hoisted, so use vi.hoisted for shared state.
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('@/api/client', () => ({
  request: (...args: unknown[]) => requestMock(...args),
  getActiveProfileName: () => null as string | null,
  getApiKey: () => 'tok' as string,
  getBaseUrlValue: () => 'http://test' as string,
}))

import * as filesApi from '@/api/hermes/files'
import { useFilesStore } from '@/stores/hermes/files'

beforeEach(() => {
  requestMock.mockReset()
  requestMock.mockResolvedValue({ ok: true })
})

// ───────────────────────────────────────────────────────────────
// 1. API layer: each op sends `root` when provided
// ───────────────────────────────────────────────────────────────
describe('files API — root plumbing', () => {
  it('listFiles sends root as ?root= query', async () => {
    requestMock.mockResolvedValue({ entries: [], path: '' })
    await filesApi.listFiles('sub', '/ws-root')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/list')
    expect(url).toContain('path=sub')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('readFile sends root as ?root= query', async () => {
    requestMock.mockResolvedValue({ content: 'x', path: 'a.ts', size: 1 })
    await filesApi.readFile('a.ts', '/ws-root')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/read')
    expect(url).toContain('path=' + encodeURIComponent('a.ts'))
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('writeFile sends root as ?root= query (PUT)', async () => {
    await filesApi.writeFile('a.ts', 'content', '/ws-root')
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/hermes/files/write'),
      expect.objectContaining({ method: 'PUT' }),
    )
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('deleteFile sends root as ?root= query (DELETE)', async () => {
    await filesApi.deleteFile('a.ts', false, '/ws-root')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/delete')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('renameFile sends root as ?root= query (POST)', async () => {
    await filesApi.renameFile('a.ts', 'b.ts', '/ws-root')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/rename')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('mkDir sends root as ?root= query (POST)', async () => {
    await filesApi.mkDir('newdir', '/ws-root')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/mkdir')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('copyFile sends root as ?root= query (POST)', async () => {
    await filesApi.copyFile('a.ts', 'b.ts', '/ws-root')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/copy')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('uploadFiles sends root as ?root= query (multipart POST)', async () => {
    // fetch is used directly for upload; stub global fetch
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ files: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['x'], 'a.txt')
    await filesApi.uploadFiles('sub', [file], '/ws-root')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/upload')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
    vi.unstubAllGlobals()
  })

  it('getFileDownloadUrl includes root in download URL query', () => {
    const url = filesApi.getFileDownloadUrl('a.png', 'a.png', '/ws-root')
    expect(url).toContain('/api/hermes/download')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('omits root from query when not provided (back-compat)', async () => {
    requestMock.mockResolvedValue({ entries: [], path: '' })
    await filesApi.listFiles('sub')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).not.toContain('root=')
  })
})

// ───────────────────────────────────────────────────────────────
// 2. Store layer: workspaceRoot forwarded to every mutation
// ───────────────────────────────────────────────────────────────
describe('useFilesStore — forwards workspaceRoot to API', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    requestMock.mockReset()
    requestMock.mockResolvedValue({ ok: true })
  })

  async function freshStoreWithRoot() {
    const s = useFilesStore()
    s.workspaceRoot = '/ws-root'
    return s
  }

  it('openEditor passes workspaceRoot to readFile', async () => {
    requestMock.mockResolvedValue({ content: 'c', path: 'a.ts', size: 1 })
    const s = await freshStoreWithRoot()
    await s.openEditor('a.ts')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('saveEditor passes workspaceRoot to writeFile', async () => {
    const s = await freshStoreWithRoot()
    // openEditor first to populate editingFile
    requestMock.mockResolvedValue({ content: 'c', path: 'a.ts', size: 1 })
    await s.openEditor('a.ts')
    requestMock.mockClear()
    requestMock.mockResolvedValue({ ok: true })
    await s.saveEditor()
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/write')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('createDir passes workspaceRoot to mkDir', async () => {
    const s = await freshStoreWithRoot()
    requestMock.mockResolvedValue({ ok: true })
    await s.createDir('newdir')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/mkdir')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('createFile passes workspaceRoot to writeFile', async () => {
    const s = await freshStoreWithRoot()
    requestMock.mockResolvedValue({ ok: true })
    await s.createFile('newfile.ts')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/write')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('deleteEntry passes workspaceRoot to deleteFile', async () => {
    const s = await freshStoreWithRoot()
    requestMock.mockResolvedValue({ ok: true })
    const entry = { name: 'a.ts', path: 'a.ts', isDir: false, size: 0, modTime: '' } as any
    await s.deleteEntry(entry)
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/delete')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('renameEntry passes workspaceRoot to renameFile', async () => {
    const s = await freshStoreWithRoot()
    requestMock.mockResolvedValue({ ok: true })
    const entry = { name: 'a.ts', path: 'a.ts', isDir: false, size: 0, modTime: '' } as any
    await s.renameEntry(entry, 'b.ts')
    const url = requestMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/rename')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
  })

  it('uploadFiles passes workspaceRoot to the upload endpoint', async () => {
    const s = await freshStoreWithRoot()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ files: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['x'], 'a.txt')
    await s.uploadFiles([file])
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/hermes/files/upload')
    expect(url).toContain('root=' + encodeURIComponent('/ws-root'))
    vi.unstubAllGlobals()
  })
})
