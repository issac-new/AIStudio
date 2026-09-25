// overlay/custom/server/__tests__/zcode-projection-runtime.test.ts
// S5 守门：连接失败后的延迟重试不得产生悬浮 promise（unhandledRejection 崩进程）。
// 重试定时器里的 ensureConnected() 必须带 catch（失败已落 status 事件并再排下一轮）。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ZcodeProjectionRuntime } from '../zcode/projection-runtime'

describe('重连定时器（S5）', () => {
  it('连接失败后重排的重试 promise 被吞掉，不产生 unhandledRejection', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const home = mkdtempSync(join(tmpdir(), 'zcode-runtime-'))
    // 端口 1 无可监听服务：连接必失败；retryDelayMs=20 让重试定时器在测试窗口内触发多轮
    const runtime = new ZcodeProjectionRuntime({ homeDir: home, url: 'ws://127.0.0.1:1/ws', retryDelayMs: 20 })
    try {
      await expect(runtime.watchWorkspace('/w/x')).rejects.toBeTruthy() // 首连失败：调用侧可见
      await new Promise((r) => setTimeout(r, 150)) // 覆盖多轮重试定时器触发
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
      runtime.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })
})
