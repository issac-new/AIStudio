# run32 开跑实测修订：方案 §5.18 四条＋mx-setup 4f 车道自检（七轮烧机实录）

## 变更

run32 开跑前烧机第七轮 fail 定谳与模型车道双层根因修复的方案/程序进位（实测证据链见烧机收据 `burn-20261128-011450`，fail 原因 `attempts=4;fail_lines=1;goal_step_not_reached(archgate)`）：

1. **方案正本（`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`）新增 §5.18「run32 开跑实测修订条款（2026-11-28 立）」四条**：
   - 第 1 条 G2 评审窗口预算立法：`MX_G2_WAIT=1800`（第七轮铁证：secops 真评审 23 分钟、驱动 600s×2 窗口 06:28:10 fail-closed、判词 06:30:55 交卷仅晚 2 分 45 秒）；env 级立即生效（第八轮烧机与 run32 起跑 launch env 必带）；机制面默认值修订（`aipay-scenario.sh` 的 `MX_G2_WAIT:-600`）挂账——收据 digest 绑定该文件，在途烧机未收口前禁改，待第八轮收据落定后随批修订。
   - 第 2 条 模型车道队列成员资格与自检：cc-switch 车道路由以故障转移队列为准（`providers.in_failover_queue=1`），仅建行不入队＝通道永不路由（11-27 恢复缺口＝第七轮 a1 整试零成功 LLM 调用的根因之一）；恢复通道 checklist（写行含队列位＋sort_index＋`wal_checkpoint(TRUNCATE)`；生效判据=provider_health 冒出该行且 `last_success_at` 刷新，代理热加载免重启）；车道终态 CGLM 主／xglm 死钥（cbac1062 双面 401）待换／SGLM fallback。
   - 第 3 条 值守环实现模式：值守优先 Bash 后台 until 环（120s 轮询，结果落盘/断摆即退、宿主唤醒）；Cron 巡检环两条实测限制在案（任务会话内不能再建定时任务＝平台限制；长会话 compulsive 列表读取循环两次实证）——Cron 仅限新会话创建且必须带自停条件。
   - 第 4 条 烧机窗口预算总则：评审/人闸类窗口默认值按「夜间真评审实测耗时×3」校准，G2 是首处；run32 复盘对 G5 HumanGate、UAT 条件窗做同型核对。
   - 运行基面块补一句车道终态线。
2. **`simharness/mux/mx-setup.sh` 新增 4f 段「模型车道自检」**：cc-switch hermes 车道队列为空／队列成员无一健康时大声告警（不阻断——车道属宿主共享面，修复走 cc-switch，供给段不代改），把第 2 条的 checklist 固化为供给幂等步；mx-setup 不在 MECHANISM_FILES，不触发烧机收据失效。

## 决策记录

1. **Mechanical·G2 窗口走 env 而非立即改机制面**：`aipay-scenario.sh` 在 MECHANISM_FILES 清单内，收据 schema 2 按当前 digest 绑定——第八轮烧机在途（RUN_ID=burn-20261128-064521），改文件即令在途收据 verify-latest 失配、白烧 5 小时。env `MX_G2_WAIT=1800` 语义相同、零收据影响；默认值修订挂账为第八轮收口后的随批项。
2. **Mechanical·车道自检放 mx-setup 供给段、告警不阻断**：车道是宿主共享基础设施，供给段职责=「开跑前把已知致命态喊出来」，修复动作（换 key/调队列）属宿主面操作不由推演供给代行——与 4b-4e 段「失败只告警不阻断」同风格。
3. **Mechanical·值守模式立法进方案而非仅进记忆**：Cron 循环与平台限制已在两次值守切换中实锤，属于会跨会话复发的操作面约束；写进 §5.18 让后续轮次的值守搭建不再重踩。

## 验证

- `bash -n simharness/mux/mx-setup.sh` 语法过。
- 4f 幂等性：对当前环境（CGLM 主健康）预期输出「模型车道自检：队列 N 成员、健康 N」；不会写任何状态。
- 方案正本 jargon HARD 门（`scripts/plan-html/jargon-check.py`）与既有结构守门（`simharness/tests/retro-report-plan.test.sh` 的 §5.x 标题断言）不受影响（新增 §5.18 不改动既有标题）。
- 第八轮烧机在途不受影响：本批不动 MECHANISM_FILES 内任何文件，mx-setup 非机制文件。

## 设计文档影响

DESIGN_SYNC: none。本批为推演运行事实与供给程序修订（G2 窗口预算、cc-switch 车道队列成员资格、值守环模式），不触四注册设计正本（docs/DESIGN.md、设计总账、两工作台正本）的契约面；方案正本 `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`（运行基面车道线＋§5.18 四条）承载运行规则，其不在 DESIGN_DOCS 注册表内，修订随本批同提交。
