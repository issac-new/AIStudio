// overlay/custom/server/simcenter/__tests__/frames.test.ts
// 帧图廊枚举（2026-10-19 产品走查批）：只认图片、跳过隐藏文件、before/after 解析、
// 递归分组、坏目录不抛错。取图的路径穿越闸由路由层 resolve+startsWith 双闸兜住。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { listFrameFiles } from '../simcenter-controller'

const root = mkdtempSync(join(tmpdir(), 'sim-frames-'))

afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('listFrameFiles — 帧图廊枚举', () => {
  it('递归枚举图片，解析步骤与 before/after，跳过非图片与隐藏文件', () => {
    mkdirSync(join(root, 'steps'), { recursive: true })
    writeFileSync(join(root, 'steps', 'uat_done-op1-before.png'), 'x')
    writeFileSync(join(root, 'steps', 'uat_done-op1-after.png'), 'x')
    writeFileSync(join(root, 'top.webp'), 'x')
    writeFileSync(join(root, 'capture-plan.log'), 'x')
    writeFileSync(join(root, '.DS_Store'), 'x')

    const files = listFrameFiles(root)
    expect(files.map(f => f.name)).toEqual([
      'steps/uat_done-op1-after.png',
      'steps/uat_done-op1-before.png',
      'top.webp',
    ])
    const before = files.find(f => f.name.endsWith('-before.png'))!
    expect(before).toMatchObject({ step: 'uat_done', phase: 'before' })
    const after = files.find(f => f.name.endsWith('-after.png'))!
    expect(after).toMatchObject({ step: 'uat_done', phase: 'after' })
    expect(files.find(f => f.name === 'top.webp')!.phase).toBe('unknown')
  })

  it('不存在的目录返回空数组（不抛错）', () => {
    expect(listFrameFiles(join(root, 'missing'))).toEqual([])
  })
})
