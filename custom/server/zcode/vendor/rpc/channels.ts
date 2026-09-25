// overlay vendored @zcode/rpc · import 形态不变量（X3）：
// 本目录相对 import 一律省略扩展名（"./buffer" 而非 "./buffer.js"）。这是【有意
// 不变量】而非隐患——当前运行链是 ts-node CJS（require 解析自动补 .ts）与 vitest
// 转换链，省略形态合法；但 Node ESM 直跑即 ERR_MODULE_NOT_FOUND。迁移 ESM 前必须
// 回补全部扩展名，并同步更新守门测试
// custom/server/__tests__/zcode-vendor-rpc-import-form.test.ts（形态扫描断言）。
// 其余文件头部一行指针指回本注释；升级重拷 upstream 源文件后指针会被抹掉，
// 守门测试会 fail 提醒回放（勿绕过，回放指针即可）。
export * from "./channels.shared";
export { ChannelServer } from "./channelServer";
export { ChannelClient } from "./channelClient";
export { getDelayedChannel } from "./delayedChannel";
