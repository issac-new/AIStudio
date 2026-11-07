// fixture 样本：捷径标记三种形态，供 check_adr §5 计数断言用。
// ① 有标记且有升级触发条件 → 入账，不计 no-trigger
// shortcut: 只支持 UTF-8 输入, 需要多编码时换 iconv 流
export function decode(buf: Uint8Array): string {
  return new TextDecoder("utf-8").decode(buf);
}

// ② 有标记但没写升级触发条件 → 计入 no-trigger（会静默腐烂）
// shortcut: 单进程内存缓存
const cache = new Map<string, string>();

// ③ 只有注释前缀、中间夹了正文提到约定 → 不入账（防正文误命中）
// 本节说明 shortcut: 这个保留字由 check_adr 机械采集
export function hit(key: string): string | undefined {
  return cache.get(key);
}

/* ④ 块注释形态，有逗号 → 入账，不计 no-trigger */
/* shortcut: 单实例锁, 多实例部署时换分布式锁 */
export const LOCK = true;
