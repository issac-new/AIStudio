/**
 * runtime-verify — 目标运行时验证能力（2026-10-11 真工具演示轮根治件）。
 *
 * 根因背景：run14 交付含原生小程序工程（csw-cashier-mp），但组织内没有任何岗位
 * 能把它在真实开发者工具里跑起来——G3 只认 Node 单测 testlog，UAT 只认仓内报告，
 * 成效采集器因此把原生 UI 误分类为「逻辑层 SDK 无 UI」走了「功能不存在」降级。
 * 本模块把「小程序工程在真实开发者工具中编译+启动+出帧」做成产品能力：
 * 任何轮次/任何任务卡消费同一入口，AI 员工的 runtime-proof 有了产品侧生产面。
 *
 * 能力形态：
 *   probeWechatDevtools()      探针（工具在位性+自动化 SDK 可用性，如实报告）
 *   verifyMiniProgram(opts)    真跑：微信开发者工具自动化通道 编译+启动+首帧
 *                              （appid 覆盖走运行副本，交付工程原件不动）
 *   validateRuntimeProof(rec)  纯函数：runtime-proof 记录模式校验（关卡/看板消费）
 * REST（runtimeVerifyRoutes）：
 *   GET  /api/hermes/runtime-verify/health
 *   POST /api/hermes/runtime-verify/miniprogram {projectPath, outDir, appid?}
 */
import { exec } from 'node:child_process'
import { existsSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import Router from '@koa/router'
import { describeVerifiers, registerVerifier } from './verifier-registry'

export const WECHAT_DEVTOOLS_CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

export interface DevtoolsProbe {
  installed: boolean
  cliPath: string | null
  /** miniprogram-automator SDK 可解析（产品仓未装则 verify 报 CAPABILITY_ABSENT 并给出安装指引） */
  automatorSdk: boolean
  detail: string
}

export function probeWechatDevtools(appDir = '/Applications'): DevtoolsProbe {
  const cliPath = join(appDir, 'wechatwebdevtools.app/Contents/MacOS/cli')
  const installed = existsSync(cliPath)
  let automatorSdk = false
  try {
    require.resolve('miniprogram-automator')
    automatorSdk = true
  } catch {
    automatorSdk = false
  }
  const parts: string[] = []
  if (!installed) parts.push('微信开发者工具未安装（' + cliPath + ' 不在位）')
  if (!automatorSdk) parts.push('自动化 SDK 未安装（产品仓执行 npm i miniprogram-automator 后可用）')
  return {
    installed,
    cliPath: installed ? cliPath : null,
    automatorSdk,
    detail: parts.length === 0 ? '能力就绪' : parts.join('；'),
  }
}

export interface RuntimeProofRecord {
  tool: 'wechat-devtools'
  projectPath: string
  appid: string | null
  launchOk: boolean
  screenshot: string | null
  checkedAt: string
  detail?: string
}

/** runtime-proof 记录模式校验（关卡/看板 requiredArtifacts 消费的纯判定） */
export function validateRuntimeProof(record: unknown): { ok: boolean; violations: string[] } {
  const violations: string[] = []
  const r = record as Partial<RuntimeProofRecord> | null
  if (!r || typeof r !== 'object') return { ok: false, violations: ['记录非对象'] }
  if (r.tool !== 'wechat-devtools') violations.push('tool 须为 wechat-devtools')
  if (typeof r.projectPath !== 'string' || !r.projectPath) violations.push('projectPath 缺失')
  if (r.launchOk !== true) violations.push('launchOk 须为 true（启动失败/未跑=不达标）')
  if (typeof r.screenshot !== 'string' || !r.screenshot) violations.push('screenshot 缺失（首帧凭证）')
  if (typeof r.checkedAt !== 'string' || !r.checkedAt) violations.push('checkedAt 缺失')
  return { ok: violations.length === 0, violations }
}

export class RuntimeVerifyError extends Error {
  constructor(public code: 'CAPABILITY_ABSENT' | 'PROJECT_ABSENT' | 'VERIFY_FAILED', message: string) {
    super(message)
  }
}

/**
 * 真跑验证：微信开发者工具自动化通道（编译+启动+首帧）。
 * appid 提供时生成运行副本（仅改 project.config.json 的 appid 与 setting.urlCheck，
 * 随 record.detail 声明）——交付工程原件不动；副本排障同款口径（方案 §5.4.4）。
 */
export async function verifyMiniProgram(opts: {
  projectPath: string
  outDir: string
  appid?: string
  cliPath?: string
  waitMs?: number
}): Promise<RuntimeProofRecord> {
  const probe = probeWechatDevtools()
  if (!probe.installed || !probe.automatorSdk) {
    throw new RuntimeVerifyError('CAPABILITY_ABSENT', '能力不在位：' + probe.detail)
  }
  if (!existsSync(opts.projectPath)) {
    throw new RuntimeVerifyError('PROJECT_ABSENT', '工程路径不存在：' + opts.projectPath)
  }
  mkdirSync(opts.outDir, { recursive: true })

  let projectPath = opts.projectPath
  let appid: string | null = null
  if (opts.appid) {
    const copyDir = join(opts.outDir, 'runtime-copy-' + basename(opts.projectPath))
    cpSync(opts.projectPath, copyDir, { recursive: true })
    const cfgPath = join(copyDir, 'project.config.json')
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
    cfg.appid = opts.appid
    cfg.setting = { ...(cfg.setting || {}), urlCheck: false }
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8')
    projectPath = copyDir
    appid = opts.appid
  }

  // 惰性引入（避免未装 SDK 时整模块不可用；探针已保证在位）
  const automator = require('miniprogram-automator') as {
    launch: (o: { cliPath: string; projectPath: string }) => Promise<{
      screenshot: (o: { path: string }) => Promise<unknown>
      close: () => Promise<unknown>
    }>
  }
  const screenshot = join(opts.outDir, 'runtime-proof.png')
  let mp: Awaited<ReturnType<typeof automator.launch>> | null = null
  try {
    mp = await automator.launch({ cliPath: opts.cliPath || WECHAT_DEVTOOLS_CLI, projectPath })
    await new Promise((r) => setTimeout(r, opts.waitMs ?? 4000))
    await mp.screenshot({ path: screenshot })
    const record: RuntimeProofRecord = {
      tool: 'wechat-devtools',
      projectPath: opts.projectPath,
      appid,
      launchOk: true,
      screenshot,
      checkedAt: new Date().toISOString(),
      detail: appid
        ? '运行副本仅改 appid/urlCheck 两项（自动化通道要求真实 AppID），工程原件未动'
        : undefined,
    }
    writeFileSync(join(opts.outDir, 'runtime-proof.json'), JSON.stringify(record, null, 2), 'utf-8')
    return record
  } catch (e) {
    throw new RuntimeVerifyError('VERIFY_FAILED', '真工具验证失败：' + String(e))
  } finally {
    try {
      await mp?.close()
    } catch {
      /* 关闭失败不掩盖主错误 */
    }
  }
}

// ── B5 注册表登记：小程序为首个 entry；新验证器=registerVerifier 一个调用 ──
registerVerifier({
  id: 'miniprogram-wechat',
  kind: 'runtime-proof',
  title: '微信小程序·真实开发者工具编译+启动+首帧',
  probe: () => probeWechatDevtools(),
  verify: (opts) => verifyMiniProgram(opts as Parameters<typeof verifyMiniProgram>[0]),
})

export const runtimeVerifyRoutes = new Router({ prefix: '/api/hermes/runtime-verify' })

runtimeVerifyRoutes.get('/health', (ctx) => {
  ctx.body = probeWechatDevtools()
})

/** B5：注册表枚举（probe 只读执行；每 entry 带 kind 供 delivery-contract 对账） */
runtimeVerifyRoutes.get('/verifiers', (ctx) => {
  ctx.body = { ok: true, verifiers: describeVerifiers() }
})

runtimeVerifyRoutes.post('/miniprogram', async (ctx) => {
  const b = ctx.request.body as Record<string, unknown> | undefined
  const missing = ['projectPath', 'outDir'].filter((k) => typeof b?.[k] !== 'string' || !b[k])
  if (missing.length > 0 || typeof b !== 'object') {
    ctx.status = 400
    ctx.body = { code: 'BAD_REQUEST', message: '缺字段：' + missing.join('/') }
    return
  }
  try {
    const record = await verifyMiniProgram({
      projectPath: b.projectPath as string,
      outDir: b.outDir as string,
      appid: typeof b.appid === 'string' && b.appid ? b.appid : undefined,
    })
    ctx.body = record
  } catch (e) {
    if (e instanceof RuntimeVerifyError) {
      ctx.status = e.code === 'CAPABILITY_ABSENT' ? 503 : e.code === 'PROJECT_ABSENT' ? 400 : 500
      ctx.body = { code: e.code, message: e.message }
      return
    }
    throw e
  }
})
