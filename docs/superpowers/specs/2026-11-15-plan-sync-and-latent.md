# 全面复盘：潜在及既存问题根治＋方案程序同步（2026-11-15）

## 变更

背景：run30 收官后全面复盘的第二轮（第一轮=08a301e65 rootfix）。本轮聚焦三面：①方案与程序漂移（五件新机制未进 V8 方案正本）；②两处程序病根（预检④自污染结构性复发、采集预检提示语误导）；③现场残留（testprobe 探针目录）。

1. **方案同步（§5.14 立＋§5.13 交叉引用）**：五件机制进正本——凭证核验三分支、burn-waived 第三态、催办指数退避、起跑时间学 G-d、任务书统一件；A1 标定定案（D1 修正=默认 preset＋仅日间标定）；指标留档收官门；采集预检排查序。此前各批 spec 的「DESIGN_SYNC: none」判断修正：机制级变更应进方案（本批补齐，用户裁决口径）。
2. **O1 留档收官门**（`mx-report-gen.py`）：`report_done` 在位才追加 run-metrics.jsonl——预检⑧重放未收官轮不再写仓内账（run30 开跑轮「④自污染定谳放行」的结构性根治，假投影行存量来源消灭）。
3. **采集预检提示语排查序**（`aipay-scenario.sh`）：FAIL 提示按序指路 docker/synapse(8008)→studio(8802)→gateway(8801)→npm→channel——2026-11-14 夜三连败真因是 docker daemon 停，旧提示只指 npm 误导修复方向（当晚弯路实录）。
4. **现场清理**：testprobe 探针残留目录移 `archive/testprobe-quarantine-20261115`（22:44 手测 r18-frames 遗留）。

## 决策记录

- D1：留档门用「跳过+stderr」而非「写 gitignored 副本」——未收官轮的投影本无台账价值，副本制造第二事实源。
- D2：方案同步走「追加 §5.14＋§5.13 交叉引用」而非重写既有条款——正本演进可追溯（每节带轮号与生效点）。
- D3：testprobe 走隔离归档不删——rm -rf 禁令+留查证价值（探针帧可复看）。

## 验证

- `bash -n` aipay-scenario＋`py_compile` report-gen 过；
- `run30-burn-verify.test.sh` 追加⑧断言组（留档门在位/提示语五序在位/§5.14 八条进正本）；
- run30-actions/run-gates 回归。

## 设计文档影响

DESIGN_SYNC: none——本批同步对象是推演方案正本 docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md（specs 系自洽演进，§5.14 立节＋§5.13 补注随批同文件兑现）；不触及 DESIGN_DOCS 四正本（docs/DESIGN.md 等）内容。
