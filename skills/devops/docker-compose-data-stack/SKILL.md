---
name: docker-compose-data-stack
version: 1.1.0
description: "实时数仓 Docker 栈(Flink/MinIO)部署排障. 触发: 数据栈运维."
metadata:
  hermes:
    tags: [devops, docker, flink, data-stack, arm64, minio]
    related_skills: [design-doc-sync-audit, multi-board-team-deployment]
---

# 数据栈 Docker 部署运维（docker-compose-data-stack）

> 来源：2026-09-04 全天三轮实战（团队组建→Dinky 补齐→存储层统一 S3→设计文档同步）。
> 部署根：`/Volumes/YOURVOLUME/lab/data-stack/`（compose + .env + scripts/ + jars/ + flink-plugins/s3/ + volumes/）。

## 版本锁定（唯一事实源：`~/.hermes/profiles/data-infra/references/version-lock.md`）

Flink 1.20.5-scala_2.12 / Fluss 0.9.1-incubating（硬依赖 ZK 3.9.2）/ Flink CDC 3.6.0-1.20 / Paimon 2.0.0 / Dinky 1.2.5-flink1.20 / MySQL 8.4 LTS / Redis 8.10 / MinIO RELEASE-2025-09。Flink 2.3.0 官方最新但被 Fluss connector 排除（记备选）。所有版本结论以官方一手文档为据，禁止凭记忆。

## 核心架构决策（勿回退）

- **存储双层制**：湖仓数据（Paimon warehouse / Fluss remote / Flink checkpoint）统一入 MinIO S3 三桶（paimon-warehouse / fluss-remote / flink-checkpoints）；MySQL/Redis/ZK/MinIO 自身仍 bind-mount `volumes/`（防容器更新损坏）。
- **MinIO 而非 RustFS**：MinIO 有 Fluss 官方整篇教程 + Paimon 文档点名 + Flink plugin 原生 + arm64 原生；RustFS 要求 STS AssumeRole、社区验证少。两者 S3 协议一致，切换只改 endpoint。
- **arm64 硬约束**：所有镜像 `docker pull --platform linux/arm64` 强制原生 manifest；aityp SWR 仅 amd64（备选）。

## 坑清单（实测排雷，全部复现过）

### Flink
- **s3 plugin 必须放 `plugins/s3/` 目录结构**（挂载 `flink-plugins/s3/` → `/opt/flink/plugins/s3/`），不能扔 lib（类冲突）。
- **jar 持久化根治**：手动 docker cp 进 lib 的 jar 重建即丢。`scripts/flink-entrypoint.sh` wrapper 启动时从 `/opt/flink/lib-extra/` 拷入再 `exec /docker-entrypoint.sh "$@"`（注意：flink 镜像入口是根目录 `/docker-entrypoint.sh`，写 `/opt/flink/bin/entrypoint.sh` 会 exit 127 重启循环）。
- **sql-client -f 铁律**：新会话必须同文件内先 `CREATE CATALOG` 再用（无 catalog 的 INSERT 直接 Cannot find table）；读表必须 `SET execution.runtime-mode=batch;` + `SET sql-client.execution.result-mode=TABLEAU;`（non-interactive 硬性要求，缺了直接拒执行）。
- **docker exec 传 SQL 引号地狱**：`bash -c "printf ..."` 双层引号必吃单引号（ParseException: Encountered "type"）。正解：宿主机写 SQL 文件 → `docker cp` → 容器内执行。

### MinIO / S3
- **.env MINIO_IMAGE 必须纯 tag**：compose 用 `image: minio/minio:${MINIO_IMAGE}`，写成全镜像名会静默不建容器。
- **建桶不用 mc 独立镜像**（限流）：minio 容器自带 `/usr/bin/mc`，`docker exec minio mc mb local/<bucket>`。
- **凭证核验不回显明文**：`docker exec minio sh -c 'mc alias set t http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc ls t/<bucket> && echo CREDS_OK'`。
- **Paimon S3 catalog 键**：`'warehouse'='s3://<bucket>/warehouse'` + `'s3.endpoint'='http://minio:9000'` + `'s3.path.style.access'='true'` + access/secret key。

### Fluss
- **remote tiering 是集群级自动行为**（`remote.data.dir=s3://fluss-remote/` + s3 五项 env），表级 `table.log.remote` 选项会报 "older Fluss cluster that does not support this property"。
- **桶空三因排查链**：① `kv.snapshot.interval=0s` 禁用了快照（恢复默认 10min）；② `remote.log.task-interval-duration` 默认 1min 只扫已滚动 segment；③ `segment.bytes` 默认 1GB，测试数据量不触发滚动——调小或写足数据。
- **healthcheck**：容器 sh 无 /dev/tcp，必须 `CMD bash -c` 且探测容器 IP（`hostname -i`）而非 localhost。

### Dinky
- 首启 `ClassNotFoundException: com.mysql.cj.jdbc.Driver` → 挂 mysql-connector-j-8.4.0.jar 入 `/opt/dinky/lib/`。
- seed 密码哈希逆向不值 → 直接 `UPDATE dinky_user.password = md5('admin')`（提醒用户 UI 改密）。
- 集群注册 REST save 端点逆向 2 次失败即止损（SPINNING 判定），UI 操作仅 1 分钟。

### MySQL（Mac bind-mount）
- 必须显式 `--lower-case-table-names=2`（init 与 server 阶段不一致起不来）；半初始化 datadir 先清再重建。

## 验证命令速查

```bash
# 全栈状态（过滤无关容器）
docker ps --format '{{.Names}}\t{{.Status}}' | grep -vE "rsshub|hindsight|synapse"
# 三桶对象计数
for b in paimon-warehouse fluss-remote flink-checkpoints; do docker exec minio mc ls --recursive local/$b 2>/dev/null | wc -l; done
# Flink 作业
curl -s http://localhost:8081/overview
# compose 配置合法性
docker compose --env-file .env config --quiet
```

## 镜像拉取通道（限流时的决策树）

1. 官方源 `docker pull --platform linux/arm64 <img>`（主通道，强制正确 manifest）
2. aityp 华为云 SWR：`swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/<org>/<img>:<tag>`（查 https://docker.aityp.com/ ，仅 amd64）
3. xuanyuan/daocloud 免费源对部分 org 限流/白名单外（"免费节点当前繁忙"），失败属常态勿重试
4. compose pull 前先 `docker images` 对账——已拉过的镜像重复 pull 是无效功（digest 未变时零效果）

## 文档同步联动

架构级变更（存储层/新组件/新桶）落地后，按 `design-doc-sync-audit` skill 同步：DEPLOYMENT_STATUS.md / README.md / version-lock.md / 主设计文档（§4.2.10 data 团队范式，7 类位置），并跑五件套口径扫描。