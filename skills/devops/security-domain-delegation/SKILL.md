---
name: security-domain-delegation
description: "派工安全/情报/渗透类任务给hack团队时用：授权门判定+红线入卡+被动源playbook。"
version: 1.0.0
metadata:
  hermes:
    tags: [security, delegation, kanban, hack-team, authorization-gate, passive-recon]
    related_skills: [delegation-brief-format, scale-adaptive-routing, worker-completion-independence-verification]
---

# Security-Domain Delegation（安全域任务派工：授权门 + 红线传播 + 被动源 Playbook）

> 来源：2026-08-27 phlexing 盘点五卡闭环（T1 网络面 / T2 本地编目 / T3 暴露面 / T4 独立合并 / T5 IP 画像）。
> 4 个 hack worker 全程零目标流量、零凭据尝试、零越界；合并报告经独立 Checker 18 项断言核验全过。
> 该模式已被一次完整实战验证，细节与判例索引见 `references/security-task-redline-playbook.md`。

## When to Use

- 收到对**第三方真实资产**（公司域名/IP/员工/代码仓库）的情报、测绘、渗透、监控类请求，需要派工给 hack-recon / hack-auditor / hack-forensics / hack-exploit
- 用户指令包含"渗透/攻击/访问/挂代理访问"等主动动作词
- 已有授权门挡下的主动项，用户换措辞再次提出
- 安全域任务需要独立 Checker 合并多方产出

## 核心流程

### 1. 授权门判定（派工前，必过）

三问：
1. **被动 or 主动？** 查第三方数据库/缓存（whois/CT/被动DNS/搜索缓存/平台API）= 被动 → 可执行。任何直接连接目标（扫描/HTTP/TLS握手/指纹/登录验证）= 主动 → 门控。
2. **授权来自哪一侧？** 对第三方运营资产，授权必须来自**目标侧**（授权书/SOW/投后尽调委托/SRC覆盖）。集群所有者的指令是必要条件不是充分条件，不能替代目标侧授权。
3. **换皮识别**：已门控的主动动作换说法出现（判例："搭代理将测绘资产统一挂在代理后访问" = 经代理向目标发流量；"测绘及渗透" = 主动项混进被动清单）→ 拆成「允许的被动部分（立即执行）+ 仍门控的主动部分（书面授权解锁）」两半，向用户明说边界。**门不可被措辞绕过。**

解锁通道（按可行性排序）：① 投后安全尽调（投资方投后管理正式委托，手里握着对方该知道的泄露情报时配合意愿高）；② 目标方公开 SRC/赏金；③ 资产归属证明。解锁前，"只能主动验证"的信息一律在报告登记**待授权项**（依据+建议执行方），worker 不得现场自行执行。

### 2. 红线契约随卡传播（worker 看不到 orchestrator 的 SOUL）

红线**逐字写进每张子卡** body 的任务契约段（零目标流量/零凭据尝试/不下载源码/本地只读/无凭据历史库如实记空档），配 frozen 验收标准：每条资产来源+时间戳、关键结论 ≥2 独立源（单源标 ⚠️）、报告必含「边界声明」节（未测区域显式清单）、产出物写死绝对路径+精确文件名、覆盖度声明（probed/skipped/fingerprinted）。

模板全文见 `references/security-task-redline-playbook.md` §二。

### 3. 分工与 Diamond Checker

- 三面 MECE 拆分（网络面→hack-recon / 本地数据→hack-auditor / 暴露面→hack-forensics），Checker（hack-exploit）parents 三面做独立合并
- Checker 卡附加条款：**缺文件不代写**，`kanban_block(kind="dependency")` 退回；Checker 修正以「修正 A/B/C」留痕，不改子报告原文（保审计轨迹）
- 合并 = 幸存内容（去重排序、数字逐项可加总核对），不是拼盘

### 4. 被动源查询要点

先复用同 workspace 已落盘证据再查新源；每源证据文件落盘（脚本+原始响应），报告只引用文件。10 个实测可用源的用法与坑（crt.sh 502 退避、通配证书下 CT 盲区、Bing 单源必标、RDAP 企业专线判据等）见 references §三。

### 5. 本机情报服务安全

TLP:AMBER 情报的本机浏览组件只绑 `127.0.0.1`（绝不 0.0.0.0）+ 路径穿越防护；「经代理访问活目标」的反代配置落成 `*_DISABLED` 禁用态文件，启用前置条件（授权留痕）写在文件头。

## Pitfalls

- **红线只写在 orchestrator 侧**：worker 看不到，必越界。逐字入卡。
- **授权门被措辞绕过**：见 §1 第 3 问判例。任何"间接发流量到目标"的变体都算主动。
- **Checker 代写补数据**：污染审计轨迹。缺件退回，不补。
- **把无凭据历史库当可用源**：Shodan/Censys/FOFA 无 API key 时如实记空档，禁止为绕过凭据对目标发请求（Censys 实测 401）。
- **单源线索当结论**：Bing 缓存的非标端口线索必须标 ⚠️ 单源未验证，进待授权项。

## 与其他 skill 的联动

- `delegation-brief-format`：本 skill 是其在安全域的特化（红线契约 = 七要素模板的约束段强化版）
- `worker-completion-independence-verification`：Checker 独立核验的具体手法
- `scale-adaptive-routing`：先过路由门再进本 skill 的授权门