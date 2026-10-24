# R123 运行时例行刷新轮（2026-10-19）

> 触发：用户 /goal 三目标（research 目录运行时更新至最新稳定版+差异比较+吸收+优化+回归+发版）。口径同 R117 例行轮。轮号位 R123（R118-R122 为专项轮：nestjs 回归/审计加固/渲染入口/JVM 样例重建/图表生产能力）。

> **协作注记**：本档与并行会话轮次互补——注册运行时移动面（claude-code 2.1.303/gsd-core 1.18.0/claude-mem 14.0.1/ruflo 3.57.0/gstack/semantica）由 feat/r123-runtime-refresh 分支（7bed359）吸收进 baseline/references；本档专注 ncwk 参照仓深读面（codex/dsh 架构补深+governance 跨运行时协作治理）。两支合并时本档 §一 移动表以其基线表为准核对。

## 一、移动面

| 运行时 | R117 基线（2026-10-17） | 远端最新（2026-10-19 实测） | 判定 |
|---|---|---|---|
| claude-code | 2.1.302 | npm **2.1.303**（live CLI 已同版） | **移动**（薄轮：2.1.303 段=bug fixes；2.1.302 的分类器模型独立/auto 压缩开关 R117 已吸收，无新增机制） |
| claude-mem | 13.41.0 | npm **14.0.1**（2026-10-17 同日三连发 13.41.0/14.0.0/14.0.1） | **移动**（major 跳版，watch 档维持薄记） |
| openspec | 1.14.3 | 1.14.3（npm @fission-ai/openspec + GitHub tag 双通道） | 零移动 |
| ocr | 1.13.1 | v1.13.1（alibaba/open-code-review tag；live CLI 同版） | 零移动 |
| codex-security | 0.4.0 | 0.4.0（npm @openai/codex-security） | 零移动 |
| superpowers | 7.0.0 | v7.0.0（GitHub tag） | 零移动 |
| graphify | 0.9.92 | 0.9.92（live CLI 同版；GitHub 通道未映射维持本地口径） | 零移动 |
| codex / dsh | 0.163.0 / rc.2 | 0.163.0 / rc.2（与基线持平；ncwk 参照仓归位见下） | 零移动（基线口径） |
| gsd-core | 1.17.0 | **v1.18.0**（1 minor：歧义 fail-closed #5313/完成计数单调 #4901/plan-phase 三查 #4927/构建失败不算 RED #5106） | **移动**（并行分支 7bed359 实测入 gsd-patterns v1.18.0 段） |
| ruflo | 3.56.10 | **v3.57.0**（init 安全默认 ADR-490/MCP 桥双校验 #4226/策略账本抗篡改锚 #3892） | **移动**（入 subagent-orchestration v3.57.0 段） |
| gstack | tip d258bcff | tip **6a4ab69dc**（+25：被测模型与裁判分离 #3275/影子模式 #3259/合并列车二分 #3272） | **移动**（入 review-methodology v1.91.122-146 段） |
| semantica | v0.7.0+ca6c9f191 | tip 34359a1dd（+1，tag 零移动） | tip 移动记档不升版 |
| comet / GitNexus / ECC / impeccable / pua / pi / mattpocock-skills / diagram-design | R117 终态 | 并行分支实核持平（comet 0.4.5 / GitNexus 1.6.12（1.6.13 全 rc 不取）/ ECC 2.2.3 / impeccable cli-v4.6.0 / pua 3.5.1 / pi 1.3.0 / mattpocock 1.3.1 / diagram-design 550fd66） | 零移动（基线表为准） |

**ncwk 参照仓归位**（swarm-yuan 基线已在位、归档仓滞后，本轮 /goal 指令关闭滞后窗口——R113/R117 同构先例）：

| 参照仓 | 归档仓旧 | 归档仓新 | 差异量 | 素材去向 |
|---|---|---|---|---|
| codex | rust-v0.162.1 | rust-v0.163.0 | 232 提交 +57996/−18617 | §二 codex-methodology R123 段 |
| deepseek-harness | dsh-v0.2.1-alpha.2 | dsh-v0.2.1-rc.2 | 990 提交 +149551/−18929 | §二 dsh-engineering R123 段 |
| kimi-code | 2.1.1 | 2.2.0 | 40 提交 +25477/−16036 | §二 governance-agents R123 段（未注册运行时，方法论吸收） |
| multica | v0.6.2 | v0.6.3 | 18 提交 +21780/−8188 | §二 governance-agents R123 段（同上） |
| dsh-TUI | v0.15.0 | v0.16.1 | 25 提交 +21881/−4464 | §二 governance-agents R123 段（同上） |

live CLI 口径：`claude --version` 2.1.303（=npm latest）；`codex --version` 0.163.0（=npm latest，双归零）。

## 二、吸收（每档过决策 46 两问）

| 档 | 两问①（哪个环节缺） | 两问②（谁消费——真实触达） |
|---|---|---|
| codex-methodology R123 段 | **阈值驱动后台压缩**（上下文占用到设定比例默认 65% 即在 turn 外异步压缩，opt-in 保留客户端标记的工具输出跨压缩）/ **沙箱完整性自校验**（命令与文件操作前策略式校验被保护内容未漂移，bubblewrap/Seatbelt/MXC 多后端同一套策略语义）/ **按工具能力声明调度**（只读工具并行、写操作独占——调度层消除串行化而非提示层提醒）/ **预测 fork 的 cache 纪律**（ephemeral fork 禁配置覆盖、严格继承父级前缀，低成本试探分支命中缓存）/ **Guardian 式独立审批流水线**（安全判定与主对话解耦、并发、滞后窗口超限即取消 drain、失败跨重启持久化）/ **instant_interrupt 默认开**（新输入抢占进行中响应） | codex-methodology.md R123 段；harness 压缩触发面与工具调度参照 |
| dsh-engineering-methodology R123 段 | **密码学身份锚定的授权撤销**（CUA 应用级同意：持久授权=规范路径+签名要求 SHA-256，换壳可区分；不可验证程序只给任务级授权；撤销级联终止持有句柄的连接）/ **权限生命周期与执行环境绑定**（persistent PTC：保留态环境持有创建时策略，策略一变整体失效；一次性提权=无 owner 临时环境用完即弃）/ **required 运行时上下文+快照对比重注入**（team:identity 不依赖对话历史，压缩后主循环检测丢失自动补注——身份漂移的结构性防御）/ **状态压缩用日志回放验证等价**（O(消息) 投影压到常量级，836 个真实 Session 日志全量回放逐事件比对）/ **渐进式技能加载复用既有执行面**（router+按需正文；渲染复用普通 shell 的审批/沙箱/取消，不为单能力新造特权路径） | dsh-engineering-methodology.md R123 段；沙箱/审批/技能供给参照 |
| governance-agents R123 段（kimi-code 2.2.0） | **确定性合并门控**（missionGate：能否合并从模型判断改为纯函数+16 种显式 reason 枚举；statusReader 不经 LLM 直读 git 状态——LLM 只执行不裁决）/ **fork 前缀 parity 工程化**（子代理请求与父级 byte 级对齐，cache probe 区分客户端漂移 vs 服务端 miss，命中率可观测可归因）/ **外部注入折叠进用户消息**（hook 输出/技能激活块统一为 meta 标记 content part，严格 1 prompt=1 user message，根除 turn 配对漂移）/ **共享 checkout 防护**（bashGuard AST 解析在多代理共享主 checkout 否决破坏性 git clean）/ **等待即让权**（WaitFor 90 秒硬上限+新输入立即结束等待+用户消息打断进行中 turn）/ **信任披露聚合**（trustDisclosureService 聚合 MCP/skills/agents.md/additionalDirs 的 gated 来源供人工核查） | governance-agents.md R123 段；多代理门控与编排参照 |
| governance-agents R123 段（multica 0.6.3 续） | **状态机即交接协议**（看板列=步骤+handler+brief，进入状态即自动指派+带交接附注自动启动 run——协作编码进项目元数据非靠人盯）/ **dry-run 优先破坏性迁移**（切换工作流先生成状态映射计划，迁移动作永不隐式交接）/ **服务端单次渲染 brief**（handoff brief 按 assignee/observer 渲染一次，多端一致低成本） | 同上（状态机交接三件与 kimi 门控互补：门控管合并、状态机管流转） |
| governance-agents R123 段（dsh-TUI 0.16.x 续） | **profile 级插件准入+第一方 feed**（插件以 bundle 装进 profile、声明安装面与 preset 补丁位，宿主接缝冻结为 tui.dsh/v1alpha1——生态扩展不 fork 宿主）/ **危险权限会话级确认**（auto-review 高权限预设不进全局偏好、需本会话显式确认且明示代价——信任做成有期限有成本提示的动作）/ **只读多代理仪表盘**（一屏看成员/状态/Lead/任务板+消息按发送者归属——观察而非介入） | 同上（插件治理与观察面参照） |

本轮主题观察（跨运行时）：

- **裁决去模型化**（kimi missionGate 纯函数门控 + statusReader LLM-free + multica 状态机交接）：合并/流转/状态判定从模型判断迁移到确定性代码，LLM 保留执行权、让出裁决权——与 dsh「LLM 只负责执行不负责裁决」同向。
- **授权的结构属性**（dsh CUA 密码学身份锚定 + persistent PTC 策略绑定 + dsh-TUI 会话级确认）：授权是否可持续、是否可撤销、绑定什么身份，正在从约定变成结构字段——一次性提权=无 owner 环境、换签名=授权失效。
- **上下文身份的结构性防御**（dsh team:identity required 上下文+压缩后重注入 + kimi 1prompt=1user message 折叠）：关键身份与配对信息不依赖对话历史的完整性，压缩/分叉后由主循环主动修复。
- **cache 纪律成为工程指标**（codex 预测 fork 禁覆盖 + kimi prefix parity probe 可归因）：prompt cache 命中率从运气变成可设计、可观测、可归因的工程面。

## 三、缺陷排查与修复（本轮实抓）

1. **ncwk 升级侧（另档正本）**：SQL 转义被 Python heredoc 吞字符两连（D5）；regen 工具新建文件静默丢失+同树验证假绿（D4——补 new-file 分支与存在性断言后根治）；win 打包 arm64 nsis after-pack 跨平台崩（zip-only 目标重打包绕过）。细节 `ncwk/overlay/docs/superpowers/specs/2026-10-19-upstream-0737-upgrade.md`。
2. **并行分支实抓（7bed359）**：test-r118 硬编码版本钉根治（动态取清单 spec+补 2f 空过防线）；预算第三十一次登记（references 拷贝体积）。
3. **回归样例侧（§四）**：SQL 门禁三连执法实录再现——拼接式 WHERE 拦→字面量四分支但 LIKE 参数近 prepare 行再拦→构造独立成行后过（与 R117 同构，门禁连续两轮咬合一致）。

## 四、全栈回归（典型前后端项目 sample-forge，Express 4 + Vue 3 首配对）

样例 /tmp/r123-sample/sample-forge（npm workspaces）：**apps/api**（Express 4.21 + node:sqlite 内建 + supertest + vitest）+ **apps/web**（Vue 3.5 `<script setup>` + Vite 6 + @testing-library/vue + jsdom）。基线：api 4/4 + web 2/2 + build exit 0。

**生成链全绿**：detect-frameworks 4 框架全中（vue/vite/express/jest-vitest）→ 骨架（standard 档）→ --inject-frameworks（4 框架门禁 sha=3103543566）→ AI 填充（framework-knowledge 45 规律全带样例源码证据 vue15+vite10+express10+jest-vitest10 / codebase+dev-guide+release / reference-manual §4§6§9 实锚 / recipes / decisions.jsonl 2 条含 UserChallenge）→ --verify-completeness --strict 零占位 → --mark-active ✓（框架 glob+spec-first 联动 WRITABLE_DIRS 全过）。

**Task A（feature：任务关键字搜索双端全链）**：红测先行（api LIKE 过滤 2 用例+web searchbox 1 用例，红 3 精确命中）→ 绿（db.js 字面量四分支+q 类型校验 400 / App.vue 即输即滤 input 事件）→ api 6/6 + web 3/3 + build rc=0 → precheck --all **fail 0**（10 执行 1 跳过 sensitive 未配置）——**门禁三连递进执法实录**：master 分支拦→SQL 拼接拦→LIKE 参数近行拦→spec-first 拦→§5.5 拼装声明拦，逐项修复后全绿（诚实发现：先写拼接式被咬两次，教训与 R117 同型——SQL 形态第一稿就该字面量分支）。

**Task B（fix：缺陷注入防线验证）**：注入①移除 q 类型校验——专测「invalid value 400」**立即咬住**（1 failed 精确命中）→ 复位 6/6。

RUNTIME-OK：api 6/6 + web 3/3 + vite build exit 0 + precheck --all fail 0。

## 五、实际执行记录（2026-10-19/20）

双会话接力形态：注册运行时面（feat/r123-runtime-refresh 7bed359：6 移动吸收+基线表+离线清单追平+test-r118 根治）与 ncwk 深读面（feat/r123-ncwk-deepread：codex/dsh 架构补充+governance 跨运行时协作治理）互补分支先后合入 main；本档为两支正本合流。

发版链收尾（2026-10-20 01:0x）：①三门禁——jargon 17/0（首跑 3 违例当场改写）/ self-check RC=0（预算第 32 次登记 593920→598016 +4KiB，ncwk 深读增量；版本口径三面同步 v2.87.0）/ test-doc-numbers 124/0（并行支第 31 次登记漏改钉值三面补齐）；②v2.87.0 tag+GitHub release（附 swarm-yuan-offline-v2.87.0.zip 43MB + SHA256SUMS，sha256=9366b754ec1f...ffa9）；v2.86.0 欠发补挂（R122 tag 已在 origin，release 本轮补）；③双实体同步 PASS（cc-switch+zcode 两装机位 v2.87.0）。
