// overlay/scripts/__tests__/board-staleness-watchdog.test.ts
// 看板停滞看门狗薄封装守门（run23 根治案一）：
//   1) 留痕行格式——ISSUE|key|actor|描述 四段、描述内竖线归一防字段撕裂
//   2) main() 退出码语义——检出=3、无停滞/源缺席=0、网络/非 2xx/坏响应=1（不静默）
// fetch 以全局 stub 注入，不真打网络。
import { afterEach, describe, expect, it } from 'vitest'
import { formatIssueLine, main } from '../board-staleness-watchdog.mjs'

class Sink {
  lines: string[] = []
  write(s: string): void { this.lines.push(s) }
  text(): string { return this.lines.join('') }
}

const REAL_FETCH = globalThis.fetch
afterEach(() => { globalThis.fetch = REAL_FETCH })

function stubFetch(impl: () => Promise<{ status: number; ok?: boolean; json: () => Promise<unknown> }>): void {
  globalThis.fetch = (async () => {
    const r = await impl()
    return { ...r, ok: r.ok ?? (r.status >= 200 && r.status < 300) }
  }) as unknown as typeof fetch
}

describe('留痕行格式（驱动侧 issues.log 同构）', () => {
  it('四段竖线分隔：key=board-stale-parent、actor=父卡 id、描述含小时数与在途子卡清单', () => {
    const line = formatIssueLine('pay', {
      id: 'T06', title: '迁移阻塞父卡', blockedHours: 26.2, blockedSinceSec: 1, blockKind: 'external',
      children: [
        { id: 't_a1', title: '缺陷修复 a1', status: 'review' },
        { id: 't_a2', title: '缺陷修复 a2', status: 'running' },
      ],
    })
    const parts = line.split('|')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('ISSUE')
    expect(parts[1]).toBe('board-stale-parent')
    expect(parts[2]).toBe('T06')
    expect(parts[3]).toContain('26.2h')
    expect(parts[3]).toContain('pay')
    expect(parts[3]).toContain('t_a1:review')
    expect(parts[3]).toContain('t_a2:running')
  })

  it('标题含竖线时归一为斜杠——四段结构不被撕裂', () => {
    const line = formatIssueLine('default', {
      id: 'P1', title: 'a|b|c', blockedHours: 3, blockedSinceSec: 1, blockKind: null,
      children: [{ id: 'c1', title: 'x', status: 'todo' }],
    })
    expect(line.split('|')).toHaveLength(4)
    expect(line.split('|')[3]).toContain('a/b/c')
  })
})

describe('main() 退出码与输出', () => {
  it('检出停滞父卡 → 退出 3 + stdout 逐卡 ISSUE 行（--issues-log 时追加留痕）', async () => {
    const tmpIssues = await import('node:fs/promises').then(m => m.mkdtemp('watchdog-issues-'))
    const { join } = await import('node:path')
    const logPath = join(tmpIssues, 'issues.log')
    stubFetch(() => Promise.resolve({
      status: 200,
      json: () => Promise.resolve({
        available: true, board: 'pay', staleHours: 2, scannedAt: 1,
        staleParents: [{
          id: 'T06', title: '迁移阻塞父卡', blockedHours: 26.2, blockedSinceSec: 1,
          blockKind: 'external', children: [{ id: 't_a1', title: 'a1', status: 'review' }],
        }],
      }),
    }))
    const sink = new Sink()
    const code = await main(['node', 'x', '--board', 'pay', '--token', 'jwt-x', '--issues-log', logPath], {}, sink as unknown as NodeJS.WriteStream)
    expect(code).toBe(3)
    expect(sink.text()).toContain('ISSUE|board-stale-parent|T06|')
    const logged = await import('node:fs/promises').then(m => m.readFile(logPath, 'utf8'))
    expect(logged).toContain('ISSUE|board-stale-parent|T06|')
    await import('node:fs/promises').then(m => m.rm(tmpIssues, { recursive: true, force: true }))
  })

  it('无停滞 → 0 且零输出；源缺席（available:false）→ 0 + 如实 note（fail-soft 常态不告警）', async () => {
    stubFetch(() => Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ available: true, board: 'default', staleHours: 2, scannedAt: 1, staleParents: [] }),
    }))
    const sink = new Sink()
    expect(await main(['node', 'x'], {}, sink as unknown as NodeJS.WriteStream)).toBe(0)
    expect(sink.text()).toBe('')

    stubFetch(() => Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ available: false, note: '板库缺席' }),
    }))
    const sink2 = new Sink()
    expect(await main(['node', 'x'], {}, sink2 as unknown as NodeJS.WriteStream)).toBe(0)
    expect(sink2.text()).toContain('板库缺席')
  })

  it('网络异常 / HTTP 401 → 退出 1（看门狗自身故障必须可见，不静默）', async () => {
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED')))
    const sink = new Sink()
    expect(await main(['node', 'x'], {}, sink as unknown as NodeJS.WriteStream)).toBe(1)
    expect(sink.text()).toContain('ECONNREFUSED')

    stubFetch(() => Promise.resolve({ status: 401, json: () => Promise.resolve({}) }))
    const sink2 = new Sink()
    expect(await main(['node', 'x'], {}, sink2 as unknown as NodeJS.WriteStream)).toBe(1)
    expect(sink2.text()).toContain('401')
  })
})
