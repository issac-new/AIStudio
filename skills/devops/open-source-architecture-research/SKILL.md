---
name: open-source-architecture-research
description: "代码型开源仓库源码级调研。clone→分层映射→定向深读→file:line 引用。"
version: 1.1.0
metadata:
  hermes:
    tags: [devops, research, open-source, architecture, evidence]
    related_skills: [open-source-skill-fusion, deep-research-workflow, evidence-based-research]
---

# 代码型开源仓库源码级调研

> 区别于 `deep-research-workflow`（多源网络调研）和 `open-source-skill-fusion` 的 SKILL.md 型
> 项目：本 skill 专管**代码型仓库**（Rust/Go/TS monorepo）的源码级阅读策略。
> 首轮实践：openai/codex 112-crate monorepo（2026-08-21，见 references/）。

## When to Use

- 用户说"调研分析 github.com/X/Y 并消化吸收"
- 目标是代码仓库而非文档/skill 集合，且规模 >10 个包/crate/module
- 需要产出带 file:line 引用的架构报告（用户纪律：数字可追溯，禁编造）

## Workflow（5 步）

### Step 1: 获取源码 + 全景映射
```bash
# 默认 shallow clone——落 workspace 持久层，禁 /tmp（file:line 引用核验可能跨会话）
git clone --depth 1 https://github.com/X/Y ~/hermes-docker-sandbox/workspace/research/Y-src
# 超大仓库 clone 慢且只需快照时，tarball 更快：
# curl -L https://codeload.github.com/X/Y/tar.gz/refs/heads/main | tar xz
find . -maxdepth 2 -type d -not -path './.git*' | sort
```
先 `ls` 顶层目录列表并计数，建立规模感。用 tarball 时报告头必须注明来源版本/tag——file:line 引用的可核验性锚定在该版本上。

### Step 2: 分层归类（防平推）
把所有包/crate 归入 5 层，后续按调研问题选层深读，**不逐包平推**：
| 层 | 典型内容 | 信号文件 |
|----|---------|---------|
| 接口层 | tui/cli/app-server/exec | 入口 bin |
| 编排层 | core/session/turn/tasks | 主循环 |
| 安全层 | sandbox/policy/guardian/proxy | policy/rule 文件 |
| 能力层 | skills/hooks/memories/plugin/mcp | SKILL.md/hook 配置 |
| 持久层 | rollout/store/state/history | db/migration |

5 层表是无自述架构仓库的兜底模板。仓库自带架构声明（AGENTS.md 依赖方向、docs/architecture.*）
时先读声明、按其声明的依赖方向分层（如 domain←contracts←providers←application←入口），
套通用 5 层反而失真；「provider 代码不进领域层」是常见铁律，声明里通常写明。

### Step 3: 定向深读（确定性优先）
高信号目标（携带确定性行为，非 README 营销话术）：
1. **根 AGENTS.md / CONTRIBUTING** — 工程纪律（如 codex 的 "resist adding code to codex-core"）
2. **prompt 模板目录**（prompts/templates/）— 行为契约原文
3. **policy/判例法文件**（*.policy.md, rules）— 安全裁决逻辑
4. **内置角色/agent 定义**（builtins/*.toml, agent_names）
5. **狗粮配置**（.codex/, .claude/ 等仓库自用目录）— 项目自己怎么用自己
6. **review rubric / 评审清单** — 质量标准
7. trait/接口定义文件（如 ContextualUserFragment）— 架构关键抽象

agent 面向型工具（CLI/MCP 给 coding agent 用）追加三类高信号目标：
8. 捆绑 agent skill（.agents/skills/*/SKILL.md）— 项目教 agent 用自己的方式，事实上的使用手册
9. 契约/工具注册表（contracts/、official*Contracts）— caller 可见 schema 唯一事实源，工具数量在此数
10. docs/roadmap.md + 准入标准 — 项目自认的能力边界，gap 分析的直接对照面；
    「how we design X」方法论文档（tool-design 类）优先级等同工程纪律文档

### Step 4: 引用纪律
- 每条事实断言带 `path/to/file.rs:LINE`（真实 clone 中可 grep 验证）
- 报告写入 `<workspace>/research/<name>-research-report.md`，**写完再谈完成**（防中断丢产物）
- 结构：全景→核心机制深读（每个机制：设计+file:line）→对照自有系统 gap→可移植清单（按防线归位+优先级）→不建议移植清单（防盲目搬运）
- 附录放「关键 file:line 引用索引」两列表（断言→位置），蓝军抽查不必重扫全文
- gap 三分类：真 gap / 有能力但依赖外部 provider（license/BYO，注明装什么才解锁）/ 与自有治理冲突（能力再好也不移植）；
  带 BYO provider 的平台先盘免 provider 可用面再判 gap，防把「没装商业引擎」误报成「能力缺失」

### Step 5: 蓝军核查（禁自评自封）
报告交付前 `delegate_task` 派独立审查：抽查 ≥10 处 file:line 引用（grep/read 核实）+
挑战 gap 分析公允性（是否夸大缺失/贬低已有能力）。FAIL 项修正后再交付。
delegate 带 output_schema 强制结构化回执：references_checked[{claim,result,spot_evidence}]、gap_fairness、verdict。

## Pitfalls

### 1. 大 monorepo 平推陷阱
112 crate 逐个读会耗尽上下文。分层映射后只深读回答调研问题的层。
本次 codex 调研：~20 次定向读取覆盖全部核心机制。

### 2. README-only 调研无效
README 是产品介绍；确定性实现藏在 prompt 模板、policy 文件、内置角色 toml 里。
`open-source-skill-fusion` 同款教训（hooks/*.sh > README）。

### 3. Gap 分析要对照自有系统已有能力
先列"已有等价物无需移植"表再列真实 gap，防止把对方所有特性都当 gap
（融合纪律：等效零代码方案优先；对方有≠我们必须有）。

### 4. 报告完成 ≠ 融合执行
用户纪律"调研先行"：调研报告交付→验收→才谈融合执行。报告里给融合候选+优先级即可，不擅自执行。

## Reference Files

| File | Content |
|------|---------|
| `references/codex-architecture-patterns.md` | openai/codex 112-crate 调研蒸馏：Guardian 二审/execpolicy/角色投影/Fragment 上下文/Goals 反偷懒审计/Gap G1-G10 + 融合优先级 |

## Related Skills

- **open-source-skill-fusion** — 调研后的融合落地流程（default profile）
- **deep-research-workflow** — 多源网络调研（文章+GitHub 搜索+百科）
- **evidence-based-research** — 反编造引用规则
