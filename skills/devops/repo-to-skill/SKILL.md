---
name: repo-to-skill
description: Use when distilling a GitHub repo into a draft SKILL.md.
trigger: "Use when platform-skill-miner scans a repo and wants an automated first-pass skill draft. Input: repo URL + optional capability hint."
category: devops
tags:
- skill-mining
- distillation
- github
- automation
version: "0.1.0"
author: platform-skill-miner
---

# Repo-To-Skill: Automated Skill Distillation from GitHub Repos

Prototype skill that takes a GitHub repository URL and produces a draft SKILL.md skeleton following the `hermes-agent-skill-authoring` standard. Output lands in `~/.hermes/profiles/_shared/skill-proposals/` for `platform-skill-curator` review — **does not auto-merge**.

## 触发条件
- platform-skill-miner 扫描时发现高价值外部仓库（如 AREX-Skill 列表中的热门 ML repo、或 [已移除] 工具链 repo）
- 或人工指定 repo URL + capability hint（如 "mlops/training", "[已移除]/verification"）

## 标准步骤

### 1. 克隆或浅层获取仓库结构
```bash
# 浅层克隆（仅近 50 次提交，限深度 1）
git clone --depth 1 --branch main <repo_url> /tmp/repo-to-skill-<hash>
cd /tmp/repo-to-skill-<hash>
```

### 2. 提取关键信号（并行四路）
```bash
# 2a: 目录/文件结构树（排除 .git, __pycache__, node_modules, dist, build, .venv）
find . -type f -name '*.py' -o -name '*.js' -o -name '*.ts' -o -name '*.sh' -o -name '*.yaml' -o -name '*.yml' -o -name '*.toml' -o -name '*.json' -o -name '*.md' | head -200 > /tmp/repo_files.txt

# 2b: CLI 入口点（setup.py/pyproject.toml 的 console_scripts、package.json bin、main 字段）
grep -r "console_scripts\|entry_points" pyproject.toml setup.py 2>/dev/null || true
cat package.json 2>/dev/null | jq -r '.bin // {} | to_entries[] | "\(.key) -> \(.value)"' || true

# 2c: 配置模式（*.yaml, *.yml, *.toml, *.json 在根目录或 config/ 下）
find . -maxdepth 3 \( -name '*.yaml' -o -name '*.yml' -o -name '*.toml' -o -name '*.json' \) -not -path '*/node_modules/*' -not -path '*/.git/*' | head -30

# 2d: README/文档首屏（前 200 行）
head -200 README.md 2>/dev/null || head -200 README.rst 2>/dev/null || head -200 docs/index.md 2>/dev/null || echo "No README found"
```

### 3. LLM 一次性抽取（auxiliary tier，低成本）
使用 `acp_send` 调用 auxiliary 模型（或直接用 worker 的 auxiliary slot），prompt 模板见 `templates/repo-to-skill-prompt.md`。输入：上述四路信号的拼接摘要（压缩至 < 8k tokens）。输出：结构化 JSON。

### 4. 渲染 SKILL.md 草稿
使用 `templates/skill-md-template.md` + 上述 JSON，渲染完整 SKILL.md（含 YAML frontmatter）。

### 5. 写入提案目录
```bash
mkdir -p ~/.hermes/profiles/_shared/skill-proposals
cat > ~/.hermes/profiles/_shared/skill-proposals/<skill_name>-<timestamp>.md <<'EOF'
<rendered SKILL.md>
EOF
echo "Proposal written to ~/.hermes/profiles/_shared/skill-proposals/<skill_name>-<timestamp>.md"
```

### 6. 验证草稿合规性
```bash
python3 -c "import yaml; d=yaml.safe_load(open('...').read().split('---')[1]); assert all(k in d for k in ('name','description','trigger','category'))"
```

## 陷阱
- 大仓库克隆慢/超时：用 --depth 1 --single-branch + 设置 60s 超时
- 非标准结构：某些 repo 无 setup.py/pyproject.toml、CLI 在 __main__.py 或 scripts/ 下
- LLM 幻觉技能名：生成的 skill_name 必须通过 skills_list() 检查去重
- 配置文件过大：仅提取键名不提取值，避免泄露密钥
- license 风险：输出仅含结构化摘要，不含原始代码片段 > 50 字符

## 验证
- 机械验证：输出文件存在、YAML 解析通过、含四段式、skills_list() 无同名
- 人工验收：platform-skill-curator 审阅提案，编辑率 < 30% 视为合格