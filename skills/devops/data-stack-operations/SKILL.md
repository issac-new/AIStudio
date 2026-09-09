---
name: data-stack-operations
description: "Use for data 栈(Flink/Paimon/Fluss/MinIO)运维与排障。"
version: 1.0.0
metadata:
  hermes:
    tags: [data, docker, flink, paimon, fluss, minio, ops]
    related_skills: [scale-adaptive-routing, hermes-docker-sandbox]
---

# data-stack-operations — 实时数仓 Docker 栈运维

> 栈上线 2026-09-04（data 团队配套运行栈）。部署根 `/Volumes/YOURVOLUME/lab/data-stack/`，
> 10 常驻服务 + 一次性 minio-init。配套文档：`~/.hermes/profiles/data-infra/references/version-lock.md`
>（单一事实源）、设计文档 `research/hermes-complete-design-doc.md` §4.2.10。

## 触发条件 / When to Use

- data 栈容器排障、增删服务、版本升级、备份恢复
- Paimon/Fluss/Flink on MinIO(S3) 读写调试
- 为 data 板 worker（data-arch/flink/infra）写任务卡时核对版本与红线

## 版本锁定（2026-09-04，官方一手证据，改版先查 version-lock.md）

Flink **1.20.5**-scala_2.12（上限被 Fluss connector 锁死，2.x 是备选路线）/ Fluss **0.9.1**-incubating（硬依赖 ZK）/
CDC **3.6.0-1.20** / Paimon **2.0.0** / Dinky **1.2.5-flink1.20** / MySQL **8.4** LTS / Redis **8.10** / ZK **3.9.2** /
MinIO RELEASE.2025-09-07。

## 存储层：MinIO 统一 S3（三桶）

| 桶 | 写方 | 内容 |
|---|---|---|
| paimon-warehouse | Paimon catalog | parquet/manifest/snapshot |
| fluss-remote | Fluss（镜像自带 fluss-fs-s3 插件） | kv snapshot + remote log segment |
| flink-checkpoints | Flink（flink-s3-fs-hadoop） | checkpoint/savepoint |

- **用户裁决（09-04）**：RustFS 挂起等 1.0 正式发布再评估；MinIO 为唯一存储层，不做双轨。
  两者 S3 协议一致，切换只改 endpoint（+RustFS 需 STS AssumeRole 凭证链）。
- MinIO 凭证在 `.env`（`MINIO_ROOT_USER/PASSWORD`），**不是** minioadmin 默认值——
  SQL 里硬编码 minioadmin 会报 `S3Exception: Forbidden 403`。验证凭证：
  `docker exec minio sh -c 'mc alias set t http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc ls t/<bucket>'`
- 旧本地卷 `volumes/flink/warehouse/`（file:// warehouse 冒烟残留）保留作对照，新数据全走 MinIO。

## 坑清单（每条都实测踩过）

1. **flink-s3-fs-hadoop 必须放 `plugins/s3/` 目录**（plugin 机制），放 lib/ 会类冲突
2. **kv.snapshot.interval=0s 会禁用 KV 快照**——快照不上 S3 的首查项；remote log tiering 是集群级自动
   （`remote.log.task-interval-duration` 默认 1min，只搬已滚动 segment；默认 segment.bytes=1GB 测试量不滚动）
3. **jar 手动 docker cp 进 lib，容器重建即丢**——已根治：`scripts/flink-entrypoint.sh` wrapper
   启动时把 `./jars/*.jar` 拷入 lib 再 `exec /docker-entrypoint.sh "$@"`（flink 镜像没有
   `/opt/flink/bin/entrypoint.sh`，写成它=exit 127 重启循环）
4. **sql-client heredoc 引号地狱**：`docker exec bash -c "...'type'...'"` 双层转义必坏 SQL。
   正确姿势：宿主机写 .sql 文件 → `docker cp` 进容器 → `sql-client.sh -f` 执行
5. **读批表必须** `SET execution.runtime-mode = batch;`，否则流式挂起；`-f` 文件模式还必须
   `SET sql-client.execution.result-mode = TABLEAU;`（non-interactive 硬性要求）
6. **无 catalog 的 INSERT 直接失败**：sql-client 每次启动是全新会话，先 `CREATE CATALOG ... WITH(...)`
   再操作表；表名以 `mc ls` 实测为准（曾把 smk.s3_t 记成 smoke.smoke_t）
7. Fluss healthcheck：容器 sh 无 /dev/tcp，须 `CMD bash -c` 且探测容器 IP 而非 localhost；
   MySQL bind-mount 须显式 `--lower-case-table-names=2`

## 镜像拉取通道

1. **官方源 `docker pull --platform linux/arm64` 强制**（绕过代理缓存的 amd64 层；
   Dinky arm64 RepoDigest sha256:41f2a0592d92…）
2. aityp 华为云 SWR（`swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/...`）仅同步 **amd64** 层，
   只当应急；xuanyuan/daocloud 免费节点**慢失败**（爬几分钟后报「繁忙」）——不原路重试，直接换通道
3. 拉前先 `docker images` 查本地（Dinky 曾冗余拉取两次，各烧十几分钟）
4. compose pull 后比对运行容器镜像 ID 与本地镜像 ID 判断是否真有更新

## Dinky 要点

- 宿主 **8889**→容器 8888（宿主 8888 被用户进程占用，勿动）
- 镜像不带 MySQL JDBC：`mysql-connector-j-8.4.0.jar` 挂 `/opt/dinky/lib/`
- seed 密码哈希不可逆 → DB 重置 `md5('admin')`，建议 UI 改密；token 走 `dinky-token` 响应头
- 集群注册/数据源配置留 UI 两步操作（REST save 端点逆向 2 次失败即止损，UI 仅 1 分钟）

## references

- `references/flink-agents-integration.md` — Flink Agents（流式 Agent OS）调研与集成路径（0.3.0 preview，
  要求 Flink ≥1.20.3 本栈满足；Fluss 可作 action state store 后端；等 0.4/1.0 再评估接入）
- `references/minio-s3-validation.md` — MinIO 存储层改造记录与端到端验证命令
