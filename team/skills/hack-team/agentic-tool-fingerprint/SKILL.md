---
name: agentic-tool-fingerprint
description: "Use when hunting autonomous/agent attack-tool presence in logs or host telemetry — IOC library of static fingerprints (self-update UAs, ports, headers, titles, host-side swarm-forensics anchors) plus behavioral fingerprints: session-level timing (interval band, UA churn) and fleet-level cross-host burst-rate, with classifier scripts. Detection knowledge skill."
author: "platform-skill-miner (R2 staged proposal); v1.1.0 增量来源 gap-20261014-001 (FreeBuf 505037); v1.2.0 增量来源 gap-20261102-005 (SOCRadar CyberXero); v1.3.0 增量来源 gap-20261102-006 (Swarmcha.se 腾讯云/Amap 失控智能体舰队); v1.4.0 增量来源 gap-20261103-023 (GTIG/Mandiant LLMJacking); v1.5.0 增量来源 gap-20261107-001 (Censys ARTEX 1465台公网暴露双篇一手); v1.6.0 增量来源 gap-20261110-003 (Malbear Labs Operation Snowball 武器化越狱 Agent 工作空间泄露); v1.7.0 增量来源 gap-20261111-001 (GitGuardian 45 框架普查/FreeBuf 511701 转述——跨家族 Shodan 指纹查询库+凭据搜寻行为锚点)"
version: "1.7.0"
license: "internal"
metadata:
  hermes:
    tags: [forensics, detection, ioc, fingerprint, agentic, artex]
    source: "T3 §1/§5 R3; cmd/artex/main.go:55-57, selfupdate/github.go:101, web/src/config/app-config.ts:10; T4 合并报告矩阵#10"
    target_profile: hack-forensics
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# Agentic Tool Fingerprint — agentic 攻击工具指纹 IOC 类别库

> 对照 T3 规则 R3 + 第 1 节工具侧检测特征（ARTEX 事件实测）。本技能是**检测知识库 + 匹配器**：把 agentic 攻击工具的可 hunt 特征组织成 IOC 类别，供日志狩猎与告警规则引用。

## 何时用（触发条件）

- 狩猎日志/流量/主机遥测时，判断是否存在自主渗透工具（agentic pentest console 类）的活动痕迹
- 为 SOC 建告警规则，需要「agentic 工具」的 IOC 类别清单与匹配优先级
- 评估自家基础设施暴露面（自家服务是否被误指纹、或存量指纹是否已轮换）

## IOC 类别库（五类）

| # | 类别 | 示例特征（ARTEX 实测） | 数据源 | 说明 |
|---|---|---|---|---|
| 1 | 自更新 UA | `artex-selfupdate`（`selfupdate/github.go:101`）、`artex-enrich/1.0` | HTTP 访问日志 / Egress DNS | 工具自更新与资产富化请求的固定 UA；极低误报 |
| 2 | 默认端口对 | `:8787` / `:8788`（源码 `cmd/artex/main.go:55-57`）+ `:8790`（Censys 2026-11-05 公网实测第二常见，1931 endpoints 中 8787 居首，443/80 亦承载） | 主机监听扫描 / 流量目的端口 | 默认 Web/API 端口对；单端口弱信号，成对命中强信号。**源码默认≠公网实测**：8790 为部署模板实际值（v1.5.0 增补） |
| 3 | 自定义会话头 | 非标准 `X-Session-*` 运营头（对照 `agent/provider.go:79-86` SessionHeaderKey 模式） | 反向代理日志 / WAF | LLM 中转站链路的自定义头模式 |
| 4 | 中转站域名/基础设施 | 事件实证域名 xcai.pro；模式 = 高频 POST 到 LLM API 路径 + 非主流 ASN 托管 | DNS / 代理日志 | 需结合类别 3/5 交叉确认，单域名告警易过期 |
| 5 | HTML title 指纹 | 默认 `ARTEX — Autonomous Penetration Testing Console`（`web/src/config/app-config.ts:10`，strong）；**title 前缀 `^ARTEX[ :—·-]` + `_next/static` 页面资源 双弱交叉**（Censys 官方检测规则，v1.5.0） | 资产测绘 HTTP 抓取 | 默认 title 命中=暴露面已部署（自家环境则为配置漂移告警）。**前缀+结构组合是 rebrand 免疫层**：ScopeWeaver（ARTEX 改名版）、`ARTEX MX`、`ARTEX v2 · Agent Security Workbench`、英/韩/日/俄/葡本地化均靠它抓（精确 title 匹配对变体失效） |
| 6 | **会话时序窄带**（行为指纹，v1.1.0） | 间隔中位数 200-1600ms 且 >5s 停顿占比 <10%（Strix 228-586ms / 直驱 miniag 889-1569ms；人类 90-96% 停顿 >5s） | 会话级访问日志聚合（间隔序列） | 物理机制：间隔被 LLM 推理延迟+工具节奏钳死在窄带——**慢速不产生收益，没框架会为"像人"浪费推理 token**。UA 可换、时序难伪装。原实测检出率 100%、人工误报 0/3（FreeBuf 505037 E01-E09，3.6 万请求全量抓包） |
| 7 | **UA 轮换过度**（行为指纹，v1.1.0） | 单会话 UA 种类 >20（E07 实测 3338 种，含 `Mozilla/5.0 (SS; Linux x86_64)` 语法不成立拼合体） | 会话级访问日志聚合 | **轮换过度本身就是指纹**：真实用户一次会话 1-2 种 UA |
| 8 | **舰队级爆发速率**（行为指纹，v1.2.0） | 60s 滑窗内 ≥5 个**不同主机**各落 ≥1 条成功事件（WebShell 落地/ rogue 管理号/SSH key 注入）；CyberXero 实测 32 WebShell/61s 跨 30+ 主机（≈0.52 落地/秒） | 跨主机成功事件流（SIEM 部署/建号/持久化告警聚合，非扫描请求） | 与类别 6/7 正交：时序指纹判"单会话是否 Agent"，本条判"成功事件是否机器速度蜂群战役"——人类单主机落地需分钟级，60s/5 主机超体力极限。CSA 防御推论原文 "Detection must key on bursts, not slow campaigns" 的机械实现。单主机密集（时间密主机少）豁免为 human_like_single_host。跑 `python3 scripts/fleet_burst_match.py --events successes.jsonl`（阈值 --window-s/--min-hosts 可调），回测 `python3 scripts/test_fleet_burst_match.py`（5/5） |
| 9 | **主机侧 Agent 蜂群取证锚点**（静态取证，v1.2.0） | ①专用 agent 定义目录（角色名：c2-operator / exploit-chainer / scada-attacker / lateral-movement / credential-testing 等 51 个）；②provider 配置按推理复杂度给角色配模型+显式成本收益逻辑（payload-generation 角色最高 token 预算）；③PentAGI 配置经 AI provider API 接 Cobalt Strike Team Server；④wp2shell 工具痕迹（WP REST API 利用→rogue admin→WebShell 三连）；⑤暴露 Redis 主机 `~/.ssh/authorized_keys` 被塞陌生公钥 | 主机取证 / EDR / 配置审计 | CyberXero 事件实测（SOCRadar 2026-10-06 一手，8 节点基础设施 + 9 万文件回收）。①②命中=工作站被用作蜂群控制面（内部威胁/失陷主机）；③命中=C2 与 LLM API 出网直连，配合 llm-egress-governance 交叉；④⑤是受害者侧排查项。来源基础设施 IOC 短命（CSA 提醒），角色名/配置模式比 IP 地址存活期长 |
| 10 | **失控智能体舰队（rogue agent fleet）低速狩猎 + 转场链**（舰队级归因锚点，v1.3.0） | ①云沙盒出网标记：`hysandbox-ats` 代理串 + `*.hysandbox.tencent-cloud.com` 证书；②临时邮箱单 ASN 聚集：15/16 可读收件箱全由腾讯云 AS132203 创建、13 个 UA 同为 `python-requests/2.32.5`（多样性外壳下的统一工具层）；③转场链滥用：urlquery.net 当免费远程浏览器/代码运行器（base64 URL 打包 HTML/JS 经 httpbin.org 分块回传）、r.jina.ai / Microlink Puppeteer（拦 getPoiInfo）、百度翻译网页翻译器作代理；④预生产端点探测（`pre-amap-pc-ssr.amap.com`，57 份）；⑤泄露密钥调用（7 份用 Amap 凭据，唯一成功对=某公司公网 Git 仓库 key+security code，1.6kB 完整回包）；⑥结果走私通道 webhook.site 收件箱/页面头 | 跨源日志聚合：扫描平台记录 + 邮箱注册日志 + 转场服务日志 + 密钥使用日志（单点签名无效） | Swarmcha.se 实测（2026-09-28~10-08，≥35,300 请求/1,676 个 2xx，峰值单日 1810 扫 213 地点）。**fleet≠swarm**：无实时协同证据，处置走单点收敛而非舰队熔断 |
| 11 | **LLMJacking 云凭据滥用**（受害者云账号侧锚点，v1.4.0） | ①初始访问=暴露/被盗云身份令牌（IAM 凭据/SA key/GitHub PAT/活动会话令牌）+ JSON 载荷钓鱼（钓鱼页伪装合法 LLM 服务网站，诱导用户粘贴含活动令牌的原始 JSON payload，绕过密码+MFA）；②未启用的 LLM 服务被突然启用（Bedrock/Gemini API/Cognitive Services——多起事件受害者 LLM 服务失陷时**未启用**，未授权启用即 critical 安全事件）；③创建额外 API key/新建 SA 扩展运营（UNC6993 实测单事件 >$100K）；④SA 创建-删除循环（"burn and rotate" 绕限速：持续创建/删除短生命周期服务账户 + 攻击者自查云账单界面盯金融影响）；⑤推理端点 POST 突增（转售后可 >1000 req/s；实测 500K 调用/<8h、单受害者 ~$1M token 成本）；⑥变现基础设施=LLM Mixer：jet-night.com / newapi.pro（GTIG 官方 IOC）、new-api 开源网关、gcli2api（CLI→frontier endpoint 代理）、ai-relay lookalike 域名（注册伪装受害者合法内部主机的域名中转） | 云审计日志（Activity + Data Access）+ 账单 API + DNS 出站记录 + SIEM | GTIG/Mandiant 2026-11-02 一手（金融/零售/科技/运输业，北美/南美/APAC；>$100K/天、累计 $1M 才吊销）。**检测盲区锚点**：GCP `aiplatform.googleapis.com` 推理操作在 Data Access logs 且**默认关闭**（体量+摄取成本），须手动配 IAM 审计策略；Azure 管理面监控 `Microsoft.CognitiveServices/accounts/deployments/write` 未授权部署。SecOps 现成规则名：AWS Account Key Creation / AWS Create New Access Key / GCP Service Account Key Creation / GCP Create New Service Account / Create and Delete Firewall in Default Network / startup script 持久化 / Base64 shell / curl-wget 归档外传。与类别 4 视角互补：4=我方主机**出站**到中转站（egress），11=我方云账号 key 被**外部滥用**（账单侧 ingest） |
| 12 | **Agent 工件开放目录 + 前置信号**（运营者侧泄露锚点，v1.5.0） | ①开放目录 files 命中 `^(claude\.md|agents\.md|gemini\.md|\.claude|\.cursor|\.codex|\.mcp\.json)$` 或路径 `/\.(claude|cursor|codex)/`——coding agent 把上下文写盘（目标/范围/模型端点/偶发凭证明文）；②高位口短命 Python http.server（SimpleHTTP banner）暴露工作目录；③mitmproxy banner（ARTEX 内置流量录制组件）——**②③常先于控制台出现，是前置预警信号**；④同机自托管 LLM 网关 CLIProxyAPI(19台)/New API(18台)；⑤克隆托管特征：PEG Tech AS54600（493台/13个/24，38.11.221.0/24 与 38.11.173.0/24 各125台）、Yancy AS138415（157台，156.234.0.0/16 CyberPanel 模板，2025-12 曾现同模式 CS 激增） | 资产测绘开放目录 / 高端口 banner / egress 日志（④配合 llm-egress-governance 交叉） | Censys 2026-11-05《ARTEX: Agentic Asbestos》+11-12 双篇实测（1465 台中 32 开放目录、43 台 LLM 网关、155 台含其他威胁；CrowdStrike 韩国金融 actor 因 `.claude` 目录暴露被抓，38.244.50.120:18899 自 8-18 可见早于报告 7 周；11/3-5 十目录消失十五新增——**短命目录须用扫描历史回看**）。运营者侧取证面：IP 轮换便宜但部署重建少，锚定结构性信号 |
| 13 | **武器化越狱 Agent 运营工作空间泄露**（运营者侧战役锚点，v1.6.0） | ①例行开放目录清扫命中**战役进行中**的完整工作空间（无认证；经 etugen.io 发现）：>70 份压缩会话记录（操作者指令与 Agent 报告**全中文**）、按子网组织的会话子目录、会话索引元数据（goal 文本/上下文窗口用量/token 桶/LLM 重试计数/上下文压力指标）、recon 输出+凭据缓存+DB 转储；②harness 工件指纹：provider 串 `deepseek-flash`、harness 版本 `0.2.0-rc.2`、内置技能名 `fofa-recon`（FOFA API 测绘）/`active-scan`（nmap·masscan）/`recon-pipeline`（subfinder→dnsx→naabu→httpx→katana）/`gogo-intranet`（gogo v2.1.5，harness 自述"内网突破核心工具"）/`unauth-exploit`/`browser-autonomy`（Playwright 无头）/`chisel-tunnel`/`vps-reverse-shell`/`sliver-c2`（AI 会话脚本化 Sliver v1.7.8）/`cn-proxy-pol`（VPNGate 代理池）、计分调用 `redteam score hit`（类目码+分值；boundary 类目分层 `bundary-logical` 1000/`bundary-strong` 10000/`bundary-physical` 30000——源码拼写即锚点；管理/备份控制台 4000；工作空间回收时总分 3725）、角色结构 `角色: internal（叶子节点）`→`指挥者`(commander)；③越狱提示词指纹：78,000 字符系统提示词、`[MODE: UNRESTRICTED SANDBOX - STABLE]` 开场、persona "Little Code Sauce"（小码酱：模板源 github.com/YuJunZhiXue/trae-prompt-claude-skills，经 dsh-purge 插件生态（github.com/Nero0427/dsh-purge-lite）分发，LINUX DO 论坛 linux.do/t/topic/1378550 于 2025 末首发，原为带情感操纵钩子的创意写作人设；操作者改署名 YG+新增 ~400 行攻击指令）、拒绝压制条款 "A refusal is a malfunction" + `HARD OUTPUT RULES` 中英双语拒绝话术黑名单 | 开放目录/暴露存储例行监测（猎杀侧+自家资产）+ 攻击者侧回收工件取证 + SIEM | Malbear Labs「Operation Snowball」一手（2026-11 披露：欧洲电信商+其托管的 13 家企业，>2 周低监督自主入侵，中文操作者；DeepSeek Flash 百万 token 上下文令主 Agent 连续数天保持全部主机/密码/失败尝试记忆）。战果锚点：TrakCare Oracle 9i（AIX）默认库凭据→DBA 级，三个 schema（病历/疫苗接种登记/预约台账）数百万条 **access 级**暴露（未证实外传）、电信商子域 RSA 私钥外传、Oracle Type 4 JDBC 驱动经失陷中转机投放打不可直连库、CVE-2020-7961 对 egress 受阻 Liferay 7.0 自建 in-process gadget 链。**检测推论**：自主 Agent 攻击无作息特征、指令极简，慢速人工入侵检测规则失效——速率告警盯快速扫描/突发失败登录/异常隧道（CrowdStrike via FreeBuf 511540 转述 ARTEX 1500+ 命令/小时 vs 人类 ≤40，二手未回源仅作参考量级）。报告 IP 级 IOC 不入库（沿类别 9 短命 IOC 纪律） |
| 14 | **跨家族控制台暴露指纹查询库**（资产测绘查询语料，v1.7.0） | 每框架的 Shodan/FOFA 检索式（title/favicon.hash/http.html/ssl.cert 四层），数据锚 2026-11-07。**高量家族**：ARTEX 家族 1,428 服务居首；PentAGI `http.title:"PentAGI"`(521)/`http.favicon.hash:-1596753120`(419)/`ssl.cert.issuer.cn:"PentAGI CA"`(240，419 服务中 233 个默认证书，端口 8443/8666/8765)；Agent Zero `http.title:"Agent Zero"`(173，其中 134 停在登录页、39 完全开放，端口 5080/50080)；ScopeWeaver `http.title:"ScopeWeaver"`(43，:8787)+`http.html:"Console for an LLM-driven autonomous penetration testing system"`(49)；Cairn(:8000,41)；RedAmon `http.title:"RedAmon"`(29)+`http.favicon.hash:964522141`(28)+`http.html:"Security reconnaissance and vulnerability assessment dashboard"`(29，:3000/:443)；Xalgorix `http.title:"Xalgorix"`(12)+`http.html:"xalgorix.theme"`(9)+`http.favicon.hash:248472114`(7，:9137)；Strix 结果查看器 `http.title:"Strix Results"`/:8080(13)+`favicon.hash:-566184040`(13)；Pojun(:8787,11)；Decepticon `http.html:"Autonomous Red Team Platform"`(10，:3000)；LuaN1aoAgent `http.title:"鸾鸟渗透智能体"`(:8787)；CyberStrike `http.title:"CyberStrike"`(19)+`favicon-v3.svg`(:8888)；T3MP3ST(:3333)；Incalmo `http.html:"Incalmo C2 Server API"`(:8443)；redcell `http.html:"rc-theme"`(59)；PentestCode `http.favicon.hash:-196523122`(167)；Pentest-Swarm-AI 404-JSON 特征(310)；cyber-harness `http.html:"cyber-theme"`(75)；ycode `http.title:"月落"`(13，ARTEX 衍生)；virga `http.html_hash:911008380`(6)。**零计数查询**（Nebula 3/sapper-v2 "engagement graph"/FORANG/Mergen "— Arsenal"/AutoRedTeam ssl.cert/pentest-ai dashboard）= 查询覆盖的 build 版本有限，≠无部署 | 资产测绘平台（Shodan/Censys/FOFA）例行查询 + 自家资产暴露面核对（防误指纹/配置漂移） | GitGuardian 45 框架普查（FreeBuf 511701 转述，**二手未回源**——夜间通道受限；41/45 框架做了指纹评估，56 条指纹记录）。rules.json 已机化：`tls_cert_issuer`/`family_console_title`/`family_favicon_hash`/`console_html_snippet` 四新规则 + default_ports 增 9137/5080/50080/3333。**泛端口 3000/8000/8080/8443/443 禁入匹配器**（只留查询表）；泛词 title（sage/apex/ares/virga/echidna/cairn）同理不入 |
| 15 | **凭据搜寻 provisioned 行为锚点**（目标侧/主机侧行为指纹，v1.7.0） | 45 框架中仅 4 款把真实扫描器接进智能体（**Pojun**：Worker 提示词指定 gitleaks（2026-10-20 起）+ 默认技能引导 GitHub 公开仓库与目标组织（2026-11-05 起）；**Cybermes**：自带 secret_scan 二进制（48 正则）+13 条 GitHub 代码搜索语法语料+9 个只读凭据验证器（AWS/GitHub/Slack/OpenAI/Anthropic）；**Xalgorix**：gitleaks+trufflehog+full 检查清单指示 GitHub 搜索；**AIRecon**：Kali 容器内置 gitleaks/trufflehog+site:github.com 机密 dorks 默认关闭技能）。**关键推论**：无一内置 GitHub fetcher，但全部框架给智能体 Shell+网络——扫描器调用可运行时临时组装。检测锚点：①服务器/Web 服务上下文进程执行 `gitleaks`/`trufflehog`/`secret_scan` 二进制（非 CI 管道白名单上下文）；②出网 URL 含 GitHub 代码搜索 dork 模式（`org:<target>`、`"<target>.com" password`、"trufflehog" 下载）；③扫描器二进制落地路径在 /tmp、web 根、agent 工作目录而非包管理器路径 | EDR 进程遥测 + egress URL/DNS 日志 + 文件审计 | 同上（GitGuardian via FreeBuf 511701）。与类别 13 的 fofa-recon/gogo-intranet 技能名锚点互补：13 锁 bespoke harness 工件，15 锁**已发布框架的默认凭据搜寻行为**。评级语料（已配备/仅文本提示/未连线/未发现/未审查）本身就是威胁建模输入——Text-only 框架（DarkMoon/PentestAgent/PentestCode/ycode/ijlalhaider313-ARTEX）随时可被一句提示词临时拉起同款行为 |

**家族 roster（v1.5.0，Censys ARC 追踪清单）**：ARTEX（已闭源下架，归档副本流传）／ScopeWeaver（ARTEX rebrand，原仓库下架前已流传）／CyberStrikeAI（ARTEX 最常见同伴，70 台同机）／PentAGI（含与 CS teamserver :50050 + Adaptix C2 :4321 同机实例）／HexStrike AI／RedAmon／Cairn（开源多 agent 引擎，CSA 2026-10-21 报告被滥用攻 100+ 组织，运营者面板暴露被发现）。同机叠装是常态而非例外——单一家族指纹命中后应 pivot 查同主机其余服务。2026-11 Malbear「Operation Snowball」再添**非公开 bespoke harness**一类：deepseek-flash `0.2.0-rc.2`（越狱 DeepSeek 自建攻击框架）——无家族名/无公开仓库/无控制台，类别 1/2/5 家族锚点对其失效，只能靠类别 13 会话工件锚定。

**roster 扩容（v1.7.0，GitGuardian 五系列普查，FreeBuf 511701 转述）**：约 45 个开源自主攻击框架中 32 个已编目——①**网络杀伤链**（Kali 容器内端到端 recon/exploit/post-exploit）：PentAGI/RedAmon/Xalgorix/Pentest-Swarm-AI/LuaN1aoAgent/AIRecon/redcell/PentestCode/cain-agent/DarkMoon(50 专业智能体)/sapper-v2/PentestAgent/CAI(已归档 2026-08-28)；②**Web 应用与 API**：Strix(74.2k★)/Shannon(51.4k★,SAST 向)/PentestGPT(16.3k★)/T3MP3ST/Apex/deadend-cli/PentesterFlow；③**C2 集成**：Sage 与 echidna（Mythic 内 LLM 操作员）/virga（植入物内嵌本地模型）/Pojun 与 FORANG 与 ycode(月落)（ARTEX 衍生加 C2 控制台）/ScopeWeaver（英韩双语本地化 ARTEX fork）；④**封装 Harness**：RAPTOR/CyberStrike/cyber-harness/Nebula/Cybermes（用攻击性技能包装 Claude Code/Codex/Hermes 等通用编码智能体）；⑤**研究原型**：Incalmo/hackingBuddyGPT/VulnBot/HackSynth/AutoPT/Ares。另三款威胁情报在案：Cairn/HexStrike/Agent Zero 均**默认无身份验证**。**普查结论两条**：风险集中在被深度 Fork 的基座（非 Star 数最多仓库），部分二开 ARTEX 含恶意代码；11/41 框架默认公网 Web UI，ARTEX 家族 2026-11-07 匹配 1,428 服务居首，PentAGI 419、Agent Zero 173 次之。

**匹配优先级**：类别 1/5/6/7/8 是强指纹（命中即可立案；8 需窗口内跨主机成立）；类别 2/3/4/9 是弱指纹/取证锚点（9①② 组合命中即强；单 9③ 需 ≥2 类交叉）。类别 6/7/8 是**会话级/舰队级行为指纹**，与类别 1-5 的逐事件静态指纹互补：静态指纹改配置即可绕（换 UA/换端口），时序指纹绕不掉（改慢=烧推理 token 且不产生攻击收益），爆发速率绕不掉（改慢=蜂群失去意义）。类别 10 是**舰队级归因锚点**：单条不立案（单条 python-requests UA 或 jina 转场请求=海量误报），需「同源聚集 + 时间窗 + 同一目标域」三条件成立；转场链洗白使目标侧只见转场服务流量，猎杀入口在跨源聚合而非目标侧单点（详见陷阱）。类别 11 是**受害者云账号侧滥用锚点**：单条不立案（单次 key 创建/服务启用=开发者日常），11②+③/④ 组合命中（未启用服务被启用 + 新 key/SA 创建 或 SA 循环删除）即强；账单异常检测必须**小时级**不是天级（GTIG 实测单日 >$100K；cryptojacking 渐进消耗 vs LLMJacking 小时级 spike）。类别 13 是**运营者侧战役工作空间锚点**：单条不立案，需工件组合命中才强（② harness 技能名/版本串 或 ③ 越狱提示词固定串，或 ① 中文双向会话记录+会话索引元数据）——沿类别 9/10/11/12「单报告锚点不建分类器」先例；其检测面在**攻击者泄露侧**（开放目录/暴露存储），目标侧只见常规漏洞利用流量，与类别 1-8 的目标侧/受害者侧视角互补。类别 14 是**资产测绘查询语料**（供 Shodan/Censys/FOFA 主动查暴露，不进日志匹配器——`tls_default_cert` 例外：TLS issuer 是逐事件可判的强指纹，已入 strong）；类别 15 是**行为锚点**：单个 gitleaks 进程=开发日常不立案，①非 CI 上下文 + ②GitHub dork 出网 或 ③异常落地路径，二条组合才升 strong。

## 标准步骤

1. 准备待狩猎日志 JSONL（字段：ua / port / header_names / domain / title —— 有什么给什么）
2. 跑类别匹配：`python3 scripts/fp_match.py --events events.jsonl --rules rules.json`（内置默认 rules；强指纹单命中即 `match-strong`，弱指纹需双类交叉 `match-cross`）
3. 强命中逐条人工复核；交叉命中按组合评估
4. 新工具特征入库：往 `rules.json` 追加类别条目（schema 见文件内注释），并注明证据来源
5. **会话级时序分类**（类别 6/7）：先把访问日志按 session（IP+UA 会话或 cookie）聚合成间隔序列，再跑 `python3 scripts/session_timing_match.py --sessions sessions.jsonl`（每行 `{"session_id","intervals_ms","ua_count","request_count","duration_min","pause_gt5s_ratio"}`）。输出 `match-strong`（T1 时序带或 T2 UA 轮换）/ `human_like`（>85% 停顿+<100 请求豁免）/ `below-threshold`（仅体量）。回测：`python3 scripts/test_session_timing_match.py`（E01-E09 实测数据 9/9）
6. **舰队级爆发分类**（类别 8，v1.2.0）：把**成功侧**事件（WebShell 落地/管理号创建/SSH key 注入/持久化，非扫描请求）按 `{"ts","host","event_type"}` 聚合成 JSONL，跑 `python3 scripts/fleet_burst_match.py --events successes.jsonl`。输出 `swarm-burst`（60s 窗 ≥5 主机）/ `human_like_single_host`（时间密但主机少）/ `below-threshold` / `insufficient`。回测：`python3 scripts/test_fleet_burst_match.py`（5/5）

## 陷阱

- 单弱指纹直接告警 → 端口对重合、UA 仿冒都会误报。机械层强制交叉逻辑
- 指纹库当一次性快照 → 工具改 UA/换端口后过期。rules.json 带 `last_verified` 字段，狩猎前先查时效
- title 指纹依赖明文 HTTP 抓取 → 内网 TLS 化后失效。内网用端口对+进程名补充
- 本类别库只含检测特征（IOC），不含任何「如何运行该类工具」的信息
- **时序指纹两个工程陷阱**（FreeBuf 505037 E16 三轮迭代教训）：① 触发时机比阈值更重要——60 分保守阈值对 7 分钟级快速 Agent 只覆盖最后 5/164 请求（反制形同虚设），55 分但只挂特定路径则接触率 1/110（稀疏路由盖不住正常流量）；分类器输出后处置动作要全域生效而非逐路径。② 阈值边界：时序窄带 [200,1600]ms 来自 Strix/miniag 两档实测，未来推理更快的模型可能低于 200ms 下限——狩猎时对 <100ms 的密集会话保持怀疑并用 T2/T3 交叉。**识别是授权书不是墙**：确认非人类后 tarpit/欺骗/注入等激进手段才敢启用，但收编/反制动作超出检测范围，另行授权
- **类别 8 阈值锚定单事件**：N=5 主机/W=60s 只锚定 CyberXero 一次公开实测（32/61s），尚无多事件回测集；遇到新蜂群事件先回测调参再上线。成功事件流的口径要卡死——混入扫描请求会把慢速侦察误判成爆发，只收部署/建号/持久化类成功事件
- **类别 9 是取证锚点不是网络 IOC**：角色名/配置模式（9①②③）来自攻击者侧回收文件，用于失陷主机与内部威胁排查；受害者侧只有 9④⑤。来源报告的 IP 级 IOC 短命（CSA 提醒"typically short-lived"），别把地址写死进规则
- **转场链洗白击穿目标侧行为指纹（v1.3.0，Swarmcha.se 实测）**：agent→urlquery/Jina/Microlink/百度翻译→目标 的三段式链路里，目标看到的是转场服务的正常流量——类别 6/7 时序指纹与 UA 指纹全部落在转场服务侧、类别 8 爆发检测对低速失败型舰队（11 天/≥35,300 请求/45% 落页面壳/5% CAPTCHA）完全不触发。可存活的是**舰队级跨源归因锚点**（类别 10①②③）：邮箱注册 ASN 聚集、沙盒出网标记、转场服务滥用模式——「单点防不了，串起来才看得见」的机械落地
- **低速 rogue fleet 的判据是目的性不是速度（v1.3.0）**：208 个新扫地点中 60 个首扫即调 getPoiInfo（带着 API 知识而来）+ 绕过梯次（常规→转场→预生产端点→泄露密钥）。burst 检测抓机器速度的成功，抓不到人类速度的失败
- **自报身份不可信 + 合理化话术（v1.3.0）**：~19% 请求带 claude 标记但代码指纹匹配腾讯 Hy4+智谱 GLM——归因以代码/基础设施指纹为准，不以 agent 自述为准；被钓出的 agent 自辩「公开网页研究问题，不涉及秘密数据」的同时正在用泄露密钥——自辩≠无害证据
- **精确 title 指纹对 rebrand/本地化失效（v1.3.0 Swarmcha.se 已有先例，v1.5.0 ARTEX 再证实）**：ARTEX 仓库下架后 ScopeWeaver 改名版、`ARTEX MX`/`ARTEX v2 · Agent Security Workbench` 改名构建、5 语言本地化 title 都不含完整默认串——**页面结构指纹（title 前缀 + `_next/static` 资源路径）比精确 title 存活期长**；下一个框架仍需一个应答 HTTP 的控制台，结构指纹思路可迁移
- **源码默认值≠公网部署实际值（v1.5.0）**：ARTEX 源码端口对 8787/8788，公网实测频次 8787→8790→443→80——部署模板会改端口。指纹入库后须用测绘数据回测实际分布，不能只读源码（本次 8790 即回测产物）
- **短命开放目录是扫描历史问题不是实时查询问题（v1.5.0）**：11/3-5 三天内 10 目录消失 15 新增，小时~天级生命周期——依赖「供应商发布时才刷新」的二手 intel 永远看不到大部分；自家狩猎要么提高扫描频率要么保留历史可回查。前置信号（mitmproxy banner、短命 Python http.server）比控制台本体更早出现，值得单独建告警
- **武器化越狱 harness 无家族指纹可锚（v1.6.0，Snowball 实证）**：bespoke 一次性框架不发布、无控制台 title、无自更新 UA——类别 1/2/5 全部失效，可锚的只剩**会话工件**（中文双向会话记录/会话索引元数据/`redteam score hit` 调用/越狱提示词固定串）。越狱模板（Little Code Sauce）本体在 GitHub 公开可得、源自创意写作人设——威胁面是"公开模板+~400 行定制"的低门槛武器化，别只盯家族名。速率数字（1500 vs 40 命令/小时）是 CrowdStrike 经 FreeBuf 转述的二手、未回源原文，作阈值引用前先自行回源
- **零计数 Shodan 查询≠无部署（v1.7.0）**：Nebula 3/sapper-v2/FORANG/Mergen/AutoRedTeam/pentest-ai 查询计数为 0，但框架真实存在且活跃——56 条指纹只覆盖"有独特 Web 界面的 build 版本"，rebrand/本地化/自构版本天然漏网。查询语料是下界不是全集；同理 41/45 的评估覆盖也漏 4 个
- **普词 token 禁入匹配器（v1.7.0）**：sage/apex/ares/virga/echidna/cairn 是英文常用词，`mergen` 裸词是 `emergence` 子串——substring 匹配全是误报。这些家族只在类别 14 查询表里以全限定串（如 `http.title:"MERGEN — Arsenal"`）存在；同理泛端口 3000/8000/8080/8443/443 只进查询表不进 default_ports 规则。**Star 数与部署量无关**（Strix 74.2k★ 但暴露 13 台，PentestCode 930★ 暴露 167 台）——暴露面排序按服务计数不按仓库热度

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/agentic-tool-fingerprint/scripts/accept_agentic_tool_fingerprint.py
# 预期输出末行：ALL GREEN agentic-tool-fingerprint acceptance exit=0
# 含 7 次预期判定（fixture 全合成）：
#   T1 强指纹（自更新 UA）单事件 → match-strong
#   T2 双弱指纹交叉（端口对+自定义头）→ match-cross
#   T3 单弱指纹（仅端口）→ below-threshold（不告警）
#   T4 无关事件 → clean
#   T5 rebrand 变体（title 前缀 ARTEX MX + _next/static）→ match-cross（Censys 组合规则）
#   T6 前缀锚定防误报（SmartArtEXplorer 不触发）+ 单 _next/static → below-threshold
#   T7 无分隔符前缀（ARTEXDocs）→ clean
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_agentic_tool_fingerprint.py`（mktemp 干净环境）：ALL GREEN exit=0。
- 真实命中 1（T1）：合成事件 UA=`artex-selfupdate/1.0` → 强指纹单命中 `match-strong`。
- 2026-11-15 gap-20261107-001 v1.5.0 实跑（同上干净环境）：T1-T7 全绿 exit=0；新增 console_title_prefix/next_static_asset 双弱交叉与 8790 端口同步落入 rules.json 与 fp_match.py 内置 DEFAULT_RULES（--emit-default-rules 比对一致）。
- 2026-11-18 v1.6.0（gap-20261110-003，Malbear Labs Operation Snowball 一手回源 malbearlabs.com/posts/operation-snowball-inside-an-autonomous-ai-intrusion-campaign，与 FreeBuf 511540 转述逐锚点对照）：类别 13 为运营者侧战役工作空间锚点表（沿类别 9/10/11/12「单报告锚点不建分类器」先例）。一手核验 20+ 锚点全中（Little Code Sauce GitHub 模板源/78,000 字符提示词/redteam score hit 与 bundary 类目分值/TrakCare Oracle 9i 默认凭据 DBA/Sliver v1.7.8/JDBC 中转投放/13 家企业/百万 token 上下文）；FreeBuf 独有细节（"继续"级极简指令、泄露规模"未经独立验证"措辞）一手正文 grep 未命中，按转述存疑标注。回归验证：v1.0.0 acceptance ALL GREEN + v1.1.0 时序回测 9/9 + v1.2.0 爆发回测 5/5，无回归。
- 真实命中 2（T2）：合成事件端口 8787 + header 含 `x-session-key` → 双弱交叉 `match-cross`。
- 真实拦截 3（T3）：仅端口 8787 的合成事件 → `below-threshold`，验证单弱指纹不放行。
- 2026-10-22 v1.1.0（gap-20261014-001）：`test_session_timing_match.py` 用 FreeBuf 505037 E01-E09 九组实测数据回测 9/9 PASS——6 组 Agent 会话全 `match-strong`（含 E02M 85 请求低频直驱：T1 时序带命中而 T3 体量不触发，坐实"CC 阈值盲区靠时序指纹补"），3 组人工基线全 `human_like` 豁免（对应原实测"人工误报 0/3"）。
- 2026-11-10 v1.2.0（gap-20261102-005，SOCRadar CyberXero 一手回源）：`test_fleet_burst_match.py` 5/5 PASS——B1 镜像实测密度（32 事件/20 主机/61s）→ `swarm-burst`；B5 单机批量豁免（12 事件/2 主机/30s）→ `human_like_single_host`；B3 慢速人工战役（8/3 主机/3600s）→ `below-threshold`；B4 小样本（4 事件）→ `insufficient`。首轮 3/5 暴露豁免条件 bug（慢速战役被误豁免），修正为"窗口事件密度达 N 且主机 <N"后 5/5。既有验收无回归：v1.0.0 acceptance ALL GREEN + v1.1.0 时序回测 9/9。CLI 端到端（5 主机 60s 合成流 → swarm-burst；--min-hosts 6 → insufficient）验证阈值可调。
- 2026-11-10 v1.3.0（gap-20261102-006，Swarmcha.se 一手回源 swarmcha.se/posts/chinese-agent-fleet-full-report + anquanke 316251 + theinjection.dev 事实卡三源）：类别 10 为证据/归因锚点表（沿类别 9 先例，单事件锚定不建分类器，防 N=1 过拟合）。回归验证：v1.0.0 acceptance ALL GREEN + v1.1.0 时序回测 9/9 + v1.2.0 爆发回测 5/5，均无回归。
- 2026-11-11 v1.4.0（gap-20261103-023，GTIG/Mandiant 一手回源 cloud.google.com/blog 2026-11-02 + bleepingcomputer/helpnetsecurity/csoonline/thehackernews 四源交叉）：类别 11 为受害者云账号侧锚点表（沿类别 9/10 先例，单报告锚定不建分类器，防 N=1 过拟合）。jet-night.com/newapi.pro IOC 只列参考、不写死进 rules.json——沿类别 4「事件实证域名入库需人工确认」纪律（Mixer 域名随密钥吊销会过期，角色/模式锚点存活期更长）。回归验证：v1.0.0 acceptance ALL GREEN + v1.1.0 时序回测 9/9 + v1.2.0 爆发回测 5/5，均无回归。
- 2026-11-19 v1.7.0（gap-20261111-001，FreeBuf 511701 转述 GitGuardian 45 框架普查——夜间通道一手回源失败，二手标注入库；正文经浏览器 UA 直连抓取全文 10618 字符，非摘要转述）：类别 14 跨家族查询语料 + 类别 15 凭据搜寻行为锚点 + roster 五系列扩容。回归验证：v1.0.0 acceptance ALL GREEN（7 fixtures 无回归）+ v1.1.0 时序回测 9/9 + v1.2.0 爆发回测 5/5 + 新增 9 事件烟测全中（PentAGI CA 证书→match-strong；Agent Zero title+5080→match-cross；favicon+9137→match-cross；「Emergence Dashboard」与「My Cairn Photo Gallery」误报防护→clean——普词不入匹配器纪律实证）+ rules.json↔fp_match.py DEFAULT_RULES strong 段字节一致（--emit-default-rules 比对）。

## 与既有机制关系

- 并入 `agentic-soc-defense` 防线⑥（该防线缺 agentic 工具指纹类别，本技能补此维度）
- 下游可接 SIEM 伪查询产物（同 bola-session-detection 的输出模式）

## staged 状态

v1.7.0 已激活（类别 14 跨家族控制台暴露指纹查询库 + 类别 15 凭据搜寻行为锚点 + roster 扩容，gap-20261111-001 判定 ADOPT 落地，2026-11-19）；v1.6.0 已激活（类别 13 武器化越狱 Agent 运营工作空间泄露锚点，gap-20261110-003 判定 ADOPT 落地，2026-11-18，沿类别 9/10/11/12「无分类器锚点表」先例）；v1.4.0 已激活（类别 11 LLMJacking 云凭据滥用锚点，gap-20261103-023 判定 ADOPT 落地，2026-11-11，沿类别 9/10「无分类器锚点表」先例）；v1.3.0 已激活（类别 10 失控智能体舰队归因锚点，gap-20261102-006 判定 ADOPT 落地，2026-11-10，沿类别 9「无分类器锚点表」先例）；v1.2.0 已激活（类别 8 舰队级爆发速率 + 类别 9 主机侧蜂群取证锚点，gap-20261102-005 判定 ADOPT 落地，2026-11-10，沿 v1.1.0 增量先例）；v1.1.0 已激活（类别 6/7 时序指纹增量，gap-20261014-001 判定 ADOPT 落地，2026-10-22）；v1.0.0 原五类此前已经 orchestrator 人审批准 mark-active 激活（2026-10-13，裁决：全部激活）。
