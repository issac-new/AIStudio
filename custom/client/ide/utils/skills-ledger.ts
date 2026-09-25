// overlay：技能清单数据面（zcode §七 #3 P0-3 待排期项，cc/kimi 技能入口语义吸收）。
//
// 语义（cc "skills=commands 合并口径"+成本列 / kimi 技能互操作）：工作台技能入口
// 清单——技能与命令**同一张清单**（合并口径：slash 命令与技能不再两张皮），每行
// 带来源目录（.claude/.codex/.agents 四品牌互操作）+ 启用态 + 成本提示（token 预算）。
// 数据源=hermes skills_list/skill_view（能力面）；本模块=清单投影（纯函数）。
export type SkillSource = 'builtin' | 'global' | 'project' | 'interop'

export interface SkillEntry {
  name: string
  /** 合并口径：true=技能 / false=slash 命令（同表展示）。 */
  isSkill: boolean
  source: SkillSource
  enabled: boolean
  /** 成本提示（token 预算；未知=null 不显示——dsh 三原则同源）。 */
  tokenCost: number | null
  description: string
}

export interface SkillEvent {
  name: string
  kind: 'skill' | 'command'
  source?: string
  enabled?: boolean
  tokenCost?: number
  description?: string
}

const SOURCE_MAP: Record<string, SkillSource> = {
  builtin: 'builtin',
  user: 'global',
  project: 'project',
  '.claude': 'interop',
  '.codex': 'interop',
  '.agents': 'interop',
  '.opencode': 'interop',
}

/** 事件流→合并清单（名字典序；技能与命令同表）。 */
export function buildSkillsLedger(events: readonly SkillEvent[]): SkillEntry[] {
  return events.map((e) => ({
    name: e.name,
    isSkill: e.kind === 'skill',
    source: SOURCE_MAP[e.source ?? 'project'] ?? 'project',
    enabled: e.enabled ?? true,
    tokenCost: typeof e.tokenCost === 'number' && e.tokenCost > 0 ? e.tokenCost : null,
    description: (e.description ?? '').slice(0, 120),
  })).sort((a, b) => a.name.localeCompare(b.name))
}

/** 清单汇总（合并口径计数）。 */
export function skillsSummary(ledger: readonly SkillEntry[]): { skills: number; commands: number; interop: number; enabled: number } {
  return {
    skills: ledger.filter((e) => e.isSkill).length,
    commands: ledger.filter((e) => !e.isSkill).length,
    interop: ledger.filter((e) => e.source === 'interop').length,
    enabled: ledger.filter((e) => e.enabled).length,
  }
}
