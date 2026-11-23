// overlay vendored @zcode/rpc 最小面（2026-09-23 R4；2026-11-23 同步至当前公开基线）。
// 源：upstream/zcode packages/rpc/src/（Apache-2.0，pin @fec97590），按 X3 形态归一化（相对 import 去 .js）。
// 有意收窄为宿主客户端所需导出（不与上游全量 index 对齐，守门单独断言本文件）。
// 同步纪律：升级 zcode pin 时重拷闭包 10 个源文件（buffer/foundation/serialization/protocol/
// channels.shared/channelServer/channelClient/delayedChannel/proxy-channel/channels）+ 本导出复核。
// import 形态不变量见 channels.ts 头注释（相对 import 省略扩展名；迁移 ESM 前须回补）。
export { VSBuffer } from "./buffer";
export { Event, Emitter, CancellationToken, CancellationTokenSource, DisposableStore } from "./foundation";
export type { IDisposable } from "./foundation";
export { serialize, deserialize } from "./serialization";
export { SocketProtocol } from "./protocol";
export { ChannelClient } from "./channelClient";
export { ProxyChannel } from "./proxy-channel";
