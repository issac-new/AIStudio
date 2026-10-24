---
name: app-egress-restriction
description: Use when restricting app egress to a whitelist (config+PF).
version: 1
author: orchestrator
---
# macOS 应用出站限制（应用配置 + PF 白名单两层）

## When to Use

- 用户要求某应用（如 ZCode）只允许访问指定站点，其余上传/访问一律阻断
- 热点/计费流量下要掐断某应用的非必要出站（遥测、同步上传、非白名单 provider）

## Procedure

1. **先读应用自身的 provider/端点配置，再抓包。** 出站意图的第一证据是应用配置里的 enabled+baseUrl 列表（ZCode 为 `~/.zcode/v2/provider_config.json`）；连接观测只证明“连了”，配置才证明“会连”。改前备份 `.bak-<说明>`。

2. **归未知出站 IP 的身份，用 TLS 证书。**
   ```bash
   echo | openssl s_client -connect <IP>:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
   ```
   证书 CN/SAN 直接给出对端服务身份（遥测、CDN、WAF 前置），并据此决定封单 IP 还是 /24 段。`lsof -nP -a -c <进程> -iTCP -sTCP:ESTABLISHED` 只列连接，不证明对端是谁。

3. **配置层根治：禁用非白名单 provider，白名单排 providerOrder 首位。**
   - **陷阱：模板型 provider 无显式 `enabled` 键时视为启用。** 禁用必须显式写 `"enabled": false`；只重排顺序不改变其可拨号状态。
   - 配置层无需 sudo 且持久，是第一层；网络层只做兜底——只封网络面时应用会持续重试被封端点，刷日志且行为不可预期。

4. **网络层兜底：PF 锚点，免 root 先自检。** 规则稿写 `/tmp/<name>.anchor`，先跑 `pfctl -n -a <anchor名> -f <文件>`（exit 0 即语法通过，无需 root），再用 `scripts/install-pf-anchor.sh`（备份 pf.conf → 安装锚点 → 幂等追加引用 → `pfctl -n` 校验 → 加载）交用户一条 `sudo bash` 执行。

5. **验证闭环。**
   ```bash
   sudo pfctl -s labels | grep <label前缀>          # 命中计数
   lsof -nP -a -c <进程> -iTCP -sTCP:ESTABLISHED    # 剩余连接应只剩白名单 IP 与本地地址
   ```

## Always-on Rules

- **PF 按目的地址过滤、不分进程。** 封或放行一个端点影响本机所有应用；进程级限制需 LuLu/Little Snitch 类工具，写规则前向用户声明影响面。
- **sudo 不可用时禁止伪造凭据或把占位密码写进凭据文件。** 伪造的密码即使立即清除也已污染凭据信任；正确路径是产出幂等脚本 + 一条用户命令。
- **黑名单按 /24 段封禁防 IP 漂移，白名单只列精确 IP。** 同一服务会在同段内换 IP 继续连；放行面宁窄勿宽，动态调度的白名单域名换网后必须 `dig +short` 重解析并更新锚点。
- **不做 default-drop 全局白名单模式。** 全局默认丢弃会误杀系统与其他应用流量，且 PF 不分进程，影响面不可接受；锚点只列已知目标。
- **遥测/同步类端点是热点流量的大头且对用户不可见。** 证书实探（`*.log.aliyuncs.com` 类日志服务、会话同步上传段）比 token 统计更能定位“谁在烧流量”。

## References

- `references/zcode-egress-endpoints.md`：ZCode 出站端点清单、provider 配置层处置与验证命令。
- `templates/zcode-bigmodel-only.anchor`：bigmodel-only 白名单锚点模板（部署前 dig 重解析 IP）。
- `scripts/install-pf-anchor.sh`：幂等 PF 锚点安装脚本（需 sudo）。
