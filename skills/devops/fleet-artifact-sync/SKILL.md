---
name: fleet-artifact-sync
version: 1.0.0
description: "Fleet 级批量同步/部署 profile 配置与插件后的产物核验纪律——md5 单哈希验收、源文件自证、回退检测。"
metadata:
  hermes:
    tags: [fleet, deployment, verification, plugins, profiles]
---

# Fleet Artifact Sync — 批量部署后的产物核验纪律

管辖场景：把一份改动（插件 `__init__.py` / config 段 / SOUL 规则块）同步到全部
（~39-47 个）profile。相关运维在 hermes-profile-fleet-operations；本 skill 管同步
**之后**的产物验收与回退检测。

## 铁律（always-on）

1. **验收对象是落盘产物，不是部署输出**——部署脚本 rc=0 / 打印 success 不算数。
   每次同步后机械验收：
   ```bash
   cd ~/.hermes/profiles
   for f in */plugins/acp-client/__init__.py; do md5 -q "$f"; done | sort -u | wc -l   # 期望 1
   ```
   哈希组数 >1 = 漏同步；全舰队同哈希但 ≠ 源哈希 = 源被回退（见铁律 3）。
2. **同步前先核源**：cp 循环的源文件自身也可能被别的进程/会话回退。sync 前
   `grep -c "<新机制特征串>" <源文件>` 确认源里真的有本次改动，再开始循环。
   特征串缺失 = 先修源，否则整轮同步是批量复制旧版。
3. **全舰队 mtime 同时变但内容变旧 = 发生了反向覆盖**——立即查：
   ① 谁在跑（`ps aux` + cron `--all` 里有无同步类 job）② backups/ 里找最近的
   完整版恢复。发现回退后**不要原地重 patch**——先找幸存副本（backups/、
   git、.bak），从副本恢复再全量重同步，避免手工重打补丁引入偏差。
4. **机制存在 ≠ 部署完成**：config/规则块落位只说明意图落位；代码分支（如插件
   里的 provider 分支）没同步 = 运行时直接 Unknown provider 秒失败。验收必须
   包含一次运行时冒烟（实际 resolve/spawn 一次新机制），不能只 grep 文本。
5. **env 注入类改动改完必须 kill 存活子进程**：长驻 adapter 子进程沿用启动时的
   环境副本，config 热改不生效；`ps -wwE -o command= -p <pid>` 直查子进程实际 env。

## 验收清单（同步后顺序执行）

1. 源文件特征串 grep（改动在源里）
2. cp 循环全舰队
3. `md5 | sort -u | wc -l` = 1（全舰队同哈希）且该哈希 = 源文件哈希
4. 运行时冒烟：import 新分支实际调用一次（如 `_resolve_provider('zcode')` 返回预期 cmd）
5. 子进程 env 直证（env 注入类）：`ps -wwE` 看到注入的变量
6. 结果记入 skill/memory 时写哈希值本身，不写「已同步」

## 经验教训模式

- 「部署成功」记录与落盘产物不符发生过不止一次：一次是部署记录的哈希从未存在过
  （记录虚构/来自另一时间线），一次是同步后被其它进程反向覆盖。两次的修复路径相同：
  从 backups/ 找完整版恢复 → 重同步 → md5 终验。**backups/ 目录里带完整特征串的
  副本是最可靠的恢复源。**
- 编排者会话与其它会话/cron 可能并发改同一批 profile 文件——收工前的 md5 终验是
  唯一可信结论；会话中途的「已同步」打印随时可能被作废。
