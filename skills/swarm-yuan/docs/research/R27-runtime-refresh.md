# R27：运行时补核调研（ocr 名义 minor 实薄轮 + graphify 未分类浮出 + ruflo 索引保护/预算封顶 + claude-code 回归修复，2026-09-13）

- 调研角色：R27 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-13
- 触发：用户 /goal 目标2「自动更新 research 目录下运行时到最新稳定版本，比较和上一版功能差异，整合吸收优化 skill 能力」显式指令
- 上轮基线：2026-09-12 R26 补核（claude-code v2.1.269 / codex rust-v0.154.0 / dsh dsh-v0.1.5-rc.2 / ocr v1.11.9 / claude-mem v13.24.23 / graphify v0.9.58 / ruflo v3.41.1 / 16 行全景）
- 数据来源：15 个本地克隆 git fetch + tag 全量比对（git describe 验证：ocr @v1.12.0、graphify @v0.9.61、ruflo @v3.41.2）+ npm dist-tag（claude-code / ruflo / openspec）+ anthropics/claude-code CHANGELOG raw
- 执行纪律（沿 R26 轻量补核先例）：本轮四行移动实质均为 **patch 级**（ocr 虽名义 minor，内容为实现面 perf + 查看器面，无新治理原语——版本号标签 ≠ 实质 minor，判定以内容为准），不开全量调研、不升门禁、不发版

---

## 第一部分：16 行扫描全景

| 运行时 | 上轮基线（R26） | 最新稳定（2026-09-13 核） | 判定 |
|---|---|---|---|
| ocr | v1.11.9 | **v1.12.0**（tag 2026-09-12 22:00 +0800，2 commits / 12 文件 +471/−46） | 移动——名义 minor 实薄轮 |
| claude-code | v2.1.269 | **v2.1.270**（npm latest；stable 通道仍 2.1.236 分裂持续） | 移动——单条回归修复 |
| graphify | v0.9.58 | **v0.9.61**（tag 2026-09-12 22:23 +0100，跨 0.9.59/60/61，20 commits） | 移动——修复+浮出族 |
| ruflo | v3.41.1 | **v3.41.2**（tag 2026-09-10 19:45 UTC = 北京 09-11 03:45，npm Latest 已跟进；R24 核测在其 npm 发布前后脚，属窗口期错过非漏检） | 移动——保护+同意族 |
| codex | rust-v0.154.0 | 0.155 仍全 alpha（alpha.3.10，无 stable） | 零 stable 增量 |
| claude-mem | v13.24.23 | v13.24.23 | 零增量 |
| openspec | 1.13.0 | 1.13.0（npm 复核） | 零增量 |
| gsd-core | 1.13.0 | 1.13.0 | 零增量 |
| comet | 0.4.0 | 0.4.0 | 零增量 |
| superpowers | 6.3.0 | 6.3.0 | 零增量 |
| gstack | 1.84.1.0 | 1.84.1.0（origin/main HEAD 仍 71f6048） | 零增量 |
| ECC | 2.2.1 | 2.2.1 | 零增量 |
| codex-security | npm-v0.1.27 | npm-v0.1.27 | 零增量 |
| better-harness | 0.6.6 | 0.7.0-alpha1/alpha2（预发布不取） | 零稳定增量 |
| dsh | dsh-v0.1.5-rc.2 | dsh-v0.1.5-rc.2 | 零增量 |
| GitNexus | npm 1.6.9 | rc 线续（v1.6.12-rc.42），stable 未出，npm 停滞 | license-risk 维持不追 |

**graphify v1.0.0 tag 甄别**：git tag v1.0.0 存在但 commit 日期 2026-04-05 且不在 origin/v8 线上（`git merge-base --is-ancestor` 实测否定）——为 4 月旧异源分支 tag，与本仓跟踪的 Graphify-Labs v8 线无关，**不取**。真最新稳定 = v0.9.61。

---

## 第二部分：四行移动深读

### 一、ocr v1.11.9 → v1.12.0（2 commits）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| 分组返回文件索引而非路径（#1209） | grouping 内部接口以 index 传递，省去路径反复解析（perf 实现面） | 不吸收——纯实现面重构 |
| viewer store 会话态（store.go +139 / store_test.go +137 / session.html） | 查看器会话存储与对比页状态 | 不吸收——纯查看器面（R26 #1175 同域维持） |
| glm-5.3 通道命名 chore | `z-ai coding plan` → `z ai api` 同步 | 环境事实级注记 |

**判定：名义 minor、实质薄轮**——无新方法论原语进执法面。本轮的元认知收获：**版本号标签不承载实质承诺，吸收判定以内容为准**（0.1.x 语义化承诺在小步快跑仓不成立，graphify 0.9.x 与 ocr 1.12 均为实证）。

### 二、claude-code v2.1.269 → v2.1.270（单条）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| 只读 git 命令误要权限修复 | 269 权限通道修复自身引入的回归：长会话中 read-only git 命令意外触发权限询问 | **落地（注记级）——权限通道变更须带回归面**：269 修 tee 旁路（写路径检查收紧）反手破坏了只读路径的免询问——同域收紧须成对验证「堵住旁路」与「不误伤正路」。与 R22 prompt-cache 工具动态族「宿主行为版本间不保证稳定」第四次实证同向：宿主修复轮自身即回归源 |

### 三、graphify v0.9.58 → v0.9.61（20 commits，跨 0.9.59/60/61）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **未分类文件浮出**（c9da36d + cd85522） | GRAPH_REPORT.md 列出未分类文件；`graphify update` 路径同样浮出（双出口） | **落地（注记级）——「不可分类 ≠ 静默跳过」诚实族图谱构建侧新样本**：无法归类的输入必须在产出物中留名，与「缺失证据不显示为零」同根，作用在构建侧而非展示侧（展示侧先例：gsd no-op 报真实条件） |
| **os.replace 回退语义**（df5a904 族 6 commits） | Windows 下 replace 失败走 fallback swap；fallback 失败**恢复目标原状**；src==dst 守卫；symlink 目标保持 replace 语义；GraphML 导出/AST 缓存/skill 安装写入统一走共享 helper | 注记——**写安全族**：原子写失败不得留下半态（恢复目标 + 守卫退化输入 + 单一共享写路径），与 ocr 报告原子写入（R22）同族 |
| Python 3.12/3.13 断裂修复（fe66389） | 0.9.60 引入的断裂，0.9.61 连环修 | 注记——**连环修复纪律**：发布破坏 → 下版即修，但断裂曾入库本身说明发布门禁缺运行时矩阵（与本仓「旧实现必挂」判别器方向同向的反面样本） |
| Python 3.14 可选依赖 + 依赖地板抬升（b42e5bc/0fc3147） | 3.14 optional deps 支持；带漏洞依赖地板提升 | 环境事实级注记 |
| JS 导出函数内调用解析（含 aliased imports）+ workspace exports 按 importer 平台选择（cd6e05d/47ddc5c） | 图谱边完整性扩展 | 注记——图谱完整性族延续（R24 python/php/bash 边扩展之后 JS 面深化） |
| C/C++ 头文件 EOF 换行、Office/Workspace sidecar 豁免 | 解析边角 | 修复族对账通过 |

### 四、ruflo v3.41.1 → v3.41.2（4 commits）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **内存索引保护**（13880e3） | 修复 daemon/memory 销毁用户索引 | **落地（注记级）——破坏性操作守卫族**：对用户既有资产的写操作（重建/清理类）必须先辨「这是我的产物还是用户的资产」；方法论引用层登记 |
| **autoStart:false 被尊重**（同 commit） | 显式 opt-out 此前被忽略 | 注记——**同意面**：显式否决语义必须生效（与 fail-closed 族互补：默认安全管缺省，同意面管显式拒绝） |
| **Seraphina 预算封顶替代 ad-hoc 计数**（8485302，x-gateway 0.6.1） | 协调者按预算（budget）封界而非拍脑袋条数上限 | 注记——**有界性族精化**：界的形式从「计数上限」升级为「预算分配」（与 claude-mem #3575 剩余死线封顶、claude-code 并发 env 同族——资源边界按预算而非魔法数） |
| 默认频道声明（a64f8b1） | 安静频道仍可被发现 | 注记——可发现性（零活动 ≠ 不存在，与「缺失证据不显示为零」同根在发现面） |

---

## 第三部分：落地载体清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | `docs/research/R27-runtime-refresh.md` | 本档 |
| 2 | `docs/upstream-baseline.md` | R27 口径注 + 四行升基线（ocr v1.12.0 / claude-code v2.1.270 / graphify v0.9.61 / ruflo v3.41.2）+ graphify v1.0.0 异源甄别注记 |
| 3 | `swarm-yuan/references/review-methodology.md` | R27 行（ocr 薄 minor 对账 + 版本号标签 ≠ 实质判定口径） |
| 4 | `swarm-yuan/references/claude-code-capabilities.md` | 新增「版本注记：v2.1.270」段（权限通道变更须带回归面） |
| 5 | `swarm-yuan/references/code-graph-tools.md` | R27 行（未分类文件浮出双出口 + os.replace 回退语义 + 连环修复纪律 + JS 完整性） |
| 6 | `swarm-yuan/references/subagent-orchestration.md` | R27 行（内存索引保护 + autoStart 同意 + 预算封顶精化） |

## 第四部分：吸收对账（克制结论）

1. **不升门禁、不改 SKILL.md、不发版**：四行实质 patch 级，无新治理原语进执法面；R18/R24/R26 先例沿用。
2. **本轮会师主题一——诚实口径向构建/采集侧纵深**：graphify 未分类浮出（构建侧）+ ruflo 安静频道可发现（发现面）+ ruflo 索引保护（资产侧）——「缺失/不可分类/零活动 ≠ 不存在、不归零、可销毁」族在三个新侧面成样本。
3. **本轮会师主题二——有界性族精化为「预算制」**：ruflo Seraphina 预算封顶 + claude-mem #3575 剩余死线封顶（R26）——界的形式从计数上限走向预算分配。
4. **回归纪律双样本**：claude-code 270（权限收紧误伤只读路径）+ graphify 0.9.61（0.9.60 断裂连环修）——修复轮自身即回归源，收紧面须成对验证。
