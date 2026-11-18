# 2026-11-18 宿主热修回灌批：agent 面 7 主题补丁化＋runtime 模板回灌＋宿主部署收口（v0232 批挂账 N-1/N-4'/N-3 清偿）

> 背景：v0.23.2 换血批（spec `2026-11-17-vendor-upgrade-agent-v0232.md`）合并后挂账三项：N-1 宿主升级部署、N-4' runtime 33 件漂移（宿主热修无补丁承载）、N-3 验证残留目录。用户令「完成挂账」。前置探查实证：run31 已收官（sim-mux 静默零进程）；宿主 git 树基底**已经是 v0.23.2**（ae2a81ccc）＋7 个热修提交（reanchor 在案：5b35f969/c069440/ded1a5e/f826390/4a26ed1/503bf11/645b3d9）；宿主注入态面 133 件已同步、24 件热修保留差异、26 件触碰待收口、11:44 事故 .bak 残留在树；deploy 默认 dry-run（脚本立法）两轮预检零写入。

## 变更

1. **宿主 7 热修提交导出为仓内补丁，吸收甄别后 4 保留＋3 退役**：吸收判定法=补丁非空 + 行逐行对链内注入态查缺失（全吸收=742 退役先例）。**795（tui usage-window-colors）/796（409 structure pack）/797（kanban_gates 275 行）三枚全吸收退役**（741 dispatch-chain-backport 本身就是宿主热修的早期回灌，已含其内容；appLayout 2 行"缺失"系三元式形态演进非内容缺失）→ `.archived-patches/`。保留 4 枚：**794-agent-weixin-noise-filter-persist**（源 645b3d9；真增量=adapter.py noise-filter 接线段 24 行，ui-tui 面全吸收弃）、**798-agent-runtime-provider-fallback**（源 ded1a5e；原样 direct：runtime_provider 35 行＋新测试文件 80 行，frozen-session invalid_provider 回落 live 默认）、**799-agent-kanban-session-board-context**（源 c069440 +1244 行；真增量 96 行 A/B 差分重生成：`_session_profile_env_board` 读 served profile .env 板锚＋`_landed_board_slug` 落板回显＋跨板 auto-sub 跳过＋schemas 解析链文案；758 行已被 741 吸收）、**800-agent-kanban-workspace-kind-omit**（源 5b35f969；23 行重生成：workspace_kind 省略穿透 None 交 overlay 决策，终结硬 worktree 回退 626MB checkout）。
2. **runtime/ 模板回灌（N-4' 收口）**：热修补丁入 series 后，manifest 62 条与注入态重对账，热修触碰的 manifest 件从新注入态镜像（33 件漂移清零或逐件定谳）。
3. **宿主部署收口（N-1 落地）**：`deploy --apply`（62 overlay＋121 触碰面收口，26 件旧态 .bak 后覆盖——热修内容已由补丁承载故覆盖安全）＋清 11:44 事故 .bak 残留＋网关重启（kill gateway PID，external-supervisor/launchd 自动补位）＋活体验证（gateway 起活/日志无 ImportError）。
4. **N-3 清理**：`~/.hermes/host-sim-v0232` 与 `/tmp/host-sim-v0232-final` 验证残留目录清理。
5. **推送 main**：v0.23.2 批（df3c049cb 及前置）＋本批合并后一并推送（属主 fc051ed28 同车——挂账语境用户令覆盖「不代推」保留意见）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 热修回灌走「宿主提交导出为补丁」而非重写 | 7 提交基底=v0.23.2（reanchor 已完成），diff 直接可 apply；主题边界宿主侧已切好；重写=重复劳动＋引入漂移 |
| D2 | 每提交一枚补丁（7 枚） | 一号一主题惯例；单主题可独立退役（机制预算纪律）；合并大补丁会放大退役粒度 |
| D3 | runtime 模板回灌在补丁入 series 之后 | 镜像正源=含热修补丁的注入态；先补丁后镜像才不丢热修 |
| D4 | 部署前热修承载验证=补丁重放全绿 | 26 件触碰面覆盖的安全前提=热修全部有补丁承载（否则覆盖即丢）；794-800 applied 即安全前提成立 |
| D5 | 网关重启走 kill+supervisor 自愈 | v0227 批配方（external-supervisor 自动补位实证）；不手动起进程 |
| D6 | 推送包含属主 fc051ed28 | 用户令「完成挂账」覆盖；双活 push 后实测远端 ref 不信 up-to-date 提示（记忆配方） |

## 验证

- [x] worktree 净基线 clean+inject 全量 **496/496 applied 零失败**（102 既有 agent＋794/798/799/800 热修＋studio/zcode 面；run3 终判 complete）。
- [x] 吸收甄别：7 枚逐一非空 + 行查缺失（795/796/797 零缺失退役；794 增 24/798 增 115/799 增 96/800 增 23）；保留 4 枚链上 apply-check 过；799/800 因宿主基底≠链内基底（741 等已注入）以 A/B 差分重生成（**+++ 病径防复发：拼装头统一相对路径**）。
- [x] runtime manifest 62 条终对账 **56 同/0 差/6 独有**（7 件镜像：kanban_db/kanban_tools/schemas 热修件＋cron/dispatch/toolsets 基线滞后件；py_compile 过）。
- [x] 拼合树 pytest **155/0**（含 798 新测试 test_invalid_provider_fallback 4 例）。
- [x] deploy --apply --force 终态 **complete：186 全同/0 差异/0 触碰收口**（首跑 7 件保留差异定谳=模板新 vs 宿主旧——run31 复盘批二的 version/verification CAS 读面等未部署面，覆盖安全）；宿主 .bak 残留 **253→0**（git clean 限定 pathspec）。
- [x] 网关重启后活体：kill→supervisor 自愈新进程起活、`Gateway Starting→control socket listening`（21:26:20）、**重启后窗口零 ImportError/Traceback**（11:44 事故形态排查过）。
- [ ] main 推送后远端 ref 复验。（随批收口执行）

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（dated 条目补记热修回灌批）；`docs/superpowers/specs/2026-11-17-vendor-upgrade-agent-v0232.md`（挂账段 N-1/N-3/N-4' 状态随批更新引用本 spec）。数字总账与设计索引无需动（版本号不变仅补丁面扩、gen-doc-indexes 已随批重生成）。

## 挂账（不处置清单）

| # | 项 | 处置建议 |
|---|---|---|
| H-1 | 宿主 7 提交的 git 历史与仓内补丁双源并存（宿主 git 树保留其提交历史，仓内以 patches 为正身） | 宿主树下次重置基线时可 checkout v0.23.2+重放 inject 替代 git 历史；不强制本轮做 |
