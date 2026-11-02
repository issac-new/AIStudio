# 全流程推演方案与程序同步到最新实现

## 变更

1. 方案正本 `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md` 增补产品能力消费面：
   - 新增 §2.6.13 自主性治理（治理姿态、主动性两轴）、§2.6.14 审计质量（安全审计、长程可信）、§2.6.15 评审治理生命周期、§2.6.16 改进实验证据链。
   - §2.6.3 增数据飞轮；§2.6.4 失败路由改六类根因；§2.6.12 补 B/C/D 三层小表；§2.6.8 第 7 行指向新节。
   - §1.3 增治理与审计能力清单；§2.5.1 补工作台概览三问与业务地图语义；§5.4.4 口径三补飞轮、口径四扩为九项。
   - §3.3 步 21 改 `uat_done / uat_conditional`；§2.4 步 15 检查单改五项；§4.1 prelaunch 清单补 ⑩b/⑩c/⑩d；§5.6 补帧 OCR 核对；§5.8.3 增测试稳定性 DSL 行。
   - 纪律编号卫生：§5.5 两条「纪律 85/86」顺延为 §4.3-96/97（流完整性/长调用已有 85/86），§4.3 导读条数改实数。
2. 推演程序 `simharness/`：
   - `aipay-scenario.sh` 步 15 评审卡 body 与派发词补第 5 项历史偏差硬拦截；PASS 后 body 缺该项记问题单 `g2-history-check-missing`（不阻断）。
   - `uat_conditional` 三处映射补齐：`mx-report-gen.py`、`mx-report-audit.py`、`mx-narrative-skeleton.py`。
   - `mx-setup.sh` / `mx-lib.sh`：docker/api 模式补建 `@admin-agent`；新增 `login_password_for`（优先 `creds/<u>.invite-pass`，agent 追加 `-agent`），登录环改用。
   - `mx-prelaunch-check.sh`：㉚ 阶段页签 31→37 并断言六个治理签；㉒ 弱断言改精确 key；头注补 ⑩b/⑩c/⑩d。
   - `qgate-skill-map.md` 45→47、56 项→50 门、纪律 33→83；`steps_entry.py`、`capture-plan.env`、`simharness/README.md` 文案校正。
   - 新增守门 `simharness/mux/tests/plan-program-sync.test.sh`（run-gates 自动纳入）。

## 决策记录

- **方案只写消费面**：新产品能力按「是什么—消费步—证据—是否进判据」四件描述，不复制产品手册；编排域与 modelcap 只登记为产品支撑层，不进推演判据。
- **同名术语拆分**：§1.5 的 `posture` 改称「推演姿态（run posture）」，产品面称「治理姿态（governance posture）」；state.env 键名不变。
- **纪律撞号处置**：全仓检索显示「纪律 85-89」均指 §4.3 的 run23 批次（DM 死信/流完整性等），无引用指向 §5.5 的 85/86；故把 §5.5 两条顺延为 96/97 并迁入 §4.3，§5.5 保留一行指针。
- **账号供给最小改动**：admin/admin-agent 沿用「系统引导例外」，走 synapse 注册而非邀请流（邀请流会重置 admin 口令并降权）；邀请账号登录改读随机初始口令，agent 按产品约定追加 `-agent`。
- **分支起点**：`origin/main` 落后本地 `main` 2 个提交，按「更新到最新」语义从本地 `main` 起 worktree，偏离默认起点已在此记录。

## 验证

- `bash -n` 全部改动脚本；`python3 -m py_compile` 改动 Python。
- 新增守门 `bash simharness/mux/tests/plan-program-sync.test.sh`：G2 五项、三处 uat 映射、prelaunch 37、qgate 47、方案 §3.3 双键。
- `bash simharness/mux/tests/jargon-source-gate.test.sh`（方案 HARD=0）。
- `cd simharness && npx vitest run tests/harness-gate-integrity.test.ts`（26 步/四段式）。
- 方案渲染与格式检查（单 H1、26 步卡、表格列数、stale 词零命中）。
- 账号供给：`login_password_for` 单测 + 静态检查；**新 homeserver 上的 0→1 未执行**，交付说明标未验证。

## 设计文档影响

DESIGN_SYNC: none —— 本轮只更新推演方案与 harness 程序，不动整合正本、机制数字总账与版本载体；新增章节登记的是已实现能力的消费位，不改变产品设计。
