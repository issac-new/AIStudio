# v0.3 剩余路线 R0-R7 全批执行结果

日期：2026-10-02
分支：feat/qgate-v03-r1r7（自 main 7206979a，rebase 后合入）
指令：用户"完成所有剩余事项"（v0.3 §5 路线图 R1-R7 + R0 接线全量封口）

## 一、提交清单

| commit | 内容 |
|---|---|
| 2a835d4a | R1-R4+R7 四族 executor + diff 核心 + 39 守门 |
| fd0de478 | R3 语义八门包 + R2/R4 门包 14 门 + profiles + 第四暗坑根治 + R5 CLI 生命周期 + R6 Stop new-only + R0 overlay 门接线 |

## 二、能力增量（对照 v0.3 §5 路线图）

| 批次 | 落地 | 验证 |
|---|---|---|
| R0 | overlay engineering.basic-check 接 rawOutput（vitest junit reporter + outputFile + minTotal=100） | 主树实跑：内核重算 junit 3529 total/3527 passed/1 failed，退出码 1 ↔ 1 failed 交叉一致（run-output.txt） |
| R1 契约门族 | contract executor 四模式（diff=JSON Pointer 深比较+ignorePaths 段通配 / breaking=外部工具报告采信 / surface=openapi 枚举+contentSha256 / matrix=消费者兼容矩阵）+ 4 门包 | qgate-r1-contract.test.ts 12 例 |
| R2 行为门族 | behavior executor 四模式（cases 逐用例深比较 / journey 步骤序+内容 / property 断言+状态白名单+反例 / visual sha256+像素容差）+ 4 门包 | qgate-r2-behavior.test.ts 10 例 |
| R7 F2P/P2P | behavior cases 内置双版本基线审计：六类违规全指名（f2p-passing-on-baseline 防伪修复 / f2p-failing-current / p2p-baseline-failed / p2p-current-failed / missing-current / missing-baseline） | 同上 4 例正反 |
| R3 语义门族 | catalog.ts OWL 子集（subClassOf 闭包环 fail-closed / equivalentClass 对称 / disjointWith 沿包含边传播 / 互斥×包含矛盾构建期抛 / 属性注册表 subPropertyOf·inverseOf·transitive）+ semantic executor 八检查 + 8 门包（旧 ontology.semantic-v0 内容扫描方言保留并存） | qgate-r3-semantic.test.ts 13 例 |
| R4 运营门族 | ops executor 六模式（metrics 阈值 / budget 预算守恒+重试≤20% / rerun 幂等+复式恒等 / trace-continuity W3C / resilience 演练时效+信号 / topology R1-R4）+ 6 门包 | qgate-r4-ops.test.ts 11 例 |
| R5 配置生命周期 | CLI 四命令：templates（档位模板一览）/ inspect（诊断+登记在档+判定新鲜度只读体检）/ leftovers（残留扫描）/ update --profile（受控切档+改后校验）；init 骨架补 registers/+observations/ | qgate-r5r6-lifecycle.test.ts 6 例 |
| R6 Stop 降级 | session-start 写会话基线（逐门判定入 stop-state）；stop.mjs new-only 降级：阻断门全为基线既有失败且证据仍新鲜 → 放行留痕不烧预算（INCONCLUSIVE 永不降级） | 同上 2 例 + 判定矩阵 |

门总量：13 → 23（内置 pack），四档裁剪：vibe-fast 5 / feature-close 9 / high-assurance & release 17。

## 三、本轮逮住的第四个既有暗坑（守门防复发）

**profile 求值顺序**：原 disable 先、enable 后——域级 enable（L3.*/L4.*）静默复活被前缀 disable 点名的门，v0.2 起 high-assurance 的 ontology.*/llm.* disable 从未生效（高保障档实际全门全开）。根治为"enable 提名、disable 否决"（profile.ts），守门测试锁定语义。

## 四、验证记录

- vitest：139/139 绿（93 → 139，+46；13 文件）；tsc 零错
- 主树（merge 后）：139/139 + 相邻面 18/18（qgate-bridge + governance-analytics）
- R0 主树实跑见 run-output.txt
- 既有红归因：custom/client ia2-i18n-coverage 1 例为 main 既有（本轮零触碰 client/server），advisory 门如实呈现为 CONDITIONAL

## 五、边界与口径差异（如实）

- 观察文件模式：R1-R4 运行时数据一律"同门先行 command executor 产观察 JSON → 内核判定"（runner 无权自判的上游 ADR-0007 本地方言）；未配置产出命令的模板门 → INCONCLUSIVE 诚实暴露
- consumer-matrix 未实现 usage 分级（scanned/contract-test/declared）——本地无 usage 扫描器，只做期望 vs provider 面
- semantic 对齐观察文件由项目产出（静态注解或 runtime 探测），框架不内建符号扫描（上游 symbol-grounding 不在本轮范围）
- R5 templates 是选档参考而非上游式确定性装配（本地配置声明式 .qgate/，无单文件清单）；update 只支持 profile 切档
- R6 new-only 的"无新变更"判定用 isFresh（快照/三锚），等价于上游"声明输入 glob 基线后无命中变更"的本地路径
