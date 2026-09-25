// loop 板库边界守门（边界设计 §2/§6-T3）：loop 图引擎的任务状态必须经
// kanban-service → execHermes CLI 读写 kanban，禁止直读直写板库文件。
// kanban.db 字面量仅 mind-projection.ts 可出现（只读投影，mode:readonly，
// 绝不写）。绕过 CLI 直写板库 = 与 hermes kanban 内核双写互踩。
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { describe, expect, it } from 'vitest'

const loopRoot = join(__dirname, '..') // custom/server/loop
const KANBAN_DB_ALLOWED = ['graph/mind-projection.ts']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('loop 板库边界守门', () => {
  it('kanban.db 非注释引用仅只读投影可出现', () => {
    const offenders: string[] = []
    for (const file of walk(loopRoot)) {
      const rel = relative(loopRoot, file).split(sep).join('/')
      if (KANBAN_DB_ALLOWED.includes(rel)) continue
      // 剥行注释后判定：注释里提及 kanban.db 无害，代码引用（直读直写板库）才违规
      const codeOnly = readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
      if (codeOnly.includes('kanban.db')) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('mind-projection 保持只读打开（readonly 模式，绝不写板库）', () => {
    const src = readFileSync(join(loopRoot, 'graph', 'mind-projection.ts'), 'utf8')
    expect(src).toMatch(/readOnly:\s*true|mode:\s*'readonly'/)
  })
})
