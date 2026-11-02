# Eval Studio 技能评估面板（skill-grade 端点 UI 接线）

> 挂账来源：方法论吸收批 E（spec 2026-11-02-skill-grader.md）交付时 UI 面留后续批。服务端 `POST /api/hermes/eval/skill-grade` 已可用（S0 机械四判+S1 反偏置四维+可选基线对比），本批接 Eval Studio 第八页签，补齐「粘贴 spec → 看四维判定 → 落基线 → 看 delta」的操作面。

## 变更

1. **`custom/client/eval/api.ts`**：`evalApi.skillGrade(body)` POST 面新 DTO 镜像（`SkillGradeResponseDto`/`SkillGradeResultDto`/`S0CheckDto`/`DimensionGradeDto`/`BaselineDeltaDto`——服务端 skill-grader.ts 契约的手抄镜像，遵守本文件「不跨包 import server 类型」既有纪律）。
2. **`custom/client/eval/i18n.ts`**：tabs 加 `skillGrade`；新增 `skillGrade` 词条节（标题/说明/输入占位/动作/状态文案，zh/en 双份）。
3. **`custom/client/eval/components/SkillGradePanel.vue`（新）**：specText 多行输入（占位提示须含 §19 段）＋可选 baselineRunId＋snapshot 复选；「评估」动作调 skillGrade；结果区分层呈现——overall 徽标（PASS 绿/CONDITIONAL 黄/FAIL 红）、S0 四判表（id/label/pass/detail）、S1 四维表（dimension/value/source/p/reason）、meta（model/online/cached/latency）、基线 delta 行（baselinePassRate→currentPassRate±，无快照如实示「无基线」）；错误如实展示不吞（fail-open 的 unknown 是合法结果不是错误）。
4. **`custom/client/eval/views/EvalView.vue`**：Tab 类型/页签按钮（data-testid=eval-tab-skill-grade，排在 flywheel 后）/面板挂载三处接线。
5. **测试 `custom/client/eval/__tests__/skill-grade-panel.test.ts`（新）**：照 flywheel-panel.test.ts 形态（mock evalApi+vue-i18n）——好结果渲染四维与 PASS 徽标、CONDITIONAL 如实黄标、基线 delta 正负号与无基线态、空输入不发请求、API 抛错错误面如实。

不动：route-manifest（模块级引用不锁页签数）、服务端（已就绪）、registries（eval 模块已注册）。

## 决策记录

1. **独立页签而非塞进现有面板**：skill-grade 的操作形态（输入长文本→单次评估）与既有七页签（列表/读数型）不同类，独立页签保持各面板单一职责；data-testid 命名沿用 eval-tab-* 惯例。
2. **DTO 手抄镜像不引 server 类型**：api.ts 头注释明言此纪律（域自包含，契约漂移由 e2e 承接）；skill-grader DTO 字段少（四判+四维+meta+delta）手抄成本低。
3. **snapshot 语义=「评估同时落基线」复选**：服务端设计是 baselineRunId+snapshot:true 时落快照；UI 合并为「基线 runId＋落为基线」一个复选，避免两次调用半态。
4. **CONDITIONAL 用黄色语义色**：S1 不可用时整体 CONDITIONAL 是 fail-open 合法态，用黄色而非红色（红=FAIL 有 no 维），防用户把「判定端离线」误读为「spec 差」。
5. **DESIGN_SYNC: none**——eval 域内 UI 扩展，无正本数字变更。

## 验证

- `npx vitest run custom/client/eval/__tests__/skill-grade-panel.test.ts`（新测试绿）
- `npx vitest run custom/client/eval/__tests__/`（域内无回归）
- 活体走查（dev :8649 eval 页第八页签渲染+空态）——若 dev 服务不可起则以组件测试为准并在交付说明如实标注

## 设计文档影响

DESIGN_SYNC: none——Eval Studio 域内页签扩展；附录 A.1 本 spec 随批登记。
