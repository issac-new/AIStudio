// custom/server/matrix/__tests__/agent-identity.test.ts
// v14 统一聊天 P2A 守门：agent matrix 身份供给闭环——密码换 token（登录契约）
// + profile dotenv merge 写（保留他键/0600/原子写/新建与合并两态）。真实 fs +
// 临时 HERMES_HOME；fetch 全替身，不触真 homeserver。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loginMatrixUser, writeAgentMatrixEnv, provisionAgentIdentity } from '../agent-identity'

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'v14-agent-identity-'))
}

const okLogin = async () => new Response(
  JSON.stringify({ access_token: 'syt_tok', device_id: 'DEV1', user_id: '@a-agent:matrix.test' }),
  { status: 200, headers: { 'content-type': 'application/json' } },
)

describe('loginMatrixUser（P2A 登录契约）', () => {
  it('POST m.login.password → 三件套', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const fetchImpl = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) })
      return okLogin()
    }) as unknown as typeof fetch
    const creds = await loginMatrixUser('http://127.0.0.1:8008', '@a-agent:matrix.test', 'pw-agent', fetchImpl)
    expect(creds).toEqual({ accessToken: 'syt_tok', deviceId: 'DEV1', userId: '@a-agent:matrix.test' })
    expect(calls[0].url).toContain('/_matrix/client/v3/login')
    expect((calls[0].body as { type: string }).type).toBe('m.login.password')
  })

  it('非 2xx 抛错含状态码（不吞失败）', async () => {
    const fetchImpl = (async () => new Response('{"errcode":"M_FORBIDDEN"}', { status: 403 })) as unknown as typeof fetch
    await expect(loginMatrixUser('http://127.0.0.1:8008', '@x:matrix.test', 'pw', fetchImpl))
      .rejects.toThrow(/403/)
  })
})

describe('writeAgentMatrixEnv（profile dotenv merge）', () => {
  it('新建：三件套落 profiles/<profile>/.env，0600', async () => {
    const home = tempHome()
    try {
      const r = await writeAgentMatrixEnv({
        profile: 'zhang', homeserverUrl: 'http://127.0.0.1:8008',
        accessToken: 'tok1', userId: '@zhang-agent:matrix.test', hermesHome: home,
      })
      expect(r.created).toBe(true)
      expect(r.envPath).toBe(join(home, 'profiles', 'zhang', '.env'))
      const text = readFileSync(r.envPath, 'utf8')
      expect(text).toContain('MATRIX_HOMESERVER=http://127.0.0.1:8008')
      expect(text).toContain('MATRIX_ACCESS_TOKEN=tok1')
      expect(text).toContain('MATRIX_USER_ID=@zhang-agent:matrix.test')
      expect((statSync(r.envPath).mode & 0o777)).toBe(0o600)
    } finally { rmSync(home, { recursive: true, force: true }) }
  })

  it('合并：覆盖三件套、保留他键', async () => {
    const home = tempHome()
    try {
      const first = await writeAgentMatrixEnv({
        profile: 'li', homeserverUrl: 'http://127.0.0.1:8008',
        accessToken: 'old', userId: '@li-agent:matrix.test', hermesHome: home,
      })
      const { writeFileSync } = await import('node:fs')
      writeFileSync(first.envPath, readFileSync(first.envPath, 'utf8') + 'OTHER_KEY=keepme\n', 'utf8')
      await writeAgentMatrixEnv({
        profile: 'li', homeserverUrl: 'http://127.0.0.1:8008',
        accessToken: 'new', userId: '@li-agent:matrix.test', hermesHome: home,
      })
      const text = readFileSync(join(home, 'profiles', 'li', '.env'), 'utf8')
      expect(text).toContain('MATRIX_ACCESS_TOKEN=new')
      expect(text).not.toContain('MATRIX_ACCESS_TOKEN=old')
      expect(text).toContain('OTHER_KEY=keepme')
    } finally { rmSync(home, { recursive: true, force: true }) }
  })
})

describe('provisionAgentIdentity（一步闭环）', () => {
  it('登录成功 → token/device/env 三合一', async () => {
    const home = tempHome()
    try {
      const r = await provisionAgentIdentity({
        homeserverUrl: 'http://127.0.0.1:8008',
        agentUserId: '@a-agent:matrix.test', password: 'pw-agent',
        profile: 'a', hermesHome: home, fetchImpl: okLogin as unknown as typeof fetch,
      })
      expect(r.accessToken).toBe('syt_tok')
      expect(r.envPath).toBe(join(home, 'profiles', 'a', '.env'))
      expect(readFileSync(r.envPath, 'utf8')).toContain('syt_tok')
    } finally { rmSync(home, { recursive: true, force: true }) }
  })
})
