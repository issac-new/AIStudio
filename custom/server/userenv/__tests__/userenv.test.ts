// userenv 域守门（N01）：读解析/脱敏回显、写原子替换+备份保留/敏感确认位 409/幂等、
// 审计行落地、profile 名路径逃逸拒绝、REST 面形状（照 pending-controller 测试范式）。
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import {
  EnvValidationError, SensitiveUnconfirmedError,
  auditUserenvChange, isSensitiveEnvKey, isValidProfileName, maskEnvValue,
  parseEnvText, readProfileEnv, serializeEnvEntries, writeProfileEnv,
} from '../env-store'

let home: string
let webui: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'userenv-home-'))
  webui = mkdtempSync(join(tmpdir(), 'userenv-webui-'))
  process.env.HERMES_HOME = home
  process.env.HERMES_WEB_UI_HOME = webui
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.HERMES_WEB_UI_HOME
  rmSync(home, { recursive: true, force: true })
  rmSync(webui, { recursive: true, force: true })
})

function makeProfile(name: string, envText?: string): string {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  if (envText !== undefined) writeFileSync(join(dir, '.env'), envText)
  return dir
}

describe('profile 名校验（路径逃逸红线）', () => {
  it('合法名放行：字母数字点连线下划线', () => {
    for (const ok of ['default', 'a.b-c_d', 'P1', 'worker-01']) expect(isValidProfileName(ok)).toBe(true)
  })
  it('拒绝 .. / . / 绝对路径 / 含斜杠 / 空名', () => {
    for (const bad of ['..', '.', '', '/tmp/evil', 'a/b', 'a b', '../x']) {
      expect(isValidProfileName(bad)).toBe(false)
    }
  })
})

describe('敏感判定与掩码', () => {
  it('key 含 KEY/TOKEN/SECRET/PASSWORD/PASS/credential（不区分大小写）即敏感；子串命中宁滥勿漏', () => {
    for (const k of ['API_KEY', 'AUTH_TOKEN', 'CLIENT_SECRET', 'DB_PASSWORD', 'PASS', 'MY_PASSPHRASE', 'db_credentials', 'apikey']) {
      expect(isSensitiveEnvKey(k)).toBe(true)
    }
    expect(isSensitiveEnvKey('MONKEY_TEST')).toBe(true) // KEY 子串命中，按规则判敏感
    for (const k of ['MODEL', 'HTTP_PORT', 'TEMPERATURE', 'BASE_URL']) {
      expect(isSensitiveEnvKey(k)).toBe(false)
    }
  })
  it('掩码形态 ***len=N***，N=值长度', () => {
    expect(maskEnvValue('abc')).toBe('***len=3***')
    expect(maskEnvValue('')).toBe('***len=0***')
  })
})

describe('parseEnvText / serializeEnvEntries', () => {
  it('容忍注释/空行/引号值/export 前缀；行内 # 属于值；畸形行跳过', () => {
    const text = [
      '# 整行注释',
      '',
      'MODEL=glm-4.7',
      'export PORT=8080',
      'GREETING="hello world"',
      "SINGLE='quoted value'",
      'INLINE=value # 行内注释属于值',
      'NOVALUE=',
      'MALFORMED_LINE_NO_EQ',
      '=EMPTY_KEY',
    ].join('\n')
    const map = new Map(parseEnvText(text).map((e) => [e.key, e.value]))
    expect(map.get('MODEL')).toBe('glm-4.7')
    expect(map.get('PORT')).toBe('8080')
    expect(map.get('GREETING')).toBe('hello world')
    expect(map.get('SINGLE')).toBe('quoted value')
    expect(map.get('INLINE')).toBe('value # 行内注释属于值')
    expect(map.get('NOVALUE')).toBe('')
    expect(map.has('MALFORMED_LINE_NO_EQ')).toBe(false)
    expect(map.has('EMPTY_KEY')).toBe(false)
  })
  it('序列化按键排序；首尾空白值包双引号；空表=空文件', () => {
    expect(serializeEnvEntries([{ key: 'B', value: '2' }, { key: 'A', value: '1' }])).toBe('A=1\nB=2\n')
    expect(serializeEnvEntries([{ key: 'SPACED', value: ' x ' }])).toBe('SPACED=" x "\n')
    expect(serializeEnvEntries([])).toBe('')
  })
})

describe('readProfileEnv', () => {
  it('敏感键值脱敏回显、非敏感原值、条目按键排序', () => {
    makeProfile('p1', 'API_TOKEN=supersecret\nMODEL=glm-4.7\nDB_PASSWORD=hunter2\n')
    const view = readProfileEnv('p1')
    expect(view.missing).toBe(false)
    expect(view.entries.map((e) => e.key)).toEqual(['API_TOKEN', 'DB_PASSWORD', 'MODEL'])
    const token = view.entries[0]
    expect(token.sensitive).toBe(true)
    expect(token.valueMasked).toBe('***len=11***')
    expect(token.valueLength).toBe(11)
    const model = view.entries[2]
    expect(model.sensitive).toBe(false)
    expect(model.valueMasked).toBe('glm-4.7')
  })
  it('.env 未建=空表+missing=true（fail-soft，不 404）', () => {
    makeProfile('p2')
    const view = readProfileEnv('p2')
    expect(view.missing).toBe(true)
    expect(view.entries).toEqual([])
  })
  it('非法名读取拒绝', () => {
    expect(() => readProfileEnv('..')).toThrow(EnvValidationError)
  })
})

describe('writeProfileEnv', () => {
  it('原子替换：内容按键排序落盘，写前备份 .env.bak-*', () => {
    const dir = makeProfile('w1', 'MODEL=old\nTOKEN=keepme\n')
    const t0 = Date.parse('2026-11-04T08:00:00Z')
    const r = writeProfileEnv('w1', [{ key: 'MODEL', value: 'new' }, { key: 'TOKEN', value: '***len=6***' }], { actor: 'tester', now: t0 })
    expect(r.written).toBe(true)
    expect(r.changedKeys).toEqual(['MODEL'])
    expect(r.backup).toMatch(/^\.env\.bak-2026-11-04T08-00-00/)
    expect(readdirSync(dir).filter((n) => n.startsWith('.env.bak-'))).toHaveLength(1)
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('MODEL=new\nTOKEN=keepme\n')
    // 敏感值原样保留：掩码回传不覆盖真值
    const view = readProfileEnv('w1')
    expect(view.entries.find((e) => e.key === 'TOKEN')?.valueMasked).toBe('***len=6***')
  })

  it('备份保留最近 5 份：连续 7 次写后只剩 5 个 .env.bak-*，最旧的被清', () => {
    const dir = makeProfile('w2', 'N=0\n')
    for (let i = 1; i <= 7; i++) {
      writeProfileEnv('w2', [{ key: 'N', value: String(i) }], { now: Date.parse('2026-11-04T08:00:00Z') + i * 1000 })
    }
    const baks = readdirSync(dir).filter((n) => n.startsWith('.env.bak-')).sort()
    expect(baks).toHaveLength(5)
    expect(baks[0]).toContain('08-00-03') // 前两份（01/02）已清
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('N=7\n')
  })

  it('敏感值变更须 confirmSensitive，否则抛 409 载荷（键名清单）；确认后放行', () => {
    makeProfile('w3', 'API_TOKEN=old-value\n')
    const change = [{ key: 'API_TOKEN', value: 'brand-new' }]
    try {
      writeProfileEnv('w3', change)
      expect.unreachable('未确认的敏感变更应抛错')
    } catch (e) {
      expect(e).toBeInstanceOf(SensitiveUnconfirmedError)
      expect((e as SensitiveUnconfirmedError).problems).toEqual(['API_TOKEN'])
    }
    // 未确认前文件未被改动
    expect(readProfileEnv('w3').entries[0].valueMasked).toBe('***len=9***')
    const okRes = writeProfileEnv('w3', change, { confirmSensitive: true, actor: 'tester' })
    expect(okRes.written).toBe(true)
    expect(okRes.changedKeys).toEqual(['API_TOKEN'])
  })

  it('新增敏感键同样须确认位', () => {
    makeProfile('w4', 'MODEL=m\n')
    expect(() => writeProfileEnv('w4', [{ key: 'MODEL', value: 'm' }, { key: 'NEW_SECRET', value: 'x' }]))
      .toThrow(SensitiveUnconfirmedError)
    writeProfileEnv('w4', [{ key: 'MODEL', value: 'm' }, { key: 'NEW_SECRET', value: 'x' }], { confirmSensitive: true })
    expect(readProfileEnv('w4').entries.map((e) => e.key)).toEqual(['MODEL', 'NEW_SECRET'])
  })

  it('同键同值幂等跳写：不落盘不备份不审计', () => {
    const dir = makeProfile('w5', '# 注释保留\nMODEL=m\nTOKEN=tok\n')
    const r = writeProfileEnv('w5', [{ key: 'TOKEN', value: '***len=3***' }, { key: 'MODEL', value: 'm' }], { actor: 'tester' })
    expect(r.written).toBe(false)
    expect(r.changedKeys).toEqual([])
    expect(r.backup).toBeUndefined()
    expect(readdirSync(dir).filter((n) => n.startsWith('.env.bak-'))).toHaveLength(0)
    // 语义等价即跳写：原文件（含注释与行序）原样保留
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('# 注释保留\nMODEL=m\nTOKEN=tok\n')
    expect(() => readFileSync(join(webui, 'userenv-audit.jsonl'))).toThrow()
  })

  it('删除键算变更：changedKeys 含被删键；删除敏感键不需确认位（entries 不含该键）', () => {
    makeProfile('w6', 'MODEL=m\nOLD_TOKEN=x\n')
    const r = writeProfileEnv('w6', [{ key: 'MODEL', value: 'm' }], { actor: 'tester' })
    expect(r.written).toBe(true)
    expect(r.changedKeys).toEqual(['OLD_TOKEN'])
    expect(readProfileEnv('w6').entries.map((e) => e.key)).toEqual(['MODEL'])
  })

  it('条目校验：非法键名/重复键/值含换行 → EnvValidationError', () => {
    makeProfile('w7')
    expect(() => writeProfileEnv('w7', [{ key: '1BAD', value: 'x' }])).toThrow(EnvValidationError)
    expect(() => writeProfileEnv('w7', [{ key: 'A', value: 'x' }, { key: 'A', value: 'y' }])).toThrow(EnvValidationError)
    expect(() => writeProfileEnv('w7', [{ key: 'A', value: 'x\ny' }])).toThrow(EnvValidationError)
    // 校验失败不落盘
    expect(readProfileEnv('w7').missing).toBe(true)
  })

  it('写审计行到 HERMES_WEB_UI_HOME/userenv-audit.jsonl：键名/操作者/时间，不落值', () => {
    makeProfile('w8', 'MODEL=m\n')
    const t = Date.parse('2026-11-04T09:30:00Z')
    writeProfileEnv('w8', [{ key: 'MODEL', value: 'n' }, { key: 'TOKEN', value: '***len=6***' }], { actor: 'auditor', now: t })
    const lines = readFileSync(join(webui, 'userenv-audit.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const row = JSON.parse(lines[0]) as { profile: string; changedKeys: string[]; actor: string; at: string }
    expect(row.profile).toBe('w8')
    expect(row.changedKeys).toEqual(['MODEL'])
    expect(row.actor).toBe('auditor')
    expect(row.at).toBe('2026-11-04T09:30:00.000Z')
    // 仓规第 6 条：审计不落敏感原值（此处 TOKEN 值本就未变也不得出现）
    expect(lines[0]).not.toContain('secret')
    expect(lines[0]).not.toContain('m=n')
  })
})

describe('auditUserenvChange（best-effort）', () => {
  it('直接落行；目录不存在自动创建', () => {
    auditUserenvChange({ profile: 'px', changedKeys: ['A', 'B'], actor: 'u1', at: Date.parse('2026-11-04T10:00:00Z') })
    const row = JSON.parse(readFileSync(join(webui, 'userenv-audit.jsonl'), 'utf8'))
    expect(row).toMatchObject({ profile: 'px', changedKeys: ['A', 'B'], actor: 'u1', at: '2026-11-04T10:00:00.000Z' })
  })
})

describe('REST（/api/userenv）', () => {
  let base: string
  let server: ReturnType<typeof createServer>
  let currentUser: PlatformPrincipal | undefined

  beforeEach(async () => {
    currentUser = { id: 1, username: 'qa-lead', role: 'super_admin', status: 'active' }
    const { userenvRoutes } = await import('../controller')
    const app = new Koa()
    app.use(async (ctx, next) => {
      if (currentUser) (ctx.state as { user?: PlatformPrincipal }).user = currentUser
      await next()
    })
    app.use(async (ctx, next) => {
      if (ctx.method === 'PUT' || ctx.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const c of ctx.req) chunks.push(c as Buffer)
        try { ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { ctx.request.body = {} }
      }
      await next()
    })
    app.use(userenvRoutes.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
  })

  async function fetchJson(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${base}${path}`, init)
    // 路由外 404 是 text/plain("Not Found")，非法名可能走 400 JSON 或路由外 404——都合法
    const text = await res.text()
    let body: Record<string, unknown>
    try { body = JSON.parse(text) as Record<string, unknown> } catch { body = { raw: text } }
    return { status: res.status, body }
  }

  it('GET：profile 不存在 404；存在返回脱敏条目；.env 未建=空表+missing', async () => {
    const missing = await fetchJson('/api/userenv/profiles/nope/env')
    expect(missing.status).toBe(404)
    expect(missing.body.ok).toBe(false)

    makeProfile('r1', 'API_TOKEN=abcdef\nMODEL=m\n')
    const got = await fetchJson('/api/userenv/profiles/r1/env')
    expect(got.status).toBe(200)
    expect(got.body.ok).toBe(true)
    const entries = got.body.entries as Array<{ key: string; valueMasked: string; sensitive: boolean }>
    expect(entries.map((e) => e.key)).toEqual(['API_TOKEN', 'MODEL'])
    expect(entries[0]).toMatchObject({ valueMasked: '***len=6***', sensitive: true })
    expect(entries[1]).toMatchObject({ valueMasked: 'm', sensitive: false })

    makeProfile('r1-empty')
    const empty = await fetchJson('/api/userenv/profiles/r1-empty/env')
    expect(empty.status).toBe(200)
    expect(empty.body.missing).toBe(true)
    expect(empty.body.entries).toEqual([])
  })

  it('GET 非法名（../绝对）拒绝：控制器 400 或 koa 路径归一后路由外 404（两态都不进 profiles 目录、不 5xx）', async () => {
    // koa 在路由前归一化路径：%2e%2e 折叠为 ../ 后无路由匹配 → 404 路由外；
    // 若未来直通控制器则应是 400 invalid_profile_name。安全属性=两种终态都不触盘。
    const dotdot = await fetchJson('/api/userenv/profiles/%2e%2e/env')
    expect([400, 404]).toContain(dotdot.status)
    if (dotdot.status === 400) expect(dotdot.body.code).toBe('invalid_profile_name')
    const abs = await fetchJson('/api/userenv/profiles/%2ftmp%2fx/env')
    expect([400, 404]).toContain(abs.status)
    if (abs.status === 400) expect(abs.body.ok).toBe(false)
  })

  it('PUT：非敏感整表写入成功，带备份与 restartHint；审计行 actor 取登录态', async () => {
    makeProfile('r2', 'MODEL=old\n')
    const put = await fetchJson('/api/userenv/profiles/r2/env', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ key: 'MODEL', value: 'new' }, { key: 'PORT', value: '8080' }] }),
    })
    expect(put.status).toBe(200)
    expect(put.body.ok).toBe(true)
    expect(put.body.written).toBe(true)
    expect(put.body.restartHint).toBe(true)
    expect(put.body.changedKeys).toEqual(['MODEL', 'PORT'])
    expect(String(put.body.backup)).toMatch(/^\.env\.bak-/)
    const audit = JSON.parse(readFileSync(join(webui, 'userenv-audit.jsonl'), 'utf8'))
    expect(audit.actor).toBe('qa-lead')

    // 幂等重放：written=false、restartHint=false、无新备份
    const again = await fetchJson('/api/userenv/profiles/r2/env', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ key: 'MODEL', value: 'new' }, { key: 'PORT', value: '8080' }] }),
    })
    expect(again.body.written).toBe(false)
    expect(again.body.restartHint).toBe(false)
    expect(again.body.backup).toBeUndefined()
  })

  it('PUT 敏感值变更未确认 409 {problems:[键名]}；确认后 200', async () => {
    makeProfile('r3', 'API_KEY=oldkey\n')
    const conflict = await fetchJson('/api/userenv/profiles/r3/env', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ key: 'API_KEY', value: 'newkey' }] }),
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.ok).toBe(false)
    expect(conflict.body.code).toBe('sensitive_unconfirmed')
    expect(conflict.body.problems).toEqual(['API_KEY'])
    // 409 后文件未被改动
    expect(readFileSync(join(home, 'profiles', 'r3', '.env'), 'utf8')).toBe('API_KEY=oldkey\n')

    const okPut = await fetchJson('/api/userenv/profiles/r3/env', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ key: 'API_KEY', value: 'newkey' }], confirmSensitive: true }),
    })
    expect(okPut.status).toBe(200)
    expect(readFileSync(join(home, 'profiles', 'r3', '.env'), 'utf8')).toBe('API_KEY=newkey\n')
  })

  it('PUT 校验面：entries 非数组 422；条目结构非法 422 problems；键名非法 422；profile 不存在 404', async () => {
    makeProfile('r4')
    expect((await fetchJson('/api/userenv/profiles/r4/env', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries: 'x' }),
    })).status).toBe(422)
    const shape = await fetchJson('/api/userenv/profiles/r4/env', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ key: 'A', value: 1 }] }),
    })
    expect(shape.status).toBe(422)
    expect(shape.body.problems).toHaveLength(1)
    const badKey = await fetchJson('/api/userenv/profiles/r4/env', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ key: '9BAD', value: 'x' }] }),
    })
    expect(badKey.status).toBe(422)
    expect(String((badKey.body.problems as string[])[0])).toContain('9BAD')
    expect((await fetchJson('/api/userenv/profiles/ghost/env', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries: [] }),
    })).status).toBe(404)
  })

  it('普通 admin 改其他 profile 返回 403，文件、备份和审计均无变化', async () => {
    const dir = makeProfile('bob', 'MODEL=original\n')
    const bobEnv = join(dir, '.env')
    currentUser = { id: 2, username: 'alice-admin', role: 'admin', status: 'active', profiles: ['alice'] }

    const response = await fetchJson('/api/userenv/profiles/bob/env', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ key: 'MODEL', value: 'overwritten' }] }),
    })

    expect(response.status).toBe(403)
    expect(readFileSync(bobEnv, 'utf8')).toBe('MODEL=original\n')
    expect(readdirSync(dir).filter((name) => name.startsWith('.env.bak-'))).toHaveLength(0)
    expect(() => readFileSync(join(webui, 'userenv-audit.jsonl'), 'utf8')).toThrow()
  })

  it('未授权读取先于 profile 存在性探测，跨归属与不存在目标都为 403', async () => {
    currentUser = { id: 2, role: 'admin', status: 'active', profiles: ['alice'] }
    makeProfile('bob', 'MODEL=secret\n')
    expect((await fetchJson('/api/userenv/profiles/bob/env')).status).toBe(403)
    expect((await fetchJson('/api/userenv/profiles/ghost/env')).status).toBe(403)
  })

  it('无身份 401，active 但空授权的 admin 仍为 403', async () => {
    makeProfile('alice', 'MODEL=m\n')
    currentUser = undefined
    expect((await fetchJson('/api/userenv/profiles/alice/env')).status).toBe(401)

    currentUser = { id: 2, role: 'admin', status: 'active', profiles: [] }
    expect((await fetchJson('/api/userenv/profiles/alice/env')).status).toBe(403)
  })
})
