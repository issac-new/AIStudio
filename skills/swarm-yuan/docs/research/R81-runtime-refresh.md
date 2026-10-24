# R81 运行时刷新档（2026-10-01，例行轮）

## 结论

**6 移动（5 物化 + 1 npm 记档）+ 13 零移动/记档**（19 行台账全覆盖，口径同 R73-R80：只认稳定 tag，rc/alpha/canary 不物化，main tip 漂移单列记档不计为版本移动）。

移动六件：**codex rust-v0.159.2 → rust-v0.159.3**（1 patch，2 提交，release 分支 backport 线）、**claude-code npm 2.1.285 → 2.1.286**（1 patch，11 提交，changelog 随版发布）、**graphify v0.9.72 → v1.0.0**（major，34 提交）、**openspec 1.13.2 → 1.14.0**（minor，42 提交）、**ruflo v3.48.0 → v3.49.0**（minor，49 提交）、**ECC v2.2.1 → v2.2.2**（patch，373 提交跨度首次出 tag）。

**吸收四条**（全部过决策 46 两问，落点与证据见「吸收判据」节）：评测宣称诚实性双源（graphify 基准规模条件化 + ruflo 清剿未复验加速宣称）、路由弃权诚实（ruflo #3567 无匹配不得报最高置信度）→ `references/review-methodology.md` R81 段；graphify 1.0.0 能力面（--watch 确定性/语义分流、--wiki、git hook、可复验 worked examples）→ `references/code-graph-tools.md` 选型行；claude-code 2.1.286 四条（同档回退重试/关停排队不丢/脱敏边界族/权限队列计数）→ `references/claude-code-capabilities.md` 注记。

**codex-security npm 通道异常第三轮记档**：registry 现显 `0.0.2`（R74 见 0.1.31 停更、R79 见无 0.1.32 条目），git tag `npm-v0.1.32` 在仓，基线维持 git tag 口径（registry 占位态不可信）。

## 台账（19 行，R81 态）

| 仓库 | R79/R80 基线 | R81 物化 | 移动 | 备注 |
|------|---------|---------|------|------|
| codex | rust-v0.159.2 | **rust-v0.159.3** | 1 patch（2 提交） | backport #49744 账户安全设置提醒；0.160/0.161 alpha 不物化；main 领先 187 记档 |
| claude-code | 2.1.285(npm) | **2.1.286(npm)** | 1 patch（11 提交） | npm 2026-09-30T17:14Z 发版；v2.1.286 tag changelog 随版 |
| graphify | v0.9.72 | **v1.0.0** | major（34 提交） | --watch 免 LLM 自动重建/--wiki 导出/git commit hook/基准规模条件化 |
| openspec | 1.13.2 | **1.14.0** | minor（42 提交） | npm latest 同值；grok/warp/easycode/GSD 四兼容面+.zshrc 字节级卸载还原 |
| ruflo | v3.48.0 | **v3.49.0** | minor（49 提交） | 评测宣称清剿+路由弃权诚实+决策账本头锚定+不可信插件跳过 lifecycle scripts |
| ECC | v2.2.1 | **v2.2.2** | patch（373 提交跨度） | pi/core 精选技能档+MCP 健康检查收敛到 MCP 工具+gateguard 钩子超时对齐 |
| dsh | main tip | main tip | 0 | HEAD==origin/master（fetch 实测零漂移） |
| ocr (open-code-review) | v1.12.11 | v1.12.11 | 0 | HEAD=tag 零漂移 |
| codex-security | npm-v0.1.32 | npm-v0.1.32 | 0 | npm registry 占位态 0.0.2，git tag 口径维持；main +19 记档 |
| claude-mem | v13.28.0 | v13.28.0 | 0 | npm latest 同值；tip +210 无 tag |
| superpowers | v6.4.2 | v6.4.2 | 0 | tip 零漂移 |
| gsd-core | v1.15.0 | v1.15.0 | 0 | tip +91 无 tag |
| better-harness | v0.6.6 | v0.6.6 | 0 | main +203（0.7.0-alpha 线续） |
| comet | 0.4.3 | 0.4.3 | 0 | master +1 无 tag |
| semantica | v0.7.0 | v0.7.0 | 0 | main +68 无 tag |
| gitnexus | v1.6.12 | v1.6.12 | 0 | main +86 无 tag（license-risk 不追） |
| pua | v3.5.1 | v3.5.1 | 0 | tip 零漂移 |
| gstack | main tip 96764e8（v1.91.9.0） | 同 | 0 | 零漂移 |
| harnesseval-w | ed4ccc6 | ed4ccc6 | 0 | 与 origin/main 齐平 |

fetch 执行面：18 克隆 `git fetch --tags --prune origin` 全部 exit 0（2026-10-01 并发实测），claude-code 经 npm registry + anthropics/claude-code v2.1.286 tag 双源判定，harness-practice 为纯链接存根无版本（R37 先例）。

## 移动明细

### codex rust-v0.159.2 → rust-v0.159.3（1 patch，2 提交）

`references/codex-methodology.md` 增 0.159.3 注记。要点（锚 `git -C research/codex log rust-v0.159.2..rust-v0.159.3`，#49744）：

- **0.159.3**（9fa22a5cc）：backport #49715——本地 ChatGPT 会话可选展示账户安全设置提醒。服务端持有资格与灰度、通知不可用不出横幅（服务端权威+不可用静默）。平台面，无方法论吸收。
- 沿 0.159.x release 分支 backport 线（0.159.1/0.159.2 同族）；origin/main 领先 187 提交记档不追。

### claude-code npm 2.1.285 → 2.1.286（1 patch，11 提交）

注记落 `references/claude-code-capabilities.md`（锚 anthropics/claude-code v2.1.286 tag CHANGELOG 首段）。方法层四条 + 产品面卷：

- **同档回退重试**：模型解析被 API 拒绝时按上一模型同档重试一次——降级阶梯保档位。
- **关停排队不丢**：退出中到达的 Remote Control 消息不再误标已送达，保持排队待下次运行应答。
- **凭证脱敏边界族**：键名含不可见字符（零宽空格）、URL 密码含标点/`[::1]`、百分号编码 Bearer 部分掩蔽——脱敏必须对抗边界形态。
- **权限队列计数**："2 of 5"——堆叠的权限请求给进度位。
- 产品面卷：云会话大历史唤醒修复、缓存写计价 1h/5min 档纠偏、MCP 握手降级后工具列表陈旧一天等约 15 项不吸收。

### graphify v0.9.72 → v1.0.0（major，34 提交）

`references/code-graph-tools.md` graphify 选型行升 1.0.0（锚 `git -C research/graphify log v0.9.72..v1.0.0`）：

- **--watch 确定性/语义分流**（5617a7d）：代码变更免 LLM 自动重建图；文档/图片变更仅通知不重建——确定性变更走零 LLM 快道，语义性变更留给人。
- **--wiki 导出**（ef06d7d）：图导出为 agent 可爬取的知识 wiki——知识产物面向 agent 消费的形态。
- **git commit hook**（0a31c08）：每次提交后自动重建图——图基建进开发回路而非一次性产物。
- **基准规模条件化**（154919b）：撤回"小语料¹"脚注，改为实测数字表——6 文件 ~1x（上下文窗口装得下，价值是结构清晰不是压缩）、52 文件 71.5x；每个 worked/ 含原始输入与真实输出（GRAPH_REPORT.md+graph.json）可自行复验。

**graphify v1.0.0 许可态三处不一致（供应链发现）**：v1.0.0 树丢失 LICENSE 与 LICENSE-MIT 文件（v0.9.72 两文件俱在，`git ls-tree` 实测），pyproject.toml 仍声明 `license = { text = "MIT" }`，而 git 历史 relicense Apache-2.0（ba7f9ea）——文件/声明/历史三处不一致。登记口径维持 Apache-2.0（锚 ba7f9ea），记档待上游澄清；AIShips 侧 V7 守门以 license_note 披露豁免承接（工具面本轮增量）。

### openspec 1.13.2 → 1.14.0（minor，42 提交）

台账记档为主（锚 `git -C research/openspec log v1.13.2..v1.14.0`）：grok（skills-only）/warp（project skills）/easycode（project skills+commands）/GSD skills 四兼容面 + code studio agent 支持；`.zshrc` 卸载时字节级还原（cd4f9e4）与 store-backed edit roots 含声明仓（cf2859a）为回滚/多仓边界纪律正例，不单独立档（消费面在 openspec 自身，两问第二问不过）。

### ruflo v3.48.0 → v3.49.0（minor，49 提交）

两条方法层吸收进 review-methodology R81 段（锚 `git -C research/ruflo log v3.48.0..v3.49.0`）：

- **评测宣称清剿**：CLI 输出撤下未复验的 150x/12,500x HNSW 加速宣称。
- **路由弃权诚实**（#3567）：无匹配时路由不再报告其最高置信度——弃权不得伪装成置信。
- 记档不入库：决策账本头锚定使截断可验（#3568）、不可信插件安装跳过 npm lifecycle scripts + --verify 强制信任与权限（#3557）、memory 命名空间/键单一校验器四处复用（#3570）、helper 双格式 .cjs/.js 发行（#3555）。

### ECC v2.2.1 → v2.2.2（patch，373 提交跨度出 tag）

台账记档（锚 `git -C research/ECC log v2.2.1..v2.2.2`）：pi/core 精选技能与提示档 + CI 负载测试；**MCP 健康检查收敛到 MCP 工具**（#2838——健康检查面不得大于实际使用的工具族，全局健康宣称是对未用面的虚假背书）；gateguard 派生钩子超时对齐；回滚重绘回归经 PR #3243 保真合入。方法层单条偏薄，并入 review-methodology R81 段"检查面收敛"一句。

## 吸收判据（决策 46 两问逐条）

| 吸收条 | ① swarm-yuan 哪个环节缺 | ② 消费方与真实触达证据 |
|---|---|---|
| 评测宣称诚实性双源（graphify 154919b + ruflo 3.49.0 清剿） | review-methodology 判据缺"宣称必须带规模条件与复验入口"显式条（R79 段只有测试真实性，无评测宣称面） | review-methodology 由 task-methodology-router §方法论分派表按评审/复盘类任务注入；R74/R79 段先例正文实在 |
| 路由弃权诚实（ruflo #3567） | swarm-yuan 两级路由（LLM 语义分类→关键词兜底）同款风险：分类器无匹配时取最高分=伪装置信 | 同上 review-methodology 判据族；adaptive-gating.sh 目标技能侧消费（SKILL.md ⑤.5 执勤面引用） |
| 检查面收敛（ECC #2838） | 门禁判据缺"健康检查面≤实际使用面"条 | 同上 |
| graphify 1.0.0 能力面 | code-graph-tools 选型行停在 0.9.72（watch/wiki/hook 为 1.0.0 核心增量，选型信息陈旧=功能缺失） | code-graph-tools.md 被 code 引入档位分派（task-methodology-router 代码引入档注）；R37 三选型扩容先例 |
| claude-code 2.1.286 四条 | FACT_COMPAT_DEEP 对照面缺降级阶梯/关停语义/脱敏边界新档 | claude-code-capabilities.md 为 capability-map 登记行目标档+§3.5 引用（R79 同款先例） |

## 执行面记档

- 物化五件 checkout 实测：codex/graphify/openspec/ruflo/ECC `git describe` 均达新 tag（2026-10-01）。
- facts.conf FACT_ARTIFACT_BYTES_BUDGET 第十六次登记 499712→503808：sweep 实测 references 拷贝 503214B 超 502B，全为本轮吸收注记增量（决策 38 逐例登记纪律，非内容膨胀）。
