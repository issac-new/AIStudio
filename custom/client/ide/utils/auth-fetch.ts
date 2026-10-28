// overlay/custom/client/ide/utils/auth-fetch.ts
// IDE 域 REST 调用的鉴权 fetch——2026-10-28 起实现收敛到 `custom/client/shared/http.ts`
// （baseUrl 拼接 + token + X-Hermes-Profile 单一实现）。本文件保留为兼容出口：
// 116 处既有 import 不改路径，行为随共享实现升级。
export { authFetch, apiUrl, shouldAttachProfileHeader } from '@/custom/shared/http'
