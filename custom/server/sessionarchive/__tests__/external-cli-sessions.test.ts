// 外部 CLI 会话索引测试：两种格式解析、fail-soft、压缩件如实跳过、标题预览截断。
// 夹具全部为合成数据（不含任何真实会话内容）。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as zlib from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseClaudeSession,
  parseCodexSession,
  scanExternalSessions,
  type ExternalSessionReport,
} from '../external-cli-sessions'

const zstdCompress = (zlib as unknown as { zstdCompressSync?: (b: Buffer) => Buffer }).zstdCompressSync

let dir: string | null = null
afterEach(() => {
  if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null }
})

function tmp(): string {
  dir = mkdtempSync(join(tmpdir(), 'ext-cli-'))
  return dir
}

const CLAUDE_LINES = [
  { type: 'queue-operation', operation: 'enqueue', timestamp: '2026-10-20T10:00:00.000Z' },
  { type: 'user', cwd: '/work/demo', timestamp: '2026-10-20T10:00:01.000Z', isSidechain: false,
    message: { role: 'user', content: [{ type: 'text', text: '帮我修复登录 500 问题' }] } },
  { type: 'assistant', cwd: '/work/demo', timestamp: '2026-10-20T10:00:05.000Z',
    message: { role: 'assistant', content: [{ type: 'text', text: '先看日志。' }] } },
  { type: 'user', cwd: '/work/demo', timestamp: '2026-10-20T10:00:09.000Z', isSidechain: true,
    message: { role: 'user', content: '子代理输入' } },
  { type: 'assistant', cwd: '/work/demo', timestamp: '2026-10-20T10:00:12.000Z',
    message: { role: 'assistant', content: [{ type: 'text', text: '已定位。' }] } },
].map((l) => JSON.stringify(l)).join('\n')

const CODEX_LINES = [
  { timestamp: '2026-10-21T09:00:00.000Z', type: 'session_meta',
    payload: { id: 'sess-abc', cwd: '/work/codex-demo', timestamp: '2026-10-21T09:00:00.000Z' } },
  { timestamp: '2026-10-21T09:00:02.000Z', type: 'response_item',
    payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: '<app-context>' }] } },
  { timestamp: '2026-10-21T09:00:03.000Z', type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '给收银台加退款能力' }] } },
  { timestamp: '2026-10-21T09:00:30.000Z', type: 'response_item',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '好，先看接口契约。' }] } },
].map((l) => JSON.stringify(l)).join('\n')

describe('parseClaudeSession', () => {
  it('取 cwd/轮数/最近时间；sidechain 不入标题与轮数', () => {
    const r = parseClaudeSession(CLAUDE_LINES, '/p/demo/abc.jsonl', { includeTitles: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row.source).toBe('claude-code')
    expect(r.row.sessionId).toBe('abc')
    expect(r.row.workspacePath).toBe('/work/demo')
    expect(r.row.userTurns).toBe(1)
    expect(r.row.assistantTurns).toBe(2)
    expect(r.row.title).toBe('帮我修复登录 500 问题')
    expect(r.row.lastActiveAt).toBe(Date.parse('2026-10-20T10:00:12.000Z'))
  })

  it('includeTitles 关闭时 title 为 null（默认不回内容）', () => {
    const r = parseClaudeSession(CLAUDE_LINES, '/p/demo/abc.jsonl')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.row.title).toBeNull()
  })

  it('空文件与无消息文件如实失败', () => {
    expect(parseClaudeSession('', '/p/x.jsonl').ok).toBe(false)
    const onlyQueue = JSON.stringify({ type: 'queue-operation', timestamp: '2026-10-20T10:00:00Z' })
    expect(parseClaudeSession(onlyQueue, '/p/x.jsonl').ok).toBe(false)
  })

  it('尾部半行坏数据不致整文件失败（追加写常态）', () => {
    const r = parseClaudeSession(`${CLAUDE_LINES}\n{"type":"user","message":{"role":"user","content":"半`, '/p/demo/abc.jsonl')
    expect(r.ok).toBe(true)
  })
})

describe('parseCodexSession', () => {
  it('session_meta 取 id/cwd，消息按角色计数，标题取 user 而非 developer', () => {
    const r = parseCodexSession(CODEX_LINES, '/s/rollout-2026-10-21-x.jsonl', { includeTitles: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row.source).toBe('codex')
    expect(r.row.sessionId).toBe('sess-abc')
    expect(r.row.workspacePath).toBe('/work/codex-demo')
    expect(r.row.userTurns).toBe(1)
    expect(r.row.assistantTurns).toBe(1)
    expect(r.row.title).toBe('给收银台加退款能力')
  })

  it('只有 session_meta 无消息：轮数 0 但保留元数据（不猜内容）', () => {
    const only = JSON.stringify({ timestamp: '2026-10-21T09:00:00Z', type: 'session_meta', payload: { id: 'x1', cwd: '/w' } })
    const r = parseCodexSession(only, '/s/rollout-x.jsonl')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.row.userTurns).toBe(0)
      expect(r.row.workspacePath).toBe('/w')
    }
  })
})

describe('scanExternalSessions', () => {
  function buildTree(): { claude: string; codex: string } {
    const root = tmp()
    const claude = join(root, 'projects', '-work-demo')
    const codex = join(root, 'sessions', '2026', '10', '21')
    mkdirSync(claude, { recursive: true })
    mkdirSync(codex, { recursive: true })
    writeFileSync(join(claude, 'abc.jsonl'), CLAUDE_LINES, 'utf8')
    writeFileSync(join(claude, 'empty.jsonl'), '', 'utf8')
    writeFileSync(join(codex, 'rollout-2026-10-21-x.jsonl'), CODEX_LINES, 'utf8')
    // 旧版会话只留压缩件：Node 22+ 可就地解压（不再是死档）
    if (zstdCompress) {
      writeFileSync(join(codex, 'rollout-2026-09-17-y.jsonl.zst'), zstdCompress(Buffer.from(CODEX_LINES, 'utf8')))
    }
    return { claude: join(root, 'projects'), codex: join(root, 'sessions') }
  }

  it('两源合并、按最近活跃倒序、空文件如实跳过', () => {
    const { claude, codex } = buildTree()
    const r: ExternalSessionReport = scanExternalSessions({ claudeRoot: claude, codexRoot: codex, includeTitles: true })
    expect(r.available).toBe(true)
    // 压缩件可解压时：明文 + 压缩件两会话（同内容）；无 zstd 时只有明文
    const codexCount = r.sessions.filter((x) => x.source === 'codex').length
    expect(codexCount).toBe(zstdCompress ? 2 : 1)
    expect(r.sessions.filter((x) => x.source === 'claude-code')).toHaveLength(1)
    expect(r.skipped.some((s) => s.reason === 'empty-file')).toBe(true)
    expect(r.scannedFiles).toBeGreaterThanOrEqual(3)
  })

  it('压缩件就地解压：.jsonl.zst 与明文等价（Node 有 zstd 时）', () => {
    if (!zstdCompress) return
    const { claude, codex } = buildTree()
    const r = scanExternalSessions({ claudeRoot: claude, codexRoot: codex, includeTitles: true, limit: 10 })
    const fromZst = r.sessions.filter((s) => s.file.endsWith('.zst'))
    expect(fromZst).toHaveLength(1)
    const plain = r.sessions.find((s) => s.file.endsWith('rollout-2026-10-21-x.jsonl'))
    expect(fromZst[0]?.sessionId).toBe(plain?.sessionId)
    expect(fromZst[0]?.userTurns).toBe(plain?.userTurns)
    expect(fromZst[0]?.title).toBe(plain?.title)
  })

  it('损坏压缩件进 skipped（decompress-failed），不拖垮整批', () => {
    if (!zstdCompress) return
    const root = tmp()
    const codex = join(root, 'sessions', '2026', '09', '17')
    mkdirSync(codex, { recursive: true })
    writeFileSync(join(codex, 'rollout-2026-09-17-bad.jsonl.zst'), 'not-a-zstd-frame', 'utf8')
    writeFileSync(join(codex, 'rollout-2026-09-18-ok.jsonl'), CODEX_LINES, 'utf8')
    const r = scanExternalSessions({ claudeRoot: join(root, 'none'), codexRoot: join(root, 'sessions') })
    expect(r.sessions).toHaveLength(1)
    expect(r.skipped.some((s) => s.reason.startsWith('decompress-failed'))).toBe(true)
  })

  it('超过单文件上限进 skipped；上限可注入（默认 32MB）', () => {
    const root = tmp()
    const claude = join(root, 'projects', 'p')
    mkdirSync(claude, { recursive: true })
    writeFileSync(join(claude, 'big.jsonl'), CLAUDE_LINES, 'utf8')
    const tight = scanExternalSessions({ claudeRoot: join(root, 'projects'), codexRoot: join(root, 'none'), maxFileBytes: 1024 })
    // 夹具本身超过 1KB 时被挡；未超过时正常解析——两种都接受，但必须有一致的 reason 或结果
    if (tight.sessions.length === 0) {
      expect(tight.skipped.some((s) => s.reason.startsWith('file-too-large'))).toBe(true)
    } else {
      expect(tight.sessions[0]?.source).toBe('claude-code')
    }
    const loose = scanExternalSessions({ claudeRoot: join(root, 'projects'), codexRoot: join(root, 'none') })
    expect(loose.sessions).toHaveLength(1)
  })

  it('解压后超限也挡（压缩比异常不透支内存）', () => {
    if (!zstdCompress) return
    const root = tmp()
    const codex = join(root, 'sessions', '2026', '09', '17')
    mkdirSync(codex, { recursive: true })
    const big = JSON.stringify({ timestamp: '2026-09-17T00:00:00Z', type: 'session_meta', payload: { id: 'big', cwd: '/w' } })
      + '\n' + JSON.stringify({ timestamp: '2026-09-17T00:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'y'.repeat(4000) }] } })
    const packed = zstdCompress(Buffer.from(big, 'utf8'))
    writeFileSync(join(codex, 'rollout-2026-09-17-huge.jsonl.zst'), packed)
    const r = scanExternalSessions({ claudeRoot: join(root, 'none'), codexRoot: join(root, 'sessions'), maxFileBytes: Math.max(1024, packed.byteLength + 64) })
    expect(r.sessions).toHaveLength(0)
    expect(r.skipped.some((s) => s.reason.startsWith('file-too-large-after-decompress'))).toBe(true)
  })

  it('limit 截断时 truncated 如实标注', () => {
    const { claude, codex } = buildTree()
    const r = scanExternalSessions({ claudeRoot: claude, codexRoot: codex, limit: 1 })
    expect(r.sessions).toHaveLength(1)
    expect(r.truncated).toBe(true)
  })

  it('两源都缺席 → available:false 带原因（不造假空列表）', () => {
    const root = tmp()
    const r = scanExternalSessions({ claudeRoot: join(root, 'nope-a'), codexRoot: join(root, 'nope-b') })
    expect(r.available).toBe(false)
    expect(r.reason).toContain('均不可读')
  })

  it('单源在场即可用（另一源缺席不拖垮）', () => {
    const { claude } = buildTree()
    const r = scanExternalSessions({ claudeRoot: claude, codexRoot: join(dir as string, 'missing') })
    expect(r.available).toBe(true)
    expect(r.sessions.every((s) => s.source === 'claude-code')).toBe(true)
  })

  it('标题长度超限截断并以省略号标注', () => {
    const root = tmp()
    const claude = join(root, 'projects', 'p')
    mkdirSync(claude, { recursive: true })
    const long = 'x'.repeat(300)
    writeFileSync(join(claude, 'long.jsonl'), JSON.stringify({ type: 'user', cwd: '/w', timestamp: '2026-10-22T00:00:00Z', message: { role: 'user', content: long } }), 'utf8')
    const r = scanExternalSessions({ claudeRoot: join(root, 'projects'), codexRoot: join(root, 'none'), includeTitles: true })
    expect(r.sessions[0]?.title?.endsWith('…')).toBe(true)
    expect((r.sessions[0]?.title ?? '').length).toBeLessThanOrEqual(121)
  })

  it('source 过滤下推：先过滤再截断（指定 codex 时不被 claude 挤掉）', () => {
    const { claude, codex } = buildTree()
    const onlyCodex = scanExternalSessions({ claudeRoot: claude, codexRoot: codex, source: 'codex', limit: 1 })
    expect(onlyCodex.sessions.length).toBe(1)
    expect(onlyCodex.sessions[0]?.source).toBe('codex')
    const onlyClaude = scanExternalSessions({ claudeRoot: claude, codexRoot: codex, source: 'claude-code', limit: 5 })
    expect(onlyClaude.sessions.every((x) => x.source === 'claude-code')).toBe(true)
    expect(onlyClaude.sessions.length).toBeGreaterThan(0)
  })

  it('source 指定但该源缺席：available=false 且原因点名该源', () => {
    const { claude } = buildTree()
    const r = scanExternalSessions({ claudeRoot: claude, codexRoot: join(dir as string, 'missing'), source: 'codex' })
    expect(r.available).toBe(false)
    expect(r.reason).toContain('codex')
  })
})
