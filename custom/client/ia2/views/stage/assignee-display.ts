// overlay/custom/client/ia2/views/stage/assignee-display.ts
// 日常面板负责人显示名单一事实源：看板 assignee 存的是账号 localpart
// （如 sim_pm_product_manager_a_aipay），对人类员工展示团队注册表里的
// 称谓（如 产品经理A）；注册表无匹配时如实回落原始值——宁可保留机读名
// 也不猜测称呼。四个⑤验收日常面板共用，避免各自维护映射。
import { computed } from 'vue'
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'

/** @user:domain → localpart（去 @ 前缀与 homeserver 域，两侧归一到同一形态再比对） */
export function accountLocalpart(userId: string): string {
  return userId.replace(/^@/, '').split(':')[0] ?? userId
}

export type AssigneeLabel = (assignee: string | null | undefined) => string

export function useAssigneeLabel(): AssigneeLabel {
  const registry = useTeamRegistryStore()
  const nameOf = computed(() => {
    const map = new Map<string, string>()
    for (const account of registry.accounts ?? []) {
      const localpart = accountLocalpart(String(account.userId ?? ''))
      const name = String(account.displayName ?? '').trim()
      if (localpart && name && localpart !== name) map.set(localpart, name)
    }
    return map
  })
  return (assignee) => {
    const raw = (assignee ?? '').trim()
    if (!raw) return '未指派'
    return nameOf.value.get(raw) ?? raw
  }
}
