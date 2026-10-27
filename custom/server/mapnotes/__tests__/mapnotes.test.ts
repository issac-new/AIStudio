// C1（挂账清偿批二）守门：mapnotes 标注存储——指纹 key 净化（防穿越）、upsert
// 同 nodeId 覆盖（最后写胜出）、删除、坏文件诚实空态、HTTP 投影 400 校验。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { listAnnotations, upsertAnnotation, deleteAnnotation } from '../mapnotes-store'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mapnotes-'))
  process.env.MAP_NOTES_DIR = dir
})

afterEach(() => {
  delete process.env.MAP_NOTES_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('mapnotes-store', () => {
  it('upsert 同 nodeId 覆盖（批三 LWW：rev 更高胜出）；list/delete 语义；截断防线', () => {
    upsertAnnotation('a1b2c3d4e5', { nodeId: 'ent-fibo-term-Payment', note: '首条', checked: false, by: 'u1', rev: 1 })
    const saved = upsertAnnotation('a1b2c3d4e5', { nodeId: 'ent-fibo-term-Payment', note: '覆盖后的备注', checked: true, by: 'u2', rev: 2 })
    expect(saved.applied).toBe(true)
    expect(saved.annotation.checked).toBe(true)
    const list = listAnnotations('a1b2c3d4e5')
    expect(list.length).toBe(1)
    expect(list[0].note).toBe('覆盖后的备注')
    expect(list[0].by).toBe('u2')
    expect(deleteAnnotation('a1b2c3d4e5', 'ent-fibo-term-Payment')).toBe(true)
    expect(listAnnotations('a1b2c3d4e5')).toEqual([])
    expect(deleteAnnotation('a1b2c3d4e5', 'ghost')).toBe(false)
  })

  it('key 非十六进制拒绝（防路径穿越）；坏文件诚实空态', () => {
    expect(() => listAnnotations('../../etc')).toThrow('key 非法')
    expect(() => upsertAnnotation('zzz', { nodeId: 'n', note: '', checked: false, by: 'u' })).toThrow('key 非法')
    writeFileSync(join(dir, 'deadbeef01.json'), '{broken', 'utf8')
    expect(listAnnotations('deadbeef01')).toEqual([])
  })
})

describe('map-annotations REST（HTTP 投影）', () => {
  let server: Server | null = null
  let base = ''

  beforeEach(async () => {
    const { createServer } = await import('node:http')
    const Koa = (await import('koa')).default
    const bodyparser = (await import('@koa/bodyparser')).default
    const { mapAnnotationsRoutes } = await import('../mapnotes-controller')
    const app = new Koa()
    app.use(bodyparser())
    app.use(mapAnnotationsRoutes.routes())
    server = createServer(app.callback())
    await new Promise<void>((res) => server!.listen(0, '127.0.0.1', res))
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/hermes/map-annotations`
  })

  afterEach(async () => {
    if (server) await new Promise<void>((res) => server!.close(() => res()))
  })

  it('POST upsert → GET 读回 → DELETE 移除；坏 body 400', async () => {
    const post = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'abc123def4', nodeId: 'mod-pay-core', note: '确认改这', checked: true, by: 'walker' }),
    })
    expect(post.status).toBe(200)
    const got = await (await fetch(`${base}?key=abc123def4`)).json() as any
    expect(got.annotations.length).toBe(1)
    expect(got.annotations[0].checked).toBe(true)
    const del = await fetch(`${base}?key=abc123def4&nodeId=mod-pay-core`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    const after = await (await fetch(`${base}?key=abc123def4`)).json() as any
    expect(after.annotations).toEqual([])
    const bad = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'abc123def4', nodeId: 'x', note: 'n', checked: 'yes' }),
    })
    expect(bad.status).toBe(400)
  })
})
