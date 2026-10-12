# run17 前置清单（run16 复盘轮产出，2026-10-13）

> 一句话：run16 的六闸与 UAT 真实通过，但报告证据面曾因四个单点缺陷整链失真——本清单把复盘修复件与 V8.20/V8.21 生效项汇总为 run17 开跑前的核对面。核对责任=开跑操作者；全绿才执行 mx-prelaunch-check。

## 一、复盘修复件须在 main（合分支核对）

| 件 | 仓·分支 | 提交 | 核对锚 |
|---|---|---|---|
| 报告事实面根治六件 | simharness fix/run16-report-truth | 59a444f | keys 兜底/净化器/风暴护栏/结构性红线/锚点解析/记单幂等 |
| runtime 补丁 391 回钉 | overlay fix/run16-retro-plan | a94e386 | runtime/hermes_cli/kanban_db_dispatch.py 含 _board_json_unreadable |
| 方案 V8.21 修订 | overlay fix/run16-retro-plan | 8f2be52 | 纪律 44/45+红线①结构性锚定+§5.7 基线回填+R16 |
| 采集端登录壳页根治 | simharness（同分支追加提交） | 见 git log | r18-frames.mjs relaunchLogin+壳页签名两处 |

## 二、run17 形态与种子

- 建议形态：先跑 lite 轮（runs/20261012-v8-run17-lite-acp 目录已在——ACP 后端实跑轮，待 run16 收官即启动，本复盘已收官）。种子：`bash mux/mx-lite-seed.sh --to 20261012-v8-run17-lite-acp --from 20261012-v8-run16`；夹具闸键时刻自源轮 state.env 真值（g1g2_fixture=1 分带呈现）。
- 全量轮紧随 lite 验证后：RFD 不变则为回归全量；换需求按 §3.2 换轮声明。
- V8.20 §5.8 环节准入准出 run17 起生效：首跑红项=口径变更信号（正则口径随首跑校准），不是质量退化——按 §5.8 生效口径处置，禁回退断言。

## 三、新防线生效核对（本轮复盘新增，开跑前逐条在场）

1. 生成器 keys 兜底：mux/mx-report-gen.py 含 `_STEP33_DEFAULT_KEYS`（注册漏填时回落 §3.3+stderr 警示）。
2. 审计一致性断言：mx-report-audit.py 含「步骤完成态与 state 矛盾」FAIL（lite 轮豁免）。
3. 壳页结构性红线：审计器 md5 分组断言（单一像素组 ≥2 步键共用且 >10% FAIL）。
4. 台账净化器：mux/mx-log-sanitize.py 存在+报告段接线（aipay-scenario.sh 报告块头部）。
5. 监督器风暴护栏：run-driver-supervisor.sh `_storm` 计数（≥3 记单/≥10 退避 120s）。
6. 采集锚单一事实源：清扫循环与三处挂钩经 `marker_eventid`；r18-collect 锚预检+记单幂等。
7. 采集端登录自愈：r18-frames.mjs relaunchLogin（坏页重试前重拉 token）+登录壳页签名（连接你的运行时/Connect your runtime）。
8. prelaunch ⑪ 上轮注册锚=20261012-v8-run16（PART1_BY_RUN 已注册，11b6aad）。

## 四、run17 观察项（run16 挂账，不阻断开跑）

1. **采集链登录态丢失的服务端根因**：采集端已加自愈与签名，但「studio 为何把有效会话弹回 /login」未定因（17:40-17:55 采集停滞窗口与网关 fetch 挂起/重启时段重叠）——run17 若复现，按 mx-report-audit 结构性红线 FAIL 现场取证 studio 日志。
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
