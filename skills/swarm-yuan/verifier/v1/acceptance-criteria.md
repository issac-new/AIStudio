# 验收标准 v1 — Swarm-yuan 重构

> 状态：与 AIStudio 单仓当前实现对齐（81 个 fixture / 实际 flag 数见 precheck.sh GATE_FLAGS / 55 组 gate-fixture）。
> 重构 = 结构优化，**不改变门禁判定语义**。以下全部通过才算完成。

## C1 行为等价（最高优先级）
- 81 个 framework fixture 的判定结果重构前后逐一相同（violating 须命中预期 fail ID，compliant→PASS；原始退出码向量由 golden 锁定）。
- 度量：`run-verifier.sh fixtures` 输出每个 fixture 的原始退出码向量 (v,c,ids)，重构前后 diff 必须为空（比 OK/BAD 更强：退出码逐值相等 + id 级断言命中数相等）。
- 前置修复 R0：fixture conf 硬编码 `/Volumes/...` 路径 → `__REPO_ROOT__` 占位符 + runner 替换，使套件在任意机器真实可跑。修复后基线应为 81/81 OK。

## C2 E2E 通过
- `tests/e2e/run-e2e.sh` 重构后退出码为 0。

## C3 重复消除
- 两份 precheck.sh（skills/swarm-yuan/assets vs Swarm-studio/scripts）不再各自维护漂移副本：
  要么单一事实来源 + 同步/生成机制，要么提取公共核心。
- 度量：两文件逐行相似度 diff 行数显著下降，或存在可验证的同步机制（同步后 diff 仅含声明过的定制段）。
- Swarm-studio 兄弟仓库不在本机时标记 ABSENT（信息性，不阻塞）。

## C4 Shellcheck 不恶化
- 核心脚本（precheck.sh、generate-skill.sh、self-check.sh、state-machine.sh、全部 framework-gates）error 级总数 ≤ 基线；重构涉及文件目标为 0 error。
- 严格层（6 核心脚本）只 error 级 fail；信息层（扩展 11 脚本）只报不 fail（WP3.4）。

## C5 CLI 兼容（脚本断言自动判定）
- 判定入口：`bash verifier/v1/run-verifier.sh cli-ab`（已纳入 `all`），退出码 0 为通过；断言实现 `v1/cli-ab-test.sh`。
- A/B 沙箱逐字节等价：A=git HEAD 版、B=工作区版 precheck.sh；对 GATE_FLAGS 全部 flag（运行时自注册表解析）× compliant/violating 双语料（tests/gate-fixtures 现有 fixture 项目样本，conf 运行时生成）× A/B 双版本，stdout 逐字节一致且退出码一致；附加无参数（默认 --all）/ --all-full / 未知 flag 固定用例同断言。
- 退出码 ∈ {0,1}（崩溃/用法错误等异常退出即失败）。
- --all 核心 10 门禁执行序列（stdout '^=== ' 段头按序提取）与基线 `v1/core10-sequence.txt` 逐字节一致（防 ALL_GATES_CORE 调序/段头改名）。
- 环境约定：无 git / HEAD 无对象 / 语料缺失 → 未配置静默跳过（CLI_AB_SKIP，RC=0）；A/B 口径须在工作区静止期判定。

## C6 可维护性（阈值断言自动判定）
- 判定入口：`bash verifier/v1/run-verifier.sh metrics`（先输出既有测量行，再执行断言；已纳入 `all`），退出码 0 为通过；断言实现 `v1/metrics-assert.sh`，阈值真值 `v1/metrics-baseline.txt`（缺失=未配置静默跳过，启用后 fail-closed）。
- LOC 增长：precheck.sh 行数较基线（2982 行，2026-07-20 P0 提交后实测）增长 <40%（整数判定 5*loc < 7*baseline）。
- 重复度：framework-gates 注入双副本 diff 行数 <30（口径：81 片段全量 `--inject-frameworks` 产物标记块 vs `assets/framework-gates/*.sh` 同序串联，计 diff 输出 `^[<>]` 行数；正常为 0）。
- 文档一致性：`self-check.sh` 输出「▶ 文档一致性检查」段无 ✗/FAIL 行，段缺失即 FAIL（fail-closed）；self-check 整体 RC 受环境缺工具影响，不作断言对象。

## C7 交付物
- 《全面分析与重构报告》含：架构分析、问题清单（分级）、重构项前后量化对比、验证记录索引。

## C8 合规门禁 fixture（双态 + id 级断言）
- `tests/gate-fixtures/` 全量 55 组全部双态通过：violating* 退出非 0、compliant* 退出 0。
- id 级断言全绿：violating 侧 `expected-ids` 逐行命中（fail id 契约：gate_*/fw_*），compliant 侧 `forbidden-ids` 零命中；`expect-output` 字面串全部包含。
- 度量：`bash verifier/v1/run-verifier.sh gate-fixtures` 输出 `GATE_FIXTURES_FAILS 0` 且退出码为 0。

## C9 自举闭环（WP-Z13，G4）
- 生成器对自身仓库跑 `precheck --all`，RC=0 才算通过——自举从 slogan 变证据。
- 度量：`bash verifier/v1/run-verifier.sh bootstrap` 输出 `BOOTSTRAP_SELF_GATE OK` 且退出码为 0。
- 已纳入 `all` 投票（fail-closed）：`bash verifier/v1/run-verifier.sh all` 含 bootstrap_self_gate 一票。
- 跳过条件：`ci/self-precheck.conf` 不存在（安装态 `~/.claude/skills` 无 ci/ 目录，输出 `BOOTSTRAP_SELF_GATE ABSENT`，RC=0）。
