## 常用工具命令

### Terraform（基础设施即代码）

```bash
# 初始化（后端配置 + provider 下载）
terraform init

# 格式化 + 验证语法
terraform fmt -recursive
terraform validate

# 计划（先看再 apply，破坏性操作必做）
terraform plan -out tfplan -var-file=environments/prod.tfvars

# 执行
terraform apply tfplan

# 状态管理
terraform state list
terraform state show <resource>

# ⚠️ 高风险：销毁（确认目标环境后再执行）
terraform destroy -var-file=environments/prod.tfvars
```

### Kubernetes + Helm（部署编排）

```bash
# 查看资源
kubectl get deploy,svc,ingress -n <namespace>
kubectl describe deployment/<name> -n <namespace>

# Helm 部署/更新
helm upgrade --install <release> ./chart -f values-prod.yaml -n <namespace>
helm rollback <release> <revision> -n <namespace>
helm list -n <namespace>

# Kustomize overlay（环境间差异管理）
kubectl apply -k k8s/overlays/prod

# 滚动发布状态
kubectl rollout status deployment/<name> -n <namespace>
kubectl rollout history deployment/<name> -n <namespace>
```

### CI/CD（GitHub Actions via gh CLI）

```bash
# 触发 workflow
gh workflow run deploy.yml --ref main -f environment=staging

# 查看运行列表
gh run list --limit 10

# 实时跟踪运行
gh run watch <run-id>

# 下载运行产物
gh run download <run-id> -n <artifact-name>

# 查看 workflow 日志
gh run view <run-id> --log
```

### 安全扫描（嵌入流水线）

```bash
# 镜像 CVE 扫描
trivy image --severity CRITICAL,HIGH <image>:<tag>
docker scout cves <image>:<tag>

# IaC 安全扫描
tfsec . --soft  # 警告不阻断，--hard 阻断
checkov -d . --framework terraform

# 密钥泄漏检测
gitleaks detect --source . --report-path leaks.json
```

### Ansible（配置管理）

```bash
# Dry-run（不改远端）
ansible-playbook -i inventory/prod playbook.yml --check --diff

# 实际执行
ansible-playbook -i inventory/prod playbook.yml

# 查看 inventory
ansible-inventory -i inventory/prod --graph
```

### 零停机部署验证

```bash
# 部署过程中连续健康检查（证明零停机）
while true; do
  status=$(curl -sf -o /dev/null -w "%{http_code}" http://<host>/health)
  echo "$(date +%T) health=$status"
  [ "$status" != "200" ] && echo "DOWNTIME DETECTED" && break
  sleep 1
done

# 金丝雀流量验证
kubectl get virtualservice -n <namespace>  # Istio 流量分流
# 或
kubectl get canary -n <namespace>          # Flagger 金丝雀
```

> IaC 的铁律：先 plan 再 apply，破坏性操作先 dry-run。没有 plan 输出就 apply = 盲操作。

### 7. IaC 安全扫描增强

**Checkov（高级用法）**

```bash
# 扫描 Terraform 目录
checkov -d .

# 只扫描指定框架
checkov -d . --framework terraform
checkov -d . --framework kubernetes
checkov -d . --framework dockerfile

# 输出格式（JSON / JUnit XML / SARIF）
checkov -d . -o json > checkov-report.json
checkov -d . -o junitxml > checkov-report.xml
checkov -d . -o sarif > checkov-report.sarif

# 跳过特定检查
checkov -d . --skip-check CKV_AWS_123

# 仅检查指定检查
checkov -d . --check CKV_AWS_123

# 配置软性失败（--soft-fail 不阻断 CI）
checkov -d . --soft-fail

# 使用配置文件
checkov -d . -c .checkov.yml

# 下载自定义策略
checkov --bc-api-key <key> --repo-id <org/repo>
```

**Terrascan**

```bash
# 安装 terrascan（macOS）
brew install terrascan

# 扫描目录
terrascan scan -d .

# 只扫描 Terraform（支持 k8s, helm, kustomize, docker）
terrascan scan -d . -i terraform

# 输出格式
terrascan scan -d . -o json > terrascan-report.json
terrascan scan -d . -o yaml
terrascan scan -d . -o sarif > terrascan-report.sarif

# 使用策略目录
terrascan scan -d . -p /path/to/custom/policies

# 扫描远程仓库
terrascan scan -r git -u https://github.com/org/repo.git
```

**Tfsec（高级用法）**

```bash
# 标准扫描
tfsec .

# 输出格式
tfsec . --format json > tfsec-report.json
tfsec . --format sarif > tfsec-report.sarif

# 只报错误（忽略警告）
tfsec . --severity CRITICAL,HIGH

# 排除特定检查
tfsec . --exclude-check AWS012,AWS023

# 指定自定义配置
tfsec . --config-file .tfsec/config.yml

# 软性失败（不阻断 CI）
tfsec . --soft-fail
```

### 8. Terraform 高级工具

**Terragrunt（DRY Terraform 配置）**

```bash
# 安装 terragrunt（macOS）
brew install terragrunt

# 初始化 + 执行（自动处理远程状态）
terragrunt run-all init
terragrunt run-all plan
terragrunt run-all apply

# 指定模块执行
terragrunt plan --terragrunt-source /path/to/modules

# 查看依赖图
terragrunt graph-dependencies

# 输出依赖图为 DOT 格式
terragrunt graph-dependencies | dot -Tpng > deps.png

# 强制解锁状态
terragrunt force-unlock <lock-id>
```

**Inframap（Terraform 状态可视化）**

```bash
# 安装 inframap
npm install -g inframap

# 从状态文件生成图形（SVG）
inframap generate --tfstate terraform.tfstate | dot -Tsvg > infra.svg

# 从 Terraform 代码生成
inframap generate --tfdir . | dot -Tpng > infra.png

# 只显示指定资源类型
inframap generate --tfstate terraform.tfstate --filter aws_instance

# 输出 DOT 格式（供 Graphviz 进一步处理）
inframap generate --tfstate terraform.tfstate > infra.dot
```

### 9. GitOps 工具增强

**ArgoCD CLI（进阶）**

```bash
# 创建应用
argocd app create svc-a \
  --repo https://github.com/org/k8s-manifests \
  --path svc-a/overlays/prod \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace prod

# 查看应用同步状态
argocd app get svc-a

# 查看应用差异
argocd app diff svc-a

# 设置同步策略（自动同步）
argocd app set svc-a --sync-policy automated \
  --auto-prune --self-heal

# 查看应用事件
argocd app events svc-a

# 管理项目（RBAC）
argocd proj create my-project
argocd proj add-source my-project https://github.com/org/repo
argocd proj add-destination my-project https://kubernetes.default.svc default
```

**Flux CLI（进阶）**

```bash
# 创建 GitRepository 源
flux create source git svc-a \
  --url=https://github.com/org/k8s-manifests \
  --branch=main \
  --interval=5m

# 创建 Kustomization（部署）
flux create kustomization svc-a \
  --source=svc-a \
  --path="./svc-a/overlays/prod" \
  --prune=true \
  --interval=10m

# 暂停/恢复同步
flux suspend kustomization svc-a
flux resume kustomization svc-a

# 导出资源清单
flux export source git svc-a
flux export kustomization svc-a

# 自动应用依赖排序
flux create kustomization svc-a --depends-on=infra-base
```

### 10. K8s 清单验证

**Kubeval（K8s 清单验证）**

```bash
# 安装 kubeval（macOS）
brew install kubeval

# 验证单个文件
kubeval deployment.yaml

# 验证目录下所有文件
kubeval k8s/

# 指定 K8s 版本
kubeval deployment.yaml --kubernetes-version 1.28

# 严格模式（禁用额外属性）
kubeval deployment.yaml --strict

# 跳过某些 schema
kubeval deployment.yaml --skip-schema-jsonschema
```

**Kube-score（K8s 清单评分）**

```bash
# 安装 kube-score（macOS）
brew install kube-score

# 评分一个或多个文件
kube-score score deployment.yaml service.yaml

# 评分整个目录
kube-score score k8s/

# 输出格式
kube-score score k8s/ -o json > kube-score-report.json

# 跳过指定检查
kube-score score k8s/ --ignore-test pod-probes

# 推荐检查项：container-security, pod-network-policy, resource-limits
```

**Pluto（检测废弃 API 版本）**

```bash
# 安装 pluto（macOS）
brew install pluto

# 扫描当前目录下的 K8s 清单
pluto detect-files -d k8s/

# 扫描 Helm Chart
pluto detect-helm -c .

# 扫描已部署资源（使用 kubeconfig）
pluto detect-api-resources

# 输出 JSON
pluto detect-files -d k8s/ -o json > pluto-report.json

# 扫描指定 K8s 版本
pluto detect-files -d k8s/ --target-versions k8s=v1.28

# 输出 CSV（便于导入表格）
pluto detect-files -d k8s/ -o csv > pluto-report.csv
```

---


---
