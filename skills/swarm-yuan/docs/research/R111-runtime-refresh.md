# R111 运行时例行刷新轮（2026-10-14）

> 触发：用户 /goal 三目标（research 目录运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版）目标 2。口径同 R110 例行轮：research/ 克隆升级到最新稳定 tag、差异过决策 46 两问后吸收、表行回写。本轮号位 R111（R108/R109/R110 号位被 Rust 族回归轮+债务清偿轮+R110 刷新轮占用）。

## 一、移动面（0 移动，27 行零移动）

> **R111 = 零移动轮**：所有追踪运行时在 R110 后未发布新稳定版（最新版本见 R110 一表，对照 2026-10-14 远端 tag 查询）。

| 运行时 | 当前基线 | 远端最新 stable | 判定 |
|---|---|---|---|
| graphify | v0.9.89 | v0.9.89 | 零移动（R110 已升） |
| claude-mem | v13.37.0 | v13.37.0 | 零移动（R110 已升） |
| open-code-review | v1.13.0 | v1.13.0 | 零移动（R110 已升） |
| gstack | tip 7edaf4f5 (v1.91.98.0) | tip 7edaf4f5 | 零移动（R110 已升） |
| ruflo | v3.56.9 | v3.56.9 | 零移动（R110 已升） |
| codex | rust-v0.162.1 | rust-v0.162.1（0.163 全 alpha 不取） | 零移动 |
| claude-code | npm 2.1.296 | npm 2.1.296 | 零移动（live CLI 同版零漂移） |
| openspec | 1.14.1 | 1.14.1 | 零移动 |
| codex-security | npm-v0.2.0 | npm-v0.2.0 | 零移动 |
| ECC | v2.2.3 | v2.2.3 | 零移动 |
| mattpocock-skills | v1.3.1 | v1.3.1 | 零移动 |
| pua | v3.5.1 | v3.5.1 | 零移动 |
| semantica | v0.7.0 | v0.7.0 | 零移动 |
| gsd-core | v1.16.0 | v1.16.0 | 零移动 |
| comet | 0.4.5 | 0.4.5 | 零移动 |
| superpowers | v7.0.0 | v7.0.0 | 零移动 |
| gitnexus | v1.6.12 | v1.6.12 | 零移动 |
| better-harness | v0.6.6 | v0.6.6 | 零移动 |
| dsh | dsh-v0.2.1-alpha.2 | dsh-v0.2.1-alpha.2 | 零移动（维持 alpha 通道） |
| harnesseval-w | tip 零前移 | tip 零前移 | 零移动 |

**外部锚点**：NousResearch/hermes-agent v0.22.0「The Threshold Release」于 2026-10-13 发布（hermes_agent=下游运行时，非 swarm-yuan research/ 追踪对象；其 v0.22.0 升级落在 ncwk 仓侧——本次三目标的目标 1 处理面）；Swarm-yuan 不直接追踪。

## 二、跨仓观察（无新增，R110 同构主题延续）

- 「不完备时保全身份」三域会师（R110 新增）：跨仓成员调用先停靠后链接（图谱域）/ 删除文件可读可列（评审输入域）/ 门禁重开决策 id 唯一（治理域）——本周内各自落地「不因信息不全而静默丢实体」。
- fail-closed 面继续扩散（R110 新增）：渲染溢出=失败评审（构造面）/ opt-out 先于 worker 启动（进程面）/ 只放自己拿的锁（并发面）。
- 计量与链接分离（R110 新增）：graphify 链接可宽、置信必须净——与 R106「评估与生成分离」同族。

## 三、零移动轮处理规程（新增纪要）

R 轮的设计是「有移动才动身」——追踪运行时全部为零移动时，本轮执行三步最小动作：

1. **基线核实**：每个追踪运行时对照远端 stable tag（GitHub releases API / git ls-remote --tags），逐项确认 R111 时点零前移。
2. **文档台账**：本文件即台账，写明「零移动」+ 对照表 + 上轮观察延续。
3. **发版**：tag v2.76.0 + CHANGELOG 行（保持发版节律，与 R 轮号位对齐；零移动亦发版=本仓「七幕节拍」纪律的实例——节拍不依赖内容丰度）。

## 四、验证

- 门禁：self-check.sh / tests/run-sweep.sh / tests/test-r68-jargon-free.sh 见发版记录（v2.76.0）。
- 回归：典型前后端项目验证见 CHANGELOG 与 §五（沿用 R110 §六 载体：Node/TypeScript 后端 + Vue3 前端）。

## 五、回归载体（典型前后端项目）

本轮回归载体沿用 R110：Node/TypeScript 后端（Express + Prisma + SQLite）+ Vue3 前端（Vite），对 generated skill 跑全流程验证。零移动轮回归以「既有流程不回归」为通过判据。
