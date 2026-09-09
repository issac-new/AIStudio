# Flink 实时数仓技术栈版本兼容矩阵与最终版本锁定建议

**采集时间**: 2026-09-04  
**数据时效窗口**: 2026-08 至 2026-09  
**宿主机架构**: arm64 (Apple M1)

---

## 核心结论速览

| 组件 | **主选锁定版本** | 备选版本 | 关键约束 |
|------|-----------------|---------|---------|
| **Flink** | **1.20.5** | 2.3.0 | Fluss 0.9.1 仅支持 1.18/1.19/1.20 |
| **Flink CDC** | **3.6.x** | 3.5.x | 3.6 支持 Flink 1.20/2.2；配合 1.20 用 3.6 |
| **Apache Paimon** | **2.0.0** | 1.4.2 | 2.0.0 提供 flink-1.20/2.0/2.1/2.2 后缀 jar |
| **Apache Fluss** | **0.9.1-incubating** | 0.8.0 | 必需 ZooKeeper；仅有 1.20 connector 无 2.x |
| **Dinky** | **1.2.5-flink1.20** | 1.2.4-flink1.20 | Docker tag 含 arm64；远程提交需 client 与集群版本一致 |
| **MySQL** | **8.4 (LTS)** | 8.0 | CDC 支持 8.0.x/8.4+；8.4 为当前 LTS |
| **Redis** | **8.10.1 (latest)** | 7.4 | 官方镜像 latest=8.10.1；含 arm64 |

> **一句话决策**: **锁定 Flink 1.20.5**。Fluss 0.9.1 官方仅发布 `fluss-flink-1.20` connector，无 Flink 2.x 版本；Paimon 2.0.0 两边都有但 1.20 生态更成熟；Flink CDC 3.6 两边都支持但配合 Fluss 必选 1.20。

---

## 详细证据链

### A. Flink 1.20.x vs 2.x —— 综合三者给出明确结论

| 子问题 | 结论 | 官方证据 URL |
|--------|------|-------------|
| **Fluss 0.9.1 官方支持哪个 Flink 版本的 connector?** | **仅 1.18 / 1.19 / 1.20**；无 Flink 2.x connector | [fluss.apache.org/docs/engine-flink/getting-started/](https://fluss.apache.org/docs/engine-flink/getting-started/) — "Supported Flink Versions: 0.9 → 1.18, 1.19, 1.20"；Maven Central 仅有 `fluss-flink-1.20-0.9.1-incubating.jar` 等 |
| **Paimon 当前发布版提供哪些 flink-1.20/flink-2.x 后缀的 jar?** | **2.0.0 同时提供**：`paimon-flink-1.20-2.0.0.jar`、`paimon-flink-2.0/2.1/2.2-2.0.0.jar` | [paimon.apache.org/docs/2.0/project/download/](https://paimon.apache.org/docs/2.0/project/download/) — 表格明列四个 Flink 版本 |
| **Flink CDC 3.x 支持哪些 Flink 版本?** | **3.6.x 支持 1.20.*, 2.2.***；3.5.x 支持 1.19/1.20 | [nightlies.apache.org/flink/flink-cdc-docs-stable/docs/connectors/flink-sources/overview/](https://nightlies.apache.org/flink/flink-cdc-docs-stable/docs/connectors/flink-sources/overview/) — 兼容表 |
| **综合结论** | **锁定 Flink 1.20.5** | Fluss 0.9.1 **仅**有 1.20 connector → 整条链路只能跑 1.20 |

> **关键点**: Flink 官网最新稳定版为 2.3.0（[flink.apache.org/downloads](https://flink.apache.org/downloads/)），但 **Fluss 0.9.1 未发布 Flink 2.x connector**，导致若升 Flink 2.x 则无 Fluss 集成。Paimon 与 CDC 两边都有，但受制于 Fluss，全栈唯一可行路径为 **Flink 1.20.x**。当前最新 patch 为 **1.20.5**。

---

### B. Dinky

| 项目 | 详情 | 证据 URL |
|------|------|---------|
| **最新稳定版本** | **1.2.5** (2025-11-05 发布) | [github.com/DataLinkDC/dinky/releases](https://github.com/DataLinkDC/dinky/releases) |
| **Docker tag 列表** (dinkydocker/dinky-standalone-server) | `1.2.5-flink1.20`、`1.2.5-flink1.19`、`1.2.5-flink1.18`、`1.2.5-flink1.17`、`1.2.5-flink1.16`、`1.2.5-flink1.15`、`1.2.5-flink1.14` 等 | [hub.docker.com/r/dinkydocker/dinky-standalone-server/tags](https://hub.docker.com/r/dinkydocker/dinky-standalone-server/tags) |
| **arm64 支持** | **是** — 所有 1.2.5-flink* tag 均含 `linux/amd64` + `linux/arm64` manifest | 同上 — 每个 tag 下显示两个架构 digest |
| **flink1.20 变体** | **有** — `1.2.5-flink1.20` (最新)、`1.2.4-flink1.20`、`1.2-flink1.20` | 同上 |
| **远程提交外部 Flink 集群时，Dinky 内置 Flink 版本与集群版本不一致 (1.19 vs 1.20) 是否官方声明可用?** | **未验证** — 官方文档仅说明“Dlink 提供了多版本的 dlink-client.jar，根据需求选择对应版本的依赖加入到 lib 下即可稳定连接该版本的 Flink 集群实例”([dinky.org.cn/docs/0.7/extend/practice_guide/principle/](https://www.dinky.org.cn/docs/0.7/extend/practice_guide/principle/))，未见针对 minor 版本不一致 (1.19 client → 1.20 cluster) 的明确兼容声明。**建议：Dinky 侧 client 版本与集群 Flink 版本严格对齐** | 同上；FAQ 无相关条目 |

---

### C. Fluss 0.9.1

| 项目 | 详情 | 证据 URL |
|------|------|---------|
| **是否必需 ZooKeeper** | **是，必需** — 所有官方部署文档 (docker/helm/bare-metal) 均要求 `zookeeper.address` 配置，quickstart docker-compose 含 `zookeeper:3.9.2` 服务 | [fluss.apache.org/docs/quickstart/flink/](https://fluss.apache.org/docs/quickstart/flink/) — compose 含 zookeeper 服务；[fluss.apache.org/docs/install-deploy/deploying-with-docker/](https://fluss.apache.org/docs/install-deploy/deploying-with-docker/) — 单独起 zookeeper 容器 |
| **是否已支持无 ZK 模式** | **否** — 0.9 版本仍强依赖 ZK；FIP-1 规划未来移除但未在 0.9 交付 | [cwiki.apache.org/confluence/spaces/FLUSS/pages/421957775](https://cwiki.apache.org/confluence/spaces/FLUSS/pages/421957775) — "ZooKeeper removal (per FIP-1 and Fluss roadmap) accommodated by adding new spec.metadataStore fields in future FIP" |
| **官方 docker 镜像准确名称与 tag** | **apache/fluss:0.9.1-incubating** (coordinator/tablet 通用) | [hub.docker.com/r/apache/fluss/tags](https://hub.docker.com/r/apache/fluss/tags) |
| **quickstart 镜像** | **apache/fluss-quickstart-flink:1.20-0.9.1-incubating** (含 Fluss connector + flink-faker + S3 fs) | [hub.docker.com/r/apache/fluss-quickstart-flink/tags](https://hub.docker.com/r/apache/fluss-quickstart-flink/tags) |
| **arm64 manifest** | **是** — 以上两镜像均提供 `linux/amd64` + `linux/arm64` | 同上 — 每 tag 显示双架构 digest |

---

### D. Flink CDC 3.x 对 MySQL 8.4/8.0 的支持声明

| 项目 | 详情 | 证据 URL |
|------|------|---------|
| **MySQL 版本支持范围** | **MySQL 5.7, 8.0.x, 8.4+**；RDS MySQL / PolarDB / Aurora / MariaDB 同版本 | [nightlies.apache.org/flink/flink-cdc-docs-stable/docs/connectors/flink-sources/overview/](https://nightlies.apache.org/flink/flink-cdc-docs-stable/docs/connectors/flink-sources/overview/) — mysql-cdc 行：`MySQL: 5.7, 8.0.x, 8.4+` |
| **MySQL 官方 docker 镜像可选 tag** | `8.4` (LTS, 当前最新)、`8.0` (前一 LTS)、`latest` (= 9.7 创新版)、`9`、`lts` (= 8.4) — 均含 `linux/amd64` + `linux/arm64/v8` | [hub.docker.com/_/mysql/tags](https://hub.docker.com/_/mysql/tags) |
| **CDC binlog 兼容角度选型建议** | **选 8.4 (tag: `8.4` 或 `lts`)** — 为当前 LTS，CDC 明确列入 `8.4+`；若追求极致稳定可选 `8.0` 但 8.0 进入维护期 | 同上 |

---

### E. Redis 当前稳定版

| 项目 | 详情 | 证据 URL |
|------|------|---------|
| **官方镜像当前 latest** | **redis:latest = 8.10.1** (Debian trixie) | [hub.docker.com/_/redis](https://hub.docker.com/_/redis) — `8.10.1, 8.10, 8, 8.10.1-trixie, 8-trixie, latest, trixie` |
| **可用稳定 tag** | `8.10.1`、`8.10`、`8`、`latest`、`7.4` (旧 LTS) — 均含 `linux/amd64` + `linux/arm64/v8` | [hub.docker.com/_/redis/tags](https://hub.docker.com/_/redis/tags) |
| **建议** | **用 `redis:8.10` 或 `redis:8` 锁大版本** — 8.x 为当前主线，7.4 仅维护模式 | 同上 |

---

## 最终锁定版本组合表

### ✅ 主选组合 (推荐用于生产落地)

| 组件 | 版本 | Docker Image / Artifact | 证据 URL |
|------|------|------------------------|---------|
| **Flink** | **1.20.5** | `flink:1.20.5-scala_2.12` (官方) / `apache/fluss-quickstart-flink:1.20-0.9.1-incubating` (含 connector) | [flink.apache.org/downloads](https://flink.apache.org/downloads/)；[hub.docker.com/r/apache/fluss-quickstart-flink/tags](https://hub.docker.com/r/apache/fluss-quickstart-flink/tags) |
| **Flink CDC** | **3.6.0** | `flink-sql-connector-mysql-cdc-3.6.0.jar` 等 (Maven Central) | [flink.apache.org/2026/03/30/apache-flink-cdc-3.6.0-release-announcement/](https://flink.apache.org/2026/03/30/apache-flink-cdc-3.6.0-release-announcement/) |
| **Apache Paimon** | **2.0.0** | `paimon-flink-1.20-2.0.0.jar` (Maven Central) | [paimon.apache.org/docs/2.0/project/download/](https://paimon.apache.org/docs/2.0/project/download/) |
| **Apache Fluss** | **0.9.1-incubating** | `apache/fluss:0.9.1-incubating` (coordinator/tablet)<br>`apache/fluss-quickstart-flink:1.20-0.9.1-incubating` (Flink 集成) | [hub.docker.com/r/apache/fluss/tags](https://hub.docker.com/r/apache/fluss/tags)<br>[hub.docker.com/r/apache/fluss-quickstart-flink/tags](https://hub.docker.com/r/apache/fluss-quickstart-flink/tags) |
| **ZooKeeper** | **3.9.2** | `zookeeper:3.9.2` | Fluss quickstart compose 固定版本 |
| **Dinky** | **1.2.5-flink1.20** | `dinkydocker/dinky-standalone-server:1.2.5-flink1.20` | [hub.docker.com/r/dinkydocker/dinky-standalone-server/tags](https://hub.docker.com/r/dinkydocker/dinky-standalone-server/tags) |
| **MySQL** | **8.4 (LTS)** | `mysql:8.4` 或 `mysql:lts` | [hub.docker.com/_/mysql/tags](https://hub.docker.com/_/mysql/tags) |
| **Redis** | **8.10.1** | `redis:8.10` 或 `redis:8` | [hub.docker.com/_/redis](https://hub.docker.com/_/redis) |

> **架构兼容性**: 以上所有镜像/构件均提供 **linux/arm64** 支持，可直接在 Apple M1 宿主机运行。

---

### 🔄 备选组合 (若必须尝试 Flink 2.x 路线)

| 组件 | 版本 | 说明 | 阻碍点 |
|------|------|------|--------|
| Flink | 2.3.0 | 官方最新稳定版 | **Fluss 0.9.1 无 2.x connector** → 无法接入 Fluss |
| Flink CDC | 3.6.0 | 支持 2.2 | 可用 |
| Paimon | 2.0.0 | 有 flink-2.2 jar | 可用 |
| Fluss | **阻塞** | 0.9.1 仅 1.x connector | **无法使用** — 需等待 Fluss 1.0 / 0.10+ 发布 2.x connector |
| Dinky | 无 flink2.x tag | 当前最高 flink1.20 | 需自行构建或等待 Dinky 1.3+ |
| MySQL/Redis | 同上 | 无影响 | — |

**结论**: **备选组合在 2026-09 时点不可用**，核心阻碍为 Fluss connector 缺失。必须等待 Fluss 社区发布 Flink 2.x 兼容版本 (预计 0.10/1.0)。

---

## 关键决策点备忘

1. **Flink 版本由 Fluss 决定** — 这是全链路最硬约束
2. **Dinky 版本由 Flink 版本决定** — 必选 `*-flink1.20` tag，且 client 与集群版本严格对齐
3. **ZooKeeper 为 Fluss 强依赖** — 0.9 版本无去 ZK 选项，需在 compose/k8s 中部署
4. **MySQL 8.4 为 CDC 最佳搭档** — 明确列入支持矩阵且为当前 LTS
5. **Redis 8.x 为主线** — 7.x 仅维护模式，新建集群直接上 8

---

## 附录：版本获取命令速查

```bash
# Flink 1.20.5 (官方二进制)
wget https://dlcdn.apache.org/flink/flink-1.20.5/flink-1.20.5-bin-scala_2.12.tgz

# Paimon 2.0.0 flink-1.20 jar
wget https://repo.maven.apache.org/maven2/org/apache/paimon/paimon-flink-1.20/2.0.0/paimon-flink-1.20-2.0.0.jar

# Fluss 0.9.1 connector for Flink 1.20
wget https://repo1.maven.org/maven2/org/apache/fluss/fluss-flink-1.20/0.9.1-incubating/fluss-flink-1.20-0.9.1-incubating.jar

# Flink CDC 3.6 MySQL connector
wget https://repo1.maven.org/maven2/org/apache/flink/flink-sql-connector-mysql-cdc/3.6.0/flink-sql-connector-mysql-cdc-3.6.0.jar
```

---

*文档生成时间: 2026-09-04 | 数据源: 官网下载页、Maven Central、Docker Hub、GitHub Releases、官方文档站*