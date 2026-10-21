// AGT 吸收轮 C（2026-10-21）：Shadow agent 进程扫描单测——指纹判定与检测器纯函数面。
import { describe, expect, it } from 'vitest'
import { classifyHermesCommand, parsePsLines } from '../process-scan'
import { detectUnregisteredAgents, detectMcpDrift } from '../detectors'
import type { ClusterSnapshot } from '../collectors'

describe('classifyHermesCommand（进程指纹）', () => {
  it('hermes -p <profile> chat → agent + profile', () => {
    expect(classifyHermesCommand('hermes -p alpha chat -q')).toEqual({ kind: 'agent', profile: 'alpha' })
  })
  it('--profile 长参 → agent + profile', () => {
    expect(classifyHermesCommand('/usr/local/bin/hermes --profile beta chat')).toEqual({ kind: 'agent', profile: 'beta' })
  })
  it('gateway run → gateway', () => {
    expect(classifyHermesCommand('python3 /opt/hermes-agent/hermes gateway run')).toEqual({ kind: 'gateway', profile: null })
  })
  it('无 -p 的 chat → agent 但 profile 不可归属', () => {
    expect(classifyHermesCommand('hermes chat')).toEqual({ kind: 'agent', profile: null })
  })
  it('studio server / vitest 自身噪音 → 排除', () => {
    expect(classifyHermesCommand('node /x/hermes-studio/packages/server/dist/index.js')).toBeNull()
    expect(classifyHermesCommand('node vitest run custom/server/x.test.ts')).toBeNull()
  })
  it('无关进程 → null', () => {
    expect(classifyHermesCommand('Google Chrome Helper')).toBeNull()
  })
})

describe('parsePsLines', () => {
  it('pid ppid command 三段解析，command 含空格整取', () => {
    const rows = parsePsLines('  PID  PPID COMMAND\n 101 1 hermes -p a chat\n 102 5 /bin/zsh -l\n')
    expect(rows).toEqual([
      { pid: 101, ppid: 1, command: 'hermes -p a chat' },
      { pid: 102, ppid: 5, command: '/bin/zsh -l' },
    ])
  })
})

function snapOf(face: unknown): ClusterSnapshot {
  return { processScan: face } as unknown as ClusterSnapshot
}

describe('detectUnregisteredAgents（未注册 agent 检测）', () => {
  it('-p 指向未注册 profile → high 异常', () => {
    const out = detectUnregisteredAgents(snapOf({
      ok: true, scanned: true, at: 0, registered: ['default', 'alpha'],
      procs: [{ pid: 9, ppid: 1, command: 'hermes -p ghost chat', profile: 'ghost', kind: 'agent' }],
    }))
    expect(out).toHaveLength(1)
    expect(out[0].detector).toBe('security.shadow-agent')
    expect(out[0].severity).toBe('high')
    expect(out[0].summary).toContain('ghost')
  })
  it('已注册 profile → 不报', () => {
    const out = detectUnregisteredAgents(snapOf({
      ok: true, scanned: true, at: 0, registered: ['default', 'alpha'],
      procs: [{ pid: 9, ppid: 1, command: 'hermes -p alpha chat', profile: 'alpha', kind: 'agent' }],
    }))
    expect(out).toHaveLength(0)
  })
  it('无法归属（无 -p）→ warn 如实报', () => {
    const out = detectUnregisteredAgents(snapOf({
      ok: true, scanned: true, at: 0, registered: ['default'],
      procs: [{ pid: 9, ppid: 1, command: 'hermes chat', profile: null, kind: 'agent' }],
    }))
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('warn')
  })
  it('面缺席/未扫=合法空态静默', () => {
    expect(detectUnregisteredAgents(snapOf(undefined))).toHaveLength(0)
    expect(detectUnregisteredAgents(snapOf({ ok: true, scanned: false, at: 0, procs: [], registered: [] }))).toHaveLength(0)
  })
})

describe('detectMcpDrift（配置漂移检测）', () => {
  it('无基线=合法空态', () => {
    expect(detectMcpDrift({ mcpDrift: { ok: true, at: 0, hasBaseline: false, baselineAt: null, drift: [] } } as unknown as ClusterSnapshot)).toHaveLength(0)
  })
  it('新增=high；变更/移除=warn', () => {
    const face = {
      ok: true, at: 0, hasBaseline: true, baselineAt: 1,
      drift: [
        { face: 'mcp-server', key: 'evil-connector', change: 'added' },
        { face: 'plugin', key: 'plugins/foo', change: 'changed' },
        { face: 'mcp-server', key: 'old', change: 'removed' },
      ],
    }
    const out = detectMcpDrift({ mcpDrift: face } as unknown as ClusterSnapshot)
    expect(out).toHaveLength(3)
    expect(out.find((a) => a.summary.includes('新增'))?.severity).toBe('high')
    expect(out.find((a) => a.summary.includes('变更'))?.severity).toBe('warn')
    expect(out.find((a) => a.summary.includes('移除'))?.severity).toBe('warn')
  })
})
