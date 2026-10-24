---
name: hotspot-traffic-guard
description: Use when diagnosing macOS hotspot traffic and VPN routes.
---

# macOS 热点流量守卫

## Procedure

1. **先识别实际出口和隧道，不按进程名猜路径。**
   ```bash
   route -n get default | grep -E 'gateway|interface'
   scutil --nc list
   ifconfig -l
   for i in $(ifconfig -l); do
     ifconfig "$i" 2>/dev/null | grep -q '^\s*inet ' && echo "--- $i" && ifconfig "$i" | grep -E '^\s+inet '
   done
   ```
   记录默认路由接口、活动 VPN 服务、所有 `utun*` 接口及其地址。

2. **区分应用层直连与系统层路由。** 应用“直连”表示它没有调用应用代理；并不表示数据绕过 macOS 的 VPN/default route。只有同时核对代理配置、活动 VPN、默认路由和连接观测后，才描述请求经过哪个组件。

3. **以物理热点接口的增量作为运营商实际消耗量。** 在 macOS 上通常是 `en0`，但必须以现场路由和接口枚举为准。不要把 `en0` 与 `utun*` 的同一批字节相加；隧道封装会造成重复计数。进程日志、代理日志和模型 token 只能用于归因，不能替代物理接口计量。

4. **执行断开前先确认范围。** 若用户要切断“隧道流量”，优先停止已确认接管默认路由的具体 VPN 服务，而不是杀掉所有 Tailscale 或删除配置。对 Network Extension 服务使用：
   ```bash
   scutil --nc stop "<service-name>"
   ```
   必要时再清理残留默认路由；涉及 `sudo`、卸载系统扩展或永久禁用时先说明其持久性和影响。

5. **变更后立即验证闭环。** 至少复查：
   ```bash
   route -n get default
   scutil --nc list
   ifconfig <旧隧道接口>
   ```
   预期是默认路由回到热点网关（如 `en0`），旧隧道接口消失或不再承载默认路由。再做一次低成本连通性测试，确认直连仍可用。

6. **报告必须分层表达证据。** 明确区分“已观测”“推断”“未验证”；给出变更前后路由和服务状态。若只切断了 SFM/WARP 类 Network Extension，不要称为“切断 Tailscale Funnel”。

## Always-on rules

- **不要把 Tailscale Funnel 当作普通公网出站代理。** Funnel主要是入站暴露本机服务；没有连接证据时，不得声称模型请求通过 Funnel。
- **不要从隧道存在推断某个应用一定使用它。** 默认路由只能证明系统会把匹配流量交给该接口；归因仍需连接/日志或可重复的路由观测。
- **先确认组件身份再操作。** 同一台机器可以同时存在 Tailscale、SFM/WARP 和其他 `utun`；`utun9` 不是组件名称。
- **不要用累计接口总量直接声称“今天09:00后”的消耗。** 必须有09:00基线、采样时间和物理接口增量；缺少基线时只能报告当前累计值或说明无法精确切片。
- **停止 VPN 后仍要检查自动重连。** Network Extension 可能保持 `activated enabled`，断开状态不等于永久禁用；永久禁用需要单独的系统设置/权限步骤。
- **不主动停止与用户目标无关的本地代理、网关或 Tailscale。** 断开出口隧道不等于关闭 cc-switch、Hermes gateway 或本地决策服务。

## 热点省流操作（区域判定 + 后台 quiesce）

用户切到移动热点（蜂窝计费）时压低后台流量。本机已建机制，先查现有实现勿重复造：

- `~/.hermes/bin/network_zone.sh`：按**接口 IP 网段**判区域（家庭网段=白名单），输出 home/away/gated/offline 四态；`real` 参数绕过 gate marker 读真实网段。**禁按 SSID 字符串判**——终端侧 SSID 被 TCC 脱敏读不到明文，且用户改 Wi-Fi 名即失效。
- `~/.hermes/bin/hotspot_mode.sh [on|off|status]`：quiesce 总开关。DRYRUN=1 全链演练且不留 marker；ON 停下载类桌面 app + bootout 周期唤醒项 + 存档运行账本；OFF 按账本回灌恢复。
- `~/.hermes/bin/hotspot_patrol.sh`：时段内轮询巡检（launchd `ai.hermes.hotspot-patrol`，StartInterval=600s，2026-10-08）。仅 marker ON 时干活否则秒退；逐项复查 quiesce 清单，压停被偷跑拉活的进程/服务。编辑豁免：wpsoffice 有可见窗口（或 System Events 查询失败）跳过，且连带跳过 wpscloudsvr（主程序在用时压停其云服务徒劳，只会被立刻拉活）。全干净零日志防刷屏。HOTSPOT_PATROL_DRYRUN=1 演练。日志 `~/.hermes/logs/hotspot-patrol.log`。
- `~/.hermes/bin/en0_snapshot.sh`：落一条 en0 物理口基线快照（append）。已挂进 `hotspot_auto_dispatch.sh` 的 09 点 ON 与 22 点 OFF 分支——无 9 点基线则「今日9点后蜂窝消耗」无法精确切片（2026-10-08 补缺）。
- 定时自动化与夜间 loop 门禁契约见 nightly-loop-ops v3.5/v3.6（工作日 9-19 自动热点；workday 判定走节假日 API，调休补班日=工作日；API 失败降级为周一~五保守 ON——在家多关几小时下载 app 的代价小于蜂窝白烧）。

规则：

- **解除/恢复类决策读真实区域（`real`），禁读 gate 后的 marker 态**——gated marker 会掩盖真实 home，恢复分支变成永不触发的死代码。
- **quiesce 清单分两类处理**：launchd gui 域服务用 `launchctl bootout gui/501/<label>`，且 bootout 前判「在才停」（周期唤醒型项平时不在 gui 域）；App 自拉起的隐藏 helper 不在 launchd，只能先 pgrep 确认再显式 pkill。
- **网关/通信类服务禁入 quiesce 清单**：synapse 容器承载全集群 Matrix 网关（实测 25h 出口仅 ~16MB），停它掐断人机链路而流量收益趋零。每项入清单前先实测其真实流量。
- **gate 状态下夜间 loop 的 skip 路径也必须发 `full done` 心跳行**，否则存活看门狗误报（契约细节在 nightly-loop-ops）。
- **App 主程序会拉活其后台服务，quiesce 清单顺序不能只停服务名**：实测 2026-10-08 只 quit `wpscloudsvr`，4 秒后被仍在运行的 `wpsoffice` 主程序重新拉活。已把主程序排清单最前（hotspot_mode.sh `APPS="wpsoffice Thunder ..."`），主程序 quit 后其云服务随之停止；quit 前先 `count windows` 确认用户没在编辑。系统按需 appex（如 `recentfiles`）无窗口不主动联网，不入清单。
- 演练/真跑后**按账本还原现场**：桌面 app 用 open -a 重启，常驻服务按账本回灌，`status` 子命令验证终态。
- **进程级流量归因有两个静默盲区，归因缺口≠偷跑**：① `nettop -t external` 只覆盖应用态 socket——SFM/NetworkExtension 封装、内核态流量看不到，实测 120s 物理口 out=24MB 而进程级仅归因 0.9MB（96% 缺口）；② 走 `TUN`/VpnApi 的实现（如 clash）读流量计数为 0、连接不在 `ss -tnp`，进程级接口天然漏计。归因大额流量前先对齐「物理口双采样增量 vs 进程级增量」：缺口大 → 查隧道口（`netstat -ib` 取 `utun*`）与 `lsof -nP -i` 活跃连接。且**累计值大≠窗口内活跃**：对同一接口双窗差值≈0 说明该口当前静默，禁把累计值当窗口流量。

## References

- `references/routing-and-accounting.md`：默认路由、VPN/Funnel 语义与热点流量计量的判定表。
- `references/endpoint-identity.md`：ZCode 端点身份判定表（TLS 证书实探法、IP 段漂移、provider_config 解剖、PF 白名单局限）。
