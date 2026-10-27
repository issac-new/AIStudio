# swarm-yuan 两分支收口合入 + 九段残余对账 + 隔离区清理（2026-10-27）

分支：`feat/swarm-yuan-closeout`（基于 main `e4c5fbd12`）。
用户三项裁决：合入（swarm-yuan core/integration 两分支）、补（九段 v2 残余 5 提交）、同意（隔离区与口令遗留处置）。

## 变更

1. **swarm-yuan 合入（本批唯一代码改动，全部在 `skills/swarm-yuan/`）**。
   两分支与 main 为重写后无共同祖先的旧血统，逐笔 cherry-pick 会把布局分叉搅成混合态
   （首笔即 5 文件冲突且语义为「两边各自搬家」）。改用文件级三路合并：
   基底=`refactor/swarm-yuan-integration` 树（main 09:31 前吸收动作的等价态），
   我方=main，彼方=`refactor/swarm-yuan-core` 尖端（10:50 挂账清偿收官，含
   WRITABLE_DIRS 多层可见性、安装 staging 化+SHA256 校验、迎检台账脱敏、
   生成器子命令模块化、registry 计数锁等 main 未吸收的尾批）。
   - 73 文件直接取 core（main 未改或 main 缺席的新文件）；
   - 7 文件保 main（core 落后区：SKILL.md、design-evolution.md、spec-first 族、
     test-doc-numbers 等）；
   - 16 文件三路 merge-file：8 个自动收敛；8 个手工裁决——trace-log 取 main
     （spf_conf_val 单源化修过真实缺陷）、template-spec 取 main（四阶段立法为最新）、
     test-r128 取 main（豁免值随 main 版 _fg_emit_workflow）、facts/domains/index/
     compendium 以终态树机械重算（registry-render --facts 再生成、FACT_SCRIPT_LOC
     实测 9355、登记表并集）。
2. **九段 v2 残余对账：零补并**。5 提交逐项核验全部以演进形态在 main：
   授权投影五文件 diff=0；G3/G5 判据 main 哨兵 6>4；sim-launch 已迁 simcenter（v2
   旧位作废）；reqgate-ac3 判据逐字移植为治理服务 `lifecycle-requirements.test.ts`；
   v2 的 695-identity-chat-acl 补丁＝main 补丁 700（series 注释自带撞号让位说明）。
   分支 `fix/core-coding-chain-v2` 内容已全覆盖，随批 bundle 存档后删除。
3. **隔离区清理**：三个孤儿目录（走查欠账×2、stray 含 PROJECT_DIR 畸形目录残骸）
   先 tar 存档 `archive/quarantine-backup-20261027.tar.gz`（NVMe）后删除。
   `~/.hermes-web-ui/admin-login.json`（b447 会话误重置口令的唯一凭证）保留在位；
   8647 未占用 hermes-web-ui.db（lsof 实测），维持该会话结论。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 文件级三路合并（integration 为基底），不用逐笔 cherry-pick | 布局分叉下逐笔重放会把两边演进搅成第三种形态；三路把冲突收敛到真分叉 16 文件 | 逐笔 cherry-pick（否决：首笔 5 冲突已证伪）；整树取 core（否决：丢 main 立法与 DESIGN_SYNC 机制） | 是 |
| D2 | 计数与登记以终态树机械重算为准（registry-render/self-check） | facts 双段对账断言要求值等；人工猜数必错 | 沿用任一侧旧值（否决：两侧计数都过时） | 是 |
| D3 | 九段残余零补并，分支直接删 | 五提交内容全部演进在位，无文件可补 | 强行 cherry-pick（否决：会复活已退役模块 sim-launch） | 是 |
| D4 | 两 swarm-yuan 分支与 worktree 合入验证后删除，bundle 先存档 | 内容并入 main 后分支失效；bundle 保证 90 天外可回滚 | 长期保留分支（否决：与「无用分支」裁决相悖） | 是 |
| D5 | 技能版本维持 v2.95.0，不加版本号 | 收口合并不引入新能力面，CHANGELOG 无新行；避免连坐 RELEASE-MANIFEST/总账版本基线 | 升 v2.96.0（否决：无新能力，纯收口） | 是 |

## 验证

- 技能自检三件套：`registry-render.sh --facts` 再生成后手写段/生成段对账一致
  （FACT_UNIVERSAL_FILES=104、FACT_CONF_VARS=199、FACT_SCRIPT_LOC=9355 实测）。
- 合并抓出并修复一处真缺陷：core 版 `make-offline-bundle.sh` 无 CHANGELOG 版本兜底块
  （core 血统 tag `swarm-yuan-v2.95.0` 可达、describe 直接出 v 前缀；重写后 main 摸不到
  tag 落 `--always` SHA，`.bundle-version` 写出裸 SHA 致 test-r133 态2b/态4 败）。
  修法=回植 main 侧 R133 兜底块（CHANGELOG 首版本行派生 `v<N>-g<sha>`），
  单测复跑 `test-r133-offline-complete` 全部通过（v2.95.0-ge4c5fbd12 实证）。
- `tests/run.sh` 全量终态：**131 通过 / 0 失败**（131 项含 core 尾批新增锁测试：
  activation-contract/gate-result-contract/growth-transactions/secure-fs/
  effective-conf/framework-lifecycle/integrity-guard 等）。
- 仓级：docs-ssot-guard 6/6、release:check 随批复跑；全量 npm test 合入后跑。

## 设计文档影响

- DESIGN_SYNC: none
  - 理由：本批为技能内部收口，技能版本持平 v2.95.0（CHANGELOG 无新行），
    整合正本与数字总账引用的版本基线、稳定参数均无变化；总账 D 节明确
    动态计数（脚本行数/测试数）不进设计正文。
