// P0 收敛(2026-09-28):locale 单一事实源化后,漂移守卫从"读 patch 文件"改为
// "读注入态词表"——语义更强(直接验证运行时状态,zh/en 成对)。
import zh from '@/i18n/locales/zh'
import en from '@/i18n/locales/en'

type Messages = Record<string, unknown>

function resolve(messages: Messages, dotted: string): unknown {
  let cur: unknown = messages
  for (const part of dotted.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Messages)[part]
  }
  return cur
}

/** 双语词表都存在该键(叶子 string 或子区块对象)时返回 true。 */
export function localeHas(dotted: string): boolean {
  return resolve(zh as Messages, dotted) !== undefined
    && resolve(en as Messages, dotted) !== undefined
}

export function expectLocaleKeys(domain: string, keys: string[]): void {
  const missing = keys.filter((k) => !localeHas(`${domain}.${k}`))
  if (missing.length > 0) {
    throw new Error(`词表缺键(zh/en 成对,注入态): ${missing.map((k) => `${domain}.${k}`).join(', ')}`)
  }
}
