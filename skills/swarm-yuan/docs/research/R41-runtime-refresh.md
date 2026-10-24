# R41 运行时刷新（2026-09-21，用户 /goal 触发）

> 触发：用户 /goal 三目标指令之目标 2（自动更新 research 目录下运行时到最新稳定版本，比较上一版功能差异并吸收）——R31/R32/R34/R35/R38/R40 同款先例（上轮刷新 R40，2026-09-19）。
> 扫描面：npm registry 4 线实测（claude-code / codex-security / ruflo / openspec）+ GitHub API 12 仓 tag/release 核 + live CLI 双线。
> 结论：**1 行升基线**（graphify v0.9.64→**v0.9.65**），16 行零稳定增量。薄轮：单载体注记级吸收，无门禁增量，不改 SKILL.md，不发版。graphify 克隆物化 checkout v0.9.65（checkout 前过台账裁决列：merge-base `--is-ancestor v0.9.64 v0.9.65` 成立 = v8 线；v1.0.0 异源裁决维持不取）。

## 一、升级 1 行

### graphify v0.9.64 → v0.9.65（16 commits，2026-09-20/21）

A 级（本机克隆 `git log/show` 直查）。四条主线：

1. **JS let/const 块级作用域绑定**（4a4fd97 + 873b5eb 回归测试）——绑定按所在块解析而非函数级。「同名 ≠ 同物」判别原语再添实例：不同块的 `let x` 是不同绑定实体，消歧必须显式（与 R34 god node guard 同族）。图谱/索引类工具对作用域内同名实体的合并判定必须显式携带作用域维度。
2. **fail-closed 保全节点跨遍存活**（87a8277 + c99c3a6 强化回归断言）——显式判为 fail-closed preserved（#3695）的节点不得被后续 AST 所有权逐出遍删除。保全语义跨遍一致：一次判定的保护承诺必须在所有后续遍保持，否则承诺形同虚设（诚实族图谱侧）。
3. **多语言提取修复批**——Go interface 方法需求提取（a9450a5）/ Swift protocol 方法需求提取（fc8e9e1）/ Java enum 成员归属 enum 而非文件（c049ea0）/ Verilog 模块实例链接本地定义（199d741）。类型约束面（接口/协议）进图谱 = 实现关系边的提取面拓宽。
4. **供应链与测试卫生**——Pillow CVE floor（5f6b2a2，cve-2026-54058 → 12.3.0）；删两条永不触发的 symlink 假测试（2ff5db3，#3695——永不触发的测试 = 假绿）；vis-network HTML 导出栈溢出崩溃修复（124c263/86d8aad，查看器稳定性）。

吸收载体：`references/code-graph-tools.md` graphify 版本注记 R41 段（注记级）。台账行三格同步。

## 二、零增量明细（16 行）

- claude-code：npm latest 仍 **2.1.278**（live `~/.local/bin/claude` 2.1.278 = 零漂移）
- codex-cli：0.156 全 alpha（最新 rust-v0.156.0-alpha.14，2026-09-21 仍 Pre-release）；stable 线维持 0.155.1（live codex 0.155.1 = 零漂移）
- ocr：v1.12.7（2026-09-19 后无新 tag）
- superpowers：v6.4.1
- codex-security：npm-v0.1.29
- ruflo：3.42.4（npm 与 GitHub tag 双核）
- openspec：v1.13.1
- comet：0.4.1
- gsd-core：v1.14.0
- claude-mem：GitHub 仍 v13.24.23（watch 口径不动）
- ECC：v2.2.1
- gstack：main 顶仍 v1.87.4.0（subject 核）
- impeccable：skill-v4.3.1（候选级引用不升，R16 裁决沿用）
- dsh：dsh-v0.1.6-alpha.2（alpha 线不取，基线 dsh-v0.1.5-rc.2 维持）
- GitNexus：license-risk 零接触
- codegraph：watch 未接线（无版本基线，无需核）

## 三、预算门

R40 第八次登记后预算 323584B。本轮增量 = code-graph-tools.md R41 版本注记一条（约 +760B，R40 实测 320563B + 本轮增量 ≈ 321.3KB < 预算）。self-check 全量断言通过（EXIT=0），**无需第九次登记**；发版轮若实测超标再按逐例登记先例处理。
