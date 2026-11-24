// 测试辅助：加载引擎的命令信封校验函数 parseCommandEnvelope（守门用真函数，不抄规则）。
//
// 为什么不用 import：该源文件的依赖链里有 ZCode 工作区包别名（@zcode/session-control/contracts
// 等），仓根的模块解析不认识；而干净检出与工作树里也没有 vendor/zcode 的依赖目录。
// 做法是用 esbuild 把源文件连同依赖打成内存包：@zcode/* 按各包 package.json 的 exports 指向
// 源码解析，zod 等第三方包取仓根依赖。实测打包约 0.3 秒。
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface EnvelopeVerdict {
  ok: boolean
  /** 校验失败时的条目：`字段:错误码 说明`。 */
  issues: string[]
}

export type EngineCommandValidator = (envelope: unknown) => EnvelopeVerdict

export const REPO_ROOT = resolve(__dirname, '../../../../')
const ENTRY = join(REPO_ROOT, 'vendor/zcode/packages/shared/src/zcode-protocol-v4/command.ts')

let cached: Promise<EngineCommandValidator> | null = null

/** 把 @zcode/<包>[/<子路径>] 解析到 vendor/zcode/packages/<包> 的源码入口（按 exports 表）。 */
function zcodeWorkspacePackages(): import('esbuild').Plugin {
  return {
    name: 'zcode-workspace-packages',
    setup(build) {
      build.onResolve({ filter: /^@zcode\// }, (args) => {
        const m = /^(@zcode\/[^/]+)(?:\/(.*))?$/.exec(args.path)
        if (!m) return { errors: [{ text: `无法解析工作区包 ${args.path}` }] }
        const pkgDir = join(REPO_ROOT, 'vendor/zcode/packages', m[1].replace('@zcode/', ''))
        const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
          main?: string
          exports?: string | Record<string, string | { import?: string; default?: string }>
        }
        const target = m[2]
          ? (typeof pkg.exports === 'object' ? pkg.exports?.[`./${m[2]}`] : undefined)
          : (typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.'] ?? pkg.main)
        const out = typeof target === 'string' ? target : target?.import ?? target?.default
        if (!out) return { errors: [{ text: `包 ${m[1]} 未声明入口 ${m[2] ? `./${m[2]}` : '.'}` }] }
        return { path: join(pkgDir, out) }
      })
    },
  }
}

async function buildValidator(): Promise<EngineCommandValidator> {
  if (!existsSync(ENTRY)) throw new Error(`引擎协议源文件缺席：${ENTRY}`)
  const require = createRequire(join(REPO_ROOT, 'package.json'))
  const esbuild = require('esbuild') as typeof import('esbuild')
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'silent',
    plugins: [zcodeWorkspacePackages()],
    nodePaths: [join(REPO_ROOT, 'node_modules')],
  })
  const code = result.outputFiles[0]?.text
  if (!code) throw new Error('引擎协议源文件打包产物为空')
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as {
    parseCommandEnvelope: (value: unknown) => { ok: true } | { ok: false; error: { issues: Array<{ path: PropertyKey[]; code: string; message: string }> } }
  }
  const parse = mod.parseCommandEnvelope
  if (typeof parse !== 'function') throw new Error('打包产物未导出 parseCommandEnvelope（上游契约变了？）')
  return (envelope) => {
    const r = parse(envelope)
    if (r.ok) return { ok: true, issues: [] }
    return { ok: false, issues: r.error.issues.map((i) => `${i.path.map(String).join('.') || '(信封)'}:${i.code} ${i.message}`) }
  }
}

/** 进程内缓存一份；同文件多个用例共用。 */
export function loadEngineCommandValidator(): Promise<EngineCommandValidator> {
  if (!cached) cached = buildValidator()
  return cached
}
