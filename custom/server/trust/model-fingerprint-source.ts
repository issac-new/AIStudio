// overlay/trust 域：模型指纹采集（四性四格补齐批 F4，2026-11-03）。
//
// 上一批的独立性判定需要作者与审阅者的模型标识，但当时只支持调用方手填。本模块补
// 「从部署里取」这一层：读 profile 的 config.yaml（model.default/model.provider），
// 回落进程 env，都取不到就返回 null——不猜、不默认成独立（spec D4）。
//
// 边界：服务端无法知道某个回合实际跑在哪个 profile/模型；因此本模块只提供解析能力，
// 不自动回填到主张/审计。调用方取到指纹后显式传入，判定权与留痕仍在调用方。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hermesHome as resolveHermesHome } from '../lib/paths'
import type { ModelRef } from './independence'

export interface ResolvedModel {
  ref: ModelRef | null
  source: 'profile' | 'env' | 'none'
  /** 取不到时的原因（人话），用于端点与报告如实披露。 */
  reason?: string
}

function norm(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** 从 env 读模型标识：HERMES_MODEL_PROVIDER / HERMES_MODEL / HERMES_MODEL_VERSION。 */
export function resolveModelFromEnv(env: Record<string, string | undefined> = process.env): ModelRef | null {
  const provider = norm(env.HERMES_MODEL_PROVIDER)
  const model = norm(env.HERMES_MODEL)
  const version = norm(env.HERMES_MODEL_VERSION)
  if (!provider && !model && !version) return null
  return { ...(provider ? { provider } : {}), ...(model ? { model } : {}), ...(version ? { version } : {}) }
}

/** profile 配置路径：default 用根 config.yaml，其余用 profiles/<name>/config.yaml。 */
export function profileConfigPath(profile: string, hermesHome?: string): string {
  const home = hermesHome || process.env.HERMES_HOME || resolveHermesHome()
  return profile === 'default'
    ? join(home, 'config.yaml')
    : join(home, 'profiles', profile, 'config.yaml')
}

/**
 * 从 profile 配置读模型标识。
 * 支持两种形态：`model: { default, provider }` 与 `model: <字符串>`。
 * 坏档/缺字段返回 null（不抛，调用方按 unknown 处理）。
 */
export function resolveModelFromProfile(profile: string, hermesHome?: string): ModelRef | null {
  const path = profileConfigPath(profile, hermesHome)
  if (!existsSync(path)) return null
  try {
    // 与 posture.ts 同款动态 require（yaml 是既有传递依赖）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync: read } = require('fs') as typeof import('fs')
    const doc = parse(read(path, 'utf8')) as Record<string, unknown> | null
    const m = doc?.model
    if (typeof m === 'string') {
      const model = norm(m)
      return model ? { model } : null
    }
    if (m && typeof m === 'object') {
      const o = m as Record<string, unknown>
      const model = norm(o.default)
      const provider = norm(o.provider)
      if (!model && !provider) return null
      return { ...(provider ? { provider } : {}), ...(model ? { model } : {}) }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 解析优先级：显式 profile → env → none。
 * 给出 profile 但读不到时不回落 env——避免把「部署默认」冒充成「该 profile 的模型」。
 */
export function resolveModelRef(opts: {
  profile?: string
  hermesHome?: string
  env?: Record<string, string | undefined>
} = {}): ResolvedModel {
  const env = opts.env ?? process.env
  if (opts.profile) {
    const ref = resolveModelFromProfile(opts.profile, opts.hermesHome)
    if (ref) return { ref, source: 'profile' }
    return { ref: null, source: 'none', reason: `profile ${opts.profile} 未取到模型标识（配置缺席或未声明 model）` }
  }
  const fromEnv = resolveModelFromEnv(env)
  if (fromEnv) return { ref: fromEnv, source: 'env' }
  return { ref: null, source: 'none', reason: 'profile 与 env 均未提供模型标识' }
}
