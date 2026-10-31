# v0.8.0 新面品牌扫尾（补丁 718，2026-10-31）

日期：2026-10-31
状态：implemented
来源：v0.8.0 升级批（`2026-10-31-studio-v080-upgrade.md`）遗留挂账——上游新面（Person/浏览器工具族/mcu 新固件/11 语种 locale 等）带入约 280 处 `Ekko Studio` 字串未被 329/690 覆盖（两补丁只重生成既有面）。用户指示「完成未做和挂账」。

## 变更

1. **补丁 718**（`patches/718-brand-v080-new-faces.patch`，series 登记于 717 后）：33 文件、2033 行。
   - 归一规则：`Ekko Studio → AIStudio`（产品名语义，承接 690 终态）；SSID 家族 `Ekko Studio-WIFI/WiFi → SwarmStudio-WIFI`（承接 329 先例，mcu v1 README 既有口径）。
   - 覆盖面：11 语种 locale（ar/de/en/es/fr/ja/ko/pt/ru/tr/zh-TW，zh 在 473 已覆盖）、desktop（installer.nsh/更新测试脚本/主进程对话框/login-item/native-device-html/screenshot-windows/update-test-build.test）、mcu 新固件（esp32-c3 v1/v2 manifest+main.cpp、esp32-s3 README+cardputer manifest、m5stack-stackchan README+ROADMAP）、ekko-agent docs/computer-use.md、server（auth.ts 注释、runs/prompt.ts 会话查询提示词）。
   - 生成法：A（净注入态，pristine v0.8.0＋全 series 重放）→ B（品牌态）双树差分（keepends 原样，difflib n=3）；**排除一切二进制**（首版脚本误写固件 bin 一次，git checkout 复原并 shasum 对账后改用 --include 白名单）。
2. **重放证明**：clean（`OVERLAY_ALLOW_LIVE_CLEAN=1`，worktree 无在服进程）→ inject 全量 425 条零失败；重放后 `Ekko Studio` 文本残留=0（白名单口径），ar.ts AIStudio 计数 24。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | SSID 家族归 SwarmStudio-WIFI 而非 AIStudio | 329 先例（mcu v1 README 既有 `SwarmStudio-WIFI`）；SSID 属固件标识非产品 UI 名 | 全部归 AIStudio（否决：与已发固件标识断链） | 是 |
| D2 | runs/prompt.ts 的 `Ekko Studio session lookup` 提示词归 AIStudio | 面向模型的会话查询指令，产品名应一致；与 690 对 chat-run 会话提示词的处置同构 | 保留 Ekko Studio（否决：模型侧品牌名与用户侧不一致） | 是 |
| D3 | 只做字串归一，不触 URL/仓库名 | `github.com/EKKOLearnAI/ekko-studio` 等外部资源定位符不在品牌面（VENDOR.md 已记仓改名） | 连 URL 一起换（否决：断链真实下载源） | 是 |

## 验证

- 净树 clean＋inject 全量重放 rc=0、零 FAILED、425 条 applied。
- 守门冒烟：connections-panel-gate/s3-feature-gates/docs-ssot = 22/22。
- 全量 `npm test` = 971 文件 / 7074 用例通过、11 跳过、0 失败。
- 残留核验：`grep -r 'Ekko Studio' packages --include=文本白名单` = 0；二进制零改动（bin shasum 对账）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§7.7 升级批补记品牌扫尾闭环（残 280→0）。
- `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`：§五「品牌残留」待办销项。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。
