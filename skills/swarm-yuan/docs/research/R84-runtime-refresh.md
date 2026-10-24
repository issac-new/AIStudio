# R84 运行时刷新档（2026-10-02，例行轮）

## 结论

**3 移动（2 物化 + 1 npm 记档）+ 16 零移动/记档**（19 行台账全覆盖，口径同 R73-R81：只认稳定 tag，rc/alpha/canary 不物化，main tip 漂移单列记档不计为版本移动）。

移动三件：**ruflo v3.49.0 → v3.51.0**（跨两 minor，ADR-406 任务管控大版本）、**ECC v2.2.2 → v2.2.3**（patch，纯命名退休零方法论）、**claude-code npm 2.1.286 → 2.1.287**（1 patch 位，安全闸回归修复领衔）。

**吸收两条主注记**（过决策 46 两问，落点见「吸收判据」节）：任务态持久观测（ruflo ADR-406 mission contract+durable storage+headless views）与测试断言自述（ruflo "e2e checks say what they check"）→ `references/review-methodology.md` R84 段；claude-code 2.1.287 三条（安全闸回归锁/恢复路径幂等/有界重试与钩子自激）→ `references/claude-code-capabilities.md` 2.1.287 注记。

**轮次编号注**：开工时并行会话的 `fix/r83-full-regression` worktree 仅占位零提交；本轮收口前其已以 **R83/v2.46.0**（Angular 21+vitest+pnpm 全量回归，sweep 55/0）合入 origin/main——按 R75/R80/R82 撞号先例（第五、六次）顺延，本轮 R84/**v2.47.0**；CHANGELOG 双条目并存互不吞并。

**codex-security npm 通道第五轮记档**：registry 现显 `0.1.31`（R74 见 0.1.31 停更、R81 见 0.0.2 占位、本轮又回 0.1.31——registry 态反复），git tag `npm-v0.1.32` 在仓且为最高，基线维持 git tag 口径（registry 态不可信）。

## 台账（19 行，R84 态）

| 仓库 | R81/R82 基线 | R84 物化 | 移动 | 备注 |
|------|---------|---------|------|------|
| ruflo | v3.49.0 | **v3.51.0** | 2 minor（3.50+3.51） | ADR-406 mission contract/持久存储/console 统一 /ruflo 命令；main +84 记档 |
| ECC | v2.2.2 | **v2.2.3** | patch | 纯命名退休（Everything Claude Code→ECC only）零方法论；main +3 记档 |
| claude-code | 2.1.286(npm) | **2.1.287(npm)** | 1 patch 位 | npm latest 2026-10-02 实测；安全闸回归/恢复幂等/有界重试 |
| codex | rust-v0.159.3 | rust-v0.159.3 | 0 | 0.162.0-alpha.5/6/7 不物化；main +249 记档（R81 时 +187） |
| graphify | v1.0.0 | v1.0.0 | 0 | v0.9.73 为 0.9 维护线 tag 非升级；v8 线 +1079 记档 |
| openspec | 1.14.0 | 1.14.0 | 0 | npm latest 同值 |
| dsh | main tip | main tip | 0 | origin/master 零漂移（rc.2 tag 不物化） |
| ocr (open-code-review) | v1.12.11 | v1.12.11 | 0 | 零漂移 |
| codex-security | npm-v0.1.32 | npm-v0.1.32 | 0 | registry 占位态第五轮记档；main +36 记档 |
| claude-mem | v13.28.0 | v13.28.0 | 0 | main +233 无 tag |
| superpowers | v6.4.2 | v6.4.2 | 0 | 零漂移 |
| gsd-core | v1.15.0 | v1.15.0 | 0 | origin/next +100 无 tag |
| better-harness | v0.6.6 | v0.6.6 | 0 | v0.7.0-alpha1/2 不物化；main +203 |
| comet | 0.4.3 | 0.4.3 | 0 | master +2 无 tag |
| semantica | v0.7.0 | v0.7.0 | 0 | main +76 无 tag |
| gitnexus | v1.6.12 | v1.6.12 | 0 | v1.6.13-rc.63 不物化；main +92 |
| pua | v3.5.1 | v3.5.1 | 0 | 零漂移 |
| gstack | main tip 96764e8 | main tip | 0 | main +2 微漂移记档（R81 零漂移） |
| harnesseval-w | ed4ccc6 | ed4ccc6 | 0 | 与 origin/main 齐平 |

fetch 执行面：18 克隆 `git fetch --tags --prune origin` 全部 exit 0（2026-10-02 并发实测）；claude-code 经 npm registry 判定（2.1.287）；harness-practice 为纯链接存根无版本（R37 先例）。

## 移动明细

### ruflo v3.49.0 → v3.51.0（跨两 minor，ADR-406 主线）

`references/review-methodology.md` 增 R84 段。要点（锚 `git -C research/ruflo log v3.49.0..v3.51.0`，~30 提交显形）：

- **3.50**：ADR-406 M0 mission contract 与 durable storage（任务契约+落盘）+ M1 mission observation via CLI and MCP（双通道观测）+ mods 生态（init 默认开启/init upgrade --mods/uninstall what ruflo installed/--source local）+ console 雏形（one /ruflo command、auto-start、diagrams）。
- **3.51**：console 成熟（keep every command、headless views、dump waits at most 8 s for its probes、claims view picks the newest open task first、e2e checks say what they check）+ witness manifests 再生签名。
- 方法论吸收两条（持久观测/断言自述）见吸收判据节；mods「装了什么卸什么」与 openspec 卸载还原族（R81 已吸收）同向不再重复立条。

### ECC v2.2.2 → v2.2.3（patch，零方法论记档）

`git -C research/ECC log v2.2.2..v2.2.3` 仅 2 提交：c05b2d6 退役 "Everything Claude Code" 全称改 ECC-only（pi/core 命名面）+ 0348d7b release 工序（更长 npm publish 检查）。无方法层增量，纯记档。

### claude-code npm 2.1.286 → 2.1.287（1 patch 位）

注记落 `references/claude-code-capabilities.md`（锚 anthropics/claude-code CHANGELOG v2.1.287）：

- **安全闸回归锁**：危险 `rm` 失 always-ask 保护被修复——防护语义会被演化静默卸除，闸须随负例回归锁。
- **恢复路径幂等**：恢复会话后 CLAUDE.md 重复附加被修复——前情注入=幂等重放。
- **有界重试与钩子自激抑制**（一行）：Remote Control 重连 30s 上限、asyncRewake 反复唤醒修复。
- 产品面卷不吸收：Claude Mods/`n:` 过滤/OTel prompt_text（遥测加正文=隐私面反向警示）/alwaysLoad:false 懒物化/自托管 gh api 等。

## 吸收判据（决策 46 两问逐条）

| 吸收条 | ① swarm-yuan 哪个环节缺 | ② 消费方与真实触达证据 |
|---|---|---|
| 任务态持久观测（ruflo ADR-406） | 审查/复盘判据缺「控制态须进程外持久+观测面 headless 可达」显式条 | review-methodology 由 task-methodology-router §方法论分派表按评审/复盘类任务注入；R74/R79/R81 段先例正文实在 |
| 测试断言自述（ruflo 3.51） | 测试真实性判据族（R79 三连）缺「断言文案自述行为」第四面 | 同上；审查生成物测试面为生成流程 ④/⑦ 步固定触达 |
| claude-code 2.1.287 三条 | FACT_COMPAT_DEEP 对照面缺安全闸回归锁/恢复幂等/有界重试新档 | claude-code-capabilities.md 为 capability-map 登记行目标档（R79/R81 同款先例） |

## 执行面记档

- 物化两件 checkout 实测：ruflo/ECC `git describe` 均达新 tag（2026-10-02）；claude-code 无本地克隆沿 npm 口径（R81 先例）。
- 本轮发版号 v2.47.0（R83 撞号顺延）。facts.conf FACT_ARTIFACT_BYTES_BUDGET 第十七次登记 503808→507904（+4KiB 沿决策 38 形态）：sweep 实测 references 拷贝 505858B 超 2050B（术语修正后终测 505903B ≤ 507904B），全为本轮吸收注记增量，非内容膨胀。
- 轮次撞号：`fix/r83-full-regression` worktree（并行会话占位零提交）在案，R84 顺延不改其占位。
