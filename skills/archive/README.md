# Skill 归档区（2026-09-07 收敛执行）

## 结构
- `single-fix/` — 单点修复型 skill（已被通用机制覆盖，按 catalog 处置）
- `merged/` — 同义合并中被归档方（主 skill 保留在 devops/ 等原分类）
- `merged/cc-switch-consolidation-20260907/` — cc-switch 家族 12→5 合并的归档部分

## 恢复方式
```bash
mv ~/.hermes/skills/archive/<分区>/<skill-name> ~/.hermes/skills/devops/
```

## 治理依据
见 `~/.hermes/profiles/_shared/06-observability/skill-catalog.md` §三（待归档/待合并清单）

## 合并主 skill 映射
- cc-switch-failover-ops ← (provider-troubleshooting, ccswitch-failover-queue-management)
- cc-switch-monitoring ← (proxy-monitoring, widget, throughput-benchmarks)
- cc-switch-stats-analysis ← (usage-analytics)
- ccswitch-native-responses-schema ← (ccswitch-role-model-routing)
- hermes-tui-customization ← (tui-status-bar-merge, tui-source-edit-build-verify)
- hermes-moa-configuration ← (moa-mixture-of-agents-setup；moa-bigmodel-401-fix 在 single-fix)
- hindsight-model-configuration ← (hindsight-backend-model-config)
- hindsight-fleet-operations ← (cluster-audit, fleet-audit, fleet-cleanup)
- hermes-skill-installation ← (bulk-install, skills-update-protection)
- [已移除]-observation-archiving ← ([已移除])
- wechat-article-research ← (wechat-batch-discovery)
