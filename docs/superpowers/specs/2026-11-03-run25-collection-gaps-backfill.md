# run25 采集面缺失全量补流与根治（2026-11-03）

## 变更

用户令（2026-11-03）：对全流程推演方案（`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`）与推演程序（`simharness/aipay-scenario.sh`）声明的全部采集内容做缺失排查盘点，补齐并根治。触发面：run25 报告（`SIM_ROOT/runs/20261102-v8-run25/evidence/final-report.html`）交付物矩阵存在缺项，且无交付物小程序（csw-cashier-mp）UI 截图。

### 盘点结论（五类缺失，均有实测锚点）

| # | 类别 | 缺失 | 根因（实测锚点） | 补法 | 根治 |
|---|---|---|---|---|---|
| A1 | 缺件 | 商户接入文档 `docs/delivery/merchant-onboarding-v1.0.0-cashier.md` 不在 origin/main | run23 补录提交 da1665e 只落在 `integration/RFD-001`/`fix/DEF-BE-S3-04` 分支与 mx-clean 快照 tag，从未进 main 血统（`git merge-base --is-ancestor da1665e origin/main`=否）；历史五轮（run8 回灌/run10 补件/run11 回填/run14 补档/run23 补录）同因反复丢失 | cherry-pick da1665e 进 main | 补件纪律：补件提交必须直接落 main（本 spec 决策 1） |
| A2 | 缺件 | 完备性检查 `docs/delivery/RFD-001-completeness-check.md` 不在 origin/main | 驱动已生成留存（EVID_DIR 2.8K）但 `git push` 失败，记 `ISSUE\|evidence-push`（run25 issues.log:65）后被收尾链自动归桶「观察」（issues.log:72）埋掉 | 留存件补推 main | 收尾终检：EVID 留存件 vs main 在位对账，不一致显式升级待办而非自动归桶（守门测试 2） |
| B1 | 字段缺 | 交付物矩阵 5 件「在仓不符」（tasklist 缺拆分/概设缺背景目标/排期缺关键路径+在制上限/G4 测试报告/审计意见书） | run23 补全提交 fc3658f（交付物七件模板字段补全）同样未进 main 血统 | cherry-pick fc3658f 进 main | 同 A1 |
| C1 | 采集断链 | 小程序 UI 首帧未进报告、产物未进 main | run25 DEV-MP 任务已产 `docs/evidence/DEV-MP-runtime-proof.json/.png`（launchOk=true，2026-11-02T16:22，640×1386 真实开发者工具首帧，BFF 禁外呼守卫态如实标注）随 integration 分支提交，但报告不消费 runtime-proof 产物、main 无此文件 | 产物带进 main；报告步 18 呈现位嵌入，图注标「补录」（帧内容一致法） | 报告断言：前端工程类交付必须有 runtime-proof 呈现（守门测试 3） |
| C2 | 采集断链 | 18b 运行时验证面（方案 §2.5 步 18b：runtime-verify/miniprogram 编译+启动+首帧）程序未接线 | 方案已声明、产品端点已就位（`custom/server/runtime-verify/runtime-verify.ts`，2026-10-11 根治件，其模块注释即预言本复发：「组织内没有任何岗位能把它在真实开发者工具里跑起来……走了功能不存在降级」）、技能已强制（aipaydev-dev SKILL.md:151 run15 起），但 aipay-scenario.sh 无 18b 执行/核验点，run25 全程零 runtime 痕迹（scenario.log/issues.log grep 无命中） | 本轮补流走 C1（产物已存在）；程序接线列决策 3 分期 | 决策 3 |
| C3 | 注册缺 | capture-plan.env 无 18b 呈现位 | 注册表语义只覆盖平台界面（/app/*），runtime-proof 首帧是文件域产物不归 r18-frames 射手 | 注册表加「文件域呈现位」语义行（不射手化） | 守门测试 3 消费同一注册行 |
| D1 | 注册缺 | `dispatch_done`（步 9 派发后任务板承载面）驱动已调用（aipay-scenario.sh:495）但注册表未登记，run25 零帧 | 驱动 capture_step 调用集与注册表无对账机制 | 注册+补拍（studio :8802 实测 200 活） | 守门测试 1 |
| D2 | 注册缺 | `report_done`（步 26 报告承载面 /app/sim）驱动已调用（:3100）但未登记，run25 零帧（r18-steps.json 步 26 为空对象） | 同上 | 注册+补拍 | 守门测试 1 |
| D3 | 注册悬空 | `report_view` 注册但驱动不调用 | 消费方为报告查看步（run25 有帧 report_view-op1-*），语义与 report_done 重叠 | 保留并注释消费方，report_done 独立注册 | 守门测试 1 双向对账（悬空键须注释声明消费方） |

### 本批落地物

1. 中央仓（SIM_ROOT central/aipaydev，仓外推演仓，导演补件通道有先例 c2c0b18）：cherry-pick da1665e + fc3658f 进 main；runtime-proof 两文件从 integration 带进 main；completeness-check 留存件补推。commit message 注明 `RUN=20261102-v8-run25 补流`。
2. simharness（本仓）：capture-plan.env 补 D1/D2 注册行 + C3 文件域呈现位语义；守门测试三件（见验证）；r18-steps.json 步 18 嵌 runtime-proof 呈现（图注标补录）+ 步 9/26 补帧登记。
3. run25 报告重生成（mx-report-gen + final-report-merge），帧图注按 V8.4④ 纪律明示补拍/补录时点。

## 决策记录

1. **补件必须直接落 main 血统**：五轮补五轮丢的根因=补件提交落 integration/fix 分支后无人合流，mx-clean 每轮清场后补件只活在快照 tag 里。此后凡「缺件补齐」类提交一律直接提交/ cherry-pick 到 main，禁止只落特性分支。（本案执行时同样遵守：cherry-pick 目标=main。）
2. **不动 run25 历史状态**：补流不改 state.env 通过标记与六闸判词，报告重生成仅增补呈现（缺件消红+小程序首帧+两帧位），图注明示补录时点；审计器重跑以新 main 实查。
3. **18b 程序接线分期**：本轮只补产物呈现（C1），不在 aipay-scenario.sh 加 runtime-verify 强制执行点——端点依赖微信开发者工具+automator SDK（当前产品仓/中央仓均未装 SDK，实测 require.resolve 两处 absent），硬接线会在环境缺席时把 G3⑦ 变成必然熔断。接线前置条件=SDK 依赖落仓+探针 health 进 prelaunch-check，列 run26 待办（登记 pending batch）。
4. **D3 悬空键保留**：report_view 有独立消费方（报告查看步），不做合并；以注册表注释+守门测试白名单声明。
5. 中央仓补流走导演通道（非域 lead LEAD-MERGE）：补的全是 docs 文档与证据文件，无代码；run25 已收官无在途开发会话，不合流 integration 全量 192 提交（避免未经评审的开发面混入）。

## 验证

- 中央仓：补流后 `git ls-tree origin/main -- docs/delivery/ docs/evidence/` 出现五件目标文件；`git merge-base --is-ancestor <补流提交> origin/main` 为真。
- 守门测试（vitest，`simharness/tests/` 新增）：
  1. `capture-plan-registry-coverage.test.ts`：解析 aipay-scenario.sh 全部 `capture_step "键"` 调用集，断言 ⊆ capture-plan.env 注册键集；注册键减白名单（report_view=报告步消费）后 ⊆ 驱动调用集∪文件域呈现位。
  2. `evidence-push-followup.test.ts`（程序侧静态断言）：aipay-scenario.sh 的 evidence-push 失败分支文本含显式升级标记（升级为 pending 待办文案），不再只归 issues.log；（对既有轮次产物不回溯改判。）
  3. `report-runtime-proof.test.ts`：mx-report-gen.py 含 runtime-proof 呈现位渲染逻辑（源码级断言呈现键与图注补录标记），capture-plan.env 含 18b 文件域呈现位行。
- 帧：dispatch_done/report_done 补拍后 sips 验尺寸+报告内嵌（文件/像素两层核验；OCR 语义层按帧内容一致法抽验页面标题词）。
- 报告：mx-report-audit 重跑 run25 通过；交付物矩阵缺件 2→0、模版不符 5→复核新 main 后重判。
- 全量：`npm test`（合并前）。

## 设计文档影响

DESIGN_SYNC: none。理由：本批为 simharness 内部采集机制补漏与推演仓补流，方案 §2.5（18b 采集面）与 §2.7（交付物字段）语义未变，仅执行对齐；不触及整合正本与数字总账。程序接线分期决策已登记 run26 pending batch。
