---
ruleset_id: kubernetes
适用版本: Kubernetes 1.25+（API GA 稳定；1.30+ 独立特性单独标注；OpenShift/Cilium 等 CRD 差异在版本陷阱速查标注）
最后调研: 2026-07-23（来源：https://kubernetes.io/docs/home/ / https://github.com/kubernetes/kubernetes / CIS Kubernetes Benchmark v1.8.0 / kube-bench/kubescape 规则库 / NSA Kubernetes Hardening Guide 2022）
深度门槛: 10
---

# Kubernetes 规则集

<!--
IaC 容器编排系规则集（WP-U 新增，填补 R4 §4.2「IaC/交付工程」编排化缺口）。
判定哲学与 terraform 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
YAML 用 grep 匹配关键字段（非 YAML 解析器，保持 bash 纯词法，口径在「验证方法」中写明）；
# 注释行用 grep -v 过滤（YAML 注释仅 # 行，无块注释）。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 文件 | `**/*.yaml` / `**/*.yml`（含 k8s 清单） | 中（YAML 通用，须组合 apiVersion/kind 判定） |
| 文件 | `**/kustomization.yaml` / `**/Chart.yaml` | 高（Kustomize/Helm 工程特征） |
| 配置 | `apiVersion: apps/v1` / `kind: Deployment|StatefulSet|DaemonSet|Pod` | 高（K8s 工作负载 API 信号） |
| 配置 | `apiVersion: v1` + `kind: Service|ConfigMap|Secret|Namespace` | 高（K8s 原生资源） |
| 配置 | `apiVersion: rbac.authorization.k8s.io/v1` + `kind: Role|RoleBinding|ClusterRole` | 高（K8s RBAC） |
| 配置 | `apiVersion: networking.k8s.io/v1` + `kind: NetworkPolicy` / `kind: Ingress` | 高（K8s 网络资源） |
| 配置 | `apiVersion: policy` + `kind: PodDisruptionBudget` | 高（K8s PDB） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 exploration-guide.md §C+.0.5 区块。
detect 信号：K8s 清单 .yaml/.yml 文件存在 + apiVersion/kind 命中即激活（detect-frameworks.sh 不支持 file 类型探测，
需手动配置 ACTIVE_FRAMEWORKS=("kubernetes") 或经 --inject-frameworks 补占位——见 §1 备注）。
detect-frameworks.sh 当前仅扫描 package.json/pom.xml/go.mod/pyproject/requirements，
.yaml/.yml 不在其扫描范围，故 kubernetes 框架须手动配置 ACTIVE_FRAMEWORKS。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 清单文件：`find . -type f \( -name '*.yaml' -o -name '*.yml' \) -not -path '*/.git/*' -not -path '*/node_modules/*'`（计数核验基准：YAML 清单数，需组合 apiVersion 判定）
- Deployment：`grep -rlE 'kind:[[:space:]]*Deployment\b' --include='*.y*ml' . | wc -l`（计数核验基准：Deployment 数）
- Service：`grep -rlE 'kind:[[:space:]]*Service\b' --include='*.y*ml' . | wc -l`（计数核验基准：Service 数）
- ConfigMap/Secret：`grep -rlE 'kind:[[:space:]]*(ConfigMap|Secret)\b' --include='*.y*ml' . | wc -l`（计数核验基准：配置/密钥资源数）
- NetworkPolicy：`grep -rlE 'kind:[[:space:]]*NetworkPolicy\b' --include='*.y*ml' . | wc -l`（计数核验基准：网络策略数）
- PodDisruptionBudget：`grep -rlE 'kind:[[:space:]]*PodDisruptionBudget\b' --include='*.y*ml' . | wc -l`（计数核验基准：PDB 数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型（与 §C+.1-FW 各框架枚举命令段呼应）。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
K8s 清单是 YAML 格式，本规则集用 grep 匹配关键字段而非 YAML 解析器，
口径：行首（允许前导空白）匹配 `key:` 字段名，多文档 `---` 分隔与多行块值可能漏检（已在验证方法中标注）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：镜像须用 digest 非 :latest
- **适用版本**: 全版本（K8s 1.x）
- **规律**: Pod/Deployment/StatefulSet/DaemonSet/CronJob 等工作负载的 `image:` 字段不得用 `:latest` 标签，须用 digest（`image@sha256:...`）或版本号标签（`image:1.2.3`）。`:latest` 标签可变，调度时拉到的镜像随时间漂移。
- **违反后果**: `:latest` 拉取漂移致同 Deployment 不同 Pod 跑不同镜像版本；滚动更新不可控；供应链投毒面扩大（CWE-668 资源暴露于错误范围；GB/T 22239-2019 8.1.4.3 恶意代码防范）。
- **验证方法**: `grep -nE 'image:[[:space:]]*[^[:space:]]+:latest' --include='*.y*ml' .`（剥 # 注释后命中 → fail；口径：行级 `image: xxx:latest` 匹配，不区分单文档多文档）
- **对应门禁**: fw_kubernetes_latest_image（fail 级）

```verify
id: kubernetes-r1
cmd: grep -nE 'image:[[:space:]]*[^[:space:]]+:latest' --include='*.y*ml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：禁止以 privileged 运行
- **适用版本**: 全版本
- **规律**: 容器 `securityContext.privileged` 不得为 `true`。privileged 容器几乎等同宿主 root，可访问所有设备、逃逸隔离。确需特权（如 Sysbox、需访问宿主设备）须显式审批并受 PodSecurity admission 限制。
- **违反后果**: privileged 容器逃逸即获宿主 root，配合 CVE-2019-5736 runc 等即失陷整节点（CWE-250 特权责任；GB/T 22239-2019 8.1.4.1 身份鉴别；NSA Hardening Guide "If possible, remove privileged mode")。
- **验证方法**: `grep -nE 'privileged:[[:space:]]*true' --include='*.y*ml' .`（剥 # 注释后命中 → fail）
- **对应门禁**: fw_kubernetes_privileged（fail 级）

```verify
id: kubernetes-r2
cmd: grep -nE 'privileged:[[:space:]]*true' --include='*.y*ml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：禁止以 root 运行，须 runAsNonRoot
- **适用版本**: 全版本（Pod/securityContext.runAsNonRoot GA）
- **规律**: 容器 `securityContext.runAsNonRoot: true`（或 Pod 级 runAsUser 非 0），确保进程非 root 运行。镜像默认 root（uid=0）时，无 runAsNonRoot 即等同以 root 运行。
- **违反后果**: 容器内 root 配合逃逸漏洞即获宿主 root；多租户集群即跨租户越权（CWE-250；GB/T 22239-2019 8.1.4.1；CIS Kubernetes Benchmark 5.2.1）。
- **验证方法**: 工作负载清单内（含 `containers:` 的文件）须含 `runAsNonRoot:[[:space:]]*true`；含 containers 但无 runAsNonRoot → fail（口径：文件级启发式，多容器文件逐块核对为人工检查补充）
- **对应门禁**: fw_kubernetes_run_as_root（fail 级）

```verify
id: kubernetes-r3
cmd: 
expect: always
```

### 规律：资源 limits 须显式
- **适用版本**: 全版本
- **规律**: 容器 `resources.limits`（至少 cpu/memory）须显式声明。无 limits 时单容器可耗尽节点资源，致同节点其他 Pod 被驱逐（noisy neighbor）。
- **违反后果**: 单容器资源无限致节点资源耗尽，其他 Pod 被驱逐/OOM（CWE-400 资源消耗不可控；GB/T 22239-2019 8.1.4.5 可用性；CIS Benchmark 5.1.3）。
- **验证方法**: 工作负载清单内（含 `containers:` 的文件）须含 `limits:`；无 limits → warn（口径：文件级，含 containers 即须有 limits 节）
- **对应门禁**: fw_kubernetes_no_resource_limits（warn 级）

```verify
id: kubernetes-r4
cmd: 
expect: always
```

### 规律：livenessProbe/readinessProbe 须配置
- **适用版本**: 全版本
- **规律**: 长运行容器须配 `livenessProbe`（探测死锁/死循环重启）与 `readinessProbe`（探测就绪收流量）。无 probe 时进程假死不可发现，流量继续打到僵尸实例。
- **违反后果**: 假死 Pod 不可被发现，流量继续打到僵尸实例，SLO 失守（CWE-1188 探测缺失；GB/T 22239-2019 8.1.4.5 可用性；CIS Benchmark 5.1.4/5.1.5）。
- **验证方法**: 工作负载清单内（含 `containers:` 的文件）须同时含 `livenessProbe:` 与 `readinessProbe:`；缺其一 → warn（口径：文件级共现）
- **对应门禁**: fw_kubernetes_no_probes（warn 级）

```verify
id: kubernetes-r5
cmd: 
expect: always
```

### 规律：namespace 须显式（非 default）
- **适用版本**: 全版本
- **规律**: 工作负载/Service/ConfigMap 等资源须显式 `metadata.namespace:`，不得落入 `default` 命名空间。default 命名空间承载系统默认资源，业务混入即难隔离与限流。
- **违反后果**: 业务资源混入 default，无法按 namespace 隔离 RBAC/网络策略/资源配额（CWE-668 资源暴露；GB/T 22239-2019 8.1.3.2 边界访问控制）。
- **验证方法**: 工作负载清单（含 Deployment/StatefulSet/DaemonSet 的文件）内 `metadata.namespace:` 须存在且非 `default`；缺 namespace 或 `namespace: default` → warn（口径：文件级，工作负载类型文件须显式非 default namespace）
- **对应门禁**: fw_kubernetes_default_namespace（warn 级）

```verify
id: kubernetes-r6
cmd: 
expect: always
```

### 规律：Secret 须挂载不硬编码
- **适用版本**: 全版本
- **规律**: `Secret` 资源的 `data:`/`stringData:` 不得硬编码明文（base64 不算加密）；敏感数据须走 `envFrom`/`valueFrom.secretKeyRef` 引用挂载或外部 Secrets（External Secrets Operator / Vault Secrets）。`kind: Secret` 资源内直接写明文 → 风险。
- **违反后果**: Secret 明文进 git 历史与集群 etcd（base64 非"加密"），泄露即全量轮换（CWE-798 硬编码凭证；GB/T 22239-2019 8.1.4.1）。
- **验证方法**: `grep -rnE 'kind:[[:space:]]*Secret\b' --include='*.y*ml' .` 命中的文件须不出现 `stringData:`；命中 Secret 且含 `stringData:` → fail（口径：文件级，stringData: 是 YAML 明文足印，kubectl apply 时才 base64，即"硬编码明文"的明确信号；`data:` base64 值门禁不自动 fail，走人工审计——base64 可解码但 grep 无法可靠区分 base64 与真 hash/密文）
- **对应门禁**: fw_kubernetes_hardcoded_secret（fail 级）

```verify
id: kubernetes-r7
cmd: grep -rnE 'kind:[[:space:]]*Secret\b' --include='*.y*ml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：NetworkPolicy 须配置
- **适用版本**: 全版本（NetworkPolicy GA；需 CNI 支持：Calico/Cilium 等）
- **规律**: 含工作负载的工程须至少有一份 `kind: NetworkPolicy` 清单，限制 Pod 间出入流量。无 NetworkPolicy 时所有 Pod 互访无限制（默认 allow-all）。
- **违反后果**: 集群内横向移动无限制，单 Pod 失陷即横扫全集群（CWE-732 关键资源权限分配不当；GB/T 22239-2019 8.1.3.2 边界访问控制；NSA Hardening Guide "NetworkPolicies ... enhance ... security"）。
- **验证方法**: 全仓库 `grep -rlE 'kind:[[:space:]]*NetworkPolicy\b' --include='*.y*ml' .`（应非空）；无 NetworkPolicy → warn（口径：仓库级，有工作负载即须有 NetworkPolicy）
- **对应门禁**: fw_kubernetes_no_network_policy（warn 级）

```verify
id: kubernetes-r8
cmd: grep -rlE 'kind:[[:space:]]*NetworkPolicy\b' --include='*.y*ml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：PodDisruptionBudget 须配置
- **适用版本**: 全版本（PDB policy/v1 GA）
- **规律**: 生产工作负载（Deployment/StatefulSet）须配 `kind: PodDisruptionBudget`，限制自愿驱逐（节点维护/自动伸缩）时的最小可用副本数。无 PDB 时自愿驱逐可一次性杀光所有副本。
- **违反后果**: 节点维护/集群自动伸缩时所有 Pod 被一次性驱逐，服务完全中断（GB/T 22239-2019 8.1.4.5 可用性；CIS Benchmark 5.1.7 建议）。
- **验证方法**: 全仓库 `grep -rlE 'kind:[[:space:]]*PodDisruptionBudget\b' --include='*.y*ml' .`（应非空）；无 PDB → warn（口径：仓库级，有工作负载即须有 PDB）
- **对应门禁**: fw_kubernetes_no_pdb（warn 级）

```verify
id: kubernetes-r9
cmd: grep -rlE 'kind:[[:space:]]*PodDisruptionBudget\b' --include='*.y*ml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：imagePullPolicy 须 IfNotPresent
- **适用版本**: 全版本
- **规律**: 用 digest 的镜像 `imagePullPolicy: IfNotPresent`（本地缓存命中即用，省拉取）；用标签（`:1.2.3`）的镜像建议 `IfNotPresent` 但可 `Always`（确保标签更新）。默认行为：标签镜像 K8s 默认 `Always`（每次都拉），digest 默认 `IfNotPresent`。生产默认 `Always` 拉取浪费带宽且可能拉到被篡改的同标签镜像。
- **违反后果**: `Always` 致每次 Pod 调度都拉镜像，拉取慢/失败致 Pod Pending；标签可变时拉到被篡改镜像（CWE-668；GB/T 25000.51-2016 资源效率）。
- **验证方法**: 工作负载清单内（含 `containers:` 的文件）须显式 `imagePullPolicy:[[:space:]]*IfNotPresent`；缺 imagePullPolicy → warn（口径：文件级，含 containers 即须有 IfNotPresent）
- **对应门禁**: fw_kubernetes_image_pull_policy（warn 级）

```verify
id: kubernetes-r10
cmd: 
expect: always
```

<!--
共 10 条规律（= 门槛 10）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_kubernetes_latest_image | fail | image: 命中 `:latest` → fail | KUBERNETES_GLOBS |
| fw_kubernetes_privileged | fail | securityContext.privileged: true 命中 → fail | KUBERNETES_GLOBS |
| fw_kubernetes_run_as_root | fail | 含 containers 的清单无 runAsNonRoot: true → fail | KUBERNETES_GLOBS |
| fw_kubernetes_no_resource_limits | warn | 含 containers 的清单无 resources.limits → warn | KUBERNETES_GLOBS |
| fw_kubernetes_no_probes | warn | 含 containers 的清单缺 livenessProbe 或 readinessProbe → warn | KUBERNETES_GLOBS |
| fw_kubernetes_default_namespace | warn | 工作负载清单无 namespace 或 namespace: default → warn | KUBERNETES_GLOBS |
| fw_kubernetes_hardcoded_secret | fail | Secret 资源内含 stringData: → fail（data: base64 走人工审计） | KUBERNETES_GLOBS |
| fw_kubernetes_no_network_policy | warn | 仓库无 NetworkPolicy 清单 → warn | KUBERNETES_GLOBS |
| fw_kubernetes_no_pdb | warn | 仓库无 PodDisruptionBudget 清单 → warn | KUBERNETES_GLOBS |
| fw_kubernetes_image_pull_policy | warn | 含 containers 的清单无 imagePullPolicy: IfNotPresent → warn | KUBERNETES_GLOBS |

<!--
门禁 id 命名规范：fw_kubernetes_<rule>（rule 全小写下划线）。
本表 10 条 id 须在 assets/framework-gates/kubernetes.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_kubernetes_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: kubernetes  requires_conf: KUBERNETES_GLOBS` 声明。
fixture 验证覆盖：violating/deployment.yaml（image:latest + privileged:true + 无 runAsNonRoot + 无 resources + 无 probes + namespace:default + Secret 明文）
→ latest_image/privileged/run_as_root/hardcoded_secret 4 fail 主触发；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| kubernetes × dockerfile | K8s securityContext.runAsNonRoot 须与 Dockerfile USER 一致（镜像 USER root + K8s runAsNonRoot=true → Pod 创建失败） | IaC 编排层与镜像层双重声明，不一致即 Pod 不可调度 |
| kubernetes × terraform | K8s 清单经 Terraform Helm/File provider 部署时，清单变更须走 terraform plan 审查 | IaC 链路：TF → Helm → K8s，plan 审查不可绕过 |
| kubernetes × 通用 check_sensitive | 通用门禁扫密钥模式覆盖 YAML Secret 的明文 data | 本规则集报"K8s Secret 语义硬编码"，通用报存在，避免 envFrom 引用占位被双报 |

<!--
无强交互的框架组合省略；本表聚焦 kubernetes 与 IaC 邻接框架的组合约束。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| K8s 1.25 | PodSecurityPolicies (PSP) 弃用，PodSecurity Admission 替代 | 旧 PSP 清单须迁移到 PodSecurity labels；本规则集不检 PSP，按 ≥1.25 PodSecurity 形态 |
| K8s 1.27 | `NetworkPolicy` policy/v1 GA 稳定（原 networking.k8s.io/v1 仍可用） | 双 API 版本兼容；fw_kubernetes_no_network_policy 同时认 networking.k8s.io/v1 与 policy/v1 |
| K8s 1.30 | `ValidatingAdmissionPolicy` GA（声明式准入策略） | 高级准入策略可替代部分 OPA Gatekeeper；本规则集不依赖 VAP |
| Helm 3.0+ | `helm template` 渲染 K8s 清单（Chart.yaml + templates/） | Helm 工程的信号匹配 Chart.yaml，渲染后清单才是 K8s 清单；本规则集按渲染前清单判定 |
| OpenShift 4.x | SecurityContextConstraints (SCC) 替代 PodSecurity（CRD） | OpenShift 工程须额外检 SCC；本规则集默认标准 K8s，SCC 属人工检查补充 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
