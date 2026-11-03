// overlay/handoff 域：阶段交接键（四性四格收敛批 C4，2026-11-03）。
//
// 背景：handoff-script 是会话级交接书（六段提示词资产，结构守门），阶段之间没有
// 机器可核验的交接物。参考轮因此反复出现「上游已达、下游没收到」的静默断链
// （conclusion-gap：分支达而 DEV-DONE 未发），只能靠 issues.log 事后审计发现。
//
// 本模块把交接从事后审计改成入口校验：每个阶段出口落一把键，下一阶段入口读上阶段
// 键，四件核验全过才准进——结构完整、产物存在、哈希一致、提交锚点可解析。
//
// 键语义沿用 handoff 六段的纪律（spec D4）：
//   notDone 必须非空，空=没写（写"无"而不是留空），避免"没说就是没有"的歧义。
//
// 纯函数 + 依赖注入：结构校验与 IO 校验分离，测试可注入确定性 deps。

export const STAGE_KEY_NAMES = ['req-frozen', 'design-approved', 'dev-done', 'verify-done'] as const
export type StageKeyName = (typeof STAGE_KEY_NAMES)[number]

export const STAGE_KEY_VERDICTS = ['pass', 'fail'] as const
export type StageKeyVerdict = (typeof STAGE_KEY_VERDICTS)[number]

export interface StageArtifact {
  path: string
  /** 可选：给了就必须一致，不给只校验存在性（弱保证，报告须如实标）。 */
  sha256?: string
}

export interface StageKey {
  stage: StageKeyName
  /** 该键对应的门（如 G1/G2/G3/G5），便于与治理报告对账。 */
  gate: string
  verdict: StageKeyVerdict
  actor: string
  ts: number
  artifacts: StageArtifact[]
  /** 提交锚点（7-40 位十六进制）。 */
  commitAnchors: string[]
  /** 证据路径（testlog / 截图 / 判词等）。 */
  evidence: string[]
  /** 未完成项；空=没写，必须显式写"无"。 */
  notDone: string[]
}

export interface StageKeyVerifyDeps {
  fileExists?: (path: string) => boolean
  /** 返回 64 位十六进制摘要；读不到返回 null（不猜）。 */
  sha256Of?: (path: string) => string | null
  /** 提交锚点是否能在目标仓解析。 */
  resolveCommit?: (anchor: string) => boolean
}

export interface StageChainReport {
  ok: boolean
  /** 缺失的阶段键（按 STAGE_KEY_NAMES 序）。 */
  missing: StageKeyName[]
  /** 逐阶段问题清单；键为空表示该阶段通过。 */
  problems: Array<{ stage: StageKeyName; problems: string[] }>
  /** 无法归属到任何阶段的结构问题（如 stage 字段本身非法）——不硬塞进某个阶段。 */
  unattributed: string[]
  /** verdict=fail 的阶段（键存在但上游自己判失败，下游更不该进）。 */
  failed: StageKeyName[]
}

const HEX_COMMIT_RE = /^[0-9a-f]{7,40}$/i
const SHA256_RE = /^[0-9a-f]{64}$/i

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function isStageName(v: unknown): v is StageKeyName {
  return typeof v === 'string' && (STAGE_KEY_NAMES as readonly string[]).includes(v)
}

/**
 * 结构校验（纯函数，不看文件系统）。
 * 返回归一化后的键（仅在无结构问题时非空），与问题清单。
 */
export function validateStageKeyStructure(raw: unknown): { key: StageKey | null; problems: string[] } {
  const problems: string[] = []
  const r = (raw ?? {}) as Record<string, unknown>

  if (!isStageName(r.stage)) problems.push(`stage 非法（须为 ${STAGE_KEY_NAMES.join('|')}）`)
  if (!isNonEmptyString(r.gate)) problems.push('gate 必填')
  if (typeof r.verdict !== 'string' || !(STAGE_KEY_VERDICTS as readonly string[]).includes(r.verdict)) {
    problems.push(`verdict 非法（须为 ${STAGE_KEY_VERDICTS.join('|')}）`)
  }
  if (!isNonEmptyString(r.actor)) problems.push('actor 必填（谁签的键）')
  if (typeof r.ts !== 'number' || !Number.isFinite(r.ts) || r.ts <= 0) problems.push('ts 必填（毫秒时间戳）')

  const artifacts: StageArtifact[] = []
  if (!Array.isArray(r.artifacts) || r.artifacts.length === 0) {
    problems.push('artifacts 不能为空（阶段键必须指向可核验产物）')
  } else {
    for (const [i, a] of r.artifacts.entries()) {
      const o = (a ?? {}) as Record<string, unknown>
      if (!isNonEmptyString(o.path)) {
        problems.push(`artifacts[${i}].path 必填`)
        continue
      }
      if (o.sha256 !== undefined && (typeof o.sha256 !== 'string' || !SHA256_RE.test(o.sha256))) {
        problems.push(`artifacts[${i}].sha256 非法（须为 64 位十六进制）`)
        continue
      }
      artifacts.push({ path: o.path.trim(), ...(typeof o.sha256 === 'string' ? { sha256: o.sha256.toLowerCase() } : {}) })
    }
  }

  const commitAnchors: string[] = []
  if (!Array.isArray(r.commitAnchors)) {
    problems.push('commitAnchors 必须是数组（可为空，但字段必在）')
  } else {
    for (const c of r.commitAnchors) {
      if (typeof c !== 'string' || !HEX_COMMIT_RE.test(c)) {
        problems.push(`commitAnchors 含非法锚点：${String(c)}（须为 7-40 位十六进制）`)
        continue
      }
      commitAnchors.push(c.toLowerCase())
    }
  }

  const evidence: string[] = []
  if (!Array.isArray(r.evidence) || r.evidence.length === 0) {
    problems.push('evidence 不能为空（键必须指出证据在哪）')
  } else {
    for (const e of r.evidence) {
      if (!isNonEmptyString(e)) {
        problems.push('evidence 含空项')
        continue
      }
      evidence.push(e.trim())
    }
  }

  const notDone: string[] = []
  if (!Array.isArray(r.notDone) || r.notDone.length === 0) {
    problems.push('notDone 不能为空数组（没有未完成项须显式写"无"）')
  } else {
    for (const n of r.notDone) {
      if (!isNonEmptyString(n)) {
        problems.push('notDone 含空项')
        continue
      }
      notDone.push(n.trim())
    }
  }

  if (problems.length > 0) return { key: null, problems }
  return {
    key: {
      stage: r.stage as StageKeyName,
      gate: String(r.gate).trim(),
      verdict: r.verdict as StageKeyVerdict,
      actor: String(r.actor).trim(),
      ts: r.ts as number,
      artifacts,
      commitAnchors,
      evidence,
      notDone,
    },
    problems: [],
  }
}

/** IO 校验（依赖注入）：产物存在、哈希一致、提交锚点可解析。 */
export function verifyStageKeyIo(key: StageKey, deps: StageKeyVerifyDeps = {}): string[] {
  const problems: string[] = []
  for (const a of key.artifacts) {
    if (deps.fileExists && !deps.fileExists(a.path)) {
      problems.push(`artifact-missing:${a.path}`)
      continue
    }
    if (a.sha256 && deps.sha256Of) {
      const actual = deps.sha256Of(a.path)
      if (actual === null) {
        problems.push(`artifact-unreadable:${a.path}`)
      } else if (actual.toLowerCase() !== a.sha256) {
        problems.push(`artifact-sha-mismatch:${a.path}`)
      }
    }
  }
  if (deps.resolveCommit) {
    for (const c of key.commitAnchors) {
      if (!deps.resolveCommit(c)) problems.push(`commit-unresolved:${c}`)
    }
  }
  return problems
}

/**
 * 链校验：必需阶段的键齐备、结构合法、IO 通过、且上游 verdict 不是 fail。
 * required 缺省为四把键全要；调用方可按门裁剪（如只到 G3 时只要前三把）。
 */
export function judgeStageChain(
  rawKeys: unknown[],
  required: readonly StageKeyName[] = STAGE_KEY_NAMES,
  deps: StageKeyVerifyDeps = {},
): StageChainReport {
  const byStage = new Map<StageKeyName, StageKey>()
  const problems: Array<{ stage: StageKeyName; problems: string[] }> = []
  const unattributed: string[] = []

  for (const raw of rawKeys) {
    const stageHint = isStageName((raw as Record<string, unknown> | null)?.stage)
      ? ((raw as Record<string, unknown>).stage as StageKeyName)
      : null
    const { key, problems: structProblems } = validateStageKeyStructure(raw)
    if (!key) {
      // 结构不合法：能定位到 stage 就记到该阶段；stage 本身非法则记入 unattributed，
      // 不硬塞进 req-frozen（否则报文会指向一个用户根本没提交的阶段）。
      if (stageHint) problems.push({ stage: stageHint, problems: structProblems })
      else unattributed.push(...structProblems)
      continue
    }
    if (byStage.has(key.stage)) {
      problems.push({ stage: key.stage, problems: ['duplicate-stage-key（同阶段只允许一把键）'] })
      continue
    }
    byStage.set(key.stage, key)
  }

  for (const stage of required) {
    const key = byStage.get(stage)
    if (!key) continue
    const io = verifyStageKeyIo(key, deps)
    const stageProblems = [...io]
    if (key.verdict === 'fail') stageProblems.push('key-verdict-fail（上游自判失败，下游不得进入）')
    if (stageProblems.length > 0) {
      const existing = problems.find((p) => p.stage === stage)
      if (existing) existing.problems.push(...stageProblems)
      else problems.push({ stage, problems: stageProblems })
    }
  }

  const missing = required.filter((s) => !byStage.has(s))
  const failed = required.filter((s) => byStage.get(s)?.verdict === 'fail')
  return {
    ok: missing.length === 0 && problems.length === 0 && unattributed.length === 0,
    missing: [...missing],
    problems,
    unattributed,
    failed: [...new Set(failed)],
  }
}

/**
 * 链报告 → REST 响应载荷。
 * 关键约束：响应体顶层 `ok` 是传输层保留键（lib/http 的 ok() 会写 ok:true），
 * 链结论必须改名 chainOk，否则会覆盖成 200+ok:false 的假信号（K19 禁止形态）。
 */
export function toChainResponse(report: StageChainReport): Omit<StageChainReport, 'ok'> & { chainOk: boolean } {
  const { ok: chainOk, ...rest } = report
  return { chainOk, ...rest }
}
