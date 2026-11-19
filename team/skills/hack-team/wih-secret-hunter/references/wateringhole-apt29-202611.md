# 水坑/第三方 JS 投毒案例锚定 — Sekoia APT29 移动端 n-day 水坑（2026-11）

> 来源：夜间差距卡 t_4e7797f3 / gap-20261105-001（2026-11-13 融合）。
> 一手源：Sekoia TDR《Poisoned Source: APT29 watering holes target mobile devices with n-day exploits》
> https://www.sekoia.com/blog/poisoned-source-apt29-watering-holes-targets-mobile-devices-with-n-day-exploits
> （Published 2026-11-04T17:33Z；本地存档 gap_workspaces/gap-20261105-001/evidence/sekoia_poisoned_source.md）
> 中文编译源：FreeBuf 510748（https://www.freebuf.com/news/510748.html）。
> 证据等级：observed（Sekoia 一手技术分析 + Google TAG 交叉确认）。

## 事件一句话

APT29（Cozy Bear / Midnight Blizzard，SVR 系，**中-高置信度**归因）运营大规模水坑：
通过「直接注入合法站点 / AiTM 反代高仿真域名 / 污染第三方统计脚本」三类向量，
零点击投放纯 n-day 移动 exploit 链（无任何 0-day），从 iOS/Android 窃取 Cookie、
Wi-Fi 密码乃至全机数据。**全部漏洞在活动前已修补——设备保持更新即免疫。**

## 三类感染向量

1. **直接注入**：合法站点主模板或既有 JS 库尾部插入 `window.onload` → `createElement('script')` 动态加载投递域脚本（乌克兰天然气公司、美国化工行业协会、保加利亚军事站点、欧洲极右政党站点）。
2. **AiTM 反代高仿真域**：注册 lookalike 域反向代理真站并实时改 HTML 注入。案例：`america250[.]holiday`（代理 america250.org，美国建国 250 周年官网）；`theowo[.]club`（代理伦敦 Old War Office 的 Raffles 酒店——近英国国防部/唐宁街 10 号，泽连斯基 2026-10-14 曾入住）。
3. **供应链投毒**：污染乌克兰 **Plerdy SEO 统计**（`a.plerdy[.]com/public/js/click/main.js`），**2026-08-27 ~ 09-03 一周窗口**内波及数千站点（多为乌克兰站，含军队/特种部队/军备/UAV 站点）——同一脚本同时加载正规 Plerdy 与攻击者指纹脚本。

## 投递管线（UltimateFingerprinter）

- 注入代码加载 `5b4c8fea5cbcee273e8d830f52-temfp.js`（UltimateFingerprinter，固定文件名跨受害者一致）。
- **反 LLM 分析技巧**：恶意脚本附在 **2.3MB 压缩 AngularJS 尾部**，死代码占 98%——评估目的为**撑爆 LLM 上下文窗口**阻碍自动分析，或伪装成知名库。⇒ 反制：纯规则引擎（本 skill）不受影响；LLM 分析必须 tail-N-KB 分块 + 与纯净库 diff 后只看增量。
- 61 个收集器产出 **394 字段 JSON** 指纹 POST 到 `/api/<nonce>/v1`；服务端命中目标画像则**响应体即 exploit JS**，客户端 `script.text = await res.text()` 直接执行——**零点击**。
- 交付门极弱：仅 3 字段可拦截（screen 宽高非手机尺寸 / `navigator.maxTouchPoints==0`）——Sekoia 即用伪造浏览器画像拉回全部三条链。
- `edge-ord.clouds-stacks[.]com` 为 HTTP 负载均衡器，重定向至 ads-it-assets / cdn.adv-static / wpvortex-mod / assets-int 等。

## 三条 n-day exploit 链（全部已修补，无 0-day）

| 链 | 目标 | CVE（按阶段） | 窃取物 |
|---|---|---|---|
| A | iOS 16.7（实际可用 16.0-17.4） | CVE-2025-43529(WebKit RCE，同泄露 DarkSword kit 重实现；死代码残留 CVE-2024-27808/27833) → CVE-2024-27834(PAC bypass) | 跨 App `Cookies.binarycookies`（PID 扫描 sandbox_container_path_for_pid + cook magic 识别） |
| B | iOS 18.5（=DarkSword 全链） | CVE-2025-43529 → CVE-2026-20700(PAC) → CVE-2025-14174(sbx0)+CVE-2025-43510(sbx1) → CVE-2025-43520(kernel R/W)；备用 CVE-2025-31277/CVE-2025-24201 未启用 | 全机：sms.db/iMessage、Mail、WhatsApp/Telegram 库、Keychain、Accounts3.sqlite、wifi_passwords.txt、通讯录/通话/日历/备忘录/Safari History、locationd、健康、相册、iCloud Drive |
| C | Android Chrome 139-145（剔除 143） | CVE-2026-3910(renderer RCE) → CVE-2025-27038(Adreno GPU 沙箱逃逸；检测到 SM-S938B/Galaxy S25 Ultra 即中止) | Chrome Cookies/Login Data/History + WifiConfigStore.xml（AndroSnitch，libexploit.so 16 函数，libcurl 外传） |

- 防重放标记：`VDGH_TOKEN_REF` cookie（硬编码值；过期计算写错 `days=1` 实际 1 分钟）。
- 外传端点统一：`ad.starx-net[.]com:8881/telemetry/v12`；AndroSnitch 请求头固定 `Filename` + 硬编码 `X-Device-Id`。
- **采购指纹**：投递门只筛 iOS 16.7/16.7.10，但链实际覆盖 16.0-17.4——版本门与利用能力错配 ⇒ 第三方采购 exploit 未定制的旁证（与 Google TAG「CSV→APT 复用」结论互证：DarkSword 疑为商业监控供应商开发，2026-09 上传 VT；2024 年 APT29 蒙古政府水坑同框架同目标（cookie 窃取））。
- 无持久化：纯数据收割后退出。

## IOC（TLP:CLEAR，Sekoia 公开部分）

| 类型 | 值 | 备注 |
|---|---|---|
| 域名 | static.flux-telemetry[.]com 109.104.106[.]107 AS395092 | 投递 |
| 域名 | edge-ord.clouds-stacks[.]com 95.133.231[.]28 AS219399 | 投递负载均衡 |
| 域名 | ad.starx-net[.]com 195.58.140[.]105 AS395092 | 外传 :8881/telemetry/v12 |
| 域名 | adsprism-stat[.]com | america250.holiday 投递 |
| 域名 | ads-it-assets / cdn.adv-static / wpvortex-mod / assets-int[.]com | 重定向下游 |
| 假站 | theowo[.]club(188.190.17.232 AS57169 EDIS) / america250[.]holiday(192.121.46.25 AS9009 EDIS) | AiTM 反代 |
| 关键哈希 | a7d2493d…(A-1) bee3e014…(A-2) c170fda0…/2ffb35e3…/69b6cb32…(B) 29d283eb…/06c17b31…(C-JS) 183d62d6…(C-27038) 387a7fb7…(AndroSnitch) | 全表见一手报告 IOC 节 |
| 文件特征 | `5b4c8fea5cbcee273e8d830f52-temfp.js` / `-temfp.js` 后缀 / `VDGH_TOKEN_REF` | 已入 wih_rules.yml |

（完整哈希/受染站点/YARA 在 Sekoia CTI，TLP:AMBER 需申请——本文件只录公开部分。）

## 集群检测接线

- **wih_rules.yml**（v1.1.0+）：`wateringhole_ioc_domain` / `wateringhole_vdgh_token` / `wateringhole_temfp` 三规则——对授权范围内站点 JS/页面扫描，命中=投毒 Candidate。
- **site_drift_monitor.py**：对重点资产做基线漂移监控，第三方统计脚本突变（simhash 距离>3）即告警——Plerdy 式投毒在页面层的表现。
- **判定纪律**：规则命中仅 Candidate，须人工回源（diff 纯净库 / VT / 域名 WHOIS）确认后才入 findings。

## 与集群既有能力的关系（去重对照）

- n-day 补丁差分方法论：`patch-diff-exploit`（S4b 判据）已覆盖——本案例可作其「已修补≠已免疫落后设备」的实例引用。
- CSV exploit 复用：Google CTI DarkSword 链博客（https://cloud.google.com/blog/topics/threat-intelligence/darksword-ios-exploit-chain）与 TAG 2024 报告为本案例上游文献。
- 反 LLM 填充：llm-redteam 的 Red-Evo 参考文献覆盖「攻击者视角上下文耗尽」，本案例提供**防御侧分析管线反制**实例（规则优先 + tail 分块）。

## KEV 收录后记（2026-11-14 补记，TLP:CLEAR）

- **CVE-2024-27834（链 A 的 PAC bypass 环节）2026-11-04 被 CISA 收入 KEV**（KEV JSON catalogVersion 2026.11.13 一手核验：dateAdded 2026-11-04 / dueDate 2026-11-18 / knownRansomwareCampaignUse=Unknown），距 Sekoia 披露仅 1 天；THN 2026-11-05 报道。CVSS 仅 5.5、2024-05 已修、Pwn2Own Vancouver 2024 原始演示——**在野利用使 18 个月前的「已修补链使能组件」重回强制修复清单**。
- 执法框架换代：KEV 条目 requiredAction 直接引用 **BOD 26-04**（supersedes and revokes BOD 19-02/22-01）：KEV∧公网暴露∧total impact 门控、显式时限取代 CVSS 标签、<3 天阈值判定 + 48-72h 取证分诊**含补丁前窗口失陷检查**。集群 KEV 技能 `performing-cve-prioritization-with-kev-catalog` 已同步该更新（2026-11-14）。
- 对本案例的攻防含义：①链使能组件被 KEV 一视同仁——「CVSS≥7 才处理」的过滤器会漏掉此类环节；②「已修补」≠免疫，**滞留旧版本分支的设备群（iOS 16.x legacy branch）才是真实暴露面**，资产盘点须到 OS 分支粒度；③补丁落地后仍须做窗口期失陷排查（与 Zyxel CVE-2026-107441「补丁命中≠补丁有效」教训同向，见 patch-diff-exploit S4b）。
- 一手证据存档：`gap_workspaces/gap-20261106-001/evidence/`（kev_json_raw.txt / cisa_alert_kev.md / cisa_bod_26_04.md / thn_apple_flaw.md）。
