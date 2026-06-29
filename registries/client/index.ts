// overlay/registries/client/index.ts
// A 类客户端注册中枢。extensions 调用这些 register 把自定义路由/导航/组件
// 收集起来,由 bootstrap 在 mount 前统一挂载。
import type { RouteRecordRaw } from 'vue-router'

export interface NavEntry {
  id: string
  label: string
  icon?: string
  section?: string
  onActivate?: () => void
}

const registry = {
  routes: [] as RouteRecordRaw[],
  navEntries: [] as NavEntry[],
  components: new Map<string, unknown>(),
}

export function registerRoute(route: RouteRecordRaw): void {
  registry.routes.push(route)
}

export function registerNavEntry(entry: NavEntry): void {
  registry.navEntries.push(entry)
}

export function registerComponent(name: string, comp: unknown): void {
  registry.components.set(name, comp)
}

export function getRegisteredRoutes(): RouteRecordRaw[] {
  return registry.routes
}

export function getRegisteredNavEntries(): NavEntry[] {
  return registry.navEntries
}

export function getRegisteredComponents(): Map<string, unknown> {
  return registry.components
}
