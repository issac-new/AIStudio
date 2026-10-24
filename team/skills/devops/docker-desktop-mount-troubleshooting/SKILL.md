---
name: docker-desktop-mount-troubleshooting
description: Diagnose Docker Desktop mac bind-mount failures fast
---

Docker Desktop on macOS 的 bind-mount/卷共享故障排查。触发：容器启动报 `error while creating mount source path '/host_mnt/...'`、`mkdir /host_mnt/...: file exists`、外置盘重新插拔或重挂载后容器起不来、「path is not shared from the host」。

## 第一步：先分流，再动手

报 `mkdir /host_mnt/...: file exists` 时**先看 VM 内部真实状态**再选择处置——两种模式修法完全不同，盲猜会烧掉多轮无效的 daemon 重启：

```bash
docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh -c \
  'ls -la /host_mnt/Volumes/; readlink /host_mnt/Volumes/<卷名>'
```

- **模式 A｜真实挂载但陈旧**：`/host_mnt/Volumes/<卷>` 存在且曾是真实挂载，仅内容失效（宿主卷重挂载后 virtiofs 共享缓存未刷新）→ 彻底重启 Docker Desktop **应用**：`osascript -e 'quit app "Docker"'` → `pkill -f "Docker Desktop"` → 确认进程退净 → `open -a Docker` → 轮询 `docker info` 就绪。
- **模式 B｜占位符符号链接**：看到 `<卷> -> ../host-mount-point-outside-of-authorized-share` → 文件共享**授权层**拒绝了这块卷（macOS 对外置/可移除卷有独立于文件共享列表的 TCC 授权，卷重挂载后授权失效）。**实测无效的路，不要再烧**：重启 daemon/整个应用无效；VM 重建（`docker desktop stop` / `start`）无效；向 `settings-store.json` 的 `FilesharingDirectories` 显式加卷无效（需先退出 Docker 才能改，改了也不通）——宿主后端在授权层直接拒绝导出，与共享配置无关。**「可移动的卷」TCC 授权即使已开启也可能仍失败**（2026-09-18 实测：用户确认 A 项已开、多轮重启后外置 bind 仍 exit=125）——不要在 TCC 开关上反复纠结，授权层从外置卷导出这条路在本环境已确认走不通，直接转「数据迁内置盘」。

## 模式 B 的出路（用户 GUI 可试，但别指望）

1. 系统设置 → 隐私与安全性 → 文件与文件夹 → Docker Desktop → 开「可移除的卷」（已开则关掉重开）→ 重启 Docker。**实测已开后仍可能无效**，若一轮 GUI 重开后绑定仍失败，别再烧轮次，转下节迁移。
2. Troubleshoot → Reset to factory defaults（可保留镜像）→ 重建共享层。注意会重置 VM 与镜像外的配置，需重新拉起全部容器。
3. 迁移内置盘（见下节，最可靠、本机验证过）。

## 数据迁内置盘（模式 B 的可靠出路）

外置卷授权被拒且 TCC/重置均无效时，迁到内置盘是唯一稳定的恢复路径。本机已用此法完整恢复 matrix-synapse 与整个 data-stack（含 Flink/MySQL/Fluus/MinIO/ZK），步骤可复用：

1. **整目录 `cp -a` 迁移**：`cp -a <ext_proj_dir> <internal_dir>`。compose 里凡 `./xxx` 相对卷路径的栈，**项目整目录迁移后所有相对卷自动跟随新位置，无需逐个改**——这是整目录迁移比零散拷卷高效的关键。
2. **只改绝对硬编码**：compose 中绝对路径卷写死新址（如 matrix 的 `./synapse-data` → `/Users/<u>/Documents/matrix-docker/synapse-data`）。`grep -cE '^\s+- /' docker-compose.yaml` 查证无遗漏的绝对卷。docs/scripts 里提到的旧路径不改也行（运行时只认 compose）。
3. **`.env` 一并带上**（含 DB 密码/密钥/桶名），容器才认原数据。
4. **重启**：`cd <internal_dir> && docker compose --env-file .env up -d`；未随依赖拉起的服务再 `up -d <svc>`。
5. **MySQL 跨文件系统坑**：原 datadir 建在外置 HFS+（大小写不敏感）卷，迁到内置 APFS 后首次启动可能报 `Different lower_case_table_names settings for server ('0') and data dictionary ('2')` 并以 abort 结束——datadir 记录了字典值 `2`（小写不敏感）而新实例默认 `0`。`SET GLOBAL lower_case_table_names` 是**只读变量**，运行时改不了。先 `docker restart <mysql>` 试（实测一次即自愈变 healthy）；若反复 abort，持久修法是给 mysql 服务启动参数加 `--lower-case-table-names=2` 匹配 datadir 记录值。
6. **验证**：全部 healthy + 源/副本文件数与字节对账（`find src -type f|wc -l` vs dst）+ 大小写碰撞检测（源树 `tr 'A-Z' 'a-z' | sort | uniq -d` 应为空，避免 HFS→APFS 隐藏重名）。
7. **留存同步归属**：内置盘成唯一权威源，外置原目录改只读；授权修复后如要回迁，反向 cp 并还原 compose。

挂载修复后 `docker compose up -d --force-recreate` 让容器重新解析挂载源路径。

## 隔离与验证

- **对照测试**：内置盘路径 `-v /tmp/x:/t alpine ls /t` 成功 + 同一命令换外置卷路径失败 → 故障面锁定在该卷的共享授权，不是 Docker 全局配置。
- **宿主侧佐证**：`grep VolumeApprove ~/Library/Containers/com.docker.docker/Data/log/host/com.docker.backend.log` 看共享层对该路径的审批是否被拒。
- **动数据前验完整性**：`docker logs` 尾部确认上次是 SIGTERM 正常落盘、DB 文件大小与 mtime 合理，再谈重建容器。

## 红线

- 重启 daemon 前先查在跑容器的 RestartPolicy（`docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' <c>`）：`unless-stopped`/`always` 才会自动拉起；compose 栈容器记下 compose 文件路径，daemon 稳定后逐个 `docker compose up -d` 恢复，不要假设全部自愈。
- TCC.db 非交互会话读不了（sudo 需密码）——别试图程序化查/改 TCC，直接转用户 GUI。
- 改 `settings-store.json` 前必须先退出 Docker，否则启动时被覆盖回旧值。
