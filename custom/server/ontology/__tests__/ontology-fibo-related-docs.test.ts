// P3（JoyAI 闭环吸收轮）守门：术语→关联文档端点——真 koa 起 HTTP 投影。
// 语义：概念多形态（中文名/别名）× specs 全文提及命中、同文档去重、封顶 8、
// 单概念过滤、specs 缺席 fail-soft 空清单。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

let ontoDir: string
let specsDir: string
let server: Server | null = null
let base = ''

beforeEach(async () => {
  ontoDir = mkdtempSync(join(tmpdir(), 'fibo-rel-onto-'))
  specsDir = mkdtempSync(join(tmpdir(), 'fibo-rel-specs-'))
  process.env.ONTOLOGY_DIR = ontoDir
  process.env.SPECS_DIR = specsDir
  writeFileSync(join(specsDir, '2026-01-02-pay-design.md'), '# 支付设计\n涉及支付收银台改造。', 'utf8')
  writeFileSync(join(specsDir, '2026-01-01-other.md'), '# 其他\n与金融无关的文档。', 'utf8')
  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const bodyparser = (await import('@koa/bodyparser')).default
  const { ontologyRoutes } = await import('../ontology-controller')
  const app = new Koa()
  app.use(bodyparser())
  app.use(ontologyRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((res) => server!.listen(0, '127.0.0.1', res))
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/hermes/ontology`
})

afterEach(async () => {
  delete process.env.ONTOLOGY_DIR
  delete process.env.SPECS_DIR
  if (server) await new Promise<void>((res) => server!.close(() => res()))
  rmSync(ontoDir, { recursive: true, force: true })
  rmSync(specsDir, { recursive: true, force: true })
})

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path)
  return { status: res.status, json: await res.json() }
}

describe('GET /fibo/related-docs', () => {
  it('概念多形态命中 specs（Payment 概念的中文名「支付」命中支付文档），无关联概念不出现', async () => {
    const r = await get('/fibo/related-docs')
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.specsScanned).toBe(2)
    const payment = r.json.related.find((x: any) => x.conceptId === 'Payment')
    expect(payment).toBeTruthy()
    expect(payment.docs[0].file).toBe('2026-01-02-pay-design.md')
    expect(payment.docs[0].matchedLine).toContain('支付')
    // 无关文档不含「支付」，Payment 概念的关联里不应出现它
    expect(payment.docs.some((d: any) => d.file === '2026-01-01-other.md')).toBe(false)
  })

  it('?conceptId= 单概念过滤', async () => {
    const r = await get('/fibo/related-docs?conceptId=Payment')
    expect(r.status).toBe(200)
    expect(r.json.related.every((x: any) => x.conceptId === 'Payment')).toBe(true)
  })

  it('specs 目录缺席 → 空清单 fail-soft（不 500）', async () => {
    process.env.SPECS_DIR = join(specsDir, 'ghost')
    const r = await get('/fibo/related-docs')
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.related).toEqual([])
    expect(r.json.specsScanned).toBe(0)
  })
})
