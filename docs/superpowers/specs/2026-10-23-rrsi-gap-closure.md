# RRSI 挂账清偿批：探测韧性、轻量起草、占位提案删除（2026-10-23）

## 背景

RRSI 真实循环走查（spec: 2026-10-23-rrsi-followup-batch.md）暴露三项挂账。诊断复盘后
本批定案如下——其中第一项与走查当时的定性不同，据实更正。

## 三件

### 1. 自动探测韧性（定性更正：非隔离缺陷，是瞬态故障＋诊断信息缺失）

走查当时定性「materializeHome 隔离环境起不来 agent」。事后手工复刻隔离 home（同款
符号链接算法＋写实变体文件＋HERMES_HOME/HERMES_RUN_TRACE_DIR env）真实运行成功——
隔离机制本身正常；当时的失败与同窗口三次手工采集全空同源，是**模型 API 瞬态故障**。
真正缺口有二：
- `defaultSpawnRun` 只回传 `error.message`（"Command failed: hermes …"），stderr 被吞，
  现场无法定位（走查时因此误判为隔离缺陷）；
- 单次 spawn 失败即整场探测报废（`runProbeTasks` 立即 return），瞬态抖动不容错。

修法：spawn 错误附 stderr 尾部（截 400 字）；每任务 spawn 失败后间隔 5s 重试一次，
仍败才定性失败。

### 2. AI 起草器轻量化（追加段形态）

live 首跑 65s 失败：提示词要求重写目标文件全文（orchestrator SOUL 23KB），生成负担重、
易超时易截断。改为**追加段起草**：有可读 targetPath 时，模型只产出
`{title, hypothesis, section}`（一个待追加的小节，≤2KB），服务端组装
`variant content = 基线全文 + "\n\n" + section`——输出量与目标文件大小解耦。
无 targetPath（建议面自由起草）保持全文形态。测试相应改为注入假 CLI 返回 section。

### 3. 占位提案删除（审计边界内）

`DELETE /proposals/:id`：仅允许 `status=draft` 且无 probes 记录且无 approval 的纯占位
提案（如走查事故产生的 hw-002）。有任何审计线索（批准/探测/组合/晋级/回滚）一律不可
删——审计闭环优先于整洁。UI 在符合条件的 draft 卡加「删除」按钮。

## 决策记录

- **2026-10-23 · 用户指示「完成挂账缺口」**：三项全做；第 1 项据手工复刻实证更正定性
  （隔离正常、瞬态故障），修韧性不修假缺陷——避免为不存在的缺陷改物化算法。
- 重试只做一次且只针对 spawn 失败（非 trace 缺失）：trace 缺失是运行器问题，重试无益。
- 起草器组装段落时保留基线原样（最小改动纪律），section 前后以空行分隔；创建仍走
  `createProposal` 全部校验（判词/泄漏闸照常生效）。
- 删除是物理删（store 移除）；draft 无任何关联记录，无重建价值，审计无损。

## 验证计划

- 单测：spawn 失败一次→重试成功（任务完成）；两次失败→错误信息含 stderr 尾部；
  起草器 section 形态（组装=基线+段）与无 targetPath 全文形态；DELETE 三种拒绝
  （非 draft/有探测/有批准）与成功路径。
- 既有套件全量复跑（workbench 服务端＋面板）。
- live 三连验证：删 hw-002；hw-001 重跑自动探测（真机隔离验证）；起草器轻量重跑出 draft。
