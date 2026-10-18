// overlay/governance-repo-root（2026-10-19 产品欠账清偿）：
// 治理注册表/审计统一从 GOVERNANCE_REPO 取仓根；未配置时回落 OBS_SIM_ROOT
// （SIM studio 已注入）下的 central/aipaydev，最后才回落到历史 NVMe 路径。
// 单一事实源：governance-controller / governance-audit 共用，禁各自写死。
export function governanceRepoRoot(): string {
  const explicit = (process.env.GOVERNANCE_REPO || '').trim()
  if (explicit) return explicit
  const simRoot = (process.env.OBS_SIM_ROOT || process.env.AIPAY_SIM_ROOT || '').trim()
  if (simRoot) return `${simRoot.replace(/\/+$/, '')}/central/aipaydev`
  return '/Volumes/nvme2230/lab/ncwk-sim-mux/central/aipaydev'
}
