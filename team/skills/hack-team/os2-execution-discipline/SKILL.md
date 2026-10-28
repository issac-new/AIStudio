---
name: os2-execution-discipline
description: "OS2 执行纪律（OpenSecurity 2.0 融合）：工具输出有效性判定表（空输出=工具失败不是分析结论；工具状态≠分析对象状态）、writeup 已知方案处理策略（验证最终结果不验证中间推理）、自主探索规则（四类技术问题禁问用户）、长驻进程控制（禁裸 http.server/ngrok）、长文档分段、反公理固化。hack 四 profile 通用。"
version: 1.0.0
metadata:
  source: OpenSecurity 2.0 (tag 2.0, Apache-2.0) 融合 2026-10-17
  hermes:
    tags: [hack-team, execution-discipline, tool-output-validation, writeup-strategy, autonomy, fusion]
    related_skills: [os2-reflection-protocol, os2-analysis-ledger, pentest-methodology-fusion]
---

# OS2 执行纪律（Execution Discipline）

> 忠实转译自 OpenSecurity 2.0 `.opencode/agents-rules/execution-discipline.md`（tag 2.0，Apache-2.0）。
> 源码快照：`/Users/YOURNAME/workspace/research/opensecurity-2.0-20261017/src/.opencode/agents-rules/execution-discipline.md`
> 台账配合：结论按三件套写入 `$HERMES_KANBAN_WORKSPACE/ledger.md`（见 `os2-analysis-ledger`）。

## 1. 工具输出有效性判定（强制）

工具（脚本/扫描器/命令行）执行后，必须先检查输出是否有效，再基于输出做判断：

| 输出情况 | 含义 | 正确处理 |
|---------|------|---------|
| 输出非空且格式正确（如有效 JSON、预期 hex 数据） | 工具执行成功 | 基于输出继续分析 |
| **空输出**（空字符串/空 JSON/0 行结果） | **可能是工具失败**（地址错/时机错/权限不足），**不是分析结论** | 检查脚本逻辑、地址、参数。修复后重试。禁止基于空输出下"不存在""未调用""非标准"等结论 |
| 输出报错（异常/traceback/非零退出码） | 工具执行失败 | 读取错误信息，修复脚本。禁止忽略错误继续分析 |
| 输出格式异常（非预期格式/截断/乱码） | 工具可能有 bug 或目标环境异常 | 先验证工具在已知正确输入下的输出，确认工具可靠后再用于分析 |

**核心原则**：工具的空输出/错误输出反映的是**工具的状态**，不是**分析对象的状态**。把工具失败误判为分析结论是最严重的错误——会导致整个分析方向跑偏。

**卡住预防**：连续 2 次工具调用无有效输出（空输出/超时提示）→ 暂停评估当前方向是否可行（衔接 `os2-reflection-protocol` 数字规则）。

## 2. writeup 已知方案处理策略

当通过 webfetch/搜索找到已验证的 writeup 或公开 exploit 代码时：

| 场景 | 处理方式 |
|------|---------|
| writeup 提供完整可运行 exploit | **直接使用**，不重新推导漏洞机制。执行后验证结果（是否拿到 flag/是否达成目标） |
| writeup 只描述攻击思路 | 基于思路实现 exploit，不验证 writeup 作者的每一步推理 |
| writeup 与自己的分析冲突 | 以实际测试结果为准，不花上下文辩论哪个分析"正确" |
| writeup 代码需要适配 | 只做必要的适配（URL/参数/token），不重写 |

**核心原则**：writeup 的价值在于"已验证的可行路径"，不在于"机制的完美解释"。**验证最终结果**，不验证中间推理。

**禁止**：找到完整 writeup 后仍花大量上下文重新推导已描述的漏洞机制。

## 3. 自主探索规则（技术问题禁问用户）

**禁止问用户**（AI 必须自己解决的技术问题）：
- 技术判断（"这个函数是 X 吗？""这个漏洞能利用吗？"）
- 方向选择（"要不要换方向？""先分析哪个？"）
- 工具失败处理（"失败了怎么办？""用什么工具？"）
- 分析结论确认（"这个结果对吗？""你同意吗？"）
- 任何可以通过阅读代码、查文档、做实验得出答案的问题

**可以问用户**（只有用户知道的事实信息；Hermes 侧走 kanban_block kind="needs_input"）：
- 目标文件/URL/路径是什么
- 授权凭证（token、cookie、账号）
- 用户需求澄清（"你想要什么类型的分析？"）

**遇到困难时**：读知识库（hindsight_recall + hack-team/knowledge-base）→ 做实验验证 → 按失败模式表切换方向（`os2-reflection-protocol` A/B/C/D）→ 多方向尝试 → 记录失败避免重复。持续探索直到找到答案，不要停下来。

**系统性卡住恢复（穷途末路兜底）**——上述步骤全部执行完仍无法推进时，不要停下来，直接执行回溯：
1. 列出已尝试的所有方向和每个方向的失败原因
2. 回到信息收集阶段，检查是否有遗漏的攻击面/输入点/配置细节
3. 重新审视每个用户可控输入，检查是否有未分析的影响路径
4. 检查是否有被忽略的配置文件、依赖版本差异、框架行为差异
5. 回溯后继续执行，不要输出中间报告

> 尝试的方向失败不意味着这个方向不对——可能要多种手段复合才能最终解决问题，或一些细节上的差异导致失败。

## 4. 长驻进程控制

- 需要外部服务时优先使用在线托管平台（webhook.site、requestbin 等）。
- 确实需要本地 HTTP server（如让 Bot 访问恶意页面）时，运行**带超时的短命 server 脚本**（脚本内设置 timeout 或 sys.exit），**禁止启动无超时保护的长驻进程**（如裸 `python -m http.server`、`cloudflared`、`ngrok`）。
- 预期耗时超过终端默认超时的命令：拆分为脚本内部实现超时控制。

## 5. 文件放置与长文档分段

- **中间产物写入当前任务 workspace**（`$HERMES_KANBAN_WORKSPACE`）：Python 脚本、HTTP 响应保存、cookie 文件、调试输出、截图、解包目录、工具结果。
- **敏感信息**（Cookie/Token）必须存任务 workspace 内，不入 kanban comment/metadata（durable 字段禁 PII/密钥）。
- **长文档分段**：生成/修改超过 300 行的文档（报告等）必须拆分为多次 Edit 调用，每次只改一个小节；禁止一次生成超 300 行整文档。

## 6. 廉价实验优先与持续推进

- **廉价实验优先**：存在秒级可执行且结果可验证的候选方案时，先跑实验再做理论推演；推演不得作为回合的最后动作，实验结果优先于推演预期用于方向取舍。
- **持续推进**：规划完立即执行，执行完立即规划下一步。禁止中途停下来输出状态报告；只有目标完成或穷尽所有方向（`os2-reflection-protocol` 判定）后才输出最终报告。
- **禁止重复**：失败后必须记录失败原因、已尝试方向与细节（写入 ledger.md）——同一方向细节不同结果可能就不同。

## 7. 反公理固化（认知纪律）

- 结论必须带结论三件套（证据等级 + 已验证范围 + 未测清单），模板见 `os2-analysis-ledger`。
- 禁止裸写"永远/所有情况/完备/恒真/不可能/已排除"；缺未测清单不得作为推理前提。
- 实验预登记：跑之前先写预期结果；每批实验后把"从未被当过变量的条件"补进未测清单并优先实验。

## 与其他 skill 的联动

| Skill | 联动 |
|---|---|
| `os2-analysis-ledger` | 本 skill 全部结论按三件套入台账 |
| `os2-reflection-protocol` | 连续 2 次空输出 → 衔接反思协议数字规则判方向 |
| `pentest-methodology-fusion` | curl-first 纪律与廉价实验优先同源；finding 走 confirmation protocol |
| `pua-pressure-engine` | 命令级连续失败升级走 L0-L4（本 skill 管行为纪律，不覆盖压力升级） |
