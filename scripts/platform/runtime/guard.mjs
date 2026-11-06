// SIM 运行时单一所有权核心（P2 Task 1，语义正本）。
//
// 四因子判活（缺一不可，PID 复用/锁目录搬家两类误判的根治面）：
//   ① pid 活（探针可证）；
//   ② cmdMatcher 符（pid 活但命令行与持锁时登记的匹配符不符 = pid 被无关进程
//      复用 → 不算活，允许接管；匹配符缺席无法验证 → 宁停勿抢按活处理）；
//   ③ instance（随机 token，release 的第二道闸：pid 相同 instance 不同不得删锁）；
//   ④ 规范化 simRoot（锁目录被搬到另一根下 → 不算活，防跨根误认）。
//
// 状态布局（全部在 SIM_ROOT 内，测试用临时根即可）：
//   var/guard/owner.json                     当前 owner
//   var/guard/owner.stale.<ts>-<pid>         陈 owner 归档（原子 mv 接管留痕）
//   var/guard/clean-lease.json               清场租约（在租约内注册/抢锁全拒）
//   var/guard/residents/<role>--<runId>.json 常驻角色注册
//   .driver.lock.d/info                      驱动锁（行式 pid=/instance=…，旧读法兼容）
//   logs/guard-events.jsonl                  事件流（acquired/refused/takeover/…）
//
// 探针注入：env MX_GUARD_PROBE=<可执行文件> <pid> —— 退出 0 且 stdout=命令行=活；
// 非 0 或空输出=死。缺省探针 = `ps -p <pid> -o command=`（空输出=死）。
// 测试一律用假探针，不依赖宿主进程表。
import { execFileSync } from 'node:child_process'
import {
  appendFileSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

export const KINDS = ['product-supervisor', 'bash-supervisor', 'relay', 'driver', 'clean']

/** 规范化 simRoot：realpath 真身（symlink 归一到 canonical 路径）；不存在回落 resolve */
export function normalizeSimRoot(p) {
  try { return resolve(realpathSync(p)) } catch { return resolve(p) }
}

function token() {
  return randomBytes(8).toString('hex')
}

export function guardDirOf(simRoot) {
  return join(simRoot, 'var', 'guard')
}

export function lockEventPath(simRoot) {
  return join(simRoot, 'logs', 'guard-events.jsonl')
}

/** 事件留痕（败方让位/接管/清场闸都在此流；事件失败不阻断仲裁） */
export function appendEvent(simRoot, kind, detail, extra = {}) {
  try {
    mkdirSync(dirname(lockEventPath(simRoot)), { recursive: true })
    // extra 统一入 meta：调用方字段（kind/pid 等）不得覆盖事件信封的 kind
    const e = { ts: new Date().toISOString(), kind, ...(detail ? { detail } : {}), ...(Object.keys(extra).length ? { meta: extra } : {}) }
    appendFileSync(lockEventPath(simRoot), JSON.stringify(e) + '\n')
  } catch { /* fail-soft：事件缺席不改变仲裁结果 */ }
}

/** 探针：pid → { alive, cmd }（MX_GUARD_PROBE 注入；缺省 ps） */
export function probePid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return { alive: false, cmd: '' }
  const inject = process.env.MX_GUARD_PROBE?.trim()
  try {
    if (inject) {
      const out = execFileSync(inject, [String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const cmd = out.split('\n')[0]?.trim() ?? ''
      return cmd ? { alive: true, cmd } : { alive: false, cmd: '' }
    }
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const cmd = out.split('\n')[0]?.trim() ?? ''
    return cmd ? { alive: true, cmd } : { alive: false, cmd: '' }
  } catch {
    return { alive: false, cmd: '' }
  }
}

/**
 * 四因子判活。recorded = {pid, cmdMatcher, simRoot}（锁内登记），actualRoot = 当前状态所在根。
 * 返回 {alive, reason}：
 *   pid-dead / pid-reused-cmd-mismatch / simroot-mismatch / cmd-match / unverifiable-cmd（宁停勿抢）
 */
export function holderAlive(recorded, actualRoot) {
  if (!recorded || !Number.isInteger(recorded.pid)) return { alive: false, reason: 'record-unparsable' }
  const p = probePid(recorded.pid)
  if (!p.alive) return { alive: false, reason: 'pid-dead' }
  const matcher = typeof recorded.cmdMatcher === 'string' ? recorded.cmdMatcher.trim() : ''
  if (!matcher) return { alive: true, reason: 'unverifiable-cmd（宁停勿抢）' }
  let re
  try { re = new RegExp(matcher) } catch { return { alive: true, reason: 'unverifiable-cmd（matcher 非法，宁停勿抢）' } }
  if (!re.test(p.cmd)) return { alive: false, reason: `pid-reused-cmd-mismatch（pid=${recorded.pid} cmd=${p.cmd.slice(0, 80)}）` }
  if (recorded.simRoot && actualRoot && recorded.simRoot !== actualRoot) {
    return { alive: false, reason: `simroot-mismatch（recorded=${recorded.simRoot} actual=${actualRoot}）` }
  }
  return { alive: true, reason: 'cmd-match' }
}

// ── JSON 状态文件小工具 ────────────────────────────────────
/** 独占创建（link 原子性：目标已存在=竞争失败）。并发恰一胜者的机制基础。 */
function createJsonExclusive(path, obj) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${process.pid}.${token()}`
  writeFileSync(tmp, JSON.stringify(obj) + '\n', 'utf8')
  try {
    linkSync(tmp, path)
    unlinkSync(tmp)
    return { ok: true }
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* noop */ }
    if (e && e.code === "EEXIST") return { ok: false, eexist: true }
    throw e
  }
}

function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (e) {
    if (!existsSync(path)) return { ok: false, absent: true }
    return { ok: false, absent: false, error: String(e) }
  }
}

/** 清场租约是否活跃（死租约=不活跃，可被接管） */
function cleanLeaseActive(simRoot) {
  const path = join(guardDirOf(simRoot), 'clean-lease.json')
  const r = readJson(path)
  if (r.ok) {
    const v = holderAlive({ pid: r.value.pid, cmdMatcher: r.value.cmdMatcher, simRoot: r.value.simRoot }, simRoot)
    return { active: v.alive, value: r.value, path }
  }
  return { active: false, value: null, path }
}

function refuseDuringClean(simRoot, what) {
  const lease = cleanLeaseActive(simRoot)
  if (!lease.active) return null
  return { ok: false, code: 1, reason: `clean-lease-active（清场租约在位 pid=${lease.value?.pid}——${what} 拒绝，待 clean-end）` }
}

// ── owner 协议 ─────────────────────────────────────────────

export function ownerAcquire({ simRoot, kind, runId, pid, cmdMatcher }) {
  const root = normalizeSimRoot(simRoot)
  if (!KINDS.includes(kind) || kind === 'driver' || kind === 'clean') {
    return { ok: false, code: 2, reason: `kind 非法：${kind}（owner 限 product-supervisor|bash-supervisor|relay）` }
  }
  if (!Number.isInteger(pid) || !cmdMatcher?.trim()) {
    return { ok: false, code: 2, reason: 'pid 与 cmdMatcher 必填（四因子判活缺一不可）' }
  }
  const dir = guardDirOf(root)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'owner.json')
  const leaseBlock = refuseDuringClean(root, 'owner-acquire')
  if (leaseBlock) {
    appendEvent(root, 'owner-refused', leaseBlock.reason, { requester: kind, requesterPid: pid })
    return leaseBlock
  }
  if (existsSync(path)) {
    const r = readJson(path)
    if (!r.ok) {
      // 坏 owner 文件宁停勿抢（V4 教训：解析不出按活锁拒绝）
      appendEvent(root, 'owner-refused', 'owner.json 不可解析（宁停勿抢）', { requester: kind, requesterPid: pid })
      return { ok: false, code: 2, reason: 'owner.json 不可解析（宁停勿抢——人工核验后清理）', holder: null }
    }
    const holder = r.value
    const v = holderAlive(holder, root)
    if (v.alive) {
      appendEvent(root, 'owner-refused', `持有人活（${v.reason}）`, { requester: kind, requesterPid: pid, holder: { kind: holder.kind, pid: holder.pid, runId: holder.runId ?? null } })
      return { ok: false, code: 1, reason: `owner 在位（kind=${holder.kind} pid=${holder.pid}，${v.reason}）`, holder: { kind: holder.kind, pid: holder.pid, runId: holder.runId ?? null } }
    }
    // 陈 owner：原子 mv 摘走再写新（竞争失败=另一接管者刚写完）
    const stale = join(dir, `owner.stale.${Date.now()}-${holder.pid ?? 'x'}`)
    try {
      renameSync(path, stale)
    } catch {
      appendEvent(root, 'owner-refused', '接管竞争失败（另一接管者先到）', { requester: kind, requesterPid: pid })
      return { ok: false, code: 2, reason: '接管竞争失败（另一接管者先到）', holder: null }
    }
    const instance = token()
    const created = createJsonExclusive(path, { kind, runId: runId ?? null, pid, instance, cmdMatcher, simRoot: root, startedAt: new Date().toISOString() })
    if (!created.ok) {
      appendEvent(root, 'owner-refused', '接管竞争失败（摘走陈锁后被抢先重建）', { requester: kind, requesterPid: pid })
      return { ok: false, code: 2, reason: '接管竞争失败（摘走陈锁后被抢先重建）', holder: null }
    }
    // 陈 owner 归档保留（接管留痕可回查；不删）
    appendEvent(root, 'owner-takeover-stale', `陈 owner pid=${holder.pid} 不活（${v.reason}）→ ${kind} pid=${pid} 接管`, { kind, pid, prev: { kind: holder.kind, pid: holder.pid } })
    appendEvent(root, 'owner-acquired', `${kind} pid=${pid}（接管）`, { kind, pid, runId: runId ?? null })
    return { ok: true, instance, tookOverFrom: { kind: holder.kind, pid: holder.pid } }
  }
  const instance = token()
  const created = createJsonExclusive(path, { kind, runId: runId ?? null, pid, instance, cmdMatcher, simRoot: root, startedAt: new Date().toISOString() })
  if (!created.ok) {
    // 并发竞争败方：重读持有人按活锁语义拒绝（不 silent 覆盖）
    const cur = readJson(path)
    const holder = cur.ok ? cur.value : null
    appendEvent(root, 'owner-refused', '并发竞争败方（owner 已被同批创建）', { requester: kind, requesterPid: pid })
    return { ok: false, code: 1, reason: `owner 在位（kind=${holder?.kind ?? '?'} pid=${holder?.pid ?? '?'}，并发竞争）`, holder: holder ? { kind: holder.kind, pid: holder.pid, runId: holder.runId ?? null } : null }
  }
  appendEvent(root, 'owner-acquired', `${kind} pid=${pid}`, { kind, pid, runId: runId ?? null })
  return { ok: true, instance }
}

export function ownerRelease({ simRoot, pid, instance }) {
  const root = normalizeSimRoot(simRoot)
  const path = join(guardDirOf(root), 'owner.json')
  const r = readJson(path)
  if (r.absent) return { ok: true, noop: true }
  if (!r.ok) return { ok: false, code: 2, reason: 'owner.json 不可解析（宁停勿抢——人工核验）' }
  const holder = r.value
  if (holder.pid !== pid || holder.instance !== instance) {
    appendEvent(root, 'owner-release-refused', `pid+instance 不匹配（请求 pid=${pid}，持有人 pid=${holder.pid}）——防 PID 复用误删`, { requesterPid: pid })
    return { ok: false, code: 1, reason: 'pid+instance 不匹配（防 PID 复用误删）', holder: { kind: holder.kind, pid: holder.pid } }
  }
  try { unlinkSync(path) } catch { /* 已消失=幂等 */ }
  appendEvent(root, 'owner-released', `${holder.kind} pid=${pid} 释放`, { kind: holder.kind, pid })
  return { ok: true }
}

export function readOwner(simRoot) {
  const root = normalizeSimRoot(simRoot)
  const path = join(guardDirOf(root), 'owner.json')
  const r = readJson(path)
  if (r.absent) return null
  if (!r.ok) return { ...r.value ?? {}, unparsable: true }
  return r.value
}

// ── driver 锁（.driver.lock.d，行式 info 兼容旧读法） ────────

function parseDriverInfo(text) {
  const out = { pid: NaN, instance: null, kind: null, runId: null, cmdMatcher: null, simRoot: null }
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    const [, k, v] = m
    // pid 只取前导数字段（旧格式 'pid=12345 start=… host=…' 同行多键——整段 Number
    // 会得 NaN 被误判陈锁，V4-run1 同型缺陷；与 mx_lock_holder_pid 口径一致）
    if (k === 'pid') out.pid = Number(/^\d+/.exec(v.trim())?.[0] ?? NaN)
    else if (k in out) (out)[k] = v.trim()
  }
  return out
}

function formatDriverInfo({ pid, instance, kind, runId, cmdMatcher, simRoot }) {
  return [
    `pid=${pid}`,
    `instance=${instance}`,
    `kind=${kind ?? 'driver'}`,
    `runId=${runId ?? ''}`,
    `cmdMatcher=${cmdMatcher ?? ''}`,
    `started=${new Date().toISOString()}`,
    `host=${hostname()}`,
    `simRoot=${simRoot}`,
  ].join('\n') + '\n'
}

function writeDriverInfo(lockDir, payload) {
  mkdirSync(lockDir, { recursive: true })
  writeFileSync(join(lockDir, 'info'), formatDriverInfo(payload), 'utf8')
}

/** 独占提交 driver info（link 原子创建）：恰一进程能落 info——半写态接管竞态的
 *  根治提交点（P2 批一审查 I-1 方案 b）。返回 instance|null（null=EEXIST 败北）。 */
function commitDriverInfoExclusive(lockDir, { pid, kind, runId, cmdMatcher, simRoot }) {
  const instance = token()
  const tmp = join(lockDir, `.info.tmp.${process.pid}.${instance}`)
  mkdirSync(lockDir, { recursive: true })
  writeFileSync(tmp, formatDriverInfo({ pid, instance, kind, runId, cmdMatcher, simRoot }), 'utf8')
  try {
    linkSync(tmp, join(lockDir, 'info'))
    unlinkSync(tmp)
    return instance
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* noop */ }
    if (e && e.code === 'EEXIST') return null
    throw e
  }
}

export function driverLockDir(simRoot, lockDir) {
  return lockDir ? resolve(lockDir) : join(normalizeSimRoot(simRoot), '.driver.lock.d')
}

export function driverAcquire({ simRoot, lockDir, kind = 'driver', runId, pid, cmdMatcher }) {
  const root = normalizeSimRoot(simRoot)
  if (!Number.isInteger(pid) || !cmdMatcher?.trim()) {
    return { ok: false, code: 2, reason: 'pid 与 cmdMatcher 必填（四因子判活缺一不可）' }
  }
  const dir = driverLockDir(root, lockDir)
  const leaseBlock = refuseDuringClean(root, 'driver-acquire')
  if (leaseBlock) {
    appendEvent(root, 'driver-refused', leaseBlock.reason, { requesterPid: pid })
    return leaseBlock
  }
  // 独占提交点：mkdir 只是容器，info 经 link() 原子创建——并发者恰一胜出，
  // 败方落 EEXIST 分支按"锁已存在"判活（I-1 根治，双 ok 窗口封死）。
  try { mkdirSync(dir) } catch { /* 已存在 → 先试独占提交再判活 */ }
  const instance = commitDriverInfoExclusive(dir, { pid, kind, runId, cmdMatcher, simRoot: root })
  if (instance !== null) {
    appendEvent(root, 'driver-acquired', `driver pid=${pid}（${kind}）`, { pid, kind, runId: runId ?? null })
    return { ok: true, instance }
  }
  const judgeExisting = () => {
    const infoPath = join(dir, 'info')
    const held = existsSync(infoPath)
      ? parseDriverInfo(readFileSync(infoPath, 'utf8'))
      : null
    if (held && Number.isInteger(held.pid)) {
      const v = holderAlive(held, root)
      if (v.alive) {
        appendEvent(root, 'driver-refused', `驱动锁在位且持有人活（${v.reason}）`, { requesterPid: pid, holder: { pid: held.pid, runId: held.runId } })
        return { ok: false, code: 1, reason: `驱动锁被占（pid=${held.pid}，${v.reason}）`, holder: { pid: held.pid, runId: held.runId } }
      }
      const stale = `${dir}.stale.${Date.now()}-${process.pid}`
      try {
        renameSync(dir, stale)
      } catch {
        appendEvent(root, 'driver-refused', '接管竞争失败（另一驱动者先到）', { requesterPid: pid })
        return { ok: false, code: 2, reason: '接管竞争失败（另一驱动者先到）', holder: null }
      }
      try {
        mkdirSync(dir)
        const inst = commitDriverInfoExclusive(dir, { pid, kind, runId, cmdMatcher, simRoot: root })
        if (inst === null) {
          appendEvent(root, 'driver-refused', '接管竞争判负（info 独占创建败北）', { requesterPid: pid })
          return { ok: false, code: 2, reason: '接管竞争判负（info 独占创建败北）', holder: null }
        }
        appendEvent(root, 'driver-takeover-stale', `陈驱动锁 pid=${held.pid} 不活（${v.reason}）→ pid=${pid} 接管`, { pid })
        appendEvent(root, 'driver-acquired', `driver pid=${pid}（接管）`, { pid, kind })
        return { ok: true, instance: inst, tookOverFrom: { pid: held.pid } }
      } catch {
        appendEvent(root, 'driver-refused', '接管竞争失败（mkdir 失败）', { requesterPid: pid })
        return { ok: false, code: 2, reason: '接管竞争失败', holder: null }
      }
    }
    return null // 无 info 或 info 不可解析：半写态 → 外层宽限重试
  }
  const first = judgeExisting()
  if (first) return first
  // 目录在但 info 缺席/不可解析（半写态）：创建者可能正处于 mkdir→link 之间——
  // 短宽限后复查（link 原子性保证 info 一旦出现即完整），仍缺席才按陈锁接管。
  const sleepSync = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }
  sleepSync(50)
  const second = judgeExisting()
  if (second) return second
  const stale = `${dir}.stale.${Date.now()}-${process.pid}`
  try {
    renameSync(dir, stale)
    mkdirSync(dir)
    const inst = commitDriverInfoExclusive(dir, { pid, kind, runId, cmdMatcher, simRoot: root })
    if (inst === null) {
      appendEvent(root, 'driver-refused', '半写态接管判负（info 独占创建败北）', { requesterPid: pid })
      return { ok: false, code: 2, reason: '半写态接管判负（info 独占创建败北）', holder: null }
    }
    appendEvent(root, 'driver-takeover-stale', `驱动锁无 info（半写态）→ pid=${pid} 接管`, { pid })
    appendEvent(root, 'driver-acquired', `driver pid=${pid}`, { pid, kind })
    return { ok: true, instance: inst }
  } catch {
    return { ok: false, code: 2, reason: '接管竞争失败（半写态）', holder: null }
  }
}

export function driverRelease({ simRoot, lockDir, pid, instance }) {
  const root = normalizeSimRoot(simRoot)
  const dir = driverLockDir(root, lockDir)
  const infoPath = join(dir, 'info')
  if (!existsSync(infoPath)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* noop */ }
    return { ok: true, noop: true }
  }
  const held = parseDriverInfo(readFileSync(infoPath, 'utf8'))
  if (held.pid !== pid || held.instance !== instance) {
    appendEvent(root, 'driver-release-refused', `pid+instance 不匹配（请求 pid=${pid}，持有人 pid=${held.pid}）`, { requesterPid: pid })
    return { ok: false, code: 1, reason: 'pid+instance 不匹配（防 PID 复用误删）', holder: { pid: held.pid } }
  }
  rmSync(dir, { recursive: true, force: true })
  appendEvent(root, 'driver-released', `driver pid=${pid} 释放`, { pid })
  return { ok: true }
}

export function readDriver(simRoot, lockDir) {
  const root = normalizeSimRoot(simRoot)
  const infoPath = join(driverLockDir(root, lockDir), 'info')
  if (!existsSync(infoPath)) return null
  try {
    return parseDriverInfo(readFileSync(infoPath, 'utf8'))
  } catch {
    return null
  }
}

// ── 常驻角色注册 ───────────────────────────────────────────

function residentPath(simRoot, role, runId) {
  return join(guardDirOf(simRoot), 'residents', `${role}--${runId ?? 'default'}.json`)
}

export function residentRegister({ simRoot, role, runId, pid, cmdMatcher }) {
  const root = normalizeSimRoot(simRoot)
  if (!role || !Number.isInteger(pid) || !cmdMatcher?.trim()) {
    return { ok: false, code: 2, reason: 'role/pid/cmdMatcher 必填' }
  }
  const leaseBlock = refuseDuringClean(root, 'resident-register')
  if (leaseBlock) {
    appendEvent(root, 'resident-refused', leaseBlock.reason, { role, requesterPid: pid })
    return leaseBlock
  }
  const path = residentPath(root, role, runId)
  if (existsSync(path)) {
    const r = readJson(path)
    if (r.ok) {
      if (r.value.pid === pid) {
        // 幂等重注册（同 pid：刷新 instance 视为新会话，覆盖）
      } else {
        const v = holderAlive(r.value, root)
        if (v.alive) {
          appendEvent(root, 'resident-refused', `角色在位且活（${v.reason}）`, { role, requesterPid: pid })
          return { ok: false, code: 1, reason: `resident 在位（role=${role} pid=${r.value.pid}，${v.reason}）`, holder: { role, pid: r.value.pid } }
        }
      }
    }
  }
  const instance = token()
  const created = createJsonExclusive(path, { role, runId: runId ?? null, pid, instance, cmdMatcher, simRoot: root, startedAt: new Date().toISOString() })
  if (!created.ok) return { ok: false, code: 1, reason: 'resident 并发竞争失败（同角色同轮已被注册）' }
  appendEvent(root, 'resident-registered', `${role} pid=${pid}`, { role, pid, runId: runId ?? null })
  return { ok: true, instance }
}

export function residentUnregister({ simRoot, role, runId, pid, instance }) {
  const root = normalizeSimRoot(simRoot)
  const path = residentPath(root, role, runId)
  if (!existsSync(path)) return { ok: true, noop: true }
  const r = readJson(path)
  if (r.ok && r.value.pid !== pid) {
    return { ok: false, code: 1, reason: `pid 不匹配（请求 ${pid}，注册 ${r.value.pid}——防误删）`, holder: { role, pid: r.value.pid } }
  }
  if (r.ok && instance != null && r.value.instance !== instance) {
    return { ok: false, code: 1, reason: 'instance 不匹配（防 PID 复用误删）', holder: { role, pid: r.value.pid } }
  }
  try { unlinkSync(path) } catch { /* 幂等 */ }
  appendEvent(root, 'resident-unregistered', `${role} pid=${pid}`, { role, pid })
  return { ok: true }
}

export function listResidents(simRoot) {
  const root = normalizeSimRoot(simRoot)
  const dir = join(guardDirOf(root), 'residents')
  if (!existsSync(dir)) return []
  const out = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const r = readJson(join(dir, f))
    if (!r.ok) { out.push({ role: f.replace(/\.json$/, ''), unparsable: true, alive: false }); continue }
    out.push({ ...r.value, alive: false })
  }
  return out
}

// ── 清场租约 ───────────────────────────────────────────────

export function cleanBegin({ simRoot, pid, cmdMatcher }) {
  const root = normalizeSimRoot(simRoot)
  if (!Number.isInteger(pid) || !cmdMatcher?.trim()) {
    return { ok: false, code: 2, reason: 'pid 与 cmdMatcher 必填' }
  }
  const path = join(guardDirOf(root), 'clean-lease.json')
  if (existsSync(path)) {
    const r = readJson(path)
    if (r.ok) {
      const v = holderAlive(r.value, root)
      if (v.alive) {
        return { ok: false, code: 1, reason: `清场租约在位（pid=${r.value.pid}，${v.reason}）`, holder: { pid: r.value.pid } }
      }
      const stale = `${path}.stale.${Date.now()}`
      try { renameSync(path, stale) } catch { return { ok: false, code: 2, reason: '租约接管竞争失败' } }
      rmSync(stale, { force: true })
      appendEvent(root, 'clean-lease-takeover', `陈租约 pid=${r.value.pid} 不活 → pid=${pid} 接管`, { pid })
    }
  }
  const instance = token()
  const created = createJsonExclusive(path, { pid, instance, cmdMatcher, simRoot: root, startedAt: new Date().toISOString() })
  if (!created.ok) return { ok: false, code: 1, reason: '清场租约并发竞争失败' }
  appendEvent(root, 'clean-begin', `清场租约建立 pid=${pid}`, { pid })
  return { ok: true, instance }
}

/** 活角色断言（任何活角色在首个停栈/归档/删除前拒绝） */
export function assertNoActiveResidents({ simRoot }) {
  const root = normalizeSimRoot(simRoot)
  const active = []
  const owner = readOwner(root)
  if (owner && !owner.unparsable) {
    const v = holderAlive(owner, root)
    if (v.alive) active.push({ kind: 'owner', role: owner.kind, pid: owner.pid, runId: owner.runId ?? null, reason: v.reason })
  }
  const driver = readDriver(root)
  if (driver && Number.isInteger(driver.pid)) {
    const v = holderAlive(driver, root)
    if (v.alive) active.push({ kind: 'driver', role: 'driver', pid: driver.pid, runId: driver.runId ?? null, reason: v.reason })
  }
  for (const res of listResidents(root)) {
    if (res.unparsable) continue
    const v = holderAlive(res, root)
    if (v.alive) active.push({ kind: 'resident', role: res.role, pid: res.pid, runId: res.runId ?? null, reason: v.reason })
  }
  if (active.length > 0) {
    appendEvent(root, 'clean-assert-blocked', `活角色 ${active.length} 个：${active.map((a) => `${a.kind}:${a.role}#pid${a.pid}`).join(', ')}`, { active })
    return { ok: false, code: 1, reason: `活角色在位（${active.map((a) => `${a.kind}:${a.role} pid=${a.pid}`).join('; ')}）——首个停栈/归档/删除前拒绝`, residents: active }
  }
  return { ok: true, residents: [] }
}

export function cleanEnd({ simRoot, pid, instance }) {
  const root = normalizeSimRoot(simRoot)
  const path = join(guardDirOf(root), 'clean-lease.json')
  const r = readJson(path)
  if (r.absent) return { ok: true, noop: true }
  if (!r.ok) return { ok: false, code: 2, reason: 'clean-lease.json 不可解析' }
  if (r.value.pid !== pid || r.value.instance !== instance) {
    return { ok: false, code: 1, reason: 'pid+instance 不匹配（防误删他人租约）', holder: { pid: r.value.pid } }
  }
  try { unlinkSync(path) } catch { /* 幂等 */ }
  appendEvent(root, 'clean-end', `清场租约解除 pid=${pid}`, { pid })
  return { ok: true }
}

// ── 汇总状态 ───────────────────────────────────────────────

export function lockStatus({ simRoot }) {
  const root = normalizeSimRoot(simRoot)
  const owner = readOwner(root)
  const ownerView = owner
    ? { kind: owner.kind ?? null, pid: owner.pid ?? null, runId: owner.runId ?? null, instance: owner.instance ?? null, alive: !owner.unparsable && holderAlive(owner, root).alive }
    : null
  const driver = readDriver(root)
  const driverView = driver
    ? { pid: Number.isInteger(driver.pid) ? driver.pid : null, runId: driver.runId ?? null, instance: driver.instance ?? null, alive: holderAlive(driver, root).alive }
    : null
  const lease = cleanLeaseActive(root)
  const residents = listResidents(root).map((r) => ({
    role: r.role, pid: r.pid ?? null, runId: r.runId ?? null, alive: r.unparsable ? false : holderAlive(r, root).alive,
  }))
  return {
    ok: true,
    simRoot: root,
    owner: ownerView,
    driver: driverView,
    cleanLease: lease.active ? { pid: lease.value?.pid ?? null } : null,
    residents,
  }
}
