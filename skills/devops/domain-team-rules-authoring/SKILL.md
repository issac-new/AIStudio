---
name: domain-team-rules-authoring
description: >-
  Author rules.md files for specialized domain team profiles ([已移除], security,
  data-science, bio, etc.) with quantified verification standards tables.
  Covers the 8-section structure, domain-specific task norms, ACP prompt
  templates with domain parameters, and the standard+domain anti-pattern block.
  Complements kanban-soul-authoring (which covers SOUL.md) with the rules.md
  companion file pattern. Use when batch-creating rules.md for a new team.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [rules-design, kanban, templates, profile-setup, domain-teams]
    related_skills: [kanban-soul-authoring, multi-board-team-deployment, agent-profile-lifecycle]
---

# Domain Team Rules.md Authoring

How to write complete, operational `<profile-name>_rules.md` files for
specialized domain team profiles. This is the **rules.md companion** to
`kanban-soul-authoring` (which covers SOUL.md). Together they form the complete
profile authoring toolkit for a new domain team.

## When to Use

- Batch-creating rules.md for a new specialized team ([已移除], security, bio, etc.)
- Filling in rules.md for profiles that only have config.yaml + SOUL.md
- Auditing existing rules.md for verification-standard completeness
- A user asks you to "create N profile rules.md files" for a domain team

## Core Technique: Read-Existing-Then-Adapt

**Do NOT start from a blank page.** The fastest path:

1. **Find 2-3 well-crafted reference rules.md files** from existing workers.
   `worker-coder/worker-coder_rules.md` (detailed ACP/quality/kanban norms) and
   `hack-recon/hack-recon_rules.md` (red-line-driven compact style) are proven
   references.
2. **Read them with `read_file`** to internalize the structure (kanban config →
   core职责 → task norms → ACP规范 → output规范 → collaboration →
   workspace → anti-patterns).
3. **Read each target profile's SOUL.md** to extract domain-specific
   responsibilities, tools, and verification requirements. The SOUL.md is the
   source of truth for what the profile does; the rules.md encodes HOW it must
   do it and WHAT counts as "done".
4. **Verify the `environment_hint` path** in each profile's config.yaml matches
   `~/.hermes/profiles/<name>/<name>_rules.md` — this is where the file must go.
5. **Write all files in parallel** using `write_file(cross_profile=True)` — they
   are independent.

## The 8-Section Structure

Every domain team rules.md follows this skeleton:

| # | Section | Purpose | Reuse Level |
|---|---------|---------|-------------|
| 1 | Header + skill library pointer | Role name, on-demand skill refs | Adapt |
| 2 | 看板配置 | board, assignee, max_in_progress, workspace_kind, profile_scope | Adapt |
| 3 | 核心职责 | Domain responsibilities + "不负责" boundaries | Adapt (domain-specific) |
| 4 | 任务执行规范 | Work cycle + domain task norms + **verification standards table** | Adapt (domain-specific) |
| 5 | ACP 调用规范 | Atomic delegation, self-contained first prompt, discipline | Copy standard, adapt prompt |
| 6 | 输出规范 | Four-section kanban_comment + metadata JSON | Adapt metadata fields |
| 7 | 协作协议 | Upstream/downstream/lateral handoffs | Adapt (team-specific) |
| 8 | workspace_kind + 不要做的事 | Workspace rules + anti-patterns | Copy standard 10, add domain |

## Key Innovation: Domain-Specific Verification Standards Table

This is what separates a domain team rules.md from a generic worker-coder
rules.md. Section 4 MUST include a verification table with:

- **7-8 check items** specific to the domain
- **Quantified pass/fail threshold** for each (not "tests pass" but "误差 < 1e-4")
- **Action when not met** (typically: 续轮迭代, not 降格移交)

### Template

```markdown
### <Domain> 验证标准（移交前必须通过）
| 检查项 | 标准 | 不满足的处理 |
|--------|------|-------------|
| **<Check 1>** | <quantified threshold> | 续轮迭代，查<root cause area> |
| **<Check 2>** | <quantified threshold> | 续轮迭代，查<area> |
| ... | ... | ... |
| **文件存在 + 语法通过** | ACP 声称的文件真实存在，`python -c "import ..."` 无错 | 续轮迭代 |

> 没有可执行的<domain>验证检查 = 任务未完成。
```

### Extracting Verification Standards from SOUL.md

The domain-specific checks come from the profile's SOUL.md "验证基准" or
"质量标准" sections. For example:
- [已移除] SOUL.md mentions "解析解对比、网格无关性研究、守恒性检查、收敛阶验证"
  → becomes 4 table rows with quantified thresholds
- [已移除] SOUL.md mentions "用已知解析解或文献基准验证"
  → becomes Airy斑误差 + 能量守恒 + gradcheck + 文献基准 rows

## Domain-Specific Task Norms (Section 4 sub-section)

Before the verification table, include a sub-section specifying what must be
confirmed BEFORE delegating to ACP:

- **前置条件**: what upstream must provide (equations, data specs, interface specs)
- **参数明确**: what parameters must be specified, not guessed
- **选型对齐**: tool/library choices must match upstream manifest
- **代码规范**: domain-specific coding rules

### Examples by domain

| Domain | Pre-condition | Coding Rule |
|--------|---------------|-------------|
| PDE solvers | PDE type, BCs, material params confirmed | CFL/收敛判据显式注释 |
| SI/PI analysis | Touchstone freq range, port count, ref impedance | S参数无源性/因果性检查 |
| Optical sim | Propagation model, wavelength, aperture, sampling | No detach()/numpy() in differentiable layers |
| ML training | Dataset path, split, seed, architecture | Random seed globally fixed, hyperparams in config |
| Verilog/HDL | Port spec, clock domain, reset strategy | No initial/#delay/fork-join in RTL |
| Multi-physics | Coupling type, field variables, interface conditions | Conservative mapping not interpolation |

## ACP First-Prompt Template (Section 5)

```python
result = acp_send(
    provider="claude",
    cwd="$HERMES_KANBAN_WORKSPACE",
    prompt=(
        "## 任务\n<goal + acceptance criteria>\n\n"
        "## 上下文\n"
        "- 工作目录: <abs path>\n"
        "- 上游文档: <abs path or paste key equations/specs>\n"
        "- 涉及文件: <expected paths>\n"
        "- 技术栈: <domain libraries, ref manifest>\n"
        "- <Domain>参数: <wavelength/CFL/target impedance/coupling type/etc.>\n\n"
        "## 约束\n"
        "- 遵循现有代码风格\n"
        "- <Domain-specific constraints>\n"
        "- 写完后运行测试并贴出真实输出（含<domain verification>）\n\n"
        "## 验收标准\n"
        "1. <quantified check from verification table>\n"
        "2. <quantified check>\n"
    ),
)
```

## Anti-Patterns: Standard 10 + Domain-Specific

Copy these 10 standard items, then add 2-4 domain-specific:

```
- ❌ 不要自己手动写产线代码 — 通过 acp_send 委托给 Claude Code
- ❌ 不要用 claude -p 命令 — 使用 ACP 协议
- ❌ 不要 provider 用 opencode/codex — 本环境只配了 claude
- ❌ 不要一次 acp_send 后就认为完成 — 必须多轮迭代 + 亲自验证
- ❌ 不要未做<domain>验证就 kanban_complete
- ❌ 不要降格移交未达<domain>标准的产出
- ❌ 不要绕过 kanban 工具链直改底层
- ❌ 不要同一失败操作空转 — 3 次失败后换策略
- ❌ 不要在 kanban 字段里粘贴密钥、token、授权码
- ❌ 不要做完工作就直接结束 — 必须显式 kanban_complete 或 kanban_block
```

Domain-specific additions (examples from [已移除] team):
- `❌ 不要用插值代替守恒映射 — 通量平衡是硬约束` (multiphysics)
- `❌ 不要在 RTL 中使用不可综合构造` (ipcore)
- `❌ 不要不固定随机种子就训练` (ai)
- `❌ 不要自行放宽采样定理 — Nyquist 是硬约束` (optics)
- `❌ 不要自行改<domain>模型选型 — 发现缺漏 → kanban_block`

## Cross-Profile Writing

Rules.md files live in `~/.hermes/profiles/<profile-name>/`. When writing from
the orchestrator profile, use `write_file(cross_profile=True)`. The write guard
is a soft warning — proceed unless the tool hard-refuses.

## Workflow

1. **Read reference rules.md** — `read_file` 2-3 existing files (worker-coder,
   architect, and a team-specific one like hack-recon).
2. **Read target SOUL.md files** — `read_file` each profile's SOUL.md to extract
   domain responsibilities, tools, and verification requirements.
3. **Verify environment_hint** — `search_files` for `environment_hint` in each
   profile's config.yaml to confirm the target file path.
4. **Write all rules.md in parallel** — batch `write_file(cross_profile=True)`
   calls, one per profile. Each file is independent.
5. **Verify** — `terminal` to check all files exist with reasonable line counts
   (150-200 lines is typical for a complete rules.md).

## Pitfalls

### skill_manage cannot write to symlinked skills

Skills symlinked from `default` profile into `orchestrator` cannot receive
support files via `skill_manage(action='write_file')`. The tool reports "not
found in active profile". **Workaround**: use `write_file` directly on the
target path, or create the skill in the active profile with `action='create'`.

### Don't forget the profile_scope field

Section 2 (看板配置) must include a `profile_scope` listing ALL profiles on the
team's board. This is used by `kanban-board-profile-scoping` to restrict the
decomposer roster. Omitting it means the decomposer may assign tasks to wrong
team members.

### Verification table thresholds must be quantified

"tests pass" is not a verification standard. Each check must have a number:
"误差 < 1e-4", "覆盖率 ≥ 90%", "残差 < 1e-6". Vague thresholds are
unenforceable — the worker can't self-check pass/fail.

### Read SOUL.md BEFORE writing rules.md

The SOUL.md contains the domain-specific verification requirements (e.g.
"解析解对比、网格无关性"). These must be extracted and quantified in the
rules.md verification table. Writing rules.md without reading SOUL.md =
missing the domain-specific depth that makes the file valuable.

## Related Skills

- **kanban-soul-authoring** (default profile) — Authoring SOUL.md files. This
  skill is the rules.md companion; together they form the complete profile
  authoring toolkit.
- **multi-board-team-deployment** (default profile) — Batch team creation
  including SOUL.md and rules.md as part of the workflow.
- **agent-profile-lifecycle** (default profile) — Step 3 of profile creation
  is "Write rules.md"; this skill provides the template for that step.
