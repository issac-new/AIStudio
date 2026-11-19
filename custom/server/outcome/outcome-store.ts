// custom/server/outcome/outcome-store.ts
// Outcome 域事件台账与存储层（spec 2026-11-19-ai-native-operating-model-design.md §4.2；
// Task 2）。存储布局：outcomeStoreRoot()/<outcomeId>/{contract.json=当前合同, events.jsonl=追加制事件账}。
//
// 纪律（先例 custom/server/evidence/evidence-store.ts）：
// - 哈希链：hash(n) = sha256( hash(n-1) | canonicalJson(record_n 去链字段) )，首条 prevHash='GENESIS'。
//   本域 events/snapshots 只追加、不做环形覆盖——幂等键（clientRequestId/measurementId）永久有效，
//   不存在 evidence 域「挤出环外即失去幂等保护」的取舍。
// - 原子写：contract.json 走 lib/fs-store atomicWriteJson（tmp+rename）；events.jsonl 追加走 appendJsonl。
// - 坏档：contract.json 解析失败改名 .corrupt.<ts> 留档（G7 防二次损坏覆盖现场），不静默当空合同续写。
// - fail-closed 写序（先账后物）：create/update 一律先 appendEvent 再写 contract.json——事件写失败
//   返回 {ok:false, code:'write_failed'} 且 contract.json 零改动。反向残留（事件已落、合同写失败）时
//   账上多一条未生效的尝试记录，合同状态仍是读侧权威，重试自愈；对追加制审计账这比「合同已改而账缺失」
//   （篡改不可见）安全。
// - 幂等：clientRequestId（create 重放）与 measurementId（测量重放）查重靠扫描既有事件账——单租户
//   单进程同步 fs（judgments.ts 同款），不引入索引文件以免账/索引双写不一致。
// - 查找无索引：findByRootTask/重放查定扫描各 outcome 目录；outcome 数量=根任务数量级，可接受。
//
// 归属边界：与 evidence 域同为单租户信任模型（登录用户凭 outcomeId 可读写），多租户归属待接。
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { appendJsonl, atomicWriteJson, readJsonl } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import { MEASURE_AVAILABILITIES } from './types'
import type { OutcomeContract, OutcomeMeasurement } from './types'
import { validateContractInput } from './validate'

/** 事件类型全集（spec §4.2：合同激活/测量追加/状态迁移/结算/取消归并进 status_changed/团队变更归并进
 *  contract_updated/上下文快照生成；批一存储层只落账不解释语义——解释权在状态机与控制器）。 */
export const OUTCOME_EVENT_TYPES = [
  'contract_created',
  'contract_activated',
  'contract_updated',
  'measurement_appended',
  'status_changed',
  'settlement_signed',
  'context_snapshot_created',
  'settlement_superseded',
] as const
export type OutcomeEventType = (typeof OUTCOME_EVENT_TYPES)[number]

/** 台账事件（spec §4.2 逐字段）：追加制、哈希链成员。payload 按类型携带事实（合同/测量/状态迁移等）。 */
export interface OutcomeEvent {
  eventId: string
  outcomeId: string
  contractVersion: number
  type: OutcomeEventType
  at: number
  actor: string
  payload: Record<string, unknown>
  /** 本条链哈希 = sha256(prevHash + '|' + canonicalJson(去链字段记录体))。 */
  hash: string
  /** 指向前一条的 hash；首条为 'GENESIS'。 */
  prevHash: string
}

export interface CreateContractInput extends OutcomeContract {
  /** 幂等键：网络超时重试等场景同键重放返回原合同，不当冲突。 */
  clientRequestId?: string
}

/** 错误码（简报逐字＋存储层必要补充）：invalid_input 校验拒绝（problems 带原因）；
 *  root_task_taken 根任务已被其他合同占用；outcome_exists 同 outcomeId 已存在；
 *  version_conflict 乐观并发版本不符；not_found 合同不存在；write_failed 落盘失败（fail-closed）。 */
export type OutcomeStoreErrorCode =
  | 'invalid_input'
  | 'root_task_taken'
  | 'outcome_exists'
  | 'version_conflict'
  | 'not_found'
  | 'write_failed'

export interface CreateContractResult {
  ok: boolean
  code?: OutcomeStoreErrorCode
  problems?: string[]
  contract?: OutcomeContract
  /** true=clientRequestId 命中重放，返回的是原合同（未新建）。 */
  replayed?: boolean
}

export interface UpdateContractResult {
  ok: boolean
  code?: OutcomeStoreErrorCode
  problems?: string[]
  contract?: OutcomeContract
}

export interface AppendEventResult {
  ok: boolean
  code?: Extract<OutcomeStoreErrorCode, 'invalid_input' | 'write_failed'>
  problems?: string[]
  event?: OutcomeEvent
}

export interface AppendMeasurementResult {
  ok: boolean
  added: boolean
  code?: OutcomeStoreErrorCode
  problems?: string[]
  measurement?: OutcomeMeasurement
  event?: OutcomeEvent
}

// ---------- 存储根与路径 ----------

let overrideDir: string | null = null

/** 测试逃生（judgments.ts 先例）：整目录指向临时夹具；null 恢复正常运行。 */
export function _useOutcomeStoreForTests(dir: string | null): void {
  overrideDir = dir
}

/** 存储根：测试 override > env OUTCOME_STORE > underWebUi('outcome')。 */
export function outcomeStoreRoot(): string {
  if (overrideDir) return overrideDir
  const env = process.env.OUTCOME_STORE?.trim()
  return env ? resolve(env) : underWebUi('outcome')
}

/** outcomeId 直接作目录名：只允许字母数字开头＋[A-Za-z0-9._-]，≤128——无 '/'、无前导点，
 *  路径穿越（'../x'）与隐藏目录天然被拒。 */
const OUTCOME_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const isSafeOutcomeId = (id: unknown): id is string =>
  typeof id === 'string' && OUTCOME_ID_RE.test(id)

const outcomeDirOf = (outcomeId: string): string => join(outcomeStoreRoot(), outcomeId)
const contractFileOf = (outcomeId: string): string => join(outcomeDirOf(outcomeId), 'contract.json')
const eventsFileOf = (outcomeId: string): string => join(outcomeDirOf(outcomeId), 'events.jsonl')

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const describeErr = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

/** 坏档隔离（evidence-store 先例）：改名 .corrupt.<ts> 留档＋warn；留档失败不阻断。 */
function quarantine(file: string, err: unknown): void {
  const archive = `${file}.corrupt.${Date.now()}`
  try {
    renameSync(file, archive)
  } catch {
    /* 只读介质等：留档失败不阻断，仅告警 */
  }
  console.warn(`[outcome-store] 合同文件解析失败，已留档 ${archive}：${describeErr(err)}`)
}

// ---------- canonical JSON 与哈希链 ----------

/** canonical JSON：对象键递归排序后序列化（与 evidence-store 私有实现同构；纯函数）。 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

/** 计算事件的链哈希：body = 事件去掉 hash/prevHash 后的 canonical 体。 */
export function hashOutcomeEvent(event: OutcomeEvent): string {
  const { hash: _h, prevHash: _p, ...body } = event
  return createHash('sha256').update(`${event.prevHash}|${canonicalJson(body)}`).digest('hex')
}

// ---------- 读侧 ----------

function readEventsAt(outcomeId: string, file: string): OutcomeEvent[] {
  const { rows, skipped } = readJsonl<OutcomeEvent>(file)
  if (skipped > 0) {
    console.warn(`[outcome-store] ${outcomeId} events.jsonl 有 ${skipped} 行无法解析（append 半行/损坏），已跳过`)
  }
  return rows.filter((e) => e && typeof e.eventId === 'string')
}

/** 读当前合同；未知/坏档返回 null（fail-soft 不猜数；坏档已隔离留档）。 */
export function getContract(outcomeId: string): OutcomeContract | null {
  if (!isSafeOutcomeId(outcomeId)) return null
  const file = contractFileOf(outcomeId)
  if (!existsSync(file)) return null
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    quarantine(file, err)
    return null
  }
  const c = raw as OutcomeContract | null
  // 身份不符（目录名≠合同 outcomeId）视同坏档：拒绝认领，防碰撞覆盖
  if (!c || typeof c !== 'object' || c.outcomeId !== outcomeId) {
    quarantine(file, new Error('contract.json 身份不符（缺少/不等于目录名对应 outcomeId）'))
    return null
  }
  return c
}

/** 列事件（追加序）；type 可选过滤。未知 outcome 返回 []。 */
export function listEvents(outcomeId: string, type?: OutcomeEventType): OutcomeEvent[] {
  if (!isSafeOutcomeId(outcomeId)) return []
  const events = readEventsAt(outcomeId, eventsFileOf(outcomeId))
  return type ? events.filter((e) => e.type === type) : events
}

/** 按 rootTaskId 反查合同：扫描各 outcome 目录的 contract.json（无索引；排序保证确定性）。 */
export function findByRootTask(rootTaskId: string): OutcomeContract | null {
  if (!nonEmpty(rootTaskId)) return null
  for (const id of sortedOutcomeIds()) {
    const c = getContract(id)
    if (c && c.rootTaskId === rootTaskId) return c
  }
  return null
}

/** 存储根下的 outcome 目录名（排序确定性；非法名跳过）。 */
function sortedOutcomeIds(): string[] {
  const root = outcomeStoreRoot()
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isSafeOutcomeId(d.name))
    .map((d) => d.name)
    .sort()
}

/** clientRequestId 重放查定：扫描 contract_created 事件的 payload.clientRequestId。
 *  只认「事件在账且合同可读」的命中——撕裂创建（事件已落、合同未写）返回 null 让 create 重试自愈。 */
function findByClientRequest(clientRequestId: string): OutcomeContract | null {
  for (const id of sortedOutcomeIds()) {
    const hit = readEventsAt(id, eventsFileOf(id)).find(
      (e) =>
        e.type === 'contract_created' &&
        (e.payload as { clientRequestId?: unknown } | null)?.clientRequestId === clientRequestId,
    )
    if (hit) return getContract(id)
  }
  return null
}

/** 测量事实从事件账派生（type='measurement_appended' 的 payload.measurement），不落第二份存储。 */
export function listMeasurements(outcomeId: string, measureId?: string): OutcomeMeasurement[] {
  return listEvents(outcomeId, 'measurement_appended')
    .map((e) => (e.payload as { measurement?: unknown } | null)?.measurement)
    .filter((m): m is OutcomeMeasurement => !!m && typeof m === 'object' && nonEmpty((m as OutcomeMeasurement).measurementId))
    .filter((m) => !measureId || m.measureId === measureId)
}

// ---------- 写侧：appendEvent 原语 ----------

/** 追加一条事件并挂链。低阶原语：不校验合同存在（createContract 首条事件天然先于合同落盘），
 *  语义门槛（状态机/权限）由上层把守。写盘失败返回 write_failed，不抛、不留半账。 */
export function appendEvent(
  outcomeId: string,
  type: OutcomeEventType,
  payload: Record<string, unknown>,
  actor: string,
  contractVersion: number,
): AppendEventResult {
  const problems: string[] = []
  if (!isSafeOutcomeId(outcomeId)) problems.push('outcomeId 非法（须字母数字开头，仅含 ._\-，≤128 字符）')
  if (!(OUTCOME_EVENT_TYPES as readonly string[]).includes(type))
    problems.push(`type 须为 ${OUTCOME_EVENT_TYPES.join('|')} 之一`)
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
    problems.push('payload 须为对象')
  if (!nonEmpty(actor)) problems.push('actor 必填')
  if (typeof contractVersion !== 'number' || !Number.isInteger(contractVersion) || contractVersion < 1)
    problems.push('contractVersion 须为正整数')
  if (problems.length) return { ok: false, code: 'invalid_input', problems }

  const existing = readEventsAt(outcomeId, eventsFileOf(outcomeId))
  const prevHash = existing.length ? existing[existing.length - 1].hash : 'GENESIS'
  const event: OutcomeEvent = {
    eventId: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    outcomeId,
    contractVersion,
    type,
    at: Date.now(),
    actor: actor.trim(),
    payload,
    prevHash,
    hash: '',
  }
  event.hash = hashOutcomeEvent(event)
  try {
    appendJsonl(eventsFileOf(outcomeId), event)
  } catch (err) {
    console.warn(`[outcome-store] 事件写入失败（${outcomeId}/${type}）：${describeErr(err)}`)
    return { ok: false, code: 'write_failed' }
  }
  return { ok: true, event }
}

// ---------- 写侧：合同生命周期 ----------

/** 创建合同（先验后写）：校验→clientRequestId 重放→outcomeId 占用→rootTaskId 占用→事件→合同。
 *  重放检查先于占用检查——重放携带同一 rootTaskId，须当幂等返回原合同而非 root_task_taken。 */
export function createContract(input: CreateContractInput, actor: string): CreateContractResult {
  const { clientRequestId, ...contract } = (input ?? {}) as CreateContractInput
  const validation = validateContractInput(contract)
  const problems = [...validation.problems]
  if (!isSafeOutcomeId(contract?.outcomeId))
    problems.push('outcomeId 非法（须字母数字开头，仅含 ._\-，≤128 字符；将作目录名）')
  if (clientRequestId !== undefined && !nonEmpty(clientRequestId))
    problems.push('clientRequestId 须为非空字符串')
  if (!nonEmpty(actor)) problems.push('actor 必填')
  if (problems.length) return { ok: false, code: 'invalid_input', problems }

  if (clientRequestId) {
    const original = findByClientRequest(clientRequestId)
    if (original) return { ok: true, contract: original, replayed: true }
  }
  if (existsSync(contractFileOf(contract.outcomeId)))
    return { ok: false, code: 'outcome_exists' }
  if (findByRootTask(contract.rootTaskId)) return { ok: false, code: 'root_task_taken' }

  // 先账后物（fail-closed）：事件写失败→合同零痕迹
  const payload: Record<string, unknown> = { contract }
  if (clientRequestId) payload.clientRequestId = clientRequestId
  const ev = appendEvent(contract.outcomeId, 'contract_created', payload, actor, contract.version)
  if (!ev.ok) return { ok: false, code: 'write_failed' }
  try {
    atomicWriteJson(contractFileOf(contract.outcomeId), contract)
  } catch (err) {
    console.warn(`[outcome-store] 合同写入失败（${contract.outcomeId}）：${describeErr(err)}`)
    return { ok: false, code: 'write_failed' }
  }
  return { ok: true, contract }
}

/** patch 禁改面：合同身份/版本/时间戳由 store 管理；status 迁移不递增 version（spec §4.1），
 *  走 status_changed 事件通道，不得借 updateContract 改状态。 */
const IMMUTABLE_PATCH_FIELDS = [
  'schemaVersion',
  'outcomeId',
  'rootTaskId',
  'version',
  'createdAt',
  'updatedAt',
  'status',
] as const

/** 修订合同（乐观并发）：expectedVersion 不符→version_conflict；成功递增 version、
 *  updatedAt 取服务端时间、并发 contract_updated 事件。先验后写、先账后物。 */
export function updateContract(
  outcomeId: string,
  patch: Partial<OutcomeContract>,
  expectedVersion: number,
  actor: string,
): UpdateContractResult {
  const problems: string[] = []
  if (!isSafeOutcomeId(outcomeId)) problems.push('outcomeId 非法')
  if (patch !== null && patch !== undefined && (typeof patch !== 'object' || Array.isArray(patch)))
    problems.push('patch 须为对象')
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1)
    problems.push('expectedVersion 须为正整数')
  if (!nonEmpty(actor)) problems.push('actor 必填')
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    const illegal = Object.keys(patch).filter((k) =>
      (IMMUTABLE_PATCH_FIELDS as readonly string[]).includes(k),
    )
    if (illegal.length)
      problems.push(
        `patch 不得修改合同身份/版本/时间戳/status（${illegal.join('、')}）；status 迁移走 status_changed 事件、不递增 version`,
      )
  }
  if (problems.length) return { ok: false, code: 'invalid_input', problems }

  const current = getContract(outcomeId)
  if (!current) return { ok: false, code: 'not_found' }
  if (current.version !== expectedVersion) return { ok: false, code: 'version_conflict' }

  const next: OutcomeContract = {
    ...current,
    ...(patch ?? {}),
    version: expectedVersion + 1,
    updatedAt: Date.now(),
  }
  const validation = validateContractInput(next)
  if (validation.problems.length)
    return { ok: false, code: 'invalid_input', problems: validation.problems }

  // 先账后物：事件失败→contract.json 未被触碰
  const ev = appendEvent(
    outcomeId,
    'contract_updated',
    { fromVersion: current.version, toVersion: next.version, patch: patch ?? {} },
    actor,
    next.version,
  )
  if (!ev.ok) return { ok: false, code: 'write_failed' }
  try {
    atomicWriteJson(contractFileOf(outcomeId), next)
  } catch (err) {
    console.warn(`[outcome-store] 合同写入失败（${outcomeId}）：${describeErr(err)}`)
    return { ok: false, code: 'write_failed' }
  }
  return { ok: true, contract: next }
}

// ---------- 写侧：测量事实 ----------

/** 追加测量事实（measurement_appended 事件；幂等键 measurementId，作用域=outcome）。
 *  重复 measurementId 返回原事实 added:false——重放不同值也不覆盖（事实只增不改）。
 *  actor 缺省取 recordedBy。不校验 measureId 是否在当前合同 measures 内：定义修订后旧
 *  measureId 仍是合法历史键（spec §4.1），绑定语义由结算侧把关。 */
export function appendMeasurement(
  m: OutcomeMeasurement,
  actor?: string,
): AppendMeasurementResult {
  const problems: string[] = []
  if (m === null || typeof m !== 'object') {
    problems.push('measurement 须为对象')
  } else {
    if (!nonEmpty(m.measurementId)) problems.push('measurementId 必填')
    if (!nonEmpty(m.measureId)) problems.push('measureId 必填')
    if (!nonEmpty(m.outcomeId)) problems.push('outcomeId 必填')
    else if (!isSafeOutcomeId(m.outcomeId)) problems.push('outcomeId 非法')
    if (typeof m.contractVersion !== 'number' || !Number.isInteger(m.contractVersion) || m.contractVersion < 1)
      problems.push('contractVersion 须为正整数')
    // actual=null 是合法未知（不得自动补零）；除此之外须有限数值
    if (m.actual !== null && !(typeof m.actual === 'number' && Number.isFinite(m.actual)))
      problems.push('actual 须为有限数值或 null')
    if (!(MEASURE_AVAILABILITIES as readonly string[]).includes(m.availability))
      problems.push(`availability 须为 ${MEASURE_AVAILABILITIES.join('|')}`)
    if (!Array.isArray(m.evidenceRefs) || !m.evidenceRefs.every((x) => typeof x === 'string'))
      problems.push('evidenceRefs 须为字符串数组')
    if (typeof m.observedAt !== 'number' || !Number.isFinite(m.observedAt))
      problems.push('observedAt 须为有限数值')
    if (typeof m.recordedAt !== 'number' || !Number.isFinite(m.recordedAt))
      problems.push('recordedAt 须为有限数值')
    if (!nonEmpty(m.recordedBy)) problems.push('recordedBy 必填')
  }
  if (problems.length) return { ok: false, added: false, code: 'invalid_input', problems }

  const who = nonEmpty(actor) ? actor.trim() : m.recordedBy
  if (!getContract(m.outcomeId)) return { ok: false, added: false, code: 'not_found' }

  const existing = listMeasurements(m.outcomeId).find((x) => x.measurementId === m.measurementId)
  if (existing) return { ok: true, added: false, measurement: existing }

  const ev = appendEvent(m.outcomeId, 'measurement_appended', { measurement: m }, who, m.contractVersion)
  if (!ev.ok) return { ok: false, added: false, code: 'write_failed' }
  return { ok: true, added: true, measurement: m, event: ev.event }
}
