---
name: fail-closed-gate-acceptance
description: "Accept fail-closed gates: negatives, tamper, replay."
version: 1.0.0
metadata:
  hermes:
    tags: [verification, acceptance, security, envelope, digest]
---

# Fail-closed 门/封层类交付的独立验收

触发：验收 worker 交付的「核心价值在拒收恶意/畸形输入」的门或封层——路径安全门、digest 完整性封层、schema 校验器、evidence envelope 适配层、防篡改层。

## 铁律（always-on）

1. **正例通过只证明一半**：这类交付的验收重心全在负例路径。负例全过 + 正例过才算 Exercised；只跑正例不得下验收结论。
2. **负例独立构证，不复用 worker 的负例集**——worker 的负例只覆盖它想到的变体。按攻击类逐类自造并断言 rejected：绝对路径、`..` 穿越、`./` 段、嵌套穿越、反斜杠/drive/scheme 前缀、symlink 逃逸；缺一类补一类。
3. **篡改负例逐字段做**：对 digest/签名封层，逐个篡改参与 digest 的字段（版本号、revision、时间戳、body hash）各一次，每次断言 rejected 且拒绝理由指明 declared ≠ recomputed。只做一次整体篡改会漏掉「某字段实际未入 digest」的洞。
4. **重放确定性必测**：同一封层产物连续验证两次，断言退出码一致且 digest 逐字节相同；不稳定 = 时间戳/随机性泄漏进确定性字段，直接拒收。

## 判定纪律

- **探针被拒 ≠ 发现缺陷**：先读拒绝理由（reason / schema 校验细节）再定性质。探针本身不合门规范（如 revision 非该门要求的格式）触发拒收 = 门在正常工作；只有「合法输入被拒」才是缺陷。上报缺陷前先确认探针合规。
- **DB 机械戳记 ≠ 验收结论**：任务 metadata 的 evidence_strength 类戳记可能滞后于真实判定（已知机械限制）。验收 comment 显式写「戳记值 vs 实测判定」及归因，防下游读卡误判。
- **留痕用「声明 × 验证方式 × 结果」表**，每行含证据命令原文，写入 kanban_comment。

## 探针构造速查

路径门负例（全部应 rejected）：`/absolute/path`、`../escape`、`a/./b`、`a/../b`、`a\b`、`C:/x`、`scheme://x`、指向门外的 symlink。

封层篡改负例（逐字段各一次）：schema_version 改值、source_revision 改值（含改成不合规范的格式）、observed_at 改值、body 改一字节；另测字段间一致性（如 schema_uri 与 version 不匹配）。

## 验收后收尾

- 「待决项」类接口由该交付解决后，grep 全库扫「待决/待人工/Missing」旧态残留，逐处翻成已解决态并留指针（卡号/commit），防读者看到矛盾状态。
- 结论标注证据等级（Exercised/Wired），不越级宣称。