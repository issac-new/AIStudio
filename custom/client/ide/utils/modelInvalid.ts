// overlay/custom/client/ide/utils/modelInvalid.ts
// 会话模型失效判定（M1.6，对标 zcode modelSelection.invalidated）：
// scoped 会话带具体 model；模型目录已加载却查不到该 model → 失效。
// 抽纯函数便于守门测试（目录未加载/无模型/空目录一律不误报）。
// 2026-10-03 走查 L12：global coding agent 会话豁免——其模型由 hermes CLI
// 侧解析（~/.hermes/config.yaml default 可为 CLI 别名如 aim），web 模型目录
// 无此别名属常态，误判失效会横幅阻断新会话发送。

export interface ModelGroupLike {
  provider?: string
  models: string[]
}

export interface SessionLike {
  model?: string | null
  codingAgentMode?: string | null
}

export function isSessionModelInvalid(
  session: SessionLike | null | undefined,
  modelGroups: ModelGroupLike[] | null | undefined,
): boolean {
  if (session?.codingAgentMode === 'global') return false
  const model = session?.model
  if (!model) return false
  const groups = modelGroups || []
  if (!groups.length) return false
  return !groups.some(group => group.models?.includes(model))
}
