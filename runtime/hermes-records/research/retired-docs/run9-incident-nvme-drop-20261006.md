# run9 NVMe 卷脱挂事故记录（2026-10-06）

- **事故窗**：2026-10-06 06:50（最后确认正常，UAT 对账进行中）— 09:19（整机重启日志证据：base system 挂载 + 系统服务起动序列）。重启后外挂 NVMe 卷（disk4s2，nvme2230，1TB，Case-sensitive Journaled HFS+）挂载挂起：45 秒限时挂载超时两次（一次与他路挂载互锁，清理后单路复测仍超时）。
- **用户处置**：磁盘急救（First Aid）进行中；恢复后由会话轮询监视器接管续跑。
- **随卷消失的进程**：推演驱动（pid 90424，接力棒累计 0）、relay 接力器（pid 82546）、gateway :8801 / studio :8802、synapse 容器（docker 守护进程重启后待查）。驱动与 relay 设计内可重建：relay 拉起驱动后按 state.env 段键幂等续跑（掉线点=UAT 段，uat_done 未落）。
- **数据面评估**：
  - 安全（不在该卷）：run9 全部中央仓交付物（freeze/tasklist v14/四系分稿/schedule/测试报告/发布工件）均在 GitHub origin/main 与分支；两仓代码（overlay/simharness）在主树已推。
  - 在该卷、待卷回归验证：state.env（21 阶段键+g1/g2/g3/g4/g5 落键）、issues.log（7 条 ISSUE 原文）、r18-steps.json（必采 9/11 已采：对话 9/11/17/19、帧 8/10、效果 7/20/17/18 增补）、screenshots/steps 帧、scenario.log/driver.log 全程日志、快照（agent-src 含 564、product-dist v0.7.30）、workspaces、synapse 数据（归属待查：容器 inspect 需 docker 守护进程恢复后复核）。
  - 会话内可重建：r18 采集的锚点与内容（对话锚 $6x9n2…/$Z_X2s…/$UIQX…/$OhFD4…；效果锚 b10a5bc/ee91d60/t_3c601a2b/approved.events 等均在对话日志）；7 条 ISSUE 摘要在案（4×raci-dispatch-missing、agent-prework-bypass-g2、anexec AN-MP 首窗超时、integration 推送未达）。
- **剩余采集**（卷回归后续跑补齐）：对话 21（UAT）、效果 24（G6）、帧 25（IDE）。
- **教训候选（run9 复盘入账）**：SIM_ROOT 单卷依赖=单点故障；推演关键台账（issues.log/state）应双写系统盘（harness 改进项，run10 前评估）。
