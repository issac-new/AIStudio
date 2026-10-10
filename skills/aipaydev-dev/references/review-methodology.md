> **何时读我**：执行代码审查或设计门禁输出格式时。审查方法论——rubric 判定/P0-P3/规则溯源。

# 代码审查方法论 (Code Review Methodology)

> 来源：[gstack](https://github.com/garrytan/gstack)（审查清单/specialist 模式）与 [open-code-review](https://github.com/alibaba/open-code-review)（5 维度/规则链/严重度分级）。
> 本文件指导目标技能的 check 段如何集成代码审查。
> **仅引用方法与 `ocr` 命令，不复制源码。**

## 五个审查维度（open-code-review 基线）

每个变更审查时覆盖这 5 维度（来源：open-code-review `default.md`）：

| 维度 | 审查问题 |
|------|---------|
| **正确性 Correctness** | 逻辑是否正确？边界条件是否完整？异常处理是否得当？并发场景是否线程安全？ |
| **安全 Security** | 是否有 SQL 注入/XSS 等漏洞？敏感信息处理是否正确？权限校验是否完整？ |
| **性能 Performance** | 是否有明显性能问题（N+1 查询、不必要循环）？资源是否正确释放？ |
| **可维护性 Maintainability** | 代码是否清晰易懂？命名是否准确表达意图？是否遵循项目既有风格与架构？ |
| **测试覆盖 Test Coverage** | 关键逻辑路径是否有测试？测试是否覆盖边界条件？ |

> 目标技能生成时，可按项目语言追加 open-code-review 的语言专项规则（java/ts/rust/c 等），通过 `ocr review --rule <file>` 引用。ocr v1.9.x allowlist 已支持 Bicep（.bicep）、HCL/Terraform（.hcl/.tfvars）、Nim 等——IaC 与新兴语言项目可直接审查无需自写解析器。大文件可用 per-file token limit（v1.9.0 可配，`ocr review --per-file-token-limit <n>`）控制单文件 LLM 消耗。

## 两遍清单结构（gstack 模式）

审查分两遍，每遍聚焦不同严重度：

### 第一遍：CRITICAL（阻塞性）
- SQL 安全（注入、参数化）
- 竞态条件（check-then-act、非原子复合操作）
- LLM 信任边界（AI 生成代码的注入点）
- Shell 注入 / 命令注入
- 枚举完备性（switch/default 覆盖）
- 认证/授权绕过
- 路径穿越

### 第二遍：INFORMATIONAL（非阻塞）
- 命名一致性
- 注释完整性
- 风格规范
- 小幅性能优化建议

## AUTO-FIX vs ASK 启发式（gstack Fix-First Heuristic）

每个审查发现的处置决策：

> **若修复是自动的、资深工程师会不加讨论地应用 → AUTO-FIX（自动修复）**
> **若合理的工程师可能意见不一 → ASK（询问用户）**

| 发现类型 | 处置 |
|---------|------|
| 明显 bug（空指针、越界、逻辑错误） | AUTO-FIX |
| 安全漏洞（注入、越权） | AUTO-FIX |
| 清晰的拼写错误/死代码 | AUTO-FIX |
| 合理但依赖上下文的风格/性能 | ASK |
| 架构层面的重构 | ASK |
| 可能是误报 | 丢弃（silent discard） |

## 严重度分级（open-code-review 模式）

| 级别 | 含义 | 处置 |
|------|------|------|
| **High** | 明显 bug/安全/清晰错误 | 必须修复 |
| **Medium** | 合理但依赖上下文的风格/性能 | 评估后修复 |
| **Low** | 可能误报 | 静默丢弃 |

## 严格聚焦规则（open-code-review Strict Focus）

> "Context tools are for understanding purposes only. Findings from other files must NOT become the subject of your comments. If you discover a potential issue in another file while gathering context, ignore it — your task is limited to the current diffs."

审查只针对**变更文件**（diff 中 `+` 行）。用上下文工具理解周边代码，但不在其他文件提评论。

## Specialist 并行审查（gstack 模式）

复杂变更可派发并行 specialist subagent，各带专项清单：

| Specialist | 清单 |
|-----------|------|
| Testing | 测试覆盖、边界、mock 正确性 |
| Maintainability | 可读性、命名、DRY、复杂度 |
| Security | OWASP Top 10、STRIDE、注入、越权 |
| Performance | N+1、热路径、资源泄漏 |
| Data Migration | schema 变更、数据迁移、回滚 |
| API Contract | 接口签名、兼容性、版本 |

每个 finding 标 AUTO-FIX 或 ASK。

## 自动化审查工具引用（ocr）

目标技能可引用 [open-code-review](https://github.com/alibaba/open-code-review) CLI 自动审查：

```bash
# 安装（Go 二进制，或 npm 包装）
# 见 https://github.com/alibaba/open-code-review 安装说明

# 审查当前 diff
ocr review --from <base> --to <head> --audience agent

# 审查时附带需求上下文（审查是否正确实现了需求）
ocr review --background "需求描述"

# 全文件扫描（非 diff）
ocr scan --path <dir>

# 指定规则文件
ocr review --rule <project>/.opencodereview/rule.json

# 检查哪个规则会应用
ocr rules check <file>
```

**规则解析链（4 层，first-match-wins）：**
1. `--rule` CLI flag
2. 项目 `<repo>/.opencodereview/rule.json`
3. 全局 `~/.opencodereview/rule.json`
4. 内置 `system_rules.json`

目标技能生成时，可在项目根放 `.opencodereview/rule.json` 定制规则（path glob + rule 内容/文件 + merge_system_rule）。

## 审查与 spec 的关联（gstack plan-completion audit）

审查不只是看代码质量，还要核对**是否完成了 spec/tasks.md 的要求**：

| 验证类型 | 含义 | 判定 |
|---------|------|------|
| DIFF-VERIFIABLE | 可从 diff 直接验证 | DONE / NOT DONE |
| CROSS-REPO | 跨仓库影响 | DONE / PARTIAL / UNVERIFIABLE |
| EXTERNAL-STATE | 外部状态（DB/缓存） | DONE / CHANGED / UNVERIFIABLE |
| CONTENT-SHAPE | 内容形态（输出格式/字段） | DONE / PARTIAL / NOT DONE |

对照 tasks.md 的每个 checkbox，按类型验证完成度。

## Plan 原地修订（openspec `/opsx:update`，v1.9.0）

> 来源：openspec v1.9.0。swarm-yuan 生成的目标技能可引用此能力，在 design→build 边界处修订计划而不回退到 open 阶段。

**命令：**
```bash
# 原地修订已有 change 的 plan，并 reconcile 关联 artifacts（不越界到实现工作）
openspec update <change-id>
# 或通过 slash command（Claude Code 集成）
/opsx:update <change-id>
```

> **openspec v1.7-1.9 能力**：
> - **原生支持 ZCode**（v1.7.0）：`openspec init --tools` 现覆盖 ZCode（与 swarm-yuan 多 AI 运行时定位一致）+ vendor-neutral `agents`（`.agents/skills/`，AGENTS.md-aware）。
> - **`skip_specs: true`**（v1.7.0）：纯重构/文档 change 可声明跳过 spec，直接走 validate/archive——与 swarm-yuan 任务类型门控（refactor/docs/exp）对应。
> - **`openspec validate --archived`**（v1.9.0）：opt-in 检查归档 changes 的 tasks.md 是否全勾选，未完成则非零退出——适合 pre-commit/CI，与 swarm-yuan `--mark-active` 无占位符核验一致（关门前查遗留）。
> - **honest root resolution**（v1.9.0）：非 OpenSpec 根目录下 `list`/`validate --all` 明确报错（非静默空），与 swarm-yuan 诚实化哲学一致。

**行为：**
- 读取已有 change 的 `plan.md` + `tasks.md`，允许原地修改 plan 与关联 spec delta
- 自动 reconcile：若 plan 引用了已变更的 spec 节，更新 tasks 中的受影响 checkbox（DIFF-VERIFIABLE 类自动重判）
- **不触发实现工作**：只生成/更新 plan+tasks，不写实现代码、不改实现文件

**在目标技能中的落地：**
- workflow 的 design→build 边界处，若需基于新信息调整 plan（而非回退到 open 重做），引用 `openspec update` 而非重新 `openspec change`
- precheck.sh 的 `design` 门禁可增加检查：若 `tasks.md` 存在，其 checkbox 列表与当前 `plan.md` 的任务定义一致（reconcile 无遗漏）

## 预批准 OpenSpec CLI（openspec 生成技能权限，v1.6.0+）

> 来源：openspec v1.6.0。生成的技能与 Claude commands 可预批准 OpenSpec CLI，避免每次 opsx 调用都触发权限确认。

**在目标技能中的落地：**
- 生成目标技能时，在 `hooks/hooks.json` 或 commands 的 frontmatter 中，为 `openspec`/`opsx` 命令预置 `"permission": "allow"` verdict
- 仅预批准 OpenSpec CLI 这一个工具，其他工具（grep/Read/Bash）仍受正常权限控制
- 示例 hooks 片段：
```json
{
 "PreToolUse": [
 { "matcher": "Bash", "hooks": [{"type": "command", "command": "echo '{\"permission\":\"allow\"}'"}], "condition": "tool_input.command matches /^openspec|^opsx/" }
 ]
}
```
- 这减少高频 opsx 调用（validate/update/change/archive）的重复确认，同时不弱化其他工具的权限门

## 与目标技能的整合

目标技能的 check 段应：
1. 在 `reference-manual.md` 加"代码审查"章节，列 5 维度 + 两遍清单 + AUTO-FIX/ASK
2. 在 `precheck.sh` 加 `--review` 子命令（调用 `ocr review` 若可用，否则提示手动审查清单）
3. 在 workflow 节点⑥（测试验证）引用本审查方法论
4. 在 `dev-guide.md` 引用 subagent 编排时的两阶段审查（spec合规 + 质量）

## gstack v1.58 + open-code-review v1.3 全量能力

> 来源：gstack v1.58.5 + open-code-review v1.3.13 源码调研。

### gstack 审查维度（超出 5 维度的扩展）

| 维度 | gstack 命令 | 描述 | swarm-yuan 落点 |
|------|------------|------|----------------|
| 战略/范围 | `/plan-ceo-review` | 4 范围模式（扩张/选择性扩张/维持/缩减）| spec §1.3 非目标可引用 |
| 架构/数据流 | `/plan-eng-review` | ASCII 图 + 状态机 + 错误路径 + 测试矩阵 + 失败模式 | spec §5 详细设计可引用 |
| 视觉设计 | `/plan-design-review` | 每维度 0-10 评分 + "10 分长什么样" + AI Slop 检测 | 前端项目可引用 |
| 开发体验 | `/plan-devex-review` | DX 审查 + TTHW 基准 + 摩擦追踪 | dev-guide 可引用 |
| 跨模型审查 | `/codex` | OpenAI Codex 独立第二意见 + 3 模式（审查门/对抗挑战/开放咨询）| `--review` 可引用 |
| 安全 | `/cso` | OWASP Top 10 + STRIDE + 17 FP 排除 + 8/10+ 置信门 + 利用场景 | `--security` 可引用 |
| 性能 | `/benchmark` | Core Web Vitals + 页面加载 + 资源大小 + before/after | 前端项目可引用 |
| 根因调试 | `/investigate` | Iron Law：无调查不修复 + 3 次失败后停止 | check 段可引用 |

### open-code-review 关键能力

| 能力 | 描述 | swarm-yuan 落点 |
|------|------|----------------|
| **确定性文件捆绑** | 相关文件分组成审查单元（如 `message_en.properties` + `message_zh.properties`），每个 bundle 独立 sub-agent | `--review` 大变更集可引用 |
| **外部定位模块** | 独立模块提高 AI 评论的行号定位准确度（解决定位漂移） | `--review` 质量提升 |
| **外部反思模块** | 独立模块提高评论内容准确度 | `--review` 质量提升 |
| **模板引擎规则匹配** | 按路径的规则匹配（比自然语言更稳定） | `--review` 规则可引用 |
| **`ocr scan` 全文件审计** | 无 git diff 也能审查（非 git 目录/迁移前扫描） | 探查阶段可引用 |
| **`--audience agent`** | 输出摘要模式供 agent 消费（非人类进度显示） | subagent 审查可引用 |
| **MCP server 支持** | 可挂载 CodeGraph 等工具做代码结构分析 | `--review` + `--layer` 协同 |
| **4 层规则优先级链** | CLI > 项目(`.opencodereview/rule.json`) > 全局 > 内置 | 项目自定义审查规则 |
| **`--background` 需求上下文** | 从 commit message 自动填充需求上下文 | 更精准的审查 |
| **`ocr viewer` WebUI** | 查看完整 LLM 请求/响应会话（DNS-rebinding 防护） | 审查调试 |
| **精度优先设计** | 50 仓库/200 PR/10 语言/1505 标注基准验证，精度 + F1 显著高于通用 agent，~1/9 token | 资源效率 |
| **Anti-overfitting eval 纪律**（ruflo v3.25.0 方法论） | 审查策略改进须在**冻结的 human-labeled eval set**（hash-pinned, tamper-evident）上验证；每代改进暴露 humanRelevance delta（"自检索升但 human relevance 平→过拟合"须可见）；**clean-room replay** 验收（离线重放 promoted generation，哈希一致 + 重新跑 accept/v1+sig） | `--review` 规则演进可引用 |
| **Shadow/canary 部署模式**（ruflo v3.24.0 方法论） | promoted 审查策略 champion 经一代 shadow 延迟后才 serve；canary 在 evolving store 上每 tick 重打分；**auto-rollback** 回归——可迁移到"precheck 规则升级"场景 | `--review` 规则升级可引用 |

### ECC v2.0 审查方法论扩展

> 来源：ECC v2.0.0。审查系统采用动态评估 + 对抗收敛 + 部署验证。

#### Santa Method（对抗收敛审查）

ECC 的 `santa-method` 是两阶段审查的**对抗收敛**变体：

| 阶段 | 说明 | 与 swarm-yuan 两阶段审查的关系 |
|------|------|------------------------------|
| Agent A 审查 | 独立审查 agent，输出 findings | 同 swarm-yuan Stage 1（spec 合规） |
| Agent B 审查 | **另一个独立**审查 agent，输出 findings | 同 swarm-yuan Stage 2（代码质量） |
| **收敛判决** | A 和 B 的 findings 取交集——只有双方都报告的 finding 才视为真 | 两阶段审查的补充：降低误报率 |

**N-of-M 收敛**：可扩展为 N 个审查 agent，至少 M 个（如 3/5）报告同一 finding 才采纳。

**在目标技能中的落地：**
- 高复杂度变更（large 级）可用 santa-method 替代单 agent 审查
- 收敛判决规则：A ∩ B 的 findings → High；A ∪ B 的 findings → 全部列出但标注来源

#### Skill-Run Telemetry（技能运行遥测）

ECC 的 `skill-runs.jsonl` 记录每次 skill 执行的**3×3 结果矩阵**：

| outcome | 含义 |
|---------|------|
| `success` | 完全成功 |
| `failure` | 完全失败 |
| `partial` | 部分成功 |

| feedback | 含义 |
|----------|------|
| `accepted` | 用户采纳结果 |
| `corrected` | 用户修正后采纳 |
| `rejected` | 用户拒绝结果 |

**9 种组合**（success+accepted 是最佳，failure+rejected 是最差）。

**Verifier-gated promotion**：skill 改进提案须经 verifier 验证（不扩大 blast radius）才能 promote。

**在目标技能中的落地：**
- swarm-yuan 的目标技能可在 check 段加 `--telemetry` 子命令：记录 skill 执行的 outcome/feedback
- 遥测数据存于 `.swarm-yuan/skill-runs.jsonl`（JSONL 格式，一行一次运行）

#### Skill-Comply（行为合规测试）

ECC 的 `skill-comply` 自动测试 agent 是否**真的遵循 skill**：

- 自动生成 **3 种严格度**的 prompt：宽松（隐式暗示）/ 标准（明确指令）/ 严格（强制要求）
- 运行 agent，记录行为序列
- 分类行为：compliant / partial / non-compliant
- 报告合规率

**在目标技能中的落地：**
- 生成的目标技能可在 check 段加 `--comply` 子命令：测试 skill 的合规率
- 若合规率 < 阈值（如 80%），修订 skill 的指令（更明确/更严格）

#### Head-to-Head Agent Eval（head-to-head 对比）

ECC 的 `agent-eval` 对比两个 agent 在同一任务上的表现：

| 指标 | 说明 |
|------|------|
| pass-rate | 通过测试的比例 |
| cost | token 消耗 |
| time | 耗时 |
| consistency | 多次运行的结果一致性 |

**在目标技能中的落地：**
- 生成目标技能时，可对比两个候选 skill（如两个不同 prompt 策略）的 head-to-head 表现
- 选择 pass-rate 高 + cost 低 + consistency 高的版本

#### Deploy Canary-Watch（部署验证）

ECC 的 `canary-watch` 是**发布后**的验证（不同于 swarm-yuan 的 eval-rollout canary）：

- 验证 HTTP 端点可访问
- 验证 SSE 流正常
- 验证静态资产加载
- 验证无 console 错误
- 验证性能无回归

**在目标技能中的落地：**
- 若项目有部署环节，check 段可加 `--canary-watch` 子命令：发布后验证部署 URL
- 与 swarm-yuan 的 shadow/canary（eval 阶段）互补：shadow/canary 验证策略，canary-watch 验证部署

#### Closed-Stale Salvage Ledger（陈旧 PR 抢救）

ECC 的 stale PR 抢救流程（治理模式）：

1. **关闭陈旧 PR**：用礼貌评论关闭（"此 PR 已陈旧，如有价值请重新提交"）
2. **记录 salvage ledger**：记录 PR 号、作者、原因、有用文件、风险、建议行动
3. **手动 diff 审查**：审查 salvage 候选的 diff
4. **cherry-pick 或重写**：若 diff 干净则 cherry-pick，否则用 attribution 重写
5. **标记状态**：landed / superseded / no-action

**在目标技能中的落地：**
- 若项目有大量陈旧 PR，可在 check 段加 `--salvage` 子命令：扫描陈旧 PR 并生成 salvage ledger
- 规则：**绝不盲 cherry-pick 生成的 churn**（自动生成的变更须人工审查）

### ocr v1.7.8–v1.7.12 + gsd-core v1.7.0 审查能力扩展

> 来源：open-code-review v1.7.8→v1.7.12 + gsd-core v1.7.0 release notes。

#### Delegate 模式（ocr v1.7.11+）

ocr 新增 **delegation mode**——host-agent 驱动的代码审查：

- host-agent（如 Claude Code）将审查任务**委托**给 ocr
- ocr 作为 delegated reviewer，而非独立运行
- 适用于：host-agent 已有完整上下文，只需 ocr 做规则匹配 + finding 生成

**在目标技能中的落地：**
- review-methodology 的 specialist 并行审查可引用 delegate 模式：host-agent 委托 ocr 做特定维度审查
- `ocr review --delegate` 选项

#### W3C Traceparent 传播（ocr v1.7.9+）

ocr 审查过程传播 **W3C traceparent** header：

- 从父进程继承 traceparent
- 审查的每一步（LLM 调用、规则匹配、finding 生成）都携带 trace
- 支持分布式追踪（审查过程可追踪到具体 LLM 调用）

**在目标技能中的落地：**
- 若项目用分布式追踪，precheck.sh 的 `--review` 子命令可传播 traceparent
- 审查结果可关联到 trace（便于审计"为什么这个 finding 被报告"）

#### Honest Verifier Abstain（gsd-core v1.7.0+）

gsd-core 的 verifier 新增 **abstain（弃权）** 判决：

- 当 spec 信息不足以推断 backstop truth 时，verifier **弃权**（`insufficient_spec`）而非猜测
- 弃权 ≠ 通过：弃权时须补充 spec 信息后重新验证
- 防止 verifier 在信息不足时"编造"验证结果

**在目标技能中的落地：**
- review-methodology 的 spec-compliance audit 可引用 abstain：若 spec 不够详细无法验证，报 "abstain: insufficient_spec" 而非 "pass"
- precheck.sh 的 `--review` 子命令：abstain 计为 "需人工确认"（非 pass 非 fail）

#### Assumption-Delta Advisory Checkpoint（gsd-core v1.7.0+）

gsd-core 在实现过程中检查**假设偏移**：

- 实现开始时记录假设清单（"我假设 X 为真"）
- 实现过程中若发现假设不成立，记录 **assumption-delta**（"假设 X 不成立，实际 Y"）
- 在 advisory checkpoint 暂停，提示人工确认假设偏移的影响

**在目标技能中的落地：**
- workflow 节点⑤（编码实现）可引用 assumption-delta：实现过程中假设变化时记录
- check 段审查 assumption-delta：评估假设偏移是否影响 spec 合规

#### OpenAI Responses API + LiteLLM 网关（ocr v1.7.10/v1.7.12+）

ocr 新增 LLM provider 支持：

| Provider | 版本 | 说明 |
|----------|------|------|
| **OpenAI Responses API** | v1.7.10 | OpenAI 新 Responses API 协议 |
| **Ollama Cloud** | v1.7.11 | 内置 Ollama Cloud 预置 |
| **LiteLLM AI Gateway** | v1.7.12 | LiteLLM 网关预置（统一多 LLM 路由） |

**在目标技能中的落地：**
- 若项目用 ocr 审查，dev-guide.md 可列出支持的 LLM provider（含 OpenAI Responses/Ollama Cloud/LiteLLM）
| **Astro 专用审查规则**（v1.3.13+） | `.astro` 文件的专用审查规则 | Astro 项目可引用 |
| **per-chapter 文档路由**（v1.3.13+） | 文档站点按章节路由，便于导航 | 文档审查可引用 |
| **可恢复 review session**（v1.7.6+） | `ocr review` 支持 resumable sessions + session inspection，中断后可恢复审查 | 长变更集审查可引用 |
| **`code_search` 路径遍历拒绝**（v1.7.6+） | `ocr` 工具层拒绝 traversal pathspecs，作为 path-traversal 防御的工具级补充 | `--security` 可引用 |
| **Monorepo git top-level 路径解析**（v1.7.4+） | `file_read` 路径在 monorepo 中按 git top-level 解析，避免子包相对路径错位 | monorepo 审查可引用 |
| **结构化 category + severity**（v1.7.3+） | findings 现带结构化 category 字段（不止 severity），便于按类别过滤 | `--review` 规则可引用 |
| **Python 内置审查规则**（v1.7.6+） | Python 代码审查规则已内置（与 Java/TS/Rust 平级） | Python 项目可引用 |
| **可复用 composite PR-review GitHub Action**（v1.7.6+） | 抽取为可复用 composite action，CI 中一行引用即可做 PR 自动审查 | CI 集成可引用 |
| **`--background-file` 业务上下文**（v1.7.6+） | 读取本地业务上下文文件作为审查背景（比 `--background` 字符串更结构化） | 大型项目审查可引用 |
| **Eden AI provider 预置**（v1.7.7+） | 内置 Eden AI 作为 LLM provider 预设 | 按项目环境选择 |
| **Dark mode + 系统等宽字体**（v1.7.5+） | viewer 支持 dark mode + 系统等宽字体 | 审查调试体验 |

### superpowers 审查模式（两阶段 subagent review）

| 阶段 | 检查什么 | swarm-yuan 落点 |
|------|---------|----------------|
| Stage 1: Spec 合规 | 实现是否符合 spec delta（ADDED/MODIFIED/REMOVED） | check 段引用 |
| Stage 2: 代码质量 | 5 维度（正确性/安全/性能/可维护/测试覆盖）+ 两遍清单 | check 段引用 |
| TDD 强制 | RED→GREEN→REFACTOR，先写测试后写代码（删违规代码） | `--test` 可引用 |
| 系统调试 | 4 阶段根因定位（root-cause-tracing / defense-in-depth / condition-based-waiting） | `--review` 可引用 |
| 验证前完成 | 确保"真的修了"而非"以为修了" | goal-backward 可引用 |

## pre-emit 引用门与置信度标定（gstack #1539，治 fail-open/误报）

> 来源：gstack review/SKILL.md:1241-1276（pre-emit 验证门）+ cso/SKILL.md:1012-1046（置信度标定 + 并行独立验证）。

**pre-emit 引用门**：凡审查产出的 finding **必须逐字引用动机代码行（file:line）**，否则强制降级压出主报告——"If you cannot quote the motivating line(s), the finding is unverified"。

**置信度标定**：finding 应带置信度标注（high/medium/low），3-4 分压入附录、1-2 分仅 P0 才报。一个 VERIFIED finding 即全库搜同模式变体（变体分析）；每个候选 finding 可派独立验证 subagent（只给 file:line 防锚定），低于阈值即弃。

**FP 硬排除**：对已知误报类（如"文档文件不是可执行代码"、"SKILL.md 是可执行提示代码不适用文档豁免"）建立排除清单，审查时先过滤。

**门禁承载**：`precheck.sh check_review`——ocr review 输出对含 finding 关键词但缺 `file:line` 引用的行降级 warn（pre-emit 引用门）；AI 5 维度审查降级路径输出 pre-emit 指引。姿态为 **warn 级 advisory**（不新增 fail），与现有降级策略一致。

**FP_EXCLUSIONS 配置（轻量固化）**：`precheck.conf` 可配 `FP_EXCLUSIONS`（`|` 分隔的 ERE 模式），check_review 的 ocr 输出对命中已知误报类的 finding 降级提示。内置默认排除：`README|\.md:|\.txt:|// |# |\* `（文档/注释行）。置信度标定为 **AI 审查的结构化输出要求**（finding 带 high/medium/low，低置信压附录），非硬门禁（硬门禁化需真实项目数据校准，风险高）。

**标定学习闭环**：`precheck.sh --review-calibrate record --confidence <high|medium|low> --verdict <true|false>` 落盘 finding 置信度+用户确认到 `.swarm-yuan/review-calibration.jsonl`；`--review-calibrate stats` 统计各置信度真发现率，某级别真发现率 <30%（≥5 样本）时建议压附录或提 pre-emit 引用门阈值——这是 gstack 标定学习（用户确认低置信 finding 为真→反哺后续审查）的最小闭环。


## 测试可证伪性纪律（Falsifiability + Mutation Check）

> 来源：superpowers v6.2.0 `writing-good-tests.md`（`testing-anti-patterns.md` 的替代）。六规则正向目录，每条先给 GOOD 示例 + 可证伪性纪律 + 闭合 Mutation Check；硬止两类陷阱。本节作为 review 方法论的测试质量指引，与现有 `--review` 门禁的 pre-emit 引用门语境一致。

**核心问题**：测试若不可证伪（没有能让它失败的生产改动），就只是"看起来在测"的装饰--CI 绿但不保护任何东西。这类测试给出虚假安全感，是 review 中最常被放过的暗坑。

**可证伪性纪律**（来源：superpowers v6.2.0 `writing-good-tests.md`）：

1. **说出会让该测试失败的生产改动**--写测试前先回答："改了什么会让这个测试失败？" 答不出则测试无效。例：测 `add(2,3)==5`，能让它失败的改动是 `add` 实现改错返回值；若答不出（如测试只断言常量），是 change-detector 陷阱。
2. **期望独立于被测代码推导**--测试的期望值不能从被测代码的实现推导出来（否则只是 tautology）。期望应来自 spec/不变量/独立计算。例：测排序后，期望 `[1,2,3]` 应来自"输入 `[3,1,2]` 的升序定义"，不能来自"跑一遍 `sort` 看输出"。
3. **闭合 Mutation Check**--测试写完后，做一次变异检查：手动改坏被测代码（如把 `+` 改 `-`、把 `>` 改 `>=`），确认测试**确实失败**。改坏了测试还绿 = 测试没保护这个改动 = 测试无效。

**两类陷阱硬止**（来源：superpowers v6.2.0，硬止 = 发现即判测试无效）：

| 陷阱 | 表现 | 为什么坏 |
|------|------|----------|
| **string-presence trap**（字符串存在陷阱）| grep 式测试--检查代码/输出里"含有某字符串"而非检查行为 | 可观察的是行为，不是文本；重构改写法（如把 `if x` 改 `if true == x`）会让字符串消失但行为不变，测试误报失败；反之行为坏了但字符串还在，测试误报通过。**对脚本/技能/prompt 的 grep 式测试是此陷阱的重灾区** |
| **change-detector trap**（变化检测器陷阱）| 测试断言常量或断言"输出==自身跑一遍的输出" | 常量断言能失败（改常量）却保护不了什么；`assert output == run` 是 tautology，任何改动都"通过" |

**与 review 的整合**：
- `--review` 审查代码质量维度时，对新增/修改的测试用本纪律审查：答不出"什么改动会让它失败"的测试，判 Important（建议补 mutation check 或重写）。
- pre-emit 引用门（§pre-emit 引用门）的"未验证 finding 不进主报告"原则同样适用于测试审查--未做 mutation check 的测试质量断言降级 warn。
- **不新增 check_* 门禁**（守决策 26 预算）；本纪律是 AI 审查的结构化指引，由 `--review` 的代码质量维度承载。

**对脚本/技能/prompt 测试的特殊提醒**：swarm-yuan 自身的脚本（precheck.sh/state-machine.sh/trace-log.sh）和生成的技能 prompt 不宜用 grep 式测试（string-presence trap）。可观察的是行为（exit code / 输出结构 / 副作用），不是文本存在性。fixture 正反例测试（violating/compliant）是行为测试的正解--它断言门禁在违规项目 fail、在合规项目 pass，而非断言脚本"含有某段代码"。

## 上游审查工具要点（ocr / codex-security / ruflo / impeccable）

> 来源：ocr / openspec / gstack / comet 等上游 release 调研（调研档案见 `docs/research/`）。

- **语义文件分组审查**（ocr #808，v1.10.0 headline）：LLM 先聚类变更文件（≤10 文件/组），每组一个 sub-agent 独立上下文审查——大 diff 降本直接模式，与两阶段审查互补。
- **跨 session findings 比较**（ocr #922）：按 path+category+snippet（**非行号**）匹配，new/persisting/resolved/not-reviewed 四象限——为 scoped re-review 提供行号无关匹配键。
- `--effort low/medium/high`（MaxReviewRounds 1/2/3）可作 review 分档（暂未落地）。
- **assess-patch-risk 五值裁决**（codex-security #654/#664）：SHA-256 绑定工件 + 五维 + merge/revise/no_op/block/hold_for_evidence 五值 + auto_merge_candidate（暂未落地）。
- **dream cycle**（ruflo）：假设评估前冻结 + 对抗性 critic 复现 + ACCEPT-scoped 落地（暂未采纳）。
- **impeccable**：Stop hook 发 Codex decision 格式——gate 输出必须匹配宿主拦截协议，否则拦截形同虚设（本仓 fail-gate-hook 同款实现）。
- **评审成本/深度可配置化**（ocr v1.11.6）：effort / max_tokens_budget / llm_reasoning_effort 一等评审控制。
- **解析器不得静默改写**（openspec v1.13.0）：delta parser 不静默改写/丢弃所写内容；apply 对无 delta specs 变更警告。ocr v1.11.7：报告原子写入 + 二次信号立即退出。
- **预览=执行同一选择集**（ocr v1.11.9 #801）：`--preview` 应用与评审相同的选择函数，不允许平行实现。
- **validate 拒绝的状态 apply 不得放行**（openspec v1.13.1 #1868）：apply 块按声明产物校验；不可解析全局 config 不触碰（#1876，坏输入不动原物）；未识别 checkbox 计为未完成（#1773 保守计数）。
- **预算传播**（ocr v1.12.5 #1248）：运行中 group 内强制 --max-tokens-budget——预算界必须覆盖运行态。
- **pass^3 / pass@3 双口径判据**（comet 0.4.0 官方评测机制，C 级证据）：pass^3=三次**连续**全过（稳定性），pass@3=三次内过任意一次（能力上界）；单次全绿只是准入，连三绿才是收敛。**裁判与运动员分离**：评测 judge 与 execution 分离（独立 agent / 模型 / baseUrl / 凭证）——被评对象不得自证，verifier 跑评测作业时照此配置。**评测集纪律**：用真实日常任务集（勿玩具任务），好坏样本配对防全绿假象。
- **测试不得写用户真实环境**（ocr v1.12.6 #1416）：TestMain 隔离会话写入与真实 HOME——界画在测试进程边界。
- **临时豁免必须有退出机制**（ocr v1.12.7 #1445）：TEMPORARY english-only 豁免已全部撤销——豁免须登记退出条件。allowlist 排除 pytest-style test_*.py 出评审（#1439）——评审对象选择显式化，测试代码不进评审范围。
- **配置值进 shell 前校验**（ocr v1.12.9）：credential 命令执行前校验（拒绝 shell 元字符 + 明文凭据告警）；config 更新保留未知 JSON 字段（#1508，向前兼容守卫）；findings 跨文件重命名保持（#1529，评审状态与路径解耦迁移）。


## 未跑即不通过与操作语义分区判定

> 来源：openspec 1.13.2。

- **未验证维度不得报通过**：跳过的检查记 `Not verified`，终评必须点名，**任一检查未跑就不得宣称可归档**。
- **验证按操作语义分区判定**：ADDED 查存在、REMOVED **反向查**（查不到才正确、行为仍在才 critical）、RENAMED 不查旧名。一律当「查实现」会把**正确删除的需求误判 CRITICAL 并建议补实现**。
- **对外部契约做诚实性测试**：prompt 引用的字段都要与真实 CLI 输出对账 + 守门测试。
- **破坏性操作「atomic rename 认领」后再读、比对确认才删**：竞态写入要么被比对还原、要么成新文件**永不被删**。

## 规则生成物基线优先与发布面门禁

> 来源：ocr 1.12.11 / gstack v1.91.7.0。

- **规则生成物不得覆写基线**（ocr 1.12.11 #1056）：allowlist 规则可经 Jinja 模板批量生成，模板展开结果与上游规则冲突时**上游基线优先**（「preserve upstream rules after Jinja conflict resolution」）——配置合并语义：生成/派生层与人工基线冲突，输的一律是生成层；与本仓「投影不得改写真身」I4 不变量同构。
- **diff 基线显式化**（ocr 1.12.11 #1544）：IDEA 插件列举 merge commit 文件以 **first parent** 为基线——比较基线必须显式钉定（与 gsd-core #5008 merge-base 钉定同类），否则「改了什么」本身失真。
- **发布面三项门禁**（gstack v1.91.7.0）：surface-aware 探索式 QA 门禁（QA setup 权威在主流程集成后保留——委托权威不被集成吞没）+ 发布前文档检查门禁（原子写入+归因）+ **发布点 fail-closed**。

## 测试真实性与派生制品发布序

> 来源：gstack v1.91.8.0 / v1.91.9.0、graphify 0.9.72。

- **测试真实性三条**（gstack v1.91.8.0 #2994）：① 行为测试不得伪造产品内部——inline mirror server 用 ephemeral 端口跑真 `serve()`、源码 grep 断言换成行为断言（/internal/grant+revoke 真 token 矩阵）；② 无消费方的死评价资产删除——oracle 无 paid caller 即连同 52 个孤儿 fixture 一起删，不留「看起来在守护」的不生效资产；③ **never-green 测试删除**——断言为空或必不能有意义的测试删除而非容忍，永红的测试训练团队忽视红。审查生成物测试面时核对——行为断言不得钉实现文本（防复发锁除外，锁的本职就是钉文本）；删除的资产连注册表行一起清（touchfile/清单残留=新死信号）。
- **测试价值条常态化**（gstack v1.91.9.0 #2998）：test value bar 进 plan-eng-review/review/qa/ship 四流程 + 独立 /test-audit 命令——测试资产本身是被评审对象，价值维度在交付链每个节点在场而非事后专项。本仓 Step 8 审查口径校验（Mutation Check）与审查清单的测试有效性维度已覆盖该要求。
- **派生制品按依赖序原子发布**（graphify 0.9.72 #3853）：label sidecar 先于 signature 发布、整体原子写——中断的重建不得留下「为已不存在的聚类而写的悬空标签」。多文件派生状态的发布须定安全顺序：**被依赖者先写**，中断在任意点都不产生悬空引用。生成物多文件写回（hooks+commands+settings 三类）与 memory-writeback 的写序审查可对照——先写引用方后写被引用方=中断即悬空。
- **可选依赖缺失 warn-once**（graphify 0.9.72 #3702）：pypdf 缺失时输出一次性显式告警（而非静默零产出）——工具在跑、exit 0、输出为空是最隐蔽的死信号形态。**依赖在册≠能力可用**：降级「未装不阻塞」维持设计，但降级发生须可见（一次性提示）；审查生成物降级路径时核对降级是否无声。

## 评测宣称诚实性与弃权诚实

> 来源：graphify v1.0.0 / ruflo v3.49.0 / ECC v2.2.2。

- **评测宣称必须带规模条件与复验入口**（graphify v1.0.0 154919b + ruflo v3.49.0 两处来源一致）：graphify 基准数字为实测数字表——6 文件 ~1x（上下文窗口装得下，价值是结构清晰不是压缩）、52 文件 71.5x，且 worked/ 目录放原始输入+真实输出「you can run it yourself and verify」（不采用"小语料¹"式脚注）；ruflo 同版本的未复验 150x/12,500x HNSW 加速宣称不进默认 CLI 输出。审查产物的基准/加速宣称时核对三件——数字是否带语料规模条件、是否给复验入口（原始输入+产物+命令）、未复验的宣称是否进了默认输出面；无条件的倍数宣称按未验证处理。
- **路由弃权诚实**（ruflo v3.49.0 #3567）：路由无匹配时不报告其最高置信度——**弃权不得伪装成置信**。与本仓两级路由（LLM 语义分类→关键词兜底）同款风险面：分类器无匹配时取最高分兜底=把"不知道"冒充"最像"。分类/路由类判据（含 adaptive-gating 门控）审查时核对无匹配路径的输出语义——无匹配必须显式弃权或降级到下一级路由，不得取分桶极值充数。
- **检查面收敛到使用面**（ECC v2.2.2 #2838）：MCP 健康检查从全局收敛到实际使用的 MCP 工具——健康检查面不得大于实际使用面，对未用面做全局健康宣称=虚假背书。审查生成物的自检/门禁清单时核对检查项与声明能力的对应关系——没有对应能力的检查项（纯装饰性绿灯）与未检查却宣称健康的面，双向都要清。

## 任务态持久观测与断言自述

> 来源：ruflo v3.50.0 / v3.51.0（ADR-406）。

- **任务控制态须进程外持久、观测面 headless 可达**（ruflo v3.50.0/v3.51.0 ADR-406）：mission contract 与执行态落 durable storage，观测经 CLI/MCP 均可达，console 视图只是投影（headless views 保底）——UI 关掉不丢任务真相。审查多代理/工作流产物的任务态承载时核对——控制状态是否只存在于进程内存或单一 UI 会话；进程外可查（文件/账本）+ 无 UI 可观测是底线双件。
- **测试断言自述**（ruflo v3.50.0：e2e checks say what they check、focus hint 与 Esc 行为描述说引擎真实所为）：测试名与失败输出必须陈述被验行为本身，读者不读实现即知测什么。审查生成物测试面时核对——断言文案是否自述行为语义；引用编号/镜像实现文案的测试按可读性缺陷记。


## 拒绝语义的工程完整性

> 来源：claude-mem v13.29.0 / ruflo v3.51.1。

- **永不可适用的操作不得卡死同步**（claude-mem #4346）：「永不可适用」（never-apply）的操作若重新入队会让 pull 永远挂起——不可适用是终态判定，不是待重试态；终态判定必须释放队列而非重新入队。审查多代理同步/合并面时问：每个「放弃/跳过/不适用」分支是否都有明确出口？没有出口的跳过就是未来的卡死。
- **拒绝须可被调用方感知**（ruflo pre-bash blocking exit status）：pre-bash 钩子拒绝执行后改用阻塞式退出码——静默跳过与显式拒绝在调用方看来必须是两种结果。审查拦截器/闸门时问：被拦下的请求，调用方拿到的是「明确的拒绝信号」还是「什么都没发生的假象」？
