---
name: cron-job-management-orch
description: "Use when cron 僵尸裁决、门禁基线漂移对账；default 原件为准"
version: 0.1.0
metadata:
  hermes:
    tags: [devops, cron, maintenance, drift]
    related_skills: [cron-job-management, nightly-loop-ops]
---

# cron-job-management 编排侧补编（orch delta）

> 机制权威源 = default profile 的 `cron-job-management`（skill_manage 对 orchestrator
> 会话拒写，canonical 在 `~/.hermes/skills/devops/cron-job-management`）。本件只承载
> 后来新增/修正的编排侧增量，禁全文照抄原件；本件对具体条目的修正凌驾于原件旧句，
> 前台 default 会话应尽快把增量回写原件后削本件。

## 僵尸裁决二分（修正原件「三信号→直接 remove」的第三条）

「引擎路径在未挂载外置卷」不自动等于僵尸，先按「事实源可否合法复建」二分：

1. 全系统找引擎副本（find workspace/scripts 目录）+ 查工作区目录是否为空。
   引擎本体消失或工作区已空 → 僵尸，remove，不折入不修复。
2. 引擎就在冻结卷上且脚本自称唯一事实源（如注明「禁自写 SQL」）→ 保留 job，
   给 wrapper 加未挂载检测 SKIP：
   `if not os.path.isdir(WORKDIR): print("SKIP: workspace not mounted"); sys.exit(0)`。
   此时删除 = 永久失能（事实源纪律禁止本地重写）；SKIP 同时消除每夜 rc≠0 噪音，
   卷挂载后自动恢复实跑，无需人工干预。

## 门禁 C2 哈希漂移：先对账再重建基线

一致性门禁拦「SOUL.md 哈希漂移（未对账变更）」时，禁止直接重建基线掩盖——先对账定性：

1. 读 `context-baseline/reports/` 最新报告，取漂移清单与基线生成时间。
2. 三证据对账，齐指「有意批量编辑」才可重建：
   - mtime 批次聚类：同分钟多文件 = 有意批量 patch；时间散乱 = 可疑。
   - 文内锚点：`grep -oE 't_[0-9a-f]{8}|20[0-9]{2}-[0-9]{2}-[0-9]{2}' <SOUL>` 指向哪次落地。
   - 同目录 `.bak*` 留痕 = 有意 patch 证据。
3. 重建：跑 snapshot 工具本体——路径以 gate 脚本头部 SNAP 变量为准（真源通常在
   `~/.hermes/bin/`，不在 profile scripts/ 下，找不到时勿盲猜）；重建前备份旧 manifest。
4. 复验：重跑 gate 必须 rc=0，且报告 C5 的 skills/profiles delta 同步归零——
   只过 C2 不过 C5 = 对账未闭环。

## 折入步首夜验证

新折入步当晚首跑后，次日核对 loop 日志 full-done 行含全部新步名与各步 rc；
单步 `|| true` 隔离保证异常步不拖垮主链，按步内日志单修，勿整链重跑。
