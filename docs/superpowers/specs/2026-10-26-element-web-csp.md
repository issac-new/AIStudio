# element-web 真实账号验证收口：CSP wasm 放行（补丁 694）

- 日期：2026-10-26
- 分支：`fix/element-web-csp`
- 基线：main（挂账清偿批之后）
- 前批：`2026-10-26-cockpit-debt-completion.md`

## 修改

用户指出「本机有 swarm 账号」，补上前批误挂的 element-web 真实账号收发验证。验证过程中实锤一个部署链真缺陷并随批根治：

1. **补丁 694**：element-web 的 rust crypto（matrix-sdk-crypto wasm）在登录后实例化，被 studio 全局 CSP 的 `script-src 'self' 'unsafe-inline'`（无 wasm 源）以 `CompileError: WebAssembly.instantiateStreaming()` 拒绝。表现为登录 POST 200 但会话启动死锁：无 `/sync`、无 `/keys/upload`，有头无头同卡。修复仅对 `/element-web/` 路径的 script-src 追加窄 token `'wasm-unsafe-eval'`，其余路径与 CSP 其他指令逐字不变，不开整 eval。
2. 新增守门 `custom/server/matrix/__tests__/element-web-csp.test.ts`：断言路径分流实现存在、全文件不含 CSP 指令级 unsafe-eval、其余指令逐字不变。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| C1 | 用窄 token wasm-unsafe-eval 而非 dsh 网关先例的 unsafe-eval | 只放行 wasm 编译这一件事；element-web 不需要整 eval |
| C2 | 路径分流而非全局放行 | 主应用 self 脚本面不需要 wasm，最小加宽面 |
| C3 | 测试账号口令复位走 `PUT /_synapse/admin/v2/users`（admin 库内 token） | 手册测试账号口令已失效（testuser1/2 实际不在库，PUT 返回 201 证明是重建）；这是 studio admin-service.ts 自身钉死的正道 |
| C4 | 发现过程两个一次性拦截（well-known、auth_metadata）只用于定位，不进任何产品配置 | 本机没有 matrix.test 的 DNS；真实部署有该域名解析。CSP 缺 wasm 才是产品缺陷，两者分开 |

## 验证

- 守门：element-web-csp 2/2 绿（先红后绿）；failsoft 4/4、server-info 10/10 不回归。
- 补丁 694：全净态 clean→inject 重放全绿，series 含 694；重放后无 tracked 删除残留。
- CSP 分流实测：`/element-web/` 响应头 `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`，`/health` 等其余路径头逐字不变（零加宽）。
- **端到端（真实账号、双浏览器上下文，全部通过）**：
  - 账号 @testuser1/@testuser2:matrix.test（本机 Synapse 1.154.0，口令经 admin 库内 token + PUT v2/users 复位——手册口令已失效，PUT 返回 201 证明两账号原已不在库）。
  - A 在 element-web 密码登录 → 进入 API 预建房间 swarm-verify-* → 编辑框发送「驾驶舱验证消息 swarm-verify-<ts>」→ 本人时间线可见：通过。
  - B 另一浏览器上下文密码登录 → 同房间 → 收到该消息：通过。全程零页面错误。
  - 修复前同流程死于 wasm CompileError（登录 200 但无 /sync）；修复后 post-login 序列完整走通（capabilities/keys/sync 均到）。
  - 截图留档：/tmp/aistudio-elem-A-sent.png（发送侧）、/tmp/aistudio-elem-B-received.png（接收侧）。
- UI 自动化口径备注：element-web 1.12 房间列表用新 DOM（无 .mx_RoomTile 类），定位须按房间名文本；登录后有「设备验证」确认弹窗，词表须含 "I'll verify later"。本机无 matrix.test DNS，浏览器验证用上下文拦截补 well-known（真实部署有该域名解析，不进产品配置）。
- 修正前批口径：本机 Synapse 是 1.154.0（此前 versions 列表被截断误报 r0.5.0）；auth_metadata 404 与登录卡死无关（拦截补 200 也不通），真因是 CSP。

## 设计文档影响

DESIGN_SYNC: none。补丁只调整 `/element-web/` 路径的 CSP script-src 加宽一个 wasm token，属部署链缺陷修复，不改产品定位、导航、权限或数据结构。
