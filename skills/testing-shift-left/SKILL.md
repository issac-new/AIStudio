---
name: testing-shift-left
description: 测试左移与缺陷回流纪律（四段模型）。测试类任务（UC-设计/INT-案例/QUALITY/FUNC/缺陷复测，前缀 UC-/INT-/QUALITY-/TEST-/DEF-）触发时使用；研发类档案同读（修复结论行与推送核验纪律）。
profile: standard
status: active
---

# testing-shift-left — 测试左移·四段并行与缺陷回流

> 模型（需求冻结起，研发与测试两线并行、三段同步、缺陷自动回流）：

```
需求冻结 ──┬── 研发线：架构设计            ‖ 测试线：用户案例设计（UC-）
架构评审 ──┬── 研发线：编码+自测            ‖ 测试线：集成案例设计（INT-）
编码自测完 ──── 测试线：质量合规检验（QUALITY-）→ 功能+白盒测试（FUNC）
测出缺陷 ──── 自动回流：缺陷卡→研发修复→推送核验→测试复测（无人工环节）
```

## 各段输入物/产出物/结论行

| 段 | 触发（前置就绪即开工，不等派单提醒） | 输入物 | 产出物与结论行 |
|---|---|---|---|
| UC- 用户案例 | 需求冻结件落仓（RFD-*.freeze.md） | 冻结的验收标准四要素 | `docs/test-design/RFD-*-uc.md`；结论行 `UC-DONE-<RFD> cases=<N>` |
| INT- 集成案例 | 架构评审通过（概设+接口签名冻结） | 概设文档、接口契约 | `docs/test-design/RFD-*-int-cases.md`；结论行 `INT-CASES-DONE-<RFD> cases=<N>` |
| QUALITY- 质量合规检验 | 研发编码自测完成（DEV-DONE 落房） | 代码分支 | 跑门禁套件出报告（precheck --all-full，合规 19 项含依赖漏洞/密钥扫描）；`QUALITY-DONE-<RFD> gates=<M/N>`（有不过项=列清单，不阻断但须研发先答） |
| FUNC 功能+白盒 | QUALITY 段结论行落房 | INT- 案例+代码分支 | 功能=INT 案例全跑；白盒=覆盖率数字（vitest coverage 进 testlog）+关键路径抽检；`TEST-PASS-<ID> tests=<N> cov=<%>` 或 `TEST-FAIL-<ID> failed=<清单>` |

## 缺陷回流（测试→研发→复测，全程自动）

1. **建卡即派发**：测试员发现缺陷→建卡（标题带【缺陷】+缺陷号 DEF-X+复现步骤+指派研发档案）→群内一行 `DEF-NEW-<DEF-X> card=<卡ID> @<研发档案>`。研发档案收到即开工，不等提醒。
2. **研发修复纪律（结卡≠完成）**：修复必须在**工作区分支**上进行，自测通过后**推送到远端**，然后才许结卡。结论行：`FIXED-<DEF-X> commit=<origin 上的提交 id> branch=<分支名>`——**commit 必须真实存在于远端**（驱动会核验；本地提交/未推送=未完成，结卡会被打回）。
3. **复测自动触发**：研发 FIXED 结论行落房，测试员即拉取复测（按缺陷卡复现步骤），结论行 `FIXED-VERIFIED-<DEF-X>` 或 `FAILED-<DEF-X> reason=<原因>`；全缺陷清零+套件绿才发 TEST-PASS。
4. **环内不静默**：任何一段等待超 15 分钟无进展，群内重发一次跟进提醒（@直接责任人）；连续两次无回应，如实报 `LOOP-BLOCKED <环节> reason=...`——禁止静默等待或退出。

## 通用纪律

- 案例设计段的用例**挂在对应设计工件上**（UC 挂冻结件、INT 挂概设），复测时反查有据；
- 每段结论行只认群内一行格式（落房可读回），卡面 body 同步但不作为判词来源；
- 测试报告原文（完整运行输出）入仓 `docs/evidence/<ID>-testlog.txt`，覆盖率数字随报告；
- 本技能与 aipaydev-dev 并用：门禁跑法（execute_code 单回合）与工作区纪律见彼技能。
