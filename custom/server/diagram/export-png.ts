// overlay/custom/server/diagram/export-png.ts
// 图产物 PNG 导出（spec 项4）：服务端包装 scripts/diagram-export-png.mjs（逻辑单源，
// 与 self-check 同一子进程模式）。产物落在源文件同目录 <name>.png，供报告/docx 衍生链
// （pandoc 消费 PNG）使用。
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { overlayRoot } from './self-check'

export interface DiagramExportResult {
  ok: boolean
  out?: string
  runnerError?: string
  durationMs: number
}

const TIMEOUT_MS = 60_000

export function exportScriptPath(root: string = overlayRoot()): string {
  return join(root, 'scripts', 'diagram-export-png.mjs')
}

export function defaultOutPath(src: string): string {
  return src.replace(/\.html?$/i, '.png')
}

export interface ExportOptions {
  scale?: number
  out?: string
  scriptPath?: string
  timeoutMs?: number
}

export function runExportPng(src: string, options: ExportOptions = {}): Promise<DiagramExportResult> {
  const script = options.scriptPath ?? exportScriptPath()
  const out = options.out ?? defaultOutPath(src)
  const started = Date.now()
  return new Promise((resolvePromise) => {
    if (!existsSync(script)) {
      resolvePromise({ ok: false, runnerError: `diagram-export-png.mjs 不在位：${script}`, durationMs: Date.now() - started })
      return
    }
    const scale = options.scale ?? 2
    execFile(
      process.execPath,
      [script, src, out, String(scale)],
      { timeout: options.timeoutMs ?? TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - started
        if (error?.killed || (error && /timed out/i.test(error.message))) {
          resolvePromise({ ok: false, runnerError: `导出超时（${options.timeoutMs ?? TIMEOUT_MS}ms）`, durationMs })
          return
        }
        if (error) {
          const reason = (stderr || stdout).trim().split('\n').filter(Boolean).slice(-2).join('；')
          resolvePromise({ ok: false, runnerError: reason || `导出失败（code=${error.code}）`, durationMs })
          return
        }
        if (!existsSync(out)) {
          resolvePromise({ ok: false, runnerError: `导出进程报成功但产物缺失：${out}（不假装成功）`, durationMs })
          return
        }
        resolvePromise({ ok: true, out, durationMs })
      },
    )
  })
}
