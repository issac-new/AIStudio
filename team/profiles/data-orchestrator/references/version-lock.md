# 数据栈版本锁定表 (version-lock)

> **单一事实源**。任何 worker 不得凭记忆改动版本;改版本必须先改此文件并 kanban_comment 上报 orchestrator。
> 锁定依据: 调研档案 `/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/data-team-research/version-matrix.md`（2026-09-04,全部官方一手来源）

## 锁定组合（主选）

| 组件 | 版本 | 镜像 / 构件 | 约束来源 |
|------|------|-------------|---------|
| **Flink** | **1.20.5** | `flink:1.20.5-java17` | Fluss 1.0.0 connector 支持 1.18/1.19/1.20/2.2/2.3;Dinky 1.2.5 仅 flink1.20 tag——仍是最硬约束 |
| **Flink CDC** | **3.6.0** | `flink-sql-connector-mysql-cdc-3.6.0.jar` | 支持 Flink 1.20.* 与 MySQL 5.7/8.0.x/8.4+ |
| **Paimon** | **2.0.0** | `paimon-flink-1.20-2.0.0.jar` (+ `paimon-flink-action-2.0.0.jar` 按需) | 同时有 1.20/2.0/2.1/2.2 后缀;配合 Flink 1.20 |
| **Fluss** | **1.0.0（GA）** | `apache/fluss:1.0.0`（amd64 digest `sha256:ff461b45...`）+ `fluss-flink-1.20-1.0.0.jar`（sha256 `656f7227...`）+ `fluss-fs-s3-1.0.0.jar`（sha256 `5226480e...`） | 2026-10-01 升级(t_7527ca0f): GA 去 `-incubating` 后缀;connector jar 入 Flink lib(`0-` 前缀 fs-s3 防类冲突);`remote.data.dirs` 新 key;升级笔记 fluss.apache.org/docs/maintenance/operations/upgrade-notes-1.0/ |
| **Fluss Gateway** | **1.0.0（preview）** | `apache/fluss-gateway:1.0.0`（amd64+arm64，2026-09-21 Hub 发布） | 2026-10-03 引入(gap-20260924-019): REST 元数据+DDL+批量写，**无读路径**（lookup/scan 不支持，FIP-32 查询网关未实现）；1.0 preview 仅 trust 模式→宿主端口只绑 127.0.0.1；compose profile `gateway` 默认不启；判定与实测证据 `life-workbench/gap_workspaces/gap-20260924-019/VERDICT.md` |
| **多语言客户端 SDK** | **pyfluss 1.0.0 / fluss-rs 1.0.0** | PyPI `pyfluss==1.0.0`（import 名 `fluss`）/ crates.io `fluss-rs 1.0.0`（Rust 核心 + PyO3/CXX 绑定，另有 fluss-cpp） | 2026-10-03 实测(gap-20260924-019): Python/Rust 均通本机 Fluss 1.0.0 集群（KV upsert/lookup/log append/scan/changelog 流式），写→poll 可见 106ms；读写分离定案——HTTP 写走 Gateway、语言原生读写走 SDK；宿主直连受限（tablet 广播容器名），SDK 容器须入 data-net |
| **ZooKeeper** | **3.9.5** | `zookeeper:3.9.5` | 2026-10-01 升级(t_a1f8e9ac)：修 CVE-2026-24308（配置值 INFO 级泄漏，3.9.2 在受影响范围 3.9.0-3.9.4）；Fluss 1.0 仍硬依赖 ZooKeeper；3.9.6 官网已发但 Hub 无 tag（禁自建） |
| **Dinky** | **1.2.5-flink1.20** | `dinkydocker/dinky-standalone-server:1.2.5-flink1.20` | client 与集群 Flink 版本必须严格对齐 |
| **MySQL** | **8.4.11** | `mysql:8.4.11` | 2026-10-01 锁定显式 patch tag(t_a1f8e9ac，Hub 最新 patch；此前浮动 `mysql:8.4`)；CDC 明确支持 8.4+;8.0 为备选 |
| **Redis** | **8.10.2** | `redis:8.10.2` | 2026-10-01 锁定显式 patch tag(t_a1f8e9ac，Hub 最新 patch；此前浮动 `redis:8.10`)；8.x 主线;7.4 仅维护模式 |

## 数据分析层（选型定稿 2026-10-01，t_76110d66 POC 裁决）

> POC 证据全文：`/Volumes/YOURVOLUME/lab/data-stack/poc/analysis-poc/POC-EVIDENCE.md`（双引擎 arm64 实测 + 同一 SQL 矩阵对账）。

| 组件 | 版本 | 镜像 / 构件 | 约束来源 |
|------|------|-------------|---------|
| **StarRocks（分析层主选）** | **4.1.4** | `starrocks/allin1-ubuntu:4.1.4`（arm64 digest `sha256:faf7ce9c24d9c29c9431b4e8cbd4bb7a74cd169907c63f0c5ebaacc7f9df276b`） | POC 实测（2026-10-01）：Paimon 2.0 湖读通、RustFS `aws.s3.*` 挂载通、Flink 端到端 12000 行落地；同矩阵查询快于 Doris。**Docker 禁用 4.1.0**（容器化 BE 缺陷，官方要求 ≥4.1.1） |
| **Flink SR Connector** | **1.2.15_flink-1.20** | `flink-connector-starrocks-1.2.15_flink-1.20.jar`（入 `./jars/`） | 与 Flink 1.20.5 对齐；批链路必须 at-least-once + `load-url` 走 feproxy:8080 + `buffer-flush.max-rows≥64000`（POC 三坑，见证据文件 §3） |
| 分析层红线 | ① Paimon catalog 为**只读**（写回不支持，SR/Doris 同）② 性能数字仅 12000 行 warm 指示性，容量规划前须补 100 万行基准 ③ POC 双服务仅 profile 启动（`--profile sr-poc` / `--profile doris-poc`），默认不进生产栈 | | POC-EVIDENCE.md §5–6 |
| **对象存储** | **RustFS 1.0.0 GA** | `rustfs/rustfs:1.0.0`（arm64 digest `sha256:8cc98017...f4d1ff`） | 2026-09-30 MinIO→RustFS 迁移(t_ee19bffa): 首个 GA 版,S3 兼容,三桶同名切换;决策与验收见 `/Volumes/YOURVOLUME/lab/data-stack/references/migration-20260930/DESIGN.md` |

> 对象存储变更记录: MinIO(RELEASE.2025-09-07T16-13-09Z) → RustFS 1.0.0,2026-09-30 生效。升级 RustFS 须走本文件流程: 官方 GA 确认 + digest 记录 + 三桶 E2E 复验(探针见 migration-20260930/RUNBOOK.md)。禁止 beta/alpha/rc 锁定。~~Fluss 1.0 升级时复验 fluss-fs-s3 与 flink-shaded-hadoop 的类冲突根修(`0-` 前缀排序)是否仍需保留。~~ → 已复验(2026-10-01,t_7527ca0f): `0-` 前缀根修**仍需保留**——flink-shaded-hadoop-2-uber 2.8.3 仍在 lib,先于它加载 fluss-fs-s3(内嵌 hadoop 2.10)的排序约束不变;wrapper 已通配任意版本 `fluss-fs-s3-*.jar`。

## Doris 候选（Agentic AI 数据闭环 · 待 GA，2026-09-24 融合登记）

> 依据：Doris roadmap github.com/apache/doris/issues/66418 + 微信文章《Doris + Paimon 2.0 构建 Agentic AI 数据闭环》（2026-09-24）。机制细节见 `doris-lakehouse.md`。
> **POC 复核（2026-10-01，t_76110d66）**：官方 release 页只维护 4.1/4.0，4.2 至今未发布（原「2026-09 底 GA」预期落空）→ gap-20260924-001 维持开放。

| 组件 | 版本状态 | 镜像 / 构件 | 约束来源 |
|------|----------|-------------|---------|
| **Apache Doris** | **4.2 未发布（2026-10-01 核实，release 页仅 4.1.3/4.0.8）** — GA 后方可锁定；当前仅作分析层候选二（POC 已实测 4.1.3，见 `poc/analysis-poc/POC-EVIDENCE.md`） | POC 镜像 `apache/doris:all-in-one-4.1.3`（arm64 digest `sha256:82a5cabc7900ebcd3d080412d636c0cebd6602799fffe2605c652b2ea7d42609`，profile `doris-poc`） | Paimon 写回/Variant 是 4.2 能力（roadmap #65086） |
| **兼容性红线（POC 实测更新）** | Doris 4.1.3 内置 Paimon SDK=**1.3.1**（旧登记 1.0.0 已过时；官方文档：4.1.4 起 1.4.2）——**读**本机 Paimon 2.0.0 湖表实测通；**写回实测 FAILED**（`insert data to PaimonExternalCatalog is not supported`，与官方声明互证） | 升级 Doris 时仍须核对内置 SDK 与 paimon-flink-1.20-2.0.0.jar 兼容性 | Paimon Catalog 官方文档 + POC 实测（2026-10-01） |

- **禁止**：Doris 4.2 GA 前把 doris 服务启动进生产 compose 默认 profile（现为 `profiles: [doris]`，默认不启动）；GA 后走下方升级流程再锁定版本。POC 服务独立 `profiles: [doris-poc]`，不受此限（只读测试用）。
- **POC 发现（Flink 对接）**：all-in-one 容器 BE 以 loopback 注册，Stream Load 307 跨容器不可达；`PRIORITY_NETWORKS` 旋钮会卡死 entrypoint（BE 不启动）——已回退。复测时优先试 connector `benodes` 显式出口。
- **.env 僵尸值修复（2026-10-01，t_a1f8e9ac）**：`DORIS_VERSION=4.2.0` 为 Hub 无此 tag 的占位值（致 `--profile doris` 起不来）→ 改 **4.1.4**（Hub tag `fe-4.1.4`/`be-4.1.4` 实证存在，amd64 digest `sha256:3cbfc9b6...`/`sha256:08c139f3...`；`fe-4.2.0` Hub API 404 实证）；profile 隔离未破坏（`profiles: [doris]` 默认不启），服务本次未启动。
- 验证钩子：gap-20260924-001（GA 后部署+读写回环实测）。

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

> **前置准入（2026-10-03 起，gap-20260925-021）**：Paimon/Fluss 相关制品升级必须先过《升级风险清单》四门（RC→GA 判据 / KEYS 签名校验 / 引擎兼容矩阵 / 回滚预案 100% 覆盖），清单全文与校验脚本：`life-workbench/gap_workspaces/gap-20260925-021/upgrade-risk-register.md`（含 `verify-artifact.sh`，端到端 6 例验证）。不过门禁不得进入下方第 3 步。
> **评估流程准入（2026-10-08 起，gap-20260929-016）**：Paimon/Fluss **大版本**升级必须先走《升级评估 checklist》五阶段（触发→SLA：GA 后 ≤7 天出 go/no-go、全流程 ≤2 人日→分诊/桌面评估/沙盒试跑/判定/留档），判定枚举 ADOPT/WAIT/HOLD/REJECT；常规 patch 免评估直走本流程。流程/模板/RACI：`references/upgrade-eval-checklist.md`；RC/GA 动态巡检：`/Volumes/YOURVOLUME/lab/data-stack/scripts/rc-watch.sh`（每日三信源，事件行 `RC_EVENT component=… version=… kind=… sources=…`，基线同目录 json；雷达文本不作版本事实源——2026-09-29 雷达「2.1.0-rc3」经三信源核伪不存在，见 gap workspace EVIDENCE-rc-watch.md）。
> **新组件引入准入（2026-10-03 起，gap-20260922-021）**：新组件首次引入（含孵化期/预发布组件）必须先过《孵化期组件引入门禁》三查（治理状态 / API 稳定性 / 升级回滚），清单全文与 Fluss 1.0.0 实评结论（ADOPT）：`life-workbench/gap_workspaces/gap-20260922-021/incubation-intake-gate.md`。分工：新组件引入走引入门禁三查，在栈组件升级走上方《升级风险清单》四门——任一不过不得执行下方第 3 步。

1. 查上游 release notes 确认兼容矩阵 → 2. 修改本文件（kanban_comment 说明依据） → 3. 改 `.env` → 4. `scripts/backup.sh` → 5. `docker compose up -d`（复用外挂卷） → 6. 验收（健康检查 + 数据对账） → 7. 回滚预案留存 → 8. **本文件四 profile 副本同步（arch/flink/infra/orchestrator，md5 必须一致）**——历史缺口实证：2026-10-01 Fluss 1.0.0/ZK/MySQL 升级仅同步 infra/orch，arch/flink 副本停在 09-24（Fluss 0.9.1-incubating 旧表），2026-10-08（t_62938841）补同步并固化本步

### 制品签名 key 登记（供升级时比对发布者是否变更）

| 项目 | CODE SIGNING KEY | 首次登记 |
|------|-----------------|---------|
| Apache Fluss | `Jark Wu <jark@apache.org>`，RSA `E2C45417BED5C104154F341085BACB5AEFAE3202`（KEYS：downloads.apache.org/fluss/KEYS） | 2026-10-03（1.0.0-src 实测 Good signature） |
| Apache Paimon | `Jingsong Lee <lzljs3620320@apache.org>`，RSA `CBA5C750775A96E5C882152E27F40881EEED6107`（KEYS：downloads.apache.org/paimon/KEYS；同 key 签 Maven Central jar） | 2026-10-03（2.0.0-src + paimon-flink-1.20 jar 实测 Good signature） |

## 证据锚点（官方一手）

- Fluss supported Flink versions: https://fluss.apache.org/docs/engine-flink/getting-started/
- Flink CDC 兼容表: https://nightlies.apache.org/flink/flink-cdc-docs-stable/docs/connectors/flink-sources/overview/
- Paimon download: https://paimon.apache.org/docs/2.0/project/download/
- Dinky docker tags: https://hub.docker.com/r/dinkydocker/dinky-standalone-server/tags
- MySQL/Redis tags: https://hub.docker.com/_/mysql/tags , https://hub.docker.com/_/redis/tags
