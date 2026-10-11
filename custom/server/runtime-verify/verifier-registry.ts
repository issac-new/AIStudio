// overlay/custom/server/runtime-verify/verifier-registry.ts
// 长会话治理 B5：可插拔验证器注册表——runtime-verify 从小程序单例升级为注册表。
// 形态参照 role-boundary-registry（JSON SSOT）与 specialist-presets（frozen 表）：
// 新验证器 = 注册一个 entry，REST /verifiers 自动透出；零代码分发的面留给
// 后续装配层（当前进程内注册，先让「能力可枚举」成立）。

export interface VerifierProbe {
  installed: boolean
  detail: string
  [extra: string]: unknown
}

export interface VerifierEntry {
  /** 稳定 id（REST 引用键；kebab-case） */
  id: string
  /** 证据种类（delivery-contract 的 kind 口径；当前仅 runtime-proof） */
  kind: 'runtime-proof'
  title: string
  /** 在位性探针（纯只读，如实报告） */
  probe: () => VerifierProbe
  /** 实际运行验证：入参即 REST body，出参为 proof 记录（失败抛错带 code） */
  verify: (opts: Record<string, unknown>) => Promise<unknown>
}

const REGISTRY = new Map<string, VerifierEntry>()

export function registerVerifier(entry: VerifierEntry): void {
  REGISTRY.set(entry.id, entry)
}

export function listVerifiers(): VerifierEntry[] {
  return [...REGISTRY.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function getVerifier(id: string): VerifierEntry | undefined {
  return REGISTRY.get(id)
}

/** REST 序列化（probe 只读执行；verify 函数不透出） */
export function describeVerifiers(): Array<{ id: string; kind: string; title: string; probe: VerifierProbe }> {
  return listVerifiers().map((v) => ({ id: v.id, kind: v.kind, title: v.title, probe: v.probe() }))
}
