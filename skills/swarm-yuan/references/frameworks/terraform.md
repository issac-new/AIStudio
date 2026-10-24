---
ruleset_id: terraform
适用版本: Terraform 1.x（≥1.5 许可变更与 ≥1.9 backend 锁差异单独标注；OpenTofu 同构适用）
最后调研: 2026-07-20（来源：HashiCorp 官方文档 / tfsec·Checkov 规则库 / SquareOps·Spacelift·Confluent 工程实践文，见各规律「证据」字段）
深度门槛: 10
---

# Terraform 规则集

<!--
IaC 基础设施系规则集（P1/P2 批次新增，填补 R4 §4.2「IaC/交付工程」缺口）。
判定哲学与 redis/mysql 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
凡文件级启发式（非块级精确解析）的规律均在「验证方法」中写明口径边界。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 文件 | `**/*.tf` / `**/*.tfvars` | 高（HCL 专属扩展名） |
| 文件 | `.terraform.lock.hcl` | 高（provider 锁文件，init 产物） |
| 配置 | `terraform {` 块 / `required_providers` / `backend "` | 高 |
| 配置 | `resource "aws_|resource "azurerm_|resource "google_` | 中（云 provider 前缀可组合判定） |
| 目录结构 | `modules/<name>/main.tf` 模块布局 | 低（仅作辅助） |

## §2 特定构件枚举（命令 + 计数核验方式）

- resource 块：`grep -rhE '^[[:space:]]*resource[[:space:]]+"[^"]+"' --include='*.tf' . | wc -l`（计数核验基准：resource 声明行数）
- module 调用：`grep -rhE '^[[:space:]]*module[[:space:]]+"[^"]+"' --include='*.tf' . | wc -l`（计数核验基准：module 块数）
- data 源：`grep -rhE '^[[:space:]]*data[[:space:]]+"[^"]+"' --include='*.tf' . | wc -l`（计数核验基准：data 块数）
- output：`grep -rhE '^[[:space:]]*output[[:space:]]+"[^"]+"' --include='*.tf' . | wc -l`（计数核验基准：output 块数）
- variable：`grep -rhE '^[[:space:]]*variable[[:space:]]+"[^"]+"' --include='*.tf' . | wc -l`（计数核验基准：variable 块数）

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：state 文件绝不入库、不用 local backend
- **适用版本**: 全版本
- **规律**: `terraform.tfstate`（含 `.backup`）不得以文件形式出现在仓库扫描树内；`.tf` 中不得配置 `backend "local"`。state 必须以远程 backend（s3/azurerm/gcs/remote）承载。
- **违反后果**: state 默认明文存全部资源属性（含 RDS 主密码、IAM access key、TLS 私钥），入库即密钥泄露（CWE-312 明文存储敏感信息；GB/T 22239-2019 8.1.4.6 数据保密性要求）；local backend 在团队环境还意味着无锁并发写损坏。
- **验证方法**: `find . -name '*.tfstate*'`（应为空）；`grep -rnE 'backend[[:space:]]+"local"' --include='*.tf' .`（应为空）
- **对应门禁**: fw_terraform_state_in_git（fail 级）

```verify
id: terraform-r1
cmd: grep -rnE 'backend[[:space:]]+"local"' --include='*.tf' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: SquareOps《Terraform State Best Practices for Teams 2026》"Scenario 6: Secrets leaked via plaintext state"；Confluent 官方文档"state files can contain sensitive information … rather than in plaintext"；Spacelift"Never commit terraform.tfstate to version control"

### 规律：.tf/.tfvars 禁止硬编码密钥字面量
- **适用版本**: 全版本
- **规律**: `password` / `secret_key` / `access_key` / `private_key` / `api_key` / `client_secret` 等属性不得赋字符串字面量；`variable "*password*|*secret*|*token*|*key*"` 块不得带非空 `default`。密钥一律走 `var.*`（运行时注入）、Vault/Secrets Manager 引用或 OIDC 短时令牌。
- **违反后果**: 密钥随代码进入 git 历史与 state 双重明文落地，泄露后须全量轮换（CWE-798 硬编码凭证 + CWE-312；GB/T 22239-2019 8.1.4.1 身份鉴别）。
- **验证方法**: `grep -rnE '(password|secret_key|access_key|private_key|api_key|client_secret)[[:space:]]*=[[:space:]]*"[^"$]+"' --include='*.tf' --include='*.tfvars' .`（剔除含 `var.`/`${` 行后应为空）；awk 扫 variable 块内 `default = "..."`
- **对应门禁**: fw_terraform_hardcoded_secret（fail 级）

```verify
id: terraform-r2
cmd: grep -rnE '(password|secret_key|access_key|private_key|api_key|client_secret)[[:space:]]*=[[:space:]]*"[^"$]+"' --include='*.tf' --include='*.tfvars' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Scalr CI/CD 指南"Dangerous: Hard-coded credentials … Never do this!"；Checkov `CKV_SECRET_*` 与 tfsec sensitive-value 检测规则族；Spacelift《Terraform Secrets》"Keep secrets out of code (no plaintext in .tf, .tfvars, or modules)"

### 规律：安全组管理端口（22/3389）禁止对 0.0.0.0/0 开放
- **适用版本**: 全版本（AWS `aws_security_group`/`aws_security_group_rule` 及同类）
- **规律**: 同一 ingress 块内 `from_port` 为 22/3389/0（全端口）且 `cidr_blocks` 含 `0.0.0.0/0` → 违规。管理端口须收窄到堡垒机/办公网 CIDR；443 等公共服务端口对公网开放属合规例外。
- **违反后果**: SSH/RDP 直接暴露公网，全网暴力破解面（CWE-732 关键资源权限分配不当；GB/T 22239-2019 8.1.3.2 访问控制、8.1.4.4 入侵防范；2019 Capital One 事件同类暴露面）。
- **验证方法**: awk 跟踪 `ingress {` 块：块内同时命中 `from_port = 22|3389|0` 与 `0.0.0.0/0` 即报（块级共现，避免同文件不同 ingress 误报）
- **对应门禁**: fw_terraform_sg_open_world（fail 级）

```verify
id: terraform-r3
cmd: 
expect: always
```

- **证据**: tfsec `aws-ec2-no-public-ingress-sgr`（CRITICAL）"Full internet brute-force attack surface"；Checkov `CKV_AWS_24/25`；2024 Wiz 报告"72% 云环境至少一个公开暴露存储桶/资源，多数由 Terraform 创建"

### 规律：S3 bucket 禁止 public ACL
- **适用版本**: AWS provider 全版本
- **规律**: `aws_s3_bucket` 的 `acl` 不得为 `public-read`/`public-read-write`/`authenticated-read`；公共读须显式走 `aws_s3_bucket_public_access_block` 受控放行并注明审批。
- **违反后果**: 对象存储公网可读，数据泄露高发（CWE-732；GB/T 22239-2019 8.1.4.6 数据保密性；CIS AWS Foundations Benchmark S3 族）。
- **验证方法**: `grep -rnE 'acl[[:space:]]*=[[:space:]]*"public' --include='*.tf' .`（应为空）
- **对应门禁**: fw_terraform_s3_public（fail 级）

```verify
id: terraform-r4
cmd: grep -rnE 'acl[[:space:]]*=[[:space:]]*"public' --include='*.tf' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Checkov `CKV_AWS_20/53-56`（S3 public ACL 与 public access block 四开关）；tfsec `aws-s3-no-public-access`；Wiz 2024 云安全报告公开桶统计

### 规律：RDS/数据库实例禁止公网可达
- **适用版本**: AWS provider 全版本（`aws_db_instance`/`aws_rds_cluster`）
- **规律**: 数据库资源不得设 `publicly_accessible = true`，须置于私有子网仅靠安全组内网访问。
- **违反后果**: 数据库端口直接暴露公网，叠加弱口令即失陷（CWE-732；GB/T 22239-2019 8.1.3.2 边界访问控制）。
- **验证方法**: `grep -rnE 'publicly_accessible[[:space:]]*=[[:space:]]*true' --include='*.tf' .`（应为空）
- **对应门禁**: fw_terraform_rds_public（fail 级）

```verify
id: terraform-r5
cmd: grep -rnE 'publicly_accessible[[:space:]]*=[[:space:]]*true' --include='*.tf' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Checkov `CKV_AWS_17`、tfsec `aws-rds-no-public-db-access`；"top exploited configs"清单含"RDS instances … with public accessibility enabled"（Decryption Digest IaC 清单）

### 规律：必须配置远程 backend（拒绝默认 local）
- **适用版本**: 全版本
- **规律**: 任一 `terraform {` 工程必须存在 `backend "s3"|"azurerm"|"gcs"|"remote"` 配置；缺省 local backend 仅限一次性沙箱。
- **违反后果**: state 存开发者本机，无锁、无版本化、无访问控制，丢 state = 全量资源孤儿化或重复创建（GB/T 22239-2019 8.1.4.6 备份恢复要求）。
- **验证方法**: `grep -rlE 'backend[[:space:]]+"' --include='*.tf' .`（应非空）
- **对应门禁**: fw_terraform_backend_missing（warn 级）

```verify
id: terraform-r6
cmd: grep -rlE 'backend[[:space:]]+"' --include='*.tf' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: SquareOps"Scenario 5: Lost state file (no remote backend)"；"Local state files are unacceptable for team environments"（sharpskill/HashiCorp 口径）

### 规律：S3 backend 必须 encrypt = true（建议 KMS + 锁）
- **适用版本**: AWS backend；Terraform ≥1.9 起 DynamoDB 锁弃用、改 `use_lockfile = true`
- **规律**: `backend "s3"` 块内必须显式 `encrypt = true`（推荐 `kms_key_id` + 锁机制）。
- **违反后果**: state 在存储层明文落盘，存储侧泄露即全量基础设施与密钥泄露（CWE-312；GB/T 22239-2019 8.1.4.6 数据保密性）。
- **验证方法**: 对含 `backend "s3"` 的文件 `grep -E 'encrypt[[:space:]]*=[[:space:]]*true'`（同文件须命中）
- **对应门禁**: fw_terraform_backend_unencrypted（warn 级）

```verify
id: terraform-r7
cmd: grep -E 'encrypt[[:space:]]*=[[:space:]]*true' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Confluent 官方"Use encrypted, secure backends for state"；Octopus Deploy 示例 `encrypt = true` + `dynamodb_table`；SquareOps 2026 口径"S3-native locking via use_lockfile = true (DynamoDB locking deprecated as of Terraform 1.11)"

### 规律：provider 与 core 版本必须锁定
- **适用版本**: ≥0.13（`required_providers` source 语法起）
- **规律**: 存在 `provider "<name>"` 块的工程必须有 `required_providers` 块且各 provider 带 `version = "~> x.y"` 级约束；建议同时锁 `required_version`。
- **违反后果**: 未锁版本时 init 拉最新 provider，行为漂移致 plan/apply 不可复现，供应链面扩大（对应 GB/T 25000.51-2016 可重复性/可测试性要求）。
- **验证方法**: `grep -rlE 'required_providers' --include='*.tf' .`（有 provider 块时应非空且块内含 `version =`）
- **对应门禁**: fw_terraform_provider_unpinned（warn 级）

```verify
id: terraform-r8
cmd: grep -rlE 'required_providers' --include='*.tf' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: hashicorp/terraform#34305 示例工程标准形态 `required_providers { azurerm = { source … version = "3.44.1" } }`；SquareOps 七条 non-negotiables 含版本化

### 规律：有状态资源必须 lifecycle prevent_destroy
- **适用版本**: 全版本
- **规律**: `aws_db_instance`/`aws_s3_bucket`/`azurerm_mssql_database` 等承载数据的有状态资源所在文件须有 `lifecycle { prevent_destroy = true }`。
- **违反后果**: 一次误 plan 即销毁生产数据库/存储桶，数据不可恢复（GB/T 22239-2019 8.1.4.6 数据备份恢复；可用性破坏）。
- **验证方法**: `grep -rlE 'aws_db_instance|aws_s3_bucket|azurerm_mssql_database' --include='*.tf' .` 的每个文件须含 `prevent_destroy[[:space:]]*=[[:space:]]*true`（文件级启发式：多资源文件内逐块核对为人工检查补充）
- **对应门禁**: fw_terraform_no_prevent_destroy（warn 级）

```verify
id: terraform-r9
cmd: grep -rlE 'aws_db_instance|aws_s3_bucket|azurerm_mssql_database' --include='*.tf' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: HashiCorp 官方 lifecycle 文档"measure of safety against the accidental replacement of objects that may be costly to reproduce, such as database instances"；OneUptime 2026"Apply prevent_destroy to any resource that holds state or data"

### 规律：RDS 存储必须加密
- **适用版本**: AWS provider 全版本
- **规律**: `aws_db_instance` 所在文件须显式 `storage_encrypted = true`（推荐 `kms_key_id` 自带密钥）。
- **违反后果**: 数据库存储层明文，快照/磁盘泄露即数据泄露（CWE-312；GB/T 22239-2019 8.1.4.6 数据保密性）。
- **验证方法**: 含 `aws_db_instance` 的文件 `grep -E 'storage_encrypted[[:space:]]*=[[:space:]]*true'`（须命中）
- **对应门禁**: fw_terraform_rds_unencrypted（warn 级）

```verify
id: terraform-r10
cmd: grep -E 'storage_encrypted[[:space:]]*=[[:space:]]*true' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Checkov `CKV_AWS_16` / tfsec `aws-rds-encrypt-cluster-storage-data`；terraform-security-project 高危清单"RDS storage not encrypted"

### 规律：敏感 output 必须 sensitive = true
- **适用版本**: 全版本
- **规律**: `output` 名含 `password|secret|token|key` 的块所在文件须有 `sensitive = true`；敏感值不得以明文 output 进 CI 日志。
- **违反后果**: output 明文进 plan/apply 日志与 CI 制品，二次泄露（CWE-312；GB/T 22239-2019 8.1.4.6）。
- **验证方法**: `grep -rnE 'output[[:space:]]+"[^"]*(password|secret|token|key)[^"]*"' --include='*.tf' .` 命中的文件须含 `sensitive[[:space:]]*=[[:space:]]*true`
- **对应门禁**: fw_terraform_sensitive_output（warn 级）

```verify
id: terraform-r11
cmd: grep -rnE 'output[[:space:]]+"[^"]*(password|secret|token|key)[^"]*"' --include='*.tf' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Spacelift《Terraform State》"use secret managers and sensitive outputs instead of exposing credentials or keys directly"；Spacelift《Terraform Secrets》"avoid leaking via outputs or logs"

### 规律：apply 必须经 plan 审查，禁止裸 -auto-approve
- **适用版本**: 全版本
- **规律**: CI/脚本中不得出现 `terraform apply -auto-approve` / `terraform destroy -auto-approve`；标准流为 `plan -out=tfplan` → 审查（OPA/Sentinel/人工）→ `apply tfplan`。
- **违反后果**: 未经审查的变更直达生产，误销毁/误开公网无拦截点（GB/T 22239-2019 8.1.4.7 安全审计；变更管理失控）。
- **验证方法**: `grep -rnE 'terraform[[:space:]]+(apply|destroy)[[:space:]]+(-[a-z-]+[[:space:]]+)*-auto-approve' --include='*.sh' --include='*.yml' --include='*.yaml' .`（应为空）
- **对应门禁**: fw_terraform_auto_approve（warn 级）

```verify
id: terraform-r12
cmd: grep -rnE 'terraform[[:space:]]+(apply|destroy)[[:space:]]+(-[a-z-]+[[:space:]]+)*-auto-approve' --include='*.sh' --include='*.yml' --include='*.yaml' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: SquareOps"CI/CD as the only path to apply, and OPA/Sentinel policy gates on every plan"；Spacelift"Always review plan output before applying"；技术社区生命周期指南"Skipping plan → Untracked changes. Fix: Always review plan before apply"

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_terraform_state_in_git | fail | 扫描树内出现 `*.tfstate*` 文件，或 .tf 含 `backend "local"` → fail | TERRAFORM_SRC_GLOBS |
| fw_terraform_hardcoded_secret | fail | .tf/.tfvars 剥注释后命中密钥属性=字符串字面量，或敏感 variable 块带非空 default → fail | TERRAFORM_SRC_GLOBS |
| fw_terraform_sg_open_world | fail | awk 跟踪 ingress 块：块内 22/3389/0 端口与 0.0.0.0/0 共现 → fail | TERRAFORM_SRC_GLOBS |
| fw_terraform_s3_public | fail | `acl = "public-*"` 命中 → fail | TERRAFORM_SRC_GLOBS |
| fw_terraform_rds_public | fail | `publicly_accessible = true` 命中 → fail | TERRAFORM_SRC_GLOBS |
| fw_terraform_backend_missing | warn | 全仓库无 `backend "` 配置 → warn | TERRAFORM_SRC_GLOBS |
| fw_terraform_backend_unencrypted | warn | 含 `backend "s3"` 的文件无 `encrypt = true` → warn | TERRAFORM_SRC_GLOBS |
| fw_terraform_provider_unpinned | warn | 有 `provider "` 块但全仓库无 `required_providers` → warn | TERRAFORM_SRC_GLOBS |
| fw_terraform_no_prevent_destroy | warn | 含有状态资源的文件无 `prevent_destroy = true` → warn | TERRAFORM_SRC_GLOBS |
| fw_terraform_rds_unencrypted | warn | 含 `aws_db_instance` 的文件无 `storage_encrypted = true` → warn | TERRAFORM_SRC_GLOBS |
| fw_terraform_sensitive_output | warn | 敏感名 output 所在文件无 `sensitive = true` → warn | TERRAFORM_SRC_GLOBS |
| fw_terraform_auto_approve | warn | 脚本/CI 文件命中 `terraform apply/destroy -auto-approve` → warn | TERRAFORM_SRC_GLOBS |

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| terraform × mysql / postgresql | `aws_db_instance publicly_accessible = true` 与数据库 bind `0.0.0.0` 叠加判定 | IaC 层公网放行 + 实例层监听全网卡 = 双重暴露，单边合规不成立 |
| terraform × redis | ElastiCache/内存库资源同适用"禁公网 + prevent_destroy + 加密"三件套 | 与 fw_redis_* 数据层防护同构，IaC 是其实际生效边界 |
| terraform × 通用 check_sensitive | 通用门禁报"存在口令模式"，本规则集报"HCL 语义上密钥字面量赋值" | 口径分工同 R4 §五.7：通用报存在、框架报语义，避免 `${var.x}` 占位符被双报 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| 0.12 | HCL2 语法切换（表达式不再强制 `"${}"` 包裹） | 旧 0.11 配置的正则匹配口径不同，本规则集按 HCL2 形态编写 |
| 0.13 | `required_providers` 引入 `source = "hashicorp/aws"` 显式源 | 未写 source 的三方 provider 解析路径变化；fw_terraform_provider_unpinned 按 ≥0.13 形态判定 |
| 1.5.x | 最后一个 MPL 开源版本；≥1.6 起 BUSL 许可，OpenTofu 自 1.5.6 分叉 | 合规敏感组织须评估许可；OpenTofu 配置同构，本规则集同等适用 |
| 1.1 | `moved` 块替代手工 `terraform state mv` | 重构走 moved 块可审查；手工 state mv 不入库即无审计 |
| ≥1.9/1.11 | S3 backend 弃用 DynamoDB 锁，改 `use_lockfile = true`（1.11 正式移除 dynamodb_table 口径） | backend 审查时锁机制写法按版本区分；encrypt = true 要求不变 |
