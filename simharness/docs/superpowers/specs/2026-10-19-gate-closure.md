# 闸门收口（企业 Agent 框架完善 #1，simharness 侧）

> 依据：ThinkingAgent《Muse/Jev/Ontology 企业 Agent 架构》三轮调研对账（2026-10-19）。
> 正本（含全部 8 项）：overlay/docs/superpowers/specs/2026-10-19-enterprise-agent-framework-closure.md
> 本件为 simharness 闸门收口（#1）的随批 spec（spec-first L2 门禁要求源码提交须带 spec）。

## 决策记录

| 项 | 裁决 | 理由 |
|---|---|---|
| #2/#8 排除 | 已被 zcode-eval-closure 完成（overlay 2f88ddb1，实测 main workbench 6/6 绿） | 不重复施工 |
| 收口范围 | 安全评审/G3/UAT/G6 四处绕过面 | 闸门可被绕过会让下游所有成熟度指标失真，先修闸再谈飞轮 |
| 安全评审 | G2 落键前 fail-closed 硬校验 security_review_done（涉敏轮） | 原独立 if 块超时只记单不终止，gate_blocked 全调用点均不查该键 |
| G3 | testpass 前置 gate_blocked g3_code_pass | 原 devimpl 段无条件置键、无任何 gate_blocked 查它 |
| UAT | 非全过落 uat_conditional + bella 显式批准事件，复盘门双键取一 | 原非全过仍落 uat_done，有条件通过与全过下游无差别 |
| G6 键 | 六闸徽标 report_done→retro_done | 对齐方案 §5.3 G6=复盘第 24 步等待信号 retro_done |

## 改动

1. G2 落 `g2_arch_pass` 前硬校验：涉敏轮（`_sens` 非豁免）且 `security_review_done` 未置即 `fail`。
2. testpass 步首 `gate_blocked g3_code_pass testpass`。
3. UAT：全过 `sset_once uat_done`；非全过 `sset_once uat_conditional` + `UAT-COND-APPROVED bella-human` 入 approved.events；复盘门改 `uat_done`/`uat_conditional` 双键取一。
4. 六闸徽标 G6 键 `report_done`→`retro_done`（overlay steps-registry.ts，随本批 overlay 侧提交）。

## 验收

- `bash -n aipay-scenario.sh` 语法通过。
- `bash mux/tests/discipline-v88-810-gates.test.sh` 全过（含新增 8 条收口锚点断言）。
