/**
 * 技能生成器端点 + Skill 三段安全治理扫描面（skillgov）。
 *
 * 生成器：GET /generator/status 在位探测；POST /generator/run 执行生成（bounded：
 * 绝对路径、档案白名单、超时 300s、输出截断），产物落 targetDir——生成成功后
 * 即时跑注册扫描（三段治理第一段，落在 overlay 自有的生成通路上），scan 块随响应。
 *
 * 扫描面（2026-10-13 挂账清偿轮，机制=方案 §2.6.3 边界内「Skill 三段治理」overlay 侧）：
 *   POST /api/skillgov/scan        立即扫描（roots 可选；缺省=hermes 全部装载面）
 *   GET  /api/skillgov/scan/latest 最近一次扫描结果（账本末行）
 * 生成器路径：env SKILLGEN_PATH 覆盖 → ~/.cc-switch/skills/swarm-yuan/scripts/generate-skill.sh。
 * fail-soft：生成器不在位时 status.available=false，run 返回 409 语义（ok:false）。
 */
import Router from '@koa/router'
import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { latestSkillScan, runSkillScan, scanSkillDir } from './skill-scan'

const router = new Router({ prefix: '/api/skillgov' })

// ---------- 三段治理 · 第一段：注册扫描 ----------

router.post('/scan', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { roots?: string[] }
  const roots = Array.isArray(body.roots) ? body.roots.filter((r) => typeof r === 'string' && r.startsWith('/')).slice(0, 16) : undefined
  const summary = runSkillScan(roots)
  ctx.body = {
    ok: true,
    scanned: summary.scanned,
    byVerdict: summary.byVerdict,
    roots: summary.roots,
    // 明细压缩面（全量在账本；dangerous 优先）
    results: summary.results
      .slice()
      .sort((a, b) => (a.verdict === 'dangerous' ? -1 : b.verdict === 'dangerous' ? 1 : 0))
      .slice(0, 64)
      .map((r) => ({ name: r.name, dir: r.dir, verdict: r.verdict, findingsCount: r.findings.length, findings: r.findings.slice(0, 8) })),
  }
})

router.get('/scan/latest', async (ctx) => {
  let latest: ReturnType<typeof latestSkillScan> = null
  try {
    latest = latestSkillScan()
  } catch {
    latest = null
  }
  if (!latest) {
    ctx.body = { ok: true, scanned: 0, hint: '尚无扫描记录——POST /api/skillgov/scan 发起' }
    return
  }
  ctx.body = {
    ok: true,
    scannedAt: latest.scannedAt,
    scanned: latest.scanned,
    byVerdict: latest.byVerdict,
    results: latest.results.map((r) => ({ name: r.name, dir: r.dir, verdict: r.verdict, findingsCount: r.findings.length })),
  }
})

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
    // 三段治理第一段：生成即扫描（overlay 自有生成通路上的注册扫描锚点）。
    // 生成已成功——扫描结论随响应呈现（dangerous 不撤回产物，处置权在人）。
    let scan: ReturnType<typeof scanSkillDir> | undefined
    try {
      scan = scanSkillDir(out)
    } catch { /* 扫描失败不遮蔽生成成功 */ }
    ctx.body = {
      ok: true,
      targetDir: out,
      output: `${stdout}\n${stderr}`.slice(-4000),
      ...(scan ? {
        scan: {
          verdict: scan.verdict,
          findingsCount: scan.findings.length,
          findings: scan.findings.slice(0, 8),
        },
        ...(scan.verdict === 'dangerous' ? { warning: `注册扫描判定 dangerous（${scan.findings.filter((f) => f.severity === 'high').length} 项高危）——处置后再入装载面` } : {}),
      } : {}),
    }
  } catch (err) {
    ctx.status = 500
    ctx.body = { ok: false, reason: 'generator_failed', detail: (err instanceof Error ? err.message : String(err)).slice(0, 500) }
  }
})

export const generatorRoutes = router
export default router
