---
name: cold-archive-before-delete
description: "先冷归档外置盘并SHA256复验,VERIFIED后才删源。触发:清盘/归档迁移/淘汰大目录。"
tags: [archive, disk-cleanup, verify, cold-storage]
---

# 冷归档再删除（cold-archive-before-delete）

## When to Use

- 任何「先存档再删」场景：磁盘清理中淘汰大块目录、休眠实验工作区下冷、IDE 配置迁移、历史产物归档
- 本机铁律：删除先存档；冷存档区 = `/Volumes/nvme2230/lab/archive/<日期-主题>/`；归档完成以 SHA256 实测复验一致为准
- 已有外部权威副本的除外（如已发布 GitHub 且远端覆盖全部本地提交的仓）可直删

## Procedure

### 1. 归档前自检（三条全过才动手）

```bash
df -h /Volumes/nvme2230 && touch /Volumes/nvme2230/lab/archive/.wtest && rm /Volumes/nvme2230/lab/archive/.wtest  # 目标盘挂载且可写
ls -lt <src>/envs/*/bin/python 2>/dev/null; git -C <src> log -1 --format=%ci  # 休眠证据：最后活动时间
grep -r "<src>" ~/.hermes/cron ~/Library/LaunchAgents 2>/dev/null            # 无 cron/launchd 引用
```

- 源是 kanban workspace 时先核卡状态：running/ready 卡的 workspace 不归档
- 归档期间源不能有写入者（worker、cron、IDE 打开中）——并发写导致清单漂移假报 MISMATCH

### 2. 用脚本归档，不手打命令序列

```bash
bash scripts/archive-verify.sh <name> <src_dir>
# 产物: <name>/{files/, <name>.sha256.src, <name>.sha256.dst, VERIFIED|MISMATCH, MANIFEST.md, archive.log}
```

- 清单必须 `sort -z` 后再哈希——rsync 后 find 顺序不稳定，未排序清单会假报 MISMATCH
- 幂等：目标已有 VERIFIED 标记则直接退出，重跑安全
- 归档目录须自包含：文件 + MANIFEST.md 元数据同放，元数据写明「源已删时本归档为唯一副本」

### 3. 大块（>10G）后台跑，完成通知后先验标记

- `terminal(background=true, notify=true)`，多块串成一条命令链，靠完成通知驱动下一步
- 收到通知后逐块查 VERIFIED 标记，全部在位才进入删源

### 4. 删源与收尾

- 删源唯一门 = VERIFIED 标记存在（不是 rsync rc=0，不是脚本退出码）
- MISMATCH = 源一律不动，查 archive.log（常见原因：权限、目标盘中断、源被写入）
- 删源默认走废纸篓而非 rm（用户裁决：可反悔优先）：
  ```bash
  osascript -e 'tell application "Finder" to delete (POSIX file "<src>" as alias)'
  ```
  仅用户明说彻底删时才 `rm -rf <src>`；App 类删除前先 `osascript -e 'quit app "<name>"'` 退出进程
- 入废纸篓后 df 不立刻回收——汇报须注明「清空废纸篓后才真正回收」，勿报虚假释放量
- 删 App 类源连带清扫同 bundle 残迹一并入废纸篓：Group Containers/、Application Scripts/、Saved Application State/ 项；收尾 `ls ~/Library/Containers/ | grep -i <vendor>` 复核清零
- 删后用 df 前后对照汇报

### 5. 汇报口径

- 报物理回收（df 前后差），不报 du 逻辑值——APFS clonefile/稀疏文件让两者差数倍
- swapfile 类系统管理文件不适用本流程（`/private/var/vm` 重启即回收，零成本动作单独列出）

## Pitfalls

- **TCC 遮蔽假空壳（macOS 14+，Kindle 容器实测）**：App 沙盒容器（`~/Library/Containers/<bundle>`）被 TCC 挡时，`ls`/`find`/`du` 报 `Operation not permitted` 或仅显示 32K 骨架，Spotlight/Finder duplicate/`sudo ditto` 全部无效。判存在用 `stat` 探针：`Operation not permitted`=存在，`No such file`=真不存在。看内容用 `lsof -p <运行中进程>`。根治：给宿主终端授「完全磁盘访问权限」并重启，授权后普通 shell 直读。归档前先确认容器不是假空壳，否则会把假象当事实漏归档。
- **App 沙盒归档必须两处齐全（2026-10-18 Kindle 实证）**：`~/Library/Containers/<bundle>` 之外，`~/Library/Group Containers/group.<vendor>.*` 常存登录偏好/共享数据，漏归档会导致恢复后 app 状态残缺。另注意：app 从外置盘运行≠数据在外置盘，沙盒数据永远落本机 Containers，用户直接跑归档内 app 会触发本机新建空容器（表现为「要重新登录」，易误判为归档丢数据）。恢复完整状态 = 归档容器 ditto 回本机原位 + Group 容器一并回位。
- **App 命名变体假阴性**：按记忆中的名字查 `/Applications/<Name>.app` 不存在 ≠ 未安装——先 `ls /Applications/ | grep -i <name>` 枚举实际名（如 "Amazon Kindle.app" 而非 "Kindle.app"，官网直装版与 MAS 版名字/数据路径都不同）。报「不存在/已清理」结论前必须先过变体枚举这一关。
- **stderr 丢弃制造假空壳**：`du 2>/dev/null` 把 TCC 的 `Operation not permitted` 静默吞掉，输出只剩骨架字节数——量容器/受保护目录时保留 stderr，`Operation not permitted` 是「存在但被挡」信号不是噪音。

- 脚本不自动删源是设计而非遗漏——自动删源会把校验门变成形式，删源永远由上层会话验 VERIFIED 后手动执行
- 多块并行归档时每块独立 VERIFIED，禁「一块验过全部删」的打包推理
- 归档目标盘容量先看 df——目标盘剩余小于源大小时 rsync 半途断，留下不完整 files/ 且无 VERIFIED；脚本重跑前会清残缺目录
- 源目录含 Unix socket（sim-mux 类运行时产物）时 rsync 报 `mkstempsock: Invalid argument`、rc=23 属预期；socket 非 `-type f` 不进哈希清单，文件级 SHA256 清单 diff 仍是有效验收门（2026-10-17 ncwk-sim-mux 72 万文件实测）
- 大目录（数十万文件）清单哈希是大头：全量 SHA256 两遍（源+目标）远慢于 rsync 本身，23G 源可达小时级——用 background+notify 完成通知驱动，禁轮询；期间不动源目录
- 比对前清单必须 sort：`find` 顺序在 rsync 前后天然漂移，未排序 diff 假报 MISMATCH（同批 5 块全中）；修复=清单生成加 `sort -z`，已产出的未排序清单可用 `sort` 后 diff 补验收

## Related

- `macos-disk-cleanup`（default profile）Step 4 的归档类目录应路由到本 skill 执行
