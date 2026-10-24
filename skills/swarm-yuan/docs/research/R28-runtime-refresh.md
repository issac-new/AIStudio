# R28：运行时补核调研（gsd-core v1.14.0 遏制单点化/lint 机械守门 + GitNexus stable 首出维持不追，2026-09-14）

- 调研角色：R28 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-14
- 触发：用户 /goal 目标2「自动更新 research 目录下运行时到最新稳定版本，比较和上一版功能差异，整合吸收优化 skill 能力」显式指令
- 上轮基线：2026-09-13 R27 补核（claude-code v2.1.270 / codex rust-v0.154.0 / dsh dsh-v0.1.5-rc.2 / ocr v1.12.0 / claude-mem v13.24.23 / graphify v0.9.61 / ruflo v3.41.2 / gsd-core v1.13.0 / GitNexus v1.6.11 / 16 行全景）
- 数据来源：15 个本地克隆 git fetch + tag 全量比对（git describe 验证：gsd-core @v1.14.0、GitNexus @v1.6.12）+ npm dist-tag 复核（claude-code latest 2.1.270 / ruflo 3.41.2 / openspec 1.13.0）
- 执行纪律（沿 R26/R27 轻量补核先例）：本轮两行移动中 gsd-core 为**实质 minor**（178 commits / 604 文件 +64988/−14818），但可吸收内容全部为方法论注记级，无新治理原语进执法面——不升门禁、不改 SKILL.md、不发版
- 网络注记：github.com 时断时续（16 克隆首轮 12/15 成功，ECC/claude-mem/codex-security 各重试 3 轮后补拉成功）

---

## 第一部分：16 行扫描全景

| 运行时 | 上轮基线（R27） | 最新稳定（2026-09-14 核） | 判定 |
|---|---|---|---|
| gsd-core | v1.13.0 | **v1.14.0**（tag 2026-09-14 00:01 UTC，178 commits / 604 文件 +64988/−14818） | 移动——实质 minor，遏制单点化轮 |
| GitNexus | v1.6.11 | **v1.6.12**（tag 2026-09-12 22:16 +0100，131 commits；rc 线收口 stable 首出） | 移动——**license-risk 维持不追**（PolyForm Noncommercial 不变） |
| claude-code | v2.1.270 | v2.1.270（npm latest 复核；stable 通道 2.1.236 分裂持续） | 零增量 |
| codex | rust-v0.154.0 | 0.155 仍全 alpha（alpha.3.10，无 stable） | 零 stable 增量 |
| ocr | v1.12.0 | v1.12.0（main +3 无新 tag） | 零增量 |
| graphify | v0.9.61 | v0.9.61 | 零增量 |
| ruflo | v3.41.2 | v3.41.2（npm latest/alpha 复核同值；main +26 无新 tag） | 零增量 |
| claude-mem | v13.24.23 | v13.24.23（main +10 无新 tag） | 零增量 |
| openspec | 1.13.0 | 1.13.0（npm latest；beta 通道出现 1.6.0-beta.1——版本号低于 latest 的倒挂预发布，不取） | 零增量 |
| comet | 0.4.0 | 0.4.0 | 零增量 |
| superpowers | v6.3.0 | v6.3.0 | 零增量 |
| gstack | 1.84.1.0（HEAD 71f6048） | 同（origin/main HEAD 不变） | 零增量 |
| ECC | v2.2.1 | v2.2.1（main +33 无新 tag） | 零增量 |
| codex-security | npm-v0.1.27 | npm-v0.1.27（main +37 无新 tag） | 零增量 |
| better-harness | 0.6.6 | 0.6.6（0.7.0-alpha2 预发布不取） | 零稳定增量 |
| dsh | dsh-v0.1.5-rc.2 | dsh-v0.1.5-rc.2（**main 领先 178 commits 无新 rc**——预发布线活跃度异常，rc.3 随时可出，下轮重点盯） | 零增量（预警注记） |

---

## 第二部分：两行移动深读

### 一、gsd-core v1.13.0 → v1.14.0（178 commits，604 文件）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **路径遏制单点化**（#4653/#4636，bbc3f131 + 6 commits） | "make containment ONE decision, resolved two ways"——全部遏制实现删除或路由经唯一 canonical predicate；存活包装器不得自行判定"是否受遏制"；`allowAbsolute` 旗标替换为命名接受集；**symlink 逃逸洞补上**（lexical 检查可被符号链接绕过，failing-first 覆盖先行） | **落地（注记级）——单一事实源族·安全边界精化**：同一决策全仓只允许一个判定者（与 R2 补丁正本收敛同构）；**lexical 路径检查对 symlink 逃逸不设防**——路径语义须在规范化空间比对（与 claude-code v2.1.268 deny/ask 真实路径绕过修复同谱系第六实证） |
| **lint 机械守门 + 违规清零**（#4654，bbdf7e8e8） | 自建 ESLint 规则 `no-unconfined-path-join`（426 行）+ allowlist 文件 + 全仓 drain to zero；安全模型文档同步 | **落地（注记级）——「质量靠门禁不靠自觉」执行侧极端形态**：为架构不变量自建 lint 规则并把存量违规清零，比 review 纪律强一级（守门测试的姊妹手段：测试钉行为，lint 钉写法） |
| **already_present 诚实报告**（#4558，6edd506cc） | restore 计划把与备份字节相同的目的地当缺失报 `eligible`；改为报 `already_present` | **落地（注记级）——「no-op 报真实条件」族计划侧新样本**（R18 #4157 直系延续）：动作宣称前先比对现状，已达成≠待执行 |
| **dispatch-identity 单一所有者**（#4594，c0b2a05d2） | 隔离守卫曾用 regex 刨模型生成的散文判定 run-scoped sentinel 是否适用；改为发射格式与回读解析器同属一个所有者 | **落地（注记级）——协议单一事实源 + 不 regex 解析模型散文**：模型生成文本不是协议面，判定依据须来自结构化字段（宿主行为不可 scraping 的第四次实证，与 claude-code prompt-cache 工具动态族同向） |
| **install-time 校验全注册表**（#3929，4f487e4e7） | `gsd capability install` 校验只看 candidate map → 非空 `requires` 永远不可满足；改为 merged registry（第一方+已装+候选），安装时与加载时同口径 | 注记——**校验口径一致性**：同一校验在不同时点必须看到同一注册表（「预览=执行口径」族的姊妹样本：安装校验=加载校验） |
| **分支真新验真**（#4055，a155ff4fb） | create-and-switch 前验证 phase 分支确实是新的——防已合并分支被 naive 创建复活 | 注记——**创建前验真**（幂等创建族："已存在≠错误但也≠新建"，与 already_present 同根） |
| 命名超时常量迁移（#4523-4528，5 批） | 测试 timeout 魔法数收敛为命名常量 | 注记——界的命名化（与预算制同向：界要可读、可议） |
| WINDOWS.md 台账跨进程串行化（#3780） | 共享台账变更跨进程加锁串行 | 注记——共享可变状态写串行化（与 kanban 触发器共享库事故的"共享库写协议"教训同向） |
| convention 贯穿 completion-path（#4142）等 | 实现面重构 | 不吸收——纯实现面 |

**判定：实质 minor、治理面丰收**——遏制单点化 + lint 清零 + 诚实报告三族并发，但均可吸收为方法论注记，无需动执法面。

### 二、GitNexus v1.6.11 → v1.6.12（131 commits，stable 首出）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **license 复核** | LICENSE 原文 = PolyForm Noncommercial License 1.0.0，不变 | **不吸收（决策 18 维持）**——禁商用 license，降级非默认、不追 |
| 诚实状态族样本 | "report diverged and unknown index state instead of stale-guess"（#8bd71c83）+ fail closed on foreign embedding identity（#7bbaf6b7）+ staleness 显式态 | 注记（仅登记）——若 license 日后解除，此三处是优先吸收点；当前零接触 |
| 可配置索引存储与内容保留（#3272 系列） | 存储位置与保留策略可配 | 不吸收——license 屏蔽 |

**判定：stable 首出但 license-risk 不变，维持不追**——只在基线表登记版本事实，引用载体许可证表同步。

---

## 第三部分：落地载体清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | `docs/research/R28-runtime-refresh.md` | 本档 |
| 2 | `docs/upstream-baseline.md` | R28 口径注 + 两行升基线（gsd-core v1.14.0 / GitNexus v1.6.12 stable 首出注记） |
| 3 | `swarm-yuan/references/gsd-patterns.md` | 新增「gsd-core v1.14.0 要点」段（遏制单点化 + symlink 逃逸 + lint 清零 + already_present + dispatch-identity + install-time 口径） |
| 4 | `swarm-yuan/references/code-graph-tools.md` | GitNexus 许可证表行升 v1.6.12（stable 已出、license-risk 不变） |

## 第四部分：吸收对账（克制结论）

1. **不升门禁、不改 SKILL.md、不发版**：两行移动的吸收全部为注记级；R18/R24/R26/R27 先例沿用。
2. **本轮会师主题一——单一判定者族三样本并发**：遏制 canonical predicate（决策单点化）+ dispatch-identity 单所有者（协议单点化）+ install-time 全注册表（校验口径单点化）——"同一决策只允许一个判定者"在决策/协议/校验三面同时收口。
3. **本轮会师主题二——守门手段升维**：自建 lint + 违规清零（写法面）与守门测试（行为面）互补；"质量靠门禁"从测试单一手段扩展为测试+lint 双手段。
4. **预警登记**：dsh main 领先 rc.2 达 178 commits 无新 rc——0.1.5 rc.3 或 0.1.6 随时可出，下轮运行时轮优先深读；openspec beta 通道出现版本号倒挂（1.6.0-beta.1 < latest 1.13.0），属上游版本策略异常，观察不取。
