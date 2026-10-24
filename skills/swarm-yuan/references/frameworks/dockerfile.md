---
ruleset_id: dockerfile
适用版本: Dockerfile syntax 1.x（BuildKit ≥18.09 独立特性单独标注；多平台 buildx 差异在版本陷阱速查标注）
最后调研: 2026-07-23（来源：https://docs.docker.com/engine/reference/builder / https://owasp.org/Docker_Top_10 / https://github.com/docker/buildkit / Hadolint 规则库 S1000+）
深度门槛: 10
---

# Dockerfile 规则集

<!--
IaC 容器镜像系规则集（WP-U 新增，填补 R4 §4.2「IaC/交付工程」容器化缺口）。
判定哲学与 terraform 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
Dockerfile 用 grep 匹配指令行（非解析器，口径在「验证方法」中写明）；
# 注释行用 grep -v 过滤（Dockerfile 仅 # 行注释，无块注释）。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 文件 | `**/Dockerfile` / `**/Dockerfile.*` / `**/*.dockerfile` | 高（Dockerfile 命名约定，存在即激活） |
| 文件 | `**/.dockerignore` | 中（容器构建上下文排除清单，组合 Dockerfile 判定） |
| 文件 | `**/docker-compose*.y*ml` 中含 `build:` 段 | 中（编排文件引用 Dockerfile，组合判定） |
| 配置 | `FROM ...` / `RUN ...` / `COPY ...` / `ENTRYPOINT ...` 指令行 | 高（Dockerfile 指令特征） |
| 配置 | `# syntax=docker/dockerfile:` 解析器指令 | 高（BuildKit 解析器前缀，BuildKit 工程特征） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 exploration-guide.md §C+.0.5 区块。
detect 信号：Dockerfile 文件存在即激活（detect-frameworks.sh 不支持 file 类型探测，
需手动配置 ACTIVE_FRAMEWORKS=("dockerfile") 或经 --inject-frameworks 补占位——见 §1 备注）。
detect-frameworks.sh 当前仅扫描 package.json/pom.xml/go.mod/pyproject/requirements，
Dockerfile 与 .dockerignore 不在其扫描范围，故 dockerfile 框架须手动配置 ACTIVE_FRAMEWORKS。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Dockerfile 文件：`find . -type f \( -name 'Dockerfile' -o -name 'Dockerfile.*' -o -name '*.dockerfile' \) -not -path '*/.git/*'`（计数核验基准：Dockerfile 数）
- FROM 指令：`grep -rnE '^[[:space:]]*FROM[[:space:]]' --include='Dockerfile*' . | wc -l`（计数核验基准：构建阶段数，多阶段构建 ≥2）
- RUN 指令：`grep -rnE '^[[:space:]]*RUN[[:space:]]' --include='Dockerfile*' . | wc -l`（计数核验基准：RUN 步数，反映层数）
- apt-get 安装点：`grep -rnE 'apt-get[[:space:]]+install' --include='Dockerfile*' . | wc -l`（计数核验基准：Debian 系包安装点）
- ENTRYPOINT/COPY/EXPOSE 指令：`grep -rnE '^[[:space:]]*(ENTRYPOINT|COPY|EXPOSE)[[:space:]]' --include='Dockerfile*' . | wc -l`（计数核验基准：入口/复制/暴露指令总数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型（与 §C+.1-FW 各框架枚举命令段呼应）。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
Dockerfile 是行指令格式，本规则集用 grep 匹配指令行首关键字（非解析器），
口径：行首（允许前导空白）匹配指令名 FROM/RUN/COPY/ENTRYPOINT/EXPOSE/USER/HEALTHCHECK/ARG/ENV。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：基础镜像须用 digest 或最小化镜像，禁 :latest
- **适用版本**: 全版本（Dockerfile syntax 1.x）
- **规律**: `FROM` 指令不得使用 `:latest` 标签；须用 digest 锁定（`image@sha256:...`）或版本号标签（`image:1.2.3`），并优先选用 `alpine`/`slim`/`scratch`/distroless 等最小化基础镜像减小攻击面。
- **违反后果**: `:latest` 标签可变（pull 拉到的镜像随时间漂移），构建不可复现，供应链投毒面扩大；臃肿基础镜像含 shell/包管理器等攻击工具链（CWE-668 资源暴露于错误范围；GB/T 22239-2019 8.1.4.3 恶意代码防范）。
- **验证方法**: `grep -nE '^[[:space:]]*FROM[[:space:]]+[^[:space:]]+:latest' --include='Dockerfile*' .`（剥 # 注释行后命中 → fail）
- **对应门禁**: fw_dockerfile_latest_base（fail 级）

```verify
id: dockerfile-r1
cmd: grep -nE '^[[:space:]]*FROM[[:space:]]+[^[:space:]]+:latest' --include='Dockerfile*' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：禁止以 root 运行，须显式 USER 非 root
- **适用版本**: 全版本
- **规律**: Dockerfile 须含 `USER <非root>` 指令（如 `USER app` / `USER 1000`），切换到非特权用户运行。默认 root（uid=0）运行容器等同于宿主权限越界风险。
- **违反后果**: 容器内进程以 root 运行，逃逸到宿主即获 root 权限，配合 CVE-2019-5736 runc 等逃逸漏洞即失陷整宿主（CWE-250 特权责任不必要的特权；GB/T 22239-2019 8.1.4.1 身份鉴别）。
- **验证方法**: 剥 # 注释后，Dockerfile 内 `grep -nE '^[[:space:]]*USER[[:space:]]'`（应非空且非 `USER root`/`USER 0`）；缺 USER 指令或显式 `USER root` → fail
- **对应门禁**: fw_dockerfile_root_user（fail 级）

```verify
id: dockerfile-r2
cmd: grep -nE '^[[:space:]]*USER[[:space:]]' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：敏感信息禁止硬编码在 ENV/ARG
- **适用版本**: 全版本
- **规律**: `ENV` / `ARG` 指令不得赋含密码/密钥/令牌字面量（变量名或值匹配 `password|passwd|secret|token|api_key|apikey|access_key|private_key` 且赋字符串字面量）。密钥须运行时注入（`docker run -e` / `--env-file` / Secrets / Vault）。
- **违反后果**: 密钥进镜像层与 git 历史双重明文落地，`docker history` 可还原，泄露后须全量轮换（CWE-798 硬编码凭证；GB/T 22239-2019 8.1.4.1 身份鉴别）。
- **验证方法**: `grep -nE '^[[:space:]]*(ENV|ARG)[[:space:]].*(password|passwd|secret|token|api_key|apikey|access_key|private_key)[[:space:]]*=' --include='Dockerfile*' .` 剔除含 `$`/`{` 引用占位行后命中 → fail（口径：行级匹配，变量名或值命中即报）
- **对应门禁**: fw_dockerfile_hardcoded_secret（fail 级）

```verify
id: dockerfile-r3
cmd: grep -nE '^[[:space:]]*(ENV|ARG)[[:space:]].*(password|passwd|secret|token|api_key|apikey|access_key|private_key)[[:space:]]*=' --include='Dockerfile*' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：HEALTHCHECK 须显式配置
- **适用版本**: 全版本（Docker 1.12+ 原生支持）
- **规律**: 镜像须含 `HEALTHCHECK` 指令，显式声明健康探测命令（`HEALTHCHECK --interval=... CMD ...`）。无 HEALTHCHECK 时编排器（Swarm/K8s liveness）仅靠进程存活判定，进程假死（死锁/泄漏）不可发现。
- **违反后果**: 进程假死（内存泄漏/死锁/连接耗尽）不被探测，流量继续打到僵尸实例（CWE-1188 探测缺失；GB/T 22239-2019 8.1.4.5 可用性）。
- **验证方法**: 剥 # 注释后 `grep -nE '^[[:space:]]*HEALTHCHECK[[:space:]]' --include='Dockerfile*' .`（应非空）；缺 HEALTHCHECK → warn
- **对应门禁**: fw_dockerfile_no_healthcheck（warn 级）

```verify
id: dockerfile-r4
cmd: grep -nE '^[[:space:]]*HEALTHCHECK[[:space:]]' --include='Dockerfile*' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：多阶段构建减小镜像体积
- **适用版本**: Docker 17.05+（多阶段构建支持）
- **规律**: 复杂构建（编译型语言/含构建工具链）须用多阶段构建（≥2 个 `FROM`，最终阶段 `COPY --from=builder`），仅将产物复制进最终镜像。单阶段构建把编译器/SDK 全部留在镜像，体积膨胀攻击面扩大。
- **违反后果**: 单阶段镜像含 gcc/node/maven 等工具链，体积大（拉取慢/超容量），攻击工具链被攻击者就地取材（GB/T 25000.51-2016 资源利用；供应链面）。
- **验证方法**: 剥 # 注释后 `grep -cE '^[[:space:]]*FROM[[:space:]]' --include='Dockerfile*' .`（多阶段构建应 ≥2；若仅 1 个 FROM 且镜像含编译型特征 RUN apt-get install gcc|node|maven 则 warn；口径：单 FROM 即 warn 启发式）
- **对应门禁**: fw_dockerfile_no_multistage（warn 级）

```verify
id: dockerfile-r5
cmd: grep -cE '^[[:space:]]*FROM[[:space:]]' --include='Dockerfile*' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：.dockerignore 须存在
- **适用版本**: 全版本
- **规律**: 含 Dockerfile 的工程根（或 Dockerfile 同级 build context）须有 `.dockerignore` 文件，排除 `.git/` / `node_modules/` / `target/` / `__pycache__/` / 密钥文件等，防止构建上下文泄露与镜像膨胀。
- **违反后果**: 构建上下文把全仓库（含 .git 历史/密钥/依赖缓存）打入镜像层，构建慢且密钥泄露（CWE-668 资源暴露；GB/T 22239-2019 8.1.4.6 数据保密性）。
- **验证方法**: Dockerfile 所在目录（或其父目录至 repo 根逐级查）无 `.dockerignore` 文件 → warn（口径：文件级启发式，父级查找防 build context 设在上级）
- **对应门禁**: fw_dockerfile_no_dockerignore（warn 级）

```verify
id: dockerfile-r6
cmd: 
expect: always
```

### 规律：apt-get 须 --no-install-recommends 并清理缓存
- **适用版本**: Debian/Ubuntu 系基础镜像
- **规律**: `apt-get install` 须加 `--no-install-recommends`（防装推荐包致镜像膨胀），且同 RUN 内须 `rm -rf /var/lib/apt/lists/*` 清理包索引缓存。多 apt 操作须合并到单 RUN 减层数。
- **违反后果**: 推荐包致镜像体积膨胀 30%+；apt 缓存残留镜像层（不可删除，层只增不减），攻击者可离线分析包版本找漏洞（CWE-400 资源消耗不可控；GB/T 25000.51-2016 资源利用）。
- **验证方法**: 剥 # 注释后命中 `apt-get[[:space:]]+install` 但同文件无 `--no-install-recommends`，或同文件无 `rm -rf /var/lib/apt/lists` → warn（口径：文件级，含 apt-get install 即须同时存在两个清理标记）
- **对应门禁**: fw_dockerfile_apt_cleanup（warn 级）

```verify
id: dockerfile-r7
cmd: 
expect: always
```

### 规律：COPY 须用 --chown 显式属主
- **适用版本**: Docker 17.09+（COPY --chown 支持）
- **规律**: `COPY` 指令复制文件进镜像须带 `--chown=<user>:<group>`（或 `--chown=<user>`）显式指定属主，避免文件以 root 属主落入镜像层（即使后续 USER 切换，已复制文件仍 root 属主）。
- **违反后果**: 复制的二进制/配置以 root 属主存在镜像层，非 root 进程可读但不可改，攻击者拿到 root 后可篡改（配合容器逃逸即植入后门；CWE-250；GB/T 22239-2019 8.1.4.1）。
- **验证方法**: 剥 # 注释后 `grep -nE '^[[:space:]]*COPY[[:space:]]' --include='Dockerfile*' .` 命中行不含 `--chown` → warn（口径：行级，每个 COPY 须自带 --chown；ADD 指令豁免，ADD 多用于远程 URL/ tar 解包）
- **对应门禁**: fw_dockerfile_copy_no_chown（warn 级）

```verify
id: dockerfile-r8
cmd: grep -nE '^[[:space:]]*COPY[[:space:]]' --include='Dockerfile*' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：EXPOSE 须与实际监听端口一致
- **适用版本**: 全版本
- **规律**: `EXPOSE` 指令声明的端口须与应用实际监听端口一致（如 Spring Boot `server.port=8080` 则 `EXPOSE 8080`）。EXPOSE 是文档性声明，不一致误导运维与编排器端口映射配置。
- **违反后果**: EXPOSE 与实际监听端口不一致，编排器/网关按 EXPOSE 映射即流量打空，或暴露了不必要端口（CWE-668 资源暴露；GB/T 22239-2019 8.1.3.2 边界访问控制）。
- **验证方法**: 剥 # 注释后 `grep -nE '^[[:space:]]*EXPOSE[[:space:]]+[0-9]+' --include='Dockerfile*' .`（应有 EXPOSE 声明）；无 EXPOSE → warn（口径：仅检有无 EXPOSE 声明，与实际端口一致性的精确比对需结合应用配置文件，属人工检查补充）
- **对应门禁**: fw_dockerfile_no_expose（warn 级）

```verify
id: dockerfile-r9
cmd: grep -nE '^[[:space:]]*EXPOSE[[:space:]]+[0-9]+' --include='Dockerfile*' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：入口须用 ENTRYPOINT+CMD 分离，可被覆盖
- **适用版本**: 全版本
- **规律**: 容器入口须用 `ENTRYPOINT` 指定主进程 + `CMD` 提供默认参数（CMD 可被 `docker run <args>` 覆盖），而非单一 `CMD` 作主进程或 `ENTRYPOINT` 硬钉死无 CMD。分离模式让镜像既可作为可执行文件又允许传参覆盖。
- **违反后果**: 仅用 CMD 时 `docker run` 易误覆盖主进程（如 nginx 镜像只 CMD nginx 则 `docker run img bash` 即丢失 nginx）；ENTRYPOINT 无 CMD 则无法传参（如 `docker run img --help` 失效）（GB/T 25000.51-2016 使用性/可配置性）。
- **验证方法**: 剥 # 注释后同文件内同时有 `ENTRYPOINT` 与 `CMD` → 合规；仅有 `CMD` 或仅有 `ENTRYPOINT` → warn（口径：文件级共现判定）
- **对应门禁**: fw_dockerfile_entrypoint_cmd_split（warn 级）

```verify
id: dockerfile-r10
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
| fw_dockerfile_latest_base | fail | FROM 命中 `:latest` 标签 → fail | DOCKERFILE_GLOBS |
| fw_dockerfile_root_user | fail | Dockerfile 无 USER 指令或显式 USER root/0 → fail | DOCKERFILE_GLOBS |
| fw_dockerfile_hardcoded_secret | fail | ENV/ARG 含密钥字面量（剔除 $ 引用）→ fail | DOCKERFILE_GLOBS |
| fw_dockerfile_no_healthcheck | warn | Dockerfile 无 HEALTHCHECK 指令 → warn | DOCKERFILE_GLOBS |
| fw_dockerfile_no_multistage | warn | FROM 数 <2（单阶段构建，含编译特征）→ warn | DOCKERFILE_GLOBS |
| fw_dockerfile_no_dockerignore | warn | Dockerfile 同级或上级目录无 .dockerignore → warn | DOCKERFILE_GLOBS |
| fw_dockerfile_apt_cleanup | warn | apt-get install 但无 --no-install-recommends 或无清理缓存 → warn | DOCKERFILE_GLOBS |
| fw_dockerfile_copy_no_chown | warn | COPY 指令未带 --chown → warn | DOCKERFILE_GLOBS |
| fw_dockerfile_no_expose | warn | Dockerfile 无 EXPOSE 声明 → warn | DOCKERFILE_GLOBS |
| fw_dockerfile_entrypoint_cmd_split | warn | 缺 ENTRYPOINT 或 CMD（未分离）→ warn | DOCKERFILE_GLOBS |

<!--
门禁 id 命名规范：fw_dockerfile_<rule>（rule 全小写下划线）。
本表 10 条 id 须在 assets/framework-gates/dockerfile.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_dockerfile_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: dockerfile  requires_conf: DOCKERFILE_GLOBS` 声明。
fixture 验证覆盖：violating/Dockerfile（:latest + 无 USER + ENV PASSWORD + 无 HEALTHCHECK + 无 .dockerignore + apt 无清理 + COPY 无 --chown + 单阶段 + 无 EXPOSE）
→ latest_base/root_user/hardcoded_secret 3 fail 主触发；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| dockerfile × kubernetes | Dockerfile 的 USER/EXPOSE/HEALTHCHECK 须与 K8s securityContext.runAsNonRoot/containerPort/livenessProbe 对齐 | IaC 镜像层与编排层双重声明，不一致即编排层覆盖失效（如镜像 USER root 但 K8s runAsNonRoot=true 直接创建失败） |
| dockerfile × terraform | Dockerfile 构建的镜像若经 Terraform ECS/ACI 部署，镜像 digest 须在 Terraform 中锁定（非 :latest） | 与 fw_terraform_* 资源版本锁定同构，digest 漂移即部署漂移 |
| dockerfile × 通用 check_sensitive | 通用门禁扫密钥模式覆盖 Dockerfile ENV/ARG | 本规则集报"Dockerfile 语义上密钥字面量"，通用报存在，避免 ENV 引用占位 `${VAR}` 被双报 |

<!--
无强交互的框架组合省略；本表聚焦 dockerfile 与 IaC 邻接框架的组合约束。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Docker 17.05 | 多阶段构建引入（多 FROM + COPY --from） | 复杂构建须多阶段减小镜像，fw_dockerfile_no_multistage 按 ≥17.05 形态判定 |
| Docker 17.09 | `COPY --chown` 支持 | 旧 Dockerfile 无 --chown 须迁移；fw_dockerfile_copy_no_chown 按 ≥17.09 形态判定 |
| Docker 1.12 | `HEALTHCHECK` 指令原生支持 | 旧镜像靠编排器探测，fw_dockerfile_no_healthcheck 按 ≥1.12 形态判定 |
| Docker 18.09 | BuildKit 默认可用（`# syntax=docker/dockerfile:1` 解析器指令） | BuildKit 支持 `--mount=type=cache` 等高级特性，旧 Dockerfile 须声明 syntax 才能用 |
| Docker 23.0+ | BuildKit 成为默认构建器（旧 builder 弃用） | 不声明 `# syntax=` 也用 BuildKit；但显式声明 syntax 仍推荐以锁版本 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
