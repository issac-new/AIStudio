# /swarm-yuan — 为指定项目一键生成开发技能

## 用法

```
/swarm-yuan <项目路径> [skill名称]
```

## 示例

```
/swarm-yuan /path/to/your-project
/swarm-yuan /path/to/your-project my-project-dev
/swarm-yuan --upgrade /path/to/your-project my-project-dev
```

## AI 执行流程

当用户输入 `/swarm-yuan` 时，按以下流程**自动执行**，用户无需手动编辑任何文件：

### 1. 解析参数
- 第一个参数 = 项目路径（必填）
- 第二个参数 = skill 名称（可选，默认从项目名推导：`<basename>-dev`）
- `--upgrade` 标志 = 升级已有 skill

### 2. 自检运行时
```bash
bash ~/.claude/skills/swarm-yuan/scripts/self-check.sh
```

### 3. 读取项目知识（最高优先级）
读取项目的既有知识文件，提取规则：
- P0：`AGENTS.md`（可改范围/只读区/改造分类/分支策略）、`CLAUDE.md`（项目概述/命令/端口/架构）
- P0：若项目存在只读上游快照区（如 `upstream/`、`vendor/`、`third_party/` 等，以 AGENTS.md 声明为准），读取其顶层 README/模块清单以了解可复用面——但**不深入读取其内部全部文件**（只读区非探查重点，违规检测交给 `--scope` 门禁）
- P1：`.zcode/memories/`（全局规则/用户偏好/历史教训）、`.claude/`（claude-mem 记忆库）
- P2：`CONTRIBUTING.md`、`README.md`、`.github/`
- P3：`docs/`（specs/plans/ADR）

### 4. 探查项目（三路并行子代理）
- 路 A：结构与构建 — 顶层目录、包描述文件、构建系统、测试框架、端口
- 路 B：开发规范 — 从 Step 3 读取的知识 + 分支策略 + 文档约定 + 改造分类
- 路 C：代码组织与资源 — 源码目录、组件库、接口、数据模型、可复用稳定单元、AI agent 运行时
- 优先用代码图谱（`gitnexus analyze` / `graphify .`）索引

### 5. 提取 17 项特征卡
从探查结果整理 17 项特征卡，每项落到具体值（真实路径/命令/版本/组件名），不用占位符。

### 6. 创建骨架
```bash
bash ~/.claude/skills/swarm-yuan/scripts/generate-skill.sh <skill名称> <项目路径>
```

### 7. AI 自动填充全部文件
从特征卡推导内容，填充：
- `SKILL.md` — 项目定位、铁律（引用 AGENTS.md/CLAUDE.md 来源）、命令速查、门禁清单
- `references/codebase.md` — 目录树、技术栈版本表、端口
- `references/dev-guide.md` — 改造分类、拼装式开发原则、可复用单元清单、AI agent 配置指引
- `references/release.md` — 编译规则表、构建命令、产物位置
- `references/reference-manual.md` — 安全清单、组件库、依赖链路、接口清单、数据字典、认知映射表、六维动力学基线、逻辑谬误图谱、辩证映射表、领域知识、AI Agent 运行时段
- `references/workflow.md` — 九节点全流程（4 要素/节点，含★调用追踪 + 4-Phase SOP + 每节点读取项目知识子步骤）
- `scripts/snippets.md` — 常用代码片段、组件参数配置
- `scripts/mcp-tools.md` — MCP 工具接入说明

### 8. AI 自动配置 precheck.conf
从特征卡推导 197 个配置变量（precheck.conf 三件套：core 28 + arch 121 + compliance 48），自动填写 `scripts/precheck.conf`+`precheck.arch.conf`+`precheck.compliance.conf`。

### 9. AI 运行门禁验证
```bash
bash <skill路径>/scripts/precheck.sh --all        # 核心门禁
bash <skill路径>/scripts/precheck.sh --all-full    # 标准 29 门禁（核心 11 + 架构 18）
bash <skill路径>/scripts/precheck.sh --compliance-suite  # 合规 19 门禁（强监管交付按需）
```
有 fail 则 AI 自动修复后重跑。

### 10. AI 写回项目背景知识
将探查到的新知识写回项目记忆（claude-mem / .zcode/memories / .project-knowledge.md），形成闭环。

### 11. 输出验证报告
向用户展示：
- 生成的 skill 路径
- 门禁验证结果（pass/fail/warn 汇总）
- 项目特征卡摘要（17 项）
- 下一步使用指引

## 全链路追踪（每步必做，无需用户确认）

执行上述每一步时：
1. **公告**：进入每步先输出一行结构化提示，格式 `→ [Step N] 调用 <技能/子代理/工具> · <目的>`（如 `→ [Step 4] 调用 graphify · 索引代码图谱`）。
2. **落盘**：节点级默认——每步开始/结束时执行 `bash scripts/trace-log.sh --node "Step N" --actor <技能/子代理> --tool <工具/命令>`（生成器目录下的 `assets/trace-log.sh`，或目标技能的 `scripts/trace-log.sh`），追加到 `<项目>/.swarm-yuan/trace.jsonl`；调用级细节（每次具体调用）设 `SWARM_YUAN_TRACE=verbose` 时落盘。

## 安装方式

```bash
# 方式 1：Claude Code slash command（推荐）
# 将 .claude/commands/swarm-yuan.md 复制到项目的 .claude/commands/ 或全局 ~/.claude/commands/
cp -r ~/.claude/skills/swarm-yuan/.claude/commands/ ~/.claude/commands/

# 方式 2：直接用 skill（Claude Code 自动识别 ~/.claude/skills/ 下的 SKILL.md）
# 无需安装，Claude Code 会自动加载

# 方式 3：其他 AI 工具
# 将 swarm-yuan 目录复制到对应工具的 skills/ 目录
```
