// overlay/registries/client/deeplink.ts
// 路径形态深链 → hash 形态迁移的判定（单一事实源）。
//
// 背景：本应用路由为 hash 模式，路径形态深链（/app/ide）冷启动时 hash 为空，
// 走登录落点链 → #/app → 驾驶舱首页恢复最近群聊房——深链目标永远到不了。
// run13 步18 帧采集实锤（2026-10-10）：/app/ide 拍出群聊房视图+无权限 toast。
// 旧版迁移只在带 query 时生效（修 ?task 丢参），不带 query 的裸路径深链仍断裂。
//
// 消费方：entry.mts（主落点，dev/运行时实际入口）。patches/368（upstream
// main.ts 直入口兼容）持同逻辑内联副本——改这里必须同步 368，守门测试
// deeplink.test.ts 锁行为。
export interface DeeplinkLocation {
  pathname: string
  search: string
  hash: string
}

/** router 模块 import 初始化会把 hash 写成 '#/'——这是「未导航」不是用户导航 */
function notNavigated(hash: string): boolean {
  return hash === '' || hash === '#' || hash === '/' || hash === '#/'
}

/**
 * 是否应把 pathname+search 迁移为 hash 形态（/#<pathname><search>）。
 * 规则：
 *  - 已导航（hash 有真路由）→ 不迁移
 *  - 根路径 '/'：带 search 仍迁移（登录 token 链 /?token=abc 旧语义保持），
 *    无 search 不迁移（登录流程原样）；'/index.html' 直访同不迁移
 *  - 其余未导航路径（带不带 query 都是）→ 迁移
 */
export function shouldMigratePathToHash(loc: DeeplinkLocation): boolean {
  if (!notNavigated(loc.hash)) return false
  if (loc.pathname === '/index.html') return false
  if (loc.pathname === '/' || loc.pathname === '') return loc.search.length > 1
  return true
}

/** 迁移目标的 hash 片段（#<pathname><search>）；不应迁移时返回 null */
export function hashDeeplinkTarget(loc: DeeplinkLocation): string | null {
  return shouldMigratePathToHash(loc) ? `#${loc.pathname}${loc.search}` : null
}
