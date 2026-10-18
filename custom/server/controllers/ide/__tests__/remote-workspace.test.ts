// overlay/custom/server/controllers/ide/__tests__/remote-workspace.test.ts
// G6 远程工作区诊断守门：只读 status/list、SSH 只回布尔、探针超时/错误不抛栈、
// 列目录排序与 200 上限。依赖注入桩，不加载上游 file-provider。
import { describe, it, expect } from 'vitest'
import { remoteStatus, remoteList, REMOTE_LIST_LIMIT, type RemoteDeps } from '../remote-workspace'

function deps(over: Partial<RemoteDeps> = {}): RemoteDeps {
  return {
    getTerminalConfig: () => ({ backend: 'local' }),
    createProvider: async () => ({ listDir: async () => [] }),
    profileHome: () => '/Users/x/.hermes',
    readEnvKeys: () => new Set<string>(),
    now: (() => { let t = 1000; return () => (t += 10) })(),
    ...over,
  }
}

describe('remoteStatus', () => {
  it('local 探针成功：backend/cwd/ssh 布尔齐备，无 secret 字段', async () => {
    const status = await remoteStatus(deps({
      getTerminalConfig: () => ({ backend: 'local', cwd: '/work' }),
      readEnvKeys: () => new Set(['TERMINAL_SSH_HOST', 'TERMINAL_SSH_USER']),
    }))
    expect(status.ok).toBe(true)
    expect(status.backend).toBe('local')
    expect(status.cwd).toBe('/work')
    expect(status.probe).toMatchObject({ ok: true, path: '/work' })
    expect(status.ssh).toEqual({ host: true, user: true, key: false, port: null })
    expect(JSON.stringify(status)).not.toContain('TERMINAL_SSH_HOST')
  })

  it('docker 探针失败：结构化 code，不抛栈；docker 字段只回布尔', async () => {
    const status = await remoteStatus(deps({
      getTerminalConfig: () => ({ backend: 'docker', docker_image: 'img', docker_container_name: 'box' }),
      createProvider: async () => { throw Object.assign(new Error('Cannot determine Docker container'), { code: 'backend_error' }) },
    }))
    expect(status.ok).toBe(false)
    expect(status.backend).toBe('docker')
    expect(status.docker).toEqual({ image: true, container: true })
    expect(status.probe.code).toBe('backend_error')
    expect(status.probe.detail).toContain('Docker')
  })

  it('探针超时：code=backend_timeout，且有耗时', async () => {
    const status = await remoteStatus(deps({
      createProvider: async () => ({ listDir: () => new Promise(() => {}) }),
      timeoutMs: 20,
    }))
    expect(status.ok).toBe(false)
    expect(status.probe.code).toBe('backend_timeout')
    expect(status.probe.ms).toBeGreaterThanOrEqual(0)
  })

  it('ssh 端口从 env 读取；非数字回落 null', async () => {
    const a = await remoteStatus(deps({ env: { TERMINAL_SSH_PORT: '2222' } }))
    expect(a.ssh.port).toBe(2222)
    const b = await remoteStatus(deps({ env: { TERMINAL_SSH_PORT: 'abc' } }))
    expect(b.ssh.port).toBeNull()
  })
})

describe('remoteList', () => {
  it('默认路径：local=home，远程=/；目录优先、名称升序', async () => {
    const seen: string[] = []
    const list = await remoteList(deps({
      getTerminalConfig: () => ({ backend: 'local' }),
      createProvider: async () => ({
        listDir: async (p: string) => {
          seen.push(p)
          return [
            { name: 'b.txt', path: 'b.txt', isDir: false, size: 2 },
            { name: 'a', path: 'a', isDir: true, size: 0 },
            { name: 'A', path: 'A', isDir: true, size: 0 },
          ]
        },
      }),
    }), {})
    expect(seen).toEqual(['/Users/x/.hermes'])
    expect(list.entries.map(e => e.name)).toEqual(['A', 'a', 'b.txt'])
  })

  it('远程 backend 默认路径为 /；显式 path 优先', async () => {
    const seen: string[] = []
    const d = deps({
      getTerminalConfig: () => ({ backend: 'ssh' }),
      createProvider: async () => ({ listDir: async (p: string) => { seen.push(p); return [] } }),
    })
    await remoteList(d, {})
    await remoteList(d, { path: '/srv/app' })
    expect(seen).toEqual(['/', '/srv/app'])
  })

  it('200 上限 + truncated；错误结构化', async () => {
    const many = Array.from({ length: REMOTE_LIST_LIMIT + 5 }, (_, i) => ({ name: `f${i}`, path: `f${i}`, isDir: false, size: 0 }))
    const list = await remoteList(deps({ createProvider: async () => ({ listDir: async () => many }) }), {})
    expect(list.entries).toHaveLength(REMOTE_LIST_LIMIT)
    expect(list.truncated).toBe(true)

    const bad = await remoteList(deps({ createProvider: async () => { throw Object.assign(new Error('no such dir'), { code: 'not_found' }) } }), { path: '/nope' })
    expect(bad.ok).toBe(false)
    expect(bad.code).toBe('not_found')
    expect(bad.entries).toEqual([])
  })

  it('provider 返回的条目字段被裁剪（不透传多余字段）', async () => {
    const list = await remoteList(deps({
      createProvider: async () => ({ listDir: async () => [{ name: 'x', path: 'x', isDir: false, size: 1, secret: 'nope' } as never] }),
    }), {})
    expect(Object.keys(list.entries[0]).sort()).toEqual(['isDir', 'name', 'path', 'size'])
  })
})
