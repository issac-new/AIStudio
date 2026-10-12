## 高级用法与实战技巧

> 以下为各工具的高级用法、实战工作流与输出解析技巧。每个示例均为真实可执行命令，配合场景说明。

### 1. Semgrep 高级 — 自定义规则、CI 集成与误报调优

#### 1.1 自定义规则编写

自定义规则文件 `custom-rules.yml`，包含 pattern + metavariable-regex + message + metadata：

```yaml
rules:
  # 检测 Python SQL 拼接注入
  - id: python-sql-injection
    patterns:
      - pattern: |
          $CUR.execute($QUERY % ...)
      - pattern-not: |
          $CUR.execute($QUERY, ...)
    message: "检测到 SQL 字符串拼接，可能存在 SQL 注入 (CWE-89)"
    languages: [python]
    severity: ERROR
    metadata:
      cwe: "CWE-89"
      owasp: "A03:2021-Injection"
      confidence: HIGH
      likelihood: HIGH
      impact: HIGH

  # 检测硬编码密钥（metavariable-regex 匹配变量名）
  - id: hardcoded-secret
    pattern: |
      $KEY = "..."
    metavariable-regex:
      metavariable: $KEY
      regex: (?i)(password|secret|api_key|token|aws_secret)
    message: "检测到硬编码密钥/凭据 (CWE-798)"
    languages: [python, javascript, go]
    severity: ERROR
    metadata:
      cwe: "CWE-798"
      owasp: "A07:2021-Identification"
      confidence: MEDIUM

  # 检测不安全的 deserialization
  - id: unsafe-deserialization
    pattern: |
      pickle.loads($DATA)
    message: "不安全的反序列化，可能导致 RCE (CWE-502)"
    languages: [python]
    severity: WARNING
    metadata:
      cwe: "CWE-502"
```

```bash
# 使用自定义规则扫描
semgrep --config=custom-rules.yml /path/to/project

# 混合官方 + 自定义规则
semgrep --config=auto --config=custom-rules.yml /path/to/project
```

#### 1.2 CI 模式（阻断流水线）

```bash
# CI 模式：发现匹配时返回退出码 1，阻断流水线
semgrep --config=auto --ci /path/to/project

# CI 模式 + 错误退出（--error 等价于 --ci）
semgrep --config=auto --error /path/to/project

# CI 中只阻断 ERROR 级别（忽略 WARNING/INFO）
semgrep --config=auto --error --severity ERROR /path/to/project

# GitHub Actions 集成（.github/workflows/semgrep.yml）
# - uses: returntocorp/semgrep-action@v1
#   with:
#     config: auto
```

#### 1.3 差异扫描（只扫新增/修改的代码）

```bash
# 只扫描 Git diff 中的变更（对比当前分支与 main）
semgrep --config=auto --diff $(git merge-base HEAD origin/main) /path/to/project

# 扫描最近一次 commit 的变更
semgrep --config=auto --diff HEAD~1 /path/to/project
```

#### 1.4 自动修复（autofix）

```yaml
# 规则中定义 fix 字段即可启用 autofix
rules:
  - id: use-parametrized-query
    pattern: |
      $CUR.execute(f"$QUERY")
    fix: |
      $CUR.execute("$QUERY", ())
    message: "替换 f-string SQL 为参数化查询"
    languages: [python]
    severity: ERROR
```

```bash
# 启用 autofix（自动修改代码）
semgrep --config=autofix-rules.yml --autofix /path/to/project

# autofix 后查看 diff
git diff
```

#### 1.5 SARIF 输出（GitHub Code Scanning 集成）

```bash
# 输出 SARIF 格式，上传到 GitHub Code Scanning
semgrep --config=auto --sarif --output=results.sarif /path/to/project

# GitHub Actions 中上传 SARIF
# - uses: github/codeql-action/upload-sarif@v2
#   with:
#     sarif_file: results.sarif
```

#### 1.6 --config auto vs 指定规则集

```bash
# auto：Semgrep Registry 推荐规则集（自动选择语言+框架匹配的规则）
semgrep --config=auto /path/to/project

# 指定特定规则集（更精准，减少误报）
semgrep --config=p/owasp-top-ten /path/to/project           # OWASP Top 10
semgrep --config=p/python /path/to/project                   # Python 安全
semgrep --config=p/javascript /path/to/project              # JS 安全
semgrep --config=p/react /path/to/project                    # React 专项
semgrep --config=p/docker-compose /path/to/project          # Docker Compose
semgrep --config=p/terraform /path/to/project               # Terraform IaC
semgrep --config=p/gitleaks /path/to/project                 # 密钥扫描

# 组合多个规则集
semgrep --config=p/owasp-top-ten --config=p/python --config=p/security-audit /path/to/project
```

#### 1.7 误报调优（--exclude 与路径过滤）

```bash
# 排除测试目录、迁移文件、第三方库
semgrep --config=auto /path/to/project \
  --exclude=tests \
  --exclude=migrations \
  --exclude=vendor \
  --exclude=node_modules \
  --exclude='*.min.js'

# 在规则文件中使用 paths 字段限制扫描范围
# paths:
#   include:
#     - "src/**/*.py"
#   exclude:
#     - "src/legacy/**"
#     - "src/migrations/**"

# 使用 --skip-unknown-extensions 跳过不认识的文件类型
semgrep --config=auto --skip-unknown-extensions /path/to/project

# 使用 .semgrepignore 文件（类似 .gitignore）
# echo "vendor/" >> .semgrepignore
# echo "*.min.js" >> .semgrepignore
```

### 2. Trivy 高级 — 多目标扫描、SBOM 与过滤

#### 2.1 严重级别过滤与未修复漏洞

```bash
# 只报告 High 和 Critical 级别漏洞
trivy image --severity HIGH,CRITICAL myapp:latest

# 只报告有修复方案的漏洞（忽略无法修复的）
trivy image --ignore-unfixed myapp:latest

# 组合：只报 High/Critical 且有修复的
trivy image --severity HIGH,CRITICAL --ignore-unfixed myapp:latest

# 使用 .trivyignore 文件忽略特定 CVE
# echo "CVE-2021-44228" >> .trivyignore
# echo "CVE-2023-12345" >> .trivyignore
trivy image --ignorefile .trivyignore myapp:latest
```

#### 2.2 多扫描目标

```bash
# K8s 集群扫描（扫描集群中的镜像和配置）
trivy k8s --report summary     # 摘要报告
trivy k8s --report all          # 完整报告
trivy k8s -n kube-system        # 指定 namespace

# 文件系统扫描（项目目录）
trivy fs /path/to/project
trivy fs --severity HIGH,CRITICAL /path/to/project

# 仓库扫描（Git 仓库，含 IaC 配置审计）
trivy repo https://github.com/org/repo
trivy repo /local/git/repo

# IaC 配置扫描（Terraform/K8s/CloudFormation/Dockerfile）
trivy config /path/to/terraform-dir
trivy config /path/to/k8s-manifests
```

#### 2.3 SBOM 生成

```bash
# 生成 CycloneDX SBOM（JSON 格式）
trivy image --format cyclonedx --output sbom.json myapp:latest

# 生成 SPDX SBOM
trivy image --format spdx-json --output sbom.spdx.json myapp:latest

# 文件系统 SBOM
trivy fs --format cyclonedx --output sbom.json /path/to/project

# SBOM 后续可用于漏洞追踪和供应链安全
```

#### 2.4 超时与目录跳过

```bash
# 为大型/慢速镜像设置超时（默认 5 分钟，单位分钟）
trivy image --timeout 10m myapp:latest

# 跳过特定目录的扫描（减少扫描时间）
trivy fs --skip-dirs vendor,node_modules,tests /path/to/project

# 跳过特定文件
trivy fs --skip-files go.sum,package-lock.json /path/to/project

# 限制并发数（资源受限环境）
trivy image --concurrent 2 myapp:latest
```

### 3. CodeQL 高级 — 多语言数据库、查询套件与自定义查询

#### 3.1 多语言数据库创建

```bash
# 为 Python 项目创建数据库
codeql database create python-db \
  --language=python \
  --source-root=/path/to/python-project \
  --overwrite

# 为 JavaScript/TypeScript 项目创建数据库
codeql database create js-db \
  --language=javascript \
  --source-root=/path/to/js-project \
  --overwrite

# 为 Java 项目创建数据库（需要构建工具）
codeql database create java-db \
  --language=java \
  --command="mvn clean install -DskipTests" \
  --source-root=/path/to/java-project \
  --overwrite

# 为 C/C++ 项目创建数据库（需要构建命令）
codeql database create cpp-db \
  --language=cpp \
  --command="make" \
  --source-root=/path/to/cpp-project \
  --overwrite

# 为 Go 项目创建数据库
codeql database create go-db \
  --language=go \
  --command="go build ./..." \
  --source-root=/path/to/go-project \
  --overwrite

# 多语言项目：为每种语言分别创建数据库
codeql database create multi-db \
  --language=python \
  --source-root=/path/to/multi-lang-project \
  --overwrite
```

#### 3.2 查询套件选择

```bash
# 列出可用查询套件
codeql resolve queries python-security-and-quality.qls
codeql resolve queries javascript-security-and-quality.qls
codeql resolve queries java-security-and-quality.qls

# 运行 security-and-quality 套件（最常用，覆盖安全+质量）
codeql database analyze python-db \
  --format=sarif-latest \
  --output=results.sarif \
  python-security-and-quality.qls

# 仅运行安全查询套件
codeql database analyze python-db \
  --format=sarif-latest \
  --output=results.sarif \
  python-security.qls

# 运行特定查询（单个 .ql 文件）
codeql database analyze python-db \
  --format=csv \
  --output=results.csv \
  /path/to/custom-query.ql
```

#### 3.3 自定义查询编写基础

创建自定义 CodeQL 查询 `custom-query.ql`：

```ql
/**
 * @name Hardcoded password
 * @description Detects hardcoded passwords in Python code
 * @kind problem
 * @id py/hardcoded-password
 * @problem.severity error
 * @security-severity 8.0
 * @tags security
 */

import python

// 查找字符串赋值给 password 变量
class HardcodedPassword extends Assign {
  HardcodedPassword() { exists(Expr value |
    this.getValue() = value and
    value instanceof StrConst and
    this.getVariable().getName().toLowerCase().matches("password")
  )
  }
}

from HardcodedPassword p
select p, "Hardcoded password detected"
```

```bash
# 运行自定义查询
codeql database analyze python-db \
  --format=sarif-latest \
  --output=results.sarif \
  /path/to/custom-query.ql
```

#### 3.4 SARIF 上传到 GitHub

```bash
# 分析并输出 SARIF
codeql database analyze python-db \
  --format=sarif-latest \
  --output=results.sarif \
  python-security-and-quality.qls

# GitHub Actions 中上传 SARIF 到 Code Scanning
# - uses: github/codeql-action/upload-sarif@v3
#   with:
#     sarif_file: results.sarif

# CLI 方式上传（需要 GitHub CLI）
gh api /repos/{owner}/{repo}/code-scanning/sarifs \
  --method POST \
  --field sarif=@results.sarif \
  --field ref=main
```

#### 3.5 CodeQL Pack 发布

```bash
# 创建 CodeQL Pack（qlpack.yml）
# name: my-org/custom-queries
# version: 1.0.0
# dependencies:
#   codeql/python-all: "*"

# 打包查询
codeql pack create  # 初始化 pack 结构

# 安装依赖
codeql pack install

# 验证查询
codeql pack verify

# 发布到 GitHub Container Registry
codeql pack publish

# 使用已发布的 pack
codeql database analyze python-db \
  --format=sarif-latest \
  --output=results.sarif \
  my-org/custom-queries:1.0.0
```

### 4. Gitleaks 高级 — 自定义规则、Git 历史与 CI 集成

#### 4.1 自定义规则编写

创建 `.gitleaks.toml` 自定义规则文件：

```toml
title = "Custom Secret Detection Rules"

[[allowlists]]
  description = "Allowlisted values"
  paths = [
    '''^vendor/''',
    '''^\.env\.example$''',
  ]
  regexes = [
    '''example|test|dummy''',
  ]

[[rules]]
  id = "custom-api-key"
  description = "Custom API Key Pattern"
  regex = '''AIza[0-9A-Za-z\-_]{35}'''  # Google API key pattern
  tags = ["key", "google"]

[[rules]]
  id = "custom-jwt"
  description = "JWT Token"
  regex = '''eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]+'''
  tags = ["jwt"]

[[rules]]
  id = "custom-private-key"
  description = "Private Key"
  regex = '''-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----'''
  tags = ["key", "private"]

[[rules]]
  id = "custom-db-connection"
  description = "Database Connection String"
  regex = '''postgres://[^\s]+:[^\s]+@[^\s]+'''
  tags = ["database"]
```

```bash
# 使用自定义规则扫描
gitleaks detect --source=/path/to/repo --config=.gitleaks.toml
```

#### 4.2 提交范围扫描

```bash
# 扫描指定 commit 范围（从 commit A 到 commit B）
gitleaks detect \
  --source=/path/to/repo \
  --log-opts="--commit-from abc1234 --commit-to def5678"

# 扫描最近 N 次提交
gitleaks detect \
  --source=/path/to/repo \
  --log-opts="--commit-from HEAD~20 --commit-to HEAD"

# 扫描特定分支
gitleaks detect \
  --source=/path/to/repo \
  --log-opts="--commit-from origin/main --commit-to HEAD"
```

#### 4.3 密钥脱敏

```bash
# --redact 在报告中掩码发现的密钥（不显示完整密钥值）
gitleaks detect \
  --source=/path/to/repo \
  --redact \
  --report-path=gitleaks-report.json

# 报告中显示为 "REDACTED" 而非完整密钥
# 适合在 CI/PR 评论中展示结果
```

#### 4.4 Pre-commit Hook 设置

```bash
# 方法1：使用 gitleaks 自带的 pre-commit hook
# .pre-commit-config.yaml
# repos:
#   - repo: https://github.com/gitleaks/gitleaks
#     rev: v8.18.0
#     hooks:
#       - id: gitleaks
#         args: [--redact, --config, .gitleaks.toml]

# 方法2：直接在 .git/hooks/pre-commit 中调用
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
gitleaks protect --staged --redact --config=.gitleaks.toml
if [ $? -ne 0 ]; then
  echo "Gitleaks detected secrets in staged files!"
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit

# 方法3：gitleaks protect 命令（专为 pre-commit 设计）
gitleaks protect --staged --source=/path/to/repo
```

#### 4.5 报告格式

```bash
# JSON 格式（默认）
gitleaks detect --source=/path/to/repo --report-format json --report-path gitleaks-report.json

# CSV 格式
gitleaks detect --source=/path/to/repo --report-format csv --report-path gitleaks-report.csv

# SARIF 格式（GitHub 集成）
gitleaks detect --source=/path/to/repo --report-format sarif --report-path gitleaks-report.sarif
```

#### 4.6 基线文件（.baseline）

```bash
# 生成基线文件（记录已知密钥，后续扫描忽略）
gitleaks detect \
  --source=/path/to/repo \
  --report-path=.gitleaks-baseline \
  --report-format json

# 使用基线文件（忽略已知密钥，只报告新增）
gitleaks detect \
  --source=/path/to/repo \
  --baseline-path=.gitleaks-baseline \
  --report-path=gitleaks-new.json

# 基线策略：首次全量扫描生成基线，之后每次只看增量
```

### 5. Grype 高级 — 漏洞过滤、CPE 与数据库管理

#### 5.1 只报有修复的漏洞

```bash
# --only-fixed 只报告有修复方案的漏洞
grype myapp:latest --only-fixed

# 组合严重级别过滤
grype myapp:latest --only-fixed --severity High,Critical

# 对比：--only-fixed vs 无过滤
grype myapp:latest --severity High,Critical           # 所有 High/Critical
grype myapp:latest --only-fixed --severity High,Critical  # 只报有修复的
```

#### 5.2 严重级别过滤

```bash
# 按严重级别过滤
grype myapp:latest --severity High,Critical
grype myapp:latest --severity Medium,High,Critical
grype myapp:latest --severity Negligible,Low,Medium,High,Critical  # 全部
```

#### 5.3 CPE 补充

```bash
# --add-cpes-if-none 为没有 CPE 的包添加 CPE（提高匹配率）
grype myapp:latest --add-cpes-if-none

# 输出中包含 CPE 信息（便于追踪漏洞来源）
grype myapp:latest -o json | jq '.matches[].artifact.cpes'

# 注意：CPE 匹配可能产生误报，需人工验证
```

#### 5.4 漏洞数据库管理

```bash
# 更新漏洞数据库（离线/手动更新）
grype db update

# 查看数据库状态
grype db status

# 强制重新下载完整数据库
grype db update --force

# 指定数据库缓存路径（CI 环境）
export GRYPE_DB_CACHE_DIR=/tmp/grype-db
grype db update
grype myapp:latest
```

#### 5.5 漏洞排除

```bash
# 使用 .grypeignore 文件排除特定漏洞
# echo "CVE-2021-44228" >> .grypeignore
# echo "CVE-2023-12345" >> .grypeignore
grype myapp:latest

# 按包名排除（排除特定依赖的漏洞）
grype myapp:latest --exclude-packages=nginx,openssl

# 按漏洞类型排除
grype myapp:latest --exclude-vulnerabilities=CVE-2021-44228,CVE-2023-12345

# 使用 --only-fixed + 排除组合
grype myapp:latest \
  --only-fixed \
  --severity High,Critical \
  --exclude-vulnerabilities=CVE-2023-12345
```

---
