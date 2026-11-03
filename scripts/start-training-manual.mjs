#!/usr/bin/env node
// AIStudio 交互培训页本地启动器：只读两个培训文档，不代理任何业务服务。
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DOCUMENTS = new Map([
  ['/aistudio-interactive-training.html', {
    file: resolve(ROOT, 'docs/manuals/aistudio-interactive-training.html'),
    type: 'text/html; charset=utf-8',
  }],
  ['/aistudio-training-and-user-guide.md', {
    file: resolve(ROOT, 'docs/manuals/aistudio-training-and-user-guide.md'),
    type: 'text/plain; charset=utf-8',
  }],
])

export function createTrainingServer() {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end('Method not allowed')
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }
    const document = DOCUMENTS.get(pathname === '/' ? '/aistudio-interactive-training.html' : pathname)
    if (!document) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : 'Not found')
      return
    }
    try {
      const body = await readFile(document.file)
      res.writeHead(200, {
        'Content-Type': document.type,
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : 'Training document could not be read')
    }
  })
}

function parseArgs(argv) {
  const options = { open: true, port: 0, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-open') options.open = false
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--port' && argv[i + 1]) {
      const port = Number(argv[i + 1])
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error('--port 必须是 0 到 65535 的整数')
      }
      options.port = port
      i += 1
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }
  return options
}

function openBrowser(url) {
  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'darwin' || platform === 'linux'
    ? [url]
    : ['/c', 'start', '', url]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', error => {
    console.error(`浏览器未能自动打开：${error.message}`)
    console.error(`请手动访问：${url}`)
  })
  child.unref()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('用法：npm run training -- [--no-open] [--port 0]')
    console.log('默认监听 127.0.0.1 的空闲端口并自动打开浏览器。')
    return
  }
  const server = createTrainingServer()
  server.on('error', error => {
    console.error(`培训页启动失败：${error.message}`)
    process.exitCode = 1
  })
  server.listen(options.port, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return
    const url = `http://127.0.0.1:${address.port}/?autoplay=1`
    console.log(`AIStudio 交互培训页：${url}`)
    console.log('培训模拟不会连接真实业务数据。按 Ctrl+C 停止。')
    if (options.open) openBrowser(url)
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
