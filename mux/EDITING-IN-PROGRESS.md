# run11 推演运行中（协调告示）

生效：2026-10-07 17:50 起，run11 收官后删除本文件。23:50 重大更新（见下）。

## 23:50 事故与重启声明

- **attempt-1 已废**（18:30-20:28）：模型通道 cc-switch 池中 aim 下线 → agent 全哑 →
  register 超时 fail；叠加 mx-clean 中央清空提交落错分支（HEAD 停 integration）+
  push 空转假成功 → run10 旧稿污染基座。两病根均已根治（config 切 glm-5.3；
  mx-clean 显式落 main+回读验证+tip 树断言，6e72c14/c899d0d，守门⑳）。
- **attempt-2 重启中**：全旗标重清+中央仓手工手术（76fd46b+evidence 补扫）已毕；
  mx-setup/mx-up 重建后将重新点火（同 RUN_ID=20261007-v8-run11）。
- **勿动 SIM_ROOT**：任何 mx-clean/mx-setup/中央仓操作请先在本文件登记——今晚
  双会话已在中央仓连环互踩三轮（分支指针被挪 95cff8e 事件在案）。

## 运行期间（纪律 25）

- `aipay-scenario.sh` **禁改**（驱动边执行边读，位移=随机崩溃）。
- `mx-lib.sh`/`mx-scenario-lib.sh` 启动时已 source 完毕；如必须改，改后在本文件登记。
- 报告链三件（mx-report-gen.py/mx-report-audit.py/final-report-merge.py）在 report
  步才执行；期间可改，改后请在本文件登记一行。
- 提交一律逐文件显式 add，禁 `git add -A`；冲突留优版弃己版，先 fetch 看 origin。

## 2026-10-08 登记：模板公文技法修订（gongwen-bifa 轮）

- **templates-pending/ 新增 12 张交付物模板修订稿**（prd/review-record/freeze/tasklist/
  schedule/test-report/release-plan/release-notes/acceptance/audit-opinion/retrospective/
  work-report），纯暂存不改活文件，run11 收官后按同目录 README.md 迁移口径迁入
  中央仓并同步 harness 内嵌位。中央仓零写入。
- **mx-report-gen.py 报告侧修订**（报告链，纪律允许范围）：第 9 章结论块手编计数
  「16 个」改实算；证据二/证据三当轮叙事入按轮注册表 `_GOV_EVIDENCE_BY_RUN`（缺省
  诚实兜底文案）；卡点引言「九个」改 `len(CHECKPOINTS)` 实算；页脚重复句去重。
  冻结面（审计锚/守门测试钉死的字面量）一律不动。验证已跑：py_compile 过、
  vitest 78/78 过、夹具渲染「闭环成立/未成立」双分支实测正确。
- **缺失告警**：步 20 派发词引用的 `templates/release-plan.md`/`release-notes.md`、
  步 7 的 `templates/prd.md`、步 15 的 `review-record.md` 在中央仓 main 均不存在
  （10-08 02:14 mx-clean 历史截断后未重建）。若 run11 走到步 20 时模板仍缺，
  按方案 §2.7 步 20 约定应「先完善模板库再用」——修订稿已在 templates-pending/
  备好，驾动会话可自取迁入（迁入即登记）。
- **观察到另一会话在改 mx-report-gen.py/mx-report-audit.py**（段三/段四「处置与改进」
  措辞与审计锚同步，约 11:38），与本登记改动区间不重叠；提醒其按纪律补登记。
  另：mux/tests/r18-capability.test.sh 有一处陈旧断言 FAIL（非本轮引入，HEAD 即无
  该串），已在 templates-pending/README.md 挂账。

## 2026-10-08 登记②：中央仓补件 + 守门测试修复（用户点名执行）

- **中央仓操作**：templates/ 前置补件四张（prd/review-record/release-plan/
  release-notes，templates-pending 修订稿逐字迁入，prd 头部暂存注改为迁入注），
  落 main 直推 origin。补件理由=方案 §2.7 步 20 约定（步 20 前模板库须在位）。
  提交带 provenance，DISP 锚入 run11 issues.log。
- **mux/tests/r18-capability.test.sh 修复**（陈旧断言，非行为变更）：①生成器断言
  `R18 载荷未采集`→`全量呈现（未采集·必采步缺口）`；②审计断言
  `R18 步 5 三位载荷全缺`→`R18 步 5 载荷全缺`。均对齐生成器/审计器现行文案，
  测试意图（空载荷诚实缺席+必采步打回+已采步零误报）不变。
