// 服务端基础库守门 + 收敛棘轮（2026-10-28 对账轮 K15/K16/K18）
// ① paths：家目录解析语义（trim、缺省、拼接）
// ② fs-store：原子写往返与 tmp 清理、JSONL 坏行计数、追加
// ③ 棘轮：本地重复实现数量不得超过当前基线（只许减少，禁新增）
import { describe, expect, it, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { hermesHome, hermesWebUiHome, underHermes } from '../paths'
import { appendJsonl, atomicWriteJson, readJsonl } from '../fs-store'

const ROOT = resolve(__dirname, '../../../..')
const tmpDirs: string[] = []
const mkTmp = () => { const d = mkdtempSync(join(tmpdir(), 'storekit-')); tmpDirs.push(d); return d }
afterEach(() => { for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('paths：hermes 家目录解析', () => {
  it('显式 env 优先且去空白', () => {
    expect(hermesHome({ HERMES_HOME: '  /tmp/hh  ' } as NodeJS.ProcessEnv)).toBe('/tmp/hh')
    expect(hermesWebUiHome({ HERMES_WEB_UI_HOME: ' /tmp/webui ' } as NodeJS.ProcessEnv)).toBe('/tmp/webui')
  })

  it('未配置或空白时回落 ~/.hermes 与 ~/.hermes-web-ui', () => {
    expect(hermesHome({} as NodeJS.ProcessEnv).endsWith('.hermes')).toBe(true)
    expect(hermesHome({ HERMES_HOME: '   ' } as NodeJS.ProcessEnv).endsWith('.hermes')).toBe(true)
    expect(hermesWebUiHome({} as NodeJS.ProcessEnv).endsWith('.hermes-web-ui')).toBe(true)
  })

  it('underHermes 在解析根下拼接', () => {
    const saved = process.env.HERMES_HOME
    process.env.HERMES_HOME = '/tmp/base'
    try { expect(underHermes('gateway_state.json')).toBe('/tmp/base/gateway_state.json') }
    finally { if (saved === undefined) delete process.env.HERMES_HOME; else process.env.HERMES_HOME = saved }
  })
})

describe('fs-store：原子写与 JSONL', () => {
  it('atomicWriteJson 往返且不残留 tmp', () => {
    const dir = mkTmp()
    const f = join(dir, 'a.json')
    atomicWriteJson(f, { x: 1, s: '中文' })
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ x: 1, s: '中文' })
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('atomicWriteJson 支持 fsync 选项（台账类写入）', () => {
    const dir = mkTmp()
    const f = join(dir, 'ledger.json')
    atomicWriteJson(f, { ok: true }, { fsync: true })
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ ok: true })
  })

  it('readJsonl 跳过坏行并计数；文件缺失返回 missing', () => {
    const dir = mkTmp()
    const f = join(dir, 'x.jsonl')
    writeFileSync(f, '{"a":1}\n\nnot-json\n{"a":2}\n')
    const r = readJsonl<{ a: number }>(f)
    expect(r.rows).toEqual([{ a: 1 }, { a: 2 }])
    expect(r.skipped).toBe(1)
    expect(r.missing).toBe(false)
    expect(readJsonl(join(dir, 'absent.jsonl')).missing).toBe(true)
  })

  it('appendJsonl 追加一行并自动建目录', () => {
    const dir = mkTmp()
    const f = join(dir, 'nested', 'y.jsonl')
    appendJsonl(f, { i: 1 })
    appendJsonl(f, { i: 2 })
    expect(readJsonl(f).rows).toEqual([{ i: 1 }, { i: 2 }])
  })
})

describe('收敛棘轮：重复实现只许减少', () => {
  const grepCount = (pattern: string, paths: string[]): number => {
    try {
      const out = execFileSync('git', ['grep', '-c', '--', pattern, ...paths], { cwd: ROOT, encoding: 'utf8' })
      return out.split('\n').filter(Boolean).reduce((n, line) => n + Number(line.split(':').pop() ?? 0), 0)
    } catch { return 0 } // git grep 无命中时退出码 1
  }

  it('服务端本地原子写定义不超过基线 8 处（新代码必须用 lib/fs-store）', () => {
    const n = grepCount('function writeJsonAtomic\\|function writeAtomic', ['custom/server'])
    expect(n, '新增了本地原子写实现——请改用 custom/server/lib/fs-store').toBeLessThanOrEqual(8)
  })

  it('内联 homedir()+\'.hermes\' 不超过基线 75 处（新代码必须用 lib/paths）', () => {
    const n = grepCount("homedir(), '.hermes'", ['custom/server'])
    expect(n, '新增了内联家目录解析——请改用 custom/server/lib/paths').toBeLessThanOrEqual(75)
  })

  it('authFetch 只有一份实现（其余为再导出）', () => {
    const impl = readFileSync(join(ROOT, 'custom/client/shared/http.ts'), 'utf8')
    expect(impl).toContain('export async function authFetch')
    expect(impl).toContain('getBaseUrl()')
    expect(impl).toContain('X-Hermes-Profile')
    const legacy = readFileSync(join(ROOT, 'custom/client/ide/utils/auth-fetch.ts'), 'utf8')
    expect(legacy).not.toContain('export async function authFetch')
    expect(legacy).toContain("from '@/custom/shared/http'")
  })
})
