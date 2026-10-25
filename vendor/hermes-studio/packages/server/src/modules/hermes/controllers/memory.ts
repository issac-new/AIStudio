import { mkdir, rename, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { safeReadFile, safeStat } from '../../studio/public/files'
import { getActiveProfileName, getProfileDir } from '../services/profiles/profile'

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
    // mtime CAS：hermes memory 工具并写同一批文件，先读后写会在 agent 留痕与
    // 人工编辑并发时互相覆盖。客户端带上加载时 mtime，对不上即 409 拒写。
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
    // 原子替换：直接覆盖写会留半截文件（tmp+rename 与 approval-store 同款防护）。
    const tmp = `${filePath}.${process.pid}.tmp`
    await writeFile(tmp, content, 'utf-8')
    await rename(tmp, filePath)
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}
