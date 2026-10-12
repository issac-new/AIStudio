## 补充工具与命令

> 以下补充工具经安全工具研究确认，覆盖代码语义分析、依赖/容器漏洞扫描、IaC 合规、镜像分层审计、K8s 攻击面探测、Docker CIS 基线及系统加固审计。

### 1. CodeQL — 语义化代码查询与漏洞发现

```bash
# 安装
# 方法1：Homebrew
brew install codeql
# 方法2：从 CLI 二进制发布页下载
# https://github.com/github/codeql-cli-binaries/releases

# 创建 CodeQL 数据库（从源码）
codeql database create my-db --language=python --source-root=/path/to/project --overwrite

# 运行标准安全查询（输出 SARIF）
codeql database analyze my-db --format=sarif-latest --output=results.sarif

# 运行特定查询套件
codeql database analyze my-db --format=csv --output=results.csv python-security-and-quality.qls

# 列出可用语言
codeql resolve languages

# 列出可用查询套件
codeql resolve queries python-security-and-quality.qls
```

### 2. OSV-Scanner — Google 维护的多生态漏洞扫描

```bash
# 安装
# 方法1：Go install
go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest
# 方法2：从发布页下载预编译二进制
# https://github.com/google/osv-scanner/releases

# 扫描源码目录（自动检测 lockfile）
osv-scanner -r /path/to/project

# 扫描指定 lockfile
osv-scanner --lockfile=/path/to/package-lock.json

# 扫描 SBOM
osv-scanner --sbom=/path/to/sbom.spdx.json

# 扫描容器镜像
osv-scanner scan image nginx:latest

# 输出 JSON 格式
osv-scanner -r /path/to/project --format json -o osv-results.json
```

### 3. Grype — 容器镜像/文件系统漏洞扫描 (EPSS/KEV 风险评分)

```bash
# 安装
# 方法1：官方安装脚本
curl -sSfL https://get.anchore.io/grype | sudo sh -s -- -b /usr/local/bin
# 方法2：Homebrew
brew install grype

# 扫描容器镜像
grype alpine:latest
grype myapp:latest --severity High,Critical

# 扫描文件系统/目录
grype dir:/path/to/project

# 输出 JSON 格式
grype myapp:latest -o json > grype-report.json

# 仅报告有修复方案的漏洞
grype myapp:latest --only-fixed
```

### 4. KICS — 多 IaC 格式安全扫描 (Terraform/K8s/CFN/ARM/Dockerfile/Helm)

```bash
# 安装
# 方法1：Docker（推荐）
docker pull checkmarx/kics:latest
# 方法2：Homebrew
brew install kics
# 方法3：从发布页下载二进制
# https://github.com/Checkmarx/kics/releases

# 扫描 IaC 目录（Docker 方式）
docker run -t -v "$(pwd):/path" checkmarx/kics scan -p /path -o /path/results

# 扫描并输出 JSON + SARIF
kics scan -p /path/to/terraform --report-formats json,sarif -o /output

# 扫描单个文件
kics scan -p main.tf --report-formats json -o /output

# 扫描 Helm chart
kics scan -p /path/to/helm-chart --report-formats json -o /output
```

### 5. Dive — Docker 镜像分层分析

```bash
# 安装
# 方法1：Homebrew
brew install dive
# 方法2：从发布页下载二进制
# https://github.com/wagoodman/dive/releases
# 方法3：Docker alias
alias dive="docker run -ti --rm -v /var/run/docker.sock:/var/run/docker.sock wagoodman/dive"

# 分析镜像各层
dive nginx:latest

# 构建并分析
dive build -t myapp .

# CI 模式（无 UI，按浪费空间返回退出码）
CI=true dive myapp:latest

# 仅展示层详情
dive myapp:latest --skip-layer
```

### 6. kube-hunter — Kubernetes 安全弱点主动探测

```bash
# 安装
# 方法1：Docker（推荐）
# 方法2：pip
pip install kube-hunter

# 在集群 Pod 内运行（最贴近实际攻击者视角）
kubectl run --rm -it kube-hunter --image=aquasec/kube-hunter -- /bin/sh -c "kube-hunter"

# 扫描远程集群
kube-hunter --remote 10.0.0.1

# 扫描本地 kubeconfig
kube-hunter --local

# 列出所有 hunter/测试项
kube-hunter --list

# 主动探测模式（执行利用尝试，注意 OPSEC）
kube-hunter --active
```

### 7. docker-bench-security — Docker CIS Benchmark 合规检查

```bash
# 安装 + 运行（Docker 方式，推荐）
docker run --rm --net host --pid --userns:host \
  --volume /var/lib:/var/lib:ro \
  --volume /var/run/docker.sock:/var/run/docker.sock:ro \
  --volume /etc:/etc:ro \
  --volume /usr/bin/docker:/usr/bin/docker:ro \
  docker/docker-bench-security

# 从源码运行
git clone https://github.com/docker/docker-bench-security.git
cd docker-bench-security
sudo sh docker-bench-security.sh

# 自行构建镜像并运行
docker build --no-cache -t docker-bench-security .
docker run --rm --net host --pid --userns:host \
  -v /var/lib:/var/lib:ro -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /etc:/etc:ro docker-bench-security
```

### 8. Lynis — Linux/macOS 系统加固审计与合规

```bash
# 安装
# 方法1：直接 clone 运行（免安装）
git clone https://github.com/CISOfy/lynis.git
cd lynis
# 方法2：Homebrew (macOS)
brew install lynis
# 方法3：apt (Debian/Ubuntu)
apt install lynis

# 完整安全审计
sudo ./lynis audit system

# 快速扫描
sudo ./lynis audit system --quick

# 渗透测试模式（更深入的检查）
sudo ./lynis audit system --pentest

# 输出日志到指定文件
sudo ./lynis audit system --logfile /var/log/lynis.log

# 检查 Lynis 版本与已启用插件
sudo ./lynis show version
sudo ./lynis show profiles
```

---
