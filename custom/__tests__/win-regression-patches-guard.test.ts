// Windows 离线回归 P1 修复批补丁守门（2026-11-04，spec 2026-11-04-win-regression-p1-fixes）：
// 锁注入态 vendor 树含 744-749 六补丁的关键标记——series 漂移/漏注入即红
// （B 类补丁源层守门，先例：kanban-patch-409-guard 同套路）。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SERVER = resolve(__dirname, '../../vendor/hermes-studio/packages/server/src/modules/studio')
const CLIENT = resolve(__dirname, '../../vendor/hermes-studio/packages/client/src')

function readVendor(path: string): string {
  expect(existsSync(path), `${path} 在（未注入树先跑 npm run inject）`).toBe(true)
  return readFileSync(path, 'utf8')
}

describe('744：announcements 离线加固', () => {
  it('服务超时 6s + 控制器失败负缓存 60s', () => {
    const svc = readVendor(resolve(SERVER, 'services/notifications/announcements.ts'))
    expect(svc).toContain('AbortSignal.timeout(6_000)')
    const ctrl = readVendor(resolve(SERVER, 'controllers/announcements.ts'))
    expect(ctrl).toContain('ANNOUNCEMENT_FAILURE_TTL_MS')
    expect(ctrl).toMatch(/ANNOUNCEMENT_FAILURE_TTL_MS = 60_000/)
    // 负缓存命中时保持 502 语义（fetchAnnouncementsCached 抛错 → 控制器 502）
    expect(ctrl).toMatch(/if \(hit\.failure\) throw/)
    expect(ctrl).toContain("error: 'announcement_fetch_failed'")
  })
})

describe('745：update/preview/tags 超时收敛 + 失败负缓存', () => {
  it('git 4s / GitHub API 6s / 失败负缓存 60s', () => {
    const mgr = readVendor(resolve(SERVER, 'services/update/version-preview-manager.ts'))
    expect(mgr).toMatch(/timeout: 4_000/)
    expect(mgr).toMatch(/AbortSignal\.timeout\(6_000\)/)
    expect(mgr).toMatch(/PREVIEW_TAGS_FAILURE_CACHE_MS = 60 \* 1000/)
    expect(mgr).toContain('setTagsFailure')
    expect(mgr).toContain('getTagsFailure')
    // 两级超时不再回归到 8s/15s
    expect(mgr).not.toMatch(/timeout: 8_000/)
    expect(mgr).not.toMatch(/AbortSignal\.timeout\(15_000\)/)
  })
})

describe('746：petdex 离线加固', () => {
  it('控制器 try/catch 502 结构化 + 服务 6s + 失败负缓存', () => {
    const ctrl = readVendor(resolve(SERVER, 'controllers/petdex.ts'))
    const manifestAt = ctrl.indexOf('export async function manifest')
    expect(manifestAt).toBeGreaterThan(0)
    const seg = ctrl.slice(manifestAt, manifestAt + 900)
    expect(seg).toContain('petdex_fetch_failed')
    expect(seg).toMatch(/ctx\.status = 502/)
    const svc = readVendor(resolve(SERVER, 'services/pets/petdex.ts'))
    expect(svc).toMatch(/FETCH_TIMEOUT_MS = 6_000/)
    expect(svc).toMatch(/FAILURE_CACHE_TTL_MS = 60 \* 1000/)
    expect(svc).toContain('failureUntil')
  })
})

describe('747：files 打开 403 显式提示', () => {
  it('FileList 双击/铅笔与 FilesView 深链 catch 403 → 权限文案', () => {
    const list = readVendor(resolve(CLIENT, 'components/hermes/files/FileList.vue'))
    expect(list).toContain('handleOpenEditor')
    expect(list).toContain('isForbiddenError')
    expect(list).toMatch(/handleOpenEditor\(entry\)/)
    const view = readVendor(resolve(CLIENT, 'views/hermes/FilesView.vue'))
    expect(view).toContain("includes('API Error 403')")
    expect(view).toContain("t('files.openSuperadminRequired')")
    for (const locale of ['zh', 'en']) {
      const i18n = readVendor(resolve(CLIENT, `i18n/locales/${locale}.ts`))
      expect(i18n, `${locale} 缺 files.openSuperadminRequired`).toContain('openSuperadminRequired')
    }
  })
})

describe('748：locked-ips 403 权限说明', () => {
  it('AccountSettings 403 态替代「0 个 IP+重试」', () => {
    const comp = readVendor(resolve(CLIENT, 'components/hermes/settings/AccountSettings.vue'))
    expect(comp).toContain('locksForbidden')
    expect(comp).toContain('v-if="locksForbidden"')
    expect(comp).toContain('settings.lockedIps.superAdminOnly')
    for (const locale of ['zh', 'en']) {
      const i18n = readVendor(resolve(CLIENT, `i18n/locales/${locale}.ts`))
      expect(i18n, `${locale} 缺 lockedIps.superAdminOnly`).toContain('superAdminOnly')
    }
  })
})

describe('749：petdex 离线文案', () => {
  it('错误态离线友好文案 + 隐藏误导空筛选', () => {
    const comp = readVendor(resolve(CLIENT, 'views/hermes/PetdexView.vue'))
    expect(comp).toMatch(/t\('petdex\.offline'\)/)
    // 空筛选文案与筛选行都只在确有清单时渲染
    expect(comp).toMatch(/v-else-if="manifest" :description="t\('petdex\.empty'\)"/)
    expect(comp).toMatch(/v-if="manifest" class="filter-row"/)
    for (const locale of ['zh', 'en']) {
      const i18n = readVendor(resolve(CLIENT, `i18n/locales/${locale}.ts`))
      expect(i18n, `${locale} 缺 petdex.offline`).toMatch(/offline: '/)
    }
  })
})

describe('路由门：features.pet 关时 petdex 深链短路', () => {
  it('custom 路由表含同名重定向覆盖（不发 manifest 外部请求）', () => {
    const routes = readFileSync(resolve(__dirname, '../../custom/client/ia2/routes.ts'), 'utf8')
    expect(routes).toMatch(/features\.pet\s*\?[^:]*:\s*\[\{ path: '\/hermes\/petdex', name: 'hermes\.petdex', redirect/)
  })
})
