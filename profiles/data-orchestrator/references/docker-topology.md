# Docker Compose 单机集群部署拓扑方案（7 组件容器化部署事实调研）

> 调研时间：2026-09-04 · 数据均来自官方文档当日抓取，锚点见各节
> 宿主：macOS arm64 (M1 Pro/32GB)，Docker VM 限额 8C/12G；同机已跑 rsshub / synapse / hindsight-db（约 2–3G）
> 分工：**版本兼容矩阵由并行调研代理负责**，本文只引用官方 quickstart 当前使用的版本号；本文负责容器化部署事实（镜像/架构/卷/端口/环境变量/内存）。

---

## 1. Executive Summary

- **6 个服务进程镜像**：Flink（官方 `flink`）、Fluss（`apache/fluss` 0.9.1）、ZooKeeper（Fluss 0.9.1 **仍必需**）、MySQL（`mysql`）、Redis（`redis`）、Dinky（`dinkydocker/dinky-standalone-server`）。
- **无独立服务的 2 个组件**：Paimon = bundled jar 拷入 Flink `lib/`；Flink CDC = connector jar 拷入 `lib/` +（pipeline 模式）`bin/flink-cdc.sh` + YAML。
- **arm64 风险点**：Dinky 官方文档无 arm64 说明（必须 `platform: linux/amd64` + QEMU）；`apache/fluss` 镜像架构官方未声明。本机 Docker Hub/registry 直连被网络重置，manifest 级实测未完成 → 一律标注**需实测**，给出一行验证命令。
- **内存预算**：为数据栈保留 ~9GB（限值合计 ~10.7G 为上限、实际驻留约 6–7G），与既有 2–3G 负载共存于 12G VM。

---

## 2. Findings：逐组件部署事实

### 2.1 Apache Flink（Session 模式）

来源：<https://nightlies.apache.org/flink/flink-docs-stable/docs/deployment/resource-providers/standalone/docker/>

- 官方镜像双渠道：Docker Hub 官方 `flink`（推荐，Docker 审核）与 `apache/flink`（Flink 团队维护，tag 同步）。官方建议 tag 显式带 Scala 版本，如 `flink:1.20.2-scala_2.12`（文档示例 `flink:2.3.0-scala_2.12`）。
- 官方 quickstart 即 Docker Compose：Session 模式 = `command: jobmanager` + `command: taskmanager`（`scale: N`），配套 `sql-client` 服务（`command: bin/sql-client.sh`）；交互参数走 `FLINK_PROPERTIES` 多行环境变量（`jobmanager.rpc.address: jobmanager` 等）。
- 加连接器 jar 的官方姿势 = 扩展镜像：`FROM flink:2.3.0-scala_2.12` + `RUN wget -P /opt/flink/lib <connector-url>`（文档 Kafka connector 示例）。
- 作业产物挂 `/opt/flink/usrlib`（Application 模式）；插件注入环境变量 `ENABLE_BUILT_IN_PLUGINS`；内存分配器默认 jemalloc，异常时可 `DISABLE_JEMALLOC=true`。
- 多架构：官方 flink-docker 仓库（github.com/apache/flink-docker）为多架构构建（amd64+arm64）；本机未实测 manifest（registry 网络不可达）→ **需实测**：`docker manifest inspect flink:1.20.2-scala_2.12`。

### 2.2 Apache Fluss（coordinator + tablet + **ZooKeeper**）

来源：<https://fluss.apache.org/docs/install-deploy/deploying-with-docker/> 、quickstart <https://fluss.apache.org/docs/quickstart/flink/>

- **0.9.1 官方 docker compose 仍包含 zookeeper:3.9.2**（zookeeper.address 必填），0.x 未去 ZK；next(1.0-SNAPSHOT) 文档同样保留。
- 服务镜像 `apache/fluss:0.9.1-incubating`（官方 deploy 文档当前版本），入口命令 `coordinatorServer` / `tabletServer`，配置全部通过 `FLUSS_PROPERTIES` 多行 env 注入。
- 官方 compose 关键属性（逐字取自文档）：
  - coordinator：`bind.listeners: INTERNAL://coordinator-server:0, CLIENT://coordinator-server:9123`、`advertised.listeners: CLIENT://localhost:9123`、`internal.listener.name: INTERNAL`、`remote.data.dir: /tmp/fluss/remote-data`
  - tablet-N：`tablet-server.id: N`、`bind.listeners: INTERNAL://tablet-server-N:0, CLIENT://tablet-server-N:9123`、host 侧 9124/9125/9126 映射、`kv.snapshot.interval: 0s`、`data.dir: /tmp/fluss/data/tablet-server-N`
- 官方 compose 用 tmpfs 卷挂 `/tmp/fluss`（演示用）；生产/持久化改为 named volume 或宿主 bind。
- 远程数据（tiered storage）官方两条路：本地目录 `remote.data.dir`，或 S3 兼容（quickstart 用 RustFS + `s3.endpoint/s3.access-key/...`）。
- Flink 侧连接器：quickstart 镜像 **`apache/fluss-quickstart-flink:1.20-0.9.1-incubating`**（基于 Flink 1.20）已打包 Fluss Flink connector + flink-faker + S3 filesystem，免手工下载 jar；自建镜像则需 `flink-connector-fluss-*.jar` 入 lib。
- 端口：9123（coordinator client），tablet 内部同为 9123（容器间互通，宿主映射错开）。9123 是私有 RPC 协议，**无 HTTP /health**，healthcheck 用 bash `/dev/tcp` 探活。
- 多架构：官方未声明 → **需实测**：`docker manifest inspect apache/fluss:0.9.1-incubating`；quickstart-flink 镜像据二手来源基于 flink:1.20（上游多架构），其自身架构同样需实测。

### 2.3 Apache Paimon（无服务，jar 入 Flink lib）

来源：<https://paimon.apache.org/docs/master/flink/quick-start/>（及 1.2 稳定版文档）

- 部署形态：`paimon-flink-<flink大版本>-<paimon版本>.jar`（bundled，读写用）拷入 `<FLINK_HOME>/lib/`；需要手动 compaction 等动作时另加 `paimon-flink-action-<ver>.jar`；本地文件系统 catalog 建议配 `flink-shaded-hadoop-2-uber-*.jar`（官方 quick-start Step 3）。
- 版本支持面（1.2 文档）：Flink 2.0/1.20/1.19/1.18/1.17/1.16/1.15；master 另有 flink-2.1/2.2 构件（Maven 元数据已核对）。具体选哪个由版本矩阵代理定。
- Docker 化：并入 2.1 的扩展镜像 Dockerfile（COPY 进 `/opt/flink/lib/`）。
- 数据目录：catalog `'warehouse' = 'file:///opt/flink/paimon'` → 该路径挂 named volume 即持久化（路径名可自定，本文统一 `/opt/flink/paimon`，对应官方 `warehouse` 概念）。
- 无 arm64 问题：纯 jar，随 Flink 容器跑。

### 2.4 Flink CDC（jar + pipeline connector，无服务镜像）

来源：<https://nightlies.apache.org/flink/flink-cdc-docs-release-3.3/zh/docs/get-started/quickstart/cdc-up-quickstart-guide/> 、mysql-to-kafka quickstart（3.5）

- 官方运行态没有"CDC 服务器镜像"：两种官方玩法：
  1. **CdcUp playground**（`git clone apache/flink-cdc` → `cd tools/cdcup/ && ./cdcup.sh init|up`）自动生成 docker-compose 环境，属开发/演示定位；
  2. **常规部署**：Flink 集群 `lib/` 放 source connector jar（如 `flink-sql-connector-mysql-cdc-3.x.jar`）；pipeline（整库同步/YAML 路由）另需 `flink-cdc-dist` 发行包（提供 `bin/flink-cdc.sh` + `flink-cdc-pipeline-connector-*` jar）。
- 与 Paimon 整合同理：`flink-cdc-pipeline-connector-paimon`（3.x）或 SQL 侧 mysql-cdc source + paimon sink。
- MySQL 源端前提（官方 quickstart 惯例）：binlog 开启、`binlog_row_image=FULL`、复制账号（REPLICATION SLAVE/APPLE）；MySQL 8.0/8.4 默认已开 binlog，compose 里显式补 `--log-bin/--binlog-row-image=FULL/--server-id` 保险。
- 无 arm64 问题：纯 jar。

### 2.5 Dinky（standalone-server 镜像 + 元数据库）

来源：<https://www.dinky.org.cn/docs/1.1/deploy_guide/docker_deploy/>

- 镜像 `dinkydocker/dinky-standalone-server:1.1.0-flink1.17`（1.1 文档原文 tag；阿里云加速前缀 `registry.cn-hangzhou.aliyuncs.com/dinky`）。更新的 1.2.x tag 存在于 Hub 但未在官方文档核到 → 用哪个**需实测/由版本代理定**。
- 两种元数据库模式：默认内嵌 H2 零依赖启动；生产用外部 MySQL：`DB_ACTIVE=mysql` + `MYSQL_ADDR` / `MYSQL_DATABASE` / `MYSQL_USERNAME` / `MYSQL_PASSWORD`（注意是 `MYSQL_USERNAME`，Dinky 特有拼写）。
- 自定义 jar 挂载点（官方）：宿主目录 → `/opt/dinky/customJar/`；Dinky 内嵌 Flink 与外部 Flink 集群并存（1.1 镜像绑 flink1.17，对接更高版本外部集群有 planner jar 手工替换问题，官方文档明示）。
- 端口 8888（Web UI）。反代时需支持 SSE（`proxy_buffering off` 等，官方 Nginx 配置）。
- **arm64：文档零提及 → 按 amd64-only 处理，`platform: linux/amd64`**。代价：Docker Desktop/OrbStack QEMU 仿真——启动慢约 2–3×、JVM JIT 无 arm64 热路径、CPU 开销 +15–20%、偶发 segfault 风险；32GB 机器内存成本不变。写法见 compose 骨架 dinky 服务。
- 镜像架构实测命令：`docker manifest inspect dinkydocker/dinky-standalone-server:1.1.0-flink1.17`。

### 2.6 MySQL（官方镜像）

- `mysql:8.4`（LTS）或 8.0；官方镜像多架构（含 linux/arm64，Docker Hub library 页长期声明）。
- 数据目录 `/var/lib/mysql`；初始化 env：`MYSQL_ROOT_PASSWORD`（必填）、`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`。
- 为 CDC 追加 flags：`--log-bin=mysql-bin --binlog-row-image=FULL --server-id=1 --character-set-server=utf8mb4`。
- 8.4 默认 `caching_sha2_password`：新版 CDC connector 支持；旧客户端需注意。

### 2.7 Redis（官方镜像）

- `redis:7.4`（或 `7-alpine`）；官方镜像多架构（amd64+arm64）。
- 持久化目录 `/data`，`--appendonly yes` 开 AOF；口令走 `--requirepass`。
- 宿主 6379 可能与既有服务冲突（hindsight 栈如占 6379）→ compose 映射 `16379:6379`，容器内仍 6379。

---

## 3. 拓扑与端口规划

```
Docker network: data-net (bridge)
service            container            host→container            数据卷
zookeeper          zookeeper            2181→2181                 zk-data:/data, zk-logs:/datalog
coordinator-server fluss-coordinator    9123→9123                 fluss-remote:/tmp/fluss/remote-data
tablet-server-0    fluss-tablet-0       9124→9123                 fluss-data-0:/tmp/fluss/data/tablet-server-0
tablet-server-1    fluss-tablet-1       9125→9123                 fluss-data-1:/tmp/fluss/data/tablet-server-1
jobmanager         flink-jobmanager     8081→8081                 flink-ckpt:/opt/flink/checkpoints, flink-sp:/opt/flink/savepoints, flink-warehouse:/opt/flink/paimon
taskmanager        flink-taskmanager    —(内部)                   同上共享卷
sql-client         flink-sql-client     —(交互)                   —
mysql              mysql                3306→3306                 mysql-data:/var/lib/mysql
redis              redis                16379→6379                redis-data:/data
dinky              dinky                8888→8888                 ./dinky-customJar:/opt/dinky/customJar
```

冲突核对：synapse 8008/8448、rsshub 1200、hindsight-db 5432 均不占用上表端口；6379/2181/3306/8888 up 前用 `lsof -iTCP -sTCP:LISTEN` 复核。

## 4. 内存预算（VM 12G，既有负载占 2–3G）

| service | process/limit | 说明 |
|---|---|---|
| jobmanager | 1024m / limit 1.2G | FLINK_PROPERTIES `jobmanager.memory.process.size` |
| taskmanager | 2048m / limit 2.5G | 官方 fluss quickstart 同款 `taskmanager.memory.process.size: 2048m` + off-heap 256m；slots 4 |
| fluss coordinator | limit 0.8G | 官方未给 JVM 参数文档 → 先限容器，JVM 调优需实测 |
| fluss tablet ×2 | 各 limit 0.8G | 同上 |
| zookeeper | limit 0.4G | |
| mysql | limit 1G | innodb_buffer_pool 512M |
| redis | limit 0.4G | maxmemory 256mb |
| dinky | limit 1.5G | amd64 仿真，JVM 参数 env 支持情况需实测 |
| **合计（限值）** | **~10.6G** | 实际驻留预计 6–7G，为 12G VM 留 headroom |

## 5. arm64 结论清单

1. Flink / MySQL / Redis / ZooKeeper：官方镜像多架构，可原生 arm64（manifest 层面本机未复核，`docker manifest inspect` 一行可验）。
2. Paimon / Flink CDC：纯 jar，无架构问题。
3. Fluss server：官方文档未声明 → 需实测；若 amd64-only，代价与 Dinky 同级（QEMU）。
4. Dinky：按 amd64-only 处理，`platform: linux/amd64` + QEMU（启动慢 2–3×、CPU +15–20%）；若不可接受，替代 = 放弃 Dinky 用 Flink SQL Client + REST。

## 6. Recommendations（落地顺序）

1. `mkdir -p dinky-customJar jars` → 按附录 Dockerfile 预下载 Paimon/CDC/Fluss connector jar 到 `./jars/`（tag 由版本代理给）。
2. `docker compose build`（构建 flink-lakehouse 扩展镜像）→ `docker compose up -d`。
3. 验收：Flink UI 8081（1 JM+1 TM/4 slots）；`echo ruok | nc localhost 2181` = imok；tablet 日志出现注册 coordinator 记录；Dinky 8888 可登录（默认账号见官方文档，勿沿用传言口令）；`redis-cli -p 16379 ping`。
4. JAR 注入核对：`docker exec flink-jobmanager ls /opt/flink/lib | grep -E "paimon|cdc|fluss"`。
5. 实测两处架构后回填第 5 节结论。

## Methodology

- 官方文档直接抓取：Flink docker docs（stable）、Fluss deploy-with-docker + quickstart/flink（0.9.1）、Paimon quick-start（master/1.2）、Dinky 1.1 docker_deploy、Flink CDC 3.3/3.5 quickstart。三角验证：Fluss compose 属性同时出现在 deploy 文档与 quickstart 两处；Flink compose 结构与官方 Session Mode 示例一致。
- 未能完成：Docker Hub API / registry manifest 直连（网络重置），故所有 arm64 结论均保留"需实测"标注；未编造任何 tag——不确定处显式标出。
- 时效：2026-09-04 抓取；官方文档为 stable/当前 release 线，与版本矩阵代理的锁定版本可能有出入，以矩阵为准、本文给骨架。

## Appendix A：扩展镜像 Dockerfile（flink-lakehouse）

```dockerfile
FROM flink:1.20.2-scala_2.12
# jars/ 由版本矩阵代理给定的 jar 预先放好：
#   paimon-flink-<F>-<P>.jar          (Paimon bundled)
#   flink-shaded-hadoop-2-uber-*.jar  (本地 FS catalog)
#   flink-sql-connector-mysql-cdc-3.x.jar 或 flink-cdc-pipeline-connector-*.jar
#   flink-connector-fluss-*.jar       (若不用 quickstart-flink 镜像)
COPY ./jars/*.jar /opt/flink/lib/
```
