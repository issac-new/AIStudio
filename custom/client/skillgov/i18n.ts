// overlay/custom/client/skillgov/i18n.ts
// 技能安全扫描词条（eval 同款模块内小事实源；键前缀 skillgov.*）。
export const skillgovMessages = {
  zh: {
    skillgov: {
      navLabel: '技能安全',
      navTitle: '技能安全扫描（Skill 三段治理 · 第一段）',
      tagline: '注册扫描 → 执行拦截 → 输出审核；S0 静态规则零判定费',
      scanNow: '立即扫描',
      scanNowHint: '扫描 hermes 全部装载面（~/.hermes/skills+各 profile+共享目录）',
      rescanning: '扫描中…',
      latest: '最近扫描',
      never: '尚无扫描记录',
      summary: { scanned: '已扫描技能', safe: '干净', caution: '注意', dangerous: '危险' },
      table: { name: '技能', verdict: '判定', findings: '发现', dir: '位置' },
      verdictNames: { safe: '干净', caution: '注意', dangerous: '危险' },
      findingsOf: '发现明细',
      empty: '装载面没有技能目录',
      roots: '自定义根（可选，冒号分隔绝对路径）',
      rootsPh: '留空=默认装载面',
      enforceHint: '执行拦截与警示横幅由 SKILLGOV_ENFORCE=1 开启（服务端 env）；扫描面恒开',
      error: '操作失败',
    },
  },
  en: {
    skillgov: {
      navLabel: 'Skill Security',
      navTitle: 'Skill Security Scan (three-stage governance · stage 1)',
      tagline: 'Registration scan → execution interception → output review; S0 static rules, zero judge cost',
      scanNow: 'Scan now',
      scanNowHint: 'Scans all hermes skill roots (~/.hermes/skills + profiles + shared)',
      rescanning: 'Scanning…',
      latest: 'Latest scan',
      never: 'No scan yet',
      summary: { scanned: 'Skills scanned', safe: 'safe', caution: 'caution', dangerous: 'dangerous' },
      table: { name: 'Skill', verdict: 'Verdict', findings: 'Findings', dir: 'Location' },
      verdictNames: { safe: 'safe', caution: 'caution', dangerous: 'dangerous' },
      findingsOf: 'Findings',
      empty: 'No skill directories in load roots',
      roots: 'Custom roots (optional, colon-separated absolute paths)',
      rootsPh: 'empty = default load roots',
      enforceHint: 'Interception & banners require SKILLGOV_ENFORCE=1 (server env); the scan surface is always on',
      error: 'Action failed',
    },
  },
}

export type SkillgovMessages = typeof skillgovMessages.zh
