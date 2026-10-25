import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// overlay[bridge-stderr-capture]: guards the bounded capture log (rotation to .1
// at the cap, .1 overwritten on repeat rotation, batched flush). Regression for
// the unbounded ~/.hermes-web-ui/logs/bridge-stderr.log growth.
describe('agent bridge capture log', () => {
  let tempDir = ''
  let logPath = ''

  beforeEach(() => {
    vi.resetModules()
    tempDir = mkdtempSync(join(tmpdir(), 'hermes-agent-bridge-capture-log-'))
    logPath = join(tempDir, 'bridge-stderr.log')
  })

  afterEach(() => {
    vi.useRealTimers()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  async function loadCaptureLog() {
    return await import('../../packages/server/src/modules/hermes/services/bridge/manager')
  }

  it('caps the capture log at 5MB by default', async () => {
    const { BRIDGE_CAPTURE_LOG_MAX_BYTES } = await loadCaptureLog()
    expect(BRIDGE_CAPTURE_LOG_MAX_BYTES).toBe(5 * 1024 * 1024)
  })

  it('appends below the cap without rotating', async () => {
    const { createBridgeCaptureLog } = await loadCaptureLog()
    const log = createBridgeCaptureLog(logPath, 64)
    log.append('[stdout] one\n')
    log.flush()
    log.append('[stderr] two\n')
    log.flush()
    expect(readFileSync(logPath, 'utf-8')).toBe('[stdout] one\n[stderr] two\n')
    expect(() => readFileSync(`${logPath}.1`)).toThrow()
  })

  it('rotates to .1 at the cap and replaces the previous .1', async () => {
    const { createBridgeCaptureLog } = await loadCaptureLog()
    const log = createBridgeCaptureLog(logPath, 8)
    log.append('aaaaaaa\n') // exactly 8 bytes: first write stays below rotation
    log.flush()
    log.append('bbbbbbbb\n')
    log.flush()
    log.append('cccccccc\n')
    log.flush()
    // latest generation stays in the live file …
    expect(readFileSync(logPath, 'utf-8')).toBe('cccccccc\n')
    // … and only one rotated generation is kept (.1 overwritten)
    expect(readFileSync(`${logPath}.1`, 'utf-8')).toBe('bbbbbbbb\n')
  })

  it('batches appends and flushes on the interval timer', async () => {
    vi.useFakeTimers()
    const { createBridgeCaptureLog, BRIDGE_CAPTURE_LOG_FLUSH_INTERVAL_MS } = await loadCaptureLog()
    const log = createBridgeCaptureLog(logPath, 1024)
    log.append('one ')
    log.append('two')
    expect(() => readFileSync(logPath)).toThrow() // nothing on disk before the flush
    vi.advanceTimersByTime(BRIDGE_CAPTURE_LOG_FLUSH_INTERVAL_MS)
    expect(readFileSync(logPath, 'utf-8')).toBe('one two')
  })

  it('ignores empty appends', async () => {
    const { createBridgeCaptureLog } = await loadCaptureLog()
    const log = createBridgeCaptureLog(logPath, 1024)
    log.append('')
    log.flush()
    expect(() => readFileSync(logPath)).toThrow()
  })
})
