# 2026-11-08 帧核验报错态判据（frame-verify ERROR_MARKERS）

run28 报告帧独立审计根治批。审计实锤（2026-11-08 上午，三层核验：文件 md5／报告引用对账／13 张 after 帧逐张目视）：frame-verify 判据只做「期望词命中＋空白态标记」，页面 chrome 有词但核心区报错的帧照样过验——run28 有 5 张帧在此盲区下被标「✓已核验」而报告全文未披露：

- `ide_done` 帧：核心区为深链报错「任务 t_af224933 不存在或当前账号无权访问」，恰与该步交付物「任务跳转在位」相反；且 issues.log 处置行声称「repo-shots/ide_done.md 在案」而该文件不存在（假引用）。
- `anexec_done`／`review_done`／`ready_done` 帧：内容区红字「API Error 403: 需要平台超级管理员权限」，评审／审批区因权限加载失败呈空态。
- `register_done` 帧：任务分解阶段视图四泳道全部「暂无任务」（0 tasks），帧不承载该步语义（弱承载未标注）。

另有两处账实矛盾随批清偿：issues.log 挂 `frame-content-mismatch·step-report_view`「缺帧」但帧在位且复验 ok（首跑时序残留未销账）。

## 变更

1. `simharness/mux/frame-verify.py` 判据补第三维——**报错态否定词** `ERROR_MARKERS = ['APIError', '加载失败', '需要平台超级管理员权限', '无权访问']`，OCR 归一文本命中任一即 `ok=false`，why 前缀「报错态：」；与既有「空白态：」前缀分列（处置语义不同：报错态指向采集时权限／深链缺陷，空白态指向页面未推进）。
2. `EMPTY_MARKERS` 增补 `'暂无任务'`（泳道空态显形，register_done 帧翻红依据）；沿用 run26 教程不收裸「暂无」。
3. 判定逻辑抽为纯函数 `verdict(text, exp) → (ok, hit, empties, errors)`（原 main 内联），供守门测试行为级断言（bash 行为测「提取函数体法」的 python 对位）。
4. 报告徽章零改动：`mx-report-gen.py` 的 `frame_badge()` 按 ok 布尔渲染 ⚠／✓，新判据经 frame-verify.json 自然生效。
5. run28 存量产物随批修订（补记正道，见决策 4）：issues.log 补记 2 条人工带锚点「已修」DISP（假引用更正＋挂账销账）→ 新判据重跑 frame-verify → 新偏差键按驱动同款去重逻辑追加 ISSUE 行 → tri-disp-backfill 自动归桶 → 刷 governance-metrics 快照 → mx-report-gen 重生成三件套。
6. 随批清偿存量红：`custom/__tests__/docs-ssot-guard.test.ts` 表格解析器裸切 `|`，遇到附录 A 合法转义管道 `\|`（run28-burn-fixes 批引入）误判 4 列三测全红（main 主树实锤复跑）——改为按未转义管道切分并还原转义符，附回归锁用例。

## 决策记录

1. **词面安全边界**：不收裸 `403`／`401`——十六进制任务号／提交哈希可含该子串（误报教训同 run26 裸「暂无」26 帧全红）；`APIError` 按 norm 去空白后的串匹配；`加载失败` 风险自担并留注释（审计帧把报错当数据呈现时以复审为准）。
2. **ide_done 假引用选「改文案」不选「后补文件」**：repo-shots 证据型＝git 提交窗＋state 终值，事后无真值源补建＝编造；按纪律 28 人工带锚点补记 DISP 更正行。
3. **report_view 挂账销账走补记 DISP**：append-only 台账不改写原行，追加「已修」行注明首跑缺帧→05:31 补挂→复验 ok 的时序事实。
4. **run28 修订不手改生成物**：HTML 由 mx-report-gen 从 evidence＋快照重生成；配对正本在治理服务，补记后必刷快照（run27 铁律：否则净额计数不实）。
5. 用户裁决记录：2026-11-08 用户令「按建议修复」，本 spec 承载审计四条建议全部（判据根治／假引用更正／销账／帧内异常显形经重核验自动达成）。

## 验证

- 守门测试：`cd simharness && npx vitest run tests/v84-frame-gates.test.ts tests/frame-four-state.test.ts tests/capture-plan-registry-coverage.test.ts`——新增行为断言（verdict 四例：403 报错／深链无权／泳道空态／健康页）＋词面安全断言（ERROR_MARKERS 无裸数字码、EMPTY_MARKERS 无裸「暂无」）。
- run28 实测重跑：`python3 simharness/mux/frame-verify.py --run 20261107-v8-run28` 预期新增翻红 5 键（register/anexec/review/ready/ide），既有 3 失败键维持，其余 6 键维持通过。
- 重生成报告 grep 验证：5 帧 ⚠徽章带「报错态／空白态」措辞、2 条已修 DISP 渲染、摘要分级计数随新核验态更新。

## 设计文档影响

DESIGN_SYNC: none —— simharness 采集判据内部修复，判据语义正本即 frame-verify.py 词表及其注释（本批随改动同步）；不触及整合正本与数字总账。关联前批：`2026-11-06-frame-capture-accuracy.md`（O3 采集端闭环——本批为其核验端判据延伸，补齐「帧内容是否健康」维度）。
