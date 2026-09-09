---
name: domain-nightly-ops
description: Use when 域夜间调研报告缺失/补跑/微信投递失败时：产物三态判定→串行补跑→补投队列，勿整卡重跑。
version: 1.0.0
metadata:
  hermes:
    tags: [ops, cron, nightly, weixin, delivery]
---

# domain-nightly-ops — 域夜间深度调研管线运维

管辖区：`life-workbench/scripts/domain_nightly.sh <domain>`×N 域（hack/[已移除]/pay/[已移除]/aiteam/data/ops/platform/product），各自 cron no_agent 独立调度，无 supervisor。产物落 `reports/domain_<domain>_<date>.{pdf,md}`，日志 `cache/radar/domain_<domain>.log`。

## 产物三态判定（动手前必做）

盘 `reports/` 目录 + 各域 log 尾部，把缺口分成三类，处置完全不同：

1. **已生成已投递** → 不动。
2. **已生成未投递** → 只补投，绝不重跑（重跑白烧抓取+LLM，产物还会覆盖）。
3. **未生成** → 补跑生成（见下）。

投递判定看 log 里 `email rc=0`：报告脚本双通道内嵌（weixin + 邮件），weixin 失败不阻塞邮件步——邮件已 rc=0 = 报告已到达用户，缺口只剩微信补投。

## 补跑铁律：串行 + 间隔

- 调度器积压补射会同秒并发 exec 同一脚本多实例，全部 `Interrupted system call`（exit 126）秒死且零产物。人工补跑同理：多域必须串行 + 域间 `sleep 30`，绝不并行触发。
- 根治：给 `domain_nightly.sh` 入口加 flock 自串行（`exec 9><lockfile; flock 9`），把任何来源的挤发变成排队。
- 补跑跑后台 + 定期 tail 落账脚本日志；每域成功判据 = rc=0 + PDF 落盘。

## 微信账号级限流处置

- 上游 iLink 类限流**跨网关重启持续**，本地 30s 冷却只是表层。短周期重试循环每次尝试都续期冷却，等于自己把限流焊死——先杀本机所有 `hermes send` 重试循环，再单发探测；探测失败就停手等窗口。
- 补投统一走 `~/.hermes/scripts/weixin_backlog_deliver.py`（2026-09-07 重建为持久版，此前的临时版被清=scratch 吞证据重演）：
  - `enqueue <pdf> [caption]`：job 内入队（幂等去重，file-missing 拒绝）；
  - `tick [--max N]`：cron 每 20min 消费（`weixin_backlog_tick.sh` 包装），36s 间隔、失败退避停手不烧冷却、failed 隔 tick 重试、sent/missing 归档 history；
  - `status`：查队列。
- **cron `--script` 传参坑**：`--script "x.py tick --max 3"` 整串被当文件路径找不到（"Script not found"）。带参数的调用必须包一层 .sh wrapper（`weixin_backlog_tick.sh`），cron script 只写文件名。edit 后若连续失败 2 次会自动 paused，修完要 `cron resume`。
- 全部投递点已改入队（2026-09-07）：domain_nightly.sh / [已移除].sh / nightly_radar.sh / nightly_radar_supervisor.sh / nightly_radar.py（PDF enqueue；文字摘要仍直投）。新加投递点一律 enqueue，禁止直投 `hermes send -t weixin`。
- `hermes send` 只收单个消息位置参数；附件用 `MEDIA:<绝对路径>` 内联在消息文本里，不要拆成第二个参数。
- 邮件通道（your@example.com）不受限流影响，微信限流期用户仍能收到全部报告——补投不紧急，等 tick 自然消化。

## 与主库 runbook 的关系

主雷达管线（nightly_radar + supervisor + 幂等铁律）见 default 主库 `nightly-radar-runbook`；本 skill 管域级管线与补投，两边的串行/限流规则同源。