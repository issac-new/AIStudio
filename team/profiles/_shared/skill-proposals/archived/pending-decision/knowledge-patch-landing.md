# SkillProposal: knowledge-patch-landing [create]

## 评审意见（skill-mining cron 评审通道 · 2026-10-19（第 2 轮 02:2x，评审通道））

**判定：批准（新增 create）**——证据链 5/5 逐条回读 task_comments 实证通过；本轮扫描窗口内又新增 2 张同构正例（t_227687da/t_e2e17e88，swarm 板：patch 前备份+纯增零删 diff+grep 终验，且评审侧独立复跑 receipts），有效频度升至 6/147，门槛扎实。

理由：
1. **正交性已核实**：document-evidence-closeout 全文 grep「备份/bak-」=0，管「证据分层与措辞边界」不管「收口五件套命令形态」；fusion-landing-audit 限融合裁决场景。本提案提炼的是跨域收口微协议，填充真空。
2. **反例即最强证据**：t_336584e9（verify-receipt 虚假完成潜伏 3 天）证明缺代码层终验时「文档层真」可掩盖「代码层假」——陷阱节此案例必须原样保留落地。
3. 落地条件（给 curator）：①五件套保持 copy-paste 命令形态（与 document-evidence-closeout 的差异化正在于此，抽象化会退化成后者）；②负向 grep 与「原节仍在位」grep 两腿缺一不可；③若裁合并而非新建，落点选 document-evidence-closeout 增「五件套」节，优于 fusion-landing-audit 泛化（后者是融合域专用，泛化会稀释其裁决审计定位）。


> **产出**： platform-skill-miner cron · 2026-10-19 · 7 天窗口（2026-10-12 ~ 10-19，142 张 done 卡，10 板）
> **状态**： ✅ 已评审（批准）· 待图爸终裁
> markings: [TLP:GREEN]

### SkillProposal: knowledge-patch-landing [create]

**触发条件**: 对 SKILL.md、共享宪章（`_shared/*.md`、`~/.hermes/shared/*.yaml`）、SOUL 节段等知识层资产做 patch 或新建收口时——任何「改完要说清改了什么、怎么机械证明改对了」的知识落地场景。

**证据链**（4 正例 + 1 反例，全在 platform 板）:
- task_id=t_aba8e771, board=platform, snippet="patch 前备份 SKILL.md.bak-20261012（8102 字节，与 1.2.0 原文一致）；grep -c SoL-Pi = 7；版本 1.2.0→1.3.0"——harness-fusion-patterns 新增两节后备份+grep 终验+版本递增三件全做
- task_id=t_c964d578, board=platform, snippet="纯增校验：diff 备份 现文件 | grep -c '^<' = 1（唯一删行是版本号 1.6.0 被 1.7.0 替换），增行 17"——含备份 ls 实测 29723 字节、grep 三件套计数
- task_id=t_533acc67, board=platform, snippet="备份 cost-governance.md.bak-20261012（4962 字节，patch 前落盘）；验证结果（grep 终验，全部通过）"——共享宪章 patch 同协议
- task_id=t_eb12b4a8, board=platform, snippet="新增 ~46 行，备份 sources.py.bak-t_eb12b4a8；真实回执 5/5 逐字校验 rc=0，伪造回执整份拒收 rc=1"——代码层落地同协议（正反双向验证）
- **反例** task_id=t_336584e9, board=platform: 完成自述「sources.py 新增 verify-receipt 子命令」，t_eb12b4a8 复查 argparse `invalid choice` 实锤不存在——文档层 patch 真实通过 grep，代码层声明虚假；靠 t_4993a7fc 抽查卡 + t_eb12b4a8 磁盘整数才暴露（隔 3 天）

**频率**: 4 / 142（反例不计入频率，计入陷阱证据）；评审轮追加 2 正例：t_227687da/t_e2e17e88（swarm 板 2026-10-19 完成，备份+纯增零删+grep 终验+评审独立复跑），升至 6/147

**四段式内容**:
1. 触发条件 → 知识资产 patch/新建收口（skill 正文、共享宪章、SOUL 节段、随附脚本）
2. 标准步骤 →
   1. patch 前备份：`cp <file> <file>.bak-$(date +%Y%m%d[-taskid])`，`ls -l` 确认字节数与改前一致
   2. 版本号递增：frontmatter version，内容新增 +0.1.0，结构性重写 +1.0
   3. 纯增校验：`diff <bak> <file> | grep -c '^<'` 应 = 1（仅版本号行被替换）；>1 须逐行解释删失理由
   4. grep 终验：新增关键节逐个 `grep -c` 计数比对预期；原有关键节 grep 确认未破坏；至少 1 条负向 grep（防细节复制他处成双源）
   5. 证据落盘：执行 comment 附备份路径+字节数+各 grep 计数**实测值**；禁只写「验证通过」
3. 陷阱 →
   - 文档层真 ≠ 代码层真：SKILL.md 描述的子命令/脚本必须单独 `--help`/argparse/grep 磁盘核验（t_336584e9 反例）
   - 备份不核字节数 = 假备份；备份 mtime 晚于 complete 时间线可疑（同步/回滚痕迹，t_336584e9 的 .bak 即无法复现）
   - grep 只数自己新写的关键词会自证成功——负向 grep 与「原节仍在位」grep 是防自欺的两条腿
4. 验证 → 收口 comment 五要素齐全：备份路径+字节实测、版本号前后值、diff 删失行数+解释、≥2 个 grep 计数实测值、（含代码时）CLI 正反运行 rc 值；复核者可逐项重跑

**与既有 skill 关系**: `fusion-landing-audit`（融合裁决落地审计：原子粒度对账/判定禁连带/插入锚点纪律）只覆盖融合裁决场景；`document-evidence-closeout` 覆盖文档+运行时证据收口但无五件套命令形态。本提案提炼的是跨域共用收口微协议。**备选形态**：并入 fusion-landing-audit 泛化为「知识落地收口」章（合一>散落原则），create 与 patch 二选一交 curator/图爸裁决。

**预期收益**: 本窗 4 卡各自重新推导同一协议（每卡 comment 重复写备份+校验步骤）；标准化后知识 patch 收口变机械清单。反例证明缺代码层终验时虚假完成可存活到下次真实使用才暴露——五件套把暴露时点从「使用时」提前到「收口时」。
