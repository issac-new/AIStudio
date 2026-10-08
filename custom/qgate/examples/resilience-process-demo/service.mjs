// resilience-process-demo——真实进程故障演练（上游 v1.29 W2 本地方言）：
// service.mjs 是独立 HTTP 子进程（127.0.0.1:0 动态端口，端口写 stderr 供 supervisor 读取）；
// /health 返回 200；故障=真实进程终止（kill）；恢复=supervisor 真实重启+真实健康轮询计时；
// signals 来自子进程真实输出。时间不可伪造：观察窗口内端口确无响应即 fail 证据。
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 0)
const server = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, pid: process.pid, at: Date.now() })) }
  else { res.writeHead(404); res.end() }
})
server.listen(port, '127.0.0.1', () => {
  const actual = server.address().port
  // 端口行是 supervisor 的唯一发现通道（真实子进程输出，非编排者自报）
  process.stderr.write(`SERVICE_READY port=${actual} pid=${process.pid}\n`)
})
// SIGKILL 不可捕获（Node 注册即抛）——kill -9 由 OS 直接终结，这里只处理 SIGTERM/SIGINT
process.on('SIGTERM', () => { try { server.close() } catch { /* already closed */ } process.exit(0) })
process.on('SIGINT', () => { try { server.close() } catch { /* already closed */ } process.exit(0) })
