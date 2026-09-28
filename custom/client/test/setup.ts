import { vi } from 'vitest'

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
