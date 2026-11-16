// 受信 gate 目录构建：服务端 env 唯一来源，任何非法配置 fail-closed（不允许回退进程 cwd/编辑器字段）。
import { describe, it, expect } from 'vitest'
import { buildTrustedGateCatalog, GateCatalogConfigError } from '../gate-catalog'

const ENV = {
  LOOP_GATE_COMMANDS: 'go test ./... ,/usr/bin/true',
  LOOP_GATE_CWD: '/srv/checkout',
} as NodeJS.ProcessEnv

describe('buildTrustedGateCatalog', () => {
  it('空配置返回空目录（缺省安全：gate 带命令即拒）', () => {
    expect(buildTrustedGateCatalog({})).toEqual([])
    expect(buildTrustedGateCatalog({ LOOP_GATE_COMMANDS: '  ' })).toEqual([])
  })

  it('合法 env → 精确命令键 + 固定 argv + cwd/timeout', () => {
    const catalog = buildTrustedGateCatalog({ ...ENV })
    expect(catalog).toEqual([
      {
        command: 'go test ./...',
        argv: ['go', 'test', './...'],
        cwd: '/srv/checkout',
        timeoutMs: 120_000,
        envAllowlist: [],
        writableRoots: [],
      },
      {
        command: '/usr/bin/true',
        argv: ['/usr/bin/true'],
        cwd: '/srv/checkout',
        timeoutMs: 120_000,
        envAllowlist: [],
        writableRoots: [],
      },
    ])
  })

  it('自定义 timeout/envAllowlist/writableRoots 全量生效', () => {
    const catalog = buildTrustedGateCatalog({
      LOOP_GATE_COMMANDS: 'make check',
      LOOP_GATE_CWD: '/srv/checkout',
      LOOP_GATE_TIMEOUT_MS: '45000',
      LOOP_GATE_ENV_ALLOWLIST: 'CI,GOFLAGS',
      LOOP_GATE_WRITABLE_ROOTS: '/srv/checkout/dist,/srv/checkout/.tmp',
    })
    expect(catalog).toEqual([{
      command: 'make check',
      argv: ['make', 'check'],
      cwd: '/srv/checkout',
      timeoutMs: 45_000,
      envAllowlist: ['CI', 'GOFLAGS'],
      writableRoots: ['/srv/checkout/dist', '/srv/checkout/.tmp'],
    }])
  })

  it('非空命令表缺 LOOP_GATE_CWD → 配置错误（不回退进程 cwd）', () => {
    expect(() => buildTrustedGateCatalog({ LOOP_GATE_COMMANDS: 'make check' }))
      .toThrow(GateCatalogConfigError)
  })

  it('cwd 必须是绝对路径', () => {
    expect(() => buildTrustedGateCatalog({ ...ENV, LOOP_GATE_CWD: 'relative/dir' }))
      .toThrow(GateCatalogConfigError)
  })

  it('命令含引号或 shell 控制符 → 拒绝', () => {
    for (const bad of ['sh -c "echo hi"', 'echo a;b', 'echo $HOME', 'echo `id`', "echo 'x'", 'echo \\x', 'echo >f']) {
      expect(() => buildTrustedGateCatalog({ LOOP_GATE_COMMANDS: bad, LOOP_GATE_CWD: '/srv' }))
        .toThrow(GateCatalogConfigError)
    }
  })

  it('重复命令键 → 拒绝（幂等目录，不允许同键双义）', () => {
    expect(() => buildTrustedGateCatalog({ LOOP_GATE_COMMANDS: 'make check,make check', LOOP_GATE_CWD: '/srv' }))
      .toThrow(GateCatalogConfigError)
  })

  it('非法 timeout / env 名 / writableRoot → 拒绝', () => {
    expect(() => buildTrustedGateCatalog({ ...ENV, LOOP_GATE_TIMEOUT_MS: '0' })).toThrow(GateCatalogConfigError)
    expect(() => buildTrustedGateCatalog({ ...ENV, LOOP_GATE_TIMEOUT_MS: 'abc' })).toThrow(GateCatalogConfigError)
    expect(() => buildTrustedGateCatalog({ ...ENV, LOOP_GATE_ENV_ALLOWLIST: 'BAD-NAME' })).toThrow(GateCatalogConfigError)
    expect(() => buildTrustedGateCatalog({ ...ENV, LOOP_GATE_WRITABLE_ROOTS: 'relative' })).toThrow(GateCatalogConfigError)
  })
})
