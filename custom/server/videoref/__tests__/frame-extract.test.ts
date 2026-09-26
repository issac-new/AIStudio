// 真抽帧守门（层 2：真跑 ffmpeg——用 lavfi 合成的测试视频，不依赖外部文件）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { extractFrames, cleanupFrames } from '../frame-extract'

const VIDEO = join(tmpdir(), 'videoref-guard.mp4')
function tmpdir(): string { return '/tmp' }

beforeAll(() => {
  // 合成 2 秒 5fps 测试视频（20 帧）
  execFileSync('ffmpeg', [
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', VIDEO,
  ], { timeout: 30000 })
})

afterAll(() => {
  if (existsSync(VIDEO)) unlinkSync(VIDEO)
})

describe('extractFrames（真 ffmpeg 链路）', () => {
  it('按预算抽帧+保比缩放+元信息回带', async () => {
    const res = await extractFrames(VIDEO, { frames: 4, widthPx: 160 })
    try {
      expect(res.frames).toHaveLength(4)
      expect(res.durationSeconds).toBeGreaterThan(1.5)
      expect(res.widthPx).toBe(320)
      for (const f of res.frames) {
        expect(existsSync(f.framePath)).toBe(true)
        expect(statSync(f.framePath).size).toBeGreaterThan(100)
      }
      // 帧文件名等间隔序号
      expect(res.frames.map((f) => f.index)).toEqual([0, 1, 2, 3])
    } finally {
      cleanupFrames(res.outDir)
    }
  }, 60000)

  it('坏输入（非视频/不存在）如实抛错', async () => {
    await expect(extractFrames('/nonexistent.mp4', { frames: 2, widthPx: 320 })).rejects.toThrow()
  })
})
