---
name: commerce-agents-trust-patterns
description: "Agent 信任模式落地：fencing 净化、staged 双重复验、ID 溯源、评测配对。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, security, harness, evals, safety]
    related_skills: [prompt-injection-guard, agent-harness-best-practices, codex-guardian-review]
---

# Commerce-Agents 信任模式（commerce-agents-trust-patterns）

> 来源：anthropics/commerce-agents（Apache-2.0，2026-09-03）+ 同名博客《A guide to the anatomy of effective commerce agents》。
> 融合日期：2026-09-04。核心哲学一句话：**模型最危险的动作是提议，不是执行——enforcement lives in the harness。**

## When to Use

- 给任何 agent/team 设计或评审**安全门、写保护、审批链**时
- 要把不可信第三方文本（网页抓取/tool 返回/用户粘贴）放进 prompt 时
- 设计行为评测（evals）套件，或评审现有套件的覆盖缺口时
- 判定一个新能力该做进单循环 skill 还是拆 subagent 时

## 四大模式

### 1. Fencing 净化（第三方文本入 prompt 前的中性化）

不可信文本先净化再入上下文。五步全部线性复杂度：NFKC 归一化 → 15 段不可见 Unicode 剥离（零宽/bidi/tag 字符）→ fence 标记自引用剥除到**不动点**（防嵌套重组）→ transcript/tool-call 标签伪造剥除 → 伪造 turn 边界中和（`\n\nhuman:` → `human -`）→ 尺寸封顶 12000 chars。

**本机已落地**：`prompt-injection-guard` skill 的 `scripts/sanitize_text.py`（独立净化器）+ `pi_scan.py --sanitize`（检测+净化双向）。直接用，勿重复造。

边界：净化器不清除明文指令语义（那是检测网+guardian 职责）；它保证第三方文本无法伪装成系统/对话边界。

### 2. Staged-Change 双重复验（高危写保护）

- 模型产出的不是执行而是**带服务端生成 ID 的 staged change**
- apply 只接受经真实审批面批准的 ID（聊天里说"批准了"不算）
- **apply 时复跑全部 guardrails，用 apply 当时的限额**——stage 与 apply 之间规则变了按新规则拒
- 封顶按**结果状态**（增量叠加不能越限）而非单次请求；同会话写串行化

**本机已落地**：`_shared/action-risk.md` §1.2（协议层映射：staged→kanban_comment 提案，审批→人类 unblock，apply 复验→执行前重对 HumanGate 清单）。

### 3. ID 溯源（provenance gate）

写操作只接受本会话内服务端返回过的 ID；幻觉/粘贴/第三方植入的 ID 在进后端前被拒，**拒绝消息附修复指引**（先调哪个工具拿到合法 ID）。

**本机同构**：kanban kernel 的 phantom-id 拒绝（`created_cards` 校验）；terminal/file 域暂无通用门，协议层按 §1.2 落。

### 4. 评测纪律（snapshot 式 + 正负配对 + 毒化 fixture）

- **state 注入出题**，不靠伪造多轮堆历史（busy 历史后才出现的行为 clean-state 测不到）
- 每个 should-serve 配 should-refuse 对照；漏负例是最常见缺口
- 判最终状态与工具参数，不判路径；rubric 一条 PASS 一条 FAIL 无交集
- 注入测试的恶意数据放 eval-only fixture，断言负例且必配 benign 对照（防"全拒绝"作弊通过）

**本机已落地**：`_shared/evals/baseline.md`「评测方法升级」节，T12+ 追加题强制按此出。

## 编排形态判定（三问）

Anthropic 多企业部署实测：单 agent + skills 在质量上跑赢 one-big-prompt 与 subagent-per-domain 两种设计。新能力接入编排前问：

1. 与主会话**共享状态**（购物车/审批链/上下文）？→ 做 skill，禁 subagent（每次 handoff state-lossy：token 数倍+秒级延迟）
2. **窄且自包含**（子内搜索试错只回传紧凑结论）？→ delegate 成立（拿 brief 不拿会话，返回 schema-validated 结果，不可写/不可嵌套）
3. 该域已有**独立合规面**？→ handoff（域 agent 成为对话对手方接管到底），不是 delegation

## Pitfalls

- **净化 ≠ 检测**：净化器不清除 `ignore previous` 类明文语义；两层叠加（先 detect 判 verdict，再 sanitize 入上下文），单用任一层都不完整。
- **apply 复验禁止引用 stage 时的判断**：两时点之间限额/规则可能已变，必须重查当前值。
- **评测漏负例**：新题入库前先问"它的 should-refuse 对照题在哪"，没有就补。

## Verification

- [ ] 净化器四用例过（伪造边界/fence 逃逸/嵌套标记/特殊 token）
- [ ] pi_scan 原有 verdict 功能回归无损
- [ ] staged 提案含回滚命令后才可执行 apply
- [ ] 每个新 eval 题有正负配对检查记录
