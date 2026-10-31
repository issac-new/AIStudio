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

/**
 * 子进程超时预算：显式 options.timeoutMs 优先；否则默认 60s，允许
 * DIAGRAM_EXPORT_TIMEOUT_MS 覆盖（2026-10-31 全功能回归：全量 970 文件并行时
 * Chromium 启动/渲染被放大约 15x，产品默认 60s 与测试 90s 预算口径不一致，
 * 单跑 11.7s 的导出在全量并行下偶发 60s 超时；测试以 env 放宽到预算内，
 * 产品默认保持不变）。
 */
function exportTimeoutMs(override?: number): number {
  if (override !== undefined) return override
  const raw = Number(process.env.DIAGRAM_EXPORT_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : TIMEOUT_MS
}

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
    const timeoutMs = exportTimeoutMs(options.timeoutMs)
    execFile(
      process.execPath,
      [script, src, out, String(scale)],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - started
        if (error?.killed || (error && /timed out/i.test(error.message))) {
          resolvePromise({ ok: false, runnerError: `导出超时（${timeoutMs}ms）`, durationMs })
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
