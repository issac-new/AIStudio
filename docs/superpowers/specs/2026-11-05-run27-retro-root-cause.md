# 2026-11-05 run27 全程复盘根治批（楔子/两连崩/判词消费/指纹归一化）

## 变更

run27 事故总账的五面根治（派单器/建卡面已由并行会话 patch 754 根治，不在此批）：

1. **`simharness/mux/mx-recovery-lib.sh` 失败指纹时间戳归一化**：`mx_fail_fingerprint` 哈希前剥行内时间戳（`[mux FAIL 20:29:27]`→`[mux FAIL]`）。run27 实锤：G4 楔子 23+ 次秒败全同因，但 FAIL 行含时刻→指纹每轮不同→supervisor 同指纹硬停（5 次）永不触发，监督器无限刷单 1h+。归一化后同因秒败 5 轮即停（人工可见），指纹变化（缺口被修）继续自愈的语义不变。
2. **`simharness/mux/run-driver-supervisor.sh` 驱动输出流静默心跳**：spawn 后监控驱动日志 mtime，静默 >600s 且未 report_done＝楔死（run27 实锤：网关停摆窗 SEND-FAILED 后 19 分钟 0% CPU 睡死，判词已落卡无人消费）→ 记 ISSUE＋精确 kill 驱动让断点续跑接力。检测间隔 120s、幂等（每轮至多记一次）。
3. **`simharness/aipay-scenario.sh` G5 段 FAIL 判词重入消费**：断点重进时若评审卡已有 FAIL 终判，先走既有 `g5_fanout` 翻绿路径分派（不立即重派评审），落 `g5_redispatched_after_fail` 幂等键后再派评审——修复与评审并行，省一轮纯 FAIL 重评（run27 实锤：8 秒重派同卡二轮评审浪费 40 分钟窗口）。
4. **`simharness/mux/mx-capability-probes.mjs` 探测分型**：全量 `fetch failed`＝环境不可达（exit 2＋`g4_probe_unreachable` 环境态键），区别于负例红＝能力失效（exit 1）。`aipay-scenario.sh` G4 段对应：rc=2 时不写 `g4_capability_blocked`（不冻结能力判定），记 ISSUE 呈现环境缺口、按窗口等网关恢复重试。run27 实锤：网关停摆期 36/37 fetch failed 被当能力失效→g4_pass 永不置位→ready 硬闸无限秒败。
5. **`patches/755-readpool-fd-count-throttle.patch` readpool fd 计数降频**（产品面）：`hermes_state_readpool._open_fd_count` 每次 read-acquire 前采样（`os.listdir("/dev/fd")` 在 macOS fdesc 上不释放 GIL，fd 数大时毫秒-几十毫秒/次×高频＝GIL 长占用）→事件循环饿死→liveness watchdog exit 75 自灭。run27 两连崩同栈实录（19:56 12.5h 老进程、21:12 新进程仅 1h16m，均在大上下文回合高频读期）。补丁：fd 使用缓存 TTL 秒级→30s＋acquire 采样比 1:16（每 16 次 acquire 才查一次缓存新鲜度）——fd 压力本身变化慢，降频不损语义（EMFILE 探针路径不变）。

## 决策记录

- **指纹归一化选「剥时间戳」而非「整行去前缀」**：保留 FAIL 语义文本（闸名/原因）作为指纹主体，只剥时变部分；时间信息仍完整留在日志原文。
- **静默心跳选「日志 mtime」而非「进程 CPU」**：run27 睡死形态=0% CPU 活进程，CPU 判不出「活着但不干活」；驱动一切健康活动（等待环 tick/催办/判词读）都写日志，mtime 停滞即无产出。600s 阈值>最长正常 tick 间隔（观察环 60-120s×数次），误杀面为零。
- **G5 FAIL 重入消费不动判词复用 PASS 支路**（run8 优化 E 语义保留）：只在 FAIL 态插入翻绿分派前置；熔断语义（两轮未过不得发布）不动。
- **探测分型三态而非二态**：ok（0）/能力失效（1）/不可达（2）。rc=2 不冻结、不置位、记环境 ISSUE——网关恢复后断点重进自动重判（run27 手术配方的产品化：当晚两次手工清 `testpass_done/g4_capability_blocked` 的场景不再需要手术）。
- **readpool 补丁选降频而非换实现**：`listdir` 换 sysctl/psutil 无按进程 fd 可靠源；fd 压力是慢变量，采样降频即消除 GIL 热点；EMFILE fail-closed 路径（-1）不在降频面（异常路径必实时）。
- 部署纪律：run27 在跑，本批全走 worktree 合 main，**运行面换血（supervisor/驱动重启＋SIM 快照补丁）等 report_done 后统一执行**——避免在跑面热换。

## 验证

- 指纹：单测直调——含时刻的重复 FAIL 行集两次哈希相等；不同语义行不等（见守门测试）。
- 静默心跳：行为测试（子进程长静默被 kill＋记 ISSUE；正常滚动不触发）。
- G5 重入消费：grep 接线断言＋`bash -n` 语法门。
- 探测分型：mjs 直跑（全 fetch failed→exit 2；负例红→exit 1）＋场景段 rc=2 键位断言。
- readpool 补丁：`npm run inject` 后 SIM 快照源 diff 仅预期块；py_compile 过。
- 收编：`2026-11-05-g4-probe-profile-fix.md`（今晚热修的 default→fanfan）随本批登记索引。

## 设计文档影响

DESIGN_SYNC: none——harness 自愈/判定机制加固与产品补丁，推演闸门语义（V3 硬闸/熔断轮次）不变；理由=楔子与崩类为执行层缺陷，根治不改变任何闸的通过判据。
