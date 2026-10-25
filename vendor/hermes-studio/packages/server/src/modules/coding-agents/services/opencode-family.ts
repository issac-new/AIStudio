// overlay[mimo-agent]: opencode 家族（OpenCode 与其 fork MiMo-Code）的单一事实源。
// MiMo-Code（npm @mimo-ai/cli，bin `mimo`）与 OpenCode 共享同一 CLI 契约：
// `run --format json` NDJSON 事件流 + 同族 config schema（mcp/provider/instructions）。
// 家族差异只有品牌文件名与环境变量名，全部收敛在此，services/index.ts 与
// runtime/run-manager.ts 共同引用（二者存在导入方向约束，不能互相 import）。
export const OPENCODE_FAMILY_IDS = ['opencode', 'mimo'] as const
export type OpenCodeFamilyId = (typeof OPENCODE_FAMILY_IDS)[number]

export interface OpenCodeFamilyVars {
  /** 品牌主配置文件名（OpenCode: opencode.json / MiMo: mimocode.json） */
  configFileName: string
  /** 原生数据库文件名 */
  databaseFile: string
  /** 配置目录环境变量 */
  configDirEnv: string
  /** 数据库路径环境变量 */
  databaseEnv: string
  /** 运行时增量配置环境变量（进程启动时最后加载） */
  runtimeConfigEnv: string
  /** 凭据注入环境变量（config 里以 {env:VAR} 引用） */
  apiKeyEnv: string
  /** config $schema URL */
  schemaUrl: string
  /** UI/错误信息品牌名 */
  brandName: string
  /** run 子命令参数：MiMo fork 已移除 --auto */
  runSupportsAutoFlag: boolean
}

export const OPENCODE_FAMILY_VARS: Record<OpenCodeFamilyId, OpenCodeFamilyVars> = {
  opencode: {
    configFileName: 'opencode.json',
    databaseFile: 'opencode.db',
    configDirEnv: 'OPENCODE_CONFIG_DIR',
    databaseEnv: 'OPENCODE_DB',
    runtimeConfigEnv: 'OPENCODE_CONFIG_CONTENT',
    apiKeyEnv: 'HERMES_OPENCODE_API_KEY',
    schemaUrl: 'https://opencode.ai/config.json',
    brandName: 'OpenCode',
    runSupportsAutoFlag: true,
  },
  // 2026-09-25 实测核验（mimo 0.1.15 @ ~/.mimocode/bin/mimo，opencode fork）：
  // MIMOCODE_CONFIG_DIR / MIMOCODE_CONFIG_CONTENT / MIMOCODE_DB / mimocode.json(c) /
  // {env:VAR} 占位均被 CLI 识别（mimo models、mimo debug config、MIMOCODE_DB 落点、
  // 用户真实 ~/.config/mimocode/mimocode.jsonc（$schema 同本 URL）互为佐证）。
  mimo: {
    configFileName: 'mimocode.json',
    databaseFile: 'mimocode.db',
    configDirEnv: 'MIMOCODE_CONFIG_DIR',
    databaseEnv: 'MIMOCODE_DB',
    runtimeConfigEnv: 'MIMOCODE_CONFIG_CONTENT',
    apiKeyEnv: 'HERMES_MIMO_API_KEY',
    schemaUrl: 'https://mimo.xiaomi.com/mimocode/config.json',
    brandName: 'MiMo Code',
    runSupportsAutoFlag: false,
  },
}

export function isOpenCodeFamily(id: string): id is OpenCodeFamilyId {
  return (OPENCODE_FAMILY_IDS as readonly string[]).includes(id)
}
