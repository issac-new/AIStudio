import { mkdir, stat, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { safeReadFile, safeStat } from '../../studio/public/files'
import { getActiveProfileName, getProfileDir } from '../services/profiles/profile'
import { getHermesBin } from '../services/runtime/path'
import { execHermesWithBin } from '../services/runtime/process'

function requestedProfile(ctx: any): string {
  return ctx.state?.profile?.name || getActiveProfileName() || 'default'
}

function requestProfileDir(ctx: any): string {
  return getProfileDir(requestedProfile(ctx))
}

export async function get(ctx: any) {
  const hd = requestProfileDir(ctx)
  const memoryPath = join(hd, 'memories', 'MEMORY.md')
  const userPath = join(hd, 'memories', 'USER.md')
  const soulPath = join(hd, 'SOUL.md')
  const [memory, user, soul, memoryStat, userStat, soulStat] = await Promise.all([
    safeReadFile(memoryPath), safeReadFile(userPath), safeReadFile(soulPath),
    safeStat(memoryPath), safeStat(userPath), safeStat(soulPath),
  ])
  ctx.body = {
    memory: memory || '', user: user || '', soul: soul || '',
    memory_mtime: memoryStat?.mtime || null, user_mtime: userStat?.mtime || null, soul_mtime: soulStat?.mtime || null,
  }
}

export async function save(ctx: any) {
  const { section, content, expected_mtime } = ctx.request.body as {
    section: string; content: string; expected_mtime?: string | number | null
  }
  if (!section || content === undefined || content === null) {
    ctx.status = 400
    ctx.body = { error: 'Missing section or content' }
    return
  }
  if (section !== 'memory' && section !== 'user' && section !== 'soul') {
    ctx.status = 400
    ctx.body = { error: 'Section must be "memory", "user", or "soul"' }
    return
  }
  let filePath: string
  const hd = requestProfileDir(ctx)
  if (section === 'soul') {
    filePath = join(hd, 'SOUL.md')
  } else {
    const fileName = section === 'memory' ? 'MEMORY.md' : 'USER.md'
    await mkdir(join(hd, 'memories'), { recursive: true })
    filePath = join(hd, 'memories', fileName)
  }
  try {
    // mtime CAS 快路径：客户端带上加载时 mtime，对不上即 409 拒写（结构化
    // current_mtime 供前端重载）。与 CLI --expect-mtime 双层校验防 TOCTOU。
    // 缺省（不带 expected_mtime）保持旧行为，兼容既有调用方。
    if (expected_mtime != null && expected_mtime !== '') {
      const expMs = typeof expected_mtime === 'number'
        ? expected_mtime
        : Date.parse(String(expected_mtime))
      const st = await stat(filePath).catch(() => null)
      const curMs = st ? new Date(st.mtime).getTime() : null
      if (curMs != null && Number.isFinite(expMs) && Math.round(curMs) !== Math.round(expMs)) {
        ctx.status = 409
        ctx.body = { error: 'mtime conflict: file changed since load', current_mtime: new Date(curMs).toISOString() }
        return
      }
    }
    // 内容写收口到 hermes CLI 单写者（patch 452 的 `hermes memory set`）：原子写
    // 与并写互覆防护统一在 CLI 侧实现，本控制器不再直写记忆文件。
    const tmp = join(tmpdir(), `hermes-memory-${process.pid}-${Date.now()}.tmp`)
    await writeFile(tmp, content, 'utf-8')
    try {
      const args = ['memory', 'set', section, '--file', tmp]
      if (expected_mtime != null && expected_mtime !== '') {
        args.push('--expect-mtime', String(expected_mtime))
      }
      await execHermesWithBin(getHermesBin(), args, {
        env: { ...process.env, HERMES_HOME: hd },
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
    } finally {
      await unlink(tmp).catch(() => undefined)
    }
    ctx.body = { success: true }
  } catch (err: any) {
    if (err?.code === 3) {
      ctx.status = 409
      ctx.body = { error: 'mtime conflict: file changed since load' }
      return
    }
    ctx.status = 500
    ctx.body = { error: err?.stderr || err.message }
  }
}
