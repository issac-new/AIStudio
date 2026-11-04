// overlay/custom/client/ia2/utils/userenv.ts
// profile 环境变量编辑面的纯函数（N01）：敏感判定/掩码/编辑态矩阵/保存载荷构造。
// 与服务端 custom/server/userenv/env-store.ts 同规则（敏感正则、掩码字面量），
// 视图与测试同源（照 run-options.ts 惯例）。服务端是判定事实源，此处镜像仅供
// 前端即时反馈；最终裁决（409/422）仍以服务端为准。
export interface EnvRow {
  key: string
  /** 当前列值：非敏感=明文；敏感=掩码串（未改动时原样回传=服务端保持现值） */
  value: string
  sensitive: boolean
  /** 敏感行专用：true=已打开草稿输入框（非敏感行直接就地编辑 value） */
  edited: boolean
  draft: string
}

export interface EnvEntryDto {
  key: string
  valueMasked: string
  valueLength: number
  sensitive: boolean
}

export interface ProfileEnvDto {
  ok: boolean
  profile: string
  entries: EnvEntryDto[]
  missing?: boolean
}

export interface PutEnvResultDto {
  ok: boolean
  error?: string
  problems?: string[]
  profile: string
  written: boolean
  changedKeys?: string[]
  backup?: string
  restartHint?: boolean
  entries: EnvEntryDto[]
}

/** 敏感键判定（与服务端 SENSITIVE_KEY_RE 同源；子串命中即敏感，宁滥勿漏） */
export function isSensitiveEnvKey(key: string): boolean {
  return /KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL/i.test(key)
}

/** 敏感值掩码（与服务端 maskEnvValue 同源） */
export function maskEnvValue(value: string): string {
  return `***len=${value.length}***`
}

export type EnvEditState = 'plain' | 'sensitive-intact' | 'sensitive-editing'

/**
 * 编辑态矩阵（展示与语义同源）：
 *   plain            非敏感——明文就地可编辑
 *   sensitive-intact 敏感未动——只显示掩码＋「修改」入口
 *   sensitive-editing敏感已打开草稿框——草稿非空才算实质变更（空草稿=保持现值，
 *                    防误清空；要清空先删该行）
 */
export function editStateOf(row: Pick<EnvRow, 'sensitive' | 'edited'>): EnvEditState {
  if (!row.sensitive) return 'plain'
  return row.edited ? 'sensitive-editing' : 'sensitive-intact'
}

/** 敏感行是否有实质新草稿（非空）——保存须勾「我确认修改敏感值」的判据 */
export function hasSensitiveDraft(row: Pick<EnvRow, 'sensitive' | 'edited' | 'draft'>): boolean {
  return row.sensitive && row.edited && row.draft !== ''
}

/** 是否存在需确认位的行 */
export function needsSensitiveConfirm(rows: readonly EnvRow[]): boolean {
  return rows.some(hasSensitiveDraft)
}

/**
 * 整表保存载荷：有实质草稿的行用草稿；其余原样回传（敏感行掩码串=服务端解析为
 * 保持现值，不会把掩码当真值写入）。键名去首尾空白。
 */
export function buildPutEntries(rows: readonly EnvRow[]): Array<{ key: string; value: string }> {
  return rows.map((r) => ({
    key: r.key.trim(),
    value: hasSensitiveDraft(r) ? r.draft : r.value,
  }))
}
