// overlay/custom/server/diagram/mermaid-extract.ts
// mermaid_extract.py 子进程包装（spec 项5）：mermaid 源 → 归一 IR。
// 「提取内容」语义唯一事实源=vendored 提取器（决策 D-8 同构：不重写防漂移）。
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { overlayRoot } from './self-check'
import type { MermaidIrDiagram } from './mermaid-branded'

export const MERMAID_MAX_SOURCE_LENGTH = 20_000
const TIMEOUT_MS = 30_000

export function mermaidExtractScriptPath(root: string = overlayRoot()): string {
  return join(root, 'assets', 'skills', 'diagram-design', 'scripts', 'mermaid_extract.py')
}

export interface MermaidExtractResult {
  ok: boolean
  diagram?: MermaidIrDiagram
  kind?: string
  runnerError?: string
}

/** 真实调 python3 mermaid_extract.py；源写临时文件（提取器吃文件不吃 stdin），用完即焚 */
export function runMermaidExtract(
  source: string,
  options: { diagram?: number; scriptPath?: string } = {},
): Promise<MermaidExtractResult> {
  const script = options.scriptPath ?? mermaidExtractScriptPath()
  if (!existsSync(script)) {
    return Promise.resolve({ ok: false, runnerError: `mermaid_extract.py 不在位：${script}` })
  }
  if (!source.trim()) return Promise.resolve({ ok: false, runnerError: 'mermaid 源为空' })
  if (source.length > MERMAID_MAX_SOURCE_LENGTH) {
    return Promise.resolve({ ok: false, runnerError: `mermaid 源超过 ${MERMAID_MAX_SOURCE_LENGTH} 字符上限` })
  }
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-extract-'))
  const file = join(dir, 'input.mmd')
  try {
    writeFileSync(file, source, 'utf8')
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    return Promise.resolve({ ok: false, runnerError: `临时文件写入失败：${(e as Error).message}` })
  }
  const args = [script, file, '--json']
  if (options.diagram !== undefined) args.push('--diagram', String(options.diagram))
  return new Promise((resolvePromise) => {
    execFile('python3', args, { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      rmSync(dir, { recursive: true, force: true })
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        resolvePromise({ ok: false, runnerError: 'python3 不在 PATH' })
        return
      }
      if (error?.killed || (error && /timed out/i.test(error.message))) {
        resolvePromise({ ok: false, runnerError: `mermaid_extract 超时（${TIMEOUT_MS}ms）` })
        return
      }
      if (error) {
        resolvePromise({ ok: false, runnerError: `mermaid_extract 失败：${(stderr || error.message).trim().slice(0, 300)}` })
        return
      }
      try {
        const parsed = JSON.parse(stdout) as { diagrams?: MermaidIrDiagram[] }
        const diagram = parsed.diagrams?.[0]
        if (!diagram) {
          resolvePromise({ ok: false, runnerError: '提取器未返回任何图（源可能不是合法 mermaid）' })
          return
        }
        resolvePromise({ ok: true, diagram, kind: diagram.kind })
      } catch (e) {
        resolvePromise({ ok: false, runnerError: `IR JSON 解析失败：${(e as Error).message}` })
      }
    })
  })
}
