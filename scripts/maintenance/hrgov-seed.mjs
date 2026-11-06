#!/usr/bin/env node
// hrgov-seed：身份册 / 自然人名单种子脚本（spec 2026-11-06-workunit-responsibility-ledger.md §7）。
//
// 种子纪律（决策 D6：只建草案、不自动补全——无主单元本身是六问之一）：
//   - people 候选只来自 git 作者（source:'git'、active:false，启用须显式走 activatePerson）；
//   - 单元草案只为 team/profiles 中尚无同名身份的 profile 创建（kind:'agent'，
//     owner 只认 owner-registry 条目里的 `owner:` 行，未命中或缺该行 = 'unassigned'，
//     不从 matrix/backup/owns 猜责任人）；
//   - 已存在的身份与人不改写、不覆盖；重复运行零新建（幂等）；--dry-run 只打印不写盘。
//
// 定位：进程外仓级维护工具——直接读写 JSON 台账（与 custom/server/agentidentity 的
// people.ts / agent-identity.ts 同存储约定、同文件形状），不 import 服务端代码。
// 事件流 events.jsonl 只由服务端操作产生，种子不写事件（草案补卡/迁移走服务端时再落账）。
//
// 用法：node scripts/maintenance/hrgov-seed.mjs [--dry-run] [--store <dir>]
//   --store <dir>  存储目录（缺省 AGENT_IDENTITY_STORE env，再缺省
//                  HERMES_WEB_UI_HOME/agent-identity → ~/.hermes-web-ui/agent-identity）

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

// ── 最小 YAML 行解析（无依赖）：只抽约定行，其余字段跳过不猜 ──

/** 剥一层成对引号；内部转义（如 \uXXXX）不解码——按原文呈现，不做 YAML 语义解释 */
function stripQuotes(value) {
  const t = value.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim()
  }
  return t
}

/**
 * profile.yaml → 单行 description。只认顶格 `description:` 的单行值；
 * 块标量（`>`/`|`）与多行续行（下一非空行缩进）解析不了 → null，不猜
 * （截断取首行会把残句当完整描述）。`description_auto:` 等其他键不匹配。
 */
function parseDescription(text) {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^description:[ \t]*(.*)$/.exec(lines[i])
    if (!m) continue
    const raw = m[1].trim()
    if (!raw || /^[>|]/.test(raw)) return null
    const next = lines[i + 1] ?? ''
    if (next.trim() && /^[ \t]/.test(next)) return null
    return stripQuotes(raw) || null
  }
  return null
}

/**
 * owner-registry.yaml → { profile名: owner名 }。只认两类行：
 * 列表头 `- profile: X` 与同层两空格缩进的 `  owner: Y`；
 * owns/backup/matrix/apps 等其余字段一律不解析。条目缺 owner 行 = 无主（值缺省）。
 */
function parseOwnerRegistry(text) {
  const map = {}
  let current = null
  for (const line of text.split('\n')) {
    const head = /^- profile:[ \t]*(.+)$/.exec(line)
    if (head) {
      current = stripQuotes(head[1]) || null
      if (current) map[current] = undefined
      continue
    }
    const owner = /^  owner:[ \t]*(.+)$/.exec(line)
    if (owner && current) {
      const v = stripQuotes(owner[1])
      if (v) map[current] = v
    }
  }
  return map
}

// ── 可测纯函数 ──

/**
 * git 作者行（`%an <%ae>` 原样每行一条）→ people 候选。
 * 按邮箱（小写）去重、先见先得；解析不了的行跳过不猜；
 * 同名不同邮箱不合并（是否同人是猜测），各成一条候选，active 语义由写入层定。
 */
export function derivePeople(authors) {
  const byEmail = new Map()
  for (const raw of authors ?? []) {
    const line = String(raw ?? '').trim()
    if (!line) continue
    const m = /^(.*?)<([^<>\s]+)>\s*$/.exec(line)
    if (!m) continue
    const name = m[1].trim()
    const email = m[2].trim().toLowerCase()
    if (!name || !email || byEmail.has(email)) continue
    byEmail.set(email, { name, emails: [email], source: 'git' })
  }
  return [...byEmail.values()]
}

/**
 * profile 列表 → registered 单元草案。owner 取 ownerRegistry 命中的 owner 名，
 * 未命中或缺 owner 行 = 'unassigned'；existingIdentities 中已有同名身份的跳过
 * （已存在身份不动，见 §7）。description 仅随草案携带供人读，不入身份字段。
 */
export function deriveUnits(profiles, ownerRegistry, existingIdentities) {
  const existing = new Set(
    (existingIdentities ?? [])
      .map((i) => String(i?.name ?? '').trim())
      .filter(Boolean),
  )
  const units = []
  for (const p of profiles ?? []) {
    const name = String(p?.name ?? '').trim()
    if (!name || existing.has(name)) continue
    const hit = ownerRegistry?.[name]
    const owner = typeof hit === 'string' && hit.trim() ? hit.trim() : 'unassigned'
    const description = typeof p?.description === 'string' && p.description.trim() ? p.description.trim() : undefined
    units.push({ name, kind: 'agent', owner, description, lifecycle: { stage: 'registered', history: [] } })
  }
  return units
}

// ── 数据源读取 ──

/** team/profiles 下各 profile.yaml → [{name, description?}]；目录缺失=根不对，如实抛错 */
function readProfiles(profilesDir) {
  if (!existsSync(profilesDir)) {
    throw new Error(`team/profiles 不存在：${profilesDir}（--root 或运行目录不对）`)
  }
  return readdirSync(profilesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .filter((name) => existsSync(join(profilesDir, name, 'profile.yaml')))
    .map((name) => ({
      name,
      description: parseDescription(readFileSync(join(profilesDir, name, 'profile.yaml'), 'utf8')) ?? undefined,
    }))
}

/** git 作者面：git 不可用 / 非 git 根时返回空（作者缺席不阻断其余种子面，不猜） */
function gitAuthors(root) {
  let r
  try {
    r = spawnSync('git', ['-C', root, 'log', '--format=%an <%ae>'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch {
    return []
  }
  if (!r || r.status !== 0) return []
  return String(r.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
}

// ── 台账读写（与 custom/server/agentidentity 同形状）──

/** 仅首装无文件按空账；损坏/权限错误如实抛——静默当空账会让下一次全量写覆盖既有台账 */
function readJsonOrEmpty(file, empty) {
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    if (e && typeof e === 'object' && e.code === 'ENOENT') return empty()
    throw e
  }
  return raw
}

function readPeopleStore(storeDir) {
  const raw = readJsonOrEmpty(join(storeDir, 'people.json'), () => ({ people: [], nextSeq: 1 }))
  return {
    people: Array.isArray(raw.people) ? raw.people : [],
    nextSeq: typeof raw.nextSeq === 'number' && raw.nextSeq >= 1 ? raw.nextSeq : 1,
  }
}

function readIdentityStore(storeDir) {
  const raw = readJsonOrEmpty(join(storeDir, 'identities.json'), () => ({ identities: [], nextSeq: 1, nextDelegationSeq: 1 }))
  return {
    identities: Array.isArray(raw.identities) ? raw.identities : [],
    nextSeq: typeof raw.nextSeq === 'number' && raw.nextSeq >= 1 ? raw.nextSeq : 1,
    nextDelegationSeq: typeof raw.nextDelegationSeq === 'number' && raw.nextDelegationSeq >= 1 ? raw.nextDelegationSeq : 1,
  }
}

/** 同目录 tmp+rename 原子写（与 custom/server/lib/fs-store 同语义；脚本不 import 服务端代码） */
function atomicWriteJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tag = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const tmp = join(dirname(file), `.${tag}.tmp`)
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
    renameSync(tmp, file)
  } catch (e) {
    try {
      if (existsSync(tmp)) rmSync(tmp)
    } catch { /* tmp 清理失败不掩盖原错误 */ }
    throw e
  }
}

/** 存储目录解析序：--store > AGENT_IDENTITY_STORE > HERMES_WEB_UI_HOME/agent-identity > ~/.hermes-web-ui/agent-identity */
function resolveStoreDir(explicit) {
  if (typeof explicit === 'string' && explicit.trim()) return explicit
  const env = process.env.AGENT_IDENTITY_STORE?.trim()
  if (env) return env
  const webUiHome = process.env.HERMES_WEB_UI_HOME?.trim() || join(homedir(), '.hermes-web-ui')
  return join(webUiHome, 'agent-identity')
}

// ── 主流程 ──

/**
 * 种子入口。options={storeDir?, dryRun?, root?}（root 缺省=脚本所在仓根）。
 * 返回 {peopleCreated, peopleSkipped, unitsCreated, unitsSkipped, dryRun}。
 * 幂等：已有人（name/emails 判重）与同名身份一律跳过不动；无新增时不写盘。
 */
export function seed(options = {}) {
  const root = options.root ?? ROOT
  const dryRun = options.dryRun === true
  const storeDir = resolveStoreDir(options.storeDir)

  const profiles = readProfiles(join(root, 'team', 'profiles'))
  const registryFile = join(root, 'team', 'shared', 'owner-registry.yaml')
  const ownerRegistry = existsSync(registryFile) ? parseOwnerRegistry(readFileSync(registryFile, 'utf8')) : {}
  const authors = gitAuthors(root)

  const peopleStore = readPeopleStore(storeDir)
  const identityStore = readIdentityStore(storeDir)

  // people 候选：与既有账按 name/emails 判重，命中即跳过（不覆盖人工值）
  const peopleTodo = []
  let peopleSkipped = 0
  for (const c of derivePeople(authors)) {
    const dup = peopleStore.people.some((p) => {
      const emails = (Array.isArray(p?.emails) ? p.emails : []).map((e) => String(e).trim().toLowerCase())
      return emails.some((e) => c.emails.includes(e)) || String(p?.name ?? '').trim() === c.name
    })
    if (dup) {
      peopleSkipped += 1
      continue
    }
    peopleTodo.push(c)
  }

  // 单元草案：同名身份已存在的 profile 跳过（已存在身份不动）
  const existingNames = new Set(identityStore.identities.map((i) => String(i?.name ?? '').trim()).filter(Boolean))
  const drafts = deriveUnits(profiles, ownerRegistry, identityStore.identities)
  const unitsSkipped = profiles.filter((p) => existingNames.has(String(p?.name ?? '').trim())).length

  const now = Date.now()
  const plan = []
  const linePerson = (c) => `+ person ${c.name} <${c.emails[0]}>（inactive，source=git）`
  const lineUnit = (d) => `+ unit ${d.name}（owner=${d.owner}，registered）${d.description ? `｜${d.description}` : ''}`

  if (!dryRun) {
    if (peopleTodo.length) {
      for (const c of peopleTodo) {
        // 与 people.ts upsertPerson 同款：id=p-序号、新登记默认 active:false
        peopleStore.people.push({
          id: `p-${peopleStore.nextSeq++}`,
          name: c.name,
          emails: c.emails,
          active: false,
          source: 'git',
          createdAt: now,
        })
        plan.push(linePerson(c))
      }
      atomicWriteJson(join(storeDir, 'people.json'), peopleStore)
    }
    if (drafts.length) {
      for (const d of drafts) {
        // 与 agent-identity.ts registerIdentity 同款字段；lifecycle 显式落 registered 草案
        identityStore.identities.push({
          id: `aid-${String(identityStore.nextSeq).padStart(3, '0')}`,
          name: d.name,
          kind: 'agent',
          owner: d.owner,
          toolAllowlist: [],
          credentials: [],
          delegations: [],
          lifecycle: { stage: 'registered', history: [] },
          createdAt: now,
          updatedAt: now,
        })
        identityStore.nextSeq += 1
        plan.push(lineUnit(d))
      }
      atomicWriteJson(join(storeDir, 'identities.json'), identityStore)
    }
  } else {
    for (const c of peopleTodo) plan.push(linePerson(c))
    for (const d of drafts) plan.push(lineUnit(d))
  }

  for (const line of plan) console.log(dryRun ? `[dry-run] ${line}` : line)
  console.log(
    `hrgov-seed: people 新建 ${peopleTodo.length}/跳过 ${peopleSkipped}；单元草案 新建 ${drafts.length}/跳过 ${unitsSkipped}`
      + (dryRun ? '（dry-run，未写盘）' : ''),
  )

  return {
    peopleCreated: peopleTodo.length,
    peopleSkipped,
    unitsCreated: drafts.length,
    unitsSkipped,
    dryRun,
  }
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log('usage: node scripts/maintenance/hrgov-seed.mjs [--dry-run] [--store <dir>]')
    return 0
  }
  const dryRun = argv.includes('--dry-run')
  let storeDir
  const i = argv.indexOf('--store')
  if (i !== -1) {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      console.error('hrgov-seed: --store 需要一个目录参数')
      return 2
    }
    storeDir = argv[i + 1]
  }
  try {
    seed({ storeDir, dryRun })
    return 0
  } catch (e) {
    console.error(`hrgov-seed: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
