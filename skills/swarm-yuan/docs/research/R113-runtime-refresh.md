# R113 运行时例行刷新轮（2026-10-15）

> 触发：用户 /goal 三目标（research 目录运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版）目标 2。口径同 R110/R112 例行轮：research/ 克隆升级到最新稳定 tag、差异过决策 46 两问后吸收、表行回写。本轮号位 R113。

## 一、移动面（5 移动 / 16 零移动）

| 运行时 | R112 基线 | 远端最新 stable | 判定 |
|---|---|---|---|
| claude-code | npm 2.1.299 | npm 2.1.300 | **移动**（1 版大 patch） |
| graphify | v0.9.90 | v0.9.91（v1.0.0 异源 tag 诱取拦截第十一例） | **移动**（1 patch 16 提交） |
| gsd-core | v1.16.0 | v1.17.0 | **移动**（1 minor） |
| openspec | 1.14.1 | 1.14.2 | **移动**（薄 patch） |
| gstack | tip 15ebd85c | tip 47d639ab（v1.91.101.0） | **移动**（+1） |
| codex | rust-v0.162.1 | rust-v0.162.1（0.163 全 alpha 不取） | 零移动 |
| claude-mem | v13.39.0 | v13.39.0 | 零移动 |
| dsh | dsh-v0.2.1-alpha.3 | dsh-v0.2.1-alpha.3 | 零移动 |
| ruflo | v3.56.10 | v3.56.10 | 零移动 |
| semantica | tip b24e2418 | tip b24e2418 | 零移动 |
| harnesseval-w | tip ed4ccc6 | tip ed4ccc6 | 零移动 |
| ocr / ECC / comet / codex-security / mattpocock-skills / pua / superpowers | — | 均在最新 | 零移动 |
| gitnexus | v1.6.12 | v1.6.13 全 rc 不取 | 零移动 |
| better-harness | v0.6.6 | v0.7.0 全 alpha 不取 | 零移动 |

**graphify v1.0.0 诱取第十一例**：tag `v1.0.0`（0a31c086，2026-04-05）早于 v0.9.90（2026-10-13 世系），异源旧 tag 非 0.9.x 发布线产物，与 R81/R85/R89/R97/R105/R107/R108/R110/R112 十次拦截同源。取 v0.9.91（10130e79，2026-10-14）。

**外部锚点**：hermes-agent v0.22.1 已发布（2026-10-14，297552a9d6）——ncwk 仓侧目标 1 当轮完成 v0.22.0→v0.22.1 迁移（68 agent 补丁三向再生、隔离树 285+68 零失败），本仓只作外部锚点记档。

## 二、吸收（每档过决策 46 两问）

| 档 | 两问①（哪个环节缺） | 两问②（谁消费——真实触达） |
|---|---|---|
| claude-code-capabilities 2.1.300 段 | 生成流程 Step 8 门禁资产引用宿主能力面；计量拆维/非键入钩子/降级面是 G 系门禁的宿主侧参照 | 文档正文引用（feature 卡宿主能力行+门禁依据），R106/R112 同构 |
| code-graph-tools R113 段 | 图谱域选型与使用面（exploration-guide §C.2 代码引入档位） | 深度接线（graphify）选型表+版本注记 |
| review-methodology R113 段（gstack+gsd） | 评审方法论（G 系评审门禁的评审纪律参照） | 方法论引用层第 3 对象（gstack）+gsd 工程参照正文引用 |
| gsd-patterns v1.17.0 要点段 | GSD 工程模式参照（阶段状态/审计面） | gsd-patterns 档正文（方法论引用层） |
| openspec 薄记 baseline 行 | 薄 patch 轮，无新档 | upstream-baseline.md 行内登记（R97 先例同构） |

本轮主题会师（跨仓观察）：

- **计量拆到不可再合并的维度**：claude-code 缓存写按 5m/1h 生命周期拆两列（聚合数掩盖不同寿命的缓存成本）+ gsd statusline 与宿主 autocompact 口径对齐（同一现象两种口径=100% 误报）+ gsd 验证状态点名已移动的被覆盖文件（覆盖率分母要跟文件走）。计量要么拆到维度、要么对齐口径、要么让分子分母同源——否则数字本身成为误导源。R110「计量与链接分离」的深化。
- **非键入变迁也入事件面**：claude-code prompt.change 钩子（召回历史/清空/撤销/插件填充都算状态变迁，不只 typed edit）+ graphify ollama /api/chat（配置写了却不生效=配置通道与生效通道断裂）+ gsd phase.complete 从下一阶段磁盘态写（汇报态以落盘为准，不以进程内记忆为准）。程序性/间接性变迁与用户直接操作同权进入可观测面。
- **边界限定防越界**：graphify 接收者仅从调用方类+基类读（不越界到无关联类）/Rust use 落在声明侧且根须在本 crate + openspec 深嵌套>16 层拒绝 + x- 扩展键忽略。符号解析与配置解析都要限定在声明的边界内——越界匹配=误判，过深嵌套=拒绝，未知名空间=忽略。

## 三、跨仓观察延续

R110 三主题（不完备时保全身份/fail-closed 面扩散/计量与链接分离）+ R112 时机化治理均延续；本轮上述三主题为深化非新增族。

## 四、live CLI

- claude：2.1.299→**2.1.300 本轮升级，漂移归零**。
- codex：0.160.0→**0.162.1 本轮升级**（R110 起记档的「升级窗口待用户」由本轮 /goal「运行时更新到最新稳定版」指令关闭；0.163 全 alpha 不取口径不变）。

## 五、实际执行记录（2026-10-15）

①三门禁全绿——run-sweep 复跑 66/0（首跑 64/2：jargon 逮出本轮新增文本裸轮次标记 R113/R112×4 处当场清除；self-check 预算断言实测 559488B 超 2432B，按第二十七次登记 557056→561152B）/ self-check exit 0（实测 559512B ≤ 预算）/ test-r68-jargon-free 17/0。②典型前后端项目验证（rust-forge，axum+React，R108 样例）四链全绿：生成链 exit 0（react/vite/jest-vitest/cargo 四框架探测+门禁注入）+ 后端 cargo check 零告警 + cargo test 16/16 + 前端 vite build exit 0 + vitest 12/12（较 R112 的 cargo check 单链补齐后端测试与前端构建/测试两链）。③live CLI 双升级实测：claude 2.1.300（/Users/cuishi/.local/bin/claude）/codex 0.162.1。④发版 v2.78.0 + 离线安装包（swarm-yuan-offline-v2.78.0.zip）。

**勘误（2026-10-15 午后补，同日 /goal 三目标复扫轮）**：④ 所指离线安装包按当日本码构建时 vendor 钉版未随基线表同步（offline-manifest.conf 仍为 claude-code 2.1.294/graphify 0.9.80/gsd-core 1.14.0 等九通道旧钉），发布资产与 R113 基线不符。已修正：清单九通道实核刷新至基线（codex-security npm 0.3.0 超 GitHub 基线如实登记）、打包器补「zip -qr 对已存在包增量更新不清旧条目」根治（同版本重跑不再残留旧 tarball）、v2.78.0 release 资产以修正包覆盖。九通道复扫结论：全部追平 R113 基线，零新增移动。
