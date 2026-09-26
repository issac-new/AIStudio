// overlay/videoref 域层 2：真抽帧引擎（ffmpeg spawn，kimi 视频链路吸收的执行面）。
//
// 输入=video-ref.ts 的 FrameBudget（帧数×分辨率），输出=抽帧 PNG 列表（临时目录，
// 供多模态消息引用）。失败如实抛（ffmpeg 缺失/坏视频/超时）——不降级假帧。
// 帧选取=等间隔（fps=frames/duration），缩放=宽度预算保比（-1 保纵横比）。
import { execFile } from 'child_process'
import { mkdtempSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface ExtractedFrame {
  framePath: string
  index: number
  bytes: number
}

export interface ExtractResult {
  frames: ExtractedFrame[]
  durationSeconds: number
  widthPx: number
  heightPx: number
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr).slice(-500) }))
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/** 探测视频元信息（ffprobe JSON）。 */
async function probe(videoPath: string): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_streams', '-select_streams', 'v:0', videoPath,
  ], 15000)
  const info = JSON.parse(stdout) as { streams?: Array<{ duration?: string; width?: number; height?: number }> }
  const s = info.streams?.[0] ?? {}
  return {
    duration: Number(s.duration ?? 0),
    width: Number(s.width ?? 0),
    height: Number(s.height ?? 0),
  }
}

/** 真抽帧（等间隔+保比缩放）；输出目录由调用方清理（consume 后 rmSync）。 */
export async function extractFrames(
  videoPath: string,
  budget: { frames: number; widthPx: number },
  opts: { timeoutMs?: number } = {},
): Promise<ExtractResult & { outDir: string }> {
  const timeoutMs = opts.timeoutMs ?? 60000
  const meta = await probe(videoPath)
  if (!(meta.duration > 0)) throw new Error('无法探测视频时长（坏文件或非视频）')
  const fps = Math.max(0.1, budget.frames / meta.duration)
  const outDir = mkdtempSync(join(tmpdir(), 'videoref-frames-'))
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', videoPath,
    '-vf', `fps=${fps.toFixed(4)},scale=${budget.widthPx}:-1`,
    '-frames:v', String(budget.frames),
    join(outDir, 'frame-%02d.png'),
  ], timeoutMs)
  const files = readdirSync(outDir).filter((f) => f.endsWith('.png')).sort()
  const frames = files.map((f, index) => ({
    framePath: join(outDir, f),
    index,
    bytes: 0,
  }))
  if (!frames.length) throw new Error('抽帧产出 0 帧（预算过小或视频异常）')
  return { frames, durationSeconds: meta.duration, widthPx: meta.width, heightPx: meta.height, outDir }
}

/** 消费后清理帧目录。 */
export function cleanupFrames(outDir: string): void {
  try { rmSync(outDir, { recursive: true, force: true }) } catch { /* 已清或缺席 */ }
}

/** REST 消费面（层 2 尾件）：抽帧并返回 base64 帧（多模态消息组装用）。 */
export async function extractFramesBase64(
  videoPath: string,
  budget: { frames: number; widthPx: number },
): Promise<Array<{ index: number; dataBase64: string; bytes: number }>> {
  const res = await extractFrames(videoPath, budget)
  try {
    const { readFileSync } = await import('fs')
    return res.frames.map((f) => ({
      index: f.index,
      bytes: statSyncSafe(f.framePath),
      dataBase64: readFileSync(f.framePath).toString('base64'),
    }))
  } finally {
    cleanupFrames(res.outDir)
  }
}

function statSyncSafe(p: string): number {
  try { return statSyncOf(p) } catch { return 0 }
}
import { statSync as statSyncOf } from 'fs'
