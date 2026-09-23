# QGate — 通用交付门禁框架（Universal Delivery Gate）

面向 Code Agent 的可裁剪软件交付质量门禁：**没有证据不得 PASS**。
设计文档：`overlay/docs/superpowers/specs/2026-09-23-qgate-universal-delivery-gate-design.md`（v0.2，上游 v0.1 见 `ncwk/docs/universal-delivery-gate-zcode-design-v0.1.md`）。

## 组成

```text
custom/qgate/
├── src/core/         内核（平台无关）：Claim/Evidence/Gate/Risk/Exception + 判定 + 存储 + Profile + 影响分析 + 语义对齐层
├── src/executors/    command（argv 白名单）+ persistence（SQLite 快照/字段断言/跨表不变量）
├── src/cli.ts        CLI：plan / run / status / explain / evidence / risk / validate-config / init
├── plugin/           ZCode 插件（SessionStart/PostToolUse/Stop 三 hook + 3 命令 + 1 技能）
├── gate-packs/       内置门包：engineering（basic-check）+ persistence（integrity）+ _profiles（三档）
├── examples/payment-demo/   Phase 4 演示：单测全绿 + 持久化门 FAIL（amount 单位换算植入缺陷）
└── __tests__/        vitest 24 例（overlay 根 npm test 自动收）
```

## 快速开始

### 在项目里启用（项目级 opt-in）

```bash
cd <你的项目>
node overlay/custom/qgate/dist/cli.js init     # 生成 .qgate/qgate.yaml（默认 profile: feature-close）
node overlay/custom/qgate/dist/cli.js validate-config
node overlay/custom/qgate/dist/cli.js run --all
```

项目无 `.qgate/` 时，插件与 CLI 全部静默放行——注册全局插件不影响其他项目。

### 安装 ZCode 插件（inline 开发态）

```bash
# 1. 构建
cd overlay/custom/qgate && npm install && npx tsc -p tsconfig.json

# 2. 注册 inline 插件（写入 ~/.zcode/cli/config.json 的 plugins.dirs）
#    "plugins": { "dirs": ["/abs/path/to/overlay/custom/qgate/plugin"] }

# 3. 启用 hooks（zcode 全局开关默认关，~/.zcode/cli/config.json）
#    "hooks": { "enabled": true }

node <zcode>/dist/zcode.cjs plugin list   # 应见 qgate@inline [enabled] hooks: 3
```

### Payment Demo（单测绿 ≠ 数据对）

```bash
cd overlay/custom/qgate/examples/payment-demo
npm test                                             # unit 5/5 pass（响应契约正确）
node ../../dist/cli.js run data.persistence-integrity # FAIL：amount 10000 ≠ 100（field-diff + invariant 双证据）
sed -i '' 's/amount \* 100/amount/' db.mjs            # 修复植入缺陷
node ../../dist/cli.js run data.persistence-integrity # PASS
```

## 判定语义（六态）与对齐

`PASS | FAIL | CONDITIONAL | INCONCLUSIVE | WAIVED | NOT_APPLICABLE`

- CONDITIONAL 必带解除条件（对齐交付标准 G4 与 matrix-teams delivery-protocol v2 的 conditional）。
- INCONCLUSIVE：证据不可得 ≠ 通过（executor 起不来、工具缺失都落这里，Framework ERROR 不是 Gate FAIL）。
- 证据强度三级 present/wired/exercised：**仅 exercised 可支撑 PASS**（对齐交付标准 §4.3）。
- Profile 三档 ↔ 交付标准 tier：vibe-fast↔lite、feature-close↔standard、high-assurance↔compliance。

## Stop 门禁与降级阶梯（zcode 硬约束适配）

zcode Stop 钩子续跑上限 3 次（`MAX_STOP_HOOK_CONTINUATIONS`）。QGate 策略：**最多阻断 2 次**（第 2 次附"最后预算"警告），耗尽后放行并登记 Risk（`.qgate/risks/risk-degraded-*.json`）。Stop 只做轻检查（`status --fresh`，<5s）；重执行全在命令面（`/qgate-run`）。

## 安全边界

- command executor 只执行 Gate Spec 声明的固定 argv（spawn，无 shell 拼接），cwd 锁项目根。
- `.qgate/` 运行数据（runs/evidence/risks/state）默认 .gitignore；配置（qgate.yaml/profiles/gates）入库共享。
- 插件对未启用项目零副作用（cwd 无 `.qgate/` 即 no-op）。

## 阶段实证（evidence/ 目录，2026-09-23）

| Phase | 验收 | 结果 |
|---|---|---|
| P0 Spike | hook 闭环 5/5（安装/发现/SessionStart/Stop 反馈/日志） | 5/5 PASS（headless 实证阻断-续跑，2 次模型请求铁证） |
| P1 内核 | lint 错 FAIL → 修复 PASS，CLI 与 Stop 双通道一致 | PASS（22 单测 + CLI 实证） |
| P2 修复闭环 | agent 写坏代码 → Stop 阻断 → 修复 → 放行；runs 记录两跳 | PASS（headless 9 请求；INCONCLUSIVE(never) 首拦 → FAIL → 修复 → PASS 放行） |
| P3 Profile+Impact | 改 README 不触发；改 src 触发；Profile 裁剪生效 | PASS（四项 CLI 实证） |
| P4 Persistence | 单测全绿 + 持久化门 FAIL（植入缺陷）；证据六件套落盘 | PASS（field-diff 10000≠100 + invariant 跨表 10000≠100） |

## 本轮不做（防扩散，设计 §8）

FIBO/Ontology Provider（P5+）、MCP 工具面（P6+）、其他 Agent Adapter、Matrix 事件桥接（等 zcode-engine R4）、Release Evidence Package。
