# Spec：run20 复盘修复批——报告真值三件套与闸证 provenance（simharness 侧）

- 分支：`fix/run20-report-truth-trio`
- 日期：2026-10-16
- 上游裁定：用户 goal「依据最新版全流程推演方案，全面深入逐一复盘分析最新版推演报告，识别推演过程中存在的问题（报告/方案/产品问题等），制定修复及优化方案实施并完善，修订全流程推演方案及推演报告模版，完成下一轮推演前置准备」
- 复盘正本：overlay/docs/2026-10-16-run20-retrospective.md（问题清单四类分级全量锚点）

## 一、主旨与范围

run20（20261015-v8-run20，净 42.5h，六闸 6/6、report_done 11:45）收官，但逐项复盘
发现四类失真，本 spec 只覆盖 simharness（推演程序）侧修复；产品侧修复另见 overlay
分支，方案正本修订（V8.36）另见 overlay 正本批。

本批范围（三件+两单点）：

1. **交付物轮次一致性**：文件头声明轮 ≠ 本轮的工件禁计为本轮交付物（run20 实锤 4 件）。
2. **锚点活性**：交付物锚分支必须存在于远端，否则标记不可反查（run20 实锤 12 处）。
3. **逐步问题单注册**：台账命中步注册键的问题单必须渲染进取步 ③ 段（run20 实锤 0/27）。
4. **G3 闸证 provenance**：分支 testlog 存在 ≠ 本轮产物——存在性检查升级为轮次头检查。
5. **ERR trap 噪音**：等待环谓词 return 1 每 ~2s 触发假「驱动异常退出」（run20 16:03 起实录）。

不在本批范围：产品面 SwarmStudio 修复（overlay 分支）、方案 V8.36 修订（overlay
正本）、run21 起跑执行本身（需用户明确指令）。

## 二、问题定义（实测锚点）

| # | 问题 | 实测锚点 |
|---|---|---|
| P1 | 4 件往轮产物冒充本轮交付物：系分稿 PAYCORE=RUN=20261012-v8-run16、系分稿 MP=RUN=20261010-v8-run14、G3 testlog PAYCORE-C=RUN=20261013-v8-run19、PAYCORE-N=RUN=20261012-v8-run16 | central 仓 f5b47a0 树文件头实查；驱动 18:15 真值行已记 anexec-missing×2（issues.log） |
| P2 | 13 件交付物锚 `origin/integration/RFD-001@658971a` 集体不可反查（远端无该分支、commit 无分支包含） | `git ls-remote` 实测仅 main+mx-clean 备份 tag；`git branch -r --contains 658971a` 空 |
| P3 | 逐步问题单 27 处「已知问题：无（本步零问题单）」与台账 139 行 ISSUE 并存 | STEPS_META_20261015_V8_RUN20 26 步 issue_keys 全空（mx-report-gen.py:1531 起） |
| P4 | G3 门禁 `repo_branch_has` 只查存在性——PAYCORE-C/N 的 run19/run16 testlog 被计为「6/6 在案」 | aipay-scenario.sh G3 块；issues.log g3-testlog-missing-all-six→19:42 勘误「5/6 已有」 |
| P5 | ERR trap 假报「驱动异常退出」每 ~2s（16:03 起至收尾） | issues.log devimpl-second-idle-wave 条目自述；aipay-scenario.sh:40 |

根因共性：**「存在即可反查」的存在性判据取代了「产物归属」的 provenance 判据**——
文件在分支上（P1/P4）、ref 曾在远端（P2）、步有注册（P3）都不等于产物是本轮的、
锚是可反查的、问题是有归属的。

## 三、设计

### 3.1 单一判据源 `mux/report_truth.py`（新文件，纯函数+薄 IO）

- `extract_declared_run(text)`：文件头前 15 行的权威声明位（`轮次`/`派发标识` 模式，
  同行前缀含 上轮/历轮/前轮/对照/历史轮/源轮/基线轮 的跳过）提取声明轮；无声明位
  =''（注册表类跨轮工件不妄断陈旧）。头部作用域 + 前缀排除双保险防误报
  （AN-PAYCORE §0「历史轮处置声明」引 run15 不触发）。
- `stale_verdict(text, run_id)` → (bool, declared)。run_id 空=不判（旧轮兼容）。
- `anchor_alive(git_dir, branch)`：`ls-remote --heads`；查询失败/超时 fail-open
  （网络抖动不判死锚，死锚由渲染层+审计器双确认）。
- `ledger_rows_by_keys` / `unregistered_ledger_keys`：台账键×步归属盘点。

### 3.2 生成器 `mux/mx-report-gen.py`

- `_art_resolve` 升级 4 元组（+真值标记 dict）；stale → 判词「往轮产物（RUN=…）」+
  红条横幅+矩阵计缺件；dead_anchor → 锚位红字「不可反查」。
- 锚活性按分支缓存（单进程一次 ls-remote；13 件同分支不重复网络往返——实测每件
  一次往返使报告生成 +4min）。
- `STEPS_META_20261015_V8_RUN20` 补注册 11 步 issue_keys（步 10/13/15/18/19/20/21/
  22/23/24，步 22 键同步修正 ide_done→workmgr_done）。
- 台账未注册键 stderr 机械暴露（收尾链补注册检查面）。

### 3.3 审计器 `mux/mx-report-audit.py`（新增查 14）

- 14a 往轮产物：报告含 `art-stale` 标记 = FAIL（附声明轮清单）。
- 14b 死锚：含 `art-dead-anchor` = FAIL。
- 14c 逐步问题单：台账有该步注册键的行而报告逐步无 `st-issues-tbl` = FAIL。

### 3.4 驱动 `aipay-scenario.sh` + `mux/mx-scenario-lib.sh`

- `repo_branch_runtag <branch> <path>`：远端分支文件头 RUN= 提取（复用 report_truth）。
- G3 块：testlog 存在但轮次头 ≠ 本轮 → 记 `g3-testlog-stale-run` 并计入 `_g3_miss`
  （与缺件同径：派补证单+等待+超时落 g3_evidence_gap）——存在性≠本轮产物。
- ERR trap：等待环谓词 return 1 不再触发 ERR 假报（trap 加 returncode 守卫，
  仅驱动主流程非零退出才告警——具体形态见实现）。

### 3.5 前置 `mux/mx-prelaunch-check.sh`

- ⑱ 报告真值三件套在位：report_truth.py 存在+py_compile 过+三标记符号在生成器/
  审计器双侧在位（防「修复只落一边」——模板↔产物双向同步纪律）。

## 四、验收

1. 隔离副本重生成 run20 报告：4 件往轮产物全部命中、12 处死锚、逐步问题单
  18 表渲染（原 0）、stderr 列 40 个未注册键。
2. `bash tests/run-gates.sh` 全绿（新增守门测试见 tests/report-truth-anchor.test.sh）。
3. `mx-report-audit.py --run <fixture>` 对含陈旧件的夹具 FAIL、对干净夹具过。
4. ERR trap 修复后 driver 日志零假「驱动异常退出」（构造 return 1 谓词回归）。

## 五、复用约束

- `report_truth.py` 判据是报告真值的单一事实源：生成器（渲染）、审计器（断言）、
  驱动（闸证）三处共用，禁各写一份正则（§5.5 每维度单一事实源纪律）。
- 头部 15 行窗口与排除词表如调整，必须同批改三处调用方与守门测试（双向同步）。
- 本批不改上游 upstream/；patch 面零触及。

## 六、风险与回滚

- 误报风险：文件头写法变体（如轮次写在表格第 3 行之外）会漏检→漏检退化为旧行为
  （不 FAIL），可接受；误报（把本轮产物判陈旧）会拦收尾→守门测试用真实三份
  run20 语料 + 三份往轮语料钉住双向。
- 回滚：`git revert` 本分支两提交（判据模块+接线），生成器回落 3 元组旧语义。

## 决策记录

| # | 决策 | 理由 | 替代方案（否） | 可逆性 |
|---|---|---|---|---|
| D1 | 判据放独立模块 report_truth.py 而非内嵌生成器 | 三处调用方（生成器/审计器/驱动）共用，内嵌=三份正则漂移 | 内嵌生成器+复制到审计器 | 可逆（移动成本低） |
| D2 | stale 判定用文件头声明位，不用 git 路径历史 | 路径最后 touch 被合并「刷新」蒙过（run20 实锤）；声明位是产物自述归属 | 增强 freshness 窗（已实证无效） | 可逆 |
| D3 | 锚活性 fail-open（查询失败=不判死） | 网络抖动不该拦收尾；死锚由渲染+审计双确认兜底 | fail-closed（网络抖动误拦） | 可逆 |
| D4 | 死锚/往轮产物在审计器判 FAIL 而非 WARN | 二者都是「反查承诺失效」类诚信问题，WARN 化=run20 式静默放行重演 | WARN+人工复核（run20 已证空转） | 可逆 |
| D5 | G3 testlog 升级为轮次头检查而非仅存在性 | run20 实锤 2/6 分支 testlog 为往轮产物仍计「在案」 | 仅报告层标记（闸证仍假） | 可逆 |
| D6 | spec 随分支提交满足 L2 spec-first 门禁 | R109-D8 起历史 spec 不放行；本 spec 即本批实施正本 | --no-verify 逃生门（放弃流程约束） | 可逆 |
