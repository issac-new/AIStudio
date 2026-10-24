---
name: tailscale-funnel-exposure
description: Use when 把本机服务经 Funnel 暴露到公网或切换 Funnel 指向.
tags: [tailscale, funnel, public-exposure, tunnel, https]
---

# Tailscale Funnel 公网暴露

Funnel 把本机一个端口发布为 `https://<tailnet-host>/`，**任何互联网用户可打开、无需装 Tailscale**。适合：邀请页、扫码绑定页、webhook 回调、给局域网外用户的临时入口。不适合直接暴露未鉴权的 admin 面。

## Procedure

1. `tailscale funnel status` —— 记录当前指向与原配置。**Funnel 是单映射：`tailscale funnel --bg <newport>` 会替换旧指向，原服务即刻公网失联**；把原恢复命令写进交付说明。
2. 盒点要暴露的服务：列出全部路由，标记 mutating/admin 端点。LAN 时代"仅约定本机"的路由不算鉴权——Funnel 一开全部直达。
3. 结构性隔离 admin：公网 listener 只挂公开路由（页面/只读 API）；admin API 拆到独立 listener 且显式 bind `127.0.0.1`。用 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 验证显示 `127.0.0.1:<port>` 而非 `*:`。
4. `tailscale funnel --bg <localport>` 发布。
5. 外网实测三件：公开路由 200；admin 路由 404（`curl -X POST https://<host>/admin/...` 打公网域名）；被替换的原服务状态已知会用户。
6. 发给外部用户的 URL 一律用 `https://<tailnet-host>/...` 公网域名——绝不发 `http://192.168.x.x` / `localhost`。

## Pitfalls

- macOS App Store（GUI）版 Tailscale 不支持 path 级 serving（`/foo` 子路径挂载被拒）——443 整机只能给一个本地服务；多服务需本地前置反代，再 funnel 该反代端口。
- 公网 DNS 边缘解析正常 ≠ 本地服务健康；验收必须端到端 curl 公网域名，不能只看 DNS。
- launchd 托管进程里对 funnel 域名发 HTTP 探测会超时，交互 shell curl 却正常——服务内选公网/局域网 base 用 DNS 解析判定（`socket.getaddrinfo(host, 443)`），勿发 HTTP 探测，否则健康公网被误判降级 LAN。
- 暴露后第一件事是攻击面自查：从公网把全部非预期路径（/admin、内部 API）curl 一遍确认 404，而不是只验正向路径通了就收工。

## 参考实现

- [已移除] 邀请服务双端口模式：`~/.hermes/bin/[已移除].py`（8660 公网仅页面+QR / 8661 仅 127.0.0.1 admin，公网 admin 实测 404）。配套 skill：`[已移除]-multitenant-family`。
