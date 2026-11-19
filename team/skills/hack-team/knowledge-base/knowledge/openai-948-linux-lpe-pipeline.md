# 情报：OpenAI 948 Linux LPE 单次运行——规模化猎洞成本模型与"错误 0-day 致胜"归因教训

- 标签: openai-948-lpe, kernel-lpe, exploit-pipeline, wrong-bug-wins
- 概括: 五阶段流水线单次运行 $1.21M 出 948 个 LPE（$1,279/个）；200 个"成功"里 20 个走的是别的 0-day
- 类型: fact
- 日期: 2026-11-08

## 完整打法

（gap-20261031-001 / t_6aedc2f6；判定 TRACK——方法论面已有承载，真增量=Gate 5 因果归因）

- 事件（observed，OpenAI 官方一手 "A thousand fewer paths to root"，2026-11-04）：
  未发布 cyber 模型驱动的自主漏洞性发现-利用-补丁流水线，2026-10 中旬单次运行：
  5,034 审计目标（280 万行，占内核 7%，Scout $3,426）→ 2,308 去重候选
  （Analyst 12h，$316,549）→ 1,724 动态复现（30h，74.7%，KASAN VM 内 triage，
  $73,330）→ 313 泄漏候选 + 1,238 LPE 候选（初筛 $44,194）→ 291 泄漏 PoC +
  1,169 LPE exploit（ExploitDev $775,929，SMEP/SMAP/KASLR/HARDENED_USERCOPY 全开）
  → 变体分析归并 = **948 独立补丁 = 948 unique LPE**。总成本 $1,213,430，
  **$1,279/LPE**；成功 exploit 平均 $359，失败尝试平均 $3,922（69 例）。
- 阶段成本模型（一手实测数字，可复用于预算论证）：
  发现 $316.5K → 验证 $73.3K → 初筛 $44.2K → 利用 $775.9K。
  **验证真假阳性成本相近 → 越早去假阳性越省**（OpenAI 原文明示）。
  失败利用远贵于成功 → 定"一小时无进展即放弃"止损线可显著降本。
- **归因失败教训（本卡钉死的核心增量）**：早期运行 200 个"成功"LPE 中
  **20 个（10%）实际经由非指派的另一个 0-day 拿到 root**——判定标记只看
  "root shell 达成"，不看路径。OpenAI 补救：收紧任务约束 + 加独立归因检查
  确认每个 exploit 用的是指派漏洞。Takeaway 原文："verify the path to a result
  in addition to verifying the result itself"。已固化为 fp-check 阶段 4
  因果归因要求 + Gate 5 通过标准（终态达成但因果证据缺位 = BLOCKED）。
- 有效性对照（集群已有承载，判定 TRACK 的依据）：
  - 五阶段 ≈ audit-orchestration 四阶段 + verify_finding.py 执行级复跑 +
    fp-check 六门 + pentest-methodology-fusion §4 三态协议；
  - KASAN VM 动态验证 ≈ 独立验证模块（VERIFIED 才入报告）；
  - "3.1% 错误分析"印证审计侧人工确认数据流可达的纪律有效；
  - 全量骨架复刻 = gap-20261031-002（open，四层架构漏洞挖掘 Agent，不重复建设）。
- 10 项新利用技术：2 持久弹性对象（内核 cache 喷射）+ 2 页面 grooming +
  5 data-only 提权 + 1 任意类型混淆（技术细节未公开，仅存类别）。
- 修复面时点（10 天扫描结束时）：61 已上游修复 + 43 staging + 299 公开讨论中。
- 防御推论（OpenAI 原文）：对资源充足的攻击者，"未打补丁的低权限账号 ≈ root"；
  纵深防御用 Firecracker/gVisor 类隔离限损；随模型代际复扫同一代码库。
- 检测基线含义（红队转防御）：本机沙箱逃逸面监控应对齐内核 LPE 利用常见
  信号（commit_creds/prepare_kernel_cred 调用链、modprobe_path 覆写、
  nsescape 系列），hack-agent 越权到 host root 的路径已在 agentic-soc-defense
  六道防线第 4 层覆盖。
- 一手源锚点：https://openai.com/index/a-thousand-fewer-paths-to-root/
  （全文快照 cache/web/openai.com-86d5c720b5.md，2,308/1,724/1,169/948
  漏斗数字与 $1,279/$359/$3,922 单价、20/200 归因段均在正文中段）。
