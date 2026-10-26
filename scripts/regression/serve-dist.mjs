// 生产包只读走查服务：静态托管 dist/client + /api 等后端路径反代（含 WS 升级管道）。
// 用途：让 walk-routes 能对生产构建做全量只读走查（dev 链走 vite 代理，生产链走本件）。
// 用法：node scripts/regression/serve-dist.mjs [--port 8653] [--api http://127.0.0.1:8647]
//   前台运行；Ctrl-C 退出。生产包由 npm run build 产出（vendor/hermes-studio/dist/client）。
import { createServer, request as httpRequest } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { connect as tcpConnect } from 'node:net'

const args = process.argv.slice(2)
function argValue(flag, fallback) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = Number(argValue('--port', '8653'))
const API = new URL(argValue('--api', 'http://127.0.0.1:8647'))
const DIST_ROOT = resolve(import.meta.dirname, '../../vendor/hermes-studio/dist/client')

if (!existsSync(join(DIST_ROOT, 'index.html'))) {
  console.error(`[serve-dist] 缺少 ${DIST_ROOT}/index.html —— 先 npm run build`)
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.map': 'application/json',
}
const PROXY_PREFIXES = ['/api', '/v1', '/upload', '/socket.io', '/agent-health']

function proxyHttp(req, res) {
  const upstream = httpRequest(
    { hostname: API.hostname, port: API.port, method: req.method, path: req.url, headers: { ...req.headers, host: API.host } },
    up => { res.writeHead(up.statusCode, up.headers); up.pipe(res) },
  )
  upstream.on('error', err => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end(`[serve-dist] upstream ${API.host}: ${err.code || err.message}`)
  })
  req.pipe(upstream)
}

// WS 升级：原样转发握手字节后双向管道——socket.io 等实时流无需自行实现协议。
// Origin 改写为后端自身（同 vite 代理 changeOrigin 语义）：后端 socket.io 校验
// Origin 白名单，8651/8653 等走查源会被拒（400 origin not allowed）。
function proxyUpgrade(req, socket, head) {
  const upstream = tcpConnect(Number(API.port), API.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const key = req.rawHeaders[i]
      const lower = key.toLowerCase()
      let value = req.rawHeaders[i + 1]
      if (lower === 'host') value = API.host
      if (lower === 'origin') value = API.origin
      lines.push(`${key}: ${value}`)
    }
    upstream.write(lines.join('\r\n') + '\r\n\r\n')
    if (head && head.length) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
  const drop = () => { upstream.destroy(); socket.destroy() }
  upstream.on('error', drop)
  socket.on('error', drop)
  socket.on('close', () => upstream.destroy())
}

// 目录穿越防护：归一化后必须仍在 DIST_ROOT 内。
function safeFile(urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0])
  const full = normalize(join(DIST_ROOT, rel))
  if (full !== DIST_ROOT && !full.startsWith(DIST_ROOT + sep)) return null
  if (full !== DIST_ROOT && !existsSync(full)) return null
  if (full !== DIST_ROOT && !statSync(full).isFile()) return null
  return full
}

const server = createServer((req, res) => {
  if (PROXY_PREFIXES.some(p => req.url.startsWith(p))) return proxyHttp(req, res)
  const file = safeFile(req.url)
  if (file) {
    const body = createReadStream(file)
    body.on('open', () => {
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      body.pipe(res)
    })
    body.on('error', () => { res.writeHead(500); res.end() })
    return
  }
  // SPA 兜底：未知路径回 index.html（hash 路由 + 路径深链迁移在客户端完成）
  const index = createReadStream(join(DIST_ROOT, 'index.html'))
  index.on('open', () => { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); index.pipe(res) })
  index.on('error', () => { res.writeHead(500); res.end() })
})
server.on('upgrade', proxyUpgrade)

// 稳定性自检指纹：进程内多次请求返回同一 index.html 字节。
let indexHash = null
server.listen(PORT, '127.0.0.1', () => {
  const chunks = []
  const r = createReadStream(join(DIST_ROOT, 'index.html'))
  r.on('data', c => chunks.push(c))
  r.on('end', () => { indexHash = createHash('sha256').update(Buffer.concat(chunks)).digest('hex').slice(0, 12) })
  console.log(`[serve-dist] dist=${DIST_ROOT}`)
  console.log(`[serve-dist] api=${API.origin}（${PROXY_PREFIXES.join(' ')}）`)
  console.log(`[serve-dist] listening http://127.0.0.1:${PORT}/ index#${indexHash ?? '…'}`)
})
