// custom/server/agentidentity/people.ts
// 自然人名单：责任卡的主责任人 / 复核人 / 接管人 / 维护人只能引用这里 active 的人。
// 存储与身份册同目录（AGENT_IDENTITY_STORE > underWebUi('agent-identity')），独立文件 people.json。
// 候选可由种子脚本从 git 作者派生，默认 inactive；启用须显式调用 activatePerson。
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

export interface Person {
  id: string
  name: string
  emails: string[]
  /** 显式登记的 Matrix 账号（批二 mxid 桥）：@user:server 全形或裸 localpart 均收，
   *  仅按显式值保存——不从 email 推断、不补全形（推断即猜数）。缺席=未登记。 */
  mxids?: string[]
  active: boolean
  source: 'git' | 'manual'
  createdAt: number
  activatedAt?: number
}

interface StoreShape { people: Person[]; nextSeq: number }

let overrideDir: string | null = null

/** 测试隔离：传 null 恢复生产目录（与 agent-identity 同约定） */
export function _usePeopleStoreForTests(dir: string | null): void {
  overrideDir = dir
}

function storeDir(): string {
  if (overrideDir) return overrideDir
  const env = process.env.AGENT_IDENTITY_STORE?.trim()
  return env || underWebUi('agent-identity')
}

function storePath(): string {
  return join(storeDir(), 'people.json')
}

function readStore(): StoreShape {
  try {
    const raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<StoreShape>
    return {
      people: Array.isArray(raw.people) ? raw.people : [],
      nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
    }
  } catch (e) {
    // 只把「首装无文件」当空账；损坏/权限问题如实上抛，避免下一次写覆盖全账
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { people: [], nextSeq: 1 }
    throw e
  }
}

function writeStore(store: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(storePath(), store, { fsync: true })
}

export function listPeople(): Person[] {
  return readStore().people.map((p) => ({ ...p }))
}

export function getPerson(id: string): Person | null {
  return readStore().people.find((p) => p.id === id) ?? null
}

export function activePersonIds(): Set<string> {
  return new Set(listPeople().filter((p) => p.active).map((p) => p.id))
}

/** mxid 形态校验：@user:server 全形（各段非空）或裸 localpart（非空、无空白与冒号）。
 *  空白/畸形拒绝并点名原值——桥面按显式值匹配，畸形值进名册只会制造假命中。 */
const MXID_FULL = /^@[^:\s@]+:[^:\s@]+$/

function normalizeMxids(raw: unknown): { ok: true; mxids: string[] } | { ok: false; problem: string } {
  if (raw === undefined) return { ok: true, mxids: [] }
  if (!Array.isArray(raw)) return { ok: false, problem: 'mxids 须为字符串数组' }
  const out: string[] = []
  for (const v of raw) {
    const s = String(v ?? '').trim()
    if (!s) continue
    if (!MXID_FULL.test(s) && /[:@\s]/.test(s)) {
      return { ok: false, problem: `mxid 畸形：${s}（须 @user:server 全形或无空白冒号的裸 localpart）` }
    }
    if (!out.includes(s)) out.push(s)
  }
  return { ok: true, mxids: out }
}

export function upsertPerson(
  input: { id?: string; name: string; emails?: string[]; mxids?: string[]; source?: 'git' | 'manual' },
  _actor: string,
): { ok: boolean; problems: string[]; person?: Person } {
  const name = String(input.name ?? '').trim()
  if (!name) return { ok: name.trim().length > 0, problems: ['name 必填'] }
  const emails = (input.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean)
  const mx = normalizeMxids(input.mxids)
  if (!mx.ok) return { ok: false, problems: [mx.problem] }
  const store = readStore()
  const byId = input.id ? store.people.find((p) => p.id === input.id) : undefined
  const byEmail = emails.length
    ? store.people.find((p) => p.emails.some((e) => emails.includes(e)))
    : undefined
  const existing = byId ?? byEmail
  if (existing) {
    existing.name = name
    existing.emails = [...new Set([...existing.emails, ...emails])]
    // mxids 显式传入时整体替换（含空数组=清空）；未传=保留原值——不猜合并意图
    if (input.mxids !== undefined) existing.mxids = mx.mxids
    writeStore(store)
    return { ok: true, problems: [], person: { ...existing } }
  }
  const person: Person = {
    id: input.id ?? `p-${store.nextSeq++}`,
    name,
    emails,
    ...(mx.mxids.length ? { mxids: mx.mxids } : {}),
    active: false,
    source: input.source ?? 'manual',
    createdAt: Date.now(),
  }
  store.people.push(person)
  writeStore(store)
  return { ok: true, problems: [], person: { ...person } }
}

export function activatePerson(
  id: string,
  _actor: string,
): { ok: boolean; problems: string[]; person?: Person } {
  const store = readStore()
  const person = store.people.find((p) => p.id === id)
  if (!person) return { ok: person !== undefined, problems: [`自然人不存在：${id}`] }
  person.active = true
  person.activatedAt = Date.now()
  writeStore(store)
  return { ok: true, problems: [], person: { ...person } }
}
