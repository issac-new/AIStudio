// 模型指纹采集单测（F4）：env 解析、profile 解析、优先级与不猜。
// 变异探针：把「给 profile 但读不到时不回落 env」去掉 → 第 3 例会红；
// 把 model.default 读成 model.provider → 第 2 例会红。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  profileConfigPath, resolveModelFromEnv, resolveModelFromProfile, resolveModelRef,
} from '../model-fingerprint-source'

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mf-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

function writeProfile(name: string, yaml: string): void {
  if (name === 'default') {
    writeFileSync(join(home, 'config.yaml'), yaml)
    return
  }
  mkdirSync(join(home, 'profiles', name), { recursive: true })
  writeFileSync(join(home, 'profiles', name, 'config.yaml'), yaml)
}

describe('resolveModelFromEnv', () => {
  it('三要素任一存在即返回；全空返回 null', () => {
    expect(resolveModelFromEnv({ HERMES_MODEL: 'glm-5.3' })).toEqual({ model: 'glm-5.3' })
    expect(resolveModelFromEnv({ HERMES_MODEL_PROVIDER: 'p', HERMES_MODEL: 'm', HERMES_MODEL_VERSION: '1' }))
      .toEqual({ provider: 'p', model: 'm', version: '1' })
    expect(resolveModelFromEnv({})).toBeNull()
  })
})

describe('resolveModelFromProfile', () => {
  it('读 model.default + model.provider', () => {
    writeProfile('worker-a', 'model:\n  default: glm-5.3\n  provider: cc-switch-route\n')
    expect(resolveModelFromProfile('worker-a', home)).toEqual({ provider: 'cc-switch-route', model: 'glm-5.3' })
  })

  it('支持 model 为字符串的形态；default 走根配置', () => {
    writeProfile('default', 'model: simple-model\n')
    expect(resolveModelFromProfile('default', home)).toEqual({ model: 'simple-model' })
  })

  it('配置缺席/无 model 字段返回 null（不猜）', () => {
    expect(resolveModelFromProfile('ghost', home)).toBeNull()
    writeProfile('bare', 'approvals:\n  mode: smart\n')
    expect(resolveModelFromProfile('bare', home)).toBeNull()
  })

  it('坏档不抛，返回 null', () => {
    writeProfile('broken', 'model: [unclosed\n')
    expect(resolveModelFromProfile('broken', home)).toBeNull()
  })

  it('profileConfigPath：default 与具名 profile 路径规则', () => {
    expect(profileConfigPath('default', '/h')).toBe('/h/config.yaml')
    expect(profileConfigPath('x', '/h')).toBe('/h/profiles/x/config.yaml')
  })
})

describe('resolveModelRef（优先级）', () => {
  it('给 profile 且可读 → source=profile', () => {
    writeProfile('worker-b', 'model:\n  default: m\n  provider: p\n')
    const r = resolveModelRef({ profile: 'worker-b', hermesHome: home, env: { HERMES_MODEL: 'env-model' } })
    expect(r.source).toBe('profile')
    expect(r.ref).toEqual({ provider: 'p', model: 'm' })
  })

  it('给 profile 但读不到 → none，不回落 env（不把部署默认冒充成该 profile 的模型）', () => {
    const r = resolveModelRef({ profile: 'ghost', hermesHome: home, env: { HERMES_MODEL: 'env-model' } })
    expect(r.source).toBe('none')
    expect(r.ref).toBeNull()
    expect(r.reason).toContain('ghost')
  })

  it('不给 profile → 回落 env；env 也没有 → none', () => {
    expect(resolveModelRef({ env: { HERMES_MODEL: 'e' } }).source).toBe('env')
    expect(resolveModelRef({ env: {} }).source).toBe('none')
  })
})
