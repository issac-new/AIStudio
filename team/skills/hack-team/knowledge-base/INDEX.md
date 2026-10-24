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
