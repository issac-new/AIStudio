# R112 运行时例行刷新轮（2026-10-15）

> 触发：用户 /goal 三目标（research 目录运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版）目标 2。口径同 R110 例行轮：research/ 克隆升级到最新稳定 tag、差异过决策 46 两问后吸收、表行回写。本轮号位 R112（R111 为零移动轮）。

## 一、移动面（7 移动 / 13 零移动）

| 运行时 | R111 基线 | 远端最新 stable | 判定 |
|---|---|---|---|
| claude-code | npm 2.1.296 | npm 2.1.299（297/298 changelog 跳记） | **移动**（2 版） |
| claude-mem | v13.37.0 | v13.39.0 | **移动**（2 版 30 提交） |
| graphify | v0.9.89 | v0.9.90（v1.0.0 异源 tag 诱取拦截第十例） | **移动**（1 patch 18 提交） |
| ruflo | v3.56.9 | v3.56.10 | **移动**（薄轮） |
| dsh | dsh-v0.2.1-alpha.2 | dsh-v0.2.1-alpha.3 | **移动**（alpha 通道沿用，56 提交） |
| gstack | tip 7edaf4f5 | tip 15ebd85c（v1.91.100.0） | **移动**（+2） |
| semantica | tip d47696a2 | tip b24e2418 | **移动**（+10，tag 面仍 v0.7.0） |
| codex | rust-v0.162.1 | rust-v0.162.1（0.163 全 alpha 不取） | 零移动 |
| openspec | 1.14.1 | 1.14.1 | 零移动 |
| codex-security | npm-v0.2.0 | npm-v0.2.0 | 零移动 |
| ECC | v2.2.3 | v2.2.3 | 零移动 |
| mattpocock-skills | v1.3.1 | v1.3.1 | 零移动 |
| pua | v3.5.1 | v3.5.1 | 零移动 |
| semantica tag 面 | v0.7.0 | v0.7.0 | 零移动（见 tip 行） |
| gsd-core | v1.16.0 | v1.16.0 | 零移动 |
| comet | 0.4.5 | 0.4.5 | 零移动 |
| superpowers | v7.0.0 | v7.0.0 | 零移动 |
| gitnexus | v1.6.12 | v1.6.12 | 零移动 |
| better-harness | v0.6.6 | v0.6.6 | 零移动 |
| harnesseval-w | tip ed4ccc6 | tip ed4ccc6 | 零移动 |

**graphify v1.0.0 诱取第十例**：tag `v1.0.0` 时点 2026-04-05（0a31c086），早于 v0.9.89（2026-10-13 世系）——异源旧 tag 非 0.9.x 发布线产物，与 R81/R85/R89/R97/R105/R107/R108/R110 九次拦截同源。取 v0.9.90（6996bcd3，2026-10-13）。

**外部锚点**：hermes-agent v0.22.0 仍为最新 stable（rc.1-v0.22.1 是 RC 不取）——ncwk 仓侧目标 1 处理面，Swarm-yuan 不直接追踪。

## 二、吸收（每档过决策 46 两问）

| 档 | 两问①（哪个环节缺） | 两问②（谁消费——真实触达） |
|---|---|---|
| claude-code-capabilities v2.1.299 段 | 生成流程 Step 8 门禁资产引用宿主能力面；@提及/沙箱/停机面是 G 系门禁的宿主侧参照 | 文档正文引用（feature 卡宿主能力行+门禁依据），R106 同构 |
| memory-persistence R112 行 | 记忆门禁（claude-mem 接线档）与反馈回路的记忆纪律参照 | 深度接线运行时的方法档，G 系记忆门禁依据 |
| code-graph-tools R112 段 | 图谱域选型与使用面（exploration-guide §C.2 代码引入档位） | 深度接线（graphify）选型表+版本注记 |
| review-methodology R112 段（gstack） | 评审方法论（G 系评审门禁的评审纪律参照） | 方法论引用层第 3 对象（gstack）正文引用 |
| exploration-guide semantica 分级准入增量 | 探查裁决序（Step 2/4 多源矛盾裁决）缺「准入阈」一档 | 该节正文被任何探查消费（capability-map exploration-guide 行） |
| dsh-engineering-methodology R112 注记 | 工程方法论（错误可读化/恢复作用域）供门禁文案与失败处理纪律参照 | 方法论引用层，dsh §3.2→project-fingerprint 同构 |
| ruflo 薄记 baseline 行 | 无新档（薄轮） | upstream-baseline.md 行内登记（仓库档案） |

本轮主题会师（跨仓观察）：

- **时机化治理**三域会师：claude-code 空闲压缩（缓存到期前的空闲窗）/graphify post-merge 治愈（污染入口上挂自愈）/dsh 陈旧坐标失效（环境变更点即作废点）——治理动作挂在系统状态变迁的时点上，而非固定周期。
- **失败可执行化**延续：gstack 失败点名修复命令/dsh 校验错误可读化+坐标指引/claude-code mod 重写丢弃显性化——失败信息的第一读者是下一个动作的决策者（R110 同族延续）。
- **恢复与回收的作用域对齐**：dsh 失败预览按源重置（恢复作用域=故障作用域）/claude-mem 回收代围栏（回收防复活竞态）/ruflo 失败结果入学习库带上限（记录有边界）。

## 三、跨仓观察（无新增独立主题）

R110 三主题（不完备时保全身份/fail-closed 面扩散/计量与链接分离）+ R112 时机化治理均在上表延续，无新增第四主题。

## 四、live CLI

- claude：2.1.296→**2.1.299 本轮升级，漂移归零**。
- codex：live 0.160.0 滞后 0.162.1 记档（升级窗口待用户，R110 起口径不变）。

## 五、回归载体（典型前后端项目）

沿用 R110 载体：Node/TypeScript 后端（Express + Prisma + SQLite）+ Vue3 前端（Vite），对 generated skill 跑全流程验证，通过判据=「既有流程不回归」+新增吸收面不产生误报。

**实际执行记录（2026-10-15）**：①三门禁全绿——run-sweep 66/0（首跑 65/1 的 1 失败=jargon 逮出本轮新增文本 2 处违例【裸轮次标记 R110/R112×4+自造词「三件套」×1】，当场清除后转 17/0，sweep 复跑 66/0）/ self-check exit 0（UNIVERSAL_FILES 预算 554556B/557056B 过——第二十六次登记 548864→557056，+8KiB）/ test-r68-jargon-free 17/0。②真实前后端项目骨架生成：rust-forge（axum+React，R108 样例）`generate-skill.sh r112-regress` exit 0。③载体 cargo check 零告警（exit 0）。④生成闭环（mark-active）由 run-sweep 内 gen-e2e 覆盖（通过）。

## 六、发版

tag v2.77.0 + CHANGELOG 行；离线包（除 npm/pip 可装插件外）同步 ModelScope。
