# 熔断证据签名并入 main tip——pre-integration 闸的复位盲区根治

日期：2026-11-02 ｜ 类型：fix（simharness 驱动）｜ 状态：implemented（run25 G2 熔断现场立查立改）

## 变更

`mx-scenario-lib.sh _mx_gate_evidence_sig`（熔断复位的证据签名）在 integration tip 之外
并入 `origin/main` tip：`itip:<x|-> mtip:<y>`。

现场链路（run25 实测）：G2 两轮打回熔断（21:06:56）→ fanfan 概设 v1.1 落 main
（1d55ba2，21:25）→ 监督器断点续跑（21:41）→ 熔断检查复位判据=证据签名变化——但签名
只看 `origin/integration/RFD-001`，该分支**开发合并期才创建**，run25 此阶段恒为 `-`；
scenario.log 行数在驱动停机期不涨；G5 卡哈希只对 G5 标签生效。三类复位证据对 G2 全盲，
熔断永不复位（35 分钟空转实证）。

## 决策记录

- 并入 main tip 而非换成 main tip：integration 建支后两 tip 各自捕获不同面的证据变化
  （合并链 vs 主线稿），并存是超集，无语义损失。
- 不走 GATE_BREAKER_OVERRIDE 人工复议通道：那是「判据争议」的复议口，不是证据到位的
  复位口（run24 收官批已立法：OVERRIDE 只清熔断入口不替代判据）；本例证据真实到位，
  是签名盲区，根治在签名。
- 驱动 bash 每次断点续跑重新 source 本文件，改动随监督器下一轮拉起即生效，无热换面。

## 验证

- 修复后监督器下轮拉起：签名含 `mtip:1d55ba2` ≠ 打回时签名 → 熔断复位 → G2 重评
  v1.1（X-1 必改已收口）→ ARCH-GATE-PASS 判词语义翻正放行（回归本报告补充实测输出）。
- `bash -n mux/mx-scenario-lib.sh` 语法门。

## 设计文档影响

DESIGN_SYNC: none——熔断语义正本（custom/server/governance/lifecycle/breaker.ts）的
「证据变化复位」契约不变；本修只在导演侧证据签名构造（mx-scenario-lib 自留面）补齐
喂给服务的证据源。
