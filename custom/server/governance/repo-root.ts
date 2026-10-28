// overlay/governance-repo-root（2026-10-19 产品欠账清偿）：
// 治理注册表/审计统一从 GOVERNANCE_REPO 取仓根；未配置时回落 OBS_SIM_ROOT
// （SIM studio 已注入）下的 central/aipaydev，最后回落到检出根下的本地基建 governance/
// （嵌套 git，与 scripts/serve-server.mjs 的 GOVERNANCE_REPO 缺省同源）。
// 单一事实源：governance-controller / governance-audit 共用，禁各自写死。
// 2026-10-28 清偿：末级不再硬编码 /Volumes/nvme2230 外机路径——该卷在多数机器不存在，
// 写死等于把「源缺席」伪装成看似有效的绝对路径。缺省值缺席时由调用方 fail-soft
// （existsSync 为假或 git -C 失败），不猜数。
import { resolve } from 'node:path'

export function governanceRepoRoot(): string {
  const explicit = (process.env.GOVERNANCE_REPO || '').trim()
  if (explicit) return explicit
  const simRoot = (process.env.OBS_SIM_ROOT || process.env.AIPAY_SIM_ROOT || '').trim()
  if (simRoot) return `${simRoot.replace(/\/+$/, '')}/central/aipaydev`
  return resolve(process.cwd(), 'governance')
}
