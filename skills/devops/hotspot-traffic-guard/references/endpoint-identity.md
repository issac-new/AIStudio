# 端点身份判定表（2026-09-28 实测）

## 已实探的 ZCode 相关端点

| 端点/段 | 身份 | 判定依据 | 处置 |
|---|---|---|---|
| `open.bigmodel.cn` → 39.106.105.100, 47.94.131.76, 43.141.52.49 | BigModel/Zhipu API（阿里云 GA 动态调度） | dig +short；43.141.52.49 是 dnsv1 CDN 分发 | 白名单放行 |
| `api.kimi.com` → 103.143.17.156 | Kimi Coding Plan | dig 实测 A 记录；TLS 证书 `*.volcwaf001.com` WAF 前置 | 封禁 |
| `api2.sharkai.cc` → 154.222.22.169 | SRK 中转 | dig 实测 | 封禁 |
| `59.110.96.0/24`, `8.130.222.0/24`, `123.57.116.48` | **阿里云日志服务 `*.log.aliyuncs.com`** = ZCode 遥测/日志上传 | **TLS 证书实探**（`openssl s_client -connect ip:443` 看 subject/SAN），非 PTR | 封禁（热点下纯烧流量） |
| `111.206.191.0/24` | ZCode 会话/代码库同步类上传（~0.2MB/s 持续上行） | 2026-09-24 封 .150 后 09-28 观测到 .148 仍在用 → 必须封整段 | 封禁 /24 |
| `27.221.66.0/24`, `125.39.9.0/24` | certfallback-esa.com WAF 前置（Kimi/SharkAI 类） | TLS 证书 subject | 封禁 |
| `api.z.ai` / `zcode.z.ai` | ZCode 官方默认云端（Z.ai Coding Plan 通道） | ZCode 进程 env `ZCODE_BASE_URL=https://zcode.z.ai` | 视裁决：用 bigmodel 直连则封 |
| `token-plan-cn.xiaomimimo.com` | MiMo（小米） | provider_config | 已禁用 provider |

## 关键方法论

1. **判定端点身份用 TLS 证书实探，不用 PTR**（这些端点全都没有 PTR 记录）：
   ```bash
   echo | openssl s_client -connect <ip>:443 -servername <ip> 2>/dev/null \
     | openssl x509 -noout -subject -ext subjectAltName
   ```
   WAF 前置会返回 `*.volcwaf001.com` / `*.certfallback-esa.com` 这类 fallback 证书——
   看到它们说明背后是某个被代理的业务方（Kimi/SharkAI 类），不是端点本身的名字。

2. **IP 封禁要封段不封点**：ZCode 端点在同一段内漂移（.148→.150），单 IP 封禁会被绕过。

3. **白名单 IP 也会漂移**：`open.bigmodel.cn` 是阿里云 GA 动态调度。换网后 API 异常时
   先 `dig +short open.bigmodel.cn` 重新解析，更新锚点文件 `zcode_allow_bigmodel` 行。

## ZCode 供应商配置解剖（provider_config.json）

- 路径：`~/.zcode/v2/provider_config.json`（个人）+ `~/.zcode/v2/runtime/provider/.../zcode-builtin.json`（内置模板）
- 三个坑：
  1. `enabled` 字段缺省 ≠ 禁用。模板型 provider（如 xiaomi-mimo）没写 `enabled` 时默认启用，必须显式 `"enabled": false`。
  2. `providerOrder` 里排前面的 provider 是默认通道；切断上传要先看它排第几。
  3. 账号级模板（`providerId: "account:..."`）没有 enabled/api 字段，走账号绑定域名，不参与本表。
- 看运行中 ZCode 进程实际用的 BASE_URL：`ps -E -p <pid> -o command=` 后 grep `ZCODE_BASE_URL`/`ZAI_BUSINESS_BASE_URL`。

## PF 白名单模式局限

- PF 按目的 IP 过滤，**无法区分进程**：封 api.kimi.com 会挡掉所有应用。
- 进程级隔离需 LuLu / Little Snitch。
- 白名单模式下 default-drop 会误杀系统流量，所以 hermes-zcode-bigmodel-only 锚点
  用「已知端点点名封禁 + bigmodel 点名放行」而非 default-drop。
