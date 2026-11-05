# 2026-11-05 外置盘挂载守卫批（nvme2230 去依赖收尾）

## 变更

2026-11-05 NVMe 外置盘第二次整卷掉线（10-06 同型），Docker Desktop 因共享目录缺失拒启、data-stack 十容器绑挂全断。本轮已完成宿主侧根治（Docker 共享项摘除、data-stack 整栈迁 ~/lab/data-stack、pytest 残留 launchd 服务清理、ollama env 双路回落、startlux AutoThink 模型迁系统盘）。本批补齐仓内脚本的挂载守卫与路径迁移：

- `team/profiles/data-infra/scripts/rc-watch-events-monitor.sh`：读取路径由 `/Volumes/nvme2230/lab/data-stack/` 迁至 `/Users/cuishi/lab/data-stack/`（跟随数据栈迁移，同时消外置依赖）。
- `team/profiles/ops-devops/scripts/protocol_violation_consumer_run.py`：入口加挂载检查——WORKDIR（hermes-docker-sandbox，仍在 nvme）缺席时打印 SKIP 退出码 0（夜间任务不空转报错）。
- `team/profiles/ops-devops/scripts/nightly_radar_supervisor.sh`：同上，BASE 缺席即 SKIP。
- `team/profiles/platform-skill-miner/scripts/skill-full-backup.sh`：保留外置盘为备份目标的**设计意图**（系统卷常近满，禁放大副本——脚本头注释明示），仅加挂载守卫：目标卷缺席时 SKIP 并留一行日志，不再静默失败。
- `runtime/clef/start-clef.sh`：BASE（mlx-community 模型目录，仍在 nvme）缺席时报错退出并提示挂载（按需工具，不静默）。

## 决策记录

- 守卫形态区分：**夜间/定时任务＝SKIP+日志+exit 0**（缺盘是常态而非事故，任务下轮自愈）；**按需交互工具＝明确报错**（用户在场，需知道为什么不能用）。
- skill-full-backup 不迁系统盘：其头部注释「系统卷常近满，禁止在系统卷放大副本」是既有容量决策，去依赖目标≠违反容量约束；挂载守卫已消除掉盘期的故障面。
- hermes-docker-sandbox 与 mlx-community 模型目录留在 nvme（大体量低频用），守卫化处理——与 data-stack（常驻常跑）的整栈迁移形成分级：**常驻面迁系统盘、低频大件守卫化**。
- rc-watch-cron.sh 已有挂载自防（SKIP 分支）、rc-watch-events-monitor 原本就 `|| true` 容错——前者不动，后者借数据栈迁移一并改指新路径。

## 验证

- `bash -n` 五脚本全过。
- 守卫行为验证：nvme 当前在挂载态，真实卸载态不可现场复现——已验证＝bash -n 语法门全过＋守卫分支代码走查＋挂载态旁路放行（radar 正常续跑 rc=0、clef 越过守卫进入模型加载段）。卸载分支待下次自然掉盘或人工卸载复验。
- 迁移后 rc-watch-events-monitor 读路径存在性：`ls ~/lab/data-stack/logs/rc-watch-last-events.txt`（在位或容错）。
- 宿主侧前序件验收：Docker settings-store.json nvme 引用=0、data-stack 十容器零 nvme 挂载、ollama env plist 双路回落生效（.bak-nvme 备份在）。

## 设计文档影响

DESIGN_SYNC: none——运维脚本容错加固与路径跟随迁移，不触及整合正本/数字总账；理由=各脚本职责与数据流未变，仅消除外置盘缺席时的故障面。
