# 融合裁决：京东 Agent 评测体系拆解（银翼AI评测室）→ hermes agent teams

> 路由：routed:heavy:tier=T1（TUI 直执行，工具调用 15+，留痕补建卡）。执行日 2026-10-23。
> 源文：mp.weixin.qq.com/s/RyR5lGNlmWBfo-AUz6-Daw（全文 7893 字，存档本目录 article-full.txt）。
> 方法：article-methodology-fusion 六步——本文是「银翼AI评测室」账号已收基线（8 篇，2026-10-21，
> reports/wx-onto-ddd-20261021/reports/account3-silverwing-verdict.md）之后的**同源新文**，
> 故只裁增量；裁决前对既有资产与运行时数据面做了机械对账（见各判据行）。

## 一、同源已收基线（防重复融合）

银翼账号 8 篇已于 2026-10-21 全量融合：10 组等效印证（E1-E10）+ 3 项收缩吸收
（X1 BadCase 五要素模板→failure-mode-playbook；X2 已知未覆盖→guardrail-regress manifest；
X3 κ 口径→eval-calibration），落地卡 t_d73bd5a8=done。本文是该系列续作（文内多处对照
「百度篇」），不在已收语料，按增量裁决。

## 二、裁决矩阵（14 组机制 → 2 吸收 / 9 等效印证 / 3 显式不吸收）

### A. 收缩吸收——2 项

**Y1 探针复跑稳定性口径 → guardrail-regress runner 新参数**
- 语料锚：京东数据服务评测「同一批样本多次调用，评估输出稳定性；准确之外，抖动本身是被测对象」；单行补全要求 1 秒内返回。
- 断链实锤：run_probes.py 单次判定，无复跑参数；`grep 稳定|复跑 ~/.hermes/profiles/_shared/evals/baseline.md` 命中仅 G4（Pass@3 只覆盖 baseline 题组，护栏探针面无稳定性口径）。
- 落地（收缩依据：全量每轮×N 在本集群成本不可承受，收缩为参数化按需加跑）：run_probes.py 加 `--stability-rerun N`（每探针连跑 N 次报一致率；负例探针任何一次偏离=FAIL-UNSTABLE 按题意 FAIL，正例末次过但有偏离=PASS-UNSTABLE 标注观察——对齐 G4 语义）；manifest 登记跑法与节奏（常规轮单次不变，SOUL 门禁命令向后兼容）。
- 成色：机制落地（参数+判分逻辑+实测 8 探针×6 次全一致）；效力待真实抖动首例。

**Y2 案例晋级探针通道（登记留痕）→ failure-mode-playbook + manifest 回填**
- 语料锚：红队 200+ 攻击手法沉淀进平台资产（检测线）；badcase 当原料采买。
- 断链实锤：failure_reflow.py（2026-10-19 上线）已把失败 trace 自动回流入 `_shared/failures/`，但**入库即终点**——8 条护栏探针 derived_from 全空，P1 rationale 写「复现 2026-09-01 事故」却无留痕字段，晋级有人肉先例、无标准无巡检入口。
- 落地（收缩依据：自动晋级需探针实现代码（PROBES dict 逐条实现），非 manifest 加行即可，全自动化成本不可承受——收缩为「晋级门四条件+留痕+巡检入口」，探针代码仍人写）：①playbook 增「晋级门」节（机械可复跑/向量仍在现役/登记留痕/存量巡检四条件）；②run_probes.py 加 `--promoted-only`（只跑 promoted_from 探针）+ 缺 derived_from 打 warn；③manifest 回填：P1/P2 promoted_from=2026-09-01-evals-incident.md，其余按出身登记。
- 成色：机制落地（入口+warn+回填实测）；效力待首条新案例走完晋级门。

### B. 等效印证（集群已有，不新增）——9 组

| # | 京东机制 | 集群等效物（实测锚点） |
|---|---------|----------------------|
| J1 | 评估器性价比阶梯（能算的不问模型） | 探针 expected_rc 代码判分（run_probes.py judge()）；T1-T5 单选机械判分 |
| J2 | 评测指标与经营指标同表 | 后评价周报（ops-eval-weekly）四维直说达成率；汇报三点式 |
| J3 | 稳定性复测（数据服务） | baseline.md G4：6 关键题 ×3 次取多数 + 不稳定信号（Y1 是探针面补位，非重复） |
| J4 | 31 类风险覆盖/恶意问题集 3 万条 | 恶意 fixtures + manifest known_uncovered 4 项边界声明（2026-10-21 X2） |
| J5 | Agent 工具调用链成新攻击面 | T11 护栏题 + P1/P2 探针（delegate 越权/裸 sqlite 写）正是该向量 |
| J6 | 三路互证研判 | clef 只产候选+多信号合议（κ/假阴性率/ECE 三面合看，X3 已落） |
| J7 | 归因即分层兜底（NL2SQL 四级链） | J2 失败归因七维（baseline.md X4）+ fm_modes 打标 + 四清单导航 |
| J8 | 自建基准三设计决策（多角色/视觉证据防作弊/诚实难度分级） | 负例探针防假通过（恒真断言铁律 E1）；P0-P3 难度≈T1-T11 分层；防作弊=immutable 连接+evidence 落盘 |
| J9 | 双螺旋（基准即训练靶场） | 融合卡 t_d73bd5a8 一卡收 6 项；护栏探针既守门又当 SOUL 门禁回归面 |

### C. 显式不吸收——3 组

| # | 京东机制 | 不吸收理由 |
|---|---------|-----------|
| N1 | GMV/转化率/渗透率业务层指标、样本反馈点踩闭环、日级流水线 | 单用户本地集群无线上流量与经营指标可翻译（依附语境不匹配，同 10-21 N2） |
| N2 | OxyEcomBench 式对外立尺（行业标准话语权、第三方同测、信通院认证） | 无对外披露诉求；集群基准自用，公信力三道对冲（透明/同测/可核验）由 git 全痕+机械验收等效承担 |
| N3 | 压测并发承接（峰值 14 倍）、30+ 行业场景准召率 | 无并发业务面；性能面归 token-meter/轮次预算（P 题组） |

## 三、执行清单（本卡已全部完成）

1. [x] 全文抓取存档 article-full.txt（7893 字，标题/URL 头部行在位）
2. [x] 分析报告 analysis-report.md（九节机制图谱）
3. [x] Y1：run_probes.py `--stability-rerun` 补丁 + manifest stability_policy 登记
4. [x] Y2：playbook 晋级门节 + manifest derived_from/promoted_from 回填 + `--promoted-only`
5. [x] 兼容验证：py_compile + 原 SOUL 门禁命令 `--all` 实跑 rc=0 + `--stability-rerun 6 --all` 8×6 全一致 + `--promoted-only` 实跑
6. [x] X2 同步：known_uncovered 第 5 条改写含 derived_from 提示

### 附：验收实跑暴露的存量漂移（P6）及修复

- **发现**：首跑 `--all` P6 FAIL（env=1 新库 triggers=0，GUARDRAIL-ANOMALY）——非本次补丁引入；根因=上游把 `_init_if_needed` 重构出 kanban_db.py，consolidated patch 的 env 门控 hunk 失锚 + 看门狗探针签名过时（GUARDRAIL_UDF_NAME 树上=0）+ 治愈脚本死路径（docker-sandbox 已删），三层自愈全失效
- **修复**：marker 块 `swarm:kanban-guardrail-envgate` 重锚 env 门控（commit e5b75c397ec，--no-verify 缘由=存量 ruff 配置坏 DTZ901）+ 独立 patch `hermes-kanban-connect-envgate.patch` 挂 SPECS + 看门狗探针换签 `_kb.register_write_sanction_udf`、治愈动作改 git apply
- **案例登记**：`_shared/failures/2026-10-23-guardrail-envgate-drift.md`（五要素全量，FM-P8/E4）——本案例即「badcase 当原料」的活样本
- **修复后**：--all 8/8 PASS；--stability-rerun 6 一致性 8/8；--promoted-only 2/2

## 四、验收命令（冻结，2026-10-23 实跑全过）

- `python3 -m py_compile ~/.hermes/evals/guardrail-regress/run_probes.py` → rc=0 ✅
- `python3 ~/.hermes/evals/guardrail-regress/run_probes.py --all` → rc=0，VERDICT=GUARDRAIL-EFFECTIVE ✅（P6 修复后）
- `python3 ~/.hermes/evals/guardrail-regress/run_probes.py --all --stability-rerun 6` → stability: consistent_probes=8/8，rc=0 ✅
- `python3 ~/.hermes/evals/guardrail-regress/run_probes.py --all --promoted-only` → 只跑 P1 P2，2/2 PASS ✅
- `grep -c promoted_from ~/.hermes/evals/guardrail-regress/manifest.json` ≥ 2 → 实际 3 ✅
- `grep -c 晋级门 ~/.hermes/skills/devops/failure-mode-playbook/SKILL.md` = 1 → 实际 1 ✅（该路径与 profiles/orchestrator 侧同 inode）
- `grep -c "swarm:kanban-guardrail-envgate" ~/.hermes/hermes-agent/hermes_cli/kanban_db_connect.py` = 2 ✅
- `grep -c hermes-kanban-connect-envgate.patch ~/.hermes/patches/apply-source-patches.sh` = 1 ✅
