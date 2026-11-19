# CVE 情报：Telegram Android 语音通话 RCE（tgcalls MediaState find() 守卫错配，无 CVE）

- 标签: telegram-android-rce, tgcalls, mediastate, no-cve
- 概括: 接听即触发——信令 MediaState 解析把 videoState 迭代器当 videoRotation 用，缺字段即解引用 end()
- 类型: fact
- 日期: 2026-11-07

## 完整打法

（gap-20261030-004 / t_90ea4cfd；判定 ADOPT 限定增量）

- 缺陷（observed，DrKLO/Telegram 9552e55 漏洞源码 + a6ea40eb 修复 patch 双回源）：
  `TMessagesProj/jni/voip/tgcalls/v2/Signaling.cpp` 的
  `MediaStateMessage_parse()` L720-737——`videoRotation` 字段存在性守卫
  （`if (videoRotation != object.end())`）通过后，4 个取值分支 L726/728/730/732
  解引用的却是**另一字段的迭代器 `videoState`**。攻击者构造只带
  `videoRotation` 不带 `videoState` 的 MediaState 信令报文，
  `videoState == object.end()` 裸解引用 → OOB/内存破坏 → 接听瞬间 RCE。
  同一缺陷在上游 `tgcalls/v2_4_0_0/Signaling_4_0_0.cpp` L628-634 复制存在。
- 攻击链（NebuSec 披露，2026-10-29）：普通 Telegram 账号发起语音通话 →
  恶意 MediaState 信令注入 → 受害者**接听**即触发（无点击/无下载/无提权）；
  可链 info-leak 逃逸应用沙箱 + Android root 漏洞拿全机控制（消息/麦/摄像头）。
  ARM64 私密通话实测成立；iOS/桌面/群聊未见直接影响证据。
- 版本面：Android 8.6.2（2022-03，启用该解析代码）–12.10.3（2026-09）全受影响；
  修复 12.10.4（2026-09 末）。上游 tgcalls fix commit a6ea40eb
  "Fix camera rotation"（isaac，2026-04-21，2 文件各 4 行 videoState→videoRotation）。
  **无 CVE**——Telegram 认可报告但质疑 RCE 可达性，未发 CVE、未付赏金
  （NebuSec CEO Eten Zou 对 The Hacker News 的陈述，转述源）。
- 跨平台补丁时滞（本卡钉死的关键事实）：同一 fix 在共享库 tgcalls 落地后，
  iOS 12.7（2026-05）→ 桌面 7.0.1（2026-07）→ **Android 12.10.4（2026-09）**，
  Android 比上游修复晚 5 个月、比 iOS 晚 4 个月——共享库修复 ≠ 各端止损。
- 缓解：升级 ≥12.10.4；未升级者通话隐私设 Nobody 或拒接陌生来电。
  相关但独立的另一问题：rlottie CVE-2026-111105（ZDI-26-757，CVSS 7.0，
  贴纸库代码执行，截至 2026-10-15 无修复确认）——勿混淆。
- 缺陷模式（可复用）：**find() 守卫-解引用迭代器错配**——字段 A 的存在性
  检查通过后，复制粘贴的分支体里解引用字段 B 的迭代器；各字段独立可选的
  JSON/Map 解析器均适用。已固化 Semgrep 规则：
  `patch-diff-exploit/rules/find-guard-deref-mismatch.yaml`
  （回归 4/0/4/0：DrKLO 漏洞版 4 命中 L726-732、修复版 0、tgcalls 修复前 4、
  修复后 0，零误报）。
- 检测/审计入口：N-day 复盘走 `patch-diff-exploit` S1-S5（无 CVE 时以
  fix commit 为锚差分双版本源码）；C++ 信令/协议解析面审计直接挂上述
  Semgrep 规则；防御端 IOC=单字段缺失的畸形 MediaState 信令。
- Semgrep 陷阱（实测）：C++ 声明模式 `const auto $D = ...` 不命中，
  须写 `$TYPE $D = ...`（T7 0 命中 vs $TYPE 36 命中）；`pattern-inside`
  声明序列开头必须 `...` 前置。
- 证据：本卡 workspace evidence/（漏洞版/修复版 Signaling.cpp 全文 +
  tgcalls fix commit patch + NebuSec/Lookout/HackerNews 多源交叉）。
