// R1（2026-10-31 首批执行）：rsi-maturity 探针三级路径修复——三态测试。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectRsiMaturity, countCapabilityGaps, gapRegisterCandidates } from '../rsi-maturity'

let dir: string
const prevHome = process.env.HERMES_HOME
const prevGap = process.env.GAP_REGISTER_PATH

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rsi-m-path-'))
  process.env.HERMES_HOME = dir
  delete process.env.GAP_REGISTER_PATH
  // 复刻 ladder/watchdog/soul 三探针目标（gap 由 GAP_REGISTER_PATH 控制）
  mkdirSync(join(dir, 'profiles/_shared/01-scheduling-bus'), { recursive: true })
  writeFileSync(join(dir, 'profiles/_shared/01-scheduling-bus/capability-ladder.md'), 'x')
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(join(dir, 'bin/capability-gap-watchdog.py'), 'x')
  mkdirSync(join(dir, 'profiles/orchestrator'), { recursive: true })
  writeFileSync(join(dir, 'profiles/orchestrator/SOUL.md'), 'x')
})

afterEach(() => {
  if (prevHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = prevHome
  if (prevGap !== undefined) process.env.GAP_REGISTER_PATH = prevGap
  else delete process.env.GAP_REGISTER_PATH
  rmSync(dir, { recursive: true, force: true })
})

describe('R1 gap_register 探针三级路径', () => {
  it('三级序：env 覆盖优先于 life-workbench 新址与旧址兜底', () => {
    const envPath = join(dir, 'custom-gap.yaml')
    writeFileSync(envPath, 'entries:\n  - domain: capability\n    description: t\n')
    process.env.GAP_REGISTER_PATH = envPath
    expect(gapRegisterCandidates()[0]).toBe(envPath)
    expect(countCapabilityGaps()).toBe(1)
  })

  it('env 失效且旧址缺文件 → 探针失效：L2=null 且证据锚点如实写三址', () => {
    process.env.GAP_REGISTER_PATH = join(dir, 'nonexistent.yaml')
    const report = collectRsiMaturity()
    const l2 = report.levels.find((l) => l.key === 'L2')
    expect(l2?.achieved).toBeNull()
    expect(JSON.stringify(l2?.evidence)).toContain('探针失效')
    expect(JSON.stringify(l2?.evidence)).toContain('三址均缺')
  })

  it('旧址兜底可用（他机未迁移场景）：写 ~/.hermes/gap_register.yaml 命中', () => {
    writeFileSync(join(dir, 'gap_register.yaml'), 'entries:\n  - domain: capability\n  - domain: other\n')
    const report = collectRsiMaturity()
    const l2 = report.levels.find((l) => l.key === 'L2')
    expect(l2?.achieved).toBe(true)
    expect(countCapabilityGaps()).toBe(1)
  })

  it('文件不可读（损坏 YAML 仍按行匹配；目录型不可读→null 不抛）', () => {
    const envPath = join(dir, 'unreadable')
    mkdirSync(envPath)
    process.env.GAP_REGISTER_PATH = envPath
    expect(countCapabilityGaps()).toBeNull()
  })
})
