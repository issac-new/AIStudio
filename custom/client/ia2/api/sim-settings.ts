// overlay/custom/client/ia2/api/sim-settings.ts
// 推演设置数据面（B8 工单，设计正本 E28 四区——姿态缺省/观察窗节奏/清偿门
// 策略/审批升级超时）。消费 simcenter 设置读写对（GET/PUT /api/hermes/sim/
// settings）；缺省镜像自服务端常量，客户端只做展示与回传，校验正身在服务端。
import { authFetch } from '../../ide/utils/auth-fetch'

export interface SimSettings {
  posture_default?: 'strict' | 'standard' | 'demo'
  observation_window_seconds?: number
  clearance_policy?: 'block' | 'warn'
  approval_escalate_minutes?: number
}

export interface SimSettingsResponse {
  values: Required<SimSettings>
  defaults?: Required<SimSettings>
}

export const SETTING_FIELDS: ReadonlyArray<{
  key: keyof SimSettings
  label: string
  hint: string
  kind: 'posture' | 'policy' | 'number'
}> = [
  { key: 'posture_default', label: '姿态缺省', hint: '开轮未声明时按此档（strict=零代偿；standard=代偿落台账；demo=演示标注）', kind: 'posture' },
  { key: 'observation_window_seconds', label: '观察窗节奏（秒）', hint: '监督观察窗间隔，30-3600 整数秒', kind: 'number' },
  { key: 'clearance_policy', label: '清偿门策略', hint: 'block=未清拒开新轮（机械执法缺省）；warn=警告放行（须明示设置）', kind: 'policy' },
  { key: 'approval_escalate_minutes', label: '审批升级超时（分钟）', hint: '待审批超时升级提醒，5-1440 整数分钟', kind: 'number' },
] as const

export async function fetchSimSettings(): Promise<SimSettingsResponse> {
  const res = await authFetch('/api/hermes/sim/settings')
  if (!res.ok) throw new Error(`/api/hermes/sim/settings → ${res.status}`)
  return res.json() as Promise<SimSettingsResponse>
}

export async function putSimSettings(patch: SimSettings): Promise<SimSettingsResponse> {
  const res = await authFetch('/api/hermes/sim/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`PUT /api/hermes/sim/settings → ${res.status}${res.status === 400 ? `（${(await res.text()).slice(0, 160)}）` : ''}`)
  return res.json() as Promise<SimSettingsResponse>
}
