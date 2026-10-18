// @vitest-environment node
// 补丁守卫：本轮依赖的四个上游补丁必须同时在 series 与文件里。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const patchDir = resolve(__dirname, '../../../../patches')
const series = readFileSync(resolve(patchDir, 'series'), 'utf8')
const read = (name: string) => readFileSync(resolve(patchDir, name), 'utf8')

describe('IDE 上游补丁守卫', () => {
  it('655 FileTree showFiles：文件树在 IDE 内显示文件', () => {
    expect(existsSync(resolve(patchDir, '655-client-filetree-show-files.patch'))).toBe(true)
    expect(series).toContain('655-client-filetree-show-files.patch')
    expect(read('655-client-filetree-show-files.patch')).toContain('props.showFiles')
  })

  it('656 下载 header 鉴权：剥离 URL token', () => {
    expect(series).toContain('656-client-download-auth-header.patch')
    const body = read('656-client-download-auth-header.patch')
    expect(body).toContain('authenticatedRequest')
    expect(body).toContain('Authorization')
  })

  it('657 下载 workspaceRoot：path 相对 root', () => {
    expect(series).toContain('657-client-download-workspace-root.patch')
    const body = read('657-client-download-workspace-root.patch')
    expect(body).toContain('root?: string')
    expect(body).toContain("params.set('root', root)")
  })

  it('660 Markdown 本地媒体占位：不把 API key 放进 src', () => {
    expect(series).toContain('660-client-markdown-defer-local-media.patch')
    const body = read('660-client-markdown-defer-local-media.patch')
    expect(body).toContain('ideDeferLocalMedia')
    expect(body).toContain('data-local-media')
  })
})
