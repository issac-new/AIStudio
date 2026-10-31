import http from 'node:http'
import https from 'node:https'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { edgeTts } from '../../packages/server/src/modules/studio/services/voice/tts/core'

describe('Edge TTS transport', () => {
  let server: http.Server
  let sockets: WebSocketServer
  let requests: https.RequestOptions[]

  beforeEach(async () => {
    requests = []
    server = http.createServer()
    sockets = new WebSocketServer({ noServer: true })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test server address')

    // Exercise the real library and WebSocket protocol against a local server.
    vi.spyOn(https, 'request').mockImplementation(((options: https.RequestOptions) => {
      requests.push(options)
      return http.request({
        ...options,
        protocol: 'http:',
        hostname: '127.0.0.1',
        host: '127.0.0.1',
        port: address.port,
        agent: undefined,
        createConnection: undefined,
      })
    }) as typeof https.request)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const socket of sockets.clients) socket.terminate()
    await Promise.all([
      new Promise<void>((resolve) => sockets.close(() => resolve())),
      new Promise<void>((resolve) => server.close(() => resolve())),
    ])
  })

  it('uses Read Aloud with DRM v2 and returns the received audio bytes', async () => {
    server.on('upgrade', (request, socket, head) => {
      sockets.handleUpgrade(request, socket, head, (connection) => {
        sockets.emit('connection', connection, request)
      })
    })
    const messages: string[] = []
    const audio = Buffer.from([0xff, 0xf3, 0x84, 0xc4, 0x00, 0x01])
    sockets.on('connection', (socket) => {
      socket.on('message', (data) => {
        const message = data.toString()
        messages.push(message)
        if (!message.includes('Path:ssml')) return

        const header = Buffer.from('Content-Type:audio/mpeg\r\nPath:audio\r\n')
        const length = Buffer.alloc(2)
        length.writeUInt16BE(header.length)
        socket.send(Buffer.concat([length, header, audio]))
        socket.send('Path:turn.end\r\n\r\n')
      })
    })

    await expect(edgeTts({ text: '你好 <world> & friends' })).resolves.toEqual(audio)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.host).toBe('speech.platform.bing.com')
    const url = new URL(String(requests[0]?.path), 'https://speech.platform.bing.com')
    expect(url.pathname).toBe('/consumer/speech/synthesize/readaloud/edge/v1')
    expect(url.searchParams.get('Sec-MS-GEC-Version')).toMatch(/^2-/)
    expect(url.searchParams.get('Sec-MS-GEC')).toMatch(/^[A-F0-9]{16}-[A-F0-9]{64}$/)
    expect(url.searchParams.get('TrustedClientToken')).toBeTruthy()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain('audio-24khz-48kbitrate-mono-mp3')
    expect(messages[1]).toContain('zh-CN-XiaoxiaoNeural')
    expect(messages[1]).toContain('你好 &lt;world&gt; &amp; friends')
  })

  it('rejects an HTTP 200 response instead of returning an empty audio file', async () => {
    server.on('upgrade', (_request, socket) => {
      socket.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
    })

    await expect(edgeTts({ text: '你好' })).rejects.toThrow('Unexpected server response: 200')
  })
})
