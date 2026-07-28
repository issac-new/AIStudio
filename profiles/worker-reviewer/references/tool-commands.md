## 具体操作命令手册

审查时按以下分类选用命令，**每条命令必须真实可执行**——禁止编造命令名或参数。

### 1. Git Diff / 代码审查

```bash
# 查看最近一次提交的变更
git diff HEAD~1

# 查看最近 10 条提交历史
git log --oneline -10

# 查看指定 commit 的完整内容（含 diff）
git show <commit>

# 获取 GitHub PR 的 diff
gh pr diff <num>

# 查看 PR 详情（标题/描述/CI 状态）
gh pr view <num>
```

### 2. Linters（静态检查 / 风格）

```bash
# Python：ruff 检查并自动修复
ruff check . --fix

# JavaScript/TypeScript：ESLint
eslint . --ext .ts,.tsx

# Go：golangci-lint
golangci-lint run

# Shell 脚本：shellcheck
shellcheck **/*.sh

# Python 类型检查：mypy 严格模式
mypy . --strict
```

### 3. SAST（静态应用安全测试）

```bash
# 多语言 SAST：自动检测安全漏洞
semgrep --config=auto .

# OWASP Top 10 规则集
semgrep --config=p/owasp-top-ten .

# Python 专用 SAST
bandit -r .

# Go 专用 SAST
gosec ./...
```

### 4. 依赖漏洞扫描

```bash
# Python：扫描已安装依赖的已知漏洞
pip-audit

# Node.js：npm 依赖审计
npm audit

# Rust：cargo 依赖漏洞扫描
cargo audit

# 文件系统级漏洞扫描（多语言）
trivy fs .

# OSV 数据库扫描
osv-scanner -r .
```

### 5. 代码复杂度分析

```bash
# 圈复杂度（Cyclomatic Complexity）摘要
radon cc . -a

# 可维护性指数（Maintainability Index）
radon mi .

# 多语言复杂度分析，报告 CC > 10 的函数
lizard -C 10 .
```

### 6. 审查清单辅助命令

```bash
# 查看变更文件统计（行数增减）
git diff --stat

# 列出本地分支领先 origin/main 的提交
git log --format='%H %s' origin/main..HEAD

# 通过 GitHub API 获取 PR 变更文件列表
gh api repos/{owner}/{repo}/pulls/{num}/files
```

> **使用原则**：先 `git diff` 拿到变更范围，再按语言/风险选 linter + SAST + 依赖扫描跑一遍，
> 复杂度报告辅助判断是否过度工程，最后用审查清单命令汇总。命令输出贴进审查报告作为客观证据。

### 7. 深度代码分析

**CodeQL（GitHub — 深度代码分析）**

```bash
# 安装 CodeQL CLI（macOS）
brew install codeql

# 下载 CodeQL 标准库
codeql pack download codeql-suites

# 创建数据库（从源代码）
codeql database create ./codeqldb --language=python --source-root=.

# 运行查询
codeql database analyze ./codeqldb codeql-suites/python-security-and-quality.qls --format=sarif-latest --output=results.sarif

# 查看结果摘要
codeql database analyze ./codeqldb codeql-suites/python-security-and-quality.qls --format=text
```

**SonarQube CLI（sonar-scanner — 代码质量分析）**

```bash
# 安装 sonar-scanner（macOS）
brew install sonar-scanner

# 在项目目录运行扫描
sonar-scanner \
  -Dsonar.projectKey=my-project \
  -Dsonar.sources=. \
  -Dsonar.host.url=http://localhost:9000 \
  -Dsonar.token=<token>

# 指定排除目录
sonar-scanner -Dsonar.exclusions=**/node_modules/**,**/vendor/**
```

### 8. 密钥泄漏检测

**Gitleaks**

```bash
# 安装 gitleaks（macOS）
brew install gitleaks

# 扫描当前仓库
gitleaks detect --source . --report-path gitleaks-report.json

# 扫描指定目录（非 Git 仓库）
gitleaks detect --source ./config --no-git

# 只扫描本次提交的变更
gitleaks detect --source . --log-opts="HEAD~1..HEAD"

# 保护模式：扫描并阻止含密钥的提交
gitleaks protect --staged
```

**TruffleHog（深度密钥扫描）**

```bash
# 安装 trufflehog
pip install trufflehog

# 扫描 Git 仓库
trufflehog git --since-commit HEAD~10 https://github.com/org/repo

# 扫描本地目录
trufflehog filesystem --directory .

# 扫描 GitHub 组织
trufflehog github --org=my-org --token=<token>

# 输出 JSON 格式
trufflehog git --json file:///path/to/repo
```

### 9. 依赖合规与许可扫描

**Nancy（Go 依赖漏洞扫描）**

```bash
# 安装 nancy（macOS）
brew install nancy

# 扫描 go.sum
golangci-lint run && nancy go.sum

# 输出 JSON 格式
nancy go.sum --output json

# 忽略特定 CVE
nancy go.sum --exclude- vulnerability=CVE-2023-1234
```

**Safety（Python 安全依赖检查）**

```bash
# 安装 safety
pip install safety

# 扫描已安装依赖
safety check

# 扫描 requirements.txt
safety check -r requirements.txt

# 完整数据库扫描
safety check --full-report

# 忽略特定 CVE
safety check --ignore 12345,67890
```

**license-checker（许可合规扫描）**

```bash
# 安装 license-checker（Node.js 项目）
npm install -g license-checker

# 列出所有依赖的许可类型
license-checker --summary

# 只允许特定许可（白名单模式）
license-checker --onlyAllow "MIT;Apache-2.0;BSD"

# 输出 JSON
license-checker --json > licenses.json

# 输出 CSV（便于导入表格）
license-checker --csv > licenses.csv
```

### 10. Diff 分析增强

```bash
# 查看变更文件统计（精确的行数增减）
git diff --stat

# 对比两个 commit 之间变更的文件列表
git diff --name-only <commit1>..<commit2>

# 使用 interdiff 查看补丁间的增量变更（当有两版 patch 时）
# 安装 interdiff（macOS）
brew install patchutils
# 比较两个 diff 文件
interdiff old.patch new.patch

# 查看 diff 的上下文并标记变更类型（A/M/D）
git diff --diff-filter=AMD --name-only HEAD~1

# 统计每个贡献者的变更行数
git log --format='%an' --since="1 month ago" | sort | uniq -c | sort -rn

# 可视化文件变更热力图（按文件类型分组）
git diff --stat HEAD~10 | awk '{print $1}' | awk -F. '{print $NF}' | sort | uniq -c | sort -rn
```
---

---
