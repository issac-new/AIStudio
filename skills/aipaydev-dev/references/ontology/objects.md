# swarm-yuan 对象类型目录（Object Types）——显式本体层的语义原语

> **何时读我**：新增/修改实体类型、评审机制提案的实体归属、跑 self-check 类型对账或 ontology-verify 六锚健康检查时读。日常开发任务不读。
>
> 本文件是 swarm-yuan 的**类型事实源**：定义系统承诺的全部实体类型（Quine 本体论承诺的机器可读形态）。
> 与 facts.conf 的分工：facts.conf 管**数字口径**（多少门禁/变量），本目录管**类型口径**（存在哪几类实体、各带什么属性、参与什么关系）。
> 三姊妹文件：`objects.md`（本文件，名词/语义原语）｜`links.md`（关系类型）｜`actions.md`（动词/动能原语）。
> 设计原则：本体论节俭——每新增一个类型必须指认它在实现中的机器可查实存（self-check 对账），不可查实体的类型定义不进本目录。
> 来源：swarm-yuan/README.md 三章 How · 3.8 完备性（本体论驱动原理——承诺清单/范畴划分/关系目录）。

## 使用方式

- **self-check 对账**：`check_ontology_types`（self-check.sh）逐类型验证"实现侧实存"（见每类型最后一列）——类型目录与实现漂移即 fail。
- **生成物继承**：generate-skill.sh 把本目录拷入生成物 `references/ontology/`（生成器类型知识随技能分发，AI 拼装时可引用类型名词）。
- **AI 拼装时引用**：目标技能的 AI 在写地图/规则/账本时，实体落这些类型（不发明新类型；确需新类型走决策留痕）。

## 类型目录

### 独立持续体（independent continuant——不需要其他实体承载）

| 类型 ID | 名称 | 范畴 | 必带属性 | 实现存证（self-check 对账点） |
|---------|------|------|----------|------------------------------|
| `Repository` | 代码仓库 | continuant/independent | path | `PROJECT_DIR` conf 变量；探查一切命令的目标 |
| `Generator` | 生成器 | continuant/independent | source_repo, version | `.swarm-yuan-version` 文件；install 后目录 |
| `Skill` | 目标技能 | continuant/independent | name, profile, status(draft/active) | `SKILL.md` frontmatter 三字段 |
| `RuleFile` | 规则文件 | continuant/independent | path, format(rules 行格式) | `rules.d/*.rules` |
| `Ledger` | 账本 | continuant/independent | path, schema(jsonl 行契约) | trace/decisions/gate-runs/gate-audit 四本账文件 |
| `HostCLI` | 宿主 CLI | continuant/independent | name(claude/codex/...) | hooks.json 两宿主渲染；install.sh 检测 |

### 特定依赖持续体（specifically dependent continuant——系于单一承载者）

| 类型 ID | 名称 | 承载者（bearer） | 机器锚（断裂可检测点） |
|---------|------|------------------|----------------------|
| `StabilityMark` | 稳定性标注 | 组件路径（地图行） | `--stability-audit`：churn/fan-in/测试三信号 vs 标注词矛盾 → STABILITY_WARN |
| `SkillStatus` | 技能状态 | Skill | `--mark-active` 状态门：draft 禁全量门禁 |
| `Fingerprint` | 仓库指纹快照 | Repository 的特定时态 | `project-fingerprint.sh`：--diff 检测快照 vs 当前态断裂 |

### 类依赖持续体（generically dependent continuant——可多承载拷贝）

| 类型 ID | 名称 | 拷贝实例（bearer 可多个） | 校验失效检测 |
|---------|------|--------------------------|----------|
| `Methodology` | 方法论知识 | 生成器 references/ 的每份拷贝 | `.swarm-yuan-version` 版本戳 + `--upgrade` 机制 |
| `FrameworkRule` | 框架规则 | 每个激活框架的 md+sh 对 | `--inject-frameworks` 区块 sha + framework-evidence 台账 |
| `IndustryProfile` | 行业 profile | conf-render 注入的每份实例 | `--industry` 渲染溯源注释（# AUTO:detected） |

### 发生体（occurrent——过程，有时间部分）

| 类型 ID | 名称 | 时间部分 | 记录载体（occurrent 固化为 continuant） |
|---------|------|----------|----------------------------------------|
| `Generation` | 生成过程 | Step 1-13 | trace.jsonl 节点行 |
| `DevSession` | 开发会话 | turns | hooks 生命周期；trace 会话段 |
| `GateExecution` | 门禁执行 | 单次 check 起止 | gate-runs.jsonl 行 |
| `Decision` | 决策事件 | 提议→审议→落定 | decisions.jsonl 行（含 outcome 生命周期） |
| `AuditClosure` | 审计闭环 | 感知→判断→更新→落基线 | decisions 行的 goal_id+closure 字段；audit-closure 报告 |

### 刻意不承诺的（Negative commitments——本体论节俭的边界）

| 不承诺 | 理由 | 替代承诺 |
|--------|------|----------|
| AI 的"理解"/认知状态 | 不可观测 | 其行为证据（Decision/GateExecution 记录） |
| 认知能力分数 | R13 已退役机械计分 | notes/ 留痕（AI 判断的文本固化，仍是记录不是测量） |
| "项目的心智模型" | 隐喻 | 表征它的地图制品（可 path-check 的实体） |

> 负面承诺同样是对账对象：实现中若出现"认知分数"类实体即违反本目录（防止 R13 前病灶回潮）。
