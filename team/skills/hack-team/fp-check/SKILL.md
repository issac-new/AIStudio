---
name: fp-check
description: 安全审计发现六门审查（误报消除）。触发：复核漏洞 finding、验证审计结论、降低误报率。参考 Trail of Bits fp-check 验证流水线。每道门不过即阻塞。
---

# fp-check — 六门审查规则

为 hack-auditor 提供 finding 级误报消除流水线。参考 Trail of Bits fp-check 的 6 阶段验证方法：任何 finding 在被报告为真实漏洞前，必须依次通过 6 道门审查；**每道门不过就阻塞**（blocked），不得跳门、不得降级绕过。

---

## 1. 两条路径

### Standard Path（简单 bug，6 步）
适用于：模式清晰、数据流局部、单一文件内可验证的 finding（如硬编码密钥、明显注入、已知 CVE 依赖）。

```
Data Flow → Exploitability → Impact → PoC Sketch → Devil's Advocate → Gate Review
```

### Deep Path（复杂 bug，8 步）
适用于：跨模块数据流、业务逻辑缺陷、Auto-CRITICAL 触发项、框架抑制表例外项、多 Agent 交叉命中但证据冲突的 finding。

```
Claim Analysis → Context Extraction → Data Flow → Exploitability → Impact → PoC → Devil's Advocate → Gate Review
```

**路径选择**：默认 Standard；满足任一条件必须升级为 Deep：① Auto-CRITICAL 触发；② 跨 ≥3 文件的数据流；③ 涉及鉴权/加密/资金逻辑；④ 被框架 FP 抑制表降级过但例外条件存疑。

---

## 2. 各阶段定义

### 阶段 0：Claim Analysis（仅 Deep Path）
- 提取 finding 的**核心断言**（claim）：谁、在哪、通过什么输入、造成什么后果。
- 拆解为可独立验证的子断言列表；每个子断言标注所需证据。
- 产出：`claims[] = { statement, required_evidence, status }`。

### 阶段 0.5：Context Extraction（仅 Deep Path）
- 收集断言验证所需的全部上下文：调用方、被调方、中间件、框架配置、部署拓扑。
- 明确**信任边界**：哪些组件在攻击者控制侧，哪些在防御侧。
- 产出：`context-map.md`（组件图 + 信任边界标注）。

### 阶段 1：Data Flow（数据流追踪）
- 从 source（攻击者可控入口）到 sink（危险操作点）逐跳追踪。
- 每一跳记录：文件:行号、变量/参数名、类型变换、经过的 sanitizer/validator。
- **断链处理**：任一跳转无法证实时，不得假设"可能存在"，标记 `data-flow-gap` 并降级 confidence。

### 阶段 2：Exploitability（可利用性）
- 确认攻击者对 source 的控制程度：完全控制 / 部分控制 / 仅间接影响。
- 评估前置条件：所需权限、交互、竞态窗口、目标环境约束。
- 回答："真实攻击者在目标部署形态下，能否把恶意输入送达 sink？"

### 阶段 3：Impact（影响评估）
- 具体化后果：读什么数据 / 改什么状态 / 执行什么代码 / 影响哪些用户。
- 区分**理论影响**与**部署影响**（如 SSRF 打内网，但目标无内网服务则影响收缩）。
- 评估 blast radius：单用户 / 全租户 / 整个系统。

### 阶段 4：PoC Sketch（概念验证草图）
- 写出可执行或可复现的 PoC 概要：具体输入、请求序列、触发路径、预期观察点。
- 不要求完整武器化，但必须具体到"换一个工程师能照着复现"。
- 写不出具体 PoC 的 finding，confidence 不得高于 LOW。

### 阶段 5：Devil's Advocate（魔鬼代言人）
- 主动为**误报**辩护，列出 ≥3 条该 finding 可能是误报的理由：
  - 是否存在未发现的 sanitizer / 框架默认防护 / WAF 规则？
  - 攻击者控制假设是否过强？（如输入实际来自可信上游）
  - 部署形态是否使路径不可达？（如 dev-only 端点、feature flag 关闭）
- 每条反驳给出核实结论：`refuted`（反驳不成立，附证据）或 `confirmed`（反驳成立 → 降级或推翻）。

### 阶段 6：Gate Review（门审查终审）
- 依次检查 §3 的 6 道门，输出每门 PASS / BLOCKED 及一句话理由。
- 任一 BLOCKED → 整个 finding 标记 `blocked`，退回对应阶段补证据；补不齐则判定 **FALSE POSITIVE**，归档并记录推翻理由。
- 全部 PASS → 判定 **CONFIRMED**，恢复/确认最终 severity 与 confidence。

---

## 3. 六道门

| # | 门 | 通过标准 | 阻塞条件 |
|---|-----|----------|----------|
| 1 | **数据流完整性门** | source→sink 每一跳有文件:行号证据，无 `data-flow-gap` | 存在未填补的链路缺口；中间函数行为未知 |
| 2 | **攻击者控制门** | 已证实攻击者对 source 输入的控制程度与注入位置 | source 实际来自可信源/硬编码/管理员-only |
| 3 | **边界证明门** | 已枚举路径上全部 sanitizer/validator/框架防护，并证明可绕过或不存在 | 存在防护且未证明可绕过（"可能能绕过"不算） |
| 4 | **环境影响门** | 影响在**目标实际部署形态**下成立（非仅理论） | 仅 dev/test 可达；依赖不存在的服务；影响被架构隔离 |
| 5 | **PoC 可行性门** | PoC 草图具体到输入+路径+预期观察点，第三方可复现 | 只有概念描述无具体输入；触发依赖未证实的巧合条件 |
| 6 | **对抗性审查门** | Devil's Advocate 全部反驳均已核实并 refuted（或已吸收进降级结论） | 存在未核实的反驳；任一反驳 confirmed 但未降级 |

**阻塞纪律**：门不过 → BLOCKED，findings 不得进入报告正文（可入附录标注 blocked）。严禁"先报告再说"。

---

## 4. 输出格式

每个复核过的 finding 产出一份裁定记录：

```yaml
finding_id: F-0042
title: "SQL injection in user search"
path: deep            # standard | deep
verdict: confirmed    # confirmed | false_positive | blocked
gates:
  data_flow:     { result: pass, note: "req.query.q → db.raw() @ api/search.py:41" }
  attacker_ctrl: { result: pass, note: "anonymous, full control of q" }
  boundary:      { result: pass, note: "no sanitizer; ORM bypassed via raw()" }
  impact:        { result: pass, note: "full users table read; prod DB confirmed" }
  poc:           { result: pass, note: "GET /search?q=' UNION SELECT ... " }
  adversarial:   { result: pass, note: "3 refutations checked, all refuted" }
final:
  severity: critical
  confidence: 95
  score: 10.0
```

---

## 5. 与其他组件的关系

- **输入**：`audit-orchestration` 产出的 HIGH+ findings、Auto-CRITICAL 项、框架抑制表例外项。
- **输出**：CONFIRMED findings 回到审计报告正文；FALSE POSITIVE 归档反哺 FP 抑制表（新增模式需人工确认后入库）。
- **原则**：fp-check 是减法不是加法——它只负责推翻或确认，不负责发现新漏洞。

## 6. 漏洞三态账本接线（target-scoped-workspace × pentest-methodology-fusion）

> 来源：bface-agent 验证闭环——「可复现才入账，报告只收已验证」（原始证据：
> workspace/websec-tools-survey/raw/tools/bface-agent_README.md，2026-09-09）。
> 三态判定定义以 `pentest-methodology-fusion` §4 Finding Confirmation Protocol
> 为**单一事实源**，本 skill 不另立定义，只接线到账本与报告流。

### 账本挂接点

- **账本位置**：每个目标的漏洞作战台账是
  `reports/<TARGET_SLUG>/engagement/vulnerabilities.md`
  （骨架：`target-scoped-workspace/templates/engagement/vulnerabilities.md`）。
  finding 一旦进入 fp-check 流程即先在账本登记：有可执行验证线索（可复现请求/
  PoC 草图）的登记 **Candidate**，纯代码审计推测登记 **Theoretical**；
  禁止无账本记录直接产报告。

### 三态流转与六门的接线关系

- **Theoretical → Candidate**：出现可执行验证线索（具体输入 + 触发路径）即升级
  Candidate，进入本 skill 六门流水线（Standard/Deep 路径照旧）。
- **Candidate → Confirmed**：**六门全部 PASS（阶段 6 Gate Review 判定
  CONFIRMED）是唯一晋级凭据**。任一门 BLOCKED 即停在 Candidate，按 §3 阻塞纪律
  退回补证据；严禁因报告期限降门放行。
- **Theoretical 显式降级**：始终产不出 PoC 草图（阶段 4 约束：confidence ≤ LOW）
  或数据流断链无法填补的项，在账本保持/显式降为 Theoretical——只允许出现在报告
  附录（标注「未验证」）或作为 `verification_path` 交接给下一会话，禁止进正文。
- **报告准入**：与 §3 阻塞纪律一致——报告正文与 `findings/` 目录仅接受账本中
  状态 = Confirmed 的条目；Candidate 只可入附录标注「验证中」。

### 双向引用

- `pentest-methodology-fusion` §4 的 Confirmed 判据（PoC + 可复现 curl + 响应证据
  + 影响证明）= 本 skill 六门 PASS 后裁定记录的产物形态，两处判据同一，不重复维护。
- 该 skill 的落盘动作「Confirmed → kanban_complete metadata.findings」执行时，
  必须同步把账本行更新为 Confirmed 并回填 finding_id；账本、裁定记录 YAML 与
  kanban metadata 三处不一致时，以账本 + 裁定记录 YAML 为准并先修正再交付。

---

## 执行清单

1. [ ] 判定路径：Standard 还是 Deep
2. [ ]（Deep）Claim Analysis + Context Extraction
3. [ ] Data Flow 追踪，逐跳记录证据
4. [ ] Exploitability 与 Impact 评估（基于实际部署）
5. [ ] PoC 草图
6. [ ] Devil's Advocate ≥3 条反驳并逐条核实
7. [ ] 六道门逐一裁定，任一 BLOCKED 即退回
8. [ ] 输出裁定记录 YAML，归档结论
9. [ ] 账本同步：在 reports/<TARGET_SLUG>/engagement/vulnerabilities.md 登记/更新该 finding 的三态状态与晋级凭据
10. [ ] Confirmed 结论回写账本（回填 finding_id）后，方可进入报告正文与 findings/
