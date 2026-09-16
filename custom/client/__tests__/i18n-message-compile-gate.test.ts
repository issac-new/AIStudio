// i18n 消息编译守门：所有 locale 的每条消息必须能通过 vue-i18n 运行时编译器。
//
// 背景缺陷（2026-09-16 装机空白页根因）：patch 249 补的
// login.matrixUsernamePlaceholder 文案含裸 `@user:matrix.example.com`，
// vue-i18n 把 `@` 当链接消息语法（合法形态仅 `@:key` / `@.mod:key`），
// 运行时编译抛 INVALID_LINKED_FORMAT(code 10) → LoginView 渲染崩溃 → 整页空白。
// 文案里的字面 `@` 必须写成 vue-i18n 字面量转义 `{'@'}`。
//
// i18n-coverage 测试只验键存在，不验消息语法——本测试补这个维度：
// 用与上游 lockfile 相同的 @intlify/message-compiler（vue-i18n 传递依赖）逐条编译。
// 注意：baseCompile 的 onError 不传则错误被静默丢弃，必须显式抛出。
import { describe, it, expect } from 'vitest'
import { baseCompile } from '@intlify/message-compiler'

import ar from '@/i18n/locales/ar'
import de from '@/i18n/locales/de'
import en from '@/i18n/locales/en'
import es from '@/i18n/locales/es'
import fr from '@/i18n/locales/fr'
import ja from '@/i18n/locales/ja'
import ko from '@/i18n/locales/ko'
import pt from '@/i18n/locales/pt'
import ru from '@/i18n/locales/ru'
import zh from '@/i18n/locales/zh'
import zhTW from '@/i18n/locales/zh-TW'

const locales: Record<string, Record<string, unknown>> = {
  ar,
  de,
  en,
  es,
  fr,
  ja,
  ko,
  pt,
  ru,
  zh,
  'zh-TW': zhTW,
}

// 编译单条消息；抛错时返回错误描述，通过返回 null。
function compileOne(locale: string, key: string, msg: string): string | null {
  try {
    baseCompile(msg, { onError: (e) => { throw e } })
    return null
  } catch (e) {
    const code = (e as { code?: number }).code
    return `[${locale}] ${key} (code ${code}): ${msg.slice(0, 80)}`
  }
}

function* walk(obj: Record<string, unknown>, path: string[] = []): Generator<[string, string]> {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') yield [[...path, k].join('.'), v]
    else if (v && typeof v === 'object') yield* walk(v as Record<string, unknown>, [...path, k])
  }
}

describe('i18n 消息编译守门（INVALID_LINKED_FORMAT 空白页缺陷防复发）', () => {
  it('全部 locale 的每条消息都能通过 vue-i18n 运行时编译', () => {
    const failures: string[] = []
    for (const [locale, messages] of Object.entries(locales)) {
      for (const [key, msg] of walk(messages, [])) {
        const err = compileOne(locale, key, msg)
        if (err) failures.push(err)
      }
    }
    expect(failures, `以下 i18n 消息无法编译（裸 @ / 括号等语法问题，字面 @ 需转义为 {'@'}）：\n${failures.join('\n')}`).toEqual([])
  })

  it('matrix 用户名占位文案（空白页根因锚点）已使用字面量转义', () => {
    // 裸 @ 在 zh/en 均触发 code 10；转义后必须可编译。
    const zhLogin = (zh as Record<string, Record<string, string>>).login?.matrixUsernamePlaceholder
    const enLogin = (en as Record<string, Record<string, string>>).login?.matrixUsernamePlaceholder
    const zhUsers = (zh as Record<string, Record<string, string>>).users?.matrixUserIdPlaceholder
    const enUsers = (en as Record<string, Record<string, string>>).users?.matrixUserIdPlaceholder
    for (const [loc, msg] of [['zh', zhLogin], ['en', enLogin], ['zh', zhUsers], ['en', enUsers]] as const) {
      expect(msg, `${loc} matrix 占位文案应存在`).toBeTruthy()
      expect(compileOne(loc, 'anchor', msg!), `${loc} 文案不应含裸 @（当前值 ${msg}）`).toBeNull()
    }
  })
})
