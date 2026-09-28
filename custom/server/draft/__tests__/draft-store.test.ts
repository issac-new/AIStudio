// 草稿恢复守门（minimax：2MiB 上限/原子写/恢复/清稿）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { clearDraft, draftDir, loadDraft, saveDraft } from '../draft-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'draft-'))
  process.env.HERMES_DRAFT_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_DRAFT_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('草稿（minimax 2MiB 原子写语义）', () => {
  it('存/恢复/清；无草稿=null', () => {
    expect(saveDraft('/w', 'composer', '我的草稿').ok).toBe(true)
    expect(loadDraft('/w', 'composer')).toMatchObject({ workspacePath: '/w', slot: 'composer', text: '我的草稿' })
    expect(loadDraft('/w', 'other')).toBeNull()
    expect(clearDraft('/w', 'composer')).toBe(true)
    expect(loadDraft('/w', 'composer')).toBeNull()
  })

  it('2MiB 上限拒存（草稿不是文档库）', () => {
    const huge = 'x'.repeat(2 * 1024 * 1024 + 1)
    const r = saveDraft('/w', 'composer', huge)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('2MiB')
    expect(loadDraft('/w', 'composer')).toBeNull()
  })

  it('原子写：目标文件是完整 JSON（无 .tmp 残留）', () => {
    saveDraft('/w', 'composer', '原子')
    const files = require('fs').readdirSync(draftDir())
    expect(files.filter((f: string) => f.includes('.tmp-'))).toEqual([])
    const rec = JSON.parse(readFileSync(join(draftDir(), files[0]), 'utf8'))
    expect(rec.text).toBe('原子')
    // 坏文件 fail-soft
    require('fs').writeFileSync(join(draftDir(), files[0]), '{bad', 'utf8')
    expect(loadDraft('/w', 'composer')).toBeNull()
  })
})
