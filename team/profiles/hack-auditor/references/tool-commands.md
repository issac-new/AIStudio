## 具体操作命令手册

> 以下命令均为真实可执行命令，复制粘贴即用。请根据实际项目路径、镜像名、云账号调整参数。

### 1. Semgrep — SAST 静态应用安全测试

```bash
# 自动配置扫描（Semgrep Registry 推荐规则集）
semgrep --config=auto /path/to/project

# OWASP Top 10 专项扫描
semgrep --config=p/owasp-top-ten /path/to/project

# 多规则集组合扫描
semgrep --config=p/owasp-top-ten --config=p/python --config=p/security-audit /path/to/project

# 输出 SARIF 格式（CI/CD 集成用）
semgrep --config=auto --sarif --output=results.sarif /path/to/project

# 仅输出 JSON 格式
semgrep --config=auto --json --output=results.json /path/to/project

# 自定义规则扫描
semgrep --config=custom-rules.yml /path/to/project
```

### 2. Trivy — 容器镜像 / 文件系统 / IaC 漏洞扫描

```bash
# 扫描容器镜像
trivy image nginx:latest
trivy image --severity HIGH,CRITICAL myapp:latest

# 扫描文件系统（项目目录）
trivy fs /path/to/project

# 扫描 IaC 配置（Terraform/CloudFormation/K8s manifests）
trivy config /path/to/terraform-dir

# 输出 JSON 格式
trivy image --format json --output trivy-report.json myapp:latest

# 扫描并忽略未修复漏洞（只报有修复方案的）
trivy image --ignore-unfixed myapp:latest
```

### 3. Gitleaks — 密钥/凭据扫描

```bash
# 扫描整个 Git 仓库历史
gitleaks detect --source=/path/to/repo --report-path=gitleaks-report.json

# 扫描暂存区（pre-commit 钩子用）
gitleaks protect --staged --source=/path/to/repo

# 使用自定义规则扫描
gitleaks detect --source=/path/to/repo --config=gitleaks-rules.toml

# 扫描指定提交范围
gitleaks detect --source=/path/to/repo --log-opts="--commit-from=HEAD~10 --commit-to=HEAD"
```

### 4. Bandit — Python 安全扫描

```bash
# 扫描 Python 项目
bandit -r /path/to/python/project

# 输出 JSON 格式
bandit -r /path/to/python/project -f json -o bandit-report.json

# 仅报告 HIGH/MEDIUM 严重级别
bandit -r /path/to/python/project -ll

# 仅报告 HIGH 严重级别
bandit -r /path/to/python/project -lll

# 排除测试目录
bandit -r /path/to/python/project -x tests,venv
```

### 5. gosec — Go 安全扫描

```bash
# 扫描 Go 项目
gosec ./...

# 指定目录扫描
gosec /path/to/go/project/...

# 输出 JSON 格式
gosec -fmt json -out gosec-report.json ./...

# 输出 SARIF 格式
gosec -fmt sarif -out gosec-report.sarif ./...

# 排除规则（如排除 G104 未检查错误）
gosec -exclude=G104 ./...

# 设置严重级别阈值
gosec -severity medium ./...
```

### 6. Prowler — AWS 安全审计

```bash
# 运行完整 AWS CIS 基线审计
prowler aws

# 指定 AWS profile 和 region
prowler aws --profile my-profile --region us-east-1

# 运行特定检查（如只检查 S3）
prowler aws --checks s3_bucket_public_access_block

# 输出 JSON 格式
prowler aws --output-formats json

# 输出 HTML 报告
prowler aws --output-formats html

# 列出所有可用检查项
prowler aws --list-checks
```

### 7. ScoutSuite — 多云安全审计

```bash
# AWS 审计
scout aws --profile my-profile

# Azure 审计
scout azure --cli

# GCP 审计
scout gcp --user-account

# 报告输出到指定目录
scout aws --profile my-profile --report-dir ./scout-report

# 跳过特定服务
scout aws --profile my-profile --skip S3
```

### 8. kube-bench — Kubernetes CIS 基线检查

```bash
# 在集群节点上运行 CIS 基线检查（需要节点 shell 访问）
kube-bench --benchmark cis-1.8

# 通过 kubectl 在 Pod 中运行
kubectl run --rm -i -t kube-bench --image=aquasec/kube-bench:latest -- kube-bench

# 运行特定节点类型检查（master/worker）
kube-bench --benchmark cis-1.8 run --targets node

# 输出 JSON 格式
kube-bench --json --outputfile kube-bench-report.json

# 运行 etcd 专项检查
kube-bench run --targets=etcd
```

### 9. tfsec / Checkov — Terraform IaC 安全扫描

```bash
# tfsec — 扫描 Terraform 目录
tfsec /path/to/terraform

# tfsec — 输出 JSON 格式
tfsec /path/to/terraform --format json

# tfsec — 输出 SARIF 格式
tfsec /path/to/terraform --format sarif --out tfsec-report.sarif

# checkov — 扫描 Terraform 目录
checkov -d /path/to/terraform

# checkov — 扫描单个文件
checkov -f main.tf

# checkov — 输出 JSON 格式
checkov -d /path/to/terraform -o json --output-file checkov-report.json

# checkov — 扫描 CloudFormation / K8s / Helm
checkov -d /path/to/cloudformation --framework cloudformation
checkov -d /path/to/k8s-manifests --framework kubernetes
```

### 10. npm audit / pip-audit — 依赖漏洞扫描

```bash
# npm audit — Node.js 项目依赖扫描
npm audit

# npm audit — 输出 JSON 格式
npm audit --json > npm-audit-report.json

# npm audit — 自动修复可修复的漏洞
npm audit fix

# npm audit — 强制安装 breaking change 修复
npm audit fix --force

# pip-audit — Python 项目依赖扫描
pip-audit

# pip-audit — 扫描 requirements.txt
pip-audit -r requirements.txt

# pip-audit — 输出 JSON 格式
pip-audit -r requirements.txt -f json -o pip-audit-report.json

# pip-audit — 扫描已安装的包
pip-audit --desc
```

---
