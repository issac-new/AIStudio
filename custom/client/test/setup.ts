import { vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 派单台账默认落 ~/.hermes-web-ui（真实数据）。测试未显式指定台账路径时改落一次性临时
// 文件，避免用例把派发结果写进真实台账（2026-11-24 实录：真实台账 3485 行里 3034 行是
// 测试写入的 /w/anywhere）。显式设置了 HERMES_WEB_UI_HOME 的用例沿用其隔离目录。
// 守门：custom/server/__tests__/zcode-engine-controller.test.ts「测试进程的派单台账不指向真实数据目录」。
if (!process.env.GOVERNANCE_DISPATCH_LEDGER?.trim() && !process.env.HERMES_WEB_UI_HOME?.trim()) {
  process.env.GOVERNANCE_DISPATCH_LEDGER = join(mkdtempSync(join(tmpdir(), 'aistudio-vitest-ledger-')), 'dispatch-ledger.jsonl')
}

// jsdom does not provide ResizeObserver. Components using chart/terminal sizing
// need the observer shape but not real layout measurements in unit tests.
if (!(globalThis as any).ResizeObserver) {
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
}

// Some upstream composables read localStorage at module evaluation time.
// Ensure a writable in-memory storage exists for all jsdom tests.
if (!(globalThis as any).localStorage) {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)) },
      removeItem: (key: string) => { store.delete(key) },
      clear: () => { store.clear() },
    },
  })
}

// jsdom does not implement matchMedia, used by theme composables.
if (typeof window !== 'undefined' && !(window as any).matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// jsdom has no real layout scrolling; components only need the method shape.
if (typeof Element !== 'undefined' && !(Element.prototype as any).scrollIntoView) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
}

// Most overlay component tests assert rendered structure, not translation plumbing.
// Provide a lightweight i18n mock for tests that mount components using useI18n
// without installing the i18n plugin.
vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<any>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, args?: Record<string, unknown>) => {
        if (args?.count !== undefined) return String(args.count)
        if (args?.n !== undefined) return String(args.n)
        return key
      },
    }),
  }
})
