# overlay 仓「开发规范+项目知识」探查报告（路B · 2026-10-16 全量重生成轮）

## 1. 可改范围（硬约束）

- 仅可改 overlay/（工作区 AGENTS.md:5）；upstream/ 严格只读仅 git pull（:7-9）；upstream 变更必须经 patches/ + npm run inject（:11）
- upstream 构成：hermes-studio（v0.7.32 稳定线）/element-web（v1.12.30）/hermes-agent（v0.21.6）+ 参照仓（claude-code/codex/dsh-TUI 等只读）
- simharness/ 独立仓 overlay 只读消费；推演落 ncwk-sim-mux/（SIM_ROOT），不写宿主 ~/.hermes/hermes-agent
- git 只在 overlay/；工作区根非 git 仓（CLAUDE.md:10）

## 2. 改造分类（A/B 类）

- A 类（纯新增）：组件/store/服务放 custom/，经构建期 alias（@/custom）+ entry.mts shim + 运行时 registry（registerRoute/registerNavEntry/registerComponent，registries/client/bootstrap.ts 按 features 开关动态注册）接入，零侵入（README:229-238,317-339）
- B 类（骨架修改）：schema/config/vite/路由等约 7 类运行前置条件走 patch。工作流：upstream 临时改→git diff>patches/NNN-描述.patch→还原上游→series 登记→npm run inject 验证（README:573-581）
- 改 B 类 patch 后后端重启前必须 npm run clean && npm run inject（README:498）
- 上游升级：npm run sync = clean→fetch/reset upstream→re-inject

## 3. 分支规范

- 工作区：基于 overlay main 建 feat/<name>，验证过合回 main；命名 feat/fix/refactor（AGENTS.md:13-31）
- 用户级更强（v2.6）：提交型任务一律 worktree（.claude/worktrees/，≤3 并行，origin/main 起分支，--no-ff 合并保留边界，不跨 worktree cherry-pick，一任务一收口）
- 实证（2026-10-16）：现存分支全 feat/*（cluster-delivery-pushed/cluster-dev-signal/cluster-devimpl-incremental/cluster-expected-work/wp1-server-contracts）+main；工作区根可见 overlay-wt-* worktree 目录
- 偏离需用户明示（「直接在 main 改」「这是只读探索」）；只读探索不产生提交无需 worktree

## 4. 文档约定

- docs/superpowers/{specs,plans,notes}；命名 YYYY-MM-DD-<topic>.md（specs 多 -design 后缀）；specs 112 条目 / plans 52 文件 / notes 3 md
- 设计正本=specs/2026-10-05-mux-v8-fullflow-plan.md（推演全流程唯一正本，终态五部分+本体论六要素）；档案件=mux-history-and-engineering-archive.md；归档约定=specs/archive/README.md（唯一副本+git 历史保全）
- 当前活跃设计簇（2026-10-15/16）：swarmstudio-product-replan + redesign-reconciliation-ledger（对账总表=唯一归属源）+ 四件实施级详设
- 无 CONTRIBUTING/.editorconfig；.github 仅 qgate.yml
- 方案结构七项裁定（记忆 plan-structure-rules）：一事实一源/标题无括号赘述/本体视图对象=推演需求场景/生成执行一图衔接/清理三类处置/能力层按实物展开/跨部分边界卡

## 5. 安全与发布规则

- 构建物：只出 mac arm64 dmg + win x64 zip；dmg 免签 CSC_IDENTITY_AUTO_DISCOVERY=false+notarize=false（本机证书已吊销，签出包被 AMFI SIGKILL）；锚点 build-dmg.mjs:27-38（mac -c.mac.identity=null -c.mac.icon=build/icon.icns；win 必带 --x64）
- 不自动上传：RELEASE-NOTES 多轮明示；build-dmg.mjs 全平台 --publish never
- 密钥/脱敏（shared/ 补件泄漏事故 2026-10-14）：shared/.env.common 与 profiles.yaml 明文真密钥根治——全置换占位+scrub_db 加 VACUUM+collect 认任何 .env*+profiles.yaml；用户硬待办=轮换泄漏密钥（清单 ACCOUNTS.md）
- 审计脱敏：toolresultguard JSONL sha1 脱敏不落原文；eval 密封集防探测契约
- .gitignore 要点：inject 派生产物不入库（.overlay-injected.json/packages//tests//vite.config.overlay.ts）；node_modules 符号链；runtime/ 模板必须入库（D3 事故）；/upstream 不入库

## 6. 验证方式

- 默认浏览器热更新禁止默认装机（P0）：npm run dev 8649 + 内置浏览器走查；仅用户主动要求才装机；例外=Electron 主进程/IPC/原生模块（AGENTS.md:33-46）
- 后端/注入口径（CLAUDE.md）：改 server/patch 后 lsof -ti:8647 | xargs kill -9 再 re-serve；改 B 类 patch 须先 clean && inject；前端热更，仅 alias/entry-shim/vite-config 变更需重启 vite
- 测试门禁：npm test（vitest custom/**）；test:eval（红线负例）；qgate engineering.basic-check（junit 落盘 minTotal 100；退出码 0 但报告含失败=INCONCLUSIVE 不给假绿）+ symbol-grounding（node_modules 借用契约）
- 升级轮门禁口径：纯净树全系列重放→inject N/N→server tsc 0 错→vitest 全量→i18n-coverage→build:full EXIT=0→（出包轮）装机三验（CFBundle 版本+进程存活+8748 livez+chunk 指纹）
- 用户级验证门禁七条：真实工具链先行/每维度单一事实源+守门测试/语言陷阱 checklist/修复回归面=修复点+相邻路径/模板↔产物双向同步/并行同仓先查漂移/收敛判据=零新缺陷完整轮
- 决策倾向：根治优先/合一收敛/自动化+机械验收/实测带锚点/验收标准=无背景者一眼看懂

## 7. 提交规范

- Conventional Commits+中文 subject：type(scope): 中文主题——细节（b38044db feat(pipeline): parallel-review 并行评审编排器——V8.35 会签型大评审自动拆解产品化）；中英文 header 跟随仓库历史
- 提交时机：用户要求或稳定节点不破坏构建；commit 前 git status 干净预期内+跑最小测试
- 测试未绿禁提交（红线）：测试命令与 commit/push/deploy 必须分两轮工具调用，绝不放同一条 && 链（2026-10-15 违例复盘确立）
- pre-commit 门禁：scripts/githooks/pre-commit jargon 词表检查（G7；暂存面 .ts/.vue/.md HARD>0 拒提交；绕过=--no-verify 评审可见；启用 git config core.hooksPath scripts/githooks）；git log 大量「黑话清偿 HARD=0」提交为实证
- 红线六条：不隐瞒失败/不偷工减料/不回避问题/不曲意逢迎/不拼凑鸡汤/严禁编造（结论必须有锚点 file:line/URL/实测输出，未覆盖明说未验证）
- 沟通规范：禁黑话用行业术语/结论先行完整句子/说人话（术语首现括注，验收线=无背景者一眼看懂）

## 8. 项目自述与版本演进

- README：SwarmStudio=基于 hermes-studio 二开（Apache 2.0）；overlay 注入架构让三上游 .git 永不污染可独立升级；核心=信息架构 2.0 六区域+RunTraceView 证据图+SwarmKanban+Matrix Chat 完整客户端（50 组件）+Delivery Cases
- 版本节奏：SwarmStudio 2.x 自有线，每 1-3 天一轮；三类轮次=上游升级轮/自有功能轮/热修评审修复轮；版本行固定格式「SwarmStudio 2.NN（基于 hermes-studio vX+hermes-agent vY 源码跟踪+overlay 二次开发；desktop 捆绑 runtime…）」；每轮必含上游版本/patch regen 编号/门禁终态/产物 sha256/装机三验

## 9. mine-habits 六维统计（2026-10-16，3353 提交/180 天）

- 前缀：feat 966 / merge 787 / fix 753 / docs 508 / other 147 / chore 68 / test 45 / refactor 37 / style 21 / perf 12
- 提交规模：小(<100行) 1437 / 中 690 / 大 309
- 共变 Top：mux 两文档 16；clusterinspector 四件套（collectors⇄detectors 12、inspector 15/14、controller 10/9/7、test 11/11/9/6）；series⇄inject.mjs 4；progress controller⇄store 4
- 热点：patches/series 420 / mux-v8 方案 178 / ycode 吸收矩阵 127 / RELEASE-NOTES 73 / cockpit.ts 69 /（aipay 系 63+56+49——2026-10-03 已迁 simharness）/ package.json 56 / IdeShell.vue 54 / inject.mjs 53 / CockpitView.vue 52 / ia2 WorkbenchView 45 / IdeChatPane 43
- 测试占比：58% 提交触及测试文件
