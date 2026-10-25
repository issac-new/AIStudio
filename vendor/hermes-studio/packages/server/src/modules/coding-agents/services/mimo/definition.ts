// overlay[mimo-agent]: MiMo Code coding agent definition —— opencode 家族 fork
// （npm @mimo-ai/cli，bin `mimo`），家族差异单一事实源见 services/opencode-family.ts。
import type { CodingAgentConfigFileTemplate } from '../../contracts/definition'
import { OPENCODE_FAMILY_VARS } from '../opencode-family'

export const MIMO_DEFINITION = {
  id: 'mimo',
  name: 'MiMo Code',
  provider: 'Xiaomi MiMo',
  command: 'mimo',
  packageName: '@mimo-ai/cli',
} as const

export const MIMO_CONFIG_FILES: CodingAgentConfigFileTemplate[] = [
  { key: 'settings', path: `~/.config/mimocode/${OPENCODE_FAMILY_VARS.mimo.configFileName}`, scopedPath: OPENCODE_FAMILY_VARS.mimo.configFileName, language: 'json' },
  { key: 'memory', path: '~/.config/mimocode/AGENTS.md', scopedPath: 'AGENTS.md', language: 'markdown' },
  { key: 'mcp', path: `~/.config/mimocode/${OPENCODE_FAMILY_VARS.mimo.configFileName}`, scopedPath: OPENCODE_FAMILY_VARS.mimo.configFileName, language: 'json' },
  { key: 'config', path: `~/.config/mimocode/${OPENCODE_FAMILY_VARS.mimo.configFileName}`, scopedPath: OPENCODE_FAMILY_VARS.mimo.configFileName, language: 'json' },
  { key: 'agents', path: '~/.config/mimocode/AGENTS.md', scopedPath: 'AGENTS.md', language: 'markdown' },
]
