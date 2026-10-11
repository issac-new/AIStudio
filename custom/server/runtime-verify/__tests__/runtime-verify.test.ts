import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  RuntimeVerifyError,
  probeWechatDevtools,
  validateRuntimeProof,
  verifyMiniProgram,
} from '../runtime-verify'

/** 临时假工具目录（探针可注入 appDir） */
function fakeToolsDir(withCli: boolean): string {
  const d = join(tmpdir(), 'rv-probe-' + Date.now())
  const cli = join(d, 'wechatwebdevtools.app/Contents/MacOS')
  mkdirSync(cli, { recursive: true })
  if (withCli) writeFileSync(join(cli, 'cli'), '#!/bin/sh\n', 'utf-8')
  return d
}

const GOOD_RECORD = {
  tool: 'wechat-devtools',
  projectPath: '/x/wechat',
  appid: null,
  launchOk: true,
  screenshot: 'evidence/runtime-proof.png',
  checkedAt: '2026-10-11T12:00:00.000Z',
}

describe('runtime-verify：目标运行时验证能力（真工具演示轮根治件）', () => {
  it('探针：工具在位性如实（假目录有 cli=installed；无 cli=缺席）', () => {
    expect(probeWechatDevtools(fakeToolsDir(true)).installed).toBe(true)
    const absent = probeWechatDevtools(fakeToolsDir(false))
    expect(absent.installed).toBe(false)
    expect(absent.detail).toContain('未安装')
  })

  it('validateRuntimeProof：全字段在位过；launchOk=false/缺帧=违例', () => {
    expect(validateRuntimeProof(GOOD_RECORD).ok).toBe(true)
    const bad = validateRuntimeProof({ ...GOOD_RECORD, launchOk: false, screenshot: null })
    expect(bad.ok).toBe(false)
    expect(bad.violations.some((v) => v.includes('launchOk'))).toBe(true)
    expect(bad.violations.some((v) => v.includes('screenshot'))).toBe(true)
  })

  it('verifyMiniProgram：工程不存在 → PROJECT_ABSENT（不静默）', async () => {
    await expect(verifyMiniProgram({ projectPath: '/nonexistent-xyz', outDir: '/tmp' }))
      .rejects.toBeInstanceOf(RuntimeVerifyError)
  })

  // 真工具端到端：默认跳过（RUNTIME_VERIFY_E2E=1 且能力在位时实跑——venv 缺席同款 skip 形态）
  const _probe = probeWechatDevtools()
  const _e2e = process.env.RUNTIME_VERIFY_E2E === '1' && _probe.installed && _probe.automatorSdk
  ;(_e2e ? it : it.skip)('真工具端到端：编译+启动+首帧+记录', async () => {
    const proj = process.env.RUNTIME_VERIFY_PROJECT as string
    const out = join(tmpdir(), 'rv-e2e-' + Date.now())
    const rec = await verifyMiniProgram({ projectPath: proj, outDir: out, appid: process.env.RUNTIME_VERIFY_APPID })
    expect(validateRuntimeProof(rec).ok).toBe(true)
    expect(JSON.parse(readFileSync(join(out, 'runtime-proof.json'), 'utf-8')).launchOk).toBe(true)
    rmSync(out, { recursive: true, force: true })
  })
})

// ── 长会话治理 B5：注册表 ────────────────────────────────────────────────────

describe('verifier registry (B5)', () => {
  it('miniprogram is registered and enumerable via describeVerifiers', async () => {
    // runtime-verify 模块加载即完成登记（副作用 import）
    await import('../runtime-verify')
    const { describeVerifiers, getVerifier } = await import('../verifier-registry')
    const list = describeVerifiers()
    const mp = list.find((v) => v.id === 'miniprogram-wechat')
    expect(mp).toBeDefined()
    expect(mp!.kind).toBe('runtime-proof')
    expect(typeof mp!.probe.installed).toBe('boolean')
    expect(typeof mp!.probe.detail).toBe('string')
    expect(typeof getVerifier('miniprogram-wechat')!.verify).toBe('function')
  })
})
