# R142 运行时基线聚焦刷新轮（2026-10-25）

> 触发：用户指令——vendor 升级轮（studio v0.7.39 + agent v0.22.5）联动核验技能侧 22 行上游组件与 research 记档（「skill 的 research 和上游组件也要更新」）。本轮为聚焦刷新（查新+基线更新+最小吸收+记档），不含 R141 型实栈回归与发版；宿主克隆面 8 仓已于同晨随 vendor 轮同步（5 仓升级、5 仓零移动、routa 分叉待裁决）。

## 一、移动面（22 行多通道查新，2026-10-25 实测）

| 运行时 | R141 基线 | 远端最新 | 判定 |
|---|---|---|---|
| ruflo | 3.61.1 | **3.62.0**（10 提交） | **移动·minor**（swarm 合成派发结果必须披露/running-worker 取消置终态/headless cancel 三件套：动作落定+计时器回收+escalation 锚 exit/daemon 显式参数压过持久化 state/ai-team 证据全量审计+诚实版本 0.3.4/x-gateway 无参 tools/call 与 bare-host POST+拒绝诊断 0.9.1/ruRE CUDA 静态占用规划 ADR-500/501——纯静态分析延续「只解析不执行」；上游仓更名 ruvnet/claude-flow→ruvnet/ruflo） |
| gstack | v1.87.5.0 tip 6f7488a70 | **v1.91.188 tip 1e3ee83c4**（三提交） | **移动（tip）**（pii.cc 跳过紧凑 YYYYMMDDHHMMSS 时间戳——防 autoplan 审批导入被误脱敏失败/pregate 解析无扩展名 .jsx/.mts/.cts 与 index.jsx/tsx/mjs import/无人值守契约+gate 应答语法+session-kind 覆盖+语音触发词文档对齐；**git tag 通道为空，版本号以仓内 package.json 为准**；src-pins gstack SHA 同步；并修正基线列版本前缀滞后——R141 时 tip 已 v1.91.x 而列仍 v1.87.5.0） |

零移动 20 行：graphify（pypi 0.9.95，GitHub v1.0.0 异源线维持不取）/GitNexus 1.6.12（license-risk 不追）/claude-mem 15.0.2/ocr 1.13.3/openspec 1.15.0/comet 0.5.0/gsd-core 1.18.0/codex-security npm-v0.6.0/mattpocock v1.3.1/diagram-design（main 0b9b10cab 持平）/superpowers 7.0.1/ECC 2.2.3（src-pins 两项随同持平）/impeccable cli-v4.7.0/dsh（tag 仍 dsh-v0.2.1-rc.3，master tip 前进见克隆面）/pua 3.5.1/semantica tip 22109ee0 持平/pi 1.4.0/codegraph 未接线/claude-code 2.1.310（main +2 未发版）/codex-cli 0.164.0（0.165.0-alpha.1 预告线维持）。

本轮主题观察：**合成物与实测物的披露边界**（ruflo synthetic dispatch disclose——虚假成功族从「不报错」进化到「冒充实测」的对外形态）+ **脱敏过度即缺陷**（gstack pii.cc 吞时间戳断审批导入——中性 token 不入脱敏面）+ **显式值压过持久化记录**（daemon 参数、锁活性看进程两案同族：活的事实优先于记录的事实）。

## 二、吸收（最小增量，两项落 references）

| 档 | 落点 | 一句话主题 |
|---|---|---|
| subagent-orchestration「合成结果披露与取消终态（ruflo v3.62.0）」节 | 合成结果披露（结果从哪来是结果的一部分）/取消终态性（半取消态=双跑温床）/取消三件套（动作落定+资源回收+escalation 锚 exit）/显式参数压过持久化 state |
| review-methodology「v1.91.186-188 增量」节 | 脱敏白名单边界（中性 token 不入脱敏面，过度脱敏静默破坏管道）/门禁解析面覆盖不全=漏检通道/无人值守场景文档即契约面 |

同构不吸收（要点）：ruRE CUDA 占用规划细节（无 CUDA 分析场景，静态边界理念已由 3.61 节承载）/ruflo x-gateway 网关细节（产品面）/gstack voice triggers（无语音面）。

## 三、宿主克隆面（research/ 仓，2026-10-25 晨同步）

升级 5 仓：**dsh-TUI v0.16.1→v0.17.0**（10-24 18:11 发布，R141 后真移动）；dsh-context main +73→5742e67（10-25 01:44，dna 挂载性能）；minimax-code 缓存自 9-23 v0.5.1-27 快进至 da22f11（v0.6.5+5 线，对齐 R141 已观察态）；multica 缓存自 9-24 v0.5.2-4 快进至 3de79cbea（+253，0.7.0 workflow GA 线，对齐 R141 已观察态）；deepseek-harness 缓存 rc.3→master tip 22ddee3792（tag 是 master 祖先，取 tip）。

零移动 5 仓：kimi-code（main 7ccac2b45 持平，npm 2.3.1）/fibo（master==master_2026Q3，无 Q4 tag，qgate FIBO 索引无需重同步）/claude-code（v2.1.310=最新 tag，main +2 未发版）/element-web（v1.12.32=最新 tag）/zcode（main 3c5b2276 持平——**同步口径改为依上游 main 变更判移动、不看版本 tag，2026-10-25 用户裁定**）。

## 四、异常记档（2026-10-25 用户裁决「待裁决都需要同步上游」后已两清）

| 项 | 事实 | 处置（终态） |
|---|---|---|
| routa | 仓内双线并存：本地 `main` 分支=上游跟踪分支（落后 4）；HEAD 钉本地 tag v0.19.0=4083 提交本地分叉线（2026-06-22）。初判「本地 main 领先 4083」系把 detached HEAD 的分叉线误当 main | **已同步**（用户裁决）：`main` 快进至 origin/main tip `9dc7b7be`（docs(api) workspaceId 契约 #595），HEAD 随迁至 main；分叉线以本地 tag v0.19.0 保留可达、零丢失。教训：detached HEAD 与分支线的领先数要分开核 |
| codex 缓存「来路不明本地提交」 | **误报更正**：6aaac69480「## New Features」（celia@openai.com）即上游 rust-v0.164.0 发版提交本身——本地与远端 tag 对象一致（fe3b2945），剥壳后正指向该提交；领先 origin/main 1 提交是发版分支先于 main 合并的正常时序 | **零动作**——缓存本就精确钉在上游稳定 tag；初判只对了「非 main 祖先」没核作者与 tag 落点，误报入册以为鉴 |

## 五、验证与本轮修复的整合债

- **整合债修复：registry-render.sh stale 路径**（D11 挂账族）：`upstream_baseline_write/check` 与 `cmd_dead_facts` 三处按 `$ROOT/docs/`（=AIStudio 仓根）定位文件，实际正本在技能子树 `skills/swarm-yuan/docs/`（v2.95.0 入树后渲染器在树内从未跑通过）——修为 `$BASE/docs/` 定位；修复后 `--write-upstream-baseline`/`--check` 首次在树内全链通过。同款 stale 路径：`build-compendium.sh` 的 `ROOT/docs`（挂账下轮，本轮不扩面）。
- `registry-render.sh --write-upstream-baseline` 重渲状态表块 → `--check` **注册表一致性通过**（含状态表↔runtimes.tsv 逐行一致/面积 5555B≤40KB/无逐轮历史头注）。
- references 两文件增量后同步 `assets/registry/dist.tsv` 字节锚（subagent-orchestration 65010→66572、review-methodology 59046→60429）+ `--facts` 重生成。
- `self-check.sh --check-only` 无 ✗ 无 drift warn；2 条 ⚠（FACT 死配置 15 键/make-offline-bundle.sh:87 旧 docs 注释引用）经对照主检出均为存量 advisory，非本轮引入。
- runtimes.tsv 2 行更新（ruflo v3.62.0 / gstack v1.91.188 tip 1e3ee83c4）+ src-pins.conf gstack SHA 同步；零移动 20 行未动。
