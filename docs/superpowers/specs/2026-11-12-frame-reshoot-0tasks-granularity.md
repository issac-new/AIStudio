# 2026-11-12 run29 补拍轮——frame-verify「0tasks」判空收窄（第三粒度修正）

> 用户令「报告缺失了很多截图 补拍下」。实测：报告引用的 15 张图全部在盘，真缺口两项——`register_done`（帧在但被判空）与 `mp_runtime_proof`（文件域帧未产）。补拍 register_done 后仍判红，暴露本批修复的判据缺陷。

## 变更

**`simharness/mux/frame-verify.py`**：「0tasks」空白态否定词收窄——抽页内全部 `(\d+)tasks` 计数，任一 >0 即非空板（0tasks 不计否定）；全零才维持判空。新增 `_board_counts_all_zero()`，`verdict()` 对 `0tasks` 单列条件。

背景链（三粒度递进，均误伤实测）：run26 裸「暂无」误伤健康顶栏→只收明确措辞；run28 泳道占位词「暂无任务」误伤有卡板的空泳道→只收看板头「0 tasks」页级信号；本轮 run29 补拍实锤**第三粒度**——左侧阶段导航条逐阶段印「N tasks」，目标板头计数 5tasks＋RFD-001 排期基线卡在帧内，其他阶段（搭建）的「0 tasks」同页在案仍被判空白。

**配套补拍与处置**（运行态，不入库）：register_done 用 r18-frames.mjs 重拍（板上现有数据，同名覆盖无需重登记）；mp_runtime_proof 维持缺帧＋issues.log 人工复核升桶行（IDE 人工扫码登录属人工门控，三次尝试归档在 origin/wt/t_9ede568a，逻辑层真值 AC-7 53 用例绿在案）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 收窄为「全计数零才判空」而非删 0tasks 词 | 真空板（唯一计数 0）仍须拦——删词=降守门强度；收窄保住两类真空白 |
| D2 | mp_runtime_proof 不以 burn 轮旧 png 复位 | 查14a 红线：往轮产物不得冒充本轮交付物；环境阻断如实降级优于挪图 |
| D3 | 重生成报告走 --auto-part1 | 本轮无人工正本注册（run29 收官时同路径）；PART1 逐轮人工正本禁旧轮顶包 |

## 验证

- 四判例行为测：满板+他阶段 0tasks→过；全零计数→红；仅 0tasks→红；其他空白词不受影响。常驻化 `simharness/tests/frame-verify-empties.test.sh` 入 run-gates 聚合。
- run29 全量重验：帧核验 13/14（唯一 ✗=mp_runtime_proof 缺帧，人工复核降级在案）；报告重生成 15 图全嵌；final-report.html 1.05MB；重审计 **零 FAIL/39 WARN**（原 46）。
- `python3 -c "import ast; ast.parse(...)"` 过；run-gates 全绿。

## 设计文档影响

DESIGN_SYNC: none——帧核验判据粒度修正属推演工装，不触及 DESIGN_DOCS 四正本；方案 §5.6 采集纪律口径不变（占位词按可证粒度收词的纪律已三次递进，注释链在词表内自证）。
