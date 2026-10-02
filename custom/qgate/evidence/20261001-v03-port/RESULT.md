# v0.3 上游移植轮（阶段 0-2）执行结果

日期：2026-10-02
分支：feat/qgate-v03-upstream-port（自 main 5bc84c1c）
依据：`docs/superpowers/specs/2026-10-01-qgate-v0.3-port-design.md`（D6 特性移植 / D7 CONDITIONAL 留映射层）

## 一、提交清单

| commit | 内容 |
|---|---|
| e529242a | devDeps 自包含（typescript/vitest）+ 摘除悬空 e2e script + 清 dist/mcp-server.js 残留 |
| d8299767 | 调研报告 + v0.3 移植设计 + v0.2/落地方案标注闭环 |
| 6d34d785 | 内核加固批：rawOutput 交叉核验 / inputSnapshot 新鲜度 / 元门二轮通道 / safe-path 根治 |
| b111c104 | L0 门族升级批：traceability / task-intent / register executor / CLI intent |
| 9dda154e | demo 三件套 + profile policy override 贯通 decide 根治 + 重绑缩进修复 |

## 二、能力增量（对照 v0.3 设计验收）

### 阶段 1 内核加固（设计 §3）

- **rawOutput 交叉核验**（§3.1）：`src/core/raw-evidence.ts` 手写 TAP/JUnit 子集解析（口径逐函数对照上游 raw-evidence.mjs:30-134）；command executor 声明 `rawOutput:{format,file,minTotal?}` 后内核独立重算计数。逮住三类作弊：exit 0 但报告含失败 / exit 0 但 total<minTotal 静默空跑 / 报告缺失或畸形——全部 error 证据（INCONCLUSIVE 方向）。守门 18 例。
- **inputSnapshot 新鲜度**（§3.2）：`src/core/snapshot.ts`；GateRun 增 inputSnapshot/inputsStable；isFresh 快照权威路径（快照在档时逐项一致即新鲜，treeHash 不再旁证）；`status --fresh` 共享一次走树。守门 8 例（含"门改写自身输入被逮住"负例）。
- **元门二轮通道**（§3.3）：GateSpec `meta: true`；CLI run 批量时元门排普通门之后；元门不参与 §49 缓存。守门 3 例。
- **附带根治**：`safe-path.ts` isInside 原判据 `!resolve(rel).startsWith('/')` 恒 false（resolve 恒返绝对路径）——一切真子目录被误判越界、executor.cwd/rawOutput 路径静默回落根目录。此为 v0.2 遗留缺陷，rawOutput 测试首跑即逮住。

### 阶段 2 L0 门族升级（设计 §4）

- **traceability 元门**（§4.1）：`.qgate/registers/requirements.json`（上游同形）；核验 codeFiles 存在（防路径逃逸）+ testGateIds 链接门最新 PASS 且证据新鲜（复用快照/三锚 isFresh）+ prdRef 可解析。rtm-demo 实测：正例 PASS / 删 codeFile FAIL 指名。
- **task-intent 意图登记与漂移对账**（§4.2）：`src/core/task-intent.ts` + CLI `qgate intent [--revise --reason]`（唯一写入通道，修订自动留痕+acknowledgedSha256 自动重绑到引用门）；scope executor 交集语义（scope.yaml ∩ intent.scope）；intent-file-modified / no-task-intent / outside-task-scope / Gherkin 骨架缺失四类 FAIL。intent-demo 五场景实测全对（PASS/越界 FAIL/篡改 FAIL/修订恢复 PASS/bad-ac 拒绝登记）。
- **register executor**（§4.3/§4.4）：debt（open+high/critical 阻断、dueDate 逾期阻断、裸空数组 FAIL、none:true 显式空）+ assumptions（全 confirmed+结构化引用核验）+ decisions（resolved 或 deferred+revisitBy 未逾期）；md 回退 present 级兼容。L0.registers 门升级 v0.2.0（files→register），L5.technical-debt 新门（release/high-assurance 档 block）。
- **profile 更新**：vibe-fast 排除 intent-drift；release/high-assurance 给 technical-debt 升 block。

### 本轮逮住并根治的三个既有暗坑

1. **safe-path 恒拒真子目录**（v0.2 遗留，见上）。
2. **profile policy override 不贯通 decide**：门自带 warn policy 先在 decide 内把 FAIL 降级 CONDITIONAL，CLI 层 override block 永远拦不住（high-assurance 两门 override 自 v0.2 起实际失效）。根治：runGate 接收 effectivePolicy 贯通 decide。守门测试：同门 warn→CONDITIONAL / override block→FAIL。
3. **intent 哈希重绑插入缩进**：初版插入多两格破坏 YAML 列对齐 → 项目门解析失败静默回退内置门（无哈希绑定）→ 篡改检测失效。demo 实测逮住，改同列插入+守门（重绑后门必须仍可解析且带新哈希）。

## 三、验证记录

- vitest：**93/93 绿**（52 既有 + 41 新增；7 文件 + qgate-v03-kernel/qgate-v03-l0 两新文件）；tsc 零错。
- demo 实测：run-output.txt（rtm 正反 / intent 五场景 / debt 三场景 / 全套件输出）。
- 相邻面回归：matrix-teams qgate-bridge 9 例 + governance-analytics（未动但相邻）——见 run-output.txt 附录。

## 四、边界与未验证项（如实）

- L0.requirement-trace 的 testGateIds 新鲜度判定在非 git 目录回退"变更集为空即新鲜"（既有三锚语义，未变）。
- task-intent 与 ncwk 派发体系的融合（派单自动写意图）记档为后续治理融合点，本轮不接（v0.3 §8）。
- rawOutput 只支持 TAP/JUnit 两子集；vitest 的默认 reporter 不输出这两种格式，engineering.basic-check 接线需项目侧配 reporter（vitest --test-reporter=tap 可产 TAP），本轮未改 overlay/.qgate 项目门配置。
- 后续路线（R1 契约门族 ~ R7 F2P/P2P）见 v0.3 设计 §5，未动。
