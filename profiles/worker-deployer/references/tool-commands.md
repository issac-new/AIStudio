## 具体操作命令手册

以下是部署运维中常用的真实可执行命令。按场景选用，**破坏性操作先 dry-run**，不记得参数时回查本节而非猜测。

### 1. Docker

```bash
# 构建镜像
docker build -t app:latest .

# 运行容器
docker run -d --name app -p 8080:8080 app:latest

# Compose 编排
docker compose up -d
docker compose logs -f
docker compose down

# 进入运行中容器
docker exec -it app /bin/sh

# 推送镜像到 registry
docker tag app:latest registry.example.com/app:v1.2.3
docker push registry.example.com/app:v1.2.3

# 镜像 CVE 扫描
docker scout cves app:latest
```

### 2. Kubernetes

```bash
# 查看资源
kubectl get pods -A
kubectl get deploy,svc,ingress -n <namespace>
kubectl describe pod <pod-name>

# 部署 / 更新
kubectl apply -f k8s/deployment.yaml
kubectl apply -k k8s/overlays/prod

# 查看日志 / 进入 Pod
kubectl logs <pod-name> -f
kubectl exec -it <pod-name> -- /bin/sh

# 端口转发（本地调试）
kubectl port-forward svc/<svc-name> 8080:8080

# 滚动发布状态 / 扩缩容
kubectl rollout status deployment/<deploy-name>
kubectl scale deployment/<deploy-name> --replicas=3

# 资源用量
kubectl top pods -n <namespace>
kubectl top nodes

# 事件排序排查
kubectl get events --sort-by=.lastTimestamp -n <namespace>

# 删除资源
kubectl delete -f k8s/deployment.yaml
```

### 3. Helm

```bash
helm install <release-name> ./chart -f values-prod.yaml -n <namespace>
helm upgrade <release-name> ./chart -f values-prod.yaml -n <namespace>
helm rollback <release-name> <revision> -n <namespace>
helm list -n <namespace>
```

### 4. Terraform

```bash
terraform init
terraform validate
terraform fmt -recursive
terraform plan -out tfplan
terraform apply tfplan
terraform destroy          # ⚠️ 高风险，确认目标环境后再执行
terraform state list
terraform state show <resource>
```

### 5. Ansible

```bash
# Dry-run（不改远端，先 --check）
ansible-playbook -i inventory/prod playbook.yml --check

# 实际执行
ansible-playbook -i inventory/prod playbook.yml

# 查看 inventory
ansible-inventory -i inventory/prod --graph

# 安装 Galaxy role
ansible-galaxy install -r requirements.yml
```

### 6. CI/CD（GitHub Actions via gh CLI）

```bash
# 触发 workflow
gh workflow run deploy.yml --ref main -f environment=staging

# 查看运行列表
gh run list --limit 10

# 实时跟踪某次运行
gh run watch <run-id>

# 下载运行产物
gh run download <run-id> -n <artifact-name>
```

### 7. 健康检查与排障

```bash
# HTTP 健康端点（-sf：失败静默退出非 0）
curl -sf http://localhost:8080/health && echo "OK" || echo "FAIL"

# K8s 最近事件（按时间排序，排障首选）
kubectl get events --sort-by=.lastTimestamp -n <namespace>

# Pod 异常排查组合拳
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous   # 崩溃前的日志
```

### 8. 回滚

```bash
# Kubernetes 回滚到上一版本
kubectl rollout undo deployment/<deploy-name>
kubectl rollout undo deployment/<deploy-name> --to-revision=3

# Helm 回滚
helm rollback <release-name> <revision> -n <namespace>

# Docker Compose 回滚（重启旧镜像）
docker compose down
docker compose up -d   # 指回旧 tag 的 compose 文件
docker compose restart
```

> 部署后必须跑健康检查并贴真实输出。回滚命令要在部署前就确认可用，**没有回滚预案不部署**。

### 9. K8s 高级诊断与运维

**k9s（K8s 终端 UI 仪表盘）**

```bash
# 安装 k9s（macOS）
brew install k9s

# 启动 k9s 仪表盘
k9s

# 指定命名空间启动
k9s -n <namespace>

# 查看 Pod 日志（在 k9s 界面内）
# 按 0 查看所有命名空间，/ 搜索资源

# 只读模式（禁止编辑操作）
k9s --readonly
```

**stern（多 Pod 日志聚合）**

```bash
# 安装 stern（macOS）
brew install stern

# 同时查看多个 Pod 的日志（按标签匹配）
stern -n <namespace> app=svc-a

# 实时跟踪（-t 添加时间戳）
stern -t -n <namespace> app=svc-a

# 显示所有容器日志
stern --all-namespaces -l app=svc-a
```

**kubectx / kubens（快速切换上下文/命名空间）**

```bash
# 安装 kubectx（macOS）
brew install kubectx

# 列出所有可用上下文
kubectx

# 切换到指定上下文
kubectx <context-name>

# 切换回上一个上下文
kubectx -

# 列出/切换命名空间
kubens
kubens <namespace>
kubens -
```

**kube-bench（CIS Kubernetes 基准检查）**

```bash
# 安装 kube-bench（macOS）
brew install kube-bench

# 运行 CIS 基准检查
kube-bench run

# 指定目标（master/node）
kube-bench run --targets master
kube-bench run --targets node

# 输出 JSON 格式结果
kube-bench run --json > kube-bench-report.json
```

### 10. Kustomize — 原生 K8s 配置管理

```bash
# 安装 kustomize（macOS）
brew install kustomize

# 创建 kustomization.yaml
kustomize create --autodetect

# 构建最终 YAML（将 overlay 渲染为完整部署清单）
kustomize build k8s/overlays/prod

# 直接 apply（等于 kubectl apply -k）
kustomize build k8s/overlays/prod | kubectl apply -f -

# 查看最终配置的 diff
kustomize build k8s/overlays/prod > prod.yaml
kustomize build k8s/overlays/staging > staging.yaml
diff prod.yaml staging.yaml
```

### 11. GitOps 部署

**ArgoCD CLI**

```bash
# 安装 argocd CLI（macOS）
brew install argocd

# 登录 ArgoCD 服务
argocd login <argocd-server> --grpc-web

# 列出应用
argocd app list

# 同步应用（从 Git → 集群）
argocd app sync <app-name>

# 查看应用状态和事件
argocd app get <app-name>

# 回滚到上一版本
argocd app rollback <app-name> <revision>

# 查看同步历史
argocd app history <app-name>
```

**Flux CLI**

```bash
# 安装 flux CLI（macOS）
brew install fluxcd/tap/flux

# 检查集群就绪状态
flux check --pre

# 列出所有资源
flux get all

# 手动触发 kustomization 同步
flux reconcile kustomization <name>

# 查看 HelmRelease 状态
flux get helmreleases

# 查看事件
flux events
```

### 12. Docker 镜像分析

**dive（Docker 镜像层分析）**

```bash
# 安装 dive（macOS）
brew install dive

# 分析镜像层（交互式界面）
dive app:latest

# 分析并输出 JSON
dive app:latest --json > dive-report.json

# 指定 CI 模式（只输出摘要）
dive app:latest --ci
```

**syft（SBOM 生成）**

```bash
# 安装 syft（macOS）
brew install syft

# 为镜像生成 SPDX SBOM
syft app:latest -o spdx-json > sbom.spdx.json

# 生成 CycloneDX 格式
syft app:latest -o cyclonedx-json > sbom.cdx.json

# 扫描目录而非镜像
syft dir:. -o table
```

**grype（容器漏洞扫描器）**

```bash
# 安装 grype（macOS）
brew install grype

# 扫描镜像漏洞
grype app:latest

# 只显示 CRITICAL/HIGH
grype app:latest --only-fixed

# 输出 JSON 供 CI 处理
grype app:latest -o json > vuln-report.json

# 指定严重度阈值（退出码非 0 如果发现）
grype app:latest --fail-on high
```

**trivy（综合漏洞扫描器）**

```bash
# 安装 trivy（macOS）
brew install trivy

# 镜像扫描
trivy image --severity CRITICAL,HIGH app:latest

# 文件系统扫描
trivy fs --severity CRITICAL,HIGH .

# 配置扫描（检测错误配置）
trivy config k8s/deployment.yaml

# 生成 SARIF 报告（供 GitHub Code Scanning）
trivy image --format sarif app:latest > trivy-report.sarif

# 快速扫描（--cache-dir 持久化缓存）
trivy image --cache-dir .trivycache app:latest
```

---

---
