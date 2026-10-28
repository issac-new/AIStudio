---
name: macos-app-sandbox-relocation
description: "搬迁 macOS 沙盒 App+登录态到外置盘并在恢复后免登录可用。触发：移 App/容器/要免登录。"
tags: [macos, sandbox, app-relocation, login-state, archive]
---

# macOS 沙盒 App 整体搬迁与登录态恢复

## When to Use

- 用户要求把 GUI App（尤其 MAS/沙盒应用）连同登录态搬到外置盘、或恢复后「打开无需登录」
- 排查「App 要求重新登录 = 数据没迁过去」类误判
- 归档/删除/恢复 App 沙盒容器的任何场景

## 核心事实（决定一切方案）

1. 沙盒 App 的登录态/书档/笔记存在**本机** `~/Library/Containers/<bundle-id>/`，App 从哪运行与登录无关。
2. 直接跑外置盘归档内的 App，macOS 会在本机**新建空容器**（表现为要重新登录）——不是归档丢数据。
3. 免登录的前提 = 本机容器在位且含令牌；该容器不能删。

## Procedure

### 1. 摸清数据落点（逐项确认，勿凭记忆猜名字）

| 落点 | 内容 | 漏掉后果 |
|---|---|---|
| `/Applications/<Name>.app` | 程序本体 | 无法启动 |
| `~/Library/Containers/<bundle-id>` | 主体数据（可到 G 级） | 要重登、数据丢 |
| `~/Library/Group Containers/group.<vendor>.*` | 登录偏好/共享数据 | 状态残缺仍要重登 |
| `Application Scripts` / `Saved Application State` | KB 级，可选 | 影响小 |

- bundle-id 用 `osascript -e 'id of app "<Name>"'` 或 InstallHistory receipts 取，不要猜。
- 量体积前先过假空壳判据（见 Pitfalls）。

### 2. 归档

- 目标：`/Volumes/nvme2230/lab/archive/<日期-主题>/`，形态 = `<Name>.app/ + containers/<各容器>/ + 每份 .sha256 + .VERIFIED + MANIFEST.md`
- 复制用 `ditto`（保 ACL/元数据），复验纪律（sort -z 后 SHA256 双侧 diff）归 `cold-archive-before-delete`（default profile）管，按它执行。
- MANIFEST 必须写：DRM 内容（KFX/AAX 等）绑原账号，归档是备份非可迁移阅读格式。

### 3. 恢复到免登录

1. 退出 App（`tell application id "<bundle-id>" to quit`），`pgrep` 确认死透。
2. 目标机若有新生空容器：先 mv 进归档 `fresh-state-<时间>/` 留档再恢复——里面可能有用户新登录/新下载的数据。
3. `ditto` 归档容器回 `~/Library/Containers/` 与 `~/Library/Group Containers/` 原位。
4. 启动验证（下节）。

### 4. 免 GUI 验证登录态（不截屏不问用户）

- `lsof -p <pid>` 持有容器内 `Protected/*.sqlite`、`KSDK/*.db` → 识别到旧登录态
- `lsof -p <pid> -i TCP` 有到厂商 API 的 ESTABLISHED → 会话活跃
- `sqlite3 "file:<容器>/…/*.sqlite?immutable=1" "SELECT count(*) …"` 直接数库内记录（immutable=1 防误写）
- 弹登录 = 容器是空壳，回步骤 3.2

## Pitfalls

- **报「本机无此数据」前必须过 TCC 假空壳判据**：容器被挡时 `ls/du/find` 报 `Operation not permitted` 或 32K 骨架，Spotlight/Finder duplicate/sudo ditto 全无效。`stat` 探针：`Operation not permitted`=存在，`No such file`=真不存在；看内容用 `lsof -p <运行中进程>`；根治=给宿主终端授完全磁盘访问并重启。量体积时保留 stderr——`du 2>/dev/null` 吞掉报错制造假空壳。
- **查 App 安装先枚举名字变体**：`ls /Applications/ | grep -i <name>`——"Amazon Kindle.app" ≠ "Kindle.app"，MAS 版与官网直装版名字/数据路径都不同。
- **Group Containers 必入归档**：体积小（KB-M 级）最易漏；恢复残缺/仍要重登多源于此。废纸篓清空前若恢复依赖捞它，先捞再清。
- **多行 AppleScript/嵌套引号命令先落盘再执行**：terminal 里手拼 heredoc 会被 shell 重写打碎（unexpected EOF），`write_file` 成 `.scpt`/`.sh` 再跑。
- **AppleScript 列含 symlink 的目录会抛类型转换错**：列名优先 shell；shell 被 TCC 挡才退 System Events/Finder，报错逐项 try 包裹。

## Related

- `cold-archive-before-delete`（default profile）：归档复验纪律（SHA256/VERIFIED/删源门）的权威源，本 skill 搬迁场景按其执行
- 本 skill `references/app-sandbox-restore.md`：落点清单、恢复流程、免 GUI 验证的完整手册
