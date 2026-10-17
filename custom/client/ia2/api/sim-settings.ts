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
  { key: 'posture_default', label: '运行模式缺省', hint: '启动运行未声明时按此档（strict=零代偿；standard=代偿落台账；demo=演示标注）', kind: 'posture' },
  { key: 'observation_window_seconds', label: '观察窗节奏（秒）', hint: '监督观察窗间隔，30-3600 整数秒', kind: 'number' },
  { key: 'clearance_policy', label: '遗留项清算策略', hint: 'block=未清拒绝启动新运行（默认）；warn=警告放行（须明示设置）。三类决策对照：常规决定在护栏内自动执行、不确定性高的由人主导、后果重大的必须人掌握——遗留项清算与启动运行恒属后两类', kind: 'policy' },
  { key: 'approval_escalate_minutes', label: '审批升级超时（分钟）', hint: '待审批超时升级提醒，5-1440 整数分钟。设短=判断事项更快回到人手里（分析已按 AI 速度跑，判断仍按人的速度——超时升级是把瓶颈交还给决策者，不是催人快批）', kind: 'number' },
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
