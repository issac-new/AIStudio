// overlay/secaudit 域：对 API 暴露的目录（隐藏内部实现细节）。
import { SURFACE_CATALOG } from './catalog'

export function surfaceCatalogForApi() {
  return SURFACE_CATALOG.map((d) => ({
    class: d.class,
    name: d.name,
    focus: d.focus,
    manual: d.manual,
    hasCollector: d.collector !== undefined,
  }))
}
