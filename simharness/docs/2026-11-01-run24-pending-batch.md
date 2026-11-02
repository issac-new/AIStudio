# run24 收官窗口待落批清单（值守期立项/挂账的正式台账，2026-11-01 12:15 建立）

> **2026-11-02 收口状态：9 件全部闭环。** 明细见文末「收口对账」节；本清单自此转历史档（新欠账进清偿门）。

> 值守期间因「驱动/网关在跑面不热换」纪律推迟的批，run24 report_done 后按序落地。
> 本文件是这些欠账的单一事实源，run24 复盘 spec 收编后退役。

## 批 A：驱动面（aipay-scenario.sh，收官后可换版）
1. **DM 直达后备**：dispatch_in_room/nudge 增 DM 通道后备（群消息触发失灵四例实证——08:39 动员令 15min 零响应 vs DM 秒触发；产品缺陷证据在 watch-last.txt）。
2. **复测预启动钩子**：lead 合并落 integration（[LEAD-MERGE] 检出）自动向测试侧发预启动令（09:39 手工版验证有效）。
3. **early-start 预备步**（parallel-dispatch-saturation spec 件 1）：闸等待期自动派尾段材料预备键（prep_uat/prep_release/prep_retro）。
4. **跨域依赖看护**（同 spec 件 2）：等待期检出待合 fix 分支→自动 DM 催 lead（mei 前端支阻塞 fei 100min 实据）。
5. **工作区 origin 立法**：mx-setup 建工作区 origin 统一指 bare（双仓分裂根治；run24 值守已手工迁移 13 区）。

## 批 B：产品面（custom/server 或网关，收官后统一部署）
6. **chat 自恢复第二块**：会话级恢复 prompt 注入（第一块 722 已落：EmptyStreamError→timeout 入梯子；spec=2026-11-01-chat-turn-recovery-design.md）。
7. **利用率报告渲染行**（parallel-dispatch-saturation spec 件 3）：mx-report-gen 增编制利用率行（基线单 saturation-low 已在 run24 issues.log）。

## 批 C：工具链
8. **mx-clean 清场面含 GitHub 真远端截断**（双仓分裂的清场侧根治；run24 靠值守桥接 4 稿+手动迁移）。
9. **studio 重建重启**：使 verdict.ts 中文分项判词生效（已合 main 未热载——run24 评审用 token 行不受影响）。

## 已当场闭环（对照，无需再动）
722 补丁（热载生效）/proxy 幂等（新版实例在位）/⑩b/⑩c（下轮 prelaunch 生效）/tesseract chi_sim（装回）/room_done 帧替换/fei 跨轮 cron 清理/13 工作区迁移（手工版，立法在批 A5）。

## 收口对账（2026-11-02，run24 复盘根治批 + 运行面修复）

| # | 项 | 状态 | 落点 |
|---|---|---|---|
| A1 | DM 直达后备 | ✅ 已闭环 | `mx-scenario-lib.sh` `mx_dm_send`/`mx_nudge_dm_once`（二次催办升 DM，`MX_NUDGE_DM`）；守门 233/233 |
| A2 | 复测预启动钩子 | ✅ 已闭环 | `pretest_prestart_once`（`[LEAD-MERGE]` 检出→sha 幂等预启动），defect/testpass 等待环挂 tick |
| A3 | early-start 预备步 | ✅ 已闭环 | `mx_prep_early_start_tick` 三预备键＋派发；G5 派发词接「在草稿上定稿」；监督器内环补位（驱动熔断退出时仍 tick） |
| A4 | 跨域依赖看护 | ✅ 已闭环 | `dependency_watch_once`（未合 fix 分支→域 lead 600s 节流催，群+DM） |
| A5 | 工作区 origin 立法 | ✅ 已闭环 | `mx-setup` 统一 origin=本地 bare＋prelaunch **⑩d** 单一性检查（agent 角色显式跳过） |
| B6 | chat 自恢复第二块（会话级恢复 prompt） | ✅ 已闭环 | 补丁 **725**（`agent/chat_turn_recovery.py`＋`gateway/run_turn_runner.py` 接线）：回合终态失败后同会话续做，预算缺省 1/上限 3、确定性失败与中断不重试；五态自测过；SIM 快照已重放＋网关重启加载（2026-11-02） |
| B7 | 利用率报告渲染行 | ✅ 已闭环 | `mx-report-gen._staffing_utilization`＋第 0 章渲染＋审计查 17（WARN） |
| C8 | mx-clean 清场面含 GitHub 真远端截断 | ✅ 改方案闭环 | 决策 D2：以「origin 单一立法＋⑩d 守卫」取代破坏性截断（分裂结构性不可能再发生） |
| C9 | studio 重建使中文判词生效 | ✅ 已闭环 | 02:03 `build:full` → rsync product-dist（02:08）→ 重启 8802；活体三态验证 PASS/空/FAIL |

**运行面收口附加（同批）**：722/723 纳入注入白名单并重放（`mx-up` 02:05，SIM 快照实测含 722 分类与 723 函数）；板团队围栏修正 4 板（`skipped_nonspawnable` 5→0，实派 spawned=1 实证）；run24 遗留 ready/running 卡 5 张全部封冻结（原因入卡注释）；run24 归档报告链重跑（35 键快照＋两单 DISP 补齐，审计 rc=0 自洽）。
