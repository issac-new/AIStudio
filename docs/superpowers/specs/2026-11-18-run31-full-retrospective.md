# run31 全面复盘（2026-11-18；17h12m，11-17 09:02 → 11-18 02:14）

## 一、结论

run31 以 **report_done 正常收官**（02:14:00），审计 **0 FAIL／37 WARN**，报告四查全过，监督器按设计自退。**非六闸全过**：G2 涉敏安全环全轮未闭环（D1-D9 安全门禁缺项＋SC 复审未翻绿），G5 经补件路径（g5_supplement）放行后完成终局。全轮真正的堵点＝**安全修复链组织面失效**（bella 四卡 blocked＋chen 148 文件 WIP 终未提交）——判词、闸门、熔断、催办链全对，修复执行全天未落地。机制面经值守四轮大手术全救活，§5.15 新验收面全过（探针组 15-17 活体 51/51）。token 终值 **198.04M／3501 回合**（转录级估算口径，usage 持久化补丁挂账 N32-1）。

## 二、时间账（17h12m 去向）

| 段 | 耗时 | 定性 |
|---|---|---|
| 起跑→review（前 7 主步＋研发执行） | **62min** | **G-d 日间窗实证成立**（run30 同段 ~4.5h；anexec＋review 双过 10:04） |
| G2 archgate 安全环 | 2h27m | 10:15 FAIL 判词在案→改判窗三轮 600s 超时→断摆 12:07 |
| devimpl→G3 代码闸 | 1h42m | 12:45 断点续跑重启救活；hu 8 笔提交落仓 |
| defect→testpass（G4 探针三堵墙） | 5h03m | G3 13:49→G4 18:19；**探针 12→0 失败根治链见 §三-A** |
| G5 发布准出熔断 | 2h56m | 20:26 首轮未过→21:34 三轮硬停→00:22 补件放行 |
| 报告段＋审计环＋DISP 破局 | 1h52m | 00:22→02:14；帧缺口 13 轮不收敛→值守按源码格式落凭证一轮过 |

对照 run30（21h08m）：**前段大幅提速、终段阻塞集中**——剩余主要矛盾从「凌晨深睡＋催办轰炸」（已治）转为「修复执行组织面＋报告终局自动化断链」（本批立项）。

## 三、问题分类与处置（issues 139 行；报告真值 step_issue_rows 十步 83 行）

**A 类 值守已根治（当轮活体手术，全部带验证锚）**：
1. **G4 探针 404 族×12**＝product-dist 为 11-13 旧构建（setup 前未跑 `build:full`）→18:16 全量重建＋热换＋三新端点 401 实测；NVMe 悬空根绝＝product-dist 转本地实体（208M dist＋1.4G node_modules）。
2. **kanban 500×2**＝SIM 树被 15:30 重灌抹掉 80+ 补丁创建文件（`kanban_projects_pause.py` 等）→从主检出注入态 vendor 树全量补齐＋4 漂移文件覆盖→CLI 冒烟通过、boards 200。
3. **earned-autonomy 403**＝活体全局治理写门（非 super_admin 拒写先于 handler；单测裸挂路由只见 409）→探针判据改 409/403 双合法，单测 2/2 绿。
4. **磁盘两危急**（23:0x 跌破 10G 自动暂停线）→测试沙箱/updater 缓存清理＋NVMe 迁移（全可逆通道；rm -rf 被 L1 门禁正确拦截）。
5. **断摆×3**（12:07/00:45/01:39 监督器二段式）→run27 既定配方（stop 清理＋断点重启）全救活。

**B 类 本批复治（rootfix，五件，验收判据见 §六 N32 台账）**：
1. **审计 DISP 降级写入器断链**——「操作序列缺帧」缺口 13 轮重试零收敛根因＝驱动从不为帧缺口落降级凭证（tri-disp 归桶 0 键实锤）。值守破局＝按 `mx-report-audit.py:130/197/220` 源码格式手工落 `ISSUE|frame-capture-failed|step-<n>` 一轮即过。**产品化方向**：帧缺口键自动落同格式凭证（写入侧补齐，配对测试锚＝步 23/25 缺帧例）。
2. **断点续跑跳段**——archgate/close/plan done 键全缺却 `START_STEP=devimpl` 续跑（g2_arch_pass 缺位下推进到 report）。断点定位须「最近闸前段」而非「最近 done 步」，防绕闸假推进。
3. **agent 源重灌触发过松**——他会话 docs-only 提交（fc051ed28）即触发 15:30 重灌抹补丁文件。供给 stamp 应按**内容面**（vendor 树＋补丁集真实变更）而非 overlay HEAD。
4. **断点重放烧 token**——G2 环每循环全链重放（12.5min/轮×9 轮）产生无效回合（token 面占全轮可观比例）。重放应从「最近闸位」起，不从头。
5. **G2 判词缺项显示畸形**（`)。））`截断）——治理服务 gate-verdicts 缺项序列化缺陷，owner 无法解析缺项将空转（fanfan 复核实测维持 FAIL 判词专业正确，但该显示缺陷仍是执法链真 bug）。

**C 类 定案落档**：
- **D1 安全修复链组织面失效**（全轮头条）：chen WIP 148→156 至终局未提交；bella 四卡 blocked＋复审卡 todo；D1-D9/SC 缺项未销。**定谳：机制面（判词/闸门/熔断/催办）全对，执行面（修复接单与落地）失效**——与 run30「凌晨深睡」不同型，日间同样发生，故凌晨豁免归因需重评（烧机 WAIVED 的「外部归因」成立但非唯一因）。
- **D2 dreaming sunset 判据第一轮取证**：dream 产出=0（evidence/always-on-watchers.jsonl 终局取证），连续两轮零产出即退役裁决——run32 为第二轮观察窗。
- **D3 探针 403 双形态合法**（活体治理写门先于 handler）已入探针文件（收编见 N32-4）。
- **D4 automation 平台三缺陷**（一次性＋CronUpdate 被吞／值守轮两窗被吞／CronDelete 被路由重定向）——环境层事实，非本仓代码问题，列入「不处置」节（值守 prompt 内建自删指令兜底＋人工面板删）。

**D 类 挂账 N32**（台账 `2026-11-18-run32-pending-batch.md`）：见 §六。

## 四、N31 台账收官回写

| 项 | 状态 | 实测 |
|---|---|---|
| N31-1 帧缺帧×2 | 已定谳不复核 | report_view=时序竞态（同型本轮 8 帧内容偏差徽章如实标注） |
| N31-2a 已修族≈31 行验证归零 | **部分归零** | 催办退避族/G-d 族未复现；**新现大族**：g3-local-gate-missing×12、g4-contract-breaking×10（G3/G4 判词环记账形态变化，run32 对照） |
| N31-2b 结构性观察≈14 行 | 部分仍发 | g4-contract-breaking×10＋workunit-rejected×2 复现；zero-delivery×2 量级降（凌晨段已治） |
| N31-3 merge-conflict 警告 4/4 验证 | **未复现** | issues 全表零 merge-conflict 行＝警告生效定案 |
| N31-4 重烧收据 | 清偿 | WAIVED（digest 2b242687，豁免 02:21 留档） |
| N31-5 G-d 窗起跑 | 清偿 | 09:02 落窗内 |

## 决策记录

- **Mechanical·rootfix 五件全部立项**（§三-B）： DISP 写入器/断点定位/重灌 stamp/重放起点/缺项显示——各自带 file:line 锚与验收判据，由后续修复批承接。
- **Mechanical·dream sunset 判据第一轮=0 在案**（D2）。
- **Mechanical·run-metrics 收官行**：由 `mx-report-gen.py` 终局门（report_done 在位）写 docs/governance/run-metrics.jsonl，O1 留档语义合规。
- **UserChallenge·复盘范围**：用户 2026-11-18 令「全面复盘本轮推演」——正本 spec＋方案 §5.16＋N31 回写＋N32 台账，rootfix 修复批待用户点批后立项。

## 验证

- 复盘数字全部实测锚：state.env（六闸键/done 键）／driver.log（时间线）／supervisor.log（断摆记录）／report-truth-findings.json（step_issue_rows）／report-audit-findings.json（0/37）／capability-probes.json（51/51）／issues.log（分类计数）／token-meter.py（转录级）。
- 方案正本 §5.16 落节后 grep 锚点自检；设计索引随批再生成（gen-doc-indexes --write）。
- 本批纯文档无代码测试面；main 直提交（同 run30 复盘批先例，无 worktree）。

## 设计文档影响

DESIGN_SYNC: none——复盘正本与方案条款属推演面文档（SPEC_GLOB 面），不触及整合正本与数字总账（§C 版本无变化；§A「卡级验证三档」等无新增稳定参数）。
