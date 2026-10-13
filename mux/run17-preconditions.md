# 下一轮前置清单（run16 复盘轮产出，2026-10-13；编号勘误：lite ACP 验证轮已以 run18 号位收官——runs/20261013-v8-run18-lite-acp，final-report+治理归档在 main 6a180c0。本清单适用于下一个新开轮次（全量轮优先））

> 一句话：run16 的六闸与 UAT 真实通过，但报告证据面曾因四个单点缺陷整链失真——本清单把复盘修复件与 V8.20/V8.21 生效项汇总为 run17 开跑前的核对面。核对责任=开跑操作者；全绿才执行 mx-prelaunch-check。

## 一、复盘修复件须在 main（合分支核对）

| 件 | 仓·分支 | 提交 | 核对锚 |
|---|---|---|---|
| 报告事实面根治六件 | simharness fix/run16-report-truth | 59a444f | keys 兜底/净化器/风暴护栏/结构性红线/锚点解析/记单幂等 |
| runtime 补丁 391 回钉 | overlay fix/run16-retro-plan | a94e386 | runtime/hermes_cli/kanban_db_dispatch.py 含 _board_json_unreadable |
| 方案 V8.21 修订 | overlay fix/run16-retro-plan | 8f2be52 | 纪律 44/45+红线①结构性锚定+§5.7 基线回填+R16 |
| 采集端登录壳页根治 | simharness（同分支追加提交） | 见 git log | r18-frames.mjs relaunchLogin+壳页签名两处 |

## 二、轮次形态与模板/口径现状（2026-10-13 深夜更新）

- lite ACP 验证轮已以 **run18** 号位收官（RESULT exit=0 上 origin 实证，复盘见记忆/治理归档 6a180c0）——run17 号位空缺不再补用，下一轮顺延编号。
- V8.20 §5.8 已对 run≥17 生效（生成器 _m_runno 门控）——run18 已按新口径出报告；其红项=口径变更校准信号（V2 对 run16 工件预校准底表：76 项中 34 未中，明细在 fix/run16-report-truth 提交说明与本文末附表）。处置=按 §5.8 生效口径判读，禁回退断言。
- **八模板 V8.20 增厚层已晋升中央仓**（origin/main 314d669：freeze/design/schedule/test-report/release-plan/acceptance/audit-opinion/retrospective）+驱动生成段（步 7/21/23/24）与派发词（步 13/17/19）字段提示已同步——下一轮工件产出面齐备，34 项底表中模板依赖项预期转绿。
- 种子（如再跑 lite）：`bash mux/mx-lite-seed.sh --to <新轮> --from 20261012-v8-run16`；夹具闸键时刻自源轮真值（g1g2_fixture=1 分带呈现）。

## 三、新防线生效核对（本轮复盘新增，开跑前逐条在场）

1. 生成器 keys 兜底：mux/mx-report-gen.py 含 `_STEP33_DEFAULT_KEYS`（注册漏填时回落 §3.3+stderr 警示）。
2. 审计一致性断言：mx-report-audit.py 含「步骤完成态与 state 矛盾」FAIL（lite 轮豁免）。
3. 壳页结构性红线：审计器 md5 分组断言（单一像素组 ≥2 步键共用且 >10% FAIL）。
4. 台账净化器：mux/mx-log-sanitize.py 存在+报告段接线（aipay-scenario.sh 报告块头部）。
5. 监督器风暴护栏：run-driver-supervisor.sh `_storm` 计数（≥3 记单/≥10 退避 120s）。
6. 采集锚单一事实源：清扫循环与三处挂钩经 `marker_eventid`；r18-collect 锚预检+记单幂等。
7. 采集端登录自愈：r18-frames.mjs relaunchLogin（坏页重试前重拉 token）+登录壳页签名（连接你的运行时/Connect your runtime）。
8. prelaunch ⑪ 上轮注册锚=20261012-v8-run16（PART1_BY_RUN 已注册，11b6aad）。

## 四、下一轮观察项（run16 挂账，不阻断开跑）

1. **看板路由弹登录页根因（P-Board401Logout，已入产品 backlog §八）**：run16 期间 /app/board 系拍摄位 26 帧 100% 落登录页（按路由完美二分），客户端机制锚=本地 BFF 401→triggerAuthRecheck 清会话跳登录（upstream client.ts:283→172）；**赛后两次现场实验不复现**（单发登录/同 deviceId 重登风暴均正常——诊断脚本 scratch/board401-*.mjs 留档可重跑），run16 时窗服务端日志已轮转不可回查——下一轮若复现，采集端 relaunchLogin 自愈+审计 md5 红线会当场拦下并留 .bad.txt 侧车，顺藤取证 studio/gateway 日志 401 端点。
2. **悬挂 DISP 台账卫生**：run16 有 11-18 键 DISP 无 ISSUE 配对（监控代行修复链记录形态）——纪律 28 悬挂 DISP 判台账卫生缺陷，监控侧记单时同步补 ISSUE 行可根治。
3. **完备性检查分支口径**：原始需求文档 RFD-001-payment-cashier.md 不在 origin/main（派发词引用它）、测试报告在 integration 分支——完备性检查宜区分 main/integration 两口径，避免「缺件」误报（记档，低优先）。
4. **首过率水位**：run16 4/6，G2/G5 各一轮低于 5/6 水位；再一轮低于即触发 §5.8.4 该环节准入自动加严一档（由当轮复盘指定加严项）。

## 五、开跑命令序（不变）

```bash
cd simharness
git merge 分支收口后确认 main
bash mux/mx-prelaunch-check.sh        # 十三项全绿（⑪ 锚已指向 run16）
RUN_ID=<轮次> bash aipay-scenario.sh
```
