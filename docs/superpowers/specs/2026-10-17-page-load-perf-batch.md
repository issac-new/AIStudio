# 首载性能修复批（插件页/旧看板页，2026-10-17）

- 来源：全功能回归轮观察项「插件页 ~9s / 模型页 ~5s / 旧看板页 ~8s 首次加载慢」，用户指令修复。
- 根因（实测）：HTTP 层读缓存（kanban-read-cache.ts，既有）只治「同用户反复拉」；**每个用户键的首次回源仍是一次 CLI/python 子进程冷启动**——plugins 列表每次 spawn python 全目录扫描（~3s），kanban 单板列表每次 spawn hermes CLI（~1.8s），页面首开多个端点在 exec 队列（并发 6）叠加成 5-9s 墙钟。
- 修复（service 层缓存，CLI 输出原样缓存零形状漂移）：
  - patch 645：plugins 列表按 profile 键控 60s TTL + SWR（命中过半后台续期）+ enable/disable 即失效。
  - patch 646：kanban 单板 listTasks 按「板+过滤项」键控 60s TTL + SWR；写失效走 execKanbanCli 咽喉（子命令≠'list' 一律落定即清，误清无损）。
  - patch 647 + command-post：板事件失效注入同一模块实例的 flush（custom 里 require 上游路径会解析成**第二个模块实例**，缓存分裂使预热/失效填错对象——实测教训）；keep-warm 定时器（启动 45s 后每 25s 用 deps.listTasks 后台续期，unref）。
- 实测效果（服务重启后）：
  - 旧看板页内容就绪 8s → **0.6s**；kanban 列表端点跨续期周期连续采样 9/9 次 0.04s（修复前每用户键每 20s 一律 1.4-1.8s）。
  - plugins 端点首次 ~2.5s（进程冷态一次）后 60s 内跨用户 0.04s。
  - 模型页 available-models 端点本就 0.07-0.1s（无需修复）。
- 已知余项（如实）：模型页发现独立挂起缺陷 D5（见 gui-test-screenshots/DEFECTS.md），与本案改动无交集（前端零改动、模型链路端点全快），另案排查。

## 决策记录

- 2026-10-17 用户指令「插件页/模型页/旧看板页首次加载需 5~9 秒——修一下」授权。
- 缓存放 service 层而非继续加 HTTP 层：HTTP 键含用户（stats/assignees 有按用户过滤，不能去），跨用户共享只有 service 层可行；CLI 原样输出避免快道直读的行形状漂移风险（kanban-overview 快道曾为任务形状做过链接表并入，复制成本高）。
- kanban TTL 60s（原设计 15s→30s→60s）：写路径有 execKanbanCli 咽喉+板事件双失效，TTL 仅兜底 watcher 空闲板（agent 写空闲板最坏 ~60s 陈旧，与 HTTP 层现状 20s 同数量级权衡）；keep-warm 间隔 25s 留 35s 余量盖住执行漂移（25s+1.4s 执行实测曾击穿 30s TTL）。
- plugins 不做常驻 keep-warm：低频配置页，TTL 内免费已达成主要收益；常驻 python 扫描（3s/50s ≈6% 单核）不划算。SWR 保活跃期自动续期。
- keep-warm 必须用 deps.listTasks（routes 注入的同实例）——custom require 上游路径经 symlink 解析成第二实例（实测预热填错实例、首请求仍 1.4s 的教训）；flush 同理走 patch 647 注入。
- 中途事故如实记录：曾误用 `git stash`（upstream 树处于 detached HEAD 且含全部补丁注入态）尝试隔离实验，stash 卷走既有补丁效果，服务短暂以 HEAD 原版启动失败；`git stash pop` 即时完整恢复（三文件 M 态与缓存代码标记核对通过），无损失。教训：**upstream 注入树禁用 stash/checkout 类全文件操作，回滚只能用 patch reverse**。
