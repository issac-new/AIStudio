# R32：运行时补核调研（ocr v1.12.4 有界读取薄轮 / codex-security npm-v0.1.28 职责收敛，2026-09-16）

- 调研角色：R32 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-16 晚（R31 同日第二轮——用户 /goal 目标 2 晚间再次触发）
- 触发：用户 /goal 目标 2「自动更新 research 目录下运行时到最新稳定版本，比较和上一版功能差异，整合吸收优化 skill 能力」显式指令
- 上轮基线：2026-09-16 R31（ruflo v3.42.1 / ocr v1.12.3 / graphify v0.9.62 / gstack v1.87.4.0 / claude-code v2.1.273 五行升基线）
- 数据来源：17 个本地克隆 git fetch + tag 全量比对（17/17 成功）+ npm view 复核（claude-code latest 2.1.273 / codex 0.154.0 / deepseek-harness 0.0.1 无关占位）+ 本机 live CLI 实测（claude/codex --version）
- 执行纪律（沿 R26-R31 轻量补核先例）：本轮两行移动全为 patch 级薄轮，吸收内容全部为方法论注记级——**不升门禁、不改 SKILL.md、不发版**

---

## 第一部分：17 克隆扫描全景

| 运行时 | 上轮基线（R31） | 最新稳定（2026-09-16 晚三核） | 判定 |
|---|---|---|---|
| ocr | v1.12.3 | **v1.12.4**（tag 2026-09-16 17:48 +0800；v1.12.3 为其祖先=同线；5 commits） | 移动——**薄轮**：#1310 超大未跟踪文件读前跳过 + #1288 untracked binary 判定 + #1156 workflow_run 触发回退 |
| codex-security | npm-v0.1.27 | **npm-v0.1.28**（tag 2026-09-15 22:21 PDT） | 移动——#923 fix-finding 限于安全漏洞 + #926 cost 估算区间 + #924 KB 任意扩展名 |
| superpowers | v6.3.0（台账基线，2026-08-14 已吸收） | v6.3.0（b36e082，2026-08-12 后无新版） | 克隆物化同步——本地 clone 原停 v6.2.0，checkout 对齐台账基线；v6.3.0 内容（Hermes Agent 支持/brainstorming 三路路由/Codex hook 修复）R-轮已吸收，非新增量 |
| harnesseval-w | ed4ccc6（R29 记录值） | ed4ccc6（origin/main HEAD） | 克隆物化同步——clone 原停 afa6c5f（落后 1 commit），fast-forward 对齐 R29 记录值 |
| claude-code | v2.1.273 | v2.1.273（npm latest；stable 通道 2.1.267 分裂维持） | 零增量。本机 live 实证：native 安装 `~/.local/bin/claude` = **2.1.273 已是 latest**；`/usr/local/bin/claude` 2.0.44 陈旧影子仍在（用户裁决项，未动） |
| codex | rust-v0.154.0 | 0.155.0 仍全 alpha（R31 核 alpha.10） | 零 stable 增量。live codex-cli 0.154.0 实测一致 |
| dsh | dsh-v0.1.5-rc.2 | rc.2（0.1.6-alpha.1 维持 alpha 不取） | 零 stable 增量——R28 预警（pkg/运行时解析重构）继续兑现中 |
| graphify | v0.9.62 | v0.9.62 | **v1.0.0 tag 本轮再次诱取后复核回退**（见第三部分） |
| gstack | v1.87.4.0 | v1.87.4.0（origin/main 零领先） | 零增量 |
| ruflo | v3.42.1 | v3.42.1 | 零增量 |
| gsd-core | v1.14.0 | v1.14.0 | 零增量 |
| claude-mem | v13.24.23 | v13.24.23 | 零增量 |
| comet | 0.4.1 | 0.4.1 | 零增量 |
| ECC | v2.2.1 | v2.2.1 | 零增量 |
| openspec | @fission-ai/openspec@1.13.0 | 1.13.0 | 零增量 |
| GitNexus | v1.6.12 | v1.6.12（rc 线不取） | 零增量——license-risk 维持不追 |
| better-harness | v0.6.6（仓内登记，非 16 行台账对象） | v0.6.6 | 零增量 |

## 第二部分：两行移动实质

### ocr v1.12.4（薄轮，方法论注记级）

- **#1310 perf(diff)：超大未跟踪文件读前跳过**——进入读取前先量体积边界。「预算前置」有界读取族：与 claude-mem #3575 健康探测按调用方剩余死线封顶同族（动态面），此处为静态面兄弟（不可控输入先验界再消费）。
- **#1288 fix(diff)：workspace 模式 untracked binary 判 binary**——不可分析输入显式分类，不把二进制当文本硬读（诚实族）。
- **#1156 feat(action)：可选 pr_number 输入 + workflow_run 触发回退**——事件源（pull_request 事件）不可靠时的第二触发通道，带回填校验测试。
- 吸收落点：`references/review-methodology.md` R32 段。台账 ocr 行两列同步。

### codex-security npm-v0.1.28（patch 级）

- **#923 fix(skills)：fix-finding 限于安全漏洞**——扫描技能产出职责收敛：发现面不得越出威胁模型承诺去报非安全问题（scope fail-closed 族）。与 R24「文档尺寸上限从 scan-contract 删除」互补：一收一放同在契约诚实性谱系。
- **#926 fix(cost)：上下文感知估算区间**——估算给区间不给点值（诚实报告族）。
- **#924 feat(cli)：KB 接受任意扩展名文本**——输入宽容化，与 #923 产出收敛构成双向口径。
- 吸收落点：`references/codex-security-methodology.md` 版本注记 R32。台账 codex-security 行三处同步（引用基线/最新版/状态列）。

## 第三部分：graphify v1.0.0 二次甄别（方法论教训）

本轮 fetch 后 `git tag` 扫描将 v1.0.0 判为 graphify 最新稳定并已 checkout；台账 R31 裁决列明确记载「**v1.0.0 tag 甄别为 2026-04-05 旧异源、不在 v8 线，不取**」。复核实证：`git log -1 v1.0.0` = 2026-04-05 22:40 +0100（v0.9.62 = 2026-09-15 18:57 +0100，origin/v8 线），确系旧线异源；已 `git checkout v0.9.62` 回退。

**教训（登记）**：轻量补核轮的 checkout 动作必须先过台账裁决列再执行——「版本号标签 ≠ 实质判定」（R27 口径注记）不仅约束吸收判定，也约束**基线物化动作**本身。机械的「取最大版本号 tag」会在异源/换线仓库重蹈覆辙。

## 第四部分：live 运行时对账

| CLI | 台账基线 | 本机 live 实测 | 判定 |
|---|---|---|---|
| claude-code | v2.1.273 | `~/.local/bin/claude --version` = 2.1.273（native 通道） | 一致，零动作 |
| codex | rust-v0.154.0 | `codex --version` = codex-cli 0.154.0 | 一致，零动作 |

存留登记：`/usr/local/bin/claude`（npm 全局 @anthropic-ai/claude-code@2.0.44）为陈旧影子装，与 live 通道并存，处置待用户裁决（沿用既有登记，本轮不扩大动作面）。

## 第五部分：本轮改动清单

1. `docs/upstream-baseline.md`：R32 口径注 + ocr 行（引用基线/最新版两列）+ codex-security 行（引用基线/最新版/状态三列）。机器标记两行均维持 `baseline_status=synced`。
2. `swarm-yuan/references/review-methodology.md`：R 通道追加 R32 段。
3. `swarm-yuan/references/codex-security-methodology.md`：§十二版本注记追加 R32。
4. 本档：`docs/research/R32-runtime-refresh.md`。
5. 克隆物化（gitignored 不入 git）：superpowers → v6.3.0、harnesseval-w → ed4ccc6、graphify 回退 v0.9.62、ocr → v1.12.4、codex-security → npm-v0.1.28。
