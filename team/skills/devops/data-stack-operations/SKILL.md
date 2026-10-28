---
name: data-stack-operations
description: "Use for data 栈(Flink/Paimon/Fluss/MinIO)运维与排障。"
version: 1.2.0
metadata:
  hermes:
    tags: [data, docker, flink, paimon, fluss, minio, ops]
    related_skills: [scale-adaptive-routing, hermes-docker-sandbox]
---

# data-stack-operations — 实时数仓 Docker 栈运维

> 栈上线 2026-09-04（data 团队配套运行栈）。部署根 `/Volumes/nvme2230/lab/data-stack/`，
> 10 常驻服务 + 一次性 minio-init。配套文档：`~/.hermes/profiles/data-infra/references/version-lock.md`
>（单一事实源）、设计文档 `research/hermes-complete-design-doc.md` §4.2.10。

## 触发条件 / When to Use

- data 栈容器排障、增删服务、版本升级、备份恢复
- Paimon/Fluss/Flink on MinIO(S3) 读写调试
- 为 data 板 worker（data-arch/flink/infra）写任务卡时核对版本与红线

## 版本锁定（2026-09-04，官方一手证据，改版先查 version-lock.md）

Flink **1.20.5**-scala_2.12（上限被 Fluss connector 锁死，2.x 是备选路线）/ Fluss **1.0.0**（仍配 ZK）/
CDC **3.7.0-1.20**（SQL-only 形态，2026-10-14 升级；pipeline connector jar 禁装主栈，见坑 8/9 与 CDC 升级节）/
Paimon **2.1.0**（2026-10-14 生产切换，见下节）/ Dinky **1.2.5-flink1.20** / MySQL **8.4** LTS / Redis **8.10** / ZK **3.9.5** /
RustFS 1.0.0（S3 对象存储，原 MinIO RELEASE.2025-09-07 已替换）。

**Paimon 2.0.0 → 2.1.0（2026-10-14 切换完成，判定 ADOPT）**：四阶段评估流水线全过
（GA 判据 / 制品三路校验 / 兼容矩阵 / 回滚预案 + 沙盒三表回归零失败、checkpoint 跨版本恢复 3 形态 PASS）。
判定全文：`~/hermes-docker-sandbox/workspace/life-workbench/gap_workspaces/gap-20261014-001-paimon21-upgrade/VERDICT.md`。
- Paimon 2.1 官方支持 Flink 1.16-1.20 / 2.0-2.2，本栈 1.20.5 匹配
- 回滚基线：`backups/config-pre-paimon21-20261014/` + `rustfs-data-pre-paimon21-20261014.tar.gz`（635MB）
- 遗留复验（VERDICT 风险表 #1-#3）：Fluss 1.0.0 lake 路径读 2.1 表对账（medium）、SR/Doris POC 只读复测、能力项冒烟（low）
- 签名 key 轮换（Jingsong Lee → Hongbo Xiao）判发布经理正常轮换非供应链异常，已登记 version-lock 签名 key 表

**CDC 3.6.0 → 3.7.0（2026-10-14 切换完成，SQL-only 形态）**：沙盒全量回归零失败（三表 checksum 一致）后用户裁决落地主栈；
pipeline sink 路径因 connector 内嵌 Paimon SDK 2.0.0 与栈内 2.1.0 双份类冲突（ClassCastException 实证）维持 WAIT，
物理隔离=pipeline connector jar 禁装主栈，解除条件在判定文。
判定全文：`/Volumes/nvme2230/lab/data-stack/references/upgrade-eval/VERDICT-cdc37-202610.md`。
回滚锚：`jars/flink-sql-connector-mysql-cdc-3.6.0-1.20.jar.bak-*` + restart jobmanager/taskmanager

## 存储层：S3 对象存储（现 RustFS 1.0.0，容器 rustfs-sb；三桶不变）

| 桶 | 写方 | 内容 |
|---|---|---|
| paimon-warehouse | Paimon catalog | parquet/manifest/snapshot |
| fluss-remote | Fluss（镜像自带 fluss-fs-s3 插件） | kv snapshot + remote log segment |
| flink-checkpoints | Flink（flink-s3-fs-hadoop） | checkpoint/savepoint |

- **现状：存储层已切换 RustFS 1.0.0**（容器 rustfs-sb；PoC GO 后落地。S3 协议一致、静态 AK/SK 直连、STS 门槛消除；
  RustFS 侧必须 named volume，macOS bind-mount 会 FATAL）。PoC 报告：/Volumes/nvme2230/lab/data-stack/references/rustfs-poc-report.md
- 对象存储根凭证在 `.env`，**不是**默认值——SQL 里硬编码默认凭证会报 `S3Exception: Forbidden 403`。
  验证凭证（命令为 MinIO 时代形态，RustFS 换容器名与变量名同构执行）：
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
8. **entrypoint 的 cp 是覆盖式、不清多余文件——升级换 jar 必须同步从 `jars/` 移除旧版**：
   只添新版不删旧版，lib/ 里新旧并存，类路径按文件名排序旧版抢先加载，升级静默失效。
   每次 jar 升级后 `ls jars/ | grep <组件>` 必须只剩一个版本（旧版只留 .bak 回滚锚）
9. **connector fat jar 可能内嵌栈内已有库的第二份副本——部署前先 `unzip -l <jar> | grep -i <库名>` 查内嵌清单**：
   与 lib/ 现存版本双份共存，运行时 ClassCastException（实例：CDC pipeline connector 内嵌 Paimon SDK 2.0.0 vs 栈内 2.1.0）。
   物理隔离=不部署该 jar；上游对齐栈内版本前不引入

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
