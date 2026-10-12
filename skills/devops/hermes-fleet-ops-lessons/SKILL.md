---
name: hermes-fleet-ops-lessons
description: "Fix kanban UDF loss after update; doc surgery safety rules."
version: 1.0.0
metadata:
  hermes:
    tags: [orchestrator, update-drift, kanban-guardrail, design-doc, patch-persistence]
    related_skills: [orchestrator-lessons, hermes-source-patch-persistence, kanban-db-guarded-writes, as-is-design-doc]
---

# Fleet Ops 实战教训（update 漂移 / 看板护栏 / 设计文档手术安全）

> 收纳 orchestrator 亲历、但母本 skill（orchestrator-lessons / hermes-source-patch-persistence / as-is-design-doc 等在 default profile）无法直写时的实战修正。母本 skill 定原则，本 skill 存落点命令与现版结构。

## When to Use

- hermes update 后 kanban 全线报 no such function
- kanban_* MCP 工具不可用，需要 CLI 替代路建卡
- 设计文档大规模文字手术（增删节/重写）

## 〇、update 后 worker 秒死排查口诀（2026-10-06 判例补充）

新指纹≠源码缺失：worker 秒死报 `ModuleNotFoundError: No module named 'hermes_cli'`（tools python）时，**先跑 `~/.hermes/bin/python-drift-watchdog.sh`** 而不是去查源码树——update 重置会同时冲掉 ① tools python 的 `hermes-live-root.pth`（worker spawn 通道，秒死主因）② gateway plist 的 HERMES_BIN 注入（下次重启才炸）。watchdog 5 锚点体检，每个 DRIFT 行自带 copy-paste 修复命令。修复顺序：.pth 立即生效可重派卡；plist 补文件不重启（活 gateway 不受影响，等夜间窗 bootstrap）。当前 TUI 主进程内存是 update 前旧代码（kanban_* MCP 报 no such function），CLI 新进程不受影响——修 .pth 不救 MCP 通道，救的是 CLI/spawn 通道。

**掩码路径陷阱**：错误输出里 tools 目录名会显示为掩码形态（如 `python-3.14.7+202****0901`，数字被掩）——直接把掩码字符串当路径硬编码进 Python 会 FileNotFoundError；bash 不带引号时 glob 恰好能匹配（`*` 仍通配）掩盖了问题。Python 侧一律 `glob.glob(f"{home}/.hermes/tools/python-3.14*darwin-arm64")` 解析真实路径。

## 一、kanban 写护栏 UDF 失踪（update 后全线 no such function）

**症状两型，先查树再动手**（见报错勿直接重打补丁）：`grep -n "GUARDRAIL_UDF_NAME\|register_write_sanction_udf" hermes_cli/kanban_db_connect.py`——①树在位 = 只是 TUI/gateway 长进程内存里还是旧代码（kanban_* MCP 写工具报 no such function 而 CLI 新进程正常），直接走 §二 CLI 替代路、禁重打补丁；收尾 `hermes gateway restart` 让 dispatcher 加载新代码。②树缺失 = 注册代码真被 update 冲掉（MCP+CLI 全线报错），按下方手工插入修复（patches 档案 apply 预验通过后一击修复，流程可靠）。

**根因**：guard 触发器持久在 DB 文件里，UDF 注册代码在 Python 侧；`hermes update` autostash/重构冲掉注册代码但触发器还在 → 所有新连接写路径全灭。老 gateway 进程内存里是旧代码，不受影响也不自愈。已三度复发。

**修复（现版结构）**：手工插 `hermes_cli/kanban_db_connect.py` 两处——
1. `GUARDRAIL_UDF_NAME` 常量 + `register_write_sanction_udf(conn)` 定义放 `_open_configured` 前（内部按 `is_delegated_child_process_context()` 返回 0/1）
2. 调用放 `_sqlite_connect` 返回后、`conn.row_factory` 前，try/except 包裹
3. 验证：`py_compile` + `conn.execute('SELECT kanban_write_sanctioned()')` 返回 1

**恢复源**：`workspace/research/guardrail-test-teardown/stash1-guardrail-udf-code-20260902.patch`（workspace 目录 update 永不触碰；09-05 版恢复脚本放 hermes-agent 树内已被冲掉）。旧 apply 脚本锚点会随代码演进失配（连接生命周期已重构进 kanban_db_connect.py），按当前版结构手工插。

**纪律**：补丁恢复源一律放 update 不动的目录；恢复脚本用稳定符号作锚，失配时报错退出而非静默跳过；每次 update 后跑标记 grep 计数对账。最新存档：`~/.hermes/profiles/_shared/decisions/kanban-udf-restore-20261009.patch`（git format-patch 自 2026-10-08 diverged-backup ref 导出，`git apply --check` 可预验；失效时从 diverged ref `git log --oneline --grep guardrail UDF` 找 commit 重导）。

**update 卡死在交互提示上的锁僵死（2026-10-09 第 4 判例）**：update 在无人值守终端跑到 `Restore local changes now? [Y/n]` 会无限挂起——marker 被心跳刷新、锁永不释放，且该锁 fail-close 挡住 unblock 的 checkout 修复。诊断三件套：① `ps -p <pid> -o lstart,time` 看启动 vs CPU 时间（14h/3.5s=僵死）；② `tail ~/.hermes/logs/update.log` 看停在哪；③ `lsof -p <pid> | grep update.log` 确认归属。**注入口径**：TIOCSTI 被 macOS 封死、直写 /dev/tty 只进输出缓冲不进输入——正解是 **iTerm2 AppleScript `write s text "n"`**（`tty of s` 精确定位会话，等价用户敲键，零焦点误伤）。答 `n`（不恢复 stash，保留人工复盘）后 update 正常收尾。**放行纪律**：marker 消失+进程退出后再跑 watchdog 补源码；watchdog 只救 .pth/plist，UDF 补丁需独立恢复（上节）。批量放行 40+ 卡前先金丝雀单卡验通道（running 3min+心跳分钟级刷新=过），再批量 promote；最后 `hermes gateway restart` 让 dispatcher 加载新代码——旧 gateway 进程没有 UDF，dispatcher tick 会持续 `no such function` 拒收。

**update 清理是迟到的（2026-10-06 判例）**：20:47 update 锁出现→手动修好 .pth+plist（21:05）→21:11/21:19 update 收尾清理又把两处冲掉→worker 再秒死。教训：**手动修复前确认 update 全链路结束**（锁消失 + 无 update/bootstrap 进程 + site-packages/plist mtime 不再变化），只看锁存在与否不够。防复发已落地：`python-drift-watchdog.sh` 已升级自愈版（HEAL 前缀，.pth 缺失自动重写、plist 丢 HERMES_BIN 自动补注+lint 校验+坏则回滚，update 锁存在时只报不修），删掉两锚点实测均自动恢复。注意：watchdog 旧版把掩码字面路径（`202****0901`）写死在单引号里，bash 不展开导致自愈写 .pth 静默失败报 perm? 误报——已改 `ls -d python-3.14*darwin-arm64` 动态解析真实目录。

## 二、hermes kanban CLI create 形参（工具通道不可用时的替代路）

- title 是**位置参数**（放最后）
- `--workspace` 只收 `scratch | worktree | worktree:<path> | dir:<path>` 格式，裸路径报 unknown value
- **无 `--board` 参数**——用 `HERMES_KANBAN_BOARD=<slug>` env 指定板
- **`--body-file <path>` 可用**（2026-10-06 实证）：长 body（中文多段/特殊字符）优先落盘后 `--body-file`，避免 shell 引号地狱；中文 body 的 sqlite `length()` 返回字符数（≈bytes/3），勿据 bytes≈chars 误判 body 截断，用 body head 抽查验证完整性
- `comment` 子命令**没有 `--body-file`**：text 是位置参数（`hermes kanban comment <task_id> <text...>`）；长中文 body 用命令替换整体挂载：`hermes kanban comment <task_id> "$(cat /tmp/comment.md)"`
- 验证 comment 落库用 **`task_comments`** 表（不是 `comments`）；写查询前先 `.tables` 核对表名，报 no such table 先查 schema 勿猜表名
- 例：`HERMES_KANBAN_BOARD=swarm hermes kanban create "标题" --assignee ops-devops --priority 2 --workspace "dir:/path/to/ws" --body-file /tmp/card.md`

## 三、设计文档大手术：防截断 + 术后病灶扫描

**🔴 跨调用复用旧索引会截断全文**：`text.find()` 的 s/e 偏移在文件被上一轮改动后失效，`text[:s]+new+text[e:]` 曾把 1335 行砍到 354 行。铁律：每次改动前重新 read 全文，在**同一个调用内**完成读→改→写；大手术前确认恢复点（git HEAD / auto-backup 已含此前全部有效改动）；写入后立即 `wc -l` 对账，行数跳变即从恢复点重做。

**🔴 patch/正则删段后必跑机械病灶扫描**（用户对「语句不通顺」零容忍）：删论证会留孤儿括号、错位拼接、无主语残句。四项全文扫描：①圆括号/引号配对 ②以标点开头的行 ③空括号 ④每章导语首句必须有主语+谓语。逐处修后再交付。

## 四、恢复点纪律（auto-backup 是免费的保险）

本部署 auto-backup cron 定期 commit。大手术前：`git log --oneline -5 -- <doc>` 确认最新备份点已包含此前全部有效改动；出事时 `git checkout HEAD -- <doc>` 即回到上一稳态，再按记录重做本轮增量——比手工补救快一个量级。

## 五、update 后 worker 集体秒死：先查上游 import 不一致（2026-09-28 判例）

**指纹**：`hermes update` 后所有 kanban worker spawn 即死，`last_failure_error` 含 `cannot import name 'X' from 'tools.kanban_tools'`（X=`register_current_worker_from_env`）或 `No module named 'hermes_cli.kanban_gates'`。

**根因**：上游仓库自身不一致——`cli_single_query.py:461` 调用 `register_current_worker_from_env` 但 `tools/kanban_tools.py` 不含该函数；`kanban_db.py` 三处 import `hermes_cli.kanban_gates` 但该模块从未入库。每次 update 重置工作树后必现，与本地改动无关。

**修复三件套**（均已落地）：
1. 补缺失函数时带 `swarm:kanban-pid-adopt` 标记区块；patch 存 `_shared/decisions/kanban-pid-adopt.patch`（git diff 生成，可逆向验证）
2. watchdog：`~/.hermes/bin/kanban-pid-adopt-watchdog.sh`（grep 标记 → 缺失则 `git apply` 重打 → 失败 exit 2 人工）；`kanban_gates.py` 用 pass-through 实现（返回 `(True, {})`，与「无 gates.json 即无门」语义一致）
3. 挂载点：`tui-patch-watchdog.sh` 尾部第 3 节（launchd 每 300s 已在跑，无需新 plist）

**纪律**：update 进行中（`.hermes-update-in-progress` 锁存在）勿手工补源码——工作树会被反复重置，补 4 次被冲 4 次；等锁释放再补。补完后 `py_compile` + 真实 import 冒烟 + `git apply --check -R` 逆向验证三连。

## Related

- 母本原则：orchestrator-lessons（patch 生命周期）、hermes-source-patch-persistence（三件套流程）、kanban-db-guarded-writes（认证连接写法）、as-is-design-doc（文档纪律）
