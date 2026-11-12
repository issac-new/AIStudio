// overlay[expdual] 存储测试：缺省空库、读写往返、坏文件不静默、缺字段归一。
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readDualStore, storePath, writeDualStore } from '../dual-store'
import { applyInduce } from '../dual-lifecycle'
import { emptyStore, type DualStoreShape } from '../dual-types'

const dir = mkdtempSync(join(tmpdir(), 'expdual-store-'))
const T = 1_700_000_000_000

afterAll(() => rmSync(dir, { recursive: true, force: true }))

beforeEach(() => {
  process.env.EXP_DUAL_STORE = dir
  rmSync(join(dir, 'dual-store.json'), { force: true })
})

describe('双轨台账存储', () => {
  it('文件缺席返回空库（不建文件）', () => {
    const store = readDualStore()
    expect(store).toEqual(emptyStore())
    expect(existsSync(storePath())).toBe(false)
  })

  it('写入后读回一致，且落盘为合法 JSON', () => {
    const store = applyInduce(emptyStore(), [
      { op: 'ADD', channel: 'fact', text: '目录是上游素材目录' },
    ], 1, T).store
    writeDualStore(store)
    const back = readDualStore()
    expect(back.rules).toHaveLength(1)
    expect(back.rules[0].id).toBe('f-1')
    expect(back.nextSeq).toEqual({ fact: 2, tip: 1 })
    expect(() => JSON.parse(readFileSync(storePath(), 'utf8'))).not.toThrow()
  })

  it('坏文件抛错而不是静默回落空库（不拿猜测覆盖现场）', () => {
    writeFileSync(storePath(), '{broken', 'utf8')
    expect(() => readDualStore()).toThrow()
  })

  it('缺字段的旧文件按默认值归一（chunk/nextSeq/各池）', () => {
    writeFileSync(storePath(), JSON.stringify({ rules: [{ id: 'f-9', channel: 'fact', text: 'x', count: 2, status: 'active' }] }), 'utf8')
    const store: DualStoreShape = readDualStore()
    expect(store.chunk).toBe(1)
    expect(store.nextSeq).toEqual({ fact: 1, tip: 1 })
    expect(store.retired).toEqual([])
    expect(store.blames).toEqual([])
    expect(store.rules).toHaveLength(1)
  })
})
