// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadDraft, saveDraft, clearDraft, loadTemplates, saveTemplates,
  type DraftWorkItem, type A2uiTemplate,
} from '@/custom/cockpit/store/cockpit-kv'

// 内存 storage polyfill：vitest 3.x jsdom 默认 stub localStorage，手动装回
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
let saved: any
beforeEach(() => {
  saved = (globalThis as any).localStorage
  const s = new MemStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true })
})
afterEach(() => {
  if (saved === undefined) delete (globalThis as any).localStorage
  else (globalThis as any).localStorage = saved
})

const draft: DraftWorkItem = {
  id: 'w-t1', taskId: 't1', decision: 'conditional',
  riskTags: ['concurrency'], opinion: '需补用例', modifiedFiles: ['a.ts'],
}

describe('workitem draft', () => {
  it('loadDraft returns null when absent', () => {
    expect(loadDraft('t1')).toBeNull()
  })
  it('save/load roundtrip', () => {
    saveDraft('t1', draft)
    expect(loadDraft('t1')).toEqual(draft)
  })
  it('saveDraft merges partial onto existing', () => {
    saveDraft('t1', draft)
    saveDraft('t1', { opinion: '改了意见' })
    expect(loadDraft('t1')!.opinion).toBe('改了意见')
    expect(loadDraft('t1')!.riskTags).toEqual(['concurrency']) // 未变
  })
  it('clearDraft removes', () => {
    saveDraft('t1', draft)
    clearDraft('t1')
    expect(loadDraft('t1')).toBeNull()
  })
  it('save failure (quota) is swallowed', () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new DOMException('quota') }
    expect(() => saveDraft('t1', draft)).not.toThrow()
    Storage.prototype.setItem = orig
  })
})

describe('templates', () => {
  it('loadTemplates returns [] when absent', () => {
    expect(loadTemplates()).toEqual([])
  })
  it('save/load roundtrip', () => {
    const tpls: A2uiTemplate[] = [
      { id: 'tpl1', name: 'T', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [] },
    ]
    saveTemplates(tpls)
    expect(loadTemplates()).toEqual(tpls)
  })
})
