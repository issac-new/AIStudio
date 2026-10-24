# R79 运行时刷新档（2026-09-30，例行轮）

## 结论

**4 移动（3 物化 + 1 npm 记档）+ 15 零移动/记档**（19 行台账全覆盖，口径同 R73/R74：只认稳定 tag，rc/alpha 不物化，main tip 漂移单列记档不计为版本移动）。

移动四件：**codex rust-v0.159.0 → rust-v0.159.2**（2 patch，4 提交，release 分支 backport 线）、**claude-code npm 2.1.284 → 2.1.285**（1 patch，本版恢复 changelog 发布）、**graphify v0.9.71 → v0.9.72**（1 patch，20 提交）、**gstack main tip dcaea52 → 96764e8**（+2 快进，提交自述 v1.91.8.0/v1.91.9.0）。

**吸收三条**（全部过决策 46 两问，落 `references/review-methodology.md` R79 段与 `references/claude-code-capabilities.md` 2.1.285 注记）：gstack 测试真实性三连（fake→real boundary / 死评价退役 / never-green 退役）、graphify 派生制品按依赖序原子发布（#3853）+ 可选依赖缺失 warn-once（#3702）、claude-code fork 子代理权限模式继承封闭（委托不提权）。

**dsh 外部对照甄别（防误判记档）**：ncwk/upstream 侧 deepseek-harness fresh checkout 在 21638c5631，**落后**本仓 research 克隆 293 提交（`rev-list --count 21638c5631..origin/master` 实测）——GitHub 真值经 `ls-remote` 直证 master=639ed01539，与本仓 origin/master 一致。外部 checkout 非最新，**不得**据其"降级"本仓物化位；dsh 本轮零移动。

**codex-security npm 通道异常持续**：npm registry 仍无 0.1.32 条目（`npm view time` 实测 latest 停 0.1.31 @2026-09-24T20:14Z），git tag `npm-v0.1.32` 在仓——R74 记档的发布断流未恢复，基线维持 git tag 口径。

## 台账（19 行，R79 态）

| 仓库 | R74 基线 | R79 物化 | 移动 | 备注 |
|------|---------|---------|------|------|
| codex | rust-v0.159.0 | **rust-v0.159.2** | 2 patch（4 提交） | release 分支 backport 线；0.160/0.161 全 alpha；main +127 记档 |
| claude-code | 2.1.284(npm) | **2.1.285(npm)** | 1 patch | npm latest 实测同值；本版恢复 changelog |
| graphify | v0.9.71 | **v0.9.72** | 1 patch（20 提交） | stale-skill 自动刷新 + 原子发布序 + 依赖缺失 warn-once |
| gstack | main tip dcaea52（v1.91.7.0） | **main tip 96764e8**（v1.91.9.0） | +2 快进 | 测试真实性轮（#2994）+ test value bar（#2998） |
| dsh | main tip 639ed01539 | main tip 639ed01539 | 0 | ls-remote 直证 GitHub master 同值；外部 checkout 21638c5631 落后 293 记档 |
| ocr (open-code-review) | v1.12.11 | v1.12.11 | 0 | HEAD=tag=main tip 零漂移 |
| codex-security | npm-v0.1.32 | npm-v0.1.32 | 0 | npm 断流异常持续（registry 无 0.1.32）；main +19 记档 |
| ruflo | v3.48.0 | v3.48.0 | 0 | npm latest 同值；tip +15 无 tag |
| claude-mem | v13.28.0 | v13.28.0 | 0 | tip +92 无 tag |
| superpowers | v6.4.2 | v6.4.2 | 0 | tip 零漂移 |
| gsd-core | v1.15.0 | v1.15.0 | 0 | next tip +70 无 tag |
| better-harness | v0.6.6 | v0.6.6 | 0 | main +203（0.7.0-alpha 线续） |
| openspec | 1.13.2 | 1.13.2 | 0 | npm latest 同值；tip +38 无 tag |
| comet | 0.4.3 | 0.4.3 | 0 | master +1 无 tag |
| ECC | v2.2.1 | v2.2.1 | 0 | main +373 无 tag |
| semantica | v0.7.0 | v0.7.0 | 0 | main +68 无 tag |
| gitnexus | v1.6.12 | v1.6.12 | 0 | main +86 无 tag（rc 线续，license-risk 不追） |
| pua | v3.5.1 | v3.5.1 | 0 | tip 零漂移 |
| harnesseval-w | ed4ccc6 | ed4ccc6 | 0 | 与 origin/main 齐平 |

fetch 执行面：18 克隆 `git fetch --tags --prune origin` 全部 exit 0（2026-09-30 并发实测），claude-code 经 npm registry 判定，harness-practice 为纯链接存根无版本（R37 先例）。

## 移动明细

### codex rust-v0.159.0 → rust-v0.159.2（2 patch，4 提交）

方法论文档 `references/codex-methodology.md` 增 0.159.2 注记，此处记档要点（锚 `git -C research/codex log rust-v0.159.0..rust-v0.159.2`）：

- **0.159.1**（#49323/#49342）：backport 线开启 + GPT-6.1 Sol Bedrock catalogs——目录面与功能面解耦发布。
- **0.159.2**（#49385，ff6aec969）：Windows 启动后台进程/沙箱命令的控制台窗抑制——0.157 `#48483`（piped 子进程）的补全，进程卫生清单收口。平台面，无方法论吸收。
- 0.160.0-alpha.6.1 / 0.161.0-alpha.1–4 全 alpha 不物化；origin/main 领先 0.159.2 达 127 提交（R74 记 +65 相对 0.159.0，记档不追）。

### claude-code npm 2.1.284 → 2.1.285（1 patch，恢复 changelog）

注记落 `references/claude-code-capabilities.md`（R73 升 2.1.284 时闭源无 changelog 未注记，本版恢复）。四条方法层 + 一条产品面卷（锚 `upstream/claude-code` CHANGELOG 首段 2.1.285）：

- **fork 子代理权限模式继承封闭**：fork 运行在父会话权限模式下且不能退出 plan mode——「委托不提权」（吸收点：subagent-orchestration 分派权限边界对照）。
- **managed settings 分级 fail-open**：OS 拒读→warn-and-start；其余读错误/不可解析→全停——按失败原因分级降级（吸收点：降级载体分级对照）。
- **安装面 id 归一化混淆拒绝**：仅差 `.`/`-`/`@`/大小写的 id 拒装他者目录——身份先归一化再比较。
- **沙箱 auto-allow 误报修复**：内联脚本含 `=` 即逐次询问的误报——保守判定的误报面也要养（误报训练橡皮图章，与漏报同罪）。
- 产品面卷：`CLAUDE_CODE_DISABLE_WEB_FETCH` / `claude --desktop` / `plugin configure` / `allowedProviders` / URL 密码脱敏 / MCP 名称转义清洗等约 30 项不吸收。

### graphify v0.9.71 → v0.9.72（1 patch，20 提交）

锚 `research/graphify` CHANGELOG「0.9.72 (2026-09-29)」段（tag v0.9.72 @ 1cd9a36）：

- **stale-skill 自动刷新**（#3895/#1805）：包升级后任意非 install 命令自动刷新管理的 SKILL.md+references sidecar；本地编辑备份 `.bak`；marker 界定的 CLAUDE.md/AGENTS.md 段永不触碰；`GRAPHIFY_NO_AUTO_REFRESH=1` 逃生。与本仓 `--upgrade` 备份目录+项目特定文件保留（R25-D1/R21-A）机制同族，无新消费面，记档不吸收。
- **派生制品原子发布+安全顺序**（#3853）：label 先于 signature、原子写，中断不留悬空社区标签——**吸收**（review-methodology R79 段）。
- **可选依赖缺失 warn-once**（#3702/#3710）：pypdf 缺失从静默零产出改一次性告警——**吸收**（review-methodology R79 段，「依赖在册≠能力可用」）。
- node info 字段名修复（#3918）、kotlin 注解推断属性崩溃修复（#3915/#3899）、导入解析不绑同名字段（#3898）、Blade/razor/SQL/docx/wiki/社区计数等提取器与查看器面——不吸收。

### gstack main tip dcaea52 → 96764e8（+2 快进，v1.91.8.0 → v1.91.9.0）

锚 `research/gstack` log（#2994/#2998，均 squash）：

- **v1.91.8.0 测试真实性大扫除**（#2994）：fake product 测试换真边界（mirror server→真 serve()；源码 grep→行为断言 auth matrix）；死评价代码退役（A1-A4：无 paid caller 的 oracle 连 52 个孤儿 fixture 删）；never-green 退役（断言空/必不能绿的 paid 测试删除而非容忍）——**吸收**（review-methodology R79 段，与 Mutation Check/R70 连红根因四面会师）。
- **v1.91.9.0 test value bar**（#2998）：测试价值条进 plan-eng-review/review/qa/ship 四流程 + 独立 /test-audit——**会师记档**（本仓审查清单已含测试有效性维度，无新增落地单元）。

## 零移动/记档说明

dsh master tip 经 `ls-remote` 直证未动（外部 ncwk checkout 落后 293 提交，防误判记档见结论）；codex-security npm 断流异常持续（R74 记档顺延）；ruflo/claude-mem/gsd-core/comet/ECC/semantica/gitnexus/openspec/better-harness 九仓 tip 前移无新 stable tag（前移数见台账备注）；ocr/superpowers/pua/harnesseval-w 四仓 tip 零漂移；gitnexus rc 线续（license-risk 维持不追）；better-harness 0.7.0-alpha 线续。

## 吸收判据两问登记（决策 46）

| 吸收条目 | ① 哪个环节缺 | ② 谁消费（真实触达） |
|---------|-------------|-------------------|
| gstack 测试真实性三连 | 行为测试「不得钉实现文本」「never-green 即退役」无成文口径 | review-methodology（分发行）审查执勤触达；tests/ 防复发锁豁免边界（R78 先例）对照 |
| graphify 原子发布序 | 多文件派生写回的「被依赖者先写」顺序纪律未成文 | review-methodology 审查清单原子性族（R74 行同区续写） |
| graphify 依赖缺失 warn-once | 「依赖在册≠能力可用」死信号防御缺下半句 | review-methodology 死信号防御族（R75-F1 同区续写） |
| claude-code fork 权限继承封闭 | 分派子任务的权限边界继承声明缺失 | claude-code-capabilities（分发行）注记吸收点，分派执勤触达 |

不吸收记档：graphify stale-skill 自动刷新（与 --upgrade 机制同族）、codex 0.159.2 两项（平台/目录面）、claude-code 产品面卷、gstack /test-audit 命令面。

## 验证记录

- **首轮 sweep 抓红一处（机器执法有效样本）**：test-r68-jargon-free 检出本轮新写吸收段含禁用自造词「空转」1 处（review-methodology.md:507）——按 R69 术语词典修为标准词「不生效」后复测 7 ok/0 fail。r68 执法面对新落盘文案的即时拦截即其设计目的，记档。
- **全量 sweep**（run-sweep.sh：锁测试 46 + e2e 3 + verifier all + self-check）：复跑全绿（EXIT=0，52/52）。
- **self-check**：EXIT=0——R13 预算断言（UNIVERSAL_FILES 实测 497697B ≤ 新预算 499712B）与版本口径三面锚（CHANGELOG 首行=根 README badge=技能 README badge=v2.42.0）均在位。
- **流程注**：首轮 sweep 以管道启动致真实退出码被 tail 掩盖（聚合失败仍回 0 的假象），复跑改为重定向落盘直读 EXIT——本地验证的退出码必须直读，不得经管道转手。

## 部署副本同步

`~/.cc-switch/skills/swarm-yuan`（`~/.zcode/skills/swarm-yuan` 软链目标）：文本面 rsync 对齐（排除 research/ 与部署本地 .claude）；research 克隆区本轮物化三仓（codex→rust-v0.159.2 / graphify→v0.9.72 / gstack→96764e8），其余 checkout 维持台账真值。
