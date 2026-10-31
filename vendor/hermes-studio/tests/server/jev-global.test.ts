import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Koa from 'koa'
import { bodyParser } from '@koa/bodyparser'
import type { Server } from 'node:http'
import { config } from '../../packages/server/src/modules/studio/public/config'
import { deleteJevSettings, getJevSettings, readJevCredentials, saveJevSettings } from '../../packages/server/src/modules/studio/services/jev/settings'
import { resolveUserProfile } from '../../packages/server/src/modules/studio/middleware/auth'
import { jevRoutes } from '../../packages/server/src/modules/studio/routes/jev'

const directory = join(config.appHome, 'models', 'jev')
let server: Server | undefined
beforeEach(async () => { await rm(directory, { recursive: true, force: true }) })
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
  server = undefined
})
async function legacy(profile: string, apiKey: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, `${createHash('sha256').update(profile).digest('hex')}.json`)
  await writeFile(path, JSON.stringify({ apiKey, model: `jev-${profile}`, ekkoMemoryEnabled: true }))
  return path
}

describe('global JEV migration', () => {
  it('prefers the legacy default, preserves source files and converges concurrent readers', async () => {
    const source = await legacy('default', 'default-key')
    const other = await legacy('work', 'work-key')
    const results = await Promise.all(Array.from({ length: 8 }, () => readJevCredentials()))
    for (const result of results) expect(result).toMatchObject({ apiKey: 'default-key', model: 'jev-default', ekkoMemoryEnabled: true })
    expect(JSON.parse(await readFile(join(directory, 'global.json'), 'utf8')).apiKey).toBe('default-key')
    expect(JSON.parse(await readFile(source, 'utf8')).apiKey).toBe('default-key')
    expect(JSON.parse(await readFile(other, 'utf8')).apiKey).toBe('work-key')
    await deleteJevSettings()
    expect((await readJevCredentials()).apiKey).toBe('')
    expect((await getJevSettings()).ekkoMemoryEnabled).toBe(false)
  })

  it('migrates a single non-default legacy configuration', async () => {
    await legacy('research', 'research-key')
    expect(await readJevCredentials()).toMatchObject({ apiKey: 'research-key', model: 'jev-research' })
  })

  it('does not guess between multiple non-default configurations or merge their keys', async () => {
    await legacy('work', 'work-key'); await legacy('personal', 'personal-key')
    expect(await getJevSettings()).toMatchObject({ hasApiKey: false, model: 'jev-latest' })
    expect(await readdir(directory)).toHaveLength(2)
    await saveJevSettings({ apiKey: 'global-key', personMemoryEnabled: true })
    expect(await readJevCredentials()).toMatchObject({ apiKey: 'global-key', personMemoryEnabled: true })
    await deleteJevSettings()
    expect((await readJevCredentials()).apiKey).toBe('')
  })

  it('never falls back to legacy credentials when the global file is invalid', async () => {
    await legacy('default', 'old-key')
    await writeFile(join(directory, 'global.json'), 'invalid JSON')
    await expect(readJevCredentials()).rejects.toThrow()
  })

  it('does not let migration overwrite a concurrent save or reset', async () => {
    await legacy('default', 'old-key')
    await Promise.all([readJevCredentials(), saveJevSettings({ apiKey: 'new-key' })])
    expect((await readJevCredentials()).apiKey).toBe('new-key')
    await rm(join(directory, 'global.json'))
    await Promise.all([readJevCredentials(), deleteJevSettings()])
    expect((await readJevCredentials()).apiKey).toBe('')
  })
})

describe('global JEV HTTP access', () => {
  async function start() {
    const app = new Koa()
    app.use(bodyParser())
    app.use(async (ctx, next) => {
      ctx.state.user = { id: 1, role: ctx.get('x-test-role') || 'admin', profiles: [] }
      await next()
    })
    app.use(resolveUserProfile)
    app.use(jevRoutes.routes())
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server!.once('listening', resolve))
    return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/studio/jev`
  }

  it('reads the shared settings without Profile access and exposes no credentials', async () => {
    await saveJevSettings({ apiKey: 'private-key', personMemoryEnabled: true })
    const base = await start()
    const response = await fetch(`${base}/settings`, { headers: { 'x-hermes-profile': 'unavailable-profile' } })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toMatchObject({ hasApiKey: true, personMemoryEnabled: true })
    expect(JSON.stringify(data)).not.toContain('private-key')
  })

  it('allows only the super administrator to change, clear or test the shared configuration', async () => {
    const base = await start()
    for (const [method, path] of [['PUT', '/settings'], ['DELETE', '/settings'], ['POST', '/test']]) {
      const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'PUT' ? JSON.stringify({ apiKey: 'blocked-key' }) : undefined })
      expect(response.status).toBe(403)
    }
    expect((await getJevSettings()).hasApiKey).toBe(false)
    const headers = { 'content-type': 'application/json', 'x-test-role': 'super_admin' }
    const saved = await fetch(`${base}/settings`, { method: 'PUT', headers, body: JSON.stringify({ apiKey: 'saved-key' }) })
    expect(saved.status).toBe(200)
    expect((await readJevCredentials()).apiKey).toBe('saved-key')
    expect((await fetch(`${base}/settings`, { method: 'DELETE', headers })).status).toBe(200)
    expect((await getJevSettings()).hasApiKey).toBe(false)
  })
})
