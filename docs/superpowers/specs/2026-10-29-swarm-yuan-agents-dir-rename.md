# swarm-yuan 默认目录校正：.agent/skills → .agents/skills（用户裁定）

- 日期：2026-10-29
- 分支：refactor/swarm-yuan-agents-dir
- 状态：已实施

## 变更

上一轮（spec `2026-10-29-swarm-yuan-agent-skills-dirs.md`，main cca2090a1）按用户原话单数 `.agent/skills` 实施。本轮用户裁定改为复数 `.agents/skills`，原因是 zcode 的技能发现根硬编码为 `.zcode/skills` ＋ `.agents/skills`（源码锚点：`upstream/zcode` 即 vendor/zcode `apps/zcode-cli/packages/adapters/src/skills/roots.ts:10-11`，`ZCODE_DIR=".zcode"`、`AGENTS_DIR=".agents"`，用户级与项目级均扫此二目录、合并而非 fallback）——装 `.agents` 即被 zcode 原生发现，无需配置 `skills.roots` 或软链。

把昨日引入的全部单数 `.agent` 引用机械替换为 `.agents`（安装侧、生成侧、门禁豁免、宿主表、文档、守门测试），并同步：

1. **旗标与 key**：`--agent` → `--agents`；宿主 key `agent` → `agents`（`ta_tool_home`/降级 `ta_host_installed`/`tool_key_of`/`_skills_dir_key`/卸载通道）；显示名「Agent 通用」→「Agents 通用」。探测判据 `~/.agent` → `~/.agents`。
2. **生成侧**：`detect_skill_dir` 探测序首位与新建兜底 `.agents/skills`；`detect_runtime_name` 跟随。SKILLS_PATH_REWRITE 自动推导按落盘目录名动态生成，无需改逻辑（注释同步）。
3. **门禁豁免**：`spec-first.sh`/`scope.sh` 豁免集 `\.agent/skills/` → `\.agents/skills/`；聚合产物 gates-{strict,warn,advisory}.sh 由 `registry-render.sh --gates` 重渲。
4. **pre-commit 垫片**挂载点探测序 `.agent/skills/*/` → `.agents/skills/*/`（zcode 项目内本来也扫 `.zcode/skills`，`.agents` 进探测序后覆盖跨工具项目）。
5. **文档**：SKILL.md「首次部署」、install.sh/install.bat 用法、离线安装器模板、precheck.conf 注释、README（如涉及）。措辞校正：`.agents/skills` 不再宣称「Agent Skills 开放标准默认路径」（开放标准推荐单数 `.agent`；`.agents` 是 zcode/Claude Code 兼容生态的原生发现根），改为「跨工具通用技能目录（zcode 原生发现根）」。
6. **版本**：CHANGELOG 新增 v2.96.2（v2.96.1 条目为已发生事实保留不改写）；`RELEASE-MANIFEST.json` yuan-skill 升 v2.96.2（release:check 首条对账）。
7. **守门测试**：`test-default-skill-dir.sh` 全部断言改 `.agents`；昨日钉住注释里的「默认 .agent/skills」字样同步。

## 决策记录

- **`.agents`（复数）**：用户 2026-10-29 裁定「按照 .agents 目录调整」。收益=zcode 零配置发现（源码硬编码发现根）；代价=偏离 Agent Skills 开放标准的单数 `.agent` 推荐路径（该路径本机仅 openspec 在用）。
- **不保留单数 `.agent` 兼容探测**：昨日改动未对外分发（main 未推送、无真实存量安装），不引入双目录兼容分支，保持单一事实源。
- **v2.96.2 而非修订 v2.96.1**：CHANGELOG 已入 git 历史，改写已存在条目=抹历史；校正轮独立占版。
- **历史档案不动**：`docs/research/`、`references/claude-code-capabilities.md` 等既有单数引用属历史研究记录，不随本轮替换。

## 验证

- `bash skills/swarm-yuan/tests/...`（经 runner）：`test-default-skill-dir`（六断言组改 .agents 后全绿）、`test-registry`（gates 重渲对账）。
- swarm-yuan 全量 runner 133/133；worktree 全量 vitest（release-manifest 17/17 含 v2.96.2 对账、docs-ssot-guard 6/6 含 A.1 387 登记）。
- 沙箱 HOME 实测：`--agents` 安装 `$HOME/.agents/skills/swarm-yuan`、auto 空宿主兜底、卸载存档；空项目生成落 `<project>/.agents/skills/<name>`。

## 设计文档影响

DESIGN_SYNC: none
理由：默认目录值校正，不触及整合正本与数字总账（无新增 conf 变量/文件数变化；A.1 计数 386→387 已同批登记，swarm-yuan CHANGELOG 随批记录）。
