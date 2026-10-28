---
name: stun-c2-detection
description: "STUN 协议伪装 C2 检测基线（Cling/ClingSTUN 实证）— 全零事务 ID Binding Request + 非标注册报文 + 不合规服务器指纹 + 高信誉源伪装(TTL差异) 四维网络检测规则，附 UDP 9034 orf; 入口检测、主机侧 .cling/wget 劫持工件与 YARA 规则。来源 Nozomi 一手报告（gap-20261007-005）。"
version: 1.0.0
author: "hack-auditor (gap-20261007-005 / t_d35e523f)"
license: MIT
metadata:
  hermes:
    tags: [stun, c2-detection, cling, clingstun, protocol-masquerading, covert-channel, rfc8489, iot-botnet, realtek-jungle, cve-2021-35394, network-detection, blue-team, detection-baseline]
    related_skills: [adcs-detection-baseline, bola-session-detection, agentic-soc-defense, pentest-methodology-fusion, scope-gate]
---

# STUN 协议伪装 C2 检测基线（stun-c2-detection）

> **版本**: v1.0.0（2026-10-20，gap-20261007-005 / t_d35e523f）
> **来源**: Nozomi Networks Labs《A STUNning Disguise: Cling Malware Masquerades as Google》（2026-10-01，一手抓取）；FreeBuf 504785（触发源，交叉验证一致）
> **证据**: gap_workspaces/gap-20261007-005/evidence/（e001 一手全文 / e002 转述 / e003 覆盖 grep 零命中 / e004 交叉验证）
> **markings**: TLP:GREEN/CLEAR

## 触发条件 / When to Use

- 网络流量审计/检测工程：识别把 C2 指令藏进 STUN transaction ID 的僵尸网络（Cling 及同构变体）
- IoT/嵌入式设备安全评估：核查 Realtek Jungle SDK CVE-2021-35394（UDPServer UDP 9034）暴露与利用链
- SOC 检测规则评审：验证 STUN 类协议完整性异常检测（全零 txid、非标报文）是否在覆盖范围内
- 红队 OPSEC 预判：使用 STUN/公共基础设施做流量伪装时，了解 Nozomi 指纹法如何暴露操作者服务器
- 事件响应：IoT 设备失陷排查（.cling / wget.r / wget.p / 33957 端口锁）

## 核心内容

### 1. 攻击链全景（四阶段）

```
初始访问          传播              持久化              C2（STUN 伪装）
CVE-2021-35394 → 8×CVE 扫描利用 → init 脚本 + wget 劫持 → 13×STUN 服务器
UDP 9034 `orf;`   (Realtek/LB-LINK/ (inittab/rcS/rc.boot,  全零 txid 轮询
shell 注入        TBK/Linksys/Eir/  /root/.cling,         + 注册报文(感染标签)
                  FiberHome/MVPower) wget.r/wget.p)        + txid 字段承载指令
```

**入口（CVE-2021-35394）**：Realtek Jungle SDK v2.0–3.4.14B 诊断组件（常编译为 UDPServer 二进制，监听 UDP 9034）。攻击者发送以 `orf;` 开头的 UDP 数据报，后跟 shell 命令。典型载荷：BusyBox wget 下载 MIPS(mipsel) 二进制 → chmod +x → 以感染方法标签（如 `realtek.selfrep`）为 argv[1] 启动。CVSS 9.8，2021-08 已修，CISA KEV 老条目，但嵌入式设备常年不修持续在野利用（2026-09-05 起再激增）。

**内嵌 8 条传播 CVE**：CVE-2014-8361（Realtek miniigd）/ CVE-2016-10372（Eir D1000）/ CVE-2016-20016（MVPower DVR）/ CVE-2023-26801（LB-LINK）/ CVE-2023-41011（FiberHome SR1041F + 中国移动 HG6543C4）/ CVE-2024-3721（TBK DVR）/ CVE-2025-34037（Linksys）/ CVE-2026-87827（KGUARD DVR，Fortinet 补充）。

### 2. STUN C2 四步通信流（检测规则锚点）

RFC 8489 合规行为 vs Cling 偏差对照（这是全部网络检测规则的根基）：

| 步骤 | 合规 STUN（浏览器/WebRTC） | Cling 实际行为 | 检测规则 |
|---|---|---|---|
| ① 轮询 | 事务 ID 随机 96 bit，按需发送 | **全零 txid**，13 服务器 × 每 ~5s 固定节奏 | R1 |
| ② 端口映射 | 收 Binding Success Response 即用 | 记录各服务器观测到的映射端口 | — |
| ③ 注册 | 无此概念 | **非标 UDP 报文**（含 argv[1] 感染标签 + 映射端口清单）发往 STUN 端口 | R2 |
| ④ 指令接收 | 无此概念 | Binding Success Response 形态的包，**12 字节 txid 字段编码指令+参数** | R3 |

### 3. 检测规则（R1–R6，按 Nozomi 报告锚点蒸馏）

**R1 全零事务 ID 轮询（核心规则，最高优先）**
- 信号：同一源向 ≥N 台 STUN 服务器（3478/19302 端口）以固定周期（~5s）发 Binding Request，且 txid 字段 12 字节全 0x00
- 依据：RFC 8489 §6（事务 ID 必须密码学随机）；合法客户端全零概率可忽略
- FP 排除：个别实现质量差的客户端可能重用 txid，但不会全零+固定节奏+多服务器并发
- Suricata 形态（示例）：`alert udp $HOME_NET any -> $EXTERNAL_NET [3478,19302] (msg:"STUN Binding Request all-zero transaction ID (Cling-style C2)"; content:"|00 01|"; depth:2; content:"|00 00 00 00 00 00 00 00 00 00 00 00|"; offset:8; ...)` — STUN 头：type(2B)+len(2B)+cookie(4B)+txid(12B)，cookie 固定 0x211944A4 小端…（注意字节序：STUN msg type 0x0001 Binding Request，magic cookie 21 12 A4 42 网络序）

**R2 非标注册报文（发送到 STUN 端口但非 STUN 报文）**
- 信号：发往 STUN 服务器 3478 端口的 UDP 载荷首字节不是合法 STUN msg type（0x0001/0x0101/0x0011/0x0111 等），且载荷含 `.selfrep` 或 `selfrep.router` 类标签 + 端口清单
- 依据：Cling 注册报文不符 STUN 规范，合规服务器静默丢弃；这是最直接的行为签名
- 注：载荷结构未公开到字段级（Nozomi 仅 Figure 9 截图），规则以「STUN 端口+非 STUN 载荷+感染标签串」三元组近似

**R3 不合规 STUN 服务器指纹（主动探测法）**
- 信号：向服务器发正常 Binding Request（随机 txid），响应的 txid 为全零而非回显请求 txid
- 依据：Binding Success Response 必须回显请求 txid（RFC 8489 §6.3.1）；回全零 = 为 bot 流量定制的服务器 = 操作者基础设施
- 用法：对资产清单中的 STUN 依赖做主动指纹（Nozomi 用此法定位 145.249.115.184，并用「不相交端口集注册」实验确证勾结——仅向该服务器通告的端口数小时后收到 C2 指令）
- FP 排除：需排除极老旧/劣质 STUN 实现；结合 R4 佐证

**R4 高信誉源伪装（TTL 差异法）**
- 信号：来自 74.125.250.129（stun.l.google.com）等高信誉 STUN IP 的「响应」，其 IP TTL 与该 IP 真实响应的基线 TTL 不一致（差值>阈值）；且包内 txid 非本机请求的回显
- 依据：UDP 单向无握手，操作者借未做 RFC 2827 源地址验证（SAV）的 ASN 伪造源 IP；Nozomi 观测到合法响应与指令包 TTL 恒定差异
- 用法：对高信誉 STUN 基础设施流量做 TTL 基线化监控（被动）；关键在「本机未发对应 txid 请求却收到该源响应」= 未 Solicited 响应检测
- FP 控制同一 ASN 多路径 TTL 抖动，需基线化

**R5 入口利用检测（UDP 9034 orf; 注入）**
- 信号：入站 UDP 9034 载荷以 `orf;` 开头且后随 shell 元字符（`;/|&\`$()` + wget/chmod/busybox 命令词）
- 依据：CVE-2021-35394 利用签名，多数扫描器共用此前缀
- 姊妹规则：本机对 118.45.196.225:800 / 120.193.219.210:800 / 58.211.144.243:800 / 121.32.243.81:1337 loader 主机的出站连接（IoC）

**R6 主机侧工件（IoT/嵌入式巡检清单）**
- 文件：`/root/.cling`、`/usr/local/bin/.cling`
- init 持久化：`/etc/inittab`、`/etc/init.d/rcS`、`/etc/rc.d/rc.boot` 出现 `.cling` 引用
- wget 劫持：wget 旁出现 `wget.r`（被移走的原程序）与 `wget.p`（记录原路径）——扫 /bin /sbin /usr/bin /usr/sbin /usr/local/bin
- 网络锁：SO_REUSEADDR 绑定 TCP/UDP 33957（单实例检查）
- UA：`User-Agent: clingwashere`

**YARA（Nozomi 原版，可直接用）**
```yara
rule IOT_WORM_Cling_sample
{
meta:
  name = "Cling - WORM"
  author = "Nozomi Networks Labs"
  description = "Detects multiple Cling variants"
  tlp = "clear"
  date = "2026-09-17"
  hash1 = "90d738a8d650e3fefda9d7efa4baa11bd89ab05fcf0eb173e04aa01a52b465e2"
  hash2 = "3a6927a3399f2a10bb2e2229482e5096e5f1c3401a87f7f1730db11243531e28"
strings:
  $s1 = ".selfrep"
  $s2 = "User-Agent: clingwashere"
  $s3 = "/.cling\x00"
  $s4 = "mount --bind /tmp /proc/%d"
  $s5 = "POST /picsdesc.xml"
  $scan_ports = { 50 00 90 1F 55 00 61 EA 51 00 58 00 }
  $cmd_dispatch = { FF FF 42 24 FF 00 42 30 08 00 43 2C ?? ?? 60 10 80 10 02 00 }
  $stun_magic = { 12 21 04 3C ?? ?? 99 8F 42 A4 84 34 }
condition:
  uint32(0) == 0x464C457F and
  filesize < 1MB and
  3 of them
}
```

### 4. 13 台 STUN 服务器清单（IoC，含操作者服务器）

```
74.125.250.129:19302   (stun.l.google.com 解析地址；也是伪造源)
145.249.115.184:3478   ← 操作者控制（回全零 txid 指纹确认）
216.93.246.18:3478
85.17.88.164:3478
77.72.169.213:3478
77.72.169.211:3478
5.39.72.109:3478
81.187.30.115:3478
212.227.67.34:3478
212.227.67.33:3478
207.38.82.134:3478
83.211.9.232:3478
212.53.40.43:3478
```
（报告发布时 VirusTotal 全清洁、多数在公共 STUN 列表中——信誉失效的实证，不可按 IP 信誉封禁解决）

### 5. 样本与 loader IoC

- SHA1：`3b0ac6aaabb3bf8058ca14f9c8ccc613cfa3ea71`（mips，主分析样本）、`08636d09d9ffd1713bd6bcb965ad40b6ce3de1aa`（mips）
- loader：`http://118.45.196.225:800/mipsel`、`http://120.193.219.210:800/mipsel`、`http://58.211.144.243:800/mipsel`、`http://121.32.243.81:1337`（scan-and-exploit 载荷源）

### 6. ATT&CK 映射（检测规则↔技术对照）

| ATT&CK | 技术 | 对应检测规则 |
|---|---|---|
| T1190 | Exploit Public-Facing Application（CVE-2021-35394 入口） | R5 |
| T1059 | Command and Scripting Interpreter（shell 下载执行） | R5 |
| T1037 | Boot or Logon Initialization Scripts（inittab/rcS/rc.boot） | R6 |
| T1574 | Hijack Execution Flow（wget 替换） | R6 |
| T1095 | Non-Application Layer Protocol（UDP 承载指令） | R1/R2/R3 |
| T1572 | Protocol Tunneling（TCP 隧道指令） | 指令集 |
| T1090 | Proxy（proxy relay 指令） | 指令集 |
| T1046 | Network Service Discovery（scan-and-exploit） | 指令集 |
| T1498.001 | Network DoS: Direct Network Flood（flood 指令） | 指令集 |

### 7. 审计/猎杀清单（hack-auditor 主场用法）

1. **暴露面核查**：资产清单中 Realtek 系路由/AP/中继器/DVR 是否暴露 UDP 9034（shodan/fofa 语法 `product:"Realtek Jungle SDK"` 或端口指纹）
2. **协议完整性异常监控**：SOC 是否具备 STUN txid 合规性检查能力（R1）——多数 IDS 默认规则集 0 覆盖
3. **未 Solicited 响应检测**：对高信誉基础设施（Google/Cloudflare STUN）做 TTL 基线化（R4）
4. **主动指纹**：对依赖的第三方 STUN 服务发受控 Binding Request，核响应 txid 是否回显（R3）
5. **主机侧巡检**：IoT 网段设备逐台查 R6 工件（嵌入式设备无主机遥测，网络层是唯一可行面）
6. **不按 IP 信誉放行**：本案例 13 服务器 VT 全清洁——协议行为>IP 信誉的检测哲学宣导点

### 8. 红队 OPSEC 视角（hack-exploit 主场用法）

- 若在授权测试中借用公共协议（STUN/TURN/ICE/NTP/DNS）做 C2 通道：固定周期+全零/固定 txid 是最强行为签名，操作者服务器可被 R3 指纹法反向定位（Nozomi 正是这样确认 145.249.115.184 的）
- 借用高信誉 IP 做源伪装依赖上游 ASN 的 SAV 缺陷，TTL 异常是被动检测锚点
- wget 劫持虽隐蔽（合法进程触发），但 wget.r/wget.p 工件对文件完整性监控可见

## 与其他 skill 的联动

| Skill | 联动方式 |
|---|---|
| `adcs-detection-baseline` | 同构方法论：一手报告→检测规则蒸馏（Windows 事件日志 vs 网络协议层） |
| `bola-session-detection` | 同为 detection-baseline 任务类型，web/api vs network/protocol 补位 |
| `agentic-soc-defense` | 六道防线视角下 STUN C2 属「协议完整性校验」防线缺口 |
| `intranet-penetration-sop` | 内网渗透遇 IoT 设备（摄像头/路由器）时的入口评估参考（CVE-2021-35394 等 8 CVE） |
| `pentest-methodology-fusion` | Finding 映射 ATT&CK ID + 检测概率评估框架 |

## 局限与未测清单

- R1–R4 为报告蒸馏规则，未在自建流量环境实跑验证（规则语法级给出 Suricata 形态示意；字段级载荷结构 Nozomi 未完全公开）
- 注册报文（R2）内部字段结构未公开，规则以三元组近似
- Cling 指令编码格式（txid 12 字节如何编码 8 类指令）未公开，无法写指令解析器
- 多架构样本（Fortinet 报告的 ARM/x86 等）未逐个分析
- 验证路径（后续卡可承载）：自建 STUN C2 模拟环境（python socket + RFC 8489 帧）复现 R1/R3 检测规则并测 FP 率
