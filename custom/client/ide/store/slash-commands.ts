// overlay/custom/client/ide/store/slash-commands.ts
// B7 自定义斜杠命令的客户端单一事实源（模块级响应式，非 pinia——ChatInput
// 补丁经模块 import 消费，避开 store 激活时序问题）。
// 数据源：GET /api/ide/slash-commands；写：POST /api/ide/slash-commands/save。
// 消费面：① IdeSlashCommandsPane 管理 UI；② ChatInput slash 菜单（patch 500 注入，
// 选中把 prompt 模板写入输入框——见 patches/500-client-chatinput-custom-slash.patch）。
import { reactive, readonly } from 'vue'
import { authFetch } from '../utils/auth-fetch'

export interface SlashCommandEntry {
  name: string
  description: string
  prompt: string
}

const state = reactive<{ commands: SlashCommandEntry[]; loaded: boolean }>({ commands: [], loaded: false })

/** 幂等载入（首次调用拉取，之后直接命中内存；force 重拉用于保存后/手动刷新）。 */
export async function loadSlashCommands(force = false): Promise<SlashCommandEntry[]> {
  if (state.loaded && !force) return state.commands
  try {
    const res = await authFetch('/api/ide/slash-commands')
    if (!res.ok) return state.commands
    const body = (await res.json()) as { ok?: boolean; commands?: SlashCommandEntry[] }
    state.commands = Array.isArray(body.commands) ? body.commands : []
    state.loaded = true
  } catch { /* 不可达保持现状（旧数据不清空） */ }
  return state.commands
}

export async function saveSlashCommands(commands: SlashCommandEntry[]): Promise<{ ok: boolean; problems?: string[] }> {
  const res = await authFetch('/api/ide/slash-commands/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; problems?: string[] }
  if (!res.ok) return { ok: false, problems: body.problems ?? [`HTTP ${res.status}`] }
  state.commands = commands.map((c) => ({ ...c }))
  return { ok: true }
}

/** ChatInput slash 菜单消费面（只读快照）。 */
export function slashCommandsSnapshot(): readonly SlashCommandEntry[] {
  return readonly(state.commands)
}

/** 测试/复位用。 */
export function __resetSlashCommandsForTest(): void {
  state.commands = []
  state.loaded = false
}
