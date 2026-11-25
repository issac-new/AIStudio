/**
 * 服务端引用协议模块的唯一入口（批二，spec D3）。
 *
 * 协议模块 custom/client/chat/ekko-ui/protocol.ts 是纯 TS、无浏览器依赖，头注释写明
 * 可在 Node 中直接使用；上游服务端编译配置的 rootDirs 含 custom 目录，服务端打包是
 * 整体捆绑，所以这条相对引用在源码态与成品态都成立。
 *
 * 只许本文件 import 协议模块：服务端其他文件从这里取，避免相对路径散落各处。
 */
export {
  EKKO_UI_LIMITS,
  applySurfacePatches,
  catalogProjection,
  formatSurfaceTurnMessage,
  formatValidationErrors,
  surfaceDigest,
  validateSpec,
  type EkkoUISpec,
} from '../../client/chat/ekko-ui/protocol'
