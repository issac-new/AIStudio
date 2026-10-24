# R83 全量回归轮台账（Angular 21+vitest+pnpm 典型场景执勤）

> 2026-10-02 执勤并收口 · v2.46.0 · 演练项目 `/Volumes/nvme2230/lab/r83-drill-kanban`（Angular ^21.2.0 zoneless+signals+standalone + vitest ^4.0.8（@angular/build:unit-test）+ jsdom ^28 + pnpm 10.33.0，真实可跑：ng build 绿（214KB/58.6KB gzip）+ vitest 22/22 + git 仓库三 tag v0.1.0→v0.3.0）。

## 选栈理由

三大前端框架中唯一未首执勤的 Angular（R56 React / R47+R65+R80 Vue 后第三棒前端线）：组件选择器字符串耦合（@Component selector ↔ 模板 `<app-*>`，编译器只在静态使用处校验）+ DI 装配（providedIn/inject）+ zoneless 测试节奏（whenStable/detectChanges 双拍）+ **pnpm 工具链**（packageManager 字段+pnpm-lock.yaml，npm 混装即坏）+ **vitest 真身**（R82 jest-vitest 伞形命名当轮 jest 在跑，本轮 vitest 真跑——伞形命名首次落到原生侧）。

## 一、生成流程 12 步（全通，mark-active active）

- ⓪ self-check --check-only 绿；⓪.5 mine-habits 真跑（2 commits 窗口，诚实降级记录）；① 探查六阶链 cognition.md 落盘；①.5 relations-extract 19 条 import 边 + detect-frameworks 2 框架（angular+jest-vitest）+ §4 清单 13/13（计数核验 1.00）；② 特征卡 17 项；③ generate-skill create（auto→standard 档 109 文件，自定义 target-dir `r83-drill-skills/`——R82-D2 修复面复验）；④ 六文件填充（codebase 版本表按 R82-D1 口径记 manifest 声明值+实装说明列）+ framework-knowledge 22 条规律全带 file:line 证据；④.5 --inject-frameworks（2 框架区块 sha 落痕）；⑤ conf-render（**TEST_CMD='pnpm test'/BUILD_CMD='pnpm build' 正确识别 pnpm 工具链**）+ 5 个 TODO:model 语义变量人工填（WRITABLE/READONLY/SCAN/CONSISTENCY/LAYER_DEFS）；⑤.5 hooks 双宿主审读（默认适用）；⑥ precheck --all 绿（check_test 真跑 vitest）；⑦ AI 五维自审（ocr 无 LLM endpoint 诚实降级）+ review-record 落盘——**本步照 SKILL.md 旧⑦行调用 `generate-skill.sh --review` 触发 D1**；⑦.5 框架 glob 填充（ANGULAR_SRC_GLOBS+VITEST_* 四变量）；⑧ memory-writeback 3/3；⑨ verify-completeness --strict（独立 cwd 调用，**R82-D2 修复实证生效：项目侧账本经 conf 三级解析命中**）→ mark-active active（六关全过：spec-first 联动/框架 glob/计数核验/占位符零/决策账本/HALLUCINATION；7 条 STABILITY_WARN advisory 如实记录不阻断）。

## 二、执勤工作（三项）

### WP1 关键词搜索+状态筛选（v0.2.0）——九节点全流程
- spec-first 三态实测：① 无 spec 写 src → deny（SPEC_GLOB 联动 `.swarm-yuan/spec/*.md` 正确，deny 理由含解除路径+gate-audit 落盘）；② 合格 spec（## 决策记录）→ 静默放行；③ 占位 spec（待填充）→ 继续拦。
- TDD：T1-T5 先红（5/5）→ 实现（searchTerm/statusFilter signal + filteredTasks computed——过滤在展示层派生，服务保持单一职责）→ 18/18 绿。
- 门禁真执法三现：--all 首跑 check_branch fail（演练项目在保护分支 master——切任务分支即合规，R56-D3 双名默认保护的正面执法）；--all-full 首跑 §5.5 fail 2 处（勾选清单形态未按契约+LAYER_ORDER 方向读反——**后者暴露 LAYER_ORDER 语义无文档锚点**，见观察 3）。
- 状态机六阶段：open→design（proposal 准入门真实拦截：缺 proposal.md 即 fail）→build→verify（verify_result/verify_evidence 双字段）→archive 全走通；跳级拦截（open→build）真执法。

### WP2 优先级排序静默失效修复（v0.2.0 内合入）
- 预埋缺陷 `localeCompare` 字典序：high<low<medium ≠ 业务序高>中>低——TS strict 拦数值减法形态（TS2363），字典序形态编译通过、运行静默错序。
- 专项红测试（插入序 [low,high,medium] → 断言 [high,medium,low]，实测得 [high,low,medium]）→ 修（models 增 PRIORITY_RANK 唯一事实源）→ 20/20 绿。fix 档 spec（§1-§4+§5.5+§12）同流程。

### WP3 TaskCard 组件提取+指纹自成长链（v0.3.0）
- 受控组件提取（input.required\<Task\>+output statusChange，不注入服务）；既有 20 用例零改动全绿=行为保持实证；新增 TaskCard spec 2 例 → 22/22。
- 指纹链全通：--write 基线（38 文件/13 ts/cksum 2586163807）→ 重构 → --diff 感知（38→42、Δ4、ts 13→15、scope=src 精准）→ inventory-update 单条更新（§4 append TaskCard+replace TaskList，各带决策落痕）→ relations-extract 边集重建（19→23，新边自动检出）→ inventory-verify 全 PASS（前端 UI 组件 14）→ --write 新基线（42/4080340883）。

## 三、生成器缺陷台账（2 修）

### D1 generate-skill.sh 未知旗标静默落入 skill-name 位 + SKILL.md ⑦ 行幽灵入口（P1 修）
- **现象**：照 SKILL.md 生成流程表 ⑦ 行原文 `--review`（ocr 5 维度或 AI 清单）对 generate-skill.sh 调用 `--review <skill_dir>` → "--review" 被当技能名、目标技能目录被当项目根 → 在交付技能内部嵌套生成 `.claude/skills/--review/` 109 文件垃圾骨架（污染交付物）。
- **根因双触点**：① SKILL.md ⑦ 行未标脚本归属（同表其余行均为 generate-skill.sh 显式调用，审查旗标真身是 `precheck.sh --review`——GATE_FLAGS 在册，generate-skill.sh 从未实现 --review，属「文档宣称-实现」裂缝）；② generate-skill.sh 主位置参数路径对未识别 `--*` 零守卫（已知子命令各自拦截后，剩余首参以 `--` 开头即静默变技能名）。
- **修法**：① 主路径加未知旗标守卫（fail-closed，报错列出支持旗标并指明审查入口真身）；② SKILL.md ⑦ 行钉死脚本归属（AI 第三方审查+precheck.sh --review+R83-D1 注记）。
- **同族清剿**：全仓 `--review` 宣称面 grep——references/ 五档（gsd-patterns/industry×2/security-spec/claude-code-capabilities）均指 precheck.sh --review 实存旗标，零幽灵残留；其它脚本位置参数解析（relations-extract 等）已有「未知参数」守卫先例，无同族。generate-skill.bat 透传 %*，守卫在 .sh 侧生效即覆盖。

### D2 check_reuse §5.5 勾选核验 awk 区间自塌（P1 修）
- **现象**：spec 按模板自身标题形态（spec-template.md:115 `## 5.5 ★复用约束`）填写、4 勾齐全，check_reuse 仍恒报「§5.5 拼装合规声明未全部勾选（0/4 已勾）」假拦——WP1 门禁首跑实测。
- **根因**：区间提取 `/复用约束|拼装合规声明/,/^## [0-9]/` 的终止模式与模板标题形态冲突——`## 5.5` 同一行命中起止两模式 → awk 区间自塌为单标题行，checkbox 全在却计 0。R82 靠 `## §5.5` 形态碰巧绕过（§ 破坏数字匹配），模板形态从未走通。且原终止只认数字标题 → 非数字标题（## 回滚）不终止 → 区间吞到文件尾，后续段落 checkbox 误计入本段（未勾箱假拦/勾选箱假放行双向面）。
- **修法**：区间改「标题含关键词进、任意其它 ## 标题出」（`inr` 状态机形态）——两种标题形态均正确解析+计数面收紧到本段。
- **同族清剿**：全仓 `^## [0-9]` 区间模式 grep 仅此一处；§19/§20/§21 左移检查用 `grep -qE '^## .*19.*测试左移|^## §19'` 双形态兼容形态，非同族。
- **变异锁**：`tests/test-r83-full-regression.sh` 11 断言（D1 行为锁 5：未知旗标非零退出+报错指引+零污染+家族面+正路 create 不回归；D2 行为锁 2：模板形态 4 勾通过（fixture 含非数字标题段未勾箱防误计）+勾选不足仍拦；源码锁 4：双注记+区间形态+SKILL.md 归属句）。变异验证：三方向变异（摘守卫/回旧区间/⑦行回幽灵句）→ 7 红；恢复 → 11/11 绿。

## 四、链路实测记录（全过）

| 链路 | 实测结果 |
|------|---------|
| detect-frameworks | 2 框架命中（angular/jest-vitest），ACTIVE_FRAMEWORKS AUTO 回填正确 |
| conf-render Node 分支 | **pnpm 工具链正确识别**（TEST_CMD='pnpm test'/BUILD_CMD='pnpm build'）——npm 脚本嗅探面无 pnpm 盲区 |
| generate-skill create | standard 档 109 文件（auto 判定输出依据：46 文件数）；自定义 target-dir 断点续传幂等（draft 态 3 续传跳过） |
| mark-active 六关 | 全过；DIM 表前端 UI 组件 13→14（WP3 后）；STABILITY_WARN 7 条 advisory 如实记录 |
| spec-first 三态 | deny 双落痕/合格放行/占位继续拦（SPEC_GLOB 自定义值联动正确） |
| 门禁执法面 | check_branch master 保护/check_layer 层序 9 违规拦截（配置反向时）→修后过/§5.5 勾选契约/check_test 真跑 vitest |
| 状态机 | proposal 准入门+六阶段推进+跳级拦截+verify 证据门全真执法 |
| 指纹自成长 | --diff Δ/cksum/scope 精准；边集 19→23；inventory-update append/replace 双形态；inventory-verify PASS |

## 五、执勤侧观察（非缺陷，记档）

1. **vitest 伞形命名首次原生落地**：Angular 21 新项目默认 vitest（@angular/build:unit-test 构建器）——R82 观察「jest 项目填 VITEST_* 四变量」当轮是兼容设计，本轮 vitest 真身零适配成本（VITEST_TEST_GLOBS 填 `src/**/*.spec.ts` 直接生效）。框架空转拦截对 vitest 原生项目形态同样有效。
2. **Angular 组件选择器耦合不在机械提取面**：@Component selector ↔ 模板 `<app-*>` 是双向字符串耦合（改 selector 只在静态使用处编译报错），relations-extract 的 import 边不覆盖——本轮以 reference-manual §5 说明+framework-knowledge 规律 1 承载（AI 语义面），与 R82 TypeORM 装饰器耦合同处置口径。
3. **LAYER_ORDER 方向语义无文档锚点**：LAYER_ORDER 语义（序首=最高层，依赖只许自上而下）在 arch.conf 行内注释的例示（presentation→infrastructure）之外无显式说明——本轮按例示反读初填即反（9 违规假象），对照 gates-strict 比较逻辑才摆正。门禁执法正确、配置语义可发现性弱，记档待后续评估（不构成本轮缺陷：例示形态可推导）。
4. **pnpm 项目 npm 混装即坏**：node_modules 符号链接结构对 npm install 不兼容——已在 drill 技能 release.md 失败排查+SKILL.md 反借口表承载；生成器 conf-render 本轮实证无盲区（观察 1）。
5. **zoneless 测试节奏**：DOM 断言需 whenStable+detectChanges 双拍；「不发生某请求」类断言用 expectNone 行为级证明比读 DOM 值稳（ngModel 回写在 zoneless 下不保证 DOM 反映 signal 重置）——已沉淀为 drill 项目 framework-knowledge 规律，供 jest-vitest 档参考。
6. **状态机单变更单状态文件**：state.yaml 是单变更粒度，多工作包串行时应逐包 init 新变更——本轮 WP2/WP3 复用 WP1 状态（archive 后 transition 拒绝回退是正确执法），流程语义如实记档。

## 六、收口记录

- worktree：`.claude/worktrees/r83-full-regression`（分支 fix/r83-full-regression，基点 f73bd1b=R82 后 main）
- 变更：`swarm-yuan/scripts/generate-skill.sh`（D1 守卫）+ `swarm-yuan/assets/gates-strict.sh`（D2 区间）+ `swarm-yuan/SKILL.md`（⑦ 行归属）+ `swarm-yuan/tests/test-r83-full-regression.sh`（新增 11 断言锁）+ CHANGELOG（v2.46.0）+ badge 两文件 + 本台账
- 验证：R83 锁 11/11 + 全量 sweep **55/0**（54 基线+R83 新锁）；预算实测 503214B ≤ 503808B 零增量（增量全在 scripts 侧——「脚本不计税」口径免登记）；G9 三断言过（门禁 55≤55/变量 185≤200/上下文 191391B≤194560B）
- 版本：v2.46.0（v2.45.0=R82 后无并行轮占号，本轮无顺延）
