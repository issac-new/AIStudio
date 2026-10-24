---
name: adcs-detection-baseline
description: "AD CS 攻击链检测基线（ESC1→PKINIT→DCSync）— 9 条 Windows 事件日志检测规则（R1-R9）+ 审计开关陷阱（AuditFilter=4 ≠ 审计开启）+ AI Agent 攻击行为时序预算（105.4s/35 次调用 vs 人工 9.29s）+ 最小阻断集。来源 FreeBuf 501589 一手靶场实测（gap-20260925-003）。"
version: 1.0.0
author: "hack-auditor (gap-20260925-003 / t_9495b43b)"
license: MIT
metadata:
  hermes:
    tags: [adcs, ad-cs, esc1, dcsync, pkinit, certipy, detection, windows-event-log, siem-rules, ai-agent-attack, blue-team, audit-baseline]
    related_skills: [intranet-penetration-sop, attack-path-graph, pentest-methodology-fusion, scope-gate]
---

# AD CS 攻击链检测基线（adcs-detection-baseline）

> **版本**: v1.0.0（2026-10-03，gap-20260925-003 / t_9495b43b）
> **来源**: FreeBuf《从 alice 到域控：AI Agent 用 105 秒，人只用 9 秒，多出来的 96 秒被 4 条规则盯上了》（2026-09-24 发表，第一手隔离靶场实测，六组对照）
> **证据**: evidence/e001.txt（全文抓取，curl 200 / 83292 bytes）；evidence/e003.txt（集群技能库覆盖 grep 零命中）
> **markings**: TLP:GREEN/CLEAR

## 触发条件 / When to Use

- 客户环境 / 靶场存在 Windows AD 域 + 企业 CA（AD CS），需要评估证书攻击面检测能力
- 蓝队评估：检查「证书服务审计是否真的开启」、验证 DCSync / PKINIT 检测规则覆盖
- 红队执行 AD CS 攻击链（ESC1 等）时预判哪些日志会留痕、控制 OPSEC
- 评估 AI Agent 自动化攻击的时间预算与行为特征（速率型检测规则的价值）
- hack 团队内网渗透任务中攻到域层（intranet-penetration-sop Phase 3 横向阶段）

## 核心内容

### 1. 攻击链与事件映射（四步链）

```
certipy find（枚举 AD CS）
  → ESC1：普通域用户 alice 申请 SAN=administrator@corp.local 证书
    → PKINIT：证书换 Administrator 的 Kerberos TGT
      → DCSync：拖取域管哈希 + krbtgt 哈希
```

| 攻击步骤 | 事件 ID | 关键结构化字段 | 默认配置下可见性 |
|---|---|---|---|
| ESC1 证书申请/签发 | 4886/4887 | `Requester` + `Attributes`（内含 SAN） | 零条（全盲），需开审计子类 |
| PKINIT 域管 TGT | 4768 | `TargetUserName` + `CertIssuerName` | 仍记录（R2' 单事件可用） |
| DCSync | 4662 | `SubjectUserName` + `Properties`（复制权限 GUID） | 可见，但告警滞后 8.64s |
| 认证风暴（AI 探索期） | 4624(type3)/4776 | `TargetUserName` 速率 | 可见（R5 速率规则） |
| Kerberos 用户枚举 | 4768(Status≠0x0)/4771 | 失败码 0x6 + 唯一用户名数 | 可见但无规则覆盖（需 R9） |

### 2. 检测规则集 R1–R9（可直接抄）

> 全部规则必须解析**事件 XML 结构化字段**，禁止匹配本地化 Message 文本——原文实测：英文关键字（`Account Name:`/`Requester:`）匹配 Message 在中文系统上 4662/4768/4624 全部漏判。

| 规则 | 数据源/字段 | 判定逻辑 | 实测表现 | 适用性 |
|---|---|---|---|---|
| R1 | 4886/4887；Requester+Attributes(SAN) | 申请者账号与证书 SAN 不一致 | 5.6s（人工）/ 3.2s（AI） | 需先开证书服务审计子类 |
| R2 | 4768；TargetUserName+CertIssuerName，关联 4887 | 证书签发后 5 分钟内高权限 PKINIT TGT | 4.8s / 2.3s | ⚠️ 强关联：4887 采不到则 R2 一起失效 |
| R2' | 4768 单事件；CertIssuerName=企业CA 且目标高权限 | 证书型 PKINIT | DCSync 前约 5s，实时告警提前约 3s | **默认配置也能用，优先采用** |
| R3 | 4662；SubjectUserName+Properties 复制权限 GUID | 非机器账号访问 Replicating Directory Changes | 3.9s / 2.5s，命中 18/24 条 | 高可靠；需去重（一次 DCSync 刷屏） |
| R4 | 4688/Sysmon CommandLine | certipy/secretsdump 工具指纹 | DC 侧 0 命中 | 需攻击者端点遥测，DC 单机无效 |
| R5 | 4624(type3)/4776；TargetUserName 速率 | 5 分钟内认证 ≥15 次 | AI 提前 13.3s 命中；人工 0 命中 | 对 AI/扫描器有效，对熟练人工无效 |
| R6 | 5136/Sysmon 注册表；CA 与模板对象 | CA 配置、模板属性变更 | 基线 0 误报 | 低频高价值 |
| R7 | auditpol | 证书服务子类未开或 AuditFilter≠4 | 默认组命中 | **专治「以为开了」** |
| R8 | 4662 非复制访问 | 5 分钟 ≥30 次目录访问 | 未触发 | 阈值需按环境校准 |
| R9（新增建议） | 4768(Status≠0x0)/4771 | 5 分钟内失败 ≥30 次且唯一用户名 ≥20 | G3 实测 228 次枚举零覆盖 | 加固后侦察信号，兼作加固生效反馈 |

PowerShell 结构化字段解析骨架（语言无关，决定规则在真实环境能否使用）：

```powershell
$xml = [xml]$evt.ToXml()
$d = @{}
foreach($item in $xml.Event.EventData.Data){
  $d[$item.Name] = $item.'#text'
}
# 4662 DCSync：$d['SubjectUserName'] + $d['Properties']
# 4768 PKINIT：$d['TargetUserName'] + $d['CertIssuerName']
# 4886/4887：$d['Requester'] + $d['Attributes']（内含 SAN）
```

### 3. 审计开关陷阱（最高频踩坑，先查这个）

`certutil -setreg CA\AuditFilter 4` 已设置且 CertSvc 已重启 ≠ 审计开启。证书服务审计子类（GUID `{0CCE9221-69AE-11D9-BED3-505054503030}`）未打开时：

- 4886/4887 零条，证书申请与签发完全不可见，整条链只剩 DCSync（4662）
- 首次告警滞后 8.64s，而人工攻击 8.1s 就已打完——告警到达时攻击已结束

一行验证：`auditpol /get /subcategory:"Certificate Services"`（看是否 No Auditing）。

### 4. AI Agent 攻击时序预算（G2 实测）

| 执行者 | 耗时 | 工具调用 | 检测窗口 |
|---|---|---|---|
| 人工（4 条命令） | 8.1–9.29s | 4 | R1 仅比首个 DCSync 早 0.46s，R3 在攻击结束后才到 → 基本无响应窗口 |
| AI Agent（Claude Code + DeepSeek，仅 Bash，无方法提示） | 105.4s | 35 | R5 在首个 DCSync 前 13.3s 告警；R3 告警后 AI 还运行 28.9s → 十几到几十秒窗口 |

AI 告警时间轴：+60.8s R5 命中（ALICE 5 分钟 15 次认证）→ +70.1s R1 → +72.7s R2 → +74.1s 首个 DCSync 4662 → +77.3s R3 → +106.3s AI 宣告完成。

**三条工程结论**：

1. **AI 不是更隐蔽，是更慢更碎**：4 步拆成 35 次操作，反复认证/试错留下更多可观测行为；速率型/枚举型规则（R5/R9）对 AI 有效、对熟练人工无效。
2. **检测到 ≠ 拦得住**：窗口十几秒，告警只进人工队列时结局与不告警无异；需自动封禁/隔离才兑现。
3. **加固优先于检测**：静态加固让 AI 98 次调用/584s 零进展——一条配置变更比十条规则更能决定攻击成败。

### 5. 最小阻断集（本例效果 100%）

1. `Disable-ADAccount alice`——禁用被滥用的普通账号
2. User 模板 `msPKI-Certificate-Name-Flag` 从 1 改 0，移除 `ENROLLEE_SUPPLIES_SUBJECT`，从配置上消除 ESC1
3. 保留 SMB 签名要求（实测直接废掉 ESC8 NTLM 中继路径）
4. 环境允许时再收紧模板 ACL 与 DCSync 权限（纵深防御）

**如果只能做一件事：先修模板配置。**

### 6. 规则设计三纪律（来自原文实测教训）

1. **不要把关键规则设计成强关联事件链**——A 事件采不到时依赖 A 的 B 一起失效；能用单事件判定的就单独成规则（R2' 优于 R2）。
2. **解析事件 XML 结构化字段，不匹配本地化 Message**——中文系统英文关键字全漏判。
3. **加固后的侦察也是信号**——被挡住的攻击者会持续枚举（228 次 4768 / 168 用户名 / 峰值 125 次/分钟），R9 既抓「有人在试」也是加固生效的反馈。

## 局限（引用数据时必须带上）

- 单域、单 CA 自建靶场；规则以 2 秒轮询实现，非实时事件订阅
- AI 只测了一个模型（Claude Code + DeepSeek）与一份提示词；无真实 SOC 响应模拟
- R4 需端点遥测，DC 单机不可验证；靶场 Web Enrollment 指向不存在的 WIN19-CA，ESC8 路径不可用（解读「加固有效」时需保留）
- 数字（105.4s/9.29s/13.3s 等）是他人实验条件下的实测值，非本团队自建环境数据——引用时注明出处；自建靶场复现见 gap-20260925-005

## 与其他 skill 的联动

| Skill | 联动方式 |
|-------|---------|
| `intranet-penetration-sop` | 本基线是其 Phase 3（凭据提取/横向）AD 域层检测面的补充；红队侧预判留痕 |
| `attack-path-graph` | R1-R9 命中节点作为检测覆盖标注并入攻击路径图谱 |
| `pentest-methodology-fusion` | Finding 格式、coverage tracking 对齐 |
| `scope-gate` | 任何主动验证（auditpol 检查、规则回放）须在授权范围内 |

## 引用与回写

- **上游证据**: FreeBuf 501589（2026-09-24），evidence/e001.txt + e002.txt（gap-20260925-003 工作区）
- **gap 寄存器**: gap-20260925-003（本基线落地验证）
- **关联 gap**: gap-20260925-005（AD CS 靶场自建复现，本团队自有时间线基线——补上「引用数据非自有实测」的局限）
