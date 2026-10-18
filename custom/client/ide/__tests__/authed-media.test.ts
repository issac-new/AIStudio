// @vitest-environment node
// 媒体鉴权守门：下载 URL 去 token、workspaceRoot 透传、上游占位补丁注册。
import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/api/studio/download', () => ({
  getDownloadUrl: (path: string, _name?: string, _profile?: string | null, root?: string) =>
    `/api/studio/files/download?path=${encodeURIComponent(path)}${root ? `&root=${encodeURIComponent(root)}` : ''}&token=tok-secret`,
}))
vi.mock('../composables/useIdeWorkspace', () => ({
  useIdeWorkspace: () => ({ root: { value: null } }),
}))

import { mediaFetchUrl, stripDownloadToken } from '../utils/authedMedia'

describe('authedMedia', () => {
  it('stripDownloadToken 移除 token，保留其余参数', () => {
    const url = stripDownloadToken('/api/studio/files/download?path=a.png&root=%2Fws&token=abc')
    expect(url).not.toContain('token=')
    expect(url).toContain('path=a.png')
    expect(url).toContain('root=%2Fws')
  })

  it('mediaFetchUrl 透传 workspaceRoot 且不带 token', () => {
    const url = mediaFetchUrl('a.png', '/ws')
    expect(url).toContain('root=%2Fws')
    expect(url).not.toContain('token=')
  })

  it('patch 660 注册且 Markdown 支持 ideDeferLocalMedia 占位', () => {
    const patch = resolve(__dirname, '../../../../patches/660-client-markdown-defer-local-media.patch')
    expect(existsSync(patch)).toBe(true)
    expect(readFileSync(resolve(__dirname, '../../../../patches/series'), 'utf8'))
      .toContain('660-client-markdown-defer-local-media.patch')
    const body = readFileSync(patch, 'utf8')
    expect(body).toContain('ideDeferLocalMedia')
    expect(body).toContain('data-local-media')
  })
})
