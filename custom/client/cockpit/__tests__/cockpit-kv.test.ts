// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadDraft, saveDraft, clearDraft, loadTemplates, saveTemplates,
  loadUserTodos, saveUserTodos,
  type DraftWorkItem, type A2uiTemplate, type UserTodo,
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
  it('template with score field saves and loads correctly', () => {
    const tpls: A2uiTemplate[] = [
      { id: 'tpl2', name: 'test', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [], score: 4 },
    ]
    saveTemplates(tpls)
    const loaded = loadTemplates()
    expect(loaded[0].score).toBe(4)
  })
})

describe('user todos', () => {
  it('loadUserTodos returns [] when absent', () => {
    expect(loadUserTodos()).toEqual([])
  })

  it('save/load roundtrip', () => {
    const todos = [
      { id: 'todo-1', date: '2026-06-23', title: '与团队同步', note: '下午3点', createdAt: Date.now() },
    ]
    saveUserTodos(todos)
    expect(loadUserTodos()).toEqual(todos)
  })

  it('save failure is swallowed', () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new DOMException('quota') }
    expect(() => saveUserTodos([{ id: 'x', date: '2026-06-23', title: 'x', createdAt: 0 }])).not.toThrow()
    Storage.prototype.setItem = orig
  })

  it('persist remindAt + reminded flags roundtrip', () => {
    const todos = [
      {
        id: 'todo-rem', date: '2026-06-25', title: '带提醒的待办', createdAt: Date.now(),
        remindAt: Date.now() + 10 * 60 * 1000, reminded15: false, reminded5: false,
      },
      {
        id: 'todo-fired', date: '2026-06-25', title: '已触发', createdAt: Date.now(),
        remindAt: Date.now() - 1000, reminded15: true, reminded5: true,
      },
    ]
    saveUserTodos(todos)
    const loaded = loadUserTodos()
    expect(loaded[0].remindAt).toBe(todos[0].remindAt)
    expect(loaded[0].reminded15).toBe(false)
    expect(loaded[1].reminded5).toBe(true)
  })
})
