// v0.3.1 延后七件守门（上游 v1.29/v1.30/v1.31.1 吸收第二轮）：
//   ①PNG 像素内核重算——解码子集/结构防线/tRNS 透明键/像素差/visual 门三通道
//  ②OpenAPI 提取器——正例字段面/子集外 fail-closed 三态/CLI 冒烟
//  ③requireLive——缺失/静态/畸形三态 × diff 消费面
//  ④零扫描可见性——conventions/symbols 零文件 error
//  ⑤文风检查器——WS-1/2/3 正反例/代码块豁免/表格单元格/零文件
//  ⑦两 demo——进程故障三场景真实计时/依赖图三场景真实扫描+注入清理
// （⑥组合 oracle 见 qgate-v131-combinatorial.test.ts）
import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import { decodePng, pixelDiff, isPng } from '../src/core/png.js'
import { extractApiContract, SubsetError } from '../src/core/openapi.js'
import { checkMarkdown } from '../src/core/writing-style.js'
import { runCommandExecutor } from '../src/executors/command.js'
import { runContractExecutor } from '../src/executors/contract.js'
import { runOpsExecutor } from '../src/executors/ops.js'
import { runBehaviorExecutor } from '../src/executors/behavior.js'
import type { ExecutorSpec } from '../src/core/types.js'
import { ensureDist } from './ensure-dist'

const here = dirname(fileURLToPath(import.meta.url))
const qgateRoot = resolve(here, '..')
const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-def-'))

// ── PNG 构造助手（手写编码器：最小 RGB8/RGBA8 非隔行）──
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1; return c >>> 0 })
  let crc = 0xffffffff
  for (const b of body) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([len, body, crcBuf])
}

function makePng(width: number, height: number, pixels: Buffer, opts: { rgba?: boolean; trns?: Buffer | null } = {}): Buffer {
  const channels = opts.rgba ? 4 : 3
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = 0 // filter 0
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = opts.rgba ? 6 : 2
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)]
  if (opts.trns) parts.push(chunk('tRNS', opts.trns))
  parts.push(chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

describe('①PNG 内核解码（结构防线 fail-closed）', () => {
  it('RGB8 解码逐像素正确；tRNS 透明键命中 alpha=0', () => {
    const px = Buffer.from([10, 20, 30, 10, 20, 40]) // 2×1：第二像素异色
    const png = makePng(2, 1, px)
    const d = decodePng(png)
    expect(d).toMatchObject({ width: 2, height: 1 })
    expect([...d.pixels.slice(0, 8)]).toEqual([10, 20, 30, 255, 10, 20, 40, 255])
    // tRNS 键 (10,20,30)：首像素透明，次像素不透明
    const pngT = makePng(2, 1, px, { trns: Buffer.from([0, 10, 0, 20, 0, 30]) })
    const dt = decodePng(pngT)
    expect([...dt.pixels.slice(0, 8)]).toEqual([10, 20, 30, 0, 10, 20, 40, 255])
  })

  it('像素差重算：1px 差 → {pixels:1}；维度不一致 → 拒绝', () => {
    const a = makePng(2, 1, Buffer.from([1, 1, 1, 1, 1, 1]))
    const b = makePng(2, 1, Buffer.from([1, 1, 1, 2, 2, 2]))
    expect(pixelDiff(a, b)).toEqual({ pixels: 1, totalPixels: 2 })
    const c = makePng(3, 1, Buffer.from([1, 1, 1, 1, 1, 1, 1, 1, 1]))
    expect(() => pixelDiff(a, c)).toThrow(/dimension mismatch/)
  })

  it('结构防线：非 PNG / 缺 IEND / 未知关键 chunk / RGBA 带 tRNS / 重复 tRNS → 拒绝', () => {
    expect(() => decodePng(Buffer.from('notapng'))).toThrow(/Not a PNG/)
    const png = makePng(1, 1, Buffer.from([1, 2, 3]))
    const noIend = png.subarray(0, png.length - 12)
    expect(() => decodePng(noIend)).toThrow(/missing IEND|trailing|truncated/)
    expect(() => decodePng(Buffer.concat([png, Buffer.from([0])]))).toThrow(/trailing data after IEND/)
    const unknown = Buffer.concat([
      png.subarray(0, 8 + 25), // 签名+IHDR
      chunk('ZzZz', Buffer.from([0])), // 未知关键 chunk（PNG 规范：大写首字母=关键，解码器不得忽略）
      png.subarray(8 + 25),
    ])
    expect(() => decodePng(unknown)).toThrow(/unknown critical chunk/)
    expect(() => decodePng(makePng(1, 1, Buffer.from([1, 2, 3, 4]), { rgba: true, trns: Buffer.alloc(6) }))).toThrow(/tRNS chunk forbidden for RGBA/)
    const doubleTrns = Buffer.concat([
      png.subarray(0, 8 + 25),
      chunk('tRNS', Buffer.from([0, 1, 0, 2, 0, 3])),
      chunk('tRNS', Buffer.from([0, 1, 0, 2, 0, 3])),
      png.subarray(8 + 25),
    ])
    expect(() => decodePng(doubleTrns)).toThrow(/duplicate tRNS/)
    expect(isPng(png)).toBe(true)
    expect(isPng(Buffer.from('x'))).toBe(false)
  })

  it('visual 门三通道：字节一致=exact-bytes；PNG 差=kernel-recompute（自报不符=error）；非 PNG=self-reported', async () => {
    const ws = tmp()
    try {
      const base = makePng(2, 1, Buffer.from([1, 1, 1, 1, 1, 1]))
      const diff1 = makePng(2, 1, Buffer.from([1, 1, 1, 2, 2, 2]))
      writeFileSync(join(ws, 'a.png'), base)
      writeFileSync(join(ws, 'b.png'), diff1)
      const mk = (over: Partial<ExecutorSpec>): ExecutorSpec =>
        ({ id: 'v', type: 'behavior', mode: 'visual', observedFile: 'a.png', expectedFile: 'b.png', evidenceType: 'x', maxDiffPixels: 1, ...over }) as ExecutorSpec
      // 字节一致 → pass + exact-bytes（a vs a）
      writeFileSync(join(ws, 'c.png'), base)
      const same = await runBehaviorExecutor(mk({ observedFile: 'a.png', expectedFile: 'c.png' }), { runId: 'r', gateId: 'g', workspace: ws })
      expect(same.result).toBe('pass')
      expect(same.metrics?.diffSource).toBe('exact-bytes')
      // PNG 容差内 → pass + kernel-recompute
      const within = await runBehaviorExecutor(mk({}), { runId: 'r', gateId: 'g', workspace: ws })
      expect(within.result).toBe('pass')
      expect(within.metrics).toEqual({ diffSource: 'kernel-recompute', diffPixels: 1, totalPixels: 2 })
      // 容差外 → fail
      const beyond = await runBehaviorExecutor(mk({ maxDiffPixels: 0 }), { runId: 'r', gateId: 'g', workspace: ws })
      expect(beyond.result).toBe('fail')
      // 自报 metrics 与重算不符 → error（声明即核验）
      writeFileSync(join(ws, 'm.json'), JSON.stringify({ diff: { pixels: 0, totalPixels: 2 } }))
      const lying = await runBehaviorExecutor(mk({ dataFile: 'm.json' }), { runId: 'r', gateId: 'g', workspace: ws })
      expect(lying.result).toBe('error')
      expect(lying.summary).toContain('disagree with kernel recompute')
      // 非 PNG → 自报协议（声明边界）
      writeFileSync(join(ws, 'x.bin'), 'aaaa')
      writeFileSync(join(ws, 'y.bin'), 'bbbb')
      writeFileSync(join(ws, 'm2.json'), JSON.stringify({ diff: { pixels: 1, totalPixels: 4 } }))
      const nonPng = await runBehaviorExecutor(mk({ observedFile: 'x.bin', expectedFile: 'y.bin', dataFile: 'm2.json', maxDiffPixels: 2 }), { runId: 'r', gateId: 'g', workspace: ws })
      expect(nonPng.result).toBe('pass')
      expect(nonPng.metrics?.diffSource).toBe('self-reported')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('②OpenAPI 提取器（fail-closed 子集）', () => {
  beforeAll(async () => { await ensureDist() })

  const SPEC = {
    openapi: '3.0.3',
    paths: {
      '/p/{id}': {
        parameters: [{ name: 'id', in: 'path' }],
        get: { parameters: [{ name: 'v', in: 'query' }], responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { a: {}, b: {} } } } } } } },
        post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { c: {} } } } } }, responses: { '201': {}, '200': { content: { 'application/json': { schema: { properties: { legacy: {} } } } } } } },
      },
    },
  }

  it('正例：路径参数占槽、query 并列、body 后置、字典序最小 2xx、operation 参数覆盖 path 级', () => {
    const c = extractApiContract(SPEC, 'spec.json')
    expect(c.kind).toBe('api')
    expect(c.itemCount).toBe(2)
    const get = c.items.find((i) => i.method === 'GET')!
    expect(get.requestFields).toEqual(['id', 'v'])
    expect(get.responseFields).toEqual(['a', 'b'])
    const post = c.items.find((i) => i.method === 'POST')!
    expect(post.requestFields).toEqual(['id', 'c'])
    expect(post.responseStatus).toBe(200) // 200 < 201 字典序
    expect(post.responseFields).toEqual(['legacy'])
  })

  it('子集外 fail-closed：head 操作/$ref/composition/无 2xx/重复参数/openapi 2.x', () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ openapi: '3.0.3', paths: { '/x': { head: { responses: { '200': {} } } } } }, /head operation .* outside declared subset/],
      [{ openapi: '3.0.3', paths: { '/x': { get: { responses: { '200': { $ref: '#/x' } } } } } }, /\$ref unsupported/],
      [{ openapi: '3.0.3', paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: { allOf: [] } } } }, responses: { '200': {} } } } } }, /composition .* unsupported/],
      [{ openapi: '3.0.3', paths: { '/x': { get: { responses: {} } } } }, /no 2xx response/],
      [{ openapi: '3.0.3', paths: { '/x': { parameters: [{ name: 'a', in: 'query' }, { name: 'a', in: 'query' }], get: { responses: { '200': {} } } } } }, /duplicate path-level parameter/],
      [{ openapi: '2.0', paths: {} }, /outside declared subset/],
    ]
    for (const [spec, re] of cases) {
      expect(() => extractApiContract(spec, 's.json'), JSON.stringify(spec).slice(0, 60)).toThrow(re)
    }
    // SubsetError 可被调用方捕获转 error 证据
    try { extractApiContract(cases[0]![0], 's') } catch (e) { expect(e).toBeInstanceOf(SubsetError) }
  })

  it('CLI 冒烟：正例 exit 0 产出 contract；子集外 exit 3 指名', () => {
    const ws = tmp()
    try {
      writeFileSync(join(ws, 'ok.json'), JSON.stringify(SPEC))
      const cli = join(qgateRoot, 'dist', 'cli.js')
      const ok = spawnSync(process.execPath, [cli, 'extract-openapi', 'ok.json', '--out', 'out.json'], { cwd: ws, encoding: 'utf8' })
      expect(ok.status, ok.stderr).toBe(0)
      const produced = JSON.parse(String(require('node:fs').readFileSync(join(ws, 'out.json'), 'utf8')))
      expect(produced.kind).toBe('api')
      writeFileSync(join(ws, 'bad.json'), JSON.stringify({ openapi: '3.0.3', paths: { '/x': { trace: { responses: { '200': {} } } } } }))
      const bad = spawnSync(process.execPath, [cli, 'extract-openapi', 'bad.json'], { cwd: ws, encoding: 'utf8' })
      expect(bad.status).toBe(3)
      expect(bad.stderr).toContain('trace operation at /x outside declared subset')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('③requireLive（contract diff 消费面）', () => {
  it('缺失 mode=FAIL / static=FAIL / live=PASS / 畸形=ERROR；未开启保持兼容', async () => {
    const ws = tmp()
    try {
      writeFileSync(join(ws, 'exp.json'), JSON.stringify({ x: 1 }))
      const run = async (obs: unknown, requireLive?: boolean) => {
        writeFileSync(join(ws, 'obs.json'), JSON.stringify(obs))
        return runContractExecutor(
          { id: 'c', type: 'contract', mode: 'diff', expectedFile: 'exp.json', observedFile: 'obs.json', evidenceType: 'x', requireLive } as never as ExecutorSpec,
          { runId: 'r', gateId: 'g', workspace: ws },
        )
      }
      // 未开启：缺失 mode 照常 pass（兼容）
      expect((await run({ x: 1 })).result).toBe('pass')
      // 开启：live=PASS / 缺失=FAIL / static=FAIL / 畸形=ERROR
      expect((await run({ x: 1, mode: 'live' }, true)).result).toBe('pass')
      const missing = await run({ x: 1 }, true)
      expect(missing.result).toBe('fail')
      expect(missing.summary).toContain('missingObservationMode')
      expect((await run({ x: 1, mode: 'static' }, true)).result).toBe('fail')
      const weird = await run({ x: 1, mode: 'blob' }, true)
      expect(weird.result).toBe('error')
      expect(weird.summary).toContain('invalid observation mode')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('④零扫描可见性（conventions/symbols）', () => {
  it('conventions：范围 glob 零文件 → error（scope-empty）；命中面正常扫描', async () => {
    const ws = tmp()
    try {
      writeFileSync(join(ws, 'conv.json'), JSON.stringify({ rules: [{ id: 'R1', include: 'TODO', paths: ['src/**/*.ts'], severity: 'fail' }] }))
      const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'conventions', dataFile: 'conv.json', evidenceType: 'x' }
      const empty = await runOpsExecutor(exec, { runId: 'r', gateId: 'g', workspace: ws })
      expect(empty.result).toBe('error')
      expect(empty.summary).toContain('scope-empty')
      mkdirSync(join(ws, 'src'), { recursive: true })
      writeFileSync(join(ws, 'src', 'a.ts'), 'const x = 1\n')
      const clean = await runOpsExecutor(exec, { runId: 'r2', gateId: 'g', workspace: ws })
      expect(clean.result).toBe('pass')
      writeFileSync(join(ws, 'src', 'a.ts'), 'const x = 1 // TODO fix\n')
      const hit = await runOpsExecutor(exec, { runId: 'r3', gateId: 'g', workspace: ws })
      expect(hit.result).toBe('fail')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })

  it('symbols：零代码文件 → error（零文件不构成接地证据）', async () => {
    const ws = tmp()
    try {
      writeFileSync(join(ws, 'package.json'), JSON.stringify({ dependencies: {} }))
      const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x' }
      const empty = await runOpsExecutor(exec, { runId: 'r', gateId: 'g', workspace: ws })
      expect(empty.result).toBe('error')
      expect(empty.summary).toContain('scope-empty')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('⑤文风检查器 WS-1/2/3', () => {
  it('WS-1 长句（中文 >160 字/英文 >45 词）；代码块与行内代码豁免', () => {
    const longCn = '这是一句' + '很长的中文'.repeat(40) + '句子。'
    const findings = checkMarkdown(longCn, 't.md')
    expect(findings.some((f) => f.rule === 'WS-1' && f.detail.includes('chars >'))).toBe(true)
    const longEn = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ') + '.'
    expect(checkMarkdown(longEn, 't.md').some((f) => f.rule === 'WS-1' && f.detail.includes('words >'))).toBe(true)
    // 代码块内长行豁免
    const codeFenced = '```\n' + longCn + '\n```\n'
    expect(checkMarkdown(codeFenced, 't.md')).toEqual([])
    // 行内代码豁免：长句若全在 `…` 内不报（简化口径：含行内代码标记的行豁免词句计数按剥后长度）
    const inline = '说明 `' + 'x'.repeat(200) + '` 末尾。\n'
    expect(checkMarkdown(inline, 't.md')).toEqual([])
  })

  it('WS-2 模糊词字面量表；qgate-style:example 行豁免', () => {
    const text = '遗留问题后续完善，性能按需优化。\nqgate-style:example 适当处理 是规则样例\n'
    const findings = checkMarkdown(text, 't.md')
    expect(findings.filter((f) => f.rule === 'WS-2').map((f) => f.detail)).toContainEqual(expect.stringContaining('后续完善'))
    expect(findings.filter((f) => f.rule === 'WS-2').map((f) => f.detail)).toContainEqual(expect.stringContaining('按需优化'))
    // 样例行整行豁免
    expect(findings.some((f) => f.detail.includes('适当处理'))).toBe(false)
  })

  it('WS-3 多动作列表行（≥2 连接词）；表格单元格独立检查', () => {
    const text = '- 先做甲然后做乙接着做丙\n'
    expect(checkMarkdown(text, 't.md').some((f) => f.rule === 'WS-3' && f.detail.includes('action connectors'))).toBe(true)
    const table = '| 摘要 | ' + '长'.repeat(180) + ' |\n'
    expect(checkMarkdown(table, 't.md').some((f) => f.rule === 'WS-1' && f.detail.includes('table cell'))).toBe(true)
    expect(checkMarkdown(table, 't.md').some((f) => f.rule === 'WS-1' && !f.detail.includes('table cell'))).toBe(false)
  })

  it('writing-style 门：命中 → fail 带 WS 计数；零文件 → error', async () => {
    const ws = tmp()
    try {
      const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'writing-style', evidenceType: 'x' }
      const empty = await runOpsExecutor(exec, { runId: 'r', gateId: 'g', workspace: ws })
      expect(empty.result).toBe('error')
      expect(empty.summary).toContain('scope-empty')
      writeFileSync(join(ws, 'doc.md'), '# 干净文档\n\n短句。没有问题。\n')
      const clean = await runOpsExecutor(exec, { runId: 'r2', gateId: 'g', workspace: ws })
      expect(clean.result).toBe('pass')
      writeFileSync(join(ws, 'doc.md'), '遗留问题后续完善。\n- 先做甲然后做乙接着做丙\n')
      const hit = await runOpsExecutor(exec, { runId: 'r3', gateId: 'g', workspace: ws })
      expect(hit.result).toBe('fail')
      expect(hit.summary).toContain('WS-2')
      expect(hit.summary).toContain('WS-3')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('⑦两个真测 demo（examples/）', () => {
  it('resilience-process：healthy/recover 真实计时；kill-no-restart 3 秒端口静默', () => {
    const runner = join(qgateRoot, 'examples', 'resilience-process-demo', 'runner.mjs')
    const run = (scenario: string) => JSON.parse(execFileSync(process.execPath, [runner], {
      input: '{"runId":"t"}', encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, QGATE_SCENARIO: scenario },
    }))
    const healthy = run('healthy')
    expect(healthy.recovered).toBe(true)
    expect(healthy.signals).toContain('health-probe-ok')
    const recover = run('recover')
    expect(recover.recovered).toBe(true)
    expect(typeof recover.recoveryMs).toBe('number')
    expect(recover.recoveryMs).toBeLessThan(5000)
    const dead = run('process-kill-no-restart')
    expect(dead.recovered).toBe(false)
    expect(dead.signals).toContain('port-silent-3s')
  }, 40_000)

  it('architecture-dependency：clean 零违例；violation/cycle 检出且注入文件清理', () => {
    const runner = join(qgateRoot, 'examples', 'architecture-dependency-demo', 'runner.mjs')
    // violation/cycle 检出时 runner 非零退出（观察+判定双通道）——spawnSync 容纳退出码
    const run = (scenario: string): { obs: Record<string, unknown>; status: number | null } => {
      const r = spawnSync(process.execPath, [runner], {
        input: '{"runId":"t"}', encoding: 'utf8', timeout: 20_000,
        env: { ...process.env, QGATE_SCENARIO: scenario },
      })
      return { obs: JSON.parse(r.stdout || '{}'), status: r.status }
    }
    const clean = run('clean')
    expect(clean.status).toBe(0)
    expect((clean.obs.forbiddenDependencies as unknown[])).toEqual([])
    expect((clean.obs.cycles as unknown[])).toEqual([])
    expect(clean.obs.edges).toBeGreaterThan(0)
    const violation = run('violation')
    expect(violation.status).toBe(1)
    expect((violation.obs.forbiddenDependencies as string[]).length).toBe(1)
    expect((violation.obs.forbiddenDependencies as string[])[0]).toContain('core→ui')
    const cycle = run('cycle')
    expect(cycle.status).toBe(1)
    expect((cycle.obs.cycles as string[]).length).toBe(1)
    expect((cycle.obs.cycles as string[])[0]).toContain('cyc-a.mjs')
    // 注入文件已清理（finally 纪律）
    const srcDir = join(qgateRoot, 'examples', 'architecture-dependency-demo', 'src', 'core')
    const files = String(execFileSync('ls', [srcDir], { encoding: 'utf8' })).split('\n').filter(Boolean)
    expect(files.sort()).toEqual(['engine.mjs'])
    void runCommandExecutor
  }, 40_000)
})
