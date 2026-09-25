// overlay/extmarket 域：扩展市场入口（qoder §三差距表 P2 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（扩展市场：Skills/插件工作台入口）：扩展（skill/plugin）市场浏览+
// 安装态管理——**市场条目**（名/类型/来源/简介）+**安装态**（installed/available/
// update——更新检测）+**入口可见性**（市场入口在工作台可见）。衔接 skills-ledger
// （已装清单）与 mcpcatalog（Store 目录）：本层=市场面纯函数。
export type ExtKind = 'skill' | 'plugin'
export type InstallState = 'installed' | 'available' | 'update'

export interface MarketEntry {
  extId: string
  kind: ExtKind
  name: string
  source: string
  /** 已装版本（null=未装）。 */
  installedVersion: string | null
  /** 市场版本。 */
  marketVersion: string
}

export interface MarketView {
  entries: Array<MarketEntry & { state: InstallState }>
  installed: number
  updatable: number
}

/** 市场视图（安装态判定：有装且版本新=update；有装=installed；余 available）。 */
export function marketView(entries: readonly MarketEntry[]): MarketView {
  const withState = entries.map((e) => ({
    ...e,
    state: (e.installedVersion === null
      ? 'available'
      : e.installedVersion !== e.marketVersion ? 'update' : 'installed') as InstallState,
  }))
  return {
    entries: withState.sort((a, b) => a.name.localeCompare(b.name)),
    installed: withState.filter((e) => e.state !== 'available').length,
    updatable: withState.filter((e) => e.state === 'update').length,
  }
}

/** 入口可见性（qoder 工作台入口：有市场条目才显）。 */
export function marketEntryVisible(entries: readonly MarketEntry[]): boolean {
  return entries.length > 0
}
