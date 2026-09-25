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

// 剥行注释（G8）：跳过引号内区段——字符串里的 //（URL、路径拼接等）不得整段截掉，
// 否则截断点之后的真引用漏报。文本守门固有上限：不解析跨行块注释/正则字面量/
// 模板串嵌套，单引号内转义按简单状态机处理（引号外见 // 才截到行尾）。
function stripLineComments(src: string): string {
  return src.split('\n').map((line) => {
    let out = ''
    let quote: string | null = null
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quote) {
        out += ch
        if (ch === '\\' && i + 1 < line.length) out += line[++i]
        else if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue }
      if (ch === '/' && line[i + 1] === '/') break // 行注释起始：截到行尾
      out += ch
    }
    return out
  }).join('\n')
}

describe('loop 板库边界守门', () => {
  it('剥注释跳过引号内区段（G8）：字符串内 // 不整段截掉，行注释仍剥', () => {
    const out = stripLineComments(`const u = 'https://x/kanban.db/v1' // 注释里 kanban.db 无害`)
    expect(out).toContain('https://x/kanban.db') // 撤此修复（行内裸 replace(/\/\/.*$/,'')）即红
    expect(out).not.toContain('注释里') // 行注释照剥
  })

  it('kanban.db 非注释引用仅只读投影可出现', () => {
    const offenders: string[] = []
    for (const file of walk(loopRoot)) {
      const rel = relative(loopRoot, file).split(sep).join('/')
      if (KANBAN_DB_ALLOWED.includes(rel)) continue
      // 剥行注释后判定：注释里提及 kanban.db 无害，代码引用（直读直写板库）才违规
      const codeOnly = stripLineComments(readFileSync(file, 'utf8'))
      if (codeOnly.includes('kanban.db')) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('mind-projection 保持只读打开（readonly 模式，绝不写板库）', () => {
    const src = readFileSync(join(loopRoot, 'graph', 'mind-projection.ts'), 'utf8')
    expect(src).toMatch(/readOnly:\s*true|mode:\s*'readonly'/)
  })
})
