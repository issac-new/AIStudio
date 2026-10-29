# swarm-yuan 安装目录对齐 Agent Skills 开放标准默认路径（.agent/skills）

- 日期：2026-10-29
- 分支：refactor/swarm-yuan-agent-skills-dirs
- 状态：已实施

## 变更

用户指令（2026-10-29 原话）：「swarm yuan skill 的安装目录，默认放在用户的 .agent/skills/，以及其生成的研发技能，默认放在项目或者工作区的 .agent/skills/ 目录下」。

对齐 Agent Skills 开放标准的两层默认路径（用户级 `~/.agent/skills/`、项目级 `<project>/.agent/skills/`；本机 `~/.agent/skills/` 已有 openspec 系列 11 个技能在用，实证该目录是现行约定，非笔误）。

1. **swarm-yuan 自身安装（install.sh）**
   - 新增 `--agent` 显式目标：安装到 `~/.agent/skills`；`--uninstall --agent` 对偶卸载。
   - auto 模式未检测到任何宿主时的兜底从 `~/.claude/skills` 改为 `~/.agent/skills`（「默认」的直接落实）。
   - `detect_runtimes` 新增 Agent 行：`~/.agent` 存在即列出（与其他宿主并列进入 auto 分发 / `--all` / `--uninstall --all` 通道）。
   - `tool_key_of` 增加 agent 映射；`_skills_dir_key` 把 agent 归入 skills-dir 型（无原生规则渲染面，同 hermes/dsh/ccswitch）。
   - 检测到其他宿主时的既有分发行为不变（显式 `--claude`/`--zcode` 等仍可用）。
2. **生成研发技能的落盘（scripts/generator/subcommands.sh）**
   - `detect_skill_dir()`：探测序首位加 `.agent/skills`；项目内无任何 skills 目录时兜底新建 `.agent/skills`（原 `.claude/skills`）。
   - `detect_runtime_name()` 跟随映射（`.agent/skills` → Agent 通用），兜底文案同步。
   - 存量项目兼容：项目内已有 `.claude/skills` 等目录且无 `.agent/skills` 时，探测序仍命中既有目录，升级/复生成不换位置。
3. **产物内部引用一致性（scripts/generate-skill.sh）**
   - SKILLS_PATH_REWRITE 自动推导：用户未显式设置且 TARGET_DIR 不是 `.claude/skills` 时，按 TARGET_DIR 相对项目的目录名自动应用 `s|\.claude/skills|<dir>|g`，使随发模板内部对 `.claude/skills` 的字面量引用与实际落盘位置一致（既有机制复用，显式设置优先）。
   - spec-first pre-commit 挂载点探测序（generate-skill.sh 渲染产物内的定位循环）加 `.agent/skills/*/`。
   - `assets/gates/process/spec-first.sh` 变更豁免集加 `.agent/skills/`（生成技能自身路径不算业务变更）。
4. **宿主表（assets/tool-adapters/common.sh）**
   - `ta_tool_home()` fallback 表加 `agent → ~/.agent`；install.sh 降级版 `ta_host_installed` case 同步。
5. **文档同步**：install.sh 用法注释、SKILL.md「首次部署」段、README 安装/生成位置描述、CHANGELOG 追加。

## 决策记录

- **`.agent`（单数）而非 `.agents`**：用户原话即单数，且 `~/.agent/skills/` 在本机已被 openspec 系列技能实际使用（11 个 SKILL.md 实证），是 Agent Skills 开放标准的默认路径；`~/.agents/skills`（复数）是另一约定，两者并存，本次按用户指令走单数。zcode 等宿主如需发现该目录可用符号链接（本机已有 `~/.zcode/skills/agently-mail -> ../../.agents/skills/...` 软链先例）。
- **auto 检测到宿主时分发行为保留**：用户诉求是「默认」落 `.agent/skills`，落在未指定时的兜底与显式旗标；R128 检测—渲染—注册—注销四态闭环的既有语义不动，避免大面积行为回退。
- **探测序把 `.agent/skills` 放首位**：用户意图「默认 .agent/skills」；单目录存量项目不受影响（无 `.agent/skills` 时探测命中既有目录）。双目录并存且旧技能在 `.claude/skills` 的项目重新生成会落到 `.agent/skills`（新副本），属可接受边缘，如实披露。
- **SKILLS_PATH_REWRITE 自动推导而非改模板源**：随发模板（UNIVERSAL_FILES）中 `.claude/skills` 字面量分散在 gates/precheck 等数十处，源层逐一改写会破坏既有 `.claude/skills` 实例的行为；复用复制后 sed 通道按实际落盘目录统一改写，单一机制覆盖全部产物。
- **「工作区」层级不自动探测**：工作区根无机械判据（与项目根不同），沿用第 3 位置参数 target-dir 显式指定；spec 记录该边界。

## 验证

- `bash skills/swarm-yuan/install.sh --list`：新增 Agent 行仅在 `~/.agent` 存在时出现。
- `bash skills/swarm-yuan/install.sh --agent`（沙箱 HOME）：安装到 `$HOME/.agent/skills/swarm-yuan`；`--uninstall --agent` 存档移除。
- 生成端到端（临时项目）：无 skills 目录的项目生成 → 落 `<project>/.agent/skills/<name>`；已有 `.claude/skills` 的项目 → 仍复用。
- swarm-yuan 测试：`tests/test-r128-install-uninstall.sh`、`test-r141-relocate.sh`、`test-r141-upgrade-dryrun.sh`、`test-upgrade-hygiene.sh`、`test-r118-install-hardening.sh`、`test-source-layout.sh` 及 e2e 生成链；受影响断言随批更新。
- 实际执行结果见提交信息与交付说明；未跑项在交付说明披露。

## 设计文档影响

DESIGN_SYNC: none
理由：本次为安装/落盘目录默认值调整，不触及整合正本、数字总账（facts.conf 的 FACT_* 计数无新增变量/文件，agent 不进 TA_TIER 兼容档表——无适配器渲染面）；swarm-yuan 自身 CHANGELOG.md 已随批记录。
