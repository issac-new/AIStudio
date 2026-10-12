---
name: network-egress-attribution
description: Use when attributing macOS app traffic to network routes.
version: 1
author: orchestrator
license: internal
metadata:
  hermes:
    tags: [macos, networking, vpn, traffic, attribution]
    related_skills: [hotspot-traffic-guard, tailscale-funnel-exposure]
---

# macOS 出站流量归因

## When to Use

- 分析移动热点或物理网卡的流量消耗
- 判断应用直连、应用代理、VPN 隧道和 Tailscale Funnel 的关系
- 需要切断某个出口隧道但保留本地代理、网关和局域网服务

## Procedure

1. **枚举现场，不按产品名或 `utunN` 猜测。**
   ```bash
   route -n get default | grep -E 'gateway|interface'
   scutil --nc list
   ifconfig -l
   systemextensionsctl list
   ```
   把默认路由接口、已连接 VPN、隧道接口和系统扩展逐项对齐。

2. **分层判断“直连”。** 应用层直连只表示进程未使用应用代理；系统仍可能按 default route 将连接送入 VPN。只有核对默认路由、VPN 服务、代理配置和连接观测后，才对路径下结论。

3. **使用物理接口计量热点消耗。** 以承载热点网关的物理接口（常见为 `en0`）的两次字节快照差值计量；不要把物理接口和 `utun*` 相加，因为隧道封装会重复计数。进程日志、代理日志、token 统计只用于归因。

4. **切断已确认的具体服务。** 目标是出口隧道时，先停止接管 default route 的 Network Extension：
   ```bash
   scutil --nc stop "<service-name>"
   ```
   不要因看到 `utunN` 就停止所有 Tailscale 或删除配置；涉及永久禁用、卸载扩展或 `sudo` 时先说明持久性和影响。

5. **做闭环验证。** 变更后重新读取 `route -n get default`、`scutil --nc list` 和旧隧道接口；确认默认路由回到物理网关、目标服务变为 Disconnected、旧接口消失或不再承载默认路由。再做低成本公网连通性测试。

6. **按证据等级报告。** 分开写“已观测”“推断”“未验证”，列出变更前后路由。不要将“停止 SFM/WARP”表述为“停止 Tailscale Funnel”，除非确有 Tailscale Funnel 状态和连接证据。

## Always-on Rules

- Tailscale Funnel 是入站公网暴露能力，不是普通公网出站代理。
- `utunN` 只是动态接口编号，不能作为组件身份；用 `scutil --nc list`、系统扩展标识和路由归属确认。
- 没有 09:00 等时间基线时，不得声称“某时段流量”；只能报告当前累计值或明确无法精确切片。
- VPN 变为 Disconnected 不等于永久禁用；扩展仍可能是 `activated enabled` 并自动重连。
- 断开出口隧道不等于关闭 cc-switch、Hermes gateway 或本地决策服务。

## 历史窗口流量统计（「近 N 日用了多少流量」类问题）

系统层没有用户态可读的历史用量库：接口计数器只累计到本次开机，`/var/networkd/dbusage.db` 需 root（无免密 sudo 时视为不可得），NetworkExtension 的 `/var/db/com.apple.networkextension.tracker-info` 是 Patricia trie 二进制而非按天用量表（勿逆向）。回溯窗口一律走**应用层账本估算 + 物理口量级校验**：

1. **清点应用层账本**（无需 root）：cc-switch `~/.cc-switch/cc-switch.db` `proxy_request_logs`（LLM 代理流量）、zcode `~/.zcode/cli/db/db.sqlite` `model_usage`（LLM 直连流量）、代理软件自带账本（ClashX 类）。SFM/sing-box 系统扩展无 clash-api、容器目录为空——隧道侧无账本。
2. **按日聚合并折算字节**：token→字节估算系数：上行 ~3.5 B/token（fresh_input 与 cache_read 都走上行）、下行 ~4 B/token。Anthropic 式协议无服务端缓存复用，cache_read 常占输入 90%+ → LLM 流量结构性上行极重（实测上行占 99%），报「流量耗费」以上行为主。
3. **物理口量级校验**：`netstat -ib` 开机累计 Rx/Tx 与账本日均对比量级自洽即可；一般应用（媒体下载/网盘/微信）才是物理口大头，勿把账本数字说成整机流量。`nettop` 只能看活进程的增量计数，已退出进程无法回溯——历史窗口的进程级归因不可得，只能报「账本合计 vs 物理口总量」的差额区间并标注归因缺失，勿硬归因。
4. **拍基线快照**：`netstat -ib` 物理口计数 append 到 `~/hermes-docker-sandbox/workspace/net-usage/en0-snapshots.log`（已建立）；未来同窗问题用两次快照差值精确计量。系统级按日历史需自建 5min 级 cron 采样器。
5. **报告分实测/估算/不可得三层**：token 数是实测，字节是估算（写明系数）；系统层按日切片标「不可得」并写明原因；不得用开机累计值冒充近 N 日。

## References

- `../hotspot-traffic-guard/references/routing-and-accounting.md`：组件语义、路由判定和流量计量表（本 skill 目录无独立 references 文件，判定表在姊妹 skill 下）。
