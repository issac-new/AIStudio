# run21 起跑前置清单（2026-10-16 复盘批产出）

依据：全流程推演方案正本 V8.36 + run20 复盘报告（docs/2026-10-16-run20-retrospective.md）+ prelaunch 十八项。
本清单是 run20 复盘批的收官件：prelaunch 已扩到十八项（⑱ 报告真值三件套），本文件把复盘发现的四类问题转成开跑前必须逐项打勾的动作。

## 一、prelaunch 十八项（机械门禁，`bash mux/mx-prelaunch-check.sh`）

实跑注意：① 门禁测试套件内含 vitest 全量（约 5 分钟）+ sh 守门并行（约 40 秒），
整体约 6-7 分钟，外层须给足超时（≥600s），否则被超时杀会留孤儿进程假象。

本轮新增/重点项：

| 项 | 内容 | run20 教训锚 |
|---|---|---|
| ⑯ 代偿清偿门 | 上一轮台账 open 必须 resolve（PR 落码）或 waive（用户批准理由） | run20 开跑时未清且又新增 179 笔 open（auto-approve 150） |
| ⑰ 监督器健康 | 监督器脚本在位+语法；起跑走 nohup bash 形态 | run20 supervisor 15:31 死 5h 无人察觉 |
| ⑱ 报告真值三件套 | report_truth.py 可编译+生成器/审计器/驱动三侧接线+守门测试绿 | run20 4 件往轮产物+13 件死锚+逐步问题单空渲染 |

## 二、复盘专项动作（prelaunch 机械门覆盖不到的人工项）

0. **代偿清偿门**（⑯）：run20 台账 179 笔已清（29 resolve 带产品锚+150 auto-approve 用户裁定 waive，2026-10-16；台账 runs/20261015-v8-run20/evidence/compensation-ledger.tsv，原文件备份 .bak-preclear-*）——run21 prelaunch ⑯ 应直接过。
1. **结构性延后 14 键开跑前人工处置**（纪律 56）：issues.log 中延后族——
   `g2-design-review-fail`、`conclusion-gap`（4 支）、`g3-local-gate-missing`（CHWX/MP）、
   `gate-evidence-blocked`、`merge-conflict`（PAYCORE-C/N）、`test-report-missing`、
   `audit-finding`（REL-DELIVER 商户接入文档缺件）、`g5-ready-fail`、`gate-breaker-tripped`。
   逐键带 file:line 锚回写后，prelaunch 断言其在当轮 prelaunch 段消失。
2. **叙事注册预写必须带 issue_keys**（纪律 72 新增要求）：run21 的 STEPS_META 注册时
   每步预填该步主题的问题单键族；收尾链补注册前先跑「台账键×步归属」盘点
   （生成器 stderr 会自动列未注册键）。
3. **集成分支保留规则**（纪律 71 新增）：赛中建的 integration/RFD-001 在 report_done
   前禁止删除；赛后先打保留 tag 再清理。清中央仓前确认无当轮交付物锚指向该分支。
4. **G3 闸证轮次检查生效验证**：驱动新增 `repo_branch_runtag` 判定，首轮开跑后确认
   issues.log 无 g3-testlog-stale-run 误报（守门测试已覆盖陈旧/新鲜两态，但真实
   分支的 testlog 头部写法以首轮实测为准——若误报，回调 report_truth 的声明位模式
   并同批改三处调用方）。
5. **采集链接线核验**（C3 挂账）：r18-frames.mjs 拍摄位与驱动挂钩在位；盘上帧与叙事
   注册 imgs 对账——run20 的 59 帧「拍而未嵌」不得再现（审计 A5a 会列，但那是事后
   告警，开跑前核验挂钩才是根治）。
6. **产品面两件随重建上线**（纪律 68 三件套验收——部署产物命中+实例在跑+字面触发）：
   零交付检测器 completion.zero-delivery（overlay f7c1c848）；判词扫描器 445c775
   （simharness，run21 起生效）。两者都要有字面触发事件才算式上线。
7. **姿态建议**：standard 连续第三轮。若 run21 auto-approve 类代偿仍高企（>50 笔），
   按纪律 73 触发产品缺陷升级；同时按 §1.5 收紧路径评估 strict 小规模轮。

## 三、待首验项（立法时诚实标注「测试锚待 run21」）

| 纪律 | 待首验内容 | 接线建议 |
|---|---|---|
| 73 净额闸判 | approved.events 该闸裁决 actor 非 proxy 的机械扫描 | mx-report-audit 增查 15（gate 事件 actor 扫描） |
| 74 采集降级上限 | 降级步数>必采 1/3 与报告整轮红徽章对账 | 审计器对 issues.log frame-capture-failed 族计数×报告徽章 |

## 三点五、四大件落地后的新增核验（2026-10-16 晚批）

1. **C3 采集链自动登记**：首轮跑完后抽查 r18-steps.json——capture 步的 op 条目应非零（此前恒 0）；若某步拍摄成功但登记失败，看 issues.log 的 r18-op-register-failed 单。
2. **C4 QGate 真实执行**：G5 时 release-report 应九门有信号（非全 INCONCLUSIVE）；FAIL 门=真实缺口如实呈现（run20 真实证据复判为 5 PASS+3 FAIL——工程基线/依赖审计/概设决策记录三缺口是真欠账，run21 须补）。
3. **D6/卡分类/A7 产品件随重建上线**（纪律 68 三件套验收）：session.starved 检测器+换会话令、completion.zero-delivery 分类升级、事故报告跨天窗口（驱动导出带 state_env）——部署后看字面触发事件。
4. **hermes 侧数据面挂账核验**（A7 边界）：trace span 落盘（SIM 树 traces/）与推演身份册供给（15 员工身份注册）属 hermes telemetry 供给侧——开跑前确认本轮是否具备；不具备则事故报告 absent 项如实呈现（不造假信号）。

## 四、开跑命令序（沿用 runbook）

```bash
cd simharness
bash mux/mx-prelaunch-check.sh        # 十八项全绿
# 全绿后按部署窗 runbook 起驱动+监督器（nohup bash 形态）+网关保母+夜哨
```

红线：无用户明确指令不得启动轮次（启动 runbook 既有声明）。
