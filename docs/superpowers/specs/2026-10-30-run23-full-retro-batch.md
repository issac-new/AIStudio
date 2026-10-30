# run23 全面复盘批：轮换档位供给根治 + 断言幂等 + 确定性失败停摆

日期：2026-10-30 ｜ 轮次：20261028-v8-run23（复盘/续推）｜ 类型：fix（harness 执行层）

## 变更

1. **`simharness/mux/mx_rotation_mode.py`（新增）+ `mx-setup.sh`（4c 段）**——会话轮换档位归一。多路复用下每个 profile 的回合经 `gateway._gateway_config_home() → get_hermes_home_override()` 读的是**自己 profile 家的** `config.yaml`；run23 实录档位只写在 `$HERMES_ROOT/config.yaml` 时，各 profile 仍是默认 `report` 档：轮换只追加建议通知、不动会话，上下文继续涨到 126K/241K 后被上游流截断。实测证据：09:21-09:26 三条轮换记录 `reason=report:context-size`（阈值已咬合但档位是 report）。修法：`mx_rotation_mode.py --mode auto` 幂等写入根 + 全部 profile config（42 份），`mx-setup.sh` 每次供给自动归一（单一事实源，禁两处各写一份实现）。
2. **`simharness/mux/mx-lib.sh`**——补丁 705（会话上下文绝对尺寸轮换）与 707（terminal-incomplete 掐流残响不得当完成）登记进 `mx_apply_agent_patches` 部署清单。此前二者只登记在 `patches/series`，而 agent 侧补丁的实际部署通道是这份清单：**宣告≠生效**，SIM 树从未拿到 705/707（实测 `grep -c SOFT_ROTATE hermes-agent-src/gateway/session_rotation.py` 部署前为 0）。
3. **`simharness/aipay-scenario.sh`**——R28 编制三方对账两修：
   - 人类账号口径收窄为 `^jwt_<名字>=`。`^jwt_` 会把 admin 的服务令牌 `jwt__gov`（双下划线，governance 客户端写入）算进人类账号，再 `+1` 补 admin 即重复计数，恒报 `matrix=16` vs `roster=15/org=15` 假不一致（run23 实录 48 条同文刷屏）。
   - roster / g2-security-not-closed 两处状态断言改 `issue_once`。冒烟段无 `_done` 幂等键、每次驱动重启都重跑；`g2-security-not-closed` 在等待/重入面反复触达——状态断言不是事件流，一次在案即可。
4. **`simharness/mux/mx-scenario-lib.sh`**——`lifecycle-service-unreachable|gov-report` 改 `issue_once`（报告链两次调用重复记单同因）。
5. **`simharness/mux/run-driver-supervisor.sh`**——确定性失败硬停：连续 N 次（缺省 5，`MX_STORM_SAME_MAX` 可调）退出且**失败指纹**（驱动日志新增段末的 FAIL/条款行哈希）不变，判定确定性失败，记 `ISSUE|driver-deterministic-fail` 并退出（rc=3），指纹变化才继续自愈。run23 实录：报告步审计在同一批缺口上必然复现 FAIL，30s 重启只是把同一份 FAIL 再算一遍，连续 11 次、65 分钟零新增信息。
6. **`simharness/tests/roster-account-count.test.sh`（新增）**——三断言守门：计数口径（14 人类 +1 admin=15，含服务令牌会得 16）、源码口径锁定（改回 `^jwt_` 即红）、`issue_once` 去重语义（同 key+subject 吞、不同 subject 各记）。
7. **`simharness/mux/mx-report-audit.py`**——R18「载荷全缺」判据按 `_STAGE_ALIAS_STEPS` 做同段别名折算。步 2/4 是冒烟段的子步（账号配置/功能就绪），产品面无独立操作位，实拍帧与载荷天然挂在同段兄弟步（1=smoke、3=登录）上；此前只对「采集失败凭证」做别名折算，载荷判据没折算，导致 2/4 恒报载荷全缺（run23 只得靠降级登记转录）。同段任一步有载荷即视为该段已覆盖，兄弟步一样空才报（不假全过）。

## 决策记录

- **G3/G4 缺证过闸（`g3_evidence_gap`/`g4_evidence_gap` 落键后仍置 pass）不改判据**：这是 V8.x 已立法的 fail-soft 口径（缺口如实呈现、闸语义由 G5 兜底），run23 实证它按设计工作——G5 正是以「证据链未落基线」为缺项①连续 18+ 轮拒绝认证。属风险非缺陷：门禁可带缺口放行，全靠 G5 复核；若后续要收紧须改方案 §5.3 判据（需用户裁决），不在本批擅自变更。
- **verify/S2-r13 冲突不代决**：预演 8 文件冲突，且该支含「台架方言垫层拆除、3 例假绿转真红」披露——是否把真红带进 integration 属 lead/PM 判断，导演只代行三支无冲突的机械合并（另记 `ISSUE|lead-merge-fallback`）。
- **配置编辑免重启生效**：`load_user_config_effective` 以文件签名做缓存键，改 config 即失效重读，故 42 份 profile config 的档位修改在下一回合即生效（实测网关 09:43:49 对各 profile 重放 `MCP servers reconciled with config`）。
- **`vendor/hermes-agent` 里没有 705 不是缺陷**：`npm run inject` 在「上游工作树不干净」时整链拒绝执行（rc=1，本次实测输出 `[inject] 上游工作树不干净,先运行 npm run clean`）——而推演进行中 vendor 携带的正是注入脏态（预期工作态、不入提交），故 inject 本就不该在 run 中跑，服务在跑的现场也不能 `npm run clean`。agent 侧补丁的**运行期通道**是 `mx_apply_agent_patches`（本批已补齐 705/707）；vendor 的 705 会在下一次 clean+inject 周期自然收敛。

## 验证

- `python3 mux/mx_rotation_mode.py --mode auto <root> --glob '<profiles>/*/config.yaml'` → 改动 42 份 / 已一致 1 份；二次执行「改动 0 份 / 已一致 42 份」（幂等）。
- `bash simharness/tests/roster-account-count.test.sh` → PASS（三断言）。
- `bash -n` 过：`aipay-scenario.sh`／`mx-scenario-lib.sh`／`mx-lib.sh`／`mx-setup.sh`／`run-driver-supervisor.sh`。
- SIM 树：705 已就位（`grep -c SOFT_ROTATE` = 2，档位 auto 生效后轮换将从 `report:` 转 `auto:`）；707 应用后 `ast.parse(codex_runtime.py)` 通过（生效需下次网关重启）。
- 缺项①实测推进：三支预演 CLEAN 并已合入，`integration/RFD-001` 7818b52→f90d35e，`merge-base --is-ancestor` 三支全 IN。

## 设计文档影响

DESIGN_SYNC: none——本批全在 harness 执行层（供给/断言/监督器）与 SIM 运行态配置；六闸名称、26 步、判据与整合正本零改动。G3/G4 fail-soft 风险与「是否收紧判据」已列为待裁决项，未改口径故不需修订正本。
