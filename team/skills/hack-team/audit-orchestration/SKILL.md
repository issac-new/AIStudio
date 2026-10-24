---
name: audit-orchestration
description: 8-Agent 并行安全审计编排。触发：全面安全审计、多 Agent 并行漏洞扫描、审计结果加权评分。参考 claude-cybersecurity 4 阶段（GATHER→ANALYZE→RECOMMEND→EXECUTE）。
---

# Audit Orchestration — 8-Agent 并行审计编排

为 hack-auditor 提供 8 个专家 Agent 的并行审计编排设计。参考 claude-cybersecurity 的 4 阶段编排模型（GATHER → ANALYZE → RECOMMEND → EXECUTE），将审计任务分发到专家 Agent 并行执行，最后聚合加权评分。

---

## 1. 四阶段编排总览

```
┌──────────┐   ┌──────────┐   ┌────────────┐   ┌──────────┐
│  GATHER  │ → │ ANALYZE  │ → │ RECOMMEND  │ → │ EXECUTE  │
│ 情报收集  │   │ 并行分析  │   │ 聚合评分    │   │ 修复执行  │
└──────────┘   └──────────┘   └────────────┘   └──────────┘
```

### 阶段 1：GATHER（情报收集）
- 枚举目标：代码仓库结构、依赖清单（package.json / requirements.txt / go.mod / pom.xml）、IaC 文件（Terraform/K8s/Dockerfile）、配置文件。
- 识别技术栈：框架（Django/React/Vue/Angular/Spring/Rails）、语言、部署目标。→ 决定 FP 抑制表与 Agent 激活子集。
- 产出：`audit-context.json`（技术栈指纹 + 文件清单 + 攻击面草图）。

### 阶段 2：ANALYZE（并行分析）
- 按 §2 的 8 个专家 Agent **并行**派发任务（每个 Agent 一份 delegation brief）。
- 每个 Agent 独立产出 findings，强制按 §4 的置信度四级 + §3 的评分公式自评。
- Agent 间不共享中间结论（避免锚定偏差），只共享 GATHER 阶段的 context。

### 阶段 3：RECOMMEND（聚合评分）
- 收集全部 findings → 去重（同文件同 sink 同源）→ 交叉验证（多个 Agent 命中同一处时 confidence 提升一档）。
- 应用 §5 框架感知 FP 抑制表降级已知模式误报。
- 计算加权 Score，排序输出 Top-N，触发 §6 Auto-CRITICAL Gate。

### 阶段 4：EXECUTE（修复执行）
- 对每个 HIGH/CRITICAL finding 生成修复建议 + 补丁草案。
- 修复后再跑一次相关 Agent 做回归验证（fix-verification loop）。
- 未修复项写入 backlog，标注 accepted-risk 或 pending。

---

## 2. 八个专家 Agent 定义

| # | Agent | 职责 | 典型工具/方法 | 输出重点 |
|---|-------|------|--------------|----------|
| 1 | **Vulnerability Scanner** | 通用漏洞模式扫描：注入（SQLi/XSS/命令注入）、SSRF、反序列化、路径穿越 | SAST 规则 + 污点分析 | source→sink 链路、CWE 编号 |
| 2 | **Authorization Reviewer** | 鉴权与访问控制：水平/垂直越权、IDOR、缺失的权限检查、CORS 配置 | 路由表 × 权限装饰器交叉比对 | 未保护端点清单、越权路径 |
| 3 | **Secret Scanner** | 硬编码凭据：API key、token、私钥、数据库密码、.env 泄漏 | 熵检测 + 正则库 + git history 扫描 | 密钥类型、暴露位置、是否已入库 |
| 4 | **Dependency Auditor** | 第三方依赖漏洞：已知 CVE、供应链风险、过期版本、typosquatting | SBOM 生成 + CVE 数据库比对（OSV/GitHub Advisory） | 受影响依赖、可达性（reachable?） |
| 5 | **IaC Scanner** | 基础设施即代码：Terraform/K8s/Docker 配置错误、过宽 IAM、公开 bucket | Checkov/tfsec/kubesec 规则集 | 错误配置、云资源暴露面 |
| 6 | **Threat Intelligence** | 威胁情报关联：组件是否在被主动利用（CISA KEV）、暴露的指纹、攻击面映射 | KEV/EPSS 查询 + 资产指纹 | 在野利用可能性、优先级修正 |
| 7 | **AI Code Auditor** | AI 生成代码专项：幻觉依赖、不安全默认、复制粘贴漏洞、prompt-injection 面 | 模式库（AI 代码典型缺陷）+ LLM 复审 | AI 特有缺陷、可信度标注 |
| 8 | **Logic & Design Reviewer** | 业务逻辑与设计缺陷：竞态、价格篡改、流程绕过、加密误用、架构级风险 | 威胁建模（STRIDE）+ 人工式推理 | 设计层缺陷、场景化攻击链 |

**派发规则**：GATHER 阶段的技术栈指纹决定激活子集——纯前端项目可跳过 IaC Scanner；无云资源可跳过 Dependency Auditor 的 K8s 部分。默认全部激活。

---

## 3. 加权评分公式

```
Score = Base Severity × Confidence × Exploitability ± Context
```

| 因子 | 取值 | 说明 |
|------|------|------|
| **Base Severity** | CRITICAL=10 / HIGH=8 / MEDIUM=5 / LOW=2 / INFO=1 | 漏洞类别固有权重（CWE 映射） |
| **Confidence** | HIGH=1.0 / MEDIUM=0.7 / LOW=0.4 / INFO=0.1 | 见 §4 置信度四级 |
| **Exploitability** | 1.0=可直接远程利用 / 0.8=需低权限 / 0.5=需用户交互或内网 / 0.2=理论可利用 | 攻击者视角可达性 |
| **Context 修正** | ±0~3 | 加分：互联网暴露(+2)、KEV 在列(+3)、处理 PII(+1)；减分：内网隔离(-1)、已有 WAF 规则(-1)、dev-only(-2) |

**等级映射**：Score ≥ 9 → P0 立即修复；6–8.9 → P1 本周；3–5.9 → P2 迭代内；< 3 → P3 backlog。

---

## 4. 置信度四级

| 级别 | 分数区间 | 判定标准 |
|------|----------|----------|
| **HIGH** | 90–100 | 完整 source→sink 链路可追踪，攻击者可控输入已证实，无中间 sanitizer |
| **MEDIUM** | 60–89 | 链路存在但存在不确定环节（如未知过滤函数、框架行为待确认） |
| **LOW** | 30–59 | 模式匹配命中但数据流未证实；或可达性存疑 |
| **INFO** | < 30 | 仅启发式命中，大概率误报，记录待查 |

**规则**：任何 finding 必须带置信度分数；无数据流支撑的模式命中不得高于 MEDIUM。

---

## 5. 框架感知 FP 抑制表

命中以下模式时，自动将 finding 降级一档（HIGH→MEDIUM…），并标注 `fp-suppressed: <框架规则>`：

| 框架 | 抑制规则 | 理由 |
|------|----------|------|
| **Django** | 模板变量默认转义 → XSS finding 降级（除非 `\|safe` / `mark_safe`）；ORM 参数化查询 → SQLi 降级（除非 `raw()`/`extra()`） | 框架内置防护 |
| **React** | JSX 表达式自动转义 → XSS 降级（除非 `dangerouslySetInnerHTML`）；`javascript:` URL 在 href 中 React 16.9+ 警告 | 默认转义 |
| **Vue** | `{{ }}` 插值自动转义 → XSS 降级（除非 `v-html`） | 默认转义 |
| **Angular** | 内置 DomSanitizer → XSS 降级（除非 `bypassSecurityTrust*`）；HttpClient 默认 XSRF token 处理 | 默认净化 |
| **Spring** | Spring Security 配置正确时 CSRF finding 降级；`@PreAuthorize` 覆盖的端点 → 越权降级；JPA 参数绑定 → SQLi 降级（除非 native query 拼接） | 框架防护链 |
| **Rails** | ERB `<%= %>` 默认转义 → XSS 降级（除非 `html_safe`/`raw`）；ActiveRecord 参数化 → SQLi 降级（除非字符串插值）；`protect_from_forgery` → CSRF 降级 | 约定优于配置 |

**抑制纪律**：抑制只降置信度/等级，**不删除** finding；每条被抑制的 finding 保留原始证据，供 fp-check 复核。例外条件（如 `v-html`、`raw()`）必须先升级再送 fp-check。

---

## 6. Auto-CRITICAL Gate

```
IF 任一 finding 满足: severity == CRITICAL AND confidence == HIGH
THEN 立即触发:
  1. 中断正常报告排序，将该 finding 置顶并红色标注
  2. 输出警告块: "🚨 AUTO-CRITICAL: <标题> — <位置> — 建议立即处置"
  3. 跳过 P 级映射，直接指派 P0，并生成即时缓解建议（如 WAF 临时规则、功能开关）
  4. 该 finding 自动进入 fp-check Deep Path 复核（不阻塞警告发出）
```

**警告先于确认**：Auto-CRITICAL 不等待 fp-check 复核结果即发出警告——宁可误报一次，不可漏报一次。复核推翻时降级并记录。

---

## 7. 执行清单

1. [ ] GATHER：生成 audit-context.json（技术栈指纹 + 攻击面）
2. [ ] 按指纹决定 8 Agent 激活子集，派发并行 delegation brief
3. [ ] 收集 findings，强制每个带 confidence 分数与 CWE 编号
4. [ ] 交叉命中去重 + confidence 提升
5. [ ] 应用框架 FP 抑制表
6. [ ] 计算加权 Score → P0–P3 排序
7. [ ] 检查 Auto-CRITICAL Gate
8. [ ] 所有 HIGH+ finding 送 fp-check 复核
9. [ ] EXECUTE：修复建议 + 补丁草案 + 回归验证

## 关联

- 复核流水线：`fp-check`（六门审查规则）
- 高危命令二审：`codex-guardian-review`
