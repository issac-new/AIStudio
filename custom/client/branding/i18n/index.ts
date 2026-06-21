// overlay/custom/client/branding/i18n/index.ts
// 运行时把各 locale 增量对象深合并进上游 vue-i18n messages(不写上游 locale 文件)。
// 增量对象由 scripts/extract-i18n-increments.mjs 从 migration-source 机械生成。
import type { App } from 'vue'
import { deExtended } from './de'
import { enExtended } from './en'
import { esExtended } from './es'
import { frExtended } from './fr'
import { jaExtended } from './ja'
import { koExtended } from './ko'
import { ptExtended } from './pt'
import { ruExtended } from './ru'
import { zhTWExtended } from './zh-TW'
import { zhExtended } from './zh'

const extended: Record<string, unknown> = {
  de: deExtended,
  en: enExtended,
  es: esExtended,
  fr: frExtended,
  ja: jaExtended,
  ko: koExtended,
  pt: ptExtended,
  ru: ruExtended,
  'zh-TW': zhTWExtended,
  zh: zhExtended,
}

export async function registerExtendedI18n(_app: App): Promise<void> {
  // i18n 实例由上游 i18n/index.ts 创建并 export;经 @/i18n alias 解析到上游。
  const { i18n } = await import('@/i18n')
  for (const [locale, ext] of Object.entries(extended)) {
    // mergeLocaleMessage 深合并:新增 key 加入,已有 key 的子对象合并,值覆盖生效。
    i18n.global.mergeLocaleMessage(locale, ext as Record<string, unknown>)
  }
}
