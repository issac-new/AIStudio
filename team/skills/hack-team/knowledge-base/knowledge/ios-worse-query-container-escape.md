# 漏洞情报：iOS worse_query 容器沙盒逃逸（containermanagerd 查询越权，无 CVE，27.3 beta 2 已修）

- 标签: ios-sandbox-escape, worse_query, bad_query, app-group, containermanagerd, sandbox-extension, no-cve
- 概括: 一个 App Group entitlement 即可让应用向 containermanagerd 查询任意应用数据容器并领取其 sandbox extension——侧载恶意应用无需越狱无内核漏洞即可全量读取钱包助记词/私钥
- 类型: fact
- 日期: 2026-11-19

## 完整打法

（gap-20261111-002 / t_f48ace15；判定 ADOPT 限定增量）

- 缺陷（observed，PoC 源码 worse_query.m 逐行回源）：应用 dlopen
  `/usr/lib/system/libsystem_containermanager.dylib` 后 dlsym 私有查询 API
  （`container_query_create` / `container_query_set_class` /
  `container_query_set_group_identifiers` / `container_query_operation_set_flags` /
  `container_query_get_single_result`），以**自己控制的 App Group 容器**为跳板，
  向 containermanagerd 查询**非自有**的目标容器并取得 sandbox extension token，
  `sandbox_extension_consume` 消费后即越出沙盒读写目标路径。纯
  entitlement/所有权校验逻辑缺陷，**非内存破坏**，稳定版全量可利用。
- 路径枚举（observed，pathleak.h/.m）：应用容器 UUID 不可猜，PoC 配套
  `pathleak(filter, max_inode)` 做"最笨的任意路径枚举"（inode 遍历）定位
  `/var/mobile/Containers/Data/Application/*` 下目标容器真实路径。
- 可达路径（observed，README）：全部应用数据容器
  `/var/mobile/Containers/Data/Application/*`、InternalDaemon、PluginKitPlugin、
  AppGroup 共享容器；iOS 27 额外 `/var/containers/Data/System` 与
  `/var/containers/Shared/SystemGroup/*`（系统组）。
- 前置条件（observed，worse_query.entitlements 回源）：仅
  `com.apple.security.application-groups` 一条 entitlement（PoC 用
  `group.cc.forcequit.worse-query`）——AltStore/SideStore 侧载签名时自动创建
  App Group。作者 forcequit（Taj C）与 0xjohnny 合作出品，README 明言
  "not relevant to a jailbreak"（非越狱利用链）。
- 版本面与修复（observed，血统三仓时间线）：
  - bad_query（2026-08-11 建，329 星）：iOS 26.0–26.6.1 / 27.0b4；
  - worse_query（2026-11-08 建，722 星）：iOS 26.0–26.7.2 / 27.2，
    README 自称 bad_query 直接继任者（Apple 修一轮，研究者在 26.7.2/27.2
    上再绕过，"So, who's ready for round two?"）；
  - **修复纠偏**：稳定通道 iOS 27.2.1 / 26.7.3（2026-11-09 发布）安全日志
    （HT149715/149716）未列修复（FreeBuf 511743 与 THN 2026-11-10 据此报
    "暂无确认修复方案"，已滞后）——但 WQ Files 下游 release notes
    （v0.9.18-debug4，2026-11-18）明确 "iOS 27.3 beta 2 and later, where
    Apple patched worse_query"：**27.3 beta 2 起已修**，26.x 通道修复未见说明。
- 武器化生态（observed，THN + 两仓 release/README）：WQ Files（kolbicz，
  文件管理器，可跨应用读/改/删/清数据，经 AltStore/SideStore 分发）与
  Eros（jailbreakdotparty，README 注明 27.2.1 "pretty sure supported"）。
  App Store 上架应用能否利用**各方均未确认**（开放问题）。
- 影响（转述源，THN 2026-11-10 Swati Khandelwal + Binance X 2120093246399430770）：
  币安 11-10 发安全警告——助记词/私钥/登录凭证可被恶意侧载应用窃取；
  截至发稿币安与研究者均未监测到实际攻击/盗取案例，未点名任何受影响钱包。
  币安止损建议：删除侧载/手签等非可信来源应用；更新 iOS 与全部应用；
  疑似被入侵则**在干净设备上新建钱包转移资产**并重置全部活跃登录会话。
- 缺陷模式（可复用）：**私有服务越权签发 sandbox extension**——容器管理
  XPC 服务对"查询任意 class 容器"的调用方只校验能力面不校验目标所有权。
  与 2025 内核链沙盒逃逸（sbx0/sbx1，CVE-2025-14174/43510，见
  wih-secret-hunter/references/wateringhole-apt29-202611.md）是两类：
  那是内存破坏+内核 R/W 链，这是无 CVE 的逻辑/entitlement 缺陷，门槛低得多。
- 检测/审计入口：
  - iOS 应用静态审计：entitlements 含 `application-groups` 且二进制/源码
    出现 `container_query_create` + `sandbox_extension_consume` dlsym 组合
    = 滥用指纹（合法 SDK 场景极罕见，近似 IOC）；
  - 企业移动盘查：清点 AltStore/SideStore 侧载清单与签名商渠道分发应用；
    文件管理/清理类侧载应用是高危载体；
  - 防御端：侧载禁用/MDM 白名单；钱包应用不应把助记词落明文容器
    （Keychain + 硬件隔离才是正解——本事件是最佳反面教材）。
- 证据：本卡 workspace evidence/（FreeBuf 511743 原文 HTML、THN
  binance-warns-of-ios-sandbox-escape 全文、worse_query/bad_query README、
  worse_query.m + pathleak.h 源码、entitlements、WQ Files v0.9.18 release、
  gh api 仓库存档）。
