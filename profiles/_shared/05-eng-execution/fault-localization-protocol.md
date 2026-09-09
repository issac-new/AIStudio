# 故障定位协议（Fault Localization Protocol — 依赖链账本回溯法）

> 层级：05-eng-execution（工程执行层共享协议）
> 来源：t_125bdf58 引入，依据 arXiv:2608.21156 §4.4.2（Graph Engineering survey, DEEP-JLU）
> 触发词：故障定位 / 第一个无效状态 / 失败归因 / 连环超时 / 重试连败

## 一句话

多智能体连环故障时，**时间最早的异常只是假设不是结论**——沿任务依赖链用账本证据回溯定位"决定性偏离点"，先冻结现场再修复，修复动作必须落在根因卡上。

## 单行形式（SOUL 内引用）

```
故障定位：时间最早异常≠根因；沿 task_links 依赖链回溯+查上游产物证据，冻结现场（不重跑）→ 定根因卡 → 修复落根因卡，下游卡只重放不重诊。
```

## 为什么要这个协议

kanban 依赖链（parents 多级扇出）下，一个上游卡的坏产物会被多个下游卡消费，故障呈现为"下游多卡同时失败"，而时间上最早报错的卡可能只是受害者。历史上（09-07 夜间差距未落文档、timed_out 展示 bug）均靠人工经验排除时间假象，成本高且结论不可复用。论文依据：局部错误经依赖传播，可见故障出现在原始偏离之后若干步；系统须把故障原因当**假设**对待，用证据检验，"依赖能缩小搜索范围但不能证明原因"（GE§4.4.2）。

## 操作步骤（机械可执行）

1. **冻结现场**：不立即重派失败卡（重跑会覆盖 `last_failure_error` 与 run 记录）。确需重跑前，先 `sqlite3` 导出失败卡及其上游的 `task_runs`、`result`、`metadata` 快照到工作区文件。
2. **建依赖链视图**：
   ```bash
   sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
     "WITH RECURSIVE up(id) AS (VALUES('<失败卡id>') UNION ALL SELECT l.parent_id FROM task_links l JOIN up ON l.child_id=up.id) SELECT id,status,result IS NULL FROM tasks WHERE id IN (SELECT id FROM up)"
   ```
3. **逐级检验假设**：对每级上游，核对三件事——①产物存在性（metadata/artifacts 声称的文件实际存在？）②产物有效性（文件内容与下游消费假设一致？）③时间线（child.started_at 是否晚于 parent.completed_at？早于=用了未完成产物）。每级记录"证实/证伪"。
4. **定位决定性偏离点**：第一个被证实的异常级 = 根因候选卡。把它的时间最早异常降级为"伴随现象"。
5. **归因留痕**：根因卡 `kanban_comment` 写四件套——哪个卡、哪个 worker run、哪一步偏离、凭什么证据（文件/日志路径）。下游受害者卡只记"根因=<卡号>"引用，不重复诊断。
6. **修复落点**：修复任务建在根因卡（或其新 follow-up 卡）；受害者卡等根因 done 后依赖门自动放行重跑。

## 边界

- 跨板依赖（body 引用型）无 task_links 边，本协议回溯不到——跨板上游需按 body 中 `context_from` 引用人工展开。
- `task_runs` 只留结果不留中间产物时，第 3 步证据可能不足：此时标注"证据不足，按最强假设处置"，禁止把假设写成结论。
- 本协议不改 dispatcher 源码；机械化初筛工具已落地：`python3 ~/.hermes/bin/failure-boundary-scan.py`（只读扫失败链，输出首个异常事件/完成 run 可信区/三档恢复建议）——本协议的递归上游回溯与假设检验步骤仍按人工执行，脚本是入口不是替代。
