# 2026-11-06 run27 步 21 台账键注册修正（查14c 真未触发误伤热修收编）

## 变更

- `simharness/mux/mx-report-gen.py` STEPS_META 集中表步 21：`['uat-ac-failed']` → 并入 run27 实发键 `['uat-ac-failed', 'frame-content-mismatch', 'frame-capture-failed', 'dispatch-send-failed', 'dispatch-send-retry']`。run27 收官期已换 inode 热修生效，本 spec 收编。

## 决策记录

- 根因（run27 收官实录 3 轮审计 FAIL）：集中表 issue_keys 语义=「该步可能的问题单类型清单（骨架轮保归属）」，而查14c 判据=注册键且渲染行 0 即 FAIL——当轮该类型**真未触发**时（run27 UAT 七 AC 全过，uat-ac-failed 零行）被误伤为「空渲染」，审计无限重试。
- 修法取「并入实发键」而非「查14c 判据放宽」：实发键（帧偏差 65 行/采集失败 6 行/派发失败重试 22 行）真实存在于 run27 issues.log 且归属 report 段——注册后 rows>0 破空渲染，同时消「未注册 21 键」WARN 中的 4 键，一改双效、完全属实。判据放宽（真未触发不罚）属审计器语义修订，挂晨间批独立裁决。
- 顺带：值守曾按旧理解补「frame-capture-failed 键名归位行」——后发现该键原生已 5 行，归位行冗余但无害（标注了归位语义非新事实）；步 21 注册键已含该键，台账行真实。

## 验证

- run27 收官第 4 轮审计（热修后）：查14c 空渲染 FAIL 消除预期（rows>0）→ report_done 落键（收官报告中回填终态）。
- `python3 -c compile` 语法门过；diff 仅 1861 单行。

## 设计文档影响

DESIGN_SYNC: none——报告生成器台账注册数据修正（键集合），不触整合正本与数字总账；理由=数据层账实对齐。
