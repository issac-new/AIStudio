# Hermes Hack Team Knowledge Base

## 知识来源

### 1. Redteam Detail-Packs（5 个）
- redteam-sqli: SQL 注入测试
- redteam-xss: XSS 测试
- redteam-ssrf: SSRF 测试
- redteam-ssti: SSTI 测试
- redteam-auth: 认证授权测试

### 2. Cybersecurity Skills（58 个）
- Web 渗透: SQLi/XSS/SSRF/CSRF/XXE/反序列化
- 网络渗透: AD/Windows/Linux/网络服务
- 云安全: AWS/Azure/GCP
- 移动安全: Android/iOS

### 3. Cybersecurity-Defense（156 个）
- SOC/SIEM/EDR
- 威胁狩猎
- 事件响应
- 云安全防御

### 4. Cybersecurity-Forensics（60 个）
- 内存取证
- 磁盘取证
- 恶意软件分析

### 5. Cybersecurity-Detection（129 个）
- 入侵检测
- 异常检测
- 威胁狩猎

### 6. Hack-Team Skills（22 个）
- 渗透方法论
- 审计编排
- 应急响应
- LLM 安全
- 供应链安全
- WebSec 工具箱（websec-toolbox，2026-09 新增）
- AD CS 攻击链检测基线（adcs-detection-baseline，2026-10 新增，gap-20260925-003：FreeBuf 501589 的 R1-R9 检测规则 + AuditFilter 审计陷阱 + AI 攻击时序预算蒸馏）
- CVE-2026-98432 Linux 内核 MPTCP UAF 远程 root（cve-2026-98432，2026-11 新增，gap-20261030-003：Linux 4.4 起 IPv4 TCP 握手 UAF + MPTCP 监听前置 + Claude 53min 武器化 + EPSS 0.0076 实测，详见 knowledge/cve-2026-98432-linux-mptcp-uaf-root.md）
- Telegram Android 语音通话 RCE（telegram-android-tgcalls-mediastate-rce，2026-11 新增，gap-20261030-004：接听即触发，tgcalls MediaState 解析 find() 守卫-解引用迭代器错配，8.6.2–12.10.3 受影响，无 CVE 以 fix commit a6ea40eb 为差分锚 + 跨平台补丁时滞 Android 晚 5 个月 + Semgrep 固化规则回归 4/0/4/0 零误报，详见 knowledge/telegram-android-tgcalls-mediastate-rce.md）
- Zyxel GS1900 补丁失效二次利用（zyxel-gs1900-patch-bypass，2026-11 新增，gap-20261104-008：CVE-2026-107441 dispatcher.cgi 预认证 RCE 9.8，旧补丁 CWE-807 先复制后校验致 10 个已修固件全灭，Kapibala 在野 996 台/48 国收割配置+root 哈希，JITTERLY 后门/SIXZUT rootkit IOC 齐备；N-day 差分后必须走 patch-diff-exploit S4b 补丁充分性三判据，详见 knowledge/zyxel-gs1900-cve-2026-107441-patch-bypass.md）
- OpenAI 948 Linux LPE 单次运行（openai-948-linux-lpe-pipeline，2026-11 新增，gap-20261031-001：五阶段流水线 $1.21M 出 948 LPE（$1,279/个）+ 阶段成本模型 + 20/200"错误 0-day 致胜"归因教训（已固化进 fp-check Gate 5 因果归因），详见 knowledge/openai-948-linux-lpe-pipeline.md）
- OpenSSH *sshhole musl 认证绕过（sshhole-musl-authbypass，2026-11 新增，gap-20261110-001：CVE-2026-123158 CVSS 8.1，musl+非PAM sshd 以 257-1024 字节任意密码登录 shadow=`*` 密钥专用账户，2016 起存在，11-05 披露当日修 10.6p2+Alpine 全分支，11-05/06 蜜罐 232/713 次在野尝试；五条件缺一免疫 + 反向移植补丁 banner 陷阱，详见 knowledge/cve-2026-123158-sshhole-musl-auth-bypass.md）
- iOS worse_query 容器沙盒逃逸（ios-worse-query-container-escape，2026-11 新增，gap-20261111-002：App Group 一条 entitlement 即向 containermanagerd 私有查询 API 领任意应用容器 sandbox extension，侧载应用无越狱无内核洞读取钱包助记词/私钥，bad_query(08-11)→worse_query(11-08) 逐版本跟进；一手纠偏=27.3 beta 2 已修而稳定版 27.2.1/26.7.3 仍带洞（FreeBuf/THN "暂无修复"已滞后）；审计指纹=application-groups entitlement + container_query_create/sandbox_extension_consume dlsym 组合，详见 knowledge/ios-worse-query-container-escape.md）
- Chrome XML UAF 在野 0Day 沙箱内 RCE（cve-2026-125350，2026-11 新增，gap-20261111-003：KEV 2026-11-10 收录 dueDate 11-24，构造网页即渲染进程内任意代码执行，2026 年第 8 个在野 Chrome 0Day；官方帖纠偏=双报告者（Hardarson 10-12 + 匿名 11-06，媒体只写匿名）；本机 Chrome 156.0.8078.48 实测暴露于在野利用（< ES 修复线 156.0.8078.96），agent 自动化浏览舰队版本须挂 tool-inventory-baseline 周期盘点，详见 knowledge/cve-2026-125350-chromium-xml-uaf-itw.md）

### 7. Web安全工具库 公众号蒸馏（websec-toolbox，2026-09-09 新增）
- 来源：微信公众号「Web安全工具库」推荐工具（2026-03 ~ 2026-09 窗口）
- 收录：FLUX-Webscan 综合扫描 / MetaSword 逆向渗透工作台 / bface-agent AI 红队
  agent / plutox-sec-forge 双环境工具包管理器 / xxx-mods-scanner 轻量侦察
- 落地①（bface-agent 范式，t_7fcf0f52）：target-scoped-workspace「目标档案 7 件套
  （Engagement 档案，跨会话连续）」+ templates/engagement/ 7 骨架；
  fp-check「§6 漏洞三态账本接线」（Candidate→Confirmed 六门晋级）
- 落地②（plutox-sec-forge 范式，t_bc4daec7）：scope-gate「Runbook 式授权门禁
  （Auth Gate）」（consent.txt 落盘 + 危险操作单独放行）+
  「证据报告范式」（命令/退出码/耗时/输出 → report.md + run.json）
- 用法：`skill_view('websec-toolbox')`；原始 README 证据在
  workspace/websec-tools-survey/raw/tools/

## 使用方式

### 搜索知识
```bash
# 使用 search_knowledge 搜索（需要配置知识库路径）
search_knowledge "sql injection" --source redteam

# 或直接使用 skill_view 查看特定 skill
skill_view('redteam-sqli')
```

### 知识库路径配置
```bash
# 设置知识库根目录
export HERMES_KB_ROOT=~/.hermes/skills

# search_knowledge 会自动搜索以下目录:
# - $HERMES_KB_ROOT/hack-team/redteam-*
# - $HERMES_KB_ROOT/cybersecurity/*
# - $HERMES_KB_ROOT/cybersecurity-defense/*
# - $HERMES_KB_ROOT/cybersecurity-forensics/*
# - $HERMES_KB_ROOT/cybersecurity-detection/*
```

## intel 资产（hack-kb/intel/）

### kev_2026-09-22_checkpoint（2026-10-04, gap-20260926-001 / t_e4f24f79）
- CVE-2026-85102（CWE-295, 9.8）Check Point 网关 VPN 证书校验 RCE — SK1000117；
  09-12 起攻击波, IOC: 伪造证书 Subject CN=vpn/CN=vpn-user/CN=vpnuser (OU=users, O=global)
- CVE-2026-93616（CWE-22, 9.8）管理面 pre-auth 路径穿越→root — SK1000171；
  07-23 起零日利用 2 个月；2026-10-01 Bishop Fox 公开 TCP/19009 /cpmws/ loginNew
  伪造 READ_WRITE 会话四步利用链, 武器化门槛公开化
- 同批 KEV watchlist: CVE-2026-93952 Arista VeloCloud (10.0), CVE-2026-94127 F5 BIG-IP APM
- 文件: intel/kev_2026-09-22_checkpoint.jsonl（CVE 明细）+ kev_2026-09-22_checkpoint_index.json
 （索引+缓解+猎杀 quickref）；证据: gap_workspaces/gap-20260926-001/evidence/（CISA KEV JSON
 + FIRST EPSS 一手仲裁 + 三家第三方全文, 机械闸门 3/3 PASS）
