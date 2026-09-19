// overlay/custom/__tests__/zcode-3140-snapshot.test.ts
// ZCode 3.14.0 词条快照完整性守门：快照文件（docs/superpowers/notes/zcode-3140/）
// 是 /ide 1:1 对照表的事实源产物，本测试断言其内部自洽（计数与键清单一致），
// 防手改/截断。真机漂移检测走 scripts/zcode-catalog-check.mjs（npm run catalog-check）。
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const NOTES = resolve(process.cwd(), 'docs/superpowers/notes/zcode-3140')
/** 快照基线：ZCode.app 3.14.0（asar IntlProvider 内嵌 zh-CN 目录） */
export const SNAPSHOT_BASELINE = { version: '3.14.0', keys: 6120, namespaces: 93, ipcChannels: 142 } as const

function loadKeys(): string[] {
  return readFileSync(resolve(NOTES, 'zh-CN-keys.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean)
}

describe('zcode 3.14.0 词条快照', () => {
  it('键清单与基线计数一致', () => {
    const keys = loadKeys()
    expect(keys.length).toBe(SNAPSHOT_BASELINE.keys)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('命名空间计数与键清单互洽', () => {
    const counts: Record<string, number> = JSON.parse(
      readFileSync(resolve(NOTES, 'ns-counts.json'), 'utf8'),
    ).zh
    const recomputed: Record<string, number> = {}
    for (const k of loadKeys()) {
      const ns = k.split('.')[0]
      recomputed[ns] = (recomputed[ns] || 0) + 1
    }
    expect(Object.keys(counts).length).toBe(SNAPSHOT_BASELINE.namespaces)
    expect(recomputed).toEqual(counts)
  })

  it('IPC 通道快照与基线计数一致', () => {
    const channels = readFileSync(resolve(NOTES, 'ipc-channels.txt'), 'utf8')
      .split('\n').map((l) => l.trim()).filter(Boolean)
    expect(channels.length).toBe(SNAPSHOT_BASELINE.ipcChannels)
    expect(new Set(channels).size).toBe(channels.length)
  })
})
