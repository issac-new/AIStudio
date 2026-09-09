# 数据栈版本锁定表 (version-lock)

> **单一事实源**。任何 worker 不得凭记忆改动版本;改版本必须先改此文件并 kanban_comment 上报 orchestrator。
> 锁定依据: 调研档案 `/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/data-team-research/version-matrix.md`（2026-09-04,全部官方一手来源）

## 锁定组合（主选）

| 组件 | 版本 | 镜像 / 构件 | 约束来源 |
|------|------|-------------|---------|
| **Flink** | **1.20.5** | `flink:1.20.5-scala_2.12` | Fluss 0.9.1 仅发布 1.18/1.19/1.20 connector——全链路最硬约束 |
| **Flink CDC** | **3.6.0** | `flink-sql-connector-mysql-cdc-3.6.0.jar` | 支持 Flink 1.20.* 与 MySQL 5.7/8.0.x/8.4+ |
| **Paimon** | **2.0.0** | `paimon-flink-1.20-2.0.0.jar` (+ `paimon-flink-action-2.0.0.jar` 按需) | 同时有 1.20/2.0/2.1/2.2 后缀;配合 Flink 1.20 |
| **Fluss** | **0.9.1-incubating** | `apache/fluss:0.9.1-incubating` | 硬依赖 ZooKeeper（0.x 未去 ZK,FIP-1 规划中） |
| **ZooKeeper** | **3.9.2** | `zookeeper:3.9.2` | Fluss 官方 quickstart compose 同款 |
| **Dinky** | **1.2.5-flink1.20** | `dinkydocker/dinky-standalone-server:1.2.5-flink1.20` | client 与集群 Flink 版本必须严格对齐 |
| **MySQL** | **8.4 LTS** | `mysql:8.4` | CDC 明确支持 8.4+;8.0 为备选 |
| **Redis** | **8.10.x** | `redis:8.10` | 8.x 主线;7.4 仅维护模式 |

## 备选组合

| 场景 | 方案 |
|------|------|
| 不用 Fluss | Flink 可升 2.3.0（Paimon/CDC 均支持 2.2+）;Dinky 仍无 flink2.x tag |
| MySQL 求稳 | `mysql:8.0`（前一 LTS,维护期） |

## 禁止

- 禁止 `latest` tag 进 compose
- 禁止 Dinky 内置 Flink 版本与集群版本错配（如 1.19 client → 1.20 cluster）
- 禁止跳过 ZooKeeper 部署 Fluss 0.9.x

## 升级流程

1. 查上游 release notes 确认兼容矩阵 → 2. 修改本文件（kanban_comment 说明依据） → 3. 改 `.env` → 4. `scripts/backup.sh` → 5. `docker compose up -d`（复用外挂卷） → 6. 验收（健康检查 + 数据对账） → 7. 回滚预案留存

## 证据锚点（官方一手）

- Fluss supported Flink versions: https://fluss.apache.org/docs/engine-flink/getting-started/
- Flink CDC 兼容表: https://nightlies.apache.org/flink/flink-cdc-docs-stable/docs/connectors/flink-sources/overview/
- Paimon download: https://paimon.apache.org/docs/2.0/project/download/
- Dinky docker tags: https://hub.docker.com/r/dinkydocker/dinky-standalone-server/tags
- MySQL/Redis tags: https://hub.docker.com/_/mysql/tags , https://hub.docker.com/_/redis/tags
