// overlay/custom/client/ide/utils/modelInvalid.ts
// 会话模型失效判定（M1.6，对标 zcode modelSelection.invalidated）：
// scoped 会话带具体 model；模型目录已加载却查不到该 model → 失效。
// 抽纯函数便于守门测试（目录未加载/无模型/空目录一律不误报）。

export interface ModelGroupLike {
  provider?: string
  models: string[]
}

export interface SessionLike {
  model?: string | null
}

export function isSessionModelInvalid(
  session: SessionLike | null | undefined,
  modelGroups: ModelGroupLike[] | null | undefined,
): boolean {
  const model = session?.model
  if (!model) return false
  const groups = modelGroups || []
  if (!groups.length) return false
  return !groups.some(group => group.models?.includes(model))
}
