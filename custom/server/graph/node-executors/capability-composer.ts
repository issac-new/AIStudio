// capability-composer.ts —— 能力声明否定式合成器（方案2 M3 核心，2026-10-09）
//
// 设计锚 specs/2026-10-09-agent-capability-boundaries.md：边界条款=「任务要求的能力 ∩
// profile 未授权维度」的显式禁止——角色退化为四维组合快捷方式，新角色/新 agent 零代码。
// 数据承载=治理注册表 agent-capabilities（markdown 表，保存即 git 提交=天然变更审计）。

/** 四维能力声明（分布式 agent 上线时随 profile/注册表声明） */
export interface AgentCapabilities {
  role_template?: string
  'deliverable-kinds'?: string[]      // doc | code | test-report | verdict | report
  'vcs-scope'?: 'own-branch-only' | 'main-docs-only' | 'none' | 'director'
  'domain-scope'?: string[]           // 归属域；缺省=未声明（按无授权处理，宁紧勿松）
  'integration-authority'?: 'none' | 'own-domain' | 'director'
}

/** 任务侧要求（由节点 kind/产物形状推导） */
export interface RequiredCapabilities {
  kinds: string[]                      // 本任务要产出的类型
  vcs: 'own-branch' | 'main-docs' | 'none'
  domain?: string                      // 任务归属域
  integration?: boolean                // 是否含集成动作
}

const GENERIC_FLOOR = '仅做你名下任务书明确要求的事；不代做他人任务。'

/** 由任务形状推导要求（与 deriveBoundaryRole 的形状推导同口径） */
export function requirementsFrom(cfg: { output?: string; branchHint?: string }, kind: 'task' | 'review' | 'test'): RequiredCapabilities {
  const target = String(cfg.output ?? cfg.branchHint ?? '')
  if (kind === 'review') return { kinds: ['verdict'], vcs: 'none' }
  if (kind === 'test') return { kinds: ['test-report'], vcs: 'none' }
  if (target.startsWith('feat/')) return { kinds: ['code'], vcs: 'own-branch', domain: target.split('/')[1]?.split('-').slice(1).join('-') || undefined }
  if (target.startsWith('docs/') || target.endsWith('.md')) return { kinds: ['doc'], vcs: 'main-docs' }
  return { kinds: [], vcs: 'none' }
}

/**
 * 否定式合成：对每个"任务要求但 profile 未授权"的维度生成显式禁止条款；
 * 未声明任何能力的 profile 不合成（返回 null，调用方走角色模板链——宁紧勿松：
 * 角色模板本身即最小边界，不因声明缺失而放松）。
 */
export function composeBoundary(req: RequiredCapabilities, profile: AgentCapabilities | undefined): string | null {
  if (!profile || !profile['deliverable-kinds'] || profile['deliverable-kinds'].length === 0) return null
  const clauses: string[] = []
  const kinds = new Set(profile['deliverable-kinds'] ?? [])
  const missing = req.kinds.filter((k) => !kinds.has(k))
  if (missing.length > 0) {
    clauses.push(`本任务要求产出 ${missing.join('/')}，但你未声明该类交付权限——相关部分须转交有权限者，不得自行代做`)
  }
  const vcs = profile['vcs-scope'] ?? 'none'
  if (req.vcs === 'own-branch' && vcs === 'none') clauses.push('不得做任何 git 提交/推送')
  if (req.vcs === 'own-branch' && vcs === 'main-docs-only') clauses.push('仅可推送文档类改动到指定分支，不得提交代码')
  if (req.vcs === 'main-docs' && vcs === 'none') clauses.push('不得推送任何内容到共享主干')
  if (req.domain && profile['domain-scope'] && profile['domain-scope'].length > 0
      && !profile['domain-scope'].includes(req.domain) && !profile['domain-scope'].includes('*')) {
    clauses.push(`本任务属「${req.domain}」域，不在你声明的域范围内——不得实施，须转交域内负责人`)
  }
  if (req.integration && (profile['integration-authority'] ?? 'none') === 'none') {
    clauses.push('无集成权限：不得做任何合并 origin/main 或跨分支集成操作')
  }
  if (clauses.length === 0) return null  // 全维度授权→无额外禁止（角色模板地板仍会注入）
  return `${GENERIC_FLOOR}${clauses.map((c) => `；${c}`).join('')}。`
}

/**
 * 解析 agent-capabilities 注册表 markdown 表（列：assignee | role_template |
 * deliverable-kinds | vcs-scope | domain-scope | integration-authority；
 * deliverable-kinds/domain-scope 用逗号分隔，* 表通配）。表缺失/格式漂移→空表（宁紧勿松）。
 */
export function parseCapabilitiesTable(markdown: string): Record<string, AgentCapabilities> {
  const out: Record<string, AgentCapabilities> = {}
  const lines = (markdown ?? '').split('\n')
  let header: string[] | null = null
  for (const line of lines) {
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    if (cells.length >= 2 && cells[0] && !line.includes('---')) {
      if (!header) { header = cells.map((c) => c.toLowerCase()); continue }
      const row: Record<string, string> = {}
      header.forEach((h, i) => { row[h] = cells[i] ?? '' })
      if (!row['assignee']) continue
      out[row['assignee']] = {
        role_template: row['role_template'] || undefined,
        'deliverable-kinds': row['deliverable-kinds'] ? row['deliverable-kinds'].split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        'vcs-scope': (row['vcs-scope'] || undefined) as AgentCapabilities['vcs-scope'],
        'domain-scope': row['domain-scope'] ? row['domain-scope'].split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        'integration-authority': (row['integration-authority'] || undefined) as AgentCapabilities['integration-authority'],
      }
    }
  }
  return out
}

/** 注册表初始文档（首次登记用；保存即 git 提交=变更审计） */
export function capabilitiesRegistrySeed(): string {
  return [
    '# Agent 能力声明注册表（agent-capabilities）',
    '',
    '> 四维声明：deliverable-kinds(doc,code,test-report,verdict,report) / vcs-scope(own-branch-only,main-docs-only,none,director) / domain-scope(逗号分隔,* 通配) / integration-authority(none,own-domain,director)。分布式 agent 上线即声明；声明缺失走 generic 最小边界（宁紧勿松）。',
    '',
    '| assignee | role_template | deliverable-kinds | vcs-scope | domain-scope | integration-authority |',
    '|---|---|---|---|---|---|',
    '| chen | dev | code,test-report | own-branch-only | csw-pay-core | none |',
    '| hu | dev | code,test-report | own-branch-only | csw-channel-wechat | none |',
    '| lin | dev | code,test-report | own-branch-only | csw-channel-alipay | none |',
    '| xiao | dev | code,test-report | own-branch-only | csw-cashier-mp | none |',
    '| qi | tester | test-report | none | * | none |',
    '| fei | tester | test-report | none | * | none |',
    '| fanfan | governance | doc,report,verdict | main-docs-only | * | none |',
    '| arch | reviewer | verdict | none | * | none |',
    '| audit | governance | report | none | * | none |',
    '',
  ].join('\n')
}
