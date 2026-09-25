// overlay vendored @zcode/rpc 最小面（2026-09-23 R4）。
// 源：upstream/zcode packages/rpc/src/（Apache-2.0，pin @872ad96），保持与上游逐字节一致。
// 收窄为宿主客户端所需导出。同步纪律：升级 zcode pin 时重拷 7 个源文件 + 本导出重生成。
// import 形态不变量见 channels.ts 头注释（相对 import 省略扩展名；迁移 ESM 前须回补）。
export { VSBuffer } from "./buffer";
export { Event, Emitter, CancellationToken, CancellationTokenSource, DisposableStore } from "./foundation";
export type { IDisposable } from "./foundation";
export { serialize, deserialize } from "./serialization";
export { SocketProtocol } from "./protocol";
export { ChannelClient } from "./channelClient";
export { ProxyChannel } from "./proxy-channel";
