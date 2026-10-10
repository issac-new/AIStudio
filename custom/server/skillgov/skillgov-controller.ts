/**
 * 技能生成器端点（skillgov）：把本机安装的 swarm-yuan 生成器暴露为产品能力。
 * GET /api/skillgov/generator/status —— 生成器在位探测（路径/可用性/用法行）。
 * POST /api/skillgov/generator/run —— 执行生成（bounded：绝对路径、档案白名单、
 * 超时 300s、输出截断），产物落 targetDir（缺省 projectDir 同级 <name>-skill）。
 * 生成器路径：env SKILLGEN_PATH 覆盖 → ~/.cc-switch/skills/swarm-yuan/scripts/generate-skill.sh。
 * fail-soft：生成器不在位时 status.available=false，run 返回 409 语义（ok:false）。
 */
import Router from '@koa/router'
import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const router = new Router({ prefix: '/api/skillgov' })

export function generatorPath(): string {
  const env = process.env.SKILLGEN_PATH?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return resolve(homedir(), '.cc-switch', 'skills', 'swarm-yuan', 'scripts', 'generate-skill.sh')
}

router.get('/generator/status', async (ctx) => {
  const p = generatorPath()
  let available = false
  try {
    const st = statSync(p)
    available = st.isFile()
  } catch { available = false }
  ctx.body = {
    ok: true,
    generator: { path: p, available, usage: available ? `bash ${p} --profile <lite|standard|compliance> <skill-name> <project-dir> <target-dir>` : null },
  }
})

router.post('/generator/run', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { profile?: string; name?: string; projectDir?: string; targetDir?: string }
  const { profile, name, projectDir, targetDir } = body
  if (profile !== 'lite' && profile !== 'standard' && profile !== 'compliance') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'profile 必填（lite|standard|compliance）' }
    return
  }
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'name 必填（字母数字开头，≤64 字符，限 [A-Za-z0-9._-]）' }
    return
  }
  if (!projectDir || !projectDir.startsWith('/') || projectDir === '/') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'projectDir 必填（绝对路径，禁根目录）' }
    return
  }
  if (!existsSync(projectDir)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: `projectDir 不存在：${projectDir}` }
    return
  }
  const gen = generatorPath()
  if (!existsSync(gen)) {
    ctx.status = 409
    ctx.body = { ok: false, reason: 'generator_unavailable', detail: `生成器不在位（${gen}）——安装 swarm-yuan 或设 SKILLGEN_PATH` }
    return
  }
  const out = targetDir && targetDir.startsWith('/') ? targetDir : resolve(projectDir, '..', `${name}-skill`)
  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolveP, rejectP) => {
      execFile('bash', [gen, '--profile', profile, name, projectDir, out], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 }, (err, so, se) => {
        if (err) rejectP(err)
        else resolveP({ stdout: String(so), stderr: String(se) })
      })
    })
    ctx.body = { ok: true, targetDir: out, output: `${stdout}\n${stderr}`.slice(-4000) }
  } catch (err) {
    ctx.status = 500
    ctx.body = { ok: false, reason: 'generator_failed', detail: (err instanceof Error ? err.message : String(err)).slice(0, 500) }
  }
})

export const generatorRoutes = router
export default router
