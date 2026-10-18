// overlay/custom/server/cua/broker.ts
// SwarmStudio 自有 CUA broker 宿主：用 overlay 补丁源码（upstream/zcode
// packages/zcode-cua/broker-server.js，patch 003 活体）在服务进程内起
// createProductCuaHelperHost 单例——Node 后端（mac=JXA+screencapture），无
// 桌面 Helper 的 peer-verification（那是 dev.zcode.app 专属，第三方宿主
// 按设计被拒，2026-10-18 实测 "peer verification failed"）。
//
// 生命周期：首个会话开启 CUA 时惰性 start；socket 常驻至进程退出。
// 凭据对（socket+pluginAuthority）写入策略文件 broker 段，chat-turn 补丁
// （664）在 spawn 前同步读取注入——与 zcode runtimeEnv 的成对捕获约定一致。
import { existsSync } from 'fs'
import { join, resolve } from 'path'

export interface CuaBrokerTransport { socket: string; authority: string; pid: number | null }
export interface CuaBrokerHandle {
  transport: CuaBrokerTransport | null
  start(): Promise<CuaBrokerTransport>
  health(): Promise<{ ok: boolean; detail?: string }>
}

interface ProductHost {
  waitForTransport(timeoutMs?: number): Promise<{ socketPath: string; pluginAuthority: string }>
  checkHealth(timeoutMs?: number): Promise<unknown>
  running: boolean
  socketPath: string | null
}

/** 补丁源码路径：优先 ZCODE_CUA_SOURCE_ROOT，缺省 ncwk 共享树（符号链接布局由调用方保证） */
function brokerServerPath(): string {
  const explicit = process.env.ZCODE_CUA_SOURCE_ROOT?.trim()
  if (explicit) return join(explicit, 'packages', 'zcode-cua', 'broker-server.js')
  const fromHere = resolve(__dirname, '..', '..', '..', '..', 'upstream', 'zcode', 'packages', 'zcode-cua', 'broker-server.js')
  if (existsSync(fromHere)) return fromHere
  return join(process.env.HOME ?? '~', 'lab', 'ncwk', 'upstream', 'zcode', 'packages', 'zcode-cua', 'broker-server.js')
}

let singleton: CuaBrokerHandle | null = null

export function cuaBrokerHost(): CuaBrokerHandle {
  if (singleton) return singleton
  let host: ProductHost | null = null
  let starting: Promise<CuaBrokerTransport> | null = null
  singleton = {
    get transport() {
      return host?.socketPath
        ? { socket: host.socketPath, authority: host.pluginAuthority ?? 'node-backend', pid: null }
        : null
    },
    async start() {
      if (host?.socketPath) {
        return { socket: host.socketPath, authority: host.pluginAuthority ?? 'node-backend', pid: null }
      }
      if (!starting) {
        starting = (async () => {
          const path = brokerServerPath()
          if (!existsSync(path)) {
            throw Object.assign(new Error(`broker-server.js 不存在（${path}）——upstream/zcode 未注入 overlay 补丁`), { code: 'source_missing' })
          }
          const mod = await import(/* @vite-ignore */ path) as { createProductCuaHelperHost(): ProductHost }
          const h = mod.createProductCuaHelperHost()
          const t = await h.waitForTransport(15_000)
          host = h
          return { socket: t.socketPath, authority: t.pluginAuthority ?? 'node-backend', pid: null }
        })()
        starting.catch(() => { starting = null })
      }
      return await starting
    },
    async health() {
      try {
        if (!host?.socketPath) return { ok: false, detail: 'not started' }
        await host.checkHealth(5_000)
        return { ok: true }
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) }
      }
    },
  }
  return singleton
}
